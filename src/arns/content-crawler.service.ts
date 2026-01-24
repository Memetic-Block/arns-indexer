import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as cheerio from 'cheerio'
import * as crypto from 'crypto'

export interface CrawlConfig {
  maxDepth: number
  maxBodySize: number
  maxTitleSize: number
  maxHeadingsCount: number
  maxLinksCount: number
}

export interface ParsedDocument {
  title: string | null
  body: string | null
  bodyTruncated: boolean
  metaDescription: string | null
  metaKeywords: string | null
  headings: string[]
  links: string[]
  contentHash: string
  contentLength: number
}

export interface RobotsTxtRules {
  allowedPaths: string[]
  disallowedPaths: string[]
  sitemapUrls: string[]
  crawlDelay?: number
}

export interface SitemapEntry {
  loc: string
  lastmod?: string
  changefreq?: string
  priority?: number
}

export interface SitemapValidation {
  isValid: boolean
  entries: SitemapEntry[]
  error?: string
}

export interface RobotsTxtValidation {
  isValid: boolean
  rules: RobotsTxtRules | null
  error?: string
}

@Injectable()
export class ContentCrawlerService {
  private readonly logger: Logger = new Logger(ContentCrawlerService.name)
  private readonly config: CrawlConfig

  constructor(
    private readonly configService: ConfigService<{
      CRAWL_MAX_DEPTH: string
      CRAWL_MAX_BODY_SIZE: string
      CRAWL_MAX_TITLE_SIZE: string
      CRAWL_MAX_HEADINGS_COUNT: string
      CRAWL_MAX_LINKS_COUNT: string
    }>
  ) {
    this.config = {
      maxDepth: this.parseIntConfig('CRAWL_MAX_DEPTH', 10),
      maxBodySize: this.parseIntConfig('CRAWL_MAX_BODY_SIZE', 5242880), // 5MB
      maxTitleSize: this.parseIntConfig('CRAWL_MAX_TITLE_SIZE', 1024),
      maxHeadingsCount: this.parseIntConfig('CRAWL_MAX_HEADINGS_COUNT', 25),
      maxLinksCount: this.parseIntConfig('CRAWL_MAX_LINKS_COUNT', 25)
    }

    this.logger.log(
      `Content crawler configured: maxDepth=${this.config.maxDepth}, ` +
        `maxBodySize=${this.config.maxBodySize}, maxTitleSize=${this.config.maxTitleSize}, ` +
        `maxHeadingsCount=${this.config.maxHeadingsCount}, maxLinksCount=${this.config.maxLinksCount}`
    )
  }

  private parseIntConfig(key: string, defaultValue: number): number {
    const value =
      this.configService.get<string>(key as any) ?? defaultValue.toString()
    const parsed = parseInt(value, 10)
    if (isNaN(parsed) || parsed < 0) {
      this.logger.warn(
        `Invalid ${key} value: ${value}, using default: ${defaultValue}`
      )
      return defaultValue
    }
    return parsed
  }

  public getConfig(): CrawlConfig {
    return { ...this.config }
  }

