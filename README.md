# ArNS Indexer
ArNS Indexer is an indexer microservice for [ArNS](https://github.com/ar-io).

## Description

Have you ever wanted to have a live index of all ArNS records including undernames?

Do you have [byte lust](https://x.com/vilenarios/status/1979643531141505316)?

Well look no further!  ArNS Indexer is a microservice built on the NestJS framework and features a queue to:

1) Fetch all ArNS records
2) Fetch all ANT records (& controllers)

ArNS Indexer serves as a data bridge between legacy AO and hyper-aos while ArNS processes remain accessible only on legacynet.  Eventually, this will be replaced by dedicated hyper-aos processes or a hyperbeam device.

## Project setup

```bash
$ npm install
```

## Requirements
- Redis (manages the task queue)
- Postgres (stores records)
- [AO Compute Unit](https://github.com/permaweb/ao) (to resolve AO ArNS requests)

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Environment
### Runtime
- `PORT` - The port you want ArNS Indexer to run on (for healthchecks)
- `DO_CLEAN` - `true` or `false` (default)
  on startup, ArNS Indexer will wipe the task queue
- `ARNS_QUEUE_TTL_MS` - The cadence of the ArNS records discovery queue (defaults to 86400000 (1 day))

### AO Compute Unit
- `CU_URL` - The URL for the Compute Unit the indexer will use to resolve records.  As ArNS Indexer uses the [ar.io sdk](https://github.com/ar-io/ar-io-sdk), this defaults to `https://cu.ardrive.io`.  It is strongly encouraged to run your own CU as to 1) not spam the ardrive CU and 2) ensure records have a good chance to resolve as you will have control over the behavior of the CU (such as taking snapshots)

### Redis
- `REDIS_MODE` - `standalone` or `sentinel` (for sentinel clusters)

#### Standalone
- `REDIS_HOST` - redis hostname
- `REDIS_PORT` - redis port

#### Sentinel
- `REDIS_MASTER_NAME` - redis master node name
- `REDIS_SENTINEL_1_HOST` - redis sentinel 1 host
- `REDIS_SENTINEL_1_PORT` - redis sentinel 1 port
- `REDIS_SENTINEL_2_HOST` - redis sentinel 2 host
- `REDIS_SENTINEL_2_PORT` - redis sentinel 2 port
- `REDIS_SENTINEL_3_HOST` - redis sentinel 3 host
- `REDIS_SENTINEL_3_PORT` - redis sentinal 3 port

### Postgres
- `DB_HOST` - postres host
- `DB_PORT` - postgres port
- `DB_NAME` - db name to use
- `DB_USERNAME` - postres user
- `DB_PASSWORD` - postgres password
- `DB_MIGRATIONS_RUN` - This should be set to `true` in production environments
so that db migrations run on startup
- `DB_SYNCHRONIZE` - Sync the database with entity classes on startup. This should **NOT** be set to `true` in production environments as it can potentially wipe data as it reconfigures tables in the db to match entity classes.  This is convenient to use while developing locally.

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

There are Nomad templates in the [operations](./operations) directory that provide an example of how to run ArNS Indexer as a Docker container.

Additionally, the [Dockerfile](./Dockerfile) is an example of how to run ArNS Indexer in production environments.

## Creating DB Migrations

### 1) Run the typeorm CLI to generate schema from an entity that has changed
```bash
npm run typeorm -- migration:generate \
  -d ./db-migrations-data-source.ts \
  ./migrations/<MigrationName>
```
This will generate a new migration in [src/migrations](./src/migrations) prepended by a timestamp.

### 2) Add the generated migration class to [app.module.ts](./src/app.module.ts) in the `migrations` list

```typescript
...
migrations: [
  CreateArnsAndAntRecordsTables1761260838990,
  AddControllersToAntRecordTable1761423495919,
  <MigrationName<Timestamp>>
]
...
```

## Future Work
1) Track ANT resolution failures in the database
2) Archive ArNS and ANT records that expire
3) Runtime cluster support
4) Postgres cluster support

## Contributing
Feel free to open a pull request!
