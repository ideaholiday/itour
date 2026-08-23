# 06. Database Scaling & Versioning

## Status — ✅ Implemented (23 Aug 2026)

The application features a dual-engine (SQLite & PostgreSQL) versioned migration runner (`backend/src/services/migrationRunner.js` and `backend/scripts/migrate.js`) with structured SQL migrations in `backend/migrations/`, an immutable `_schema_migrations` batch tracking table, and CLI commands (`npm run migrate:status`, `npm run migrate:up`, `npm run migrate:down`). Automated PostgreSQL worker connection management and SQLite-to-PostgreSQL ETL migration tooling are active.

## Current State
- ✅ Dual-engine SQLite & Supabase PostgreSQL support
- ✅ Versioned SQL migrations framework with status, batch execution, and rollback
- ✅ Performance and security indexing on critical query paths
- ✅ Durable audit logging schema and quality score metrics
- 🟡 Managed cloud backups (Supabase automated daily backups)
- ⬜ Read replica splitting and sharding (ready for cloud growth)

---

## 1. Database Migration Strategy

### Setup Flyway or Liquibase

```bash
# Install Flyway CLI
brew install flyway

# Initialize migrations directory
mkdir -p db/migrations

# Create migration files
touch db/migrations/V1__initial_schema.sql
touch db/migrations/V2__add_indices.sql
touch db/migrations/V3__add_audit_logging.sql
```

### Migration Naming Convention

```
db/migrations/
├── V1__initial_schema.sql          # Schema creation
├── V2__add_indices.sql             # Performance indices
├── V3__add_audit_logging.sql       # Audit table
├── V4__add_payment_verification.sql
└── V5__add_supplier_geofence.sql
```

### Example Migrations

```sql
-- V1__initial_schema.sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  role TEXT DEFAULT 'traveler',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id),
  product_id UUID NOT NULL,
  status TEXT DEFAULT 'pending_payment',
  total_amount DECIMAL(10,2),
  commission_amount DECIMAL(10,2),
  supplier_payout DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- V2__add_indices.sql
CREATE INDEX idx_bookings_user_id ON bookings(user_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_created_at ON bookings(created_at DESC);
CREATE INDEX idx_users_email ON users(email);

-- V3__add_audit_logging.sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES users(id),
  resource_type TEXT NOT NULL,
  resource_id UUID NOT NULL,
  changes JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
```

### Run Migrations

```bash
# Development (SQLite)
cd backend && npm run migrate:sqlite

# Production (Supabase PostgreSQL)
DATABASE_URL=postgresql://... flyway migrate
```

### NodeJS Migration Runner

```javascript
// backend/src/db/migrations.js
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const runMigrations = async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const migrationDir = path.join(__dirname, './migrations');
  
  // Create migrations table if not exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_versions (
      version INT PRIMARY KEY,
      description TEXT,
      type TEXT DEFAULT 'SQL',
      installed_by TEXT DEFAULT 'system',
      installed_on TIMESTAMP DEFAULT now(),
      execution_time INT
    )
  `);
  
  // Get all migration files
  const files = fs.readdirSync(migrationDir)
    .filter(f => f.match(/^V\d+__/))
    .sort();
  
  for (const file of files) {
    const version = parseInt(file.match(/V(\d+)/)[1]);
    
    // Check if already applied
    const result = await pool.query(
      'SELECT * FROM schema_versions WHERE version = $1',
      [version]
    );
    
    if (result.rows.length > 0) continue;
    
    // Apply migration
    const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
    const start = Date.now();
    
    try {
      await pool.query(sql);
      
      await pool.query(
        `INSERT INTO schema_versions (version, description, execution_time)
         VALUES ($1, $2, $3)`,
        [version, file.split('__')[1].replace('.sql', ''), Date.now() - start]
      );
      
      console.log(`✅ Applied migration: ${file}`);
    } catch (error) {
      console.error(`❌ Failed migration: ${file}`, error.message);
      throw error;
    }
  }
  
  await pool.end();
};

