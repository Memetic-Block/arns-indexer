import { Test, TestingModule } from '@nestjs/testing'
import { ConfigModule } from '@nestjs/config'
import { getRepositoryToken } from '@nestjs/typeorm'
import * as fs from 'fs/promises'

import { ArnsService } from './arns.service'
import { ArnsRecord } from './schema/arns-record.entity'

describe('ArnsService', () => {
  let service: ArnsService
  const mockRecords: ArnsRecord[] = [
    {
      id: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'example1',
      processId: 'processId1',
      primaryUndernameTarget: 'target1'
    },
    {
      id: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'example2',
      processId: 'processId2',
      primaryUndernameTarget: 'target2'
    },
    {
      id: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: 'example3',
      processId: 'processId3',
      primaryUndernameTarget: 'target3'
    }
  ]

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      imports: [ ConfigModule.forRoot()],
      providers: [
        ArnsService,
        {
          provide: getRepositoryToken(ArnsRecord),
          useValue: {
            find: jest.fn().mockResolvedValue(mockRecords)
          }
        }
      ]
    }).compile()

    service = app.get(ArnsService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('Should fetch ARNS records', async () => {
    const records = await service.getArNSRecords()
    expect(records).toBeDefined()
    expect(records.items).toBeInstanceOf(Array)
    expect(records.items.length).toBeGreaterThan(0)
  })

  it('Should handle cursor pagination', async () => {
    const firstPage = await service.getArNSRecords()
    const cursor = firstPage.nextCursor
    expect(cursor).toBeDefined()

    const secondPage = await service.getArNSRecords(cursor)
    expect(secondPage).toBeDefined()
    expect(secondPage.items).toBeInstanceOf(Array)
    expect(secondPage.items.length).toBeGreaterThan(0)
  })

  it('Should fetch all ARNS records', async () => {
    const allRecords = await service.getAllArNSRecords()
    expect(allRecords).toBeDefined()
    expect(allRecords).toBeInstanceOf(Array)
    expect(allRecords.length).toBeGreaterThan(1000)
  })

  it('Should generate crawl domains config file', async () => {
    await service.generateCrawlDomainsConfigFile()

    // Verify that the file was created and contains expected content
    const crawlConfigPath = './data/crawl-config-domains.yml'
    const content = await fs.readFile(crawlConfigPath, 'utf-8')
    expect(content).toBeDefined()
    const lines = content.split('\n')

    expect(lines[0]).toBe('domains:')
    for (let i = 1; i < lines.length - 1; i++) {
      expect(lines[i]).toMatch(/^\s\s-\s+url:\s+https:\/\/[a-z0-9\-\+]+\.arweave\.net$/)
    }
  })
})
