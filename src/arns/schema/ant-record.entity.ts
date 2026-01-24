import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique
} from 'typeorm'

@Entity()
@Unique(['name', 'undername'])
export class AntRecord {
  @PrimaryGeneratedColumn()
  id: number

  @CreateDateColumn({ type: 'timestamp with time zone' })
  public createdAt: Date

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  public updatedAt: Date

  /**
   * ArNS Fields
   */
  @Column()
  name: string

  @Column()
  processId: string

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

  @Column({ type: 'varchar', array: true, default: [], nullable: true })
  controllers: string[]
}