  /**
   * Parse HTML content and extract document fields
   */
  public parseHtml(html: string, baseUrl: string): ParsedDocument {
    const $ = cheerio.load(html)

    // Remove script and style elements
    $('script, style, noscript, iframe, svg').remove()

    // Extract title
    let title = $('title').first().text().trim() || null
    if (title && title.length > this.config.maxTitleSize) {
      title = title.substring(0, this.config.maxTitleSize)
    }

    // Extract meta description
    const metaDescription =
      $('meta[name="description"]').attr('content')?.trim() || null

    // Extract meta keywords
    const metaKeywords =
      $('meta[name="keywords"]').attr('content')?.trim() || null

    // Extract headings (h1-h6)
    const headings: string[] = []
    $('h1, h2, h3, h4, h5, h6').each((_, el) => {
      if (headings.length < this.config.maxHeadingsCount) {
        const text = $(el).text().trim()
        if (text) {
          headings.push(text)
        }
      }
    })

    // Extract links (only within same manifest/domain)
    const links: string[] = []
    $('a[href]').each((_, el) => {
      if (links.length < this.config.maxLinksCount) {
        const href = $(el).attr('href')
        if (href) {
          const normalizedLink = this.normalizeLink(href, baseUrl)
          if (normalizedLink && !links.includes(normalizedLink)) {
            links.push(normalizedLink)
          }
        }
      }
    })

    // Extract body text
    let body = $('body').text().replace(/\s+/g, ' ').trim()

    let bodyTruncated = false
    if (body.length > this.config.maxBodySize) {
      body = body.substring(0, this.config.maxBodySize)
      bodyTruncated = true
    }

    // Calculate content hash for deduplication
    const contentHash = this.hashContent(body)

    return {
      title,
      body: body || null,
      bodyTruncated,
      metaDescription,
      metaKeywords,
      headings,
      links,
      contentHash,
      contentLength: html.length
    }
  }

  /**
   * Parse plain text content
   */
  public parseText(text: string): ParsedDocument {
    let body = text.trim()
    let bodyTruncated = false

    if (body.length > this.config.maxBodySize) {
      body = body.substring(0, this.config.maxBodySize)
      bodyTruncated = true
    }

    const contentHash = this.hashContent(body)

    return {
      title: null,
      body: body || null,
      bodyTruncated,
      metaDescription: null,
      metaKeywords: null,
      headings: [],
      links: [],
      contentHash,
      contentLength: text.length
    }
  }

  /**
   * Normalize a link relative to a base URL
   */
  public normalizeLink(href: string, baseUrl: string): string | null {
    try {
      // Skip external links, anchors, javascript, mailto, etc.
      if (
        href.startsWith('javascript:') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href.startsWith('#')
      ) {
        return null
      }

      // Handle absolute URLs
      if (href.startsWith('http://') || href.startsWith('https://')) {
        // Only include if same origin
        const hrefUrl = new URL(href)
        const baseUrlObj = new URL(baseUrl)
        if (hrefUrl.origin !== baseUrlObj.origin) {
          return null
        }
        return hrefUrl.pathname + hrefUrl.search
      }

      // Handle protocol-relative URLs
      if (href.startsWith('//')) {
        return null // External link
      }

      // Handle relative URLs
      if (href.startsWith('/')) {
        return href
      }

      // Handle relative paths without leading slash
      const baseUrlObj = new URL(baseUrl)
      const basePath = baseUrlObj.pathname.replace(/\/[^/]*$/, '/')
      return basePath + href
    } catch {
      this.logger.debug(`Failed to normalize link: ${href}, base: ${baseUrl}`)
      return null
    }
  }

