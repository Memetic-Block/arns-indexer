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
import { Repository, Not, IsNull, And, In, LessThan, DataSource } from 'typeorm'

import { AntRecord } from './schema/ant-record.entity'
import { AntRecordArchive } from './schema/ant-record-archive.entity'
import { ArnsRecord } from './schema/arns-record.entity'
import { ArnsRecordArchive } from './schema/arns-record-archive.entity'

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
    private readonly dataSource: DataSource,
    @InjectRepository(AntRecord)
    private antRecordsRepository: Repository<AntRecord>,
    @InjectRepository(AntRecordArchive)
    private antRecordsArchiveRepository: Repository<AntRecordArchive>,
    @InjectRepository(ArnsRecord)
    private arnsRecordsRepository: Repository<ArnsRecord>,
    @InjectRepository(ArnsRecordArchive)
    private arnsRecordsArchiveRepository: Repository<ArnsRecordArchive>
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
    const records = await this.arnsRecordsRepository.find()
    this.logger.log(`Updating ANT records for [${records.length}] ArNS records`)

    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      this.logger.log(
        `Processing record [${i+1}/${records.length}] `
          + `with name [${record.name}] & processId [${record.processId}]`
      )

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

  public async archiveExpiredRecords(): Promise<{
    arnsArchived: number
    antArchived: number
  }> {
    const now = Date.now()
    this.logger.log(`Starting expired records cleanup at timestamp [${now}]`)

    // Find expired ArNS records (leases with endTimestamp in the past)
    const expiredArnsRecords = await this.arnsRecordsRepository.find({
      where: {
        type: 'lease',
        endTimestamp: LessThan(now)
      }
    })

    if (expiredArnsRecords.length === 0) {
      this.logger.log('No expired ArNS records found')
      return { arnsArchived: 0, antArchived: 0 }
    }

    const expiredNames = expiredArnsRecords.map(r => r.name)
    this.logger.log(
      `Found [${expiredArnsRecords.length}] expired ArNS records: ` +
        `[${expiredNames.slice(0, 10).join(', ')}${expiredNames.length > 10 ? '...' : ''}]`
    )

    // Find associated ANT records
    const expiredAntRecords = await this.antRecordsRepository.find({
      where: { name: In(expiredNames) }
    })

    this.logger.log(
      `Found [${expiredAntRecords.length}] associated ANT records to archive`
    )

    // Perform archive and delete in a single transaction
    const result = await this.dataSource.transaction(async manager => {
      // Archive ANT records first
      if (expiredAntRecords.length > 0) {
        const antArchiveRecords = expiredAntRecords.map(record =>
          manager.create(AntRecordArchive, {
            archiveReason: 'expired',
            originalId: record.id,
            originalCreatedAt: record.createdAt,
            originalUpdatedAt: record.updatedAt,
            name: record.name,
            processId: record.processId,
            undername: record.undername,
            transactionId: record.transactionId,
            ttlSeconds: record.ttlSeconds,
            description: record.description,
            priority: record.priority,
            owner: record.owner,
            displayName: record.displayName,
            logo: record.logo,
            keywords: record.keywords,
            controllers: record.controllers
          })
        )
        await manager.save(AntRecordArchive, antArchiveRecords)
      }

      // Archive ArNS records
      const arnsArchiveRecords = expiredArnsRecords.map(record =>
        manager.create(ArnsRecordArchive, {
          archiveReason: 'expired',
          originalId: record.id,
          originalCreatedAt: record.createdAt,
          originalUpdatedAt: record.updatedAt,
          name: record.name,
          processId: record.processId,
          purchasePrice: record.purchasePrice,
          startTimestamp: record.startTimestamp,
          endTimestamp: record.endTimestamp,
          type: record.type,
          undernameLimit: record.undernameLimit
        })
      )
      await manager.save(ArnsRecordArchive, arnsArchiveRecords)

      // Delete ANT records first (no FK, but logical ordering)
      if (expiredAntRecords.length > 0) {
        await manager.delete(AntRecord, { name: In(expiredNames) })
      }

      // Delete ArNS records
      await manager.delete(ArnsRecord, { name: In(expiredNames) })

      return {
        arnsArchived: expiredArnsRecords.length,
        antArchived: expiredAntRecords.length
      }
    })

    this.logger.log(
      `[alarm=archived-expired-records] Archived ` +
        `[${result.arnsArchived}] ArNS records and ` +
        `[${result.antArchived}] ANT records`
    )

    return result
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
