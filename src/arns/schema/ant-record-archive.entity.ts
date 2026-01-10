import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn
} from 'typeorm'

@Entity({ name: 'ant_record_archive' })
export class AntRecordArchive {
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

  @Column()
  undername: string

  @Column()
  transactionId: string

  @Column({ type: 'int' })
  ttlSeconds: number

  @Column({ type: 'varchar', nullable: true })
  description: string | null

  @Column({ type: 'int', nullable: true })
  priority: number | null

  @Column({ type: 'varchar', nullable: true })
  owner: string | null

  @Column({ type: 'varchar', nullable: true })
  displayName: string | null

  @Column({ type: 'varchar', nullable: true })
  logo: string | null

  @Column({ type: 'varchar', array: true, default: [], nullable: true })
  keywords: string[]

  @Column({ type: 'varchar', array: true, default: [], nullable: true })
  controllers: string[]
}
