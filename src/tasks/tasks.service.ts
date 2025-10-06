import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { InjectQueue, InjectFlowProducer } from '@nestjs/bullmq'
import { Queue, FlowProducer, FlowJob } from 'bullmq'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class TasksService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TasksService.name)
  private readonly doClean? : string

  public static readonly removeOnComplete = true
  public static readonly removeOnFail = 8
  public static readonly jobOpts = {
    removeOnComplete: TasksService.removeOnComplete,
    removeOnFail: TasksService.removeOnFail,
  }

  constructor(
    private readonly config: ConfigService<{
      DO_CLEAN: string
      VERSION: string
    }>,
    @InjectQueue('tasks-queue')
    public tasksQueue: Queue
  ) {
    this.doClean = this.config.get<string>('DO_CLEAN', { infer: true })
    const version = this.config.get<string>('VERSION', { infer: true })
    this.logger.log(
      `Starting Tasks service for Wuzzy Crawler version: ${version}`
    )
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.doClean === 'true') {
      this.logger.log('Cleaning up tasks queue because DO_CLEAN is true')
      try {
        await this.tasksQueue.obliterate({ force: true })
      } catch (error) {
        this.logger.error(
          `Failed cleaning up queues: ${error.message}`,
          error.stack
        )
      }
    }

    this.logger.log(
      `Bootstrapping Tasks service with a new arns records discovery queue`
    )
    this.queueArnsRecordsDiscovery().catch(error => {
      this.logger.error(
        `Failed to queue initial ARNs records discovery job: ${error.message}`,
        error.stack
      )
    })
  }

  public async queueArnsRecordsDiscovery(delay: number = 0): Promise<void> {
    this.logger.log(
      `Queueing ARNs records discovery job with delay [${delay}ms]`
    )
    return this.tasksQueue
      .add(
        'discover-arns-records',
        {},
        {
          delay,
          removeOnComplete: TasksService.removeOnComplete,
          removeOnFail: TasksService.removeOnFail,
        }
      )
      .then(
        () => {
          this.logger.log(
            `[alarm=enqueued-arns-records-discovery] ` +
              `Enqueued ARNs records discovery job`
          )
          return
        },
        error => {
          this.logger.error(
            `Failed adding ARNs records discovery job to queue: ` +
              `${error.message}`,
            error.stack
          )
          return
        }
      )
  }
}
