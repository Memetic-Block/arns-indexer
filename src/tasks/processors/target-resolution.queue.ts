import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Inject, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Job, Queue } from 'bullmq'
import { InjectQueue } from '@nestjs/bullmq'

import { AntTargetResolutionService } from '../../arns/ant-target-resolution.service'

export interface ResolveTargetJobData {
  transactionId: string
}

@Processor('ant-target-resolution-queue')
export class TargetResolutionQueue extends WorkerHost {
  public static readonly JOB_RESOLVE_ANT_TARGETS = 'resolve-ant-targets'
  public static readonly JOB_RETRY_TARGET_RESOLUTION = 'retry-target-resolution'

  private readonly logger = new Logger(TargetResolutionQueue.name)
  private readonly maxRetries: number
  private readonly retryDelayMs: number

  constructor(
    private readonly config: ConfigService<{
      MAX_RESOLVE_RETRIES: string
      RESOLVE_RETRY_DELAY_MS: string
    }>,
    @InjectQueue('ant-target-resolution-queue')
    private readonly resolutionQueue: Queue,
    @Inject()
    private readonly targetResolutionService: AntTargetResolutionService
  ) {
    super()

    const maxRetriesConfig = this.config.get<string>(
      'MAX_RESOLVE_RETRIES',
      '3'
    )
    this.maxRetries = parseInt(maxRetriesConfig, 10)
    if (isNaN(this.maxRetries) || this.maxRetries < 1) {
      throw new Error(
        `MAX_RESOLVE_RETRIES must be a positive integer, got: ${maxRetriesConfig}`
      )
    }

    const retryDelayConfig = this.config.get<string>(
      'RESOLVE_RETRY_DELAY_MS',
      '7200000' // 2 hours default
    )
    this.retryDelayMs = parseInt(retryDelayConfig, 10)
    if (isNaN(this.retryDelayMs) || this.retryDelayMs < 0) {
      throw new Error(
        `RESOLVE_RETRY_DELAY_MS must be a non-negative integer, got: ${retryDelayConfig}`
      )
    }

    this.logger.log(
      `Target resolution configured with maxRetries=${this.maxRetries}, ` +
      `retryDelayMs=${this.retryDelayMs}`
    )
  }

  async process(job: Job<ResolveTargetJobData, any, string>): Promise<any> {
    this.logger.debug(`Processing ${job.name} [${job.id}]`)

    switch (job.name) {
      case TargetResolutionQueue.JOB_RESOLVE_ANT_TARGETS:
        await this.processResolveTargets()
        break

      case TargetResolutionQueue.JOB_RETRY_TARGET_RESOLUTION:
        await this.processRetryTarget(job.data)
        break

      default:
        this.logger.warn(`Unknown job type: ${job.name} [${job.id}]`)
    }
  }

  private async processResolveTargets(): Promise<void> {
    this.logger.log('Starting batch target resolution')

    const unresolvedTargets = await this.targetResolutionService
      .findUnresolvedTargets(this.maxRetries)

    this.logger.log(
      `Found ${unresolvedTargets.length} targets needing resolution`
    )

    let resolved = 0
    let failed = 0
    let queuedRetry = 0

    for (const transactionId of unresolvedTargets) {
      try {
        const result = await this.targetResolutionService.processTarget(
          transactionId,
          this.maxRetries
        )

        if (result.resolved) {
          resolved++
        } else if (result.shouldRetry) {
          // Queue delayed retry job for 404 responses
          await this.queueRetryJob(transactionId)
          queuedRetry++
        } else {
          failed++
        }
      } catch (error) {
        this.logger.error(
          `Error processing target ${transactionId}: ${error.message}`,
          error.stack
        )
        // Network errors - let BullMQ handle via job retry
        throw error
      }
    }

    const stats = await this.targetResolutionService.getStats()

    this.logger.log(
      `[alarm=target-resolution-complete] Batch resolution complete: ` +
      `resolved=${resolved}, queuedRetry=${queuedRetry}, failed=${failed}. ` +
      `Total stats: ${JSON.stringify(stats)}`
    )
  }

  private async processRetryTarget(data: ResolveTargetJobData): Promise<void> {
    const { transactionId } = data

    this.logger.log(`Retrying resolution for target ${transactionId}`)

    try {
      const result = await this.targetResolutionService.processTarget(
        transactionId,
        this.maxRetries
      )

      if (result.resolved) {
        this.logger.log(`Successfully resolved target ${transactionId} on retry`)
      } else if (result.shouldRetry) {
        // Queue another delayed retry
        await this.queueRetryJob(transactionId)
        this.logger.log(
          `Target ${transactionId} still not found, ` +
          `queued retry ${result.retryCount + 1}/${this.maxRetries}`
        )
      } else {
        this.logger.warn(
          `Target ${transactionId} marked as not found after ` +
          `${result.retryCount} retries`
        )
      }
    } catch (error) {
      this.logger.error(
        `Error retrying target ${transactionId}: ${error.message}`,
        error.stack
      )
      throw error
    }
  }

  private async queueRetryJob(transactionId: string): Promise<void> {
    await this.resolutionQueue.add(
      TargetResolutionQueue.JOB_RETRY_TARGET_RESOLUTION,
      { transactionId },
      {
        delay: this.retryDelayMs,
        removeOnComplete: true,
        removeOnFail: 8,
        attempts: 3, // BullMQ retries for network errors
        backoff: {
          type: 'exponential',
          delay: 5000
        }
      }
    )
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<any, any, string>) {
    this.logger.debug(`Completed ${job.name} [${job.id}]`)
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<any, any, string>) {
    this.logger.error(
      `[alarm=failed-job-${job.name}] Failed ${job.name} [${job.id}]: ` +
      `${job.failedReason}`
    )
  }
}
