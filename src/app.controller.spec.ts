import { Test, TestingModule } from '@nestjs/testing'
import { StreamableFile } from '@nestjs/common'

import { AppController } from './app.controller'
import { AppService } from './app.service'

describe('AppController', () => {
  let appController: AppController

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService]
    }).compile()

    appController = app.get<AppController>(AppController)
  })

  describe('root', () => {
    it('should return "OK"', () => {
      expect(appController.getHealthcheck()).toBe('OK')
    })
  })

  describe('/crawler-config-domains.yml', () => {
    it('should return yaml file', async () => {
      const result = await appController.getCrawlerConfigValidDomains()
      expect(result).toBeInstanceOf(StreamableFile)
    })
  })
})
