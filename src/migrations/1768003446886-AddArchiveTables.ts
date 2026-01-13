import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArchiveTables1768003446886 implements MigrationInterface {
  name = 'AddArchiveTables1768003446886';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create ArNS record archive table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "arns_record_archive" (
        "id" SERIAL NOT NULL,
        "archivedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "archiveReason" character varying,
        "originalId" integer NOT NULL,
        "originalCreatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "originalUpdatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "name" character varying NOT NULL,
        "processId" character varying NOT NULL,
        "purchasePrice" bigint,
        "startTimestamp" bigint,
        "endTimestamp" bigint,
        "type" "public"."arns_record_type_enum",
        "undernameLimit" integer,
        CONSTRAINT "PK_arns_record_archive" PRIMARY KEY ("id")
      )
    `);

    // Create ANT record archive table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ant_record_archive" (
        "id" SERIAL NOT NULL,
        "archivedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "archiveReason" character varying,
        "originalId" integer NOT NULL,
        "originalCreatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "originalUpdatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "name" character varying NOT NULL,
        "processId" character varying NOT NULL,
        "undername" character varying NOT NULL,
        "transactionId" character varying NOT NULL,
        "ttlSeconds" integer NOT NULL,
        "description" character varying,
        "priority" integer,
        "owner" character varying,
        "displayName" character varying,
        "logo" character varying,
        "keywords" character varying array DEFAULT '{}',
        "controllers" character varying array DEFAULT '{}',
        CONSTRAINT "PK_ant_record_archive" PRIMARY KEY ("id")
      )
    `);

    // Index for lookups by archived name
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_arns_record_archive_name 
      ON arns_record_archive (name)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ant_record_archive_name 
      ON ant_record_archive (name)
    `);

    // Index for lookups by archive date
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_arns_record_archive_archived_at 
      ON arns_record_archive ("archivedAt")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ant_record_archive_archived_at 
      ON ant_record_archive ("archivedAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_ant_record_archive_archived_at
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_arns_record_archive_archived_at
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_ant_record_archive_name
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_arns_record_archive_name
    `);

    // Drop tables
    await queryRunner.query(`
      DROP TABLE IF EXISTS "ant_record_archive"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "arns_record_archive"
    `);
  }
}
