import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { ANT, AoARIORead, AoArNSNameDataWithName, ARIO } from '@ar.io/sdk'
import { Repository, Not, IsNull, And, In } from 'typeorm'
import { readFileSync } from 'fs'

import { ArnsRecord } from './schema/arns-record.entity'

@Injectable()
export class ArnsService {
  private readonly logger: Logger = new Logger(ArnsService.name)
  private readonly ario: AoARIORead
  private readonly antTargetBlacklist: string[]
  private readonly antProcessIdBlacklist: string[]
  private readonly arnsCrawlGateway: string

  constructor(
    private readonly config: ConfigService<{
      ANT_TARGET_BLACKLIST_FILE: string
      ANT_PROCESS_ID_BLACKLIST_FILE: string
      ARNS_CRAWL_GATEWAY: string
    }>,
    @InjectRepository(ArnsRecord)
    private arnsRecordsRepository: Repository<ArnsRecord>
  ) {
    this.logger.log('Initializing ARIO for mainnet')
    this.ario = ARIO.mainnet()

    this.arnsCrawlGateway = this.config.get<string>(
      'ARNS_CRAWL_GATEWAY',
      'arweave.net',
      { infer: true }
    )
    this.logger.log(`Using ARNS crawl gateway: ${this.arnsCrawlGateway}`)

    const antTargetBlacklistFilePath = this.config
      .get<string>('ANT_TARGET_BLACKLIST_FILE', '', { infer: true })
    if (antTargetBlacklistFilePath) {
      this.logger.log(
        `Using ANT target blacklist: [${antTargetBlacklistFilePath}]`
      )
      const antTargetBlacklistFile = readFileSync(
        antTargetBlacklistFilePath,
        'utf8'
      )
      this.antTargetBlacklist = antTargetBlacklistFile
        .split('\n')
        .map(item => item.trim())
      this.logger.log(
        `Got [${this.antTargetBlacklist.length}] blacklisted ANT targets`
      )
    } else {
      this.logger.warn('No ANT target blacklist file configured')
    }

    const antProcessIdBlacklistFilePath = this.config
      .get<string>('ANT_PROCESS_ID_BLACKLIST_FILE', '', { infer: true })
    if (antProcessIdBlacklistFilePath) {
      this.logger.log(
        `Using ANT process blacklist: [${antProcessIdBlacklistFilePath}]`
      )
      const antProcessIdBlacklistFile = readFileSync(
        antProcessIdBlacklistFilePath,
        'utf8'
      )
      this.antProcessIdBlacklist = antProcessIdBlacklistFile
        .split('\n')
        .map(item => item.trim())
      this.logger.log(
        `Got [${this.antProcessIdBlacklist.length}] blacklisted ANT process IDs`
      )
    } else {
      this.logger.warn('No ANT process blacklist file configured')
    }
  }

  public async getArNSRecords(cursor?: string, limit: number = 1000) {
    this.logger.log(
      `Fetching ARNS records using cursor [${cursor}] and limit [${limit}]`
    )
    try {
      const records = await this.ario.getArNSRecords({
        limit,
        sortBy: 'startTimestamp',
        sortOrder: 'asc',
        cursor
      })
      this.logger.log(`Fetched [${records.items.length}] ARNS records`)
      return records
    } catch (error) {
      this.logger.error('Failed to fetch ARNS records', error)
      throw error
    }
  }

  public async getAllArNSRecords() {
    this.logger.log('Fetching all ARNS records')

    const allRecords: AoArNSNameDataWithName[] = []
    let cursor: string | undefined = undefined

    do {
      const result = await this.getArNSRecords(cursor)
      allRecords.push(...result.items)
      cursor = result.nextCursor
      if (!result.hasMore) { break }
    } while (cursor)

    return allRecords
  }

  public async getANTRecords(processId: string) {
    try {
      return await ANT.init({ processId }).getRecords()
    } catch (error) {
      this.logger.error(`Failed to fetch ANT records for [${processId}]`, error)
      return null
    }
  }

