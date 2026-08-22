import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const backendDirectory = path.resolve(import.meta.dirname, "..");
const authModuleUrl = pathToFileURL(path.join(backendDirectory, "src", "routes", "auth.js")).href;
const databaseModuleUrl = pathToFileURL(path.join(backendDirectory, "src", "db.js")).href;

test("traveler signup stores a salted password hash", () => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "idea-holiday-auth-test-"));
  const databasePath = path.join(temporaryDirectory, "marketplace.db");
  const password = "a-strong-test-password";

  try {
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
      const [{ default: authRouter }, { default: db }] = await Promise.all([
        import(${JSON.stringify(authModuleUrl)}),
        import(${JSON.stringify(databaseModuleUrl)}),
      ]);
      const signup = authRouter.stack.find((layer) => layer.route?.path === "/signup")
        .route.stack.at(-1).handle;
      const request = {
        body: {
          name: "Security Test",
          email: "Security.Test@example.com",
          password: ${JSON.stringify(password)},
          phone: "9999999999",
        },
      };
      const response = {
        statusCode: 200,
        payload: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return this; },
      };
      await signup(request, response);
      const stored = db.prepare("SELECT email, password FROM users WHERE email = ?").get("security.test@example.com");
      console.log(JSON.stringify({ status: response.statusCode, stored }));
      db.close();
    `], {
      cwd: backendDirectory,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_ENGINE: "sqlite",
        SQLITE_DB_PATH: databasePath,
        K_SERVICE: "",
        NODE_ENV: "test",
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout.trim().split("\n").at(-1));
    assert.equal(output.status, 200);
    assert.equal(output.stored.email, "security.test@example.com");
    assert.match(output.stored.password, /^scrypt\$/);
    assert.equal(output.stored.password.includes(password), false);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
