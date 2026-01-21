import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAntResolvedTargetTable1769040000000 implements MigrationInterface {
  name = 'CreateAntResolvedTargetTable1769040000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum types
    await queryRunner.query(`
      CREATE TYPE "public"."ant_resolved_target_status_enum" 
      AS ENUM('pending', 'resolved', 'not_found')
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."ant_resolved_target_category_enum" 
      AS ENUM('manifest', 'ao_process', 'transaction')
    `);

    // Create ant_resolved_target table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ant_resolved_target" (
        "transactionId" character varying NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "status" "public"."ant_resolved_target_status_enum" NOT NULL DEFAULT 'pending',
        "contentType" character varying,
        "targetCategory" "public"."ant_resolved_target_category_enum",
        "retryCount" integer NOT NULL DEFAULT 0,
        "manifestValidation" jsonb,
        "resolvedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_ant_resolved_target" PRIMARY KEY ("transactionId")
      )
    `);

    // Index for querying pending targets that need resolution or retry
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ant_resolved_target_status 
      ON ant_resolved_target (status)
    `);

    // Index for finding targets by category
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ant_resolved_target_category 
      ON ant_resolved_target ("targetCategory")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ant_resolved_target_category`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_ant_resolved_target_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ant_resolved_target"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."ant_resolved_target_category_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."ant_resolved_target_status_enum"`);
  }
}