  /**
   * Parse and validate robots.txt content
   */
  public parseRobotsTxt(content: string): RobotsTxtValidation {
    try {
      const rules: RobotsTxtRules = {
        allowedPaths: [],
        disallowedPaths: [],
        sitemapUrls: []
      }

      const lines = content.split('\n')
      let currentUserAgent = ''

      for (const line of lines) {
        const trimmed = line.trim()

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) {
          continue
        }

        const colonIndex = trimmed.indexOf(':')
        if (colonIndex === -1) {
          continue
        }

        const directive = trimmed.substring(0, colonIndex).trim().toLowerCase()
        const value = trimmed.substring(colonIndex + 1).trim()

        switch (directive) {
          case 'user-agent':
            currentUserAgent = value.toLowerCase()
            break
          case 'allow':
            if (currentUserAgent === '*' || currentUserAgent === '') {
              rules.allowedPaths.push(value)
            }
            break
          case 'disallow':
            if (currentUserAgent === '*' || currentUserAgent === '') {
              rules.disallowedPaths.push(value)
            }
            break
          case 'sitemap':
            rules.sitemapUrls.push(value)
            break
          case 'crawl-delay': {
            const delay = parseInt(value, 10)
            if (!isNaN(delay) && delay > 0) {
              rules.crawlDelay = delay
            }
            break
          }
        }
      }

      return {
        isValid: true,
        rules
      }
    } catch (error) {
      return {
        isValid: false,
        rules: null,
        error: error.message
      }
    }
  }

  /**
   * Check if a path is allowed by robots.txt rules
   */
  public isPathAllowed(path: string, rules: RobotsTxtRules): boolean {
    // Check disallowed paths first (more specific rules take precedence)
    for (const disallowed of rules.disallowedPaths) {
      if (this.matchesRobotPattern(path, disallowed)) {
        // Check if there's a more specific allow rule
        for (const allowed of rules.allowedPaths) {
          if (
            this.matchesRobotPattern(path, allowed) &&
            allowed.length > disallowed.length
          ) {
            return true
          }
        }
        return false
      }
    }
    return true
  }

  /**
   * Match a path against a robots.txt pattern
   */
  private matchesRobotPattern(path: string, pattern: string): boolean {
    if (!pattern) {
      return false
    }

    // Handle wildcard patterns
    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*').replace(/\$/g, '$') + '$'
      )
      return regex.test(path)
    }

    // Handle $ end anchor
    if (pattern.endsWith('$')) {
      return path === pattern.slice(0, -1)
    }

    // Simple prefix match
    return path.startsWith(pattern)
  }

  /**
   * Parse and validate sitemap.xml content
   */
  public parseSitemapXml(content: string): SitemapValidation {
    try {
      const $ = cheerio.load(content, { xmlMode: true })
      const entries: SitemapEntry[] = []

      // Handle regular sitemap
      $('url').each((_, el) => {
        const loc = $(el).find('loc').text().trim()
        if (loc) {
          const entry: SitemapEntry = { loc }

          const lastmod = $(el).find('lastmod').text().trim()
          if (lastmod) entry.lastmod = lastmod

          const changefreq = $(el).find('changefreq').text().trim()
          if (changefreq) entry.changefreq = changefreq

          const priority = parseFloat($(el).find('priority').text().trim())
          if (!isNaN(priority)) entry.priority = priority

          entries.push(entry)
        }
      })

      // Handle sitemap index
      $('sitemap').each((_, el) => {
        const loc = $(el).find('loc').text().trim()
        if (loc) {
          const entry: SitemapEntry = { loc }

          const lastmod = $(el).find('lastmod').text().trim()
          if (lastmod) entry.lastmod = lastmod

          entries.push(entry)
        }
      })

      if (entries.length === 0) {
        return {
          isValid: false,
          entries: [],
          error: 'No valid entries found in sitemap'
        }
      }

      return {
        isValid: true,
        entries
      }
    } catch (error) {
      return {
        isValid: false,
        entries: [],
        error: error.message
      }
    }
  }

  /**
   * Extract manifest-relative paths from sitemap entries
   */
  public extractManifestPaths(
    entries: SitemapEntry[],
    manifestBaseUrl: string
  ): string[] {
    const paths: string[] = []

    for (const entry of entries) {
      try {
        const entryUrl = new URL(entry.loc)
        const baseUrl = new URL(manifestBaseUrl)

        // Only include paths from the same origin
        if (entryUrl.origin === baseUrl.origin) {
          paths.push(entryUrl.pathname)
        }
      } catch {
        // If it's already a relative path
        if (entry.loc.startsWith('/')) {
          paths.push(entry.loc)
        }
      }
    }

    return paths
  }

  /**
   * Generate a hash of content for deduplication
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex')
  }

  /**
   * Determine if a content-type should be crawled
   */
  public isCrawlableContentType(contentType: string | null): boolean {
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

  /**
   * Determine if content type is HTML
   */
  public isHtmlContentType(contentType: string | null): boolean {
    if (!contentType) {
      return false
    }

    const normalizedType = contentType.toLowerCase().split(';')[0].trim()

    return (
      normalizedType === 'text/html' ||
      normalizedType === 'application/xhtml+xml'
    )
  }
}
