import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddArnsNameToResolvedTargetAndCrawledDocument1769535332651
  implements MigrationInterface
{
  name = 'AddArnsNameToResolvedTargetAndCrawledDocument1769535332651'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add arnsName and undername columns to ant_resolved_target
    await queryRunner.query(
      `ALTER TABLE "ant_resolved_target" ADD "arnsName" character varying`
    )
    await queryRunner.query(
      `ALTER TABLE "ant_resolved_target" ADD "undername" character varying`
    )

    // Add arnsName and undername columns to crawled_document
    await queryRunner.query(
      `ALTER TABLE "crawled_document" ADD "arnsName" character varying`
    )
    await queryRunner.query(
      `ALTER TABLE "crawled_document" ADD "undername" character varying`
    )

    // Create indexes for the new columns
    await queryRunner.query(
      `CREATE INDEX "IDX_ant_resolved_target_arns_name" ON "ant_resolved_target" ("arnsName")`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_ant_resolved_target_undername" ON "ant_resolved_target" ("undername")`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_crawled_document_arns_name" ON "crawled_document" ("arnsName")`
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_crawled_document_undername" ON "crawled_document" ("undername")`
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(
      `DROP INDEX "public"."IDX_crawled_document_undername"`
    )
    await queryRunner.query(
      `DROP INDEX "public"."IDX_crawled_document_arns_name"`
    )
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ant_resolved_target_undername"`
    )
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ant_resolved_target_arns_name"`
    )

    // Drop columns from crawled_document
    await queryRunner.query(
      `ALTER TABLE "crawled_document" DROP COLUMN "undername"`
    )
    await queryRunner.query(
      `ALTER TABLE "crawled_document" DROP COLUMN "arnsName"`
    )

    // Drop columns from ant_resolved_target
    await queryRunner.query(
      `ALTER TABLE "ant_resolved_target" DROP COLUMN "undername"`
    )
    await queryRunner.query(
      `ALTER TABLE "ant_resolved_target" DROP COLUMN "arnsName"`
    )
  }
}