module.exports = { runMigrations };
```

---

## 2. Backup & Recovery

### Automated Backups

```bash
# Supabase automatically backs up daily
# Manual backup via CLI:

# Export PostgreSQL backup
pg_dump \
  postgresql://user:password@host/marketplace \
  > backup_$(date +%Y%m%d_%H%M%S).sql

# Store in Google Cloud Storage
gsutil cp backup_*.sql gs://idea-holiday-backups/

# Scheduled via Cloud Scheduler
gcloud scheduler jobs create app-engine backup-database \
  --schedule="0 2 * * *" \
  --http-method=POST \
  --uri="https://project.cloudfunctions.net/backup-db"
```

### Backup Verification

```javascript
// backend/src/jobs/backupJob.js
const backup = require('child_process');
const { storage } = require('@google-cloud/storage');

const backupDatabase = async () => {
  try {
    // Take backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `backup_${timestamp}.sql`;
    
    await backup.exec(`pg_dump ${process.env.DATABASE_URL} > /tmp/${fileName}`);
    
    // Verify backup (restore to shadow database)
    await verifyBackup(`/tmp/${fileName}`);
    
    // Upload to GCS
    const bucket = storage.bucket(process.env.BACKUP_BUCKET);
    await bucket.upload(`/tmp/${fileName}`, {
      destination: `backups/${fileName}`,
      metadata: { timestamp, verified: true },
    });
    
    logger.info('Database backup completed', { fileName });
  } catch (error) {
    logger.error('Database backup failed', { error });
    sendAlert('Database backup failed');
  }
};

module.exports = { backupDatabase };
```

### Disaster Recovery Plan

```markdown
## RTO (Recovery Time Objective): 1 hour
## RPO (Recovery Point Objective): 15 minutes

### Full Database Loss
1. Provision new Supabase instance
2. Restore latest backup
3. Run migrations to latest version
4. Verify data integrity
5. Switch DNS to new database

### Partial Data Corruption
1. Identify corrupted records
2. Restore from incremental backup
3. Replay transaction logs
4. Verify with checksums

### Read Replica Failover
1. Detect primary failure
2. Promote read replica to primary
3. Update connection strings
4. Verify replication lag
```

---

## 3. Connection Pooling

### Setup pgBouncer

```ini
# pgbouncer.ini
[databases]
marketplace = host=supabase.postgres.database.azure.com port=5432 dbname=marketplace

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
min_pool_size = 10
reserve_pool_size = 5
reserve_pool_timeout = 3
```

### Connection Pool in Application

```javascript
// config/database.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Max connections
  min: 5,  // Min idle connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error('Unexpected connection pool error', err);
});

module.exports = pool;
```

---

## 4. Read Replicas for Scale

### Setup Supabase Read Replica

```bash
# Create read replica in different region
supabase projects create \
  --name idea-holiday-read-replica \
  --region us-west-1
```

### Route Reads to Replica

```javascript
// config/database.js
const writePool = new Pool({ connectionString: process.env.DATABASE_WRITE_URL });
const readPool = new Pool({ connectionString: process.env.DATABASE_READ_URL });

const query = async (sql, params, isWrite = false) => {
  const pool = isWrite ? writePool : readPool;
  return pool.query(sql, params);
};

// Usage
const transfers = await query(
  'SELECT * FROM transfers WHERE created_at > NOW() - INTERVAL 1 day',
  [],
  false // Read operation
);
```

---

## 5. Sharding Strategy (Future)

### Horizontal Sharding by Supplier

```javascript
// When >10M records, shard by supplier_id
const getShardKey = (supplierId) => {
  const shardCount = 4;
  return supplierId.charCodeAt(0) % shardCount;
};

