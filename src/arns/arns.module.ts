import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'

import { ArnsService } from './arns.service'
import { AntTargetResolutionService } from './ant-target-resolution.service'
import { AntRecord } from './schema/ant-record.entity'
import { AntRecordArchive } from './schema/ant-record-archive.entity'
import { AntResolvedTarget } from './schema/ant-resolved-target.entity'
import { ArnsRecord } from './schema/arns-record.entity'
import { ArnsRecordArchive } from './schema/arns-record-archive.entity'

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      AntRecord,
      AntRecordArchive,
      AntResolvedTarget,
      ArnsRecord,
      ArnsRecordArchive
    ])
  ],
  controllers: [],
  providers: [ ArnsService, AntTargetResolutionService ],
  exports: [ ArnsService, AntTargetResolutionService ]
})
export class ArnsModule {}
