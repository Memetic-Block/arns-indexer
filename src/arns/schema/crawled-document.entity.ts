import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index
} from 'typeorm'

import { AntResolvedTarget } from './ant-resolved-target.entity'

@Entity()
@Index(['transactionId', 'manifestPath'], { unique: true })
export class CrawledDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'varchar' })
  @Index()
  transactionId: string

  @ManyToOne(() => AntResolvedTarget, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId', referencedColumnName: 'transactionId' })
  resolvedTarget: AntResolvedTarget

  @Column({ type: 'varchar', nullable: true })
  manifestPath: string | null

  @Column({ type: 'varchar' })
  @Index()
  url: string

  @Column({ type: 'varchar', nullable: true })
  title: string | null

  @Column({ type: 'text', nullable: true })
  body: string | null

  @Column({ type: 'text', nullable: true })
  bodyTruncated: boolean

  @Column({ type: 'varchar', nullable: true })
  metaDescription: string | null

  @Column({ type: 'varchar', nullable: true })
  metaKeywords: string | null

  @Column({ type: 'jsonb', nullable: true })
  headings: string[] | null

  @Column({ type: 'jsonb', nullable: true })
  links: string[] | null

  @Column({ type: 'varchar', nullable: true })
  @Index()
  contentHash: string | null

  @Column({ type: 'varchar', nullable: true })
  contentType: string | null

  @Column({ type: 'int', default: 0 })
  depth: number

  @Column({ type: 'int', nullable: true })
  contentLength: number | null

  @CreateDateColumn({ type: 'timestamp with time zone' })
  public createdAt: Date

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  public updatedAt: Date

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastCrawledAt: Date | null
}
