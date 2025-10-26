import { Logger, Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ConnectionOptions } from 'bullmq'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ArnsModule } from './arns/arns.module'
import { TasksModule } from './tasks/tasks.module'
import { dbEntities } from './db-entities'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<{
          REDIS_MODE: string
          REDIS_HOST: string
          REDIS_PORT: number
          REDIS_MASTER_NAME: string
          REDIS_SENTINEL_1_HOST: string
          REDIS_SENTINEL_1_PORT: number
          REDIS_SENTINEL_2_HOST: string
          REDIS_SENTINEL_2_PORT: number
          REDIS_SENTINEL_3_HOST: string
          REDIS_SENTINEL_3_PORT: number
        }>,
      ) => {
        const logger = new Logger(AppModule.name)
        const redisMode = config.get<string>(
          'REDIS_MODE',
          'standalone',
          { infer: true }
        )

        let connection: ConnectionOptions = {
          host: config.get<string>('REDIS_HOST', { infer: true }),
          port: config.get<number>('REDIS_PORT', { infer: true }),
        }

        if (redisMode === 'sentinel') {
          const name = config.get<string>('REDIS_MASTER_NAME', { infer: true })
          const sentinels = [
            {
              host: config.get<string>(
                'REDIS_SENTINEL_1_HOST',
                { infer: true }
              ),
              port: config.get<number>('REDIS_SENTINEL_1_PORT', { infer: true })
            },
            {
              host: config.get<string>(
                'REDIS_SENTINEL_2_HOST',
                { infer: true }
              ),
              port: config.get<number>('REDIS_SENTINEL_2_PORT', { infer: true })
            },
            {
              host: config.get<string>(
                'REDIS_SENTINEL_3_HOST',
                { infer: true }
              ),
              port: config.get<number>('REDIS_SENTINEL_3_PORT', { infer: true })
            }
          ]
          connection = { sentinels, name }
        }

        logger.log(`Connecting to Redis with mode ${redisMode}`)
        logger.log(`Connection: ${JSON.stringify(connection)}`)

        return { connection }
      }
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<{
          DB_HOST: string
          DB_PORT: number
          DB_USERNAME: string
          DB_PASSWORD: string
          DB_NAME: string
          DB_SYNCHRONIZE: string // DO NOT SET THIS TO 'true' IN PRODUCTION!
          DB_MIGRATIONS_RUN: string
        }>,
      ) => {
        const logger = new Logger(AppModule.name)

        const synchronize = config.get<string>(
            'DB_SYNCHRONIZE',
            { infer: true }
          ) === 'true'
        const migrationsRun = config.get<string>(
            'DB_MIGRATIONS_RUN',
            { infer: true }
          ) === 'true'

        logger.log(`DB_SYNCHRONIZE: ${synchronize}`)
        logger.log(`DB_MIGRATIONS_RUN: ${migrationsRun}`)

        return {
          type: 'postgres',
          host: config.get<string>('DB_HOST', { infer: true }),
          port: config.get<number>('DB_PORT', { infer: true }),
          username: config.get<string>('DB_USERNAME', { infer: true }),
          password: config.get<string>('DB_PASSWORD', { infer: true }),
          database: config.get<string>('DB_NAME', { infer: true }),
          entities: dbEntities,
          synchronize: config.get<string>(
            'DB_SYNCHRONIZE',
            { infer: true }
          ) === 'true',
          migrations: ['./migrations/*.ts'],
          migrationsRun: config.get<string>(
            'DB_MIGRATIONS_RUN',
            { infer: true }
          ) === 'true',
        }
      }
    }),
    ArnsModule,
    TasksModule
  ],
  controllers: [ AppController ],
  providers: [ AppService ]
})
export class AppModule {}
