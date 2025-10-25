import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Inject, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Job } from 'bullmq'

import { ArnsService } from '../../arns/arns.service'
import { TasksService } from '../tasks.service'

@Processor('arns-records-discovery-queue')
export class TasksQueue extends WorkerHost {
  public static readonly JOB_DISCOVER_ARNS_RECORDS = 'discover-arns-records'
  public static readonly JOB_DISCOVER_ANT_RECORDS = 'discover-ant-records'

  private readonly logger = new Logger(TasksQueue.name)
  private readonly queueTtlMs: number

  constructor(
    private readonly config: ConfigService<{ ARNS_QUEUE_TTL_MS: string }>,
    @Inject()
    private readonly tasksService: TasksService,
    @Inject()
    private readonly arnsService: ArnsService
  ) {
    super()

    const configQueueTtlMs = this.config.get<string>(
      'ARNS_QUEUE_TTL_MS',
      '3600000'
    )
    const queueTtlMs = parseInt(configQueueTtlMs)
    if (isNaN(queueTtlMs) || queueTtlMs <= 0) {
      throw new Error(
        `ARNS_QUEUE_TTL_MS must be a positive integer, got: ${configQueueTtlMs}`
      )
    }
    this.queueTtlMs = queueTtlMs
    this.logger.log(`Using ArNS Queue TTL ${this.queueTtlMs} ms`)
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.debug(`Dequeueing ${job.name} [${job.id}]`)

    switch (job.name) {
      case TasksQueue.JOB_DISCOVER_ARNS_RECORDS:
        try {
          await this.arnsService.updateArNSRecordsIndex()
        } catch (error) {
          this.logger.error(
            `Exception during ARNs records discovery: ${error.message}`,
            error.stack
          )
        }

        break

      case TasksQueue.JOB_DISCOVER_ANT_RECORDS:
        try {
          await this.arnsService.updateANTRecordsIndex()
        } catch (error) {
          this.logger.error(
            `Exception during ANT records discovery: ${error.message}`,
            error.stack
          )
        }

        await this.tasksService.queueArnsRecordsDiscovery(this.queueTtlMs)

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
