/**
 * Digital Asset Links for the Idea Holiday Driver Android app (ADR 014).
 *
 * Android opens https://ideaholiday.in/driver/trip links in the installed app
 * only when this file lists the app's signing certificate. Set
 * ANDROID_DRIVER_APP_SHA256 to the SHA-256 fingerprint(s) from Play Console →
 * App integrity (comma-separated, e.g. the Play signing key and an upload key
 * for internal testing). Unset: 404, and links keep opening in the browser.
 */
export const DRIVER_APP_PACKAGE = "in.ideaholiday.driver";
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function driverAppAssetLinks(env = process.env) {
  const fingerprints = String(env.ANDROID_DRIVER_APP_SHA256 || "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => FINGERPRINT.test(value));
  if (!fingerprints.length) return null;
  return [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: DRIVER_APP_PACKAGE, sha256_cert_fingerprints: fingerprints },
  }];
}
