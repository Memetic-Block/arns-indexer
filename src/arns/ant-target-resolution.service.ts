import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { AntRecord } from './schema/ant-record.entity'
import {
  AntResolvedTarget,
  CrawlStatus,
  ManifestValidation,
  ResolutionStatus,
  TargetCategory
} from './schema/ant-resolved-target.entity'
import { PathManifest } from '../util/path-manifest.interface'

export interface TransactionTags {
  [key: string]: string
}

export interface ResolutionResult {
  status: 'resolved' | 'not_found' | 'error'
  contentType?: string
  tags?: TransactionTags
  error?: string
}

@Injectable()
export class AntTargetResolutionService {
  private readonly logger: Logger = new Logger(AntTargetResolutionService.name)
  private readonly arweaveGateway: string
  private readonly crawlEnabled: boolean

  constructor(
    private readonly config: ConfigService<{
      ARNS_CRAWL_GATEWAY: string
      CRAWL_ANTS_ENABLED: string
    }>,
    @InjectRepository(AntResolvedTarget)
    private resolvedTargetRepository: Repository<AntResolvedTarget>,
    @InjectRepository(AntRecord)
    private antRecordRepository: Repository<AntRecord>
  ) {
    this.arweaveGateway = this.config.get<string>(
      'ARNS_CRAWL_GATEWAY',
      'arweave.net',
      { infer: true }
    )
    this.crawlEnabled =
      this.config.get<string>('CRAWL_ANTS_ENABLED', 'false') === 'true'
    this.logger.log(
      `Using Arweave gateway: ${this.arweaveGateway}, crawl enabled: ${this.crawlEnabled}`
    )
  }

  /**
   * Find all transaction IDs from AntRecord that don't have a resolved target
   * or have a pending status that can be retried
   */
  public async findUnresolvedTargets(
    maxRetries: number,
    limit: number = 100
  ): Promise<string[]> {
    // Get all unique transaction IDs from AntRecord that need resolution
    const result = await this.antRecordRepository
      .createQueryBuilder('ant')
      .select('DISTINCT ant.transactionId', 'transactionId')
      .leftJoin(
        AntResolvedTarget,
        'resolved',
        'ant.transactionId = resolved.transactionId'
      )
      .where(
        `(
          resolved.transactionId IS NULL
          OR (
            resolved.status = :pendingStatus 
            AND resolved.retryCount < :maxRetries
          )
        )`,
        {
          pendingStatus: ResolutionStatus.PENDING,
          maxRetries
        }
      )
      .limit(limit)
      .getRawMany()

    return result.map((r) => r.transactionId)
  }

