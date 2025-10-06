import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ElasticCrawlerService } from './elastic-crawler.service' 

@Module({
  imports: [ ConfigModule ],
  controllers: [],
  providers: [ ElasticCrawlerService ],
  exports: [ ElasticCrawlerService ]
})
export class ElasticCrawlerModule {}
