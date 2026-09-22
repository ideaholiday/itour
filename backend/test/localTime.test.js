import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { cityTime, localDateTimeMs } from "../src/lib/localTime.js";

// ADR 024: the zone is the city's; Bali (WITA, UTC+8) differs from Jakarta (WIB, UTC+7).
test("Bali and Jakarta run on their own Indonesian time zones", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE destinations (name TEXT, country TEXT); INSERT INTO destinations VALUES ('Bali', 'Indonesia'), ('Jakarta', 'Indonesia'), ('Singapore', 'Singapore'), ('Goa', 'India')");
  assert.deepEqual([cityTime(db, "Bali").label, cityTime(db, "bali ").timeZone], ["WITA", "Asia/Makassar"]);
  assert.deepEqual([cityTime(db, "Jakarta").label, cityTime(db, "Jakarta").timeZone], ["WIB", "Asia/Jakarta"]);
  assert.equal(cityTime(db, "Singapore").label, "SGT");
  assert.equal(cityTime(db, "Goa").label, "IST");
  // 09:00 in Bali is an hour before 09:00 in Jakarta.
  assert.equal(localDateTimeMs("2026-10-01", "09:00", cityTime(db, "Jakarta")) - localDateTimeMs("2026-10-01", "09:00", cityTime(db, "Bali")), 3600000);
  db.close();
});
