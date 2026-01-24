import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Inject, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Job, Queue } from 'bullmq'
import { InjectQueue } from '@nestjs/bullmq'

import {
  ContentCrawlerService,
  RobotsTxtRules
} from '../../arns/content-crawler.service'
import {
  AntResolvedTarget,
  CrawlStatus,
  TargetCategory
} from '../../arns/schema/ant-resolved-target.entity'
import { AntRecord } from '../../arns/schema/ant-record.entity'
import { ArnsRecord } from '../../arns/schema/arns-record.entity'
import { CrawledDocument } from '../../arns/schema/crawled-document.entity'
import { PathManifest } from '../../util/path-manifest.interface'

export interface CrawlJobData {
  transactionId: string
  manifestPath?: string
  depth?: number
  parentUrl?: string
}

interface ManifestCrawlContext {
  manifest: PathManifest
  robotsTxtRules: RobotsTxtRules | null
  baseUrl: string
  visitedPaths: Set<string>
}

@Processor('ant-crawl-queue')
export class CrawlQueue extends WorkerHost {
  public static readonly JOB_CRAWL_ANT_TARGETS = 'crawl-ant-targets'
  public static readonly JOB_CRAWL_MANIFEST_PATH = 'crawl-manifest-path'

  private readonly logger = new Logger(CrawlQueue.name)
  private readonly crawlEnabled: boolean
  private readonly arweaveGateway: string
  private readonly batchSize: number
  private readonly concurrency: number
  private readonly crawlWhitelist: string[] | '*' | null
  private readonly crawlBlacklist: string[] | '*' | null

