import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Inject, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Job, Queue } from 'bullmq'
import { InjectQueue } from '@nestjs/bullmq'

import {
  AntTargetResolutionService,
  UnresolvedTarget
} from '../../arns/ant-target-resolution.service'

export interface ResolveTargetJobData {
  transactionId: string
  arnsName?: string
  undername?: string
}

@Processor('ant-target-resolution-queue')
export class TargetResolutionQueue extends WorkerHost {
  public static readonly JOB_RESOLVE_ANT_TARGETS = 'resolve-ant-targets'
  public static readonly JOB_RETRY_TARGET_RESOLUTION = 'retry-target-resolution'

  private readonly logger = new Logger(TargetResolutionQueue.name)
  private readonly maxRetries: number
  private readonly retryDelayMs: number
  private readonly batchSize: number
  private readonly concurrency: number

  constructor(
    private readonly config: ConfigService<{
      MAX_RESOLVE_RETRIES: string
      RESOLVE_RETRY_DELAY_MS: string
      RESOLUTION_BATCH_SIZE: string
      RESOLUTION_CONCURRENCY: string
    }>,
    @InjectQueue('ant-target-resolution-queue')
    private readonly resolutionQueue: Queue,
    @Inject()
    private readonly targetResolutionService: AntTargetResolutionService
  ) {
    super()

    const maxRetriesConfig = this.config.get<string>('MAX_RESOLVE_RETRIES', '3')
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

    const batchSizeConfig = this.config.get<string>(
      'RESOLUTION_BATCH_SIZE',
      '100'
    )
    this.batchSize = parseInt(batchSizeConfig, 10)
    if (isNaN(this.batchSize) || this.batchSize < 1) {
      throw new Error(
        `RESOLUTION_BATCH_SIZE must be a positive integer, got: ${batchSizeConfig}`
      )
    }

    const concurrencyConfig = this.config.get<string>(
      'RESOLUTION_CONCURRENCY',
      '2'
    )
    this.concurrency = parseInt(concurrencyConfig, 10)
    if (isNaN(this.concurrency) || this.concurrency < 1) {
      throw new Error(
        `RESOLUTION_CONCURRENCY must be a positive integer, got: ${concurrencyConfig}`
      )
    }

    this.logger.log(
      `Target resolution configured with maxRetries=${this.maxRetries}, ` +
        `retryDelayMs=${this.retryDelayMs}, batchSize=${this.batchSize}, ` +
        `concurrency=${this.concurrency}`
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

    let totalResolved = 0
    let totalFailed = 0
    let totalQueuedRetry = 0
    let totalErrors = 0
    let batchNumber = 0

    while (true) {
      batchNumber++
      const unresolvedTargets =
        await this.targetResolutionService.findUnresolvedTargets(
          this.maxRetries,
          this.batchSize
        )

      if (unresolvedTargets.length === 0) {
        this.logger.log(
          `No more unresolved targets after ${batchNumber - 1} batches`
        )
        break
      }

      this.logger.log(
        `Batch ${batchNumber}: Processing ${unresolvedTargets.length} targets ` +
          `with concurrency ${this.concurrency}`
      )

      // Process targets in parallel chunks
      const chunks = this.chunkArray(unresolvedTargets, this.concurrency)

      for (const chunk of chunks) {
        const results = await Promise.allSettled(
          chunk.map(async (target) => {
            const result = await this.targetResolutionService.processTarget(
              target,
              this.maxRetries
            )
            return { target, result }
          })
        )

        for (const settledResult of results) {
          if (settledResult.status === 'fulfilled') {
            const { target, result } = settledResult.value
            if (result.resolved) {
              totalResolved++
            } else if (result.shouldRetry) {
              await this.queueRetryJob(target)
              totalQueuedRetry++
            } else {
              totalFailed++
            }
          } else {
            totalErrors++
            this.logger.error(
              `Error processing target: ${settledResult.reason?.message}`,
              settledResult.reason?.stack
            )
          }
        }
      }

      this.logger.log(
        `Batch ${batchNumber} complete: resolved=${totalResolved}, ` +
          `queuedRetry=${totalQueuedRetry}, failed=${totalFailed}, errors=${totalErrors}`
      )
    }

    const stats = await this.targetResolutionService.getStats()

    this.logger.log(
      `[alarm=target-resolution-complete] Resolution complete after ${batchNumber} batches: ` +
        `resolved=${totalResolved}, queuedRetry=${totalQueuedRetry}, ` +
        `failed=${totalFailed}, errors=${totalErrors}. ` +
        `Total stats: ${JSON.stringify(stats)}`
    )
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  private async processRetryTarget(data: ResolveTargetJobData): Promise<void> {
    const { transactionId, arnsName, undername } = data

    this.logger.log(`Retrying resolution for target ${transactionId}`)

    const target: UnresolvedTarget = {
      transactionId,
      arnsName: arnsName || '',
      undername: undername || ''
    }

    try {
      const result = await this.targetResolutionService.processTarget(
        target,
        this.maxRetries
      )

      if (result.resolved) {
        this.logger.log(
          `Successfully resolved target ${transactionId} on retry`
        )
      } else if (result.shouldRetry) {
        // Queue another delayed retry
        await this.queueRetryJob(target)
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

  private async queueRetryJob(target: UnresolvedTarget): Promise<void> {
    await this.resolutionQueue.add(
      TargetResolutionQueue.JOB_RETRY_TARGET_RESOLUTION,
      {
        transactionId: target.transactionId,
        arnsName: target.arnsName,
        undername: target.undername
      },
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
