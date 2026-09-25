import Database from "better-sqlite3";
import sharedDb from "../../src/db.js";

/**
 * An in-memory copy of the prepared test database (scripts/prepare-test-db.js),
 * so a test gets the schema the real migrations build and can write freely
 * without touching the shared file. Closed when the test ends.
 */
export function migratedDb(t) {
  const image = sharedDb.serialize();
  // The shared file is in WAL mode, which an in-memory copy can't write; header
  // bytes 18-19 are the read/write format versions, and 1 means rollback journal.
  image[18] = 1;
  image[19] = 1;
  const db = new Database(image);
  t.after(() => db.close());
  return db;
}
