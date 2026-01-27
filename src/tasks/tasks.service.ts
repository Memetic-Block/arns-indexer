import { InjectQueue, InjectFlowProducer } from '@nestjs/bullmq'
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Queue, FlowProducer } from 'bullmq'

import { TasksQueue } from './processors/tasks.queue'
import { TargetResolutionQueue } from './processors/target-resolution.queue'
import { CrawlQueue } from './processors/crawl.queue'

@Injectable()
export class TasksService implements OnApplicationBootstrap {
  static readonly DEFAULT_JOB_OPTS = {
    removeOnComplete: true,
    removeOnFail: 8
  }

  private readonly logger = new Logger(TasksService.name)
  private readonly doClean?: string
  private readonly enableTargetResolution: boolean
  private readonly crawlEnabled: boolean

  constructor(
    private readonly config: ConfigService<{
      DO_CLEAN: string
      VERSION: string
      ENABLE_TARGET_RESOLUTION: string
      CRAWL_ANTS_ENABLED: string
    }>,
    @InjectQueue('arns-records-discovery-queue')
    public arnsRecordsDiscoveryQueue: Queue,
    @InjectFlowProducer('arns-records-discovery-flow')
    public arnsRecordsDiscoveryFlow: FlowProducer,
    @InjectQueue('ant-target-resolution-queue')
    public antTargetResolutionQueue: Queue,
    @InjectQueue('ant-crawl-queue')
    public antCrawlQueue: Queue
  ) {
    this.doClean = this.config.get<string>('DO_CLEAN', { infer: true })
    this.enableTargetResolution =
      this.config.get<string>('ENABLE_TARGET_RESOLUTION', 'false', {
        infer: true
      }) === 'true'
    this.crawlEnabled =
      this.config.get<string>('CRAWL_ANTS_ENABLED', 'false', {
        infer: true
      }) === 'true'

    const version = this.config.get<string>('VERSION', { infer: true })
    this.logger.log(
      `Starting Tasks service for ArNS Indexer version: ${version}`
    )
    this.logger.log(
      `Target resolution enabled: ${this.enableTargetResolution}, crawl enabled: ${this.crawlEnabled}`
    )
  }

  async onApplicationBootstrap() {
    if (this.doClean === 'true') {
      this.logger.log('Cleaning up tasks queue because DO_CLEAN is true')
      try {
        await this.arnsRecordsDiscoveryQueue.obliterate({ force: true })
        await this.antTargetResolutionQueue.obliterate({ force: true })
        await this.antCrawlQueue.obliterate({ force: true })
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        this.logger.error(
          `Failed cleaning up queues: ${err.message}`,
          err.stack
        )
      }
    }

    this.logger.log(
      `Bootstrapping Tasks service with a new arns records discovery queue`
    )
    this.queueArnsRecordsDiscovery().catch((error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error))
      this.logger.error(
        `Failed to queue initial ARNs records discovery job: ${err.message}`,
        err.stack
      )
    })
  }

  public async queueArnsRecordsDiscovery(delay: number = 0) {
    this.logger.log(
      `Queueing ARNs records discovery job with delay [${delay}ms]`
    )

    try {
      // Build flow children - discovery and cleanup are always included
      const children = [
        {
          name: TasksQueue.JOB_DISCOVER_ANT_RECORDS,
          queueName: 'arns-records-discovery-queue',
          opts: {
            ...TasksService.DEFAULT_JOB_OPTS
          },
          children: [
            {
              name: TasksQueue.JOB_DISCOVER_ARNS_RECORDS,
              queueName: 'arns-records-discovery-queue',
              opts: {
                delay,
                ...TasksService.DEFAULT_JOB_OPTS
              }
            }
          ]
        }
      ]

      // If target resolution is enabled, add it as parent of cleanup
      // Flow execution order: DISCOVER_ARNS -> DISCOVER_ANT -> CLEANUP -> RESOLVE_TARGETS -> CRAWL_TARGETS
      if (this.enableTargetResolution) {
        // Build the resolution job
        const resolutionJob = {
          name: TargetResolutionQueue.JOB_RESOLVE_ANT_TARGETS,
          queueName: 'ant-target-resolution-queue',
          opts: {
            ...TasksService.DEFAULT_JOB_OPTS,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 5000
            }
          },
          children: [
            {
              name: TasksQueue.JOB_CLEANUP_EXPIRED_RECORDS,
              queueName: 'arns-records-discovery-queue',
              opts: {
                ...TasksService.DEFAULT_JOB_OPTS
              },
              children
            }
          ]
        }

        // If crawling is enabled, add crawl job as the top-level parent
        if (this.crawlEnabled) {
          await this.arnsRecordsDiscoveryFlow.add({
            name: CrawlQueue.JOB_CRAWL_ANT_TARGETS,
            queueName: 'ant-crawl-queue',
            opts: {
              ...TasksService.DEFAULT_JOB_OPTS,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 5000
              }
            },
            children: [resolutionJob]
          })
        } else {
          await this.arnsRecordsDiscoveryFlow.add(resolutionJob)
        }
      } else {
        await this.arnsRecordsDiscoveryFlow.add({
          name: TasksQueue.JOB_CLEANUP_EXPIRED_RECORDS,
          queueName: 'arns-records-discovery-queue',
          opts: {
            ...TasksService.DEFAULT_JOB_OPTS
          },
          children
        })
      }

      this.logger.log(
        `[alarm=enqueued-arns-records-discovery] ` +
          `Enqueued ArNS records discovery job ` +
          `(target resolution: ${this.enableTargetResolution}, crawl: ${this.crawlEnabled})`
      )
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.logger.error(
        `Failed adding ArNS records discovery job to queue: ` +
          `${err.message}`,
        err.stack
      )
    }

    return
  }
}
