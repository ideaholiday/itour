import test from "node:test";
import assert from "node:assert/strict";
import { driverAppAssetLinks } from "../src/lib/androidAppLinks.js";

const PLAY_KEY = "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5";

test("asset links list the driver app only when a signing fingerprint is configured", () => {
  assert.equal(driverAppAssetLinks({}), null);
  assert.equal(driverAppAssetLinks({ ANDROID_DRIVER_APP_SHA256: "not-a-fingerprint" }), null);
  const [statement] = driverAppAssetLinks({ ANDROID_DRIVER_APP_SHA256: ` ${PLAY_KEY.toLowerCase()} , bad ` });
  assert.deepEqual(statement.relation, ["delegate_permission/common.handle_all_urls"]);
  assert.equal(statement.target.package_name, "in.ideaholiday.driver");
  assert.deepEqual(statement.target.sha256_cert_fingerprints, [PLAY_KEY], "normalized to uppercase, invalid entries dropped");
});
