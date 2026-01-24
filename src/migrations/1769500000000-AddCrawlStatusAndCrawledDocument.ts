import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddCrawlStatusAndCrawledDocument1769500000000
  implements MigrationInterface
{
  name = 'AddCrawlStatusAndCrawledDocument1769500000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create crawl_status enum type
    await queryRunner.query(`
      CREATE TYPE "public"."ant_resolved_target_crawl_status_enum" 
      AS ENUM('pending', 'crawling', 'crawled', 'skipped', 'failed')
    `)

    // Add new columns to ant_resolved_target table
    await queryRunner.query(`
      ALTER TABLE "ant_resolved_target"
      ADD COLUMN "crawlStatus" "public"."ant_resolved_target_crawl_status_enum",
      ADD COLUMN "crawledAt" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN "robotsTxt" text,
      ADD COLUMN "sitemapXml" text
    `)

    // Index for querying targets by crawl status
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ant_resolved_target_crawl_status 
      ON ant_resolved_target ("crawlStatus")
    `)

    // Create crawled_document table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "crawled_document" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "transactionId" character varying NOT NULL,
        "manifestPath" character varying,
        "url" character varying NOT NULL,
        "title" character varying,
        "body" text,
        "bodyTruncated" boolean,
        "metaDescription" character varying,
        "metaKeywords" character varying,
        "headings" jsonb,
        "links" jsonb,
        "contentHash" character varying,
        "contentType" character varying,
        "depth" integer NOT NULL DEFAULT 0,
        "contentLength" integer,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "lastCrawledAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_crawled_document" PRIMARY KEY ("id"),
        CONSTRAINT "FK_crawled_document_resolved_target" 
          FOREIGN KEY ("transactionId") 
          REFERENCES "ant_resolved_target"("transactionId") 
          ON DELETE CASCADE
      )
    `)

    // Index for querying documents by transactionId
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_crawled_document_transaction_id 
      ON crawled_document ("transactionId")
    `)

    // Index for querying documents by URL
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_crawled_document_url 
      ON crawled_document ("url")
    `)

    // Index for content deduplication
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_crawled_document_content_hash 
      ON crawled_document ("contentHash")
    `)

    // Unique constraint for transactionId + manifestPath combination
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_crawled_document_transaction_path_unique 
      ON crawled_document ("transactionId", COALESCE("manifestPath", ''))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes on crawled_document
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_crawled_document_transaction_path_unique`
    )
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_crawled_document_content_hash`
    )
    await queryRunner.query(`DROP INDEX IF EXISTS idx_crawled_document_url`)
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_crawled_document_transaction_id`
    )

    // Drop crawled_document table
    await queryRunner.query(`DROP TABLE IF EXISTS "crawled_document"`)

    // Drop crawl status index
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_ant_resolved_target_crawl_status`
    )

    // Remove columns from ant_resolved_target
    await queryRunner.query(`
      ALTER TABLE "ant_resolved_target"
      DROP COLUMN IF EXISTS "crawlStatus",
      DROP COLUMN IF EXISTS "crawledAt",
      DROP COLUMN IF EXISTS "robotsTxt",
      DROP COLUMN IF EXISTS "sitemapXml"
    `)

    // Drop crawl_status enum type
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."ant_resolved_target_crawl_status_enum"`
    )
  }
}
