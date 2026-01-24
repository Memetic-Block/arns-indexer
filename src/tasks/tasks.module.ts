import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { TasksQueue } from './processors/tasks.queue'
import { TargetResolutionQueue } from './processors/target-resolution.queue'
import { CrawlQueue } from './processors/crawl.queue'
import { TasksService } from './tasks.service'
import { ArnsModule } from '../arns/arns.module'
import { AntResolvedTarget } from '../arns/schema/ant-resolved-target.entity'
import { CrawledDocument } from '../arns/schema/crawled-document.entity'

@Module({
  imports: [
    ArnsModule,
    TypeOrmModule.forFeature([AntResolvedTarget, CrawledDocument]),
    BullModule.registerQueue({
      name: 'arns-records-discovery-queue',
      streams: { events: { maxLen: 1000 } }
    }),
    BullModule.registerFlowProducer({
      name: 'arns-records-discovery-flow'
    }),
    BullModule.registerQueue({
      name: 'ant-target-resolution-queue',
      streams: { events: { maxLen: 1000 } }
    }),
    BullModule.registerQueue({
      name: 'ant-crawl-queue',
      streams: { events: { maxLen: 1000 } }
    })
  ],
  providers: [TasksService, TasksQueue, TargetResolutionQueue, CrawlQueue],
  exports: [TasksService]
})
export class TasksModule {}
