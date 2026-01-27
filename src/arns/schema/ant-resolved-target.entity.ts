import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index
} from 'typeorm'

export enum TargetCategory {
  MANIFEST = 'manifest',
  AO_PROCESS = 'ao_process',
  TRANSACTION = 'transaction'
}

export enum ResolutionStatus {
  PENDING = 'pending',
  RESOLVED = 'resolved',
  NOT_FOUND = 'not_found'
}

export enum CrawlStatus {
  PENDING = 'pending',
  CRAWLING = 'crawling',
  CRAWLED = 'crawled',
  SKIPPED = 'skipped',
  FAILED = 'failed'
}

export interface ManifestValidation {
  isValid: boolean
  error?: string
  pathCount?: number
  hasIndex?: boolean
  hasFallback?: boolean
}

@Entity()
export class AntResolvedTarget {
  @PrimaryColumn({ type: 'varchar' })
  transactionId: string

  @Column({ type: 'varchar', nullable: true })
  @Index()
  arnsName: string | null

  @Column({ type: 'varchar', nullable: true })
  @Index()
  undername: string | null

  @CreateDateColumn({ type: 'timestamp with time zone' })
  public createdAt: Date

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  public updatedAt: Date

  @Column({
    type: 'enum',
    enum: ResolutionStatus,
    default: ResolutionStatus.PENDING
  })
  status: ResolutionStatus

  @Column({ type: 'varchar', nullable: true })
  contentType: string | null

  @Column({
    type: 'enum',
    enum: TargetCategory,
    nullable: true
  })
  targetCategory: TargetCategory | null

  @Column({ type: 'int', default: 0 })
  retryCount: number

  @Column({ type: 'jsonb', nullable: true })
  manifestValidation: ManifestValidation | null

  @Column({ type: 'timestamp with time zone', nullable: true })
  resolvedAt: Date | null

  @Column({
    type: 'enum',
    enum: CrawlStatus,
    nullable: true
  })
  crawlStatus: CrawlStatus | null

  @Column({ type: 'timestamp with time zone', nullable: true })
  crawledAt: Date | null

  @Column({ type: 'text', nullable: true })
  robotsTxt: string | null

  @Column({ type: 'text', nullable: true })
  sitemapXml: string | null
}
