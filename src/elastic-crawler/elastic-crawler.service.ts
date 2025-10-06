import { Injectable, Logger } from '@nestjs/common'

@Injectable()
export class ElasticCrawlerService {
  private readonly logger: Logger = new Logger(ElasticCrawlerService.name)

  constructor() {}

  async crawl(): Promise<void> {
    this.logger.log('Starting the crawling process...')

    

    this.logger.log('Crawling process completed.')
  }
}
