import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'

import { TasksQueue } from './processors/tasks.queue'
import { TargetResolutionQueue } from './processors/target-resolution.queue'
import { TasksService } from './tasks.service'
import { ArnsModule } from '../arns/arns.module'

@Module({
  imports: [
    ArnsModule,
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
    })
  ],
  providers: [TasksService, TasksQueue, TargetResolutionQueue],
  exports: [TasksService]
})
export class TasksModule {}