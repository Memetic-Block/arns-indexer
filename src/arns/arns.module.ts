import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'

import { ArnsService } from './arns.service'
import { AntRecord } from './schema/ant-record.entity'
import { ArnsRecord } from './schema/arns-record.entity'

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([ AntRecord, ArnsRecord ])
  ],
  controllers: [],
  providers: [ ArnsService ],
  exports: [ ArnsService ]
})
export class ArnsModule {}
