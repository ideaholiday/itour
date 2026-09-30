import test from "node:test";
import assert from "node:assert/strict";
import { androidAppAssetLinks } from "../src/lib/androidAppLinks.js";

const PLAY_KEY = "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5";
const UPLOAD_KEY = "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";

test("asset links list the driver app only when a signing fingerprint is configured", () => {
  assert.equal(androidAppAssetLinks({}), null);
  assert.equal(androidAppAssetLinks({ ANDROID_DRIVER_APP_SHA256: "not-a-fingerprint" }), null);
  const [statement, ...others] = androidAppAssetLinks({ ANDROID_DRIVER_APP_SHA256: ` ${PLAY_KEY.toLowerCase()} , bad ` });
  assert.equal(others.length, 0);
  assert.deepEqual(statement.relation, ["delegate_permission/common.handle_all_urls"]);
  assert.equal(statement.target.package_name, "in.ideaholiday.driver");
  assert.deepEqual(statement.target.sha256_cert_fingerprints, [PLAY_KEY], "normalized to uppercase, invalid entries dropped");
});

test("asset links list each configured app with its own fingerprints", () => {
  const links = androidAppAssetLinks({ ANDROID_TRAVELER_APP_SHA256: `${PLAY_KEY},${UPLOAD_KEY}`, ANDROID_SUPPLIER_APP_SHA256: UPLOAD_KEY });
  assert.deepEqual(links.map((statement) => statement.target.package_name), ["in.ideaholiday.app", "in.ideaholiday.supplier"]);
  assert.deepEqual(links[0].target.sha256_cert_fingerprints, [PLAY_KEY, UPLOAD_KEY]);
  assert.deepEqual(links[1].target.sha256_cert_fingerprints, [UPLOAD_KEY]);
});
