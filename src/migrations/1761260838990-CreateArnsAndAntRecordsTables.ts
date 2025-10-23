import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateArnsAndAntRecordsTables1761260838990
  implements MigrationInterface
{
  name = 'CreateArnsAndAntRecordsTables1761260838990'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."arns_record_type_enum" AS ENUM('lease', 'permabuy')
    `)
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
        CONSTRAINT "UQ_41e1c945bfc155114ff15ebb867" UNIQUE ("name", "undername"),
        CONSTRAINT "PK_951ced0d28f4403ffc5b3ae855c" PRIMARY KEY ("id")
      )
  `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ant_record"`)
    await queryRunner.query(`DROP TABLE "arns_record"`)
    await queryRunner.query(`DROP TYPE "public"."arns_record_type_enum"`)
  }
}
