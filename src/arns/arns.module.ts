import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'

import { ArnsService } from './arns.service'
import { AntRecord } from './schema/ant-record.entity'
import { AntRecordArchive } from './schema/ant-record-archive.entity'
import { ArnsRecord } from './schema/arns-record.entity'
import { ArnsRecordArchive } from './schema/arns-record-archive.entity'

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      AntRecord,
      AntRecordArchive,
      ArnsRecord,
      ArnsRecordArchive
    ])
  ],
  controllers: [],
  providers: [ ArnsService ],
  exports: [ ArnsService ]
})
export class ArnsModule {}
