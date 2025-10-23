import 'dotenv/config'
import { DataSource } from 'typeorm'

import { dbEntities } from './src/db-entities'

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'arns_indexer',
  synchronize: false,
  logging: false,
  entities: dbEntities,
  migrations: ['src/migrations/*.ts'],
  // subscribers: ['src/subscribers/*.ts']
})
