import { Worker } from "bullmq";
import {
  buildCanonicalGeometry,
  renderTemplateSvg,
  renderTemplatePdf,
  renderTemplateStl
} from "@torrify/geometry-engine";
import type { CanonicalGeometry, SvgLayer } from "@torrify/shared-types";
import { PgJobStore } from "@torrify/job-store";

const store = new PgJobStore();
const redisUrl = new URL(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
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

const redisConnection = {
  ...buildRedisConnection(redisUrl)
};

async function startWorker(): Promise<void> {
  await store.init();

  const worker = new Worker(
    "export-jobs",
    async (bullJob) => {
      const { jobId } = bullJob.data;
      const job = await store.getJob(jobId);
      if (!job) {
        throw new Error(`job ${jobId} not found`);
      }

      const didStart = await store.markRunning(jobId);
      if (!didStart) {
        // Job may have been cancelled before worker claimed it.
        return;
      }

      try {
        const geometry = buildCanonicalGeometry(job.payload.shapeDefinition);
        const layeredGeometry = filterTemplateLayers(geometry, job.payload.svgLayers);
        const artifacts: { svg?: string; pdf?: string; stl?: string } = {};

        if (job.payload.exportFormats.includes("svg")) {
          artifacts.svg = renderTemplateSvg(layeredGeometry);
        }

        if (job.payload.exportFormats.includes("pdf")) {
          artifacts.pdf = renderTemplatePdf(layeredGeometry);
        }

        if (job.payload.exportFormats.includes("stl")) {
          artifacts.stl = renderTemplateStl(job.payload.shapeDefinition);
        }

        const latest = await store.getJob(jobId);
        if (!latest || latest.status === "cancelled") {
          return;
        }

        await store.markSucceeded(jobId, geometry, artifacts);
        console.log(`[worker] completed job ${jobId}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown worker failure";
        await store.markFailed(jobId, message);
        throw error;
      }
    },
    {
      connection: redisConnection,
      concurrency: parseEnvInt("WORKER_CONCURRENCY", 2)
    }
  );

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] received ${signal}, shutting down`);
    try {
      await worker.close();
      await store.close();
      process.exit(0);
    } catch (error) {
      console.error("[worker] shutdown error", error);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  worker.on("failed", (job, err) => {
    console.error(`[worker] failed job ${job?.id}: ${err.message}`);
  });

  worker.on("completed", (job) => {
    console.log(`[worker] finished queue task ${job.id}`);
  });

  console.log("[worker] BullMQ worker started");
}

function filterTemplateLayers(geometry: CanonicalGeometry, layers: SvgLayer[]): CanonicalGeometry {
  if (!layers || layers.length === 0) {
    return geometry;
  }

  const allowed = new Set(layers);
  return {
    ...geometry,
    template: {
      ...geometry.template,
      paths: geometry.template.paths.filter((path) => allowed.has(path.layer))
    }
  };
}

startWorker().catch((error) => {
  console.error("[worker] fatal startup error", error);
  process.exit(1);
});
