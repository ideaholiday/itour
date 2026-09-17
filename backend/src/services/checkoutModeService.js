export function demoPaymentsEnabled(env = process.env) {
  if (env.K_SERVICE || env.NODE_ENV === "production") return false;
  return env.DEMO_PAYMENT_ONLY !== "false" || env.ENABLE_DEMO_PAYMENT !== "false";
}

// A refund with no gateway reference may be faked only where demo payments are
// allowed, never on live traffic, whatever ENABLE_DEMO_PAYMENT says.
export function demoRefundFallbackEnabled(env = process.env) {
  return env.ENABLE_DEMO_PAYMENT === "true" && demoPaymentsEnabled(env);
}
