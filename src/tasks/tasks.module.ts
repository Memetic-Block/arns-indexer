import { BullModule } from '@nestjs/bullmq'
import { Logger, Module } from '@nestjs/common'
import { TasksQueue } from './processors/tasks.queue'
import { TasksService } from './tasks.service'
import { ArnsModule } from '../arns/arns.module'

@Module({
  imports: [
    ArnsModule,
    BullModule.registerQueue({
      name: 'tasks-queue',
      streams: { events: { maxLen: 1000 } }
    })
  ],
  providers: [TasksService, TasksQueue],
  exports: [TasksService]
})
export class TasksModule {}