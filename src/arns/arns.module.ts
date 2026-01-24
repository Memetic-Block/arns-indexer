import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'

import { ArnsService } from './arns.service'
import { AntTargetResolutionService } from './ant-target-resolution.service'
import { ContentCrawlerService } from './content-crawler.service'
import { AntRecord } from './schema/ant-record.entity'
import { AntRecordArchive } from './schema/ant-record-archive.entity'
import { AntResolvedTarget } from './schema/ant-resolved-target.entity'
import { ArnsRecord } from './schema/arns-record.entity'
import { ArnsRecordArchive } from './schema/arns-record-archive.entity'
import { CrawledDocument } from './schema/crawled-document.entity'

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      AntRecord,
      AntRecordArchive,
      AntResolvedTarget,
      ArnsRecord,
      ArnsRecordArchive,
      CrawledDocument
    ])
  ],
  controllers: [],
  providers: [ArnsService, AntTargetResolutionService, ContentCrawlerService],
  exports: [ArnsService, AntTargetResolutionService, ContentCrawlerService]
})
export class ArnsModule {}
