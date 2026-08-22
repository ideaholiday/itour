import cors from "cors";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";

const LOCAL_ORIGINS = ["http://localhost:3000", "http://localhost:5173"];

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function allowedOrigins(environment = process.env) {
  const configured = String(environment.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const applicationOrigins = [environment.PUBLIC_APP_URL, environment.MAPPLS_ORIGIN]
    .map((origin) => String(origin || "").trim().replace(/\/$/, ""))
    .filter(Boolean);
  const developmentOrigins = environment.NODE_ENV === "production" ? [] : LOCAL_ORIGINS;

  return [...new Set([...configured, ...applicationOrigins, ...developmentOrigins])];
}

export function corsOptions(environment = process.env) {
  const origins = new Set(allowedOrigins(environment));

  return {
    credentials: true,
    maxAge: 86_400,
    origin(origin, callback) {
      if (!origin || origins.has(origin.replace(/\/$/, ""))) {
        return callback(null, true);
      }
      return callback(null, false);
    },
  };
}

export function createRateLimiter({ windowMs, limit, scope }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: (req) => req.method === "OPTIONS",
    handler: (_req, res) => {
      res.status(429).json({
        error: "Too many requests",
        scope,
        retryAfterSeconds: Math.ceil(windowMs / 1000),
      });
    },
  });
}

export function configureSecurity(app, environment = process.env) {
  if (environment.NODE_ENV === "production") {
    app.set("trust proxy", positiveInteger(environment.TRUST_PROXY_HOPS, 1));
  }
  app.disable("x-powered-by");

  app.use(helmet({
    // The Vite client currently loads third-party maps, images and payment
    // scripts. Add a tested allowlist before enabling Helmet's default CSP.
    contentSecurityPolicy: false,
  }));
  app.use(cors(corsOptions(environment)));

  const globalLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: positiveInteger(environment.GLOBAL_RATE_LIMIT, 1_000),
    scope: "api",
  });
  const authLimiter = createRateLimiter({
    windowMs: 5 * 60 * 1000,
    limit: positiveInteger(environment.AUTH_RATE_LIMIT, 5),
    scope: "authentication",
  });
  const searchLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    limit: positiveInteger(environment.SEARCH_RATE_LIMIT, 30),
    scope: "search",
  });
  const checkoutLimiter = createRateLimiter({
    windowMs: 5 * 60 * 1000,
    limit: positiveInteger(environment.CHECKOUT_RATE_LIMIT, 10),
    scope: "checkout",
  });

  app.use("/api", globalLimiter);
  app.use([
    "/api/auth/login",
    "/api/auth/signup",
    "/api/auth/supplier-signup",
  ], authLimiter);
  app.use("/api/transfers/search", searchLimiter);
  app.use([
    "/api/checkout/create-order",
    "/api/checkout/demo-payment",
    "/api/checkout/verify",
    "/api/checkout/cashfree/create-order",
    "/api/checkout/cashfree/verify",
    "/api/checkout/calculate-refund",
    "/api/checkout/cancel-booking",
    "/api/checkout/trigger-split-payout",
  ], checkoutLimiter);
}
