import { MigrationInterface, QueryRunner } from 'typeorm'

export class InitialSchema1738800000000 implements MigrationInterface {
  name = 'InitialSchema1738800000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type
    await queryRunner.query(`
      CREATE TYPE "public"."arns_record_type_enum" AS ENUM('lease', 'permabuy')
    `)

    // Create arns_record table
    await queryRunner.query(`
      CREATE TABLE "arns_record" (
        "id" SERIAL NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "name" character varying NOT NULL,
        "processId" character varying NOT NULL,
        "purchasePrice" bigint,
        "startTimestamp" bigint,
        "endTimestamp" bigint,
        "type" "public"."arns_record_type_enum",
        "undernameLimit" integer,
        CONSTRAINT "UQ_294fee4bf0b72eba82b72b5825f" UNIQUE ("name"),
        CONSTRAINT "PK_8327ac22803f36c3fac17429877" PRIMARY KEY ("id")
      )
    `)

    // Create ant_record table (includes controllers column)
    await queryRunner.query(`
      CREATE TABLE "ant_record" (
        "id" SERIAL NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
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
        CONSTRAINT "UQ_41e1c945bfc155114ff15ebb867" UNIQUE ("name", "undername"),
        CONSTRAINT "PK_951ced0d28f4403ffc5b3ae855c" PRIMARY KEY ("id")
      )
    `)

    // Create arns_record_archive table
    await queryRunner.query(`
      CREATE TABLE "arns_record_archive" (
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
    `)

    // Create ant_record_archive table
    await queryRunner.query(`
      CREATE TABLE "ant_record_archive" (
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
    `)

    // Indexes on ant_record
    await queryRunner.query(`
      CREATE INDEX idx_ant_record_controllers_gin 
      ON ant_record USING GIN (controllers)
    `)

    await queryRunner.query(`
      CREATE INDEX idx_ant_record_owner 
      ON ant_record (owner)
    `)

    await queryRunner.query(`
      CREATE INDEX idx_ant_record_owner_created 
      ON ant_record (owner, "createdAt" DESC)
    `)

    // Indexes on archive tables
    await queryRunner.query(`
      CREATE INDEX idx_arns_record_archive_name 
      ON arns_record_archive (name)
    `)

    await queryRunner.query(`
      CREATE INDEX idx_ant_record_archive_name 
      ON ant_record_archive (name)
    `)

    await queryRunner.query(`
      CREATE INDEX idx_arns_record_archive_archived_at 
      ON arns_record_archive ("archivedAt")
    `)

    await queryRunner.query(`
      CREATE INDEX idx_ant_record_archive_archived_at 
      ON ant_record_archive ("archivedAt")
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ant_record_archive_archived_at`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_arns_record_archive_archived_at`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ant_record_archive_name`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_arns_record_archive_name`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ant_record_owner_created`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ant_record_owner`)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ant_record_controllers_gin`)

    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS "ant_record_archive"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "arns_record_archive"`)
    await queryRunner.query(`DROP TABLE "ant_record"`)
    await queryRunner.query(`DROP TABLE "arns_record"`)
    await queryRunner.query(`DROP TYPE "public"."arns_record_type_enum"`)
  }
}
