import { Worker } from "bullmq";
import {
  buildCanonicalGeometry,
  renderTemplateSvg,
  renderTemplatePdf,
  renderTemplateStl
} from "@torrify/geometry-engine";
import { PgJobStore } from "@torrify/job-store";

const store = new PgJobStore();
const redisUrl = new URL(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
const redisConnection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || "6379")
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
        const artifacts: { svg?: string; pdf?: string; stl?: string } = {};

        if (job.payload.exportFormats.includes("svg")) {
          artifacts.svg = renderTemplateSvg(geometry);
        }

        if (job.payload.exportFormats.includes("pdf")) {
          artifacts.pdf = renderTemplatePdf(geometry);
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
      concurrency: Number(process.env.WORKER_CONCURRENCY ?? "2")
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`[worker] failed job ${job?.id}: ${err.message}`);
  });

  worker.on("completed", (job) => {
    console.log(`[worker] finished queue task ${job.id}`);
  });

  console.log("[worker] BullMQ worker started");
}

startWorker().catch((error) => {
  console.error("[worker] fatal startup error", error);
  process.exit(1);
});
