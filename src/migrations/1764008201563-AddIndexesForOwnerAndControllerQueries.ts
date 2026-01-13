import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIndexesForOwnerAndControllerQueries1764008201563
  implements MigrationInterface
{
  name = 'AddIndexesForOwnerAndControllerQueries1764008201563';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // GIN index for controllers array search
    // Optimizes queries checking if an address is in the controllers array
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ant_record_controllers_gin 
      ON ant_record USING GIN (controllers)
    `);

    // B-tree index for owner filtering
    // Optimizes queries filtering by owner address
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ant_record_owner 
      ON ant_record (owner)
    `);

    // Composite index for owner + sort optimization
    // Optimizes queries that filter by owner and sort by createdAt DESC
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ant_record_owner_created 
      ON ant_record (owner, "createdAt" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes in reverse order
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_ant_record_owner_created
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_ant_record_owner
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_ant_record_controllers_gin
    `);
  }
}
