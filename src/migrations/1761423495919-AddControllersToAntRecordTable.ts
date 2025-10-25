import { MigrationInterface, QueryRunner } from "typeorm";

export class AddControllersToAntRecordTable1761423495919 implements MigrationInterface {
    name = 'AddControllersToAntRecordTable1761423495919'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ant_record" ADD "controllers" character varying array DEFAULT '{}'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ant_record" DROP COLUMN "controllers"`);
    }

}
