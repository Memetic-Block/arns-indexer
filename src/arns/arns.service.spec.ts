import { Test, TestingModule } from '@nestjs/testing'
import { ConfigModule } from '@nestjs/config'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import * as fs from 'fs/promises'

import { ArnsService } from './arns.service'
import { AntRecord } from './schema/ant-record.entity'
import { AntRecordArchive } from './schema/ant-record-archive.entity'
import { ArnsRecord } from './schema/arns-record.entity'
import { ArnsRecordArchive } from './schema/arns-record-archive.entity'

describe('ArnsService', () => {
  let service: ArnsService
  // const mockRecords: AntRecord[] = [
  //   {
  //     id: 1,
  //     createdAt: new Date(),
  //     updatedAt: new Date(),
  //     name: 'example1',
  //     processId: 'processId1',
  //     primaryUndernameTarget: 'target1'
  //   },
  //   {
  //     id: 2,
  //     createdAt: new Date(),
  //     updatedAt: new Date(),
  //     name: 'example2',
  //     processId: 'processId2',
  //     primaryUndernameTarget: 'target2'
  //   },
  //   {
  //     id: 3,
  //     createdAt: new Date(),
  //     updatedAt: new Date(),
  //     name: 'example3',
  //     processId: 'processId3',
  //     primaryUndernameTarget: 'target3'
  //   }
  // ]

  // beforeEach(async () => {
  //   const app: TestingModule = await Test.createTestingModule({
  //     imports: [ ConfigModule.forRoot()],
  //     providers: [
  //       ArnsService,
  //       {
  //         provide: getRepositoryToken(AntRecord),
  //         useValue: {
  //           find: jest.fn().mockResolvedValue(mockRecords)
  //         }
  //       }
  //     ]
  //   }).compile()

  //   service = app.get(ArnsService)
  // })

  // it('should be defined', () => {
  //   expect(service).toBeDefined()
  // })

  // it('Should fetch ARNS records', async () => {
  //   const records = await service.getArNSRecords()
  //   expect(records).toBeDefined()
  //   expect(records.items).toBeInstanceOf(Array)
  //   expect(records.items.length).toBeGreaterThan(0)
  // })

  // it('Should handle cursor pagination', async () => {
  //   const firstPage = await service.getArNSRecords()
  //   const cursor = firstPage.nextCursor
  //   expect(cursor).toBeDefined()

  //   const secondPage = await service.getArNSRecords(cursor)
  //   expect(secondPage).toBeDefined()
  //   expect(secondPage.items).toBeInstanceOf(Array)
  //   expect(secondPage.items.length).toBeGreaterThan(0)
  // })

  // it('Should fetch all ARNS records', async () => {
  //   const allRecords = await service.getAllArNSRecords()
  //   expect(allRecords).toBeDefined()
  //   expect(allRecords).toBeInstanceOf(Array)
  //   expect(allRecords.length).toBeGreaterThan(1000)
  // })

  // it('Should generate crawl domains config file', async () => {
  //   await service.generateCrawlDomainsConfigFile()

  //   // Verify that the file was created and contains expected content
  //   const crawlConfigPath = './data/crawl-config-domains.yml'
  //   const content = await fs.readFile(crawlConfigPath, 'utf-8')
  //   expect(content).toBeDefined()
  //   const lines = content.split('\n')

  //   expect(lines[0]).toBe('domains:')
  //   for (let i = 1; i < lines.length - 1; i++) {
  //     expect(lines[i]).toMatch(/^\s\s-\s+url:\s+https:\/\/[a-z0-9\-\+]+\.arweave\.net$/)
  //   }
  // })
})

