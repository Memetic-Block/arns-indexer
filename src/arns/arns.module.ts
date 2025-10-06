import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'

import { ArnsService } from './arns.service'
import { ArnsRecord } from './schema/arns-record.entity'

@Module({
  imports: [ ConfigModule, TypeOrmModule.forFeature([ ArnsRecord ]) ],
  controllers: [],
  providers: [ ArnsService ],
  exports: [ ArnsService ]
})
export class ArnsModule {}
