import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn
} from 'typeorm'

import { ArnsRecordType } from './arns-record.entity'

@Entity({ name: 'arns_record_archive' })
export class ArnsRecordArchive {
  @PrimaryGeneratedColumn()
  id: number

  @CreateDateColumn({ type: 'timestamp with time zone' })
  archivedAt: Date

  @Column({ type: 'varchar', nullable: true })
  archiveReason: string | null

  @Column()
  originalId: number

  @Column({ type: 'timestamp with time zone' })
  originalCreatedAt: Date

  @Column({ type: 'timestamp with time zone' })
  originalUpdatedAt: Date

  @Column()
  name: string

  @Column()
  processId: string

  @Column({ type: 'bigint', nullable: true })
  purchasePrice: number | null

  @Column({ type: 'bigint', nullable: true })
  startTimestamp: number | null

  @Column({ type: 'bigint', nullable: true })
  endTimestamp: number | null

  @Column({ type: 'enum', enum: ['lease', 'permabuy'], nullable: true })
  type: ArnsRecordType

  @Column({ type: 'int', nullable: true })
  undernameLimit: number | null
}