  public async resolveAntUndernameTarget(
    name: string,
    undername: string = '@',
    retries: number = 3
  ): Promise<string | null> {
    const gateways = ['arweave.net', 'frostor.xyz', 'love4src.com']
    let attempt = 0
    while (attempt < retries) {
      try {
        this.logger.log(
          `Fetching ANT ${undername} record target for [${name}], `
            + `attempt ${attempt + 1}`
        )
        const nameWithUndername = undername === '@'
          ? name
          : `${undername}_${name}`
        const response = await fetch(
          `https://${nameWithUndername}.${gateways[attempt % gateways.length]}`,
          { method: 'HEAD' }
        )
        if (!response.ok) {
          this.logger.error(
            `Failed to fetch ANT ${undername} record target for [${name}]: `
              + `${response.status} ${response.statusText}`
          )
          attempt++
          continue
        }
        const resolvedId = response.headers.get('x-arns-resolved-id')
        if (!resolvedId) {
          this.logger.error(
            `Missing x-arns-resolved-id header for [${name}] `
            + `with undername [${undername}]`
          )
          attempt++
          continue
        }
        return resolvedId
      } catch (error) {
        this.logger.error(
          `Failed to fetch ANT primary record target for `
          + `[${name}], attempt ${attempt + 1}`,
          error
        )
        attempt++
      }
    }
    return null
  }

  public async updateArnsDatabase() {
    const records = await this.getAllArNSRecords()
    this.logger.log(`Updating database for [${records.length}] ARNS records`)

    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      this.logger.log(
        `Processing record [${i+1}/${records.length}] `
          + `with name [${record.name}] & processId [${record.processId}]`
      )

      if (this.antProcessIdBlacklist.includes(record.processId)) {
        this.logger.warn(
          `Skipping ARNS record with blacklisted process ID `
            + `[${record.processId}]`
        )
        continue
      }

      const antRecords = await this.getANTRecords(record.processId)
      if (!antRecords) {
        this.logger.warn(
          `No ANT records found for name [${record.name}] & `
            + `process ID [${record.processId}]`
        )
        continue
      }

      const dbRecords = Object
        .keys(antRecords)
        .map(undername => {
          const antRecord = antRecords[undername]
          return this.arnsRecordsRepository.create({
            name: record.name,
            purchasePrice: record.purchasePrice,
            startTimestamp: record.startTimestamp,
            endTimestamp: record.type === 'lease' ? record.endTimestamp : null,
            type: record.type,
            undernameLimit: record.undernameLimit,
            processId: record.processId,
            undername,
            transactionId: antRecord.transactionId,
            ttlSeconds: antRecord.ttlSeconds,
            description: antRecord.description,
            priority: antRecord.priority,
            owner: antRecord.owner,
            displayName: antRecord.displayName,
            logo: antRecord.logo,
            keywords: antRecord.keywords
          })
        })

      this.logger.log(
        `Upserting [${dbRecords.length}] undername records `
          + `for ARNS name [${record.name}]`
      )
      
      await this.arnsRecordsRepository.upsert(dbRecords, ['name', 'undername'])
    }
  }

  public async generateCrawlDomainsConfigFile() {
    this.logger.log('Generating crawl domains config file from database')

    try {
      const where = {}
      if (this.antTargetBlacklist.length > 0) {
        where['transactionId'] = And(
          Not(IsNull()),
          Not(In(this.antTargetBlacklist))
        )
      } else {
        where['transactionId'] = Not(IsNull())
      }
      if (this.antProcessIdBlacklist.length > 0) {
        where['processId'] = Not(In(this.antProcessIdBlacklist))
      }
      const records = await this.arnsRecordsRepository.find({ where })
      
      this.logger.log(
        `Found [${records.length}] ARNS records with valid primary targets`
      )

      const uniqueUrls = new Set<string>()
      records
        .filter(record => !record.undername.includes(' ') && !record.undername.includes('+'))
        .forEach(record => {
          const subdomain = record.undername === '@'
            ? record.name
            : `${record.undername}_${record.name}`
          const url = `https://${subdomain}.${this.arnsCrawlGateway}`
          uniqueUrls.add(url)
        })

      let crawlConfigDomains = 'domains:\n'
      uniqueUrls.forEach(url => {
        crawlConfigDomains += `  - url: ${url}\n`
      })
      
      this.logger.log(
        `Generated crawl domains config with [${uniqueUrls.size}] unique domains`
      )

      return crawlConfigDomains
    } catch (error) {
      this.logger.error('Failed to generate crawl domains config file', error)
      throw error
    }
  }
}
