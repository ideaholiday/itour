// Push notifications inside the Idea Holiday Android apps (ADR 053). The app
// bridge asks the user to allow notifications, then hands over its Firebase
// token in an `ideaholiday:push-token` event; the page registers it with the
// signed-in account. In a browser none of this runs.
const bridge = (name) => (typeof window === "undefined" ? null : window[name] || null);

/** Registers this phone for push once the app hands over its token. Returns a cleanup function. */
export function enableAppPush(register, bridgeName = "IdeaHolidayApp") {
  const app = bridge(bridgeName);
  if (typeof app?.enablePush !== "function") return () => {};
  const onToken = (event) => { if (event.detail) Promise.resolve(register(event.detail)).catch(() => {}); };
  window.addEventListener("ideaholiday:push-token", onToken);
  try { app.enablePush(); } catch { /* an older app without push */ }
  return () => window.removeEventListener("ideaholiday:push-token", onToken);
}

/** Signing out: this phone stops getting that account's alerts. */
export function unregisterAppPush(bridgeName = "IdeaHolidayApp") {
  let token = "";
  try { token = bridge(bridgeName)?.pushToken?.() || ""; } catch { token = ""; }
  if (!token) return Promise.resolve();
  return fetch("/api/push/unregister", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => {});
}

/** "traveler" or "supplier" inside those apps, otherwise null. */
export function appName() {
  try { return bridge("IdeaHolidayApp")?.app?.() || null; } catch { return null; }
}
