import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import * as request from 'supertest'
import { App } from 'supertest/types'

import { AppModule } from '../src/app.module'
import { ArnsService } from '../src/arns/arns.service'

describe('ArnsService (e2e)', () => {
  let app: INestApplication<App>
  let arnsService: ArnsService

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile()

    app = moduleFixture.createNestApplication()
    // await app.init()
    arnsService = app.get<ArnsService>(ArnsService)
  })

  afterEach(async () => {
    await app.close()
  })

  it('should be defined', () => {
    expect(arnsService).toBeDefined()
  })

  describe('ANT Records', () => {
    it('should resolve ANT records for a given process ID', async () => {
      const processId = '6Oe6u5NGk9xdUQTvZL8voKIIBW-V0GRy3Btk_B3CdLE' // cookbook

      const antRecords = await arnsService.getANTRecords(processId)

      expect(antRecords).toBeDefined()
      console.log(`ANT Records for process ${processId}`, antRecords)
    }, 30_000)

    it.only('should resolve ANT state for a given process ID', async () => {
      const processId = '6Oe6u5NGk9xdUQTvZL8voKIIBW-V0GRy3Btk_B3CdLE' // cookbook
      // const processId = 'AJ65hD7haLL2CPsjHVei8v6gNxev40Cu1UNq1zjP6dY' // siegfried

      const antState = await arnsService.getANTState(processId)

      expect(antState).toBeDefined()
      console.log(`ANT State for process ${processId}`, antState)
    }, 30_000)
  })
})