  /**
   * Fetch transaction tags from Arweave GraphQL
   */
  public async resolveTransactionTags(
    transactionId: string
  ): Promise<ResolutionResult> {
    const graphqlUrl = `https://${this.arweaveGateway}/graphql`

    const query = `
      query GetTransactionTags($id: ID!) {
        transaction(id: $id) {
          tags {
            name
            value
          }
        }
      }
    `

    try {
      const response = await fetch(graphqlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { id: transactionId }
        })
      })

      if (!response.ok) {
        if (response.status === 404) {
          return { status: 'not_found' }
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.errors) {
        this.logger.warn(
          `GraphQL errors for ${transactionId}: ` +
            `${JSON.stringify(data.errors)}`
        )
      }

      if (!data.data?.transaction) {
        return { status: 'not_found' }
      }

      const tags: TransactionTags = {}
      for (const tag of data.data.transaction.tags || []) {
        tags[tag.name] = tag.value
      }

      return {
        status: 'resolved',
        contentType: tags['Content-Type'] || undefined,
        tags
      }
    } catch (error) {
      this.logger.error(
        `Failed to resolve tags for ${transactionId}: ${error.message}`
      )
      return {
        status: 'error',
        error: error.message
      }
    }
  }

  /**
   * Categorize a target based on its tags
   */
  public categorizeTarget(
    contentType: string | null,
    tags: TransactionTags
  ): TargetCategory {
    // Check for Arweave manifest
    if (contentType === 'application/x.arweave-manifest+json') {
      return TargetCategory.MANIFEST
    }

    // Check for AO process - look for Data-Protocol and Type tags
    if (tags['Data-Protocol'] === 'ao' && tags['Type'] === 'Process') {
      return TargetCategory.AO_PROCESS
    }

    // Default to transaction
    return TargetCategory.TRANSACTION
  }

  /**
   * Fetch and validate an Arweave manifest
   */
  public async validateManifest(
    transactionId: string
  ): Promise<ManifestValidation> {
    const manifestUrl = `https://${this.arweaveGateway}/raw/${transactionId}`

    try {
      const response = await fetch(manifestUrl)

      if (!response.ok) {
        return {
          isValid: false,
          error: `Failed to fetch manifest: HTTP ${response.status}`
        }
      }

      const manifest: PathManifest = await response.json()

      // Validate manifest structure
      if (manifest.manifest !== 'arweave/paths') {
        return {
          isValid: false,
          error: `Invalid manifest type: ${manifest.manifest}`
        }
      }

      if (manifest.version !== '0.2.0') {
        return {
          isValid: false,
          error: `Unsupported manifest version: ${manifest.version}`
        }
      }

      const pathCount = Object.keys(manifest.paths || {}).length
      const hasIndex = !!manifest.index?.path
      const hasFallback = !!manifest.fallback?.id

      return {
        isValid: true,
        pathCount,
        hasIndex,
        hasFallback
      }
    } catch (error) {
      return {
        isValid: false,
        error: `Failed to parse manifest: ${error.message}`
      }
    }
  }

  /**
   * Process a single target transaction ID
   */
  public async processTarget(
    transactionId: string,
    maxRetries: number
  ): Promise<{
    resolved: boolean
    shouldRetry: boolean
    retryCount: number
  }> {
    // Get or create the resolved target record
    let target = await this.resolvedTargetRepository.findOne({
      where: { transactionId }
    })

    if (!target) {
      target = this.resolvedTargetRepository.create({
        transactionId,
        status: ResolutionStatus.PENDING,
        retryCount: 0
      })
    }

    // Resolve transaction tags
    const result = await this.resolveTransactionTags(transactionId)

    if (result.status === 'resolved') {
      target.status = ResolutionStatus.RESOLVED
      target.contentType = result.contentType || null
      target.targetCategory = this.categorizeTarget(
        result.contentType || null,
        result.tags || {}
      )
      target.resolvedAt = new Date()

      // Validate manifest if applicable
      if (target.targetCategory === TargetCategory.MANIFEST) {
        target.manifestValidation = await this.validateManifest(transactionId)
      }

      // Set crawl status based on content type and crawl feature flag
      target.crawlStatus = this.determineCrawlStatus(target)

      await this.resolvedTargetRepository.save(target)

      this.logger.log(
        `Resolved target ${transactionId}: ` +
          `${target.targetCategory} (${target.contentType}), crawlStatus=${target.crawlStatus}`
      )

      return {
        resolved: true,
        shouldRetry: false,
        retryCount: target.retryCount
      }
    }

    if (result.status === 'not_found') {
      target.retryCount++

      if (target.retryCount >= maxRetries) {
        target.status = ResolutionStatus.NOT_FOUND
        this.logger.warn(
          `Target ${transactionId} marked as not found ` +
            `after ${target.retryCount} attempts`
        )
      } else {
        target.status = ResolutionStatus.PENDING
        this.logger.log(
          `Target ${transactionId} not found, ` +
            `retry ${target.retryCount}/${maxRetries}`
        )
      }

      await this.resolvedTargetRepository.save(target)

      return {
        resolved: false,
        shouldRetry: target.retryCount < maxRetries,
        retryCount: target.retryCount
      }
    }

    // Error case - don't increment retry count for network errors
    // Let BullMQ handle immediate retries
    this.logger.error(
      `Error resolving target ${transactionId}: ${result.error}`
    )
    throw new Error(result.error)
  }

  /**
   * Get resolution statistics
   */
  public async getStats(): Promise<{
    total: number
    resolved: number
    pending: number
    notFound: number
    byCategory: Record<string, number>
  }> {
    const [total, resolved, pending, notFound] = await Promise.all([
      this.resolvedTargetRepository.count(),
      this.resolvedTargetRepository.count({
        where: { status: ResolutionStatus.RESOLVED }
      }),
      this.resolvedTargetRepository.count({
        where: { status: ResolutionStatus.PENDING }
      }),
      this.resolvedTargetRepository.count({
        where: { status: ResolutionStatus.NOT_FOUND }
      })
    ])

    const categoryResults = await this.resolvedTargetRepository
      .createQueryBuilder('target')
      .select('target.targetCategory', 'category')
      .addSelect('COUNT(*)', 'count')
      .where('target.targetCategory IS NOT NULL')
      .groupBy('target.targetCategory')
      .getRawMany()

    const byCategory: Record<string, number> = {}
    for (const row of categoryResults) {
      byCategory[row.category] = parseInt(row.count, 10)
    }

    return { total, resolved, pending, notFound, byCategory }
  }

  /**
   * Determine if a resolved target should be queued for crawling
   */
  private determineCrawlStatus(target: AntResolvedTarget): CrawlStatus | null {
    // If crawling is disabled, skip
    if (!this.crawlEnabled) {
      return CrawlStatus.SKIPPED
    }

    const { contentType, targetCategory, manifestValidation } = target

    // Crawl valid manifests with an index
    if (
      targetCategory === TargetCategory.MANIFEST &&
      manifestValidation?.isValid &&
      manifestValidation?.hasIndex
    ) {
      return CrawlStatus.PENDING
    }

    // Crawl text/html content
    if (this.isCrawlableContentType(contentType)) {
      return CrawlStatus.PENDING
    }

    // Skip non-crawlable content
    return CrawlStatus.SKIPPED
  }

  /**
   * Check if a content type should be crawled
   */
  private isCrawlableContentType(contentType: string | null): boolean {
    if (!contentType) {
      return false
    }

    const normalizedType = contentType.toLowerCase().split(';')[0].trim()

    return (
      normalizedType === 'text/html' ||
      normalizedType === 'text/plain' ||
      normalizedType.startsWith('text/') ||
      normalizedType === 'application/xhtml+xml'
    )
  }
}
