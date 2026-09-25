import logger from "../config/logger.js";

const BLOCKED_KEYS = new Set(["__proto__", "prototype", "constructor"]);

// POST /api/uploads carries the file as base64 in `data`; the route itself caps
// the decoded file at 10MB, so its string may be that long (about 14M chars).
// Any other string over 100k chars is refused.
const UPLOAD_DATA_MAX_CHARS = 14_000_000;

function isUploadData(req, path) {
  return req.method === "POST" && path.length === 1 && path[0] === "data"
    && /^\/api(\/v1)?\/uploads\/?$/.test(String(req.originalUrl || "").split("?")[0]);
}

function assertSafeValue(value, path = [], depth = 0, state = { nodes: 0 }) {
  state.nodes += 1;
  if (state.nodes > 5_000) throw new Error("Request contains too many values");
  if (typeof value === "string" && value.length > (state.req && isUploadData(state.req, path) ? UPLOAD_DATA_MAX_CHARS : 100_000)) {
    throw new Error(`Value at ${path.join(".") || "request"} is too long`);
  }
  if (!value || typeof value !== "object") return;
  // Depth counts containers only. Meta's failed-delivery status nests a
  // string at entry[].changes[].value.statuses[].errors[].error_data.details
  // (11 levels); rejecting it dropped WhatsApp delivery failures with a 400.
  if (depth > 16) throw new Error("Request nesting is too deep");
  if (Array.isArray(value)) {
    if (value.length > 1_000) throw new Error(`Array at ${path.join(".") || "request"} is too large`);
    value.forEach((item, index) => assertSafeValue(item, [...path, index], depth + 1, state));
    return;
  }
  const entries = Object.entries(value);
  if (entries.length > 500) throw new Error(`Object at ${path.join(".") || "request"} has too many fields`);
  for (const [key, child] of entries) {
    if (BLOCKED_KEYS.has(key)) throw new Error("Request contains a prohibited field name");
    assertSafeValue(child, [...path, key], depth + 1, state);
  }
}

function validationFailure(req, res, issues) {
  logger.warn("Request validation rejected", {
    event: "request_validation_failed",
    requestId: req.requestId,
    method: req.method,
    route: req.baseUrl && req.route?.path ? `${req.baseUrl}${req.route.path}` : req.originalUrl?.split("?")[0],
    issues: issues.slice(0, 20).map((issue) => ({
      path: Array.isArray(issue.path) ? issue.path.join(".") : "request",
      code: issue.code || "invalid_request",
    })),
  });
  return res.status(400).json({
    error: "Request validation failed",
    code: "VALIDATION_ERROR",
    requestId: req.requestId,
  });
}

export function requestBoundary(req, res, next) {
  try {
    if (String(req.originalUrl || "").length > 8_192) throw new Error("Request URL is too long");
    assertSafeValue(req.query || {});
    if (req.body !== undefined) assertSafeValue(req.body, [], 0, { nodes: 0, req });
    next();
  } catch (error) {
    return validationFailure(req, res, [{ path: [], code: "unsafe_structure", message: error.message }]);
  }
}

export function validateRequest({ body, query, params } = {}) {
  return async function validateRequestMiddleware(req, res, next) {
    const targets = [
      ["body", body],
      ["query", query],
      ["params", params],
    ];
    for (const [source, schema] of targets) {
      if (!schema) continue;
      const result = await schema.safeParseAsync(req[source] || {});
      if (!result.success) {
        return validationFailure(req, res, result.error.issues.map((issue) => ({
          ...issue,
          path: [source, ...issue.path],
        })));
      }
      if (source === "body") req.body = result.data;
      else Object.assign(req[source], result.data);
    }
    return next();
  };
}

export const validateBody = (schema) => validateRequest({ body: schema });
export const validateQuery = (schema) => validateRequest({ query: schema });
export const validateParams = (schema) => validateRequest({ params: schema });

