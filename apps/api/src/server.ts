import { Queue } from "bullmq";
import { PgJobStore } from "@torrify/job-store";
import { buildApp } from "./app.js";

const store = new PgJobStore();

const redisUrl = new URL(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
const redisConnection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || "6379")
};

const queue = new Queue("export-jobs", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: Number(process.env.JOB_ATTEMPTS ?? "3"),
    backoff: {
      type: "exponential",
      delay: Number(process.env.JOB_BACKOFF_MS ?? "1000")
    },
    removeOnComplete: 100,
    removeOnFail: 1000
  }
});

const app = buildApp(store, queue);

const port = Number(process.env.PORT ?? "3000");
const host = process.env.HOST ?? "127.0.0.1";

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
