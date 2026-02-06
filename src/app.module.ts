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
import { InitialSchema1738800000000 } from './migrations/1738800000000-InitialSchema'

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
        }>
      ) => {
        const logger = new Logger(AppModule.name)
        const redisMode = config.get<string>('REDIS_MODE', 'standalone', {
          infer: true
        })

        const redisHost = String(
          config.get<string>('REDIS_HOST', { infer: true }) ?? 'localhost'
        )
        const redisPort = Number(
          config.get<number>('REDIS_PORT', { infer: true }) ?? 6379
        )

        let connection: ConnectionOptions = {
          host: redisHost,
          port: redisPort
        }

        if (redisMode === 'sentinel') {
          const name = String(
            config.get<string>('REDIS_MASTER_NAME', { infer: true }) ??
              'mymaster'
          )
          const sentinel1Host = String(
            config.get<string>('REDIS_SENTINEL_1_HOST', { infer: true }) ??
              'localhost'
          )
          const sentinel1Port = Number(
            config.get<number>('REDIS_SENTINEL_1_PORT', { infer: true }) ??
              26379
          )
          const sentinel2Host = String(
            config.get<string>('REDIS_SENTINEL_2_HOST', { infer: true }) ??
              'localhost'
          )
          const sentinel2Port = Number(
            config.get<number>('REDIS_SENTINEL_2_PORT', { infer: true }) ??
              26380
          )
          const sentinel3Host = String(
            config.get<string>('REDIS_SENTINEL_3_HOST', { infer: true }) ??
              'localhost'
          )
          const sentinel3Port = Number(
            config.get<number>('REDIS_SENTINEL_3_PORT', { infer: true }) ??
              26381
          )

          const sentinels = [
            { host: sentinel1Host, port: sentinel1Port },
            { host: sentinel2Host, port: sentinel2Port },
            { host: sentinel3Host, port: sentinel3Port }
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
        }>
      ) => {
        const logger = new Logger(AppModule.name)

        const synchronize =
          config.get<string>('DB_SYNCHRONIZE', { infer: true }) === 'true'
        const migrationsRun =
          config.get<string>('DB_MIGRATIONS_RUN', { infer: true }) === 'true'

        logger.log(`DB_SYNCHRONIZE: ${synchronize}`)
        logger.log(`DB_MIGRATIONS_RUN: ${migrationsRun}`)

        const dbHost = String(
          config.get<string>('DB_HOST', { infer: true }) ?? 'localhost'
        )
        const dbPort = Number(
          config.get<number>('DB_PORT', { infer: true }) ?? 5432
        )
        const dbUsername = String(
          config.get<string>('DB_USERNAME', { infer: true }) ?? 'postgres'
        )
        const dbPassword = String(
          config.get<string>('DB_PASSWORD', { infer: true }) ?? 'postgres'
        )
        const dbName = String(
          config.get<string>('DB_NAME', { infer: true }) ?? 'arns'
        )

        return {
          type: 'postgres',
          host: dbHost,
          port: dbPort,
          username: dbUsername,
          password: dbPassword,
          database: dbName,
          entities: dbEntities,
          synchronize,
          migrations: [InitialSchema1738800000000],
          migrationsRun
        }
      }
    }),
    ArnsModule,
    TasksModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
