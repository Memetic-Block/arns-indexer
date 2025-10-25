import { Controller, Get, Header, StreamableFile } from '@nestjs/common'
import { Readable } from 'stream'

import { AppService } from './app.service'
import { ArnsService } from './arns/arns.service'

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly arnsService: ArnsService
  ) {}

  @Get()
  getHealthcheck(): string {
    return this.appService.getHealthcheck()
  }

  @Get('crawler-config-domains.yml')
  @Header('Content-Type', 'application/yaml')
  @Header(
    'Content-Disposition',
    'attachment; filename="crawl-config-domains.yml"'
  )
  async getCrawlerConfigValidDomains() {
    const configFile = await this.arnsService.legacy_generateCrawlDomainsConfigFile()
    return new StreamableFile(Readable.from([configFile]))
  }
}
