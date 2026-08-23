#!/usr/bin/env node
/**
 * Database Migration CLI
 *
 * Usage:
 *   node scripts/migrate.js status
 *   node scripts/migrate.js up
 *   node scripts/migrate.js down
 */
import db, { databaseInfo } from "../src/db.js";
import {
  getMigrationStatus,
  runPendingMigrations,
  rollbackLastBatch,
  DEFAULT_MIGRATIONS_DIR,
} from "../src/services/migrationRunner.js";

const command = process.argv[2] || "status";

console.log(`\n🗄️  Database Migrations Engine (${databaseInfo.engine.toUpperCase()})`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

try {
  switch (command.toLowerCase()) {
    case "status": {
      const status = getMigrationStatus(db, DEFAULT_MIGRATIONS_DIR);
      console.log(`Current Batch: ${status.currentBatch}`);
      console.log(`Total: ${status.total} | Applied: ${status.appliedCount} | Pending: ${status.pendingCount}\n`);

      if (status.migrations.length === 0) {
        console.log("No migration files found in migrations directory.");
      } else {
        console.table(
          status.migrations.map((m) => ({
            Migration: m.name,
            Status: m.applied ? "✅ Applied" : "⏳ Pending",
            Batch: m.batch ?? "-",
            "Executed At": m.executedAt ?? "-",
            "Duration (ms)": m.executionTimeMs ?? "-",
          }))
        );
      }
      break;
    }

    case "up": {
      const result = runPendingMigrations(db, DEFAULT_MIGRATIONS_DIR);
      if (result.applied.length === 0) {
        console.log("✅ Database is up to date. No pending migrations.");
      } else {
        console.log(`🚀 Applied ${result.applied.length} migration(s) in Batch #${result.batch}:`);
        for (const item of result.applied) {
          console.log(`  + ${item.name} (${item.timeMs}ms)`);
        }
      }
      break;
    }

    case "down": {
      const result = rollbackLastBatch(db, DEFAULT_MIGRATIONS_DIR);
      if (result.rolledBack.length === 0) {
        console.log("No migrations to rollback.");
      } else {
        console.log(`↩️  Rolled back Batch #${result.batch} (${result.rolledBack.length} migrations):`);
        for (const name of result.rolledBack) {
          console.log(`  - ${name}`);
        }
      }
      break;
    }

    default:
      console.error(`Unknown command: "${command}". Available commands: status, up, down`);
      process.exit(1);
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
} catch (err) {
  console.error("❌ Migration error:", err.message);
  process.exit(1);
}