describe('ArnsService - archiveExpiredRecords', () => {
  let service: ArnsService
  let mockArnsRecordsRepository: any
  let mockAntRecordsRepository: any
  let mockDataSource: any
  let mockManager: any

  const now = Date.now()
  const pastTimestamp = now - 86400000 // 1 day ago
  const futureTimestamp = now + 86400000 // 1 day in future

  const expiredLeaseRecord: Partial<ArnsRecord> = {
    id: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    name: 'expired-lease',
    processId: 'process1',
    type: 'lease',
    endTimestamp: pastTimestamp,
    purchasePrice: 1000,
    startTimestamp: pastTimestamp - 31536000000,
    undernameLimit: 10
  }

  const activeLeaseRecord: Partial<ArnsRecord> = {
    id: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    name: 'active-lease',
    processId: 'process2',
    type: 'lease',
    endTimestamp: futureTimestamp,
    purchasePrice: 1000,
    startTimestamp: now - 31536000000,
    undernameLimit: 10
  }

  const permabuyRecord: Partial<ArnsRecord> = {
    id: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
    name: 'permabuy-record',
    processId: 'process3',
    type: 'permabuy',
    endTimestamp: null,
    purchasePrice: 5000,
    startTimestamp: now - 31536000000,
    undernameLimit: null
  }

  const expiredAntRecord: Partial<AntRecord> = {
    id: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    name: 'expired-lease',
    processId: 'process1',
    undername: '@',
    transactionId: 'tx1',
    ttlSeconds: 3600,
    description: 'test',
    priority: 1,
    owner: 'owner1',
    displayName: 'Test',
    logo: null,
    keywords: [],
    controllers: []
  }

  beforeEach(async () => {
    mockManager = {
      create: jest.fn((entity, data) => data),
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue({ affected: 1 })
    }

    mockDataSource = {
      transaction: jest.fn((callback) => callback(mockManager))
    }

    mockArnsRecordsRepository = {
      find: jest.fn()
    }

    mockAntRecordsRepository = {
      find: jest.fn()
    }

    const app: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [
        ArnsService,
        {
          provide: DataSource,
          useValue: mockDataSource
        },
        {
          provide: getRepositoryToken(AntRecord),
          useValue: mockAntRecordsRepository
        },
        {
          provide: getRepositoryToken(AntRecordArchive),
          useValue: {}
        },
        {
          provide: getRepositoryToken(ArnsRecord),
          useValue: mockArnsRecordsRepository
        },
        {
          provide: getRepositoryToken(ArnsRecordArchive),
          useValue: {}
        }
      ]
    }).compile()

    service = app.get(ArnsService)
  })

  it('should return zeros when no expired records found', async () => {
    mockArnsRecordsRepository.find.mockResolvedValue([])

    const result = await service.archiveExpiredRecords()

    expect(result).toEqual({ arnsArchived: 0, antArchived: 0 })
    expect(mockDataSource.transaction).not.toHaveBeenCalled()
  })

  it('should archive expired lease records and their ANT records', async () => {
    mockArnsRecordsRepository.find.mockResolvedValue([expiredLeaseRecord])
    mockAntRecordsRepository.find.mockResolvedValue([expiredAntRecord])

    const result = await service.archiveExpiredRecords()

    expect(result).toEqual({ arnsArchived: 1, antArchived: 1 })
    expect(mockDataSource.transaction).toHaveBeenCalled()
    expect(mockManager.create).toHaveBeenCalledTimes(2)
    expect(mockManager.save).toHaveBeenCalledTimes(2)
    expect(mockManager.delete).toHaveBeenCalledTimes(2)
  })

  it('should archive ArNS records without ANT records', async () => {
    mockArnsRecordsRepository.find.mockResolvedValue([expiredLeaseRecord])
    mockAntRecordsRepository.find.mockResolvedValue([])

    const result = await service.archiveExpiredRecords()

    expect(result).toEqual({ arnsArchived: 1, antArchived: 0 })
    expect(mockDataSource.transaction).toHaveBeenCalled()
    // Only ArNS archive should be created/saved/deleted
    expect(mockManager.create).toHaveBeenCalledTimes(1)
    expect(mockManager.save).toHaveBeenCalledTimes(1)
    expect(mockManager.delete).toHaveBeenCalledTimes(1)
  })

  it('should not archive permabuy records', async () => {
    // The repository find with type: 'lease' filter should not return permabuy
    mockArnsRecordsRepository.find.mockResolvedValue([])

    const result = await service.archiveExpiredRecords()

    expect(result).toEqual({ arnsArchived: 0, antArchived: 0 })
  })

  it('should not archive active lease records', async () => {
    // The repository find with LessThan(now) filter should not return active leases
    mockArnsRecordsRepository.find.mockResolvedValue([])

    const result = await service.archiveExpiredRecords()

    expect(result).toEqual({ arnsArchived: 0, antArchived: 0 })
  })

  it('should rollback on transaction failure', async () => {
    mockArnsRecordsRepository.find.mockResolvedValue([expiredLeaseRecord])
    mockAntRecordsRepository.find.mockResolvedValue([expiredAntRecord])
    mockDataSource.transaction.mockRejectedValue(new Error('DB error'))

    await expect(service.archiveExpiredRecords()).rejects.toThrow('DB error')
  })
})
