import assert from "node:assert/strict";
import test from "node:test";
import { DRIVER_APP_LINK_ON, DRIVER_APP_PLAY_URL, driverAppUrl } from "./driverAppLink.js";

test("the Play link stays hidden until it is switched on", () => {
  assert.equal(DRIVER_APP_LINK_ON, false);
  assert.equal(driverAppUrl(), "");
});

test("switched on, the link is the driver app's Play page", () => {
  assert.equal(driverAppUrl({ on: true }), DRIVER_APP_PLAY_URL);
  assert.match(DRIVER_APP_PLAY_URL, /details\?id=in\.ideaholiday\.driver$/);
});

test("a local VITE_DRIVER_APP_URL overrides the switch", () => {
  assert.equal(driverAppUrl({ on: false, override: "https://example.test/app" }), "https://example.test/app");
});
