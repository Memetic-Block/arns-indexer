import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'

import { TasksQueue } from './processors/tasks.queue'
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
    })
  ],
  providers: [TasksService, TasksQueue],
  exports: [TasksService]
})
export class TasksModule {}