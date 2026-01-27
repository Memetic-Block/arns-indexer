import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { AntRecord } from './schema/ant-record.entity'
import { ArnsRecord } from './schema/arns-record.entity'
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

export interface UnresolvedTarget {
  transactionId: string
  arnsName: string
  undername: string
}

@Injectable()
export class AntTargetResolutionService {
  private readonly logger: Logger = new Logger(AntTargetResolutionService.name)
  private readonly arweaveGateway: string
  private readonly crawlEnabled: boolean
  private readonly resolutionWhitelist: string[] | '*' | null
  private readonly resolutionBlacklist: string[] | '*' | null

  constructor(
    private readonly config: ConfigService<{
      ARNS_CRAWL_GATEWAY: string
      CRAWL_ANTS_ENABLED: string
      TARGET_RESOLUTION_WHITELIST: string
      TARGET_RESOLUTION_BLACKLIST: string
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

    // Parse resolution whitelist/blacklist from env vars
    this.resolutionWhitelist = this.parseFilterList(
      this.config.get<string>('TARGET_RESOLUTION_WHITELIST', '', {
        infer: true
      })
    )
    this.resolutionBlacklist = this.parseFilterList(
      this.config.get<string>('TARGET_RESOLUTION_BLACKLIST', '', {
        infer: true
      })
    )

    this.logger.log(
      `Using Arweave gateway: ${this.arweaveGateway}, crawl enabled: ${this.crawlEnabled}, ` +
        `resolution filters - whitelist: ${this.formatFilterForLog(this.resolutionWhitelist)}, ` +
        `blacklist: ${this.formatFilterForLog(this.resolutionBlacklist)}`
    )
  }

  /**
   * Parse a comma-separated filter list from env var.
   * Returns '*' for wildcard, null for empty/unset, or array of names.
   */
  private parseFilterList(value: string): string[] | '*' | null {
    if (!value || value.trim() === '') {
      return null
    }
    const trimmed = value.trim()
    if (trimmed === '*') {
      return '*'
    }
    return trimmed
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  }

  private formatFilterForLog(filter: string[] | '*' | null): string {
    if (filter === null) return 'none'
    if (filter === '*') return '*'
    return `[${filter.length} names]`
  }

  /**
   * Find all transaction IDs from AntRecord that don't have a resolved target
   * or have a pending status that can be retried
   */
  public async findUnresolvedTargets(
    maxRetries: number,
    limit: number = 100
  ): Promise<UnresolvedTarget[]> {
    // If blacklist is '*', deny all - return empty
    if (this.resolutionBlacklist === '*') {
      this.logger.debug('Resolution blacklist is *, skipping all targets')
      return []
    }

    // Get all unique transaction IDs from AntRecord that need resolution
    const queryBuilder = this.antRecordRepository
      .createQueryBuilder('ant')
      .select('ant.transactionId', 'transactionId')
      .addSelect('ant.name', 'arnsName')
      .addSelect('ant.undername', 'undername')
      .distinct(true)
      .innerJoin(ArnsRecord, 'arns', 'arns.name = ant.name')
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

    // Apply whitelist filter (if set and not '*')
    if (this.resolutionWhitelist !== null && this.resolutionWhitelist !== '*') {
      queryBuilder.andWhere('arns.name IN (:...whitelist)', {
        whitelist: this.resolutionWhitelist
      })
    }

    // Apply blacklist filter (if set)
    if (this.resolutionBlacklist !== null) {
      queryBuilder.andWhere('arns.name NOT IN (:...blacklist)', {
        blacklist: this.resolutionBlacklist
      })
    }

    const result = await queryBuilder.limit(limit).getRawMany()

    return result.map((r) => ({
      transactionId: r.transactionId,
      arnsName: r.arnsName,
      undername: r.undername
    }))
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
        // GraphQL incorrectly decodes '+' as space in URL-encoded strings
        const name = tag.name
        const value = tag.name === 'Content-Type'
          ? tag.value.replace(/ /g, '+')
          : tag.value
        tags[name] = value
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
    target: UnresolvedTarget,
    maxRetries: number
  ): Promise<{
    resolved: boolean
    shouldRetry: boolean
    retryCount: number
  }> {
    const { transactionId, arnsName, undername } = target

    // Get or create the resolved target record
    let resolvedTarget = await this.resolvedTargetRepository.findOne({
      where: { transactionId }
    })

    if (!resolvedTarget) {
      resolvedTarget = this.resolvedTargetRepository.create({
        transactionId,
        arnsName,
        undername,
        status: ResolutionStatus.PENDING,
        retryCount: 0
      })
    } else {
      // Update arnsName and undername if not set (for existing records)
      if (!resolvedTarget.arnsName) {
        resolvedTarget.arnsName = arnsName
      }
      if (!resolvedTarget.undername) {
        resolvedTarget.undername = undername
      }
    }

    // Resolve transaction tags
    const result = await this.resolveTransactionTags(transactionId)

    if (result.status === 'resolved') {
      resolvedTarget.status = ResolutionStatus.RESOLVED
      resolvedTarget.contentType = result.contentType || null
      resolvedTarget.targetCategory = this.categorizeTarget(
        result.contentType || null,
        result.tags || {}
      )
      resolvedTarget.resolvedAt = new Date()

      // Validate manifest if applicable
      if (resolvedTarget.targetCategory === TargetCategory.MANIFEST) {
        resolvedTarget.manifestValidation =
          await this.validateManifest(transactionId)
      }

      // Set crawl status based on content type and crawl feature flag
      resolvedTarget.crawlStatus = this.determineCrawlStatus(resolvedTarget)

      await this.resolvedTargetRepository.save(resolvedTarget)

      this.logger.log(
        `Resolved target ${transactionId}: ` +
          `${resolvedTarget.targetCategory} (${resolvedTarget.contentType}), crawlStatus=${resolvedTarget.crawlStatus}`
      )

      return {
        resolved: true,
        shouldRetry: false,
        retryCount: resolvedTarget.retryCount
      }
    }

    if (result.status === 'not_found') {
      resolvedTarget.retryCount++

      if (resolvedTarget.retryCount >= maxRetries) {
        resolvedTarget.status = ResolutionStatus.NOT_FOUND
        this.logger.warn(
          `Target ${transactionId} marked as not found ` +
            `after ${resolvedTarget.retryCount} attempts`
        )
      } else {
        resolvedTarget.status = ResolutionStatus.PENDING
        this.logger.log(
          `Target ${transactionId} not found, ` +
            `retry ${resolvedTarget.retryCount}/${maxRetries}`
        )
      }

      await this.resolvedTargetRepository.save(resolvedTarget)

      return {
        resolved: false,
        shouldRetry: resolvedTarget.retryCount < maxRetries,
        retryCount: resolvedTarget.retryCount
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
