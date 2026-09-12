export function demoPaymentsEnabled(env = process.env) {
  if (env.K_SERVICE || env.NODE_ENV === "production") return false;
  return env.DEMO_PAYMENT_ONLY !== "false" || env.ENABLE_DEMO_PAYMENT !== "false";
}
