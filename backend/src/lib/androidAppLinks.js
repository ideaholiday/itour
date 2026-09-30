/**
 * Digital Asset Links for the Idea Holiday Android apps (ADR 014, ADR 053).
 *
 * Android opens a site's links in an installed app only when this file lists
 * the app's signing certificate. Each app's variable holds the SHA-256
 * fingerprint(s) from Play Console → App integrity (comma-separated, e.g. the
 * Play signing key and an upload key for internal testing). The same file is
 * served on ideaholiday.in and supply.ideaholiday.in; an app is listed only
 * when its variable is set. None set: 404, and links keep opening in the browser.
 */
export const DRIVER_APP_PACKAGE = "in.ideaholiday.driver";
export const ANDROID_APPS = Object.freeze([
  { packageName: DRIVER_APP_PACKAGE, env: "ANDROID_DRIVER_APP_SHA256" },
  { packageName: "in.ideaholiday.app", env: "ANDROID_TRAVELER_APP_SHA256" },
  { packageName: "in.ideaholiday.supplier", env: "ANDROID_SUPPLIER_APP_SHA256" },
]);
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function androidAppAssetLinks(env = process.env) {
  const statements = ANDROID_APPS.map(({ packageName, env: name }) => ({
    packageName,
    fingerprints: String(env[name] || "")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter((value) => FINGERPRINT.test(value)),
  }))
    .filter(({ fingerprints }) => fingerprints.length)
    .map(({ packageName, fingerprints }) => ({
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: fingerprints },
    }));
  return statements.length ? statements : null;
}
