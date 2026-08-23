import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const backendRoot = path.resolve(import.meta.dirname, "../..");

function reservePort() {
  return new Promise((resolve, reject) => {
    const socket = createServer();
    socket.unref();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      socket.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function waitForExit(child, timeoutMs = 5_000) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitUntilReady(baseUrl, child, output, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`API exited during startup (${child.exitCode}).\n${output()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // The listener is not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`API did not become ready within ${timeoutMs}ms.\n${output()}`);
}

export async function startTestServer(overrides = {}) {
  const workspace = mkdtempSync(path.join(tmpdir(), "idea-holiday-http-"));
  const databasePath = path.join(workspace, "integration.sqlite");
  // Pre-create the file so db.js never bootstraps it from the developer database.
  writeFileSync(databasePath, "");

  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let output = "";
  const appendOutput = (chunk) => {
    output = `${output}${chunk}`.slice(-30_000);
  };

  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: backendRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      DATABASE_ENGINE: "sqlite",
      SQLITE_DB_PATH: databasePath,
      SQLITE_JOURNAL_MODE: "DELETE",
      K_SERVICE: "",
      JWT_SECRET: "integration-jwt-secret-with-at-least-32-characters",
      OTP_SECRET: "integration-otp-secret-with-at-least-32-characters",
      DEMO_PAYMENT_ONLY: "true",
      ENABLE_DEMO_PAYMENT: "true",
      EMAIL_NOTIFICATIONS_ENABLED: "false",
      WHATSAPP_CLOUD_API_ENABLED: "false",
      NOTIFICATIONS_ENABLED: "false",
      SUPABASE_URL: "",
      SUPABASE_ANON_KEY: "",
      CASHFREE_CLIENT_ID: "",
      CASHFREE_CLIENT_SECRET: "",
      RAZORPAY_KEY_ID: "",
      RAZORPAY_KEY_SECRET: "",
      LOG_LEVEL: "error",
      LOG_FORMAT: "json",
      ...overrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", appendOutput);
  child.stderr.on("data", appendOutput);

  try {
    await waitUntilReady(baseUrl, child, () => output);
  } catch (error) {
    child.kill("SIGTERM");
    await waitForExit(child);
    rmSync(workspace, { recursive: true, force: true });
    throw error;
  }

  let stopped = false;
  return {
    baseUrl,
    databasePath,
    output: () => output,
    async stop() {
      if (stopped) return;
      stopped = true;
      child.kill("SIGTERM");
      await waitForExit(child);
      rmSync(workspace, { recursive: true, force: true });
    },
  };
}

export async function requestJson(baseUrl, pathname, { token, headers = {}, body, method } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  return { response, data };
}
