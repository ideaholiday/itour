import winston from "winston";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: [
    path.join(__dirname, "..", "..", ".env.local"),
    path.join(__dirname, "..", "..", ".env"),
  ],
  quiet: true,
});

export const REDACTED = "[REDACTED]";

const sensitiveKey = /(authorization|cookie|password|passcode|token|secret|api[_-]?key|otp|pin|cvv|card|payment|bank|account[_-]?number|(^|[_-])(pan|gst|gstin)([_-]|$)|signature)/i;
const emailKey = /(email|recipient)/i;
const phoneKey = /(phone|mobile|whatsapp)/i;

function maskEmail(value) {
  const [name, domain] = String(value).split("@");
  if (!domain) return REDACTED;
  return `${name.slice(0, 1) || "*"}***@${domain}`;
}

function maskPhone(value) {
  const digits = String(value).replace(/\D/g, "");
  return digits.length >= 4 ? `***${digits.slice(-4)}` : REDACTED;
}

function sanitizeString(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, `Bearer ${REDACTED}`)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (email) => maskEmail(email))
    .replace(/(?<![\d-])(?!\d{4}-\d{2}-\d{2})(?:\+?\d[\d\s()-]{7,}\d)(?![\d-])/g, (phone) => maskPhone(phone))
    .slice(0, 4_000);
}

export function redactSensitive(value, { key = "", depth = 0, seen = new WeakSet() } = {}) {
  if (sensitiveKey.test(key)) return REDACTED;
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (emailKey.test(key)) return maskEmail(value);
    if (phoneKey.test(key)) return maskPhone(value);
    return sanitizeString(value);
  }
  if (["number", "boolean"].includes(typeof value)) return value;
  if (typeof value === "bigint") return value.toString();
  if (depth >= 6) return "[MAX_DEPTH]";
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
      code: value.code || undefined,
      ...(process.env.NODE_ENV === "production" ? {} : { stack: sanitizeString(value.stack || "") }),
    };
  }
  if (typeof value !== "object") return sanitizeString(value);
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => redactSensitive(item, { depth: depth + 1, seen }));
  }

  const sanitized = {};
  for (const [childKey, childValue] of Object.entries(value).slice(0, 100)) {
    sanitized[childKey] = redactSensitive(childValue, { key: childKey, depth: depth + 1, seen });
  }
  return sanitized;
}

const sanitizeFormat = winston.format((info) => {
  info.severity = String(info.level || "info").toUpperCase();
  const sanitized = redactSensitive(info);
  Object.keys(info).forEach((key) => delete info[key]);
  Object.assign(info, sanitized);
  return info;
});

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  sanitizeFormat(),
  winston.format.json(),
);

const prettyFormat = winston.format.combine(
  winston.format.timestamp(),
  sanitizeFormat(),
  winston.format.printf(({ timestamp, level, message, ...meta }) =>
    `${timestamp} ${level.toUpperCase()} ${message}${Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ""}`),
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  defaultMeta: {
    service: "idea-holiday-api",
    environment: process.env.NODE_ENV || "development",
    version: process.env.APP_VERSION || process.env.K_REVISION || "local",
  },
  format: process.env.LOG_FORMAT === "pretty" ? prettyFormat : jsonFormat,
  transports: [new winston.transports.Console()],
});

export default logger;
