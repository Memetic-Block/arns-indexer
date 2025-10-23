import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique
} from 'typeorm'

export type ArnsRecordType = 'lease' | 'permabuy'

@Entity()
@Unique([ 'name' ])
export class ArnsRecord {
  @PrimaryGeneratedColumn()
  id: number

  @CreateDateColumn({ type: 'timestamp with time zone' })
  public createdAt: Date

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  public updatedAt: Date

  /**
   * ARNS Fields
   */
  @Column()
  name: string

  @Column()
  processId: string

  @Column({ type: 'bigint', nullable: true })
  purchasePrice: number | null

  @Column({ type: 'bigint', nullable: true })
  startTimestamp: number | null

  @Column({ type: 'bigint', nullable: true, default: null })
  endTimestamp: number | null

  @Column({ type: 'enum' , enum: [ 'lease', 'permabuy' ], nullable: true })
  type: ArnsRecordType

  @Column({ type: 'int', nullable: true })
  undernameLimit: number | null
}