const getShardConnection = (supplierId) => {
  const shard = getShardKey(supplierId);
  return connections[`db-shard-${shard}`];
};

// Query sharded database
const getSupplierBookings = async (supplierId) => {
  const shard = getShardConnection(supplierId);
  return shard.query(
    'SELECT * FROM bookings WHERE supplier_id = $1',
    [supplierId]
  );
};
```

---

## 6. Index Optimization

### Analyze Query Plans

```sql
-- Find slow queries
SELECT 
  mean_exec_time,
  max_exec_time,
  query
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Analyze query plan
EXPLAIN ANALYZE
SELECT b.*, s.name 
FROM bookings b
JOIN suppliers s ON b.supplier_id = s.id
WHERE b.status = 'completed'
  AND b.created_at > NOW() - INTERVAL '30 days'
ORDER BY b.created_at DESC;
```

### Add Strategic Indices

```sql
-- Composite indices for common queries
CREATE INDEX idx_bookings_status_date 
ON bookings(status, created_at DESC);

CREATE INDEX idx_transfers_location 
ON transfers USING GIST (pickup_location);

-- Partial indices for active records
CREATE INDEX idx_bookings_pending 
ON bookings(created_at) 
WHERE status NOT IN ('completed', 'cancelled');

-- BRIN indices for time-series data
CREATE INDEX idx_events_timestamp 
ON events USING BRIN (created_at);
```

---

## 7. Monitoring & Alerting

### Track Database Health

```javascript
// services/DatabaseHealthService.js
const checkHealth = async () => {
  const pool = require('../config/database');
  
  // Connection pool stats
  const { totalCount, idleCount, waitingCount } = pool;
  
  // Replication lag (read replica)
  const lagResult = await pool.query(`
    SELECT 
      EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) as replication_lag_seconds
  `);
  
  // Table sizes
  const sizeResult = await pool.query(`
    SELECT 
      schemaname,
      tablename,
      pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
    FROM pg_tables
    ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    LIMIT 10
  `);
  
  // Alert if issues
  if (idleCount < 2) {
    logger.warn('Low idle connections', { idleCount });
  }
  
  if (lagResult.rows[0].replication_lag_seconds > 5) {
    logger.warn('High replication lag', { lag: lagResult.rows[0] });
  }
  
  return { connections: { totalCount, idleCount, waitingCount }, replication: lagResult.rows[0], tables: sizeResult.rows };
};
```

---

## Implementation Checklist

### Week 1: Migrations & Versioning
- [x] Set up dual-engine SQL migration versioning (`backend/src/services/migrationRunner.js`)
- [x] Document and structure existing schemas into versioned migration files (`backend/migrations/`)
- [x] Implement CLI tooling (`npm run migrate:status`, `npm run migrate:up`, `npm run migrate:down`)
- [x] Test and verify migration rollback procedures
- [x] Verify tracking via `_schema_migrations` table

### Week 2: Optimization & Indexing
- [x] Add strategic performance indices for bookings, suppliers, and audit logs
- [x] Validate dual SQLite and PostgreSQL adapter query compatibility
- [x] Add automated unit and integration tests for migration runner

### Week 3: Scalability
- [ ] Set up read replicas
- [ ] Route reads to replicas
- [ ] Test failover procedures
- [ ] Document sharding strategy
- [ ] Set up database alerting

### Week 4: Disaster Recovery
- [ ] Document RTO/RPO targets
- [ ] Create recovery runbook
- [ ] Test full recovery scenario
- [ ] Automate recovery procedures
- [ ] Run monthly recovery drills

---

## Success Criteria

- ✅ All schema changes via migrations
- ✅ Daily automated backups verified
- ✅ RTO <1 hour, RPO <15 min
- ✅ Connection pool utilization <80%
- ✅ Replication lag <1 second
- ✅ No slow queries (P95 <100ms)
- ✅ Disaster recovery tested monthly

Timeline: **2-3 weeks**
