import {
  ANT,
  AoARIORead,
  AoArNSNameDataWithName,
  AOProcess,
  ARIO,
  ARIO_MAINNET_PROCESS_ID
} from '@ar.io/sdk'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { connect } from '@permaweb/aoconnect'
import { readFileSync } from 'fs'
import * as _ from 'lodash'
import { Repository, Not, IsNull, And, In } from 'typeorm'

import { AntRecord } from './schema/ant-record.entity'
import { ArnsRecord } from './schema/arns-record.entity'

@Injectable()
export class ArnsService {
  private readonly logger: Logger = new Logger(ArnsService.name)
  private readonly ario: AoARIORead
  private readonly antTargetBlacklist: string[]
  private readonly antProcessIdBlacklist: string[]
  private readonly arnsCrawlGateway: string
  private readonly cuUrl: string

  constructor(
    private readonly config: ConfigService<{
      ANT_TARGET_BLACKLIST_FILE: string
      ANT_PROCESS_ID_BLACKLIST_FILE: string
      ARNS_CRAWL_GATEWAY: string
      CU_URL: string
    }>,
    @InjectRepository(AntRecord)
    private antRecordsRepository: Repository<AntRecord>,
    @InjectRepository(ArnsRecord)
    private arnsRecordsRepository: Repository<ArnsRecord>
  ) {
    this.cuUrl = this.config.get<string>(
      'CU_URL',
      'https://cu.ardrive.io',
      { infer: true }
    )
    this.logger.log(`Using CU URL: ${this.cuUrl}`)

    this.logger.log('Initializing ARIO for mainnet')
    this.ario = ARIO.mainnet({
      process: new AOProcess({
        processId: ARIO_MAINNET_PROCESS_ID,
        ao: connect({
          MODE: 'legacy',
          CU_URL: this.cuUrl
        })
      })
    })

    this.arnsCrawlGateway = this.config.get<string>(
      'ARNS_CRAWL_GATEWAY',
      'arweave.net',
      { infer: true }
    )
    this.logger.log(`Using ArNS crawl gateway: ${this.arnsCrawlGateway}`)

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
      `Fetching ArNS records using cursor [${cursor}] and limit [${limit}]`
    )
    try {
      const records = await this.ario.getArNSRecords({
        limit,
        sortBy: 'startTimestamp',
        sortOrder: 'asc',
        cursor
      })
      this.logger.log(`Fetched [${records.items.length}] ArNS records`)
      return records
    } catch (error) {
      this.logger.error('Failed to fetch ArNS records', error)
      throw error
    }
  }

  public async getAllArNSRecords() {
    this.logger.log('Fetching all ArNS records')

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

  public async updateArNSRecordsIndex() {
    const records = await this.getAllArNSRecords()

    this.logger.log(`Updating database for [${records.length}] ArNS records`)
    const dbRecords: ArnsRecord[] = []
    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      if (this.antProcessIdBlacklist.includes(record.processId)) {
        this.logger.warn(
          `Skipping ArNS record with blacklisted process ID `
            + `[${record.processId}]`
        )
        continue
      }
      dbRecords.push(this.arnsRecordsRepository.create(record))
    }

    this.logger.log(
      `Upserting [${dbRecords.length}] ArNS records into database`
    )
    await this.arnsRecordsRepository.upsert(dbRecords, ['name'])
  }

  public async getANTRecords(processId: string) {
    try {
      return await ANT.init({
        process: new AOProcess({
          processId,
          ao: connect({
            MODE: 'legacy',
            CU_URL: this.cuUrl
          })
        })
      }).getRecords()
    } catch (error) {
      this.logger.error(`Failed to fetch ANT records for [${processId}]`, error)
      return null
    }
  }

  public async getANTState(processId: string) {
    try {
      return await ANT.init({
        process: new AOProcess({
          processId,
          ao: connect({
            MODE: 'legacy',
            CU_URL: this.cuUrl
          })
        })
      }).getState()
    } catch (error) {
      this.logger.error(`Failed to fetch ANT state for [${processId}]`, error)
      return null
    }
  }

  public async updateANTRecordsIndex() {
    const records = await this.arnsRecordsRepository.find({ take: 5 })
    this.logger.log(`Updating ANT records for [${records.length}] ArNS records`)

    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      this.logger.log(
        `Processing record [${i+1}/${records.length}] `
          + `with name [${record.name}] & processId [${record.processId}]`
      )

      if (this.antProcessIdBlacklist.includes(record.processId)) {
        this.logger.warn(
          `Skipping ANT record with blacklisted process ID `
            + `[${record.processId}]`
        )
        continue
      }

      const antState = await this.getANTState(record.processId)
      if (!antState) {
        this.logger.warn(
          `No ANT records found for name [${record.name}] & `
            + `process ID [${record.processId}]`
        )
        continue
      }

      const dbRecords = Object.keys(antState.Records).map(undername => {
        return this.antRecordsRepository.create({
          name: record.name,
          processId: record.processId,
          undername,
          transactionId: antState.Records[undername].transactionId,
          ttlSeconds: antState.Records[undername].ttlSeconds,
          description: antState.Records[undername].description,
          priority: antState.Records[undername].priority,
          owner: antState.Records[undername].owner,
          displayName: antState.Records[undername].displayName,
          logo: antState.Records[undername].logo,
          keywords: antState.Records[undername].keywords,
          controllers: antState.Controllers
        })
      })

      this.logger.log(
        `Upserting [${dbRecords.length}] undername records `
          + `for ArNS name [${record.name}]`
      )

      await this.antRecordsRepository.upsert(dbRecords, ['name', 'undername'])
    }
  }

  public async legacy_resolveAntUndernameTarget(
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

  public async legacy_updateArnsDatabase() {
    const records = await this.getAllArNSRecords()
    this.logger.log(`Updating database for [${records.length}] ArNS records`)

    for (let i = 0; i < records.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000)) // rate limit 1s
      const record = records[i]
      this.logger.log(
        `Processing record [${i+1}/${records.length}] `
          + `with name [${record.name}] & processId [${record.processId}]`
      )

      if (this.antProcessIdBlacklist.includes(record.processId)) {
        this.logger.warn(
          `Skipping ArNS record with blacklisted process ID `
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
          return this.antRecordsRepository.create({
            name: record.name,
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
          + `for ArNS name [${record.name}]`
      )

      await this.antRecordsRepository.upsert(dbRecords, ['name', 'undername'])
    }
  }

  public async legacy_generateCrawlDomainsConfigFile() {
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
      const records = await this.antRecordsRepository.find({ where })

      this.logger.log(
        `Found [${records.length}] ArNS records with valid primary targets`
      )

      let crawlConfigDomains = 'domains:\n'
      _.uniq(
        records
          .filter(
            record => !record.undername.includes(' ') &&
              !record.undername.includes('+') &&
              !record.name.includes(' ') &&
              !record.name.includes('+')
          )
          .map(record => {
            const subdomain = record.undername === '@'
              ? record.name
              : `${record.undername}_${record.name}`
            return `https://${subdomain}.${this.arnsCrawlGateway}`.toLowerCase()
          })
      ).forEach(url => {
        crawlConfigDomains += `  - url: ${url}\n`
      })

      this.logger.log(
        `Generated crawl domains config with [${records.length}] domains`
      )

      return crawlConfigDomains
    } catch (error) {
      this.logger.error('Failed to generate crawl domains config file', error)
      throw error
    }
  }
}
