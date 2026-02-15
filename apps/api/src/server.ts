import { Queue } from "bullmq";
import { PgJobStore } from "@torrify/job-store";
import { buildApp } from "./app.js";

const store = new PgJobStore();

function parseEnvInt(name: string, fallback: number, min = 1): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < min) return fallback;
  return value;
}

function buildRedisConnection(url: URL): {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
} {
  const database = Number.parseInt(url.pathname.replace("/", ""), 10);
  return {
    host: url.hostname,
    port: Number.parseInt(url.port || "6379", 10),
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number.isFinite(database) ? database : undefined
  };
}

const redisUrl = new URL(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
const redisConnection = buildRedisConnection(redisUrl);

const queue = new Queue("export-jobs", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: parseEnvInt("JOB_ATTEMPTS", 3),
    backoff: {
      type: "exponential",
      delay: parseEnvInt("JOB_BACKOFF_MS", 1000, 0)
    },
    removeOnComplete: 100,
    removeOnFail: 1000
  }
});

const app = buildApp(store, queue);

const port = parseEnvInt("PORT", 3000);
const host = process.env.HOST ?? "127.0.0.1";

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`Received ${signal}, shutting down`);
  try {
    await app.close();
    await queue.close();
    await store.close();
    process.exit(0);
  } catch (error) {
    console.error("[api] shutdown error", error);
    process.exit(1);
  }
}

const start = async (): Promise<void> => {
  await store.init();
  await app.listen({ port, host });
  app.log.info(`API listening on ${host}:${port}`);
};

start().catch((error) => {
  // Fastify logger may be disabled in dev, so always surface startup failures.
  console.error("[api] fatal startup error", error);
  app.log.error(error);
  process.exit(1);
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
