# ArNS Indexer
ArNS Indexer is an indexer microservice for [ArNS](https://github.com/ar-io).

## Description

Have you ever wanted to have a live index of all ArNS records including undernames?

Do you have [byte lust](https://x.com/vilenarios/status/1979643531141505316)?

Well look no further!  ArNS Indexer is a microservice built on the NestJS framework and features a queue to:

1) Fetch all ArNS records
2) Fetch all ANT records (& controllers)
3) Archive expired ArNS and ANT lease records

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
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | - | The port ArNS Indexer runs on (for healthchecks) |
| `DO_CLEAN` | `false` | On startup, wipe the task queue |
| `ARNS_QUEUE_TTL_MS` | `86400000` (1 day) | The cadence of the ArNS records discovery queue |
| `SKIP_EXPIRED_RECORDS` | `true` | Skip expired lease records during indexing to prevent re-inserting archived records |

### AO Compute Unit
| Variable | Default | Description |
|----------|---------|-------------|
| `CU_URL` | `https://cu.ardrive.io` | The URL for the Compute Unit to resolve records. It is strongly encouraged to run your own CU to avoid spamming public CUs and ensure better control over resolution behavior (e.g., snapshots) |

### ARNS Name Filtering
Filter ARNS names processed by each queue stage independently. Useful for restricting indexing to specific names or excluding problematic ones.

**Format:** Comma-separated list of ARNS names (case-sensitive), or `*` for all names.

**Logic:** A name passes if it satisfies BOTH conditions:
- Whitelist is empty, OR name is in whitelist, OR whitelist is `*`
- Blacklist is empty, OR name is NOT in blacklist (blacklist `*` denies all)

| Variable | Default | Description |
|----------|---------|-------------|
| `ARNS_DISCOVERY_WHITELIST` | _(empty)_ | ARNS names to include during discovery (empty = all) |
| `ARNS_DISCOVERY_BLACKLIST` | _(empty)_ | ARNS names to exclude during discovery |

**Examples:**
```bash
# Only index these specific names
ARNS_DISCOVERY_WHITELIST=ardrive,arweave,arns

# Exclude specific names
ARNS_DISCOVERY_BLACKLIST=spam-site,broken-ant
```

### Redis
| Variable | Description |
|----------|-------------|
| `REDIS_MODE` | `standalone` or `sentinel` (for sentinel clusters) |

#### Standalone
| Variable | Description |
|----------|-------------|
| `REDIS_HOST` | Redis hostname |
| `REDIS_PORT` | Redis port |

#### Sentinel
| Variable | Description |
|----------|-------------|
| `REDIS_MASTER_NAME` | Redis master node name |
| `REDIS_SENTINEL_1_HOST` | Redis sentinel 1 host |
| `REDIS_SENTINEL_1_PORT` | Redis sentinel 1 port |
| `REDIS_SENTINEL_2_HOST` | Redis sentinel 2 host |
| `REDIS_SENTINEL_2_PORT` | Redis sentinel 2 port |
| `REDIS_SENTINEL_3_HOST` | Redis sentinel 3 host |
| `REDIS_SENTINEL_3_PORT` | Redis sentinel 3 port |

### Postgres
| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | - | Postgres host |
| `DB_PORT` | - | Postgres port |
| `DB_NAME` | - | Database name |
| `DB_USERNAME` | - | Postgres user |
| `DB_PASSWORD` | - | Postgres password |
| `DB_MIGRATIONS_RUN` | - | Set to `true` in production to run migrations on startup |
| `DB_SYNCHRONIZE` | - | Sync database with entity classes. **Never use in production** as it can wipe data |

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
  InitialSchema1738800000000,
  <MigrationName<Timestamp>>
]
...
```

## Queue Flow

The discovery queue runs in this order:
1. `discover-arns-records` - Fetches and upserts ArNS records from the network
2. `discover-ant-records` - Fetches and upserts ANT records for each ArNS record
3. `cleanup-expired-records` - Archives and deletes expired lease records

The queue then re-queues the next discovery cycle.

## Expired Records Archival

ArNS Indexer automatically archives expired lease records at the end of each discovery cycle. The archival process:

1. Finds ArNS records with `type: 'lease'` and `endTimestamp` in the past
2. Copies the expired ArNS and associated ANT records to archive tables (`arns_record_archive` and `ant_record_archive`)
3. Deletes the original records from the main tables

All archive and delete operations happen within a single database transaction for consistency.

### Archive Tables

The archive tables contain all original fields plus:
- `archivedAt` - Timestamp when the record was archived
- `archiveReason` - Reason for archival (e.g., `'expired'`)
- `originalId` - The original record's ID
- `originalCreatedAt` / `originalUpdatedAt` - Original timestamps

## Future Work
1) Runtime cluster support
2) Postgres cluster support

## Contributing
Feel free to open a pull request!
