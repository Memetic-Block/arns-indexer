import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Inject, Logger } from '@nestjs/common'
import { Job } from 'bullmq'
import { ArnsService } from '../../arns/arns.service'
import { TasksService } from '../tasks.service'

@Processor('tasks-queue')
export class TasksQueue extends WorkerHost {
  private readonly logger = new Logger(TasksQueue.name)

  public static readonly JOB_DISCOVER_ARNS_RECORDS = 'discover-arns-records'

  constructor(
    @Inject()
    private readonly tasksService: TasksService,
    @Inject()
    private readonly arnsService: ArnsService
  ) {
    super()
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.debug(`Dequeueing ${job.name} [${job.id}]`)

    switch (job.name) {
      case TasksQueue.JOB_DISCOVER_ARNS_RECORDS:
        try {
          await this.arnsService.updateArnsDatabase()
        } catch (error) {
          this.logger.error(
            `Exception during ARNs records discovery: ${error.message}`,
            error.stack
          )
        }

        await this.tasksService.queueArnsRecordsDiscovery(86_400_000) // 24h

        break
      default:
        this.logger.warn(`Found unknown job ${job.name} [${job.id}]`)
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<any, any, string>) {
    this.logger.debug(`Finished ${job.name} [${job.id}]`)
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<any, any, string>) {
    this.logger.error(
      `[alarm=failed-job-${job.name}] Failed ${job.name} [${job.id}]: ` +
        `${job.failedReason}`
    )
  }
}