  constructor(
    private readonly config: ConfigService<{
      CRAWL_ANTS_ENABLED: string
      ARNS_CRAWL_GATEWAY: string
      CRAWL_BATCH_SIZE: string
      CRAWL_CONCURRENCY: string
      CRAWL_WHITELIST: string
      CRAWL_BLACKLIST: string
    }>,
    @InjectQueue('ant-crawl-queue')
    private readonly crawlQueue: Queue,
    @Inject()
    private readonly contentCrawlerService: ContentCrawlerService,
    @InjectRepository(AntResolvedTarget)
    private resolvedTargetRepository: Repository<AntResolvedTarget>,
    @InjectRepository(CrawledDocument)
    private crawledDocumentRepository: Repository<CrawledDocument>
  ) {
    super()

    this.crawlEnabled =
      this.config.get<string>('CRAWL_ANTS_ENABLED', 'false') === 'true'
    this.arweaveGateway = this.config.get<string>(
      'ARNS_CRAWL_GATEWAY',
      'arweave.net'
    )
    this.batchSize = this.parseIntConfig('CRAWL_BATCH_SIZE', 50)
    this.concurrency = this.parseIntConfig('CRAWL_CONCURRENCY', 2)

    // Parse crawl whitelist/blacklist from env vars
    this.crawlWhitelist = this.parseFilterList(
      this.config.get<string>('CRAWL_WHITELIST', '')
    )
    this.crawlBlacklist = this.parseFilterList(
      this.config.get<string>('CRAWL_BLACKLIST', '')
    )

    this.logger.log(
      `Crawl queue configured: enabled=${this.crawlEnabled}, ` +
        `gateway=${this.arweaveGateway}, batchSize=${this.batchSize}, ` +
        `concurrency=${this.concurrency}, ` +
        `filters - whitelist: ${this.formatFilterForLog(this.crawlWhitelist)}, ` +
        `blacklist: ${this.formatFilterForLog(this.crawlBlacklist)}`
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

  private parseIntConfig(key: string, defaultValue: number): number {
    const value = this.config.get<string>(key as any) ?? defaultValue.toString()
    const parsed = parseInt(value, 10)
    if (isNaN(parsed) || parsed < 1) {
      return defaultValue
    }
    return parsed
  }

  async process(job: Job<CrawlJobData, any, string>): Promise<any> {
    if (!this.crawlEnabled) {
      this.logger.debug(
        `Crawling disabled, skipping job ${job.name} [${job.id}]`
      )
      return
    }

    this.logger.debug(`Processing ${job.name} [${job.id}]`)

    switch (job.name) {
      case CrawlQueue.JOB_CRAWL_ANT_TARGETS:
        await this.processCrawlTargets()
        break

      case CrawlQueue.JOB_CRAWL_MANIFEST_PATH:
        await this.processCrawlManifestPath(job.data)
        break

      default:
        this.logger.warn(`Unknown job type: ${job.name} [${job.id}]`)
    }
  }

  /**
   * Process batch of targets that need crawling
   */
  private async processCrawlTargets(): Promise<void> {
    this.logger.log('Starting batch content crawl')

    // If blacklist is '*', deny all - skip processing
    if (this.crawlBlacklist === '*') {
      this.logger.log('Crawl blacklist is *, skipping all targets')
      return
    }

    let totalCrawled = 0
    let totalSkipped = 0
    let totalFailed = 0
    let batchNumber = 0

    while (true) {
      batchNumber++

      // Find targets with pending crawl status, filtered by ARNS name
      const pendingTargets = await this.findPendingCrawlTargets()

      if (pendingTargets.length === 0) {
        this.logger.log(
          `No more pending crawl targets after ${batchNumber - 1} batches`
        )
        break
      }

      this.logger.log(
        `Batch ${batchNumber}: Processing ${pendingTargets.length} targets`
      )

      // Process targets in parallel chunks
      const chunks = this.chunkArray(pendingTargets, this.concurrency)

      for (const chunk of chunks) {
        const results = await Promise.allSettled(
          chunk.map((target) => this.crawlTarget(target))
        )

        for (let i = 0; i < results.length; i++) {
          const result = results[i]
          const target = chunk[i]

          if (result.status === 'fulfilled') {
            if (result.value === 'crawled') {
              totalCrawled++
            } else if (result.value === 'skipped') {
              totalSkipped++
            } else {
              totalFailed++
            }
          } else {
            totalFailed++
            this.logger.error(
              `Error crawling target ${target.transactionId}: ${result.reason?.message}`,
              result.reason?.stack
            )
          }
        }
      }

      this.logger.log(
        `Batch ${batchNumber} complete: crawled=${totalCrawled}, ` +
          `skipped=${totalSkipped}, failed=${totalFailed}`
      )
    }

    this.logger.log(
      `[alarm=crawl-complete] Crawl complete after ${batchNumber} batches: ` +
        `crawled=${totalCrawled}, skipped=${totalSkipped}, failed=${totalFailed}`
    )
  }

  /**
   * Find pending crawl targets filtered by ARNS name whitelist/blacklist
   */
  private async findPendingCrawlTargets(): Promise<AntResolvedTarget[]> {
    const queryBuilder = this.resolvedTargetRepository
      .createQueryBuilder('art')
      .innerJoin(AntRecord, 'ant', 'ant.transactionId = art.transactionId')
      .innerJoin(ArnsRecord, 'arns', 'arns.name = ant.name')
      .where('art.crawlStatus = :status', { status: CrawlStatus.PENDING })

    // Apply whitelist filter (if set and not '*')
    if (this.crawlWhitelist !== null && this.crawlWhitelist !== '*') {
      queryBuilder.andWhere('arns.name IN (:...whitelist)', {
        whitelist: this.crawlWhitelist
      })
    }

    // Apply blacklist filter (if set)
    if (this.crawlBlacklist !== null) {
      queryBuilder.andWhere('arns.name NOT IN (:...blacklist)', {
        blacklist: this.crawlBlacklist
      })
    }

    return queryBuilder.take(this.batchSize).getMany()
  }

  /**
   * Crawl a single resolved target
   */
  private async crawlTarget(
    target: AntResolvedTarget
  ): Promise<'crawled' | 'skipped' | 'failed'> {
    const { transactionId, contentType, targetCategory, manifestValidation } =
      target

    try {
      // Update status to crawling
      await this.resolvedTargetRepository.update(
        { transactionId },
        { crawlStatus: CrawlStatus.CRAWLING }
      )

      // Handle manifest targets with index
      if (
        targetCategory === TargetCategory.MANIFEST &&
        manifestValidation?.isValid &&
        manifestValidation?.hasIndex
      ) {
        await this.crawlManifest(target)
        return 'crawled'
      }

      // Handle text/html targets
      if (this.contentCrawlerService.isCrawlableContentType(contentType)) {
        await this.crawlSimpleTarget(target)
        return 'crawled'
      }

      // Skip non-crawlable targets
      await this.resolvedTargetRepository.update(
        { transactionId },
        { crawlStatus: CrawlStatus.SKIPPED }
      )
      return 'skipped'
    } catch (error) {
      this.logger.error(
        `Failed to crawl target ${transactionId}: ${error.message}`,
        error.stack
      )

      await this.resolvedTargetRepository.update(
        { transactionId },
        { crawlStatus: CrawlStatus.FAILED }
      )
      return 'failed'
    }
  }

  /**
   * Crawl a simple (non-manifest) target
   */
  private async crawlSimpleTarget(target: AntResolvedTarget): Promise<void> {
    const { transactionId, contentType } = target
    const contentUrl = `https://${this.arweaveGateway}/raw/${transactionId}`

    const response = await fetch(contentUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch content: HTTP ${response.status}`)
    }

    const content = await response.text()
    const url = `https://${this.arweaveGateway}/${transactionId}`

    let parsed
    if (this.contentCrawlerService.isHtmlContentType(contentType)) {
      parsed = this.contentCrawlerService.parseHtml(content, url)
    } else {
      parsed = this.contentCrawlerService.parseText(content)
    }

    // Save crawled document
    await this.saveCrawledDocument({
      transactionId,
      manifestPath: null,
      url,
      contentType,
      depth: 0,
      ...parsed
    })

    // Update target status
    await this.resolvedTargetRepository.update(
      { transactionId },
      {
        crawlStatus: CrawlStatus.CRAWLED,
        crawledAt: new Date()
      }
    )
  }

  /**
   * Crawl a manifest target
   */
  private async crawlManifest(target: AntResolvedTarget): Promise<void> {
    const { transactionId } = target
    const manifestUrl = `https://${this.arweaveGateway}/raw/${transactionId}`

    // Fetch manifest
    const manifestResponse = await fetch(manifestUrl)
    if (!manifestResponse.ok) {
      throw new Error(
        `Failed to fetch manifest: HTTP ${manifestResponse.status}`
      )
    }
    const manifest: PathManifest = await manifestResponse.json()

    const baseUrl = `https://${this.arweaveGateway}/${transactionId}`
    const config = this.contentCrawlerService.getConfig()

    // Initialize crawl context
    const context: ManifestCrawlContext = {
      manifest,
      robotsTxtRules: null,
      baseUrl,
      visitedPaths: new Set<string>()
    }

    // Try to fetch and parse robots.txt
    let robotsTxt: string | null = null
    if (manifest.paths['robots.txt']) {
      try {
        const robotsUrl = `${baseUrl}/robots.txt`
        const robotsResponse = await fetch(robotsUrl)
        if (robotsResponse.ok) {
          robotsTxt = await robotsResponse.text()
          const validation =
            this.contentCrawlerService.parseRobotsTxt(robotsTxt)
          if (validation.isValid && validation.rules) {
            context.robotsTxtRules = validation.rules

            // Also save robots.txt as a crawled document
            const robotsParsed = this.contentCrawlerService.parseText(robotsTxt)
            await this.saveCrawledDocument({
              transactionId,
              manifestPath: 'robots.txt',
              url: robotsUrl,
              contentType: 'text/plain',
              depth: 0,
              ...robotsParsed
            })
          }
        }
      } catch (error) {
        this.logger.warn(
          `Failed to fetch robots.txt for ${transactionId}: ${error.message}`
        )
      }
    }

    // Try to fetch and parse sitemap.xml
    let sitemapXml: string | null = null
    const sitemapPaths = ['sitemap.xml']

    // Add sitemap URLs from robots.txt
    if (context.robotsTxtRules?.sitemapUrls) {
      for (const sitemapUrl of context.robotsTxtRules.sitemapUrls) {
        const path = this.contentCrawlerService.normalizeLink(
          sitemapUrl,
          baseUrl
        )
        if (path && !sitemapPaths.includes(path.replace(/^\//, ''))) {
          sitemapPaths.push(path.replace(/^\//, ''))
        }
      }
    }

    for (const sitemapPath of sitemapPaths) {
      if (manifest.paths[sitemapPath]) {
        try {
          const sitemapUrl = `${baseUrl}/${sitemapPath}`
          const sitemapResponse = await fetch(sitemapUrl)
          if (sitemapResponse.ok) {
            sitemapXml = await sitemapResponse.text()
            const validation =
              this.contentCrawlerService.parseSitemapXml(sitemapXml)

            // Save sitemap.xml as a crawled document
            const sitemapParsed =
              this.contentCrawlerService.parseText(sitemapXml)
            await this.saveCrawledDocument({
              transactionId,
              manifestPath: sitemapPath,
              url: sitemapUrl,
              contentType: 'application/xml',
              depth: 0,
              ...sitemapParsed
            })

            // Queue sitemap entries for crawling
            if (validation.isValid) {
              const manifestPaths =
                this.contentCrawlerService.extractManifestPaths(
                  validation.entries,
                  baseUrl
                )
              for (const path of manifestPaths) {
                const normalizedPath = path.replace(/^\//, '')
                if (
                  manifest.paths[normalizedPath] &&
                  !context.visitedPaths.has(normalizedPath)
                ) {
                  context.visitedPaths.add(normalizedPath)
                  await this.queueManifestPathCrawl(
                    transactionId,
                    normalizedPath,
                    1
                  )
                }
              }
            }
            break
          }
        } catch (error) {
          this.logger.warn(
            `Failed to fetch ${sitemapPath} for ${transactionId}: ${error.message}`
          )
        }
      }
    }

    // Update target with robots.txt and sitemap.xml content
    await this.resolvedTargetRepository.update(
      { transactionId },
      { robotsTxt, sitemapXml }
    )

    // Crawl the index page
    if (manifest.index?.path) {
      const indexPath = manifest.index.path
      context.visitedPaths.add(indexPath)

      await this.crawlManifestPath(
        transactionId,
        manifest,
        indexPath,
        0,
        context,
        config.maxDepth
      )
    }

    // Update target status
    await this.resolvedTargetRepository.update(
      { transactionId },
      {
        crawlStatus: CrawlStatus.CRAWLED,
        crawledAt: new Date()
      }
    )
  }

  /**
   * Crawl a specific path within a manifest
   */
  private async crawlManifestPath(
    transactionId: string,
    manifest: PathManifest,
    manifestPath: string,
    depth: number,
    context: ManifestCrawlContext,
    maxDepth: number
  ): Promise<void> {
    // Check depth limit
    if (depth > maxDepth) {
      this.logger.debug(
        `Skipping ${manifestPath} for ${transactionId}: max depth reached`
      )
      return
    }

    // Check robots.txt rules
    if (
      context.robotsTxtRules &&
      !this.contentCrawlerService.isPathAllowed(
        `/${manifestPath}`,
        context.robotsTxtRules
      )
    ) {
      this.logger.debug(
        `Skipping ${manifestPath} for ${transactionId}: blocked by robots.txt`
      )
      return
    }

    // Check if path exists in manifest
    if (!manifest.paths[manifestPath]) {
      this.logger.debug(
        `Skipping ${manifestPath} for ${transactionId}: not in manifest`
      )
      return
    }

    const pathUrl = `${context.baseUrl}/${manifestPath}`

    try {
      const response = await fetch(pathUrl)
      if (!response.ok) {
        this.logger.warn(
          `Failed to fetch ${manifestPath} for ${transactionId}: HTTP ${response.status}`
        )
        return
      }

      const contentType = response.headers.get('content-type')
      const content = await response.text()

      // Skip non-crawlable content types
      if (!this.contentCrawlerService.isCrawlableContentType(contentType)) {
        return
      }

      let parsed
      if (this.contentCrawlerService.isHtmlContentType(contentType)) {
        parsed = this.contentCrawlerService.parseHtml(content, pathUrl)

        // Follow links within the manifest (if not at max depth)
        if (depth < maxDepth) {
          for (const link of parsed.links) {
            const normalizedPath = link.replace(/^\//, '').split('?')[0]

            // Only follow links that exist in the manifest
            if (
              manifest.paths[normalizedPath] &&
              !context.visitedPaths.has(normalizedPath)
            ) {
              context.visitedPaths.add(normalizedPath)

              // Recursively crawl or queue the path
              await this.crawlManifestPath(
                transactionId,
                manifest,
                normalizedPath,
                depth + 1,
                context,
                maxDepth
              )
            }
          }
        }
      } else {
        parsed = this.contentCrawlerService.parseText(content)
      }

      // Save crawled document
      await this.saveCrawledDocument({
        transactionId,
        manifestPath,
        url: pathUrl,
        contentType,
        depth,
        ...parsed
      })
    } catch (error) {
      this.logger.error(
        `Error crawling ${manifestPath} for ${transactionId}: ${error.message}`
      )
    }
  }

  /**
   * Process a queued manifest path crawl job
   */
  private async processCrawlManifestPath(data: CrawlJobData): Promise<void> {
    const { transactionId, manifestPath, depth = 0 } = data

    if (!manifestPath) {
      this.logger.warn(`Missing manifestPath in crawl job data`)
      return
    }

    // Fetch the target and manifest
    const target = await this.resolvedTargetRepository.findOne({
      where: { transactionId }
    })

    if (!target) {
      this.logger.warn(
        `Target ${transactionId} not found for manifest path crawl`
      )
      return
    }

    const manifestUrl = `https://${this.arweaveGateway}/raw/${transactionId}`
    const manifestResponse = await fetch(manifestUrl)
    if (!manifestResponse.ok) {
      throw new Error(
        `Failed to fetch manifest: HTTP ${manifestResponse.status}`
      )
    }
    const manifest: PathManifest = await manifestResponse.json()

    const baseUrl = `https://${this.arweaveGateway}/${transactionId}`
    const config = this.contentCrawlerService.getConfig()

    // Parse robots.txt rules if available
    let robotsTxtRules: RobotsTxtRules | null = null
    if (target.robotsTxt) {
      const validation = this.contentCrawlerService.parseRobotsTxt(
        target.robotsTxt
      )
      if (validation.isValid && validation.rules) {
        robotsTxtRules = validation.rules
      }
    }

    const context: ManifestCrawlContext = {
      manifest,
      robotsTxtRules,
      baseUrl,
      visitedPaths: new Set<string>([manifestPath])
    }

    await this.crawlManifestPath(
      transactionId,
      manifest,
      manifestPath,
      depth,
      context,
      config.maxDepth
    )
  }

  /**
   * Queue a manifest path for crawling
   */
  private async queueManifestPathCrawl(
    transactionId: string,
    manifestPath: string,
    depth: number
  ): Promise<void> {
    await this.crawlQueue.add(
      CrawlQueue.JOB_CRAWL_MANIFEST_PATH,
      { transactionId, manifestPath, depth },
      {
        removeOnComplete: true,
        removeOnFail: 8,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        }
      }
    )
  }

  /**
   * Save or update a crawled document
   */
  private async saveCrawledDocument(data: {
    transactionId: string
    manifestPath: string | null
    url: string
    contentType: string | null
    depth: number
    title: string | null
    body: string | null
    bodyTruncated: boolean
    metaDescription: string | null
    metaKeywords: string | null
    headings: string[]
    links: string[]
    contentHash: string
    contentLength: number
  }): Promise<void> {
    const existing = await this.crawledDocumentRepository.findOne({
      where: {
        transactionId: data.transactionId,
        manifestPath: data.manifestPath ?? ''
      }
    })

    if (existing) {
      await this.crawledDocumentRepository.update(
        { id: existing.id },
        {
          url: data.url,
          title: data.title,
          body: data.body,
          bodyTruncated: data.bodyTruncated,
          metaDescription: data.metaDescription,
          metaKeywords: data.metaKeywords,
          headings: data.headings,
          links: data.links,
          contentHash: data.contentHash,
          contentType: data.contentType,
          contentLength: data.contentLength,
          lastCrawledAt: new Date()
        }
      )
    } else {
      await this.crawledDocumentRepository.save({
        transactionId: data.transactionId,
        manifestPath: data.manifestPath,
        url: data.url,
        title: data.title,
        body: data.body,
        bodyTruncated: data.bodyTruncated,
        metaDescription: data.metaDescription,
        metaKeywords: data.metaKeywords,
        headings: data.headings,
        links: data.links,
        contentHash: data.contentHash,
        contentType: data.contentType,
        depth: data.depth,
        contentLength: data.contentLength,
        lastCrawledAt: new Date()
      })
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<any, any, string>) {
    this.logger.debug(`Completed ${job.name} [${job.id}]`)
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<any, any, string>) {
    this.logger.error(
      `[alarm=failed-job-${job.name}] Failed ${job.name} [${job.id}]: ` +
        `${job.failedReason}`
    )
  }
}
