import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const ADMIN_LOGIN = Object.freeze({
  get email() {
    return process.env.ADMIN_EMAIL || "admin@ideaholiday.in";
  },
  get password() {
    return process.env.ADMIN_INITIAL_PASSWORD || null;
  },
});

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}

export function passwordMatches(password, storedPassword) {
  if (!String(storedPassword || "").startsWith("scrypt$")) {
    return storedPassword === password;
  }

  const [, salt, storedHash] = storedPassword.split("$");
  if (!salt || !storedHash) return false;

  try {
    const expected = Buffer.from(storedHash, "hex");
    const supplied = scryptSync(password, salt, expected.length);
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  } catch {
    return false;
  }
}

export function requireAdminInitialPassword() {
  if (!ADMIN_LOGIN.password) {
    throw new Error("ADMIN_INITIAL_PASSWORD must be configured before seeding an admin account");
  }
  return ADMIN_LOGIN.password;
}
