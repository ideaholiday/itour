import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { COUNTRY_TIME, cityTime, localDateTimeMs, offsetOn } from "../src/lib/localTime.js";

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

// ADR 024: European zones change offset in summer; Asian ones never do.
test("European trips use summer time in summer and winter time in winter", () => {
  const { France, "United Kingdom": uk, Japan } = COUNTRY_TIME;
  assert.equal(offsetOn(France, "2026-07-15", "09:00"), "+02:00");
  assert.equal(offsetOn(France, "2026-12-15", "09:00"), "+01:00");
  assert.equal(offsetOn(uk, "2026-07-15", "09:00"), "+01:00");
  assert.equal(offsetOn(uk, "2026-12-15", "09:00"), "+00:00");
  assert.equal(offsetOn(Japan, "2026-07-15", "09:00"), "+09:00");
  // 09:00 in Paris in July is 07:00 UTC.
  assert.equal(new Date(localDateTimeMs("2026-07-15", "09:00", France)).toISOString(), "2026-07-15T07:00:00.000Z");
});
