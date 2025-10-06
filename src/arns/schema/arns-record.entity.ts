import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique
} from 'typeorm'

@Entity()
@Unique([ 'name', 'undername' ])
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

  @Column({ type: 'bigint', nullable: true })
  endTimestamp: number | null

  @Column({ type: 'varchar', nullable: true })
  type: string | null // 'lease' or 'permabuy'

  @Column({ type: 'int', nullable: true })
  undernameLimit: number | null

  /**
   * ANT Fields
   */
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
}
