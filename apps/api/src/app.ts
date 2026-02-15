import Fastify from "fastify";
import { ZodError, z } from "zod";
import {
  parseCreateJobRequest,
  ShapeDefinitionSchema,
  type CreateJobResponse,
  type CreateJobRequest,
  type JobStatus,
  type Revision,
  type ShapeDefinition
} from "@torrify/shared-types";
import type { StoredJob } from "@torrify/job-store";

interface QueueJobLike {
  remove(): Promise<void>;
}

interface QueueLike {
  add(name: string, data: { jobId: string }, opts?: { jobId?: string }): Promise<unknown>;
  getJob(jobId: string): Promise<QueueJobLike | null | undefined>;
}

interface ProjectRecord {
  id: string;
  name: string;
  createdAt: string;
}

interface JobStoreLike {
  init(): Promise<void>;
  createProject(id: string, name: string): Promise<ProjectRecord>;
  listProjects(): Promise<ProjectRecord[]>;
  getProject(projectId: string): Promise<ProjectRecord | undefined>;
  createRevision(
    id: string,
    projectId: string,
    shapeDefinition: ShapeDefinition,
    parentRevisionId?: string
  ): Promise<Revision>;
  listRevisions(projectId: string): Promise<Revision[]>;
  getRevision(revisionId: string): Promise<Revision | undefined>;
  createQueuedJob(
    jobId: string,
    projectId: string,
    revisionId: string,
    payload: CreateJobRequest
  ): Promise<StoredJob>;
  listJobs(): Promise<StoredJob[]>;
  listJobsByProject(projectId: string): Promise<StoredJob[]>;
  getJob(jobId: string): Promise<StoredJob | undefined>;
  markCancelled(jobId: string): Promise<boolean>;
  readArtifact(jobId: string, format: "svg" | "pdf" | "stl"): Promise<string | undefined>;
}

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(200)
});

const createRevisionSchema = z.object({
  shapeDefinition: ShapeDefinitionSchema,
  parentRevisionId: z.string().uuid().optional()
});

export function buildApp(store: JobStoreLike, queue: QueueLike) {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ ok: true }));

  app.post("/v1/projects", async (request, reply) => {
    try {
      const payload = createProjectSchema.parse(request.body);
      const project = await store.createProject(crypto.randomUUID(), payload.name);
      return reply.code(201).send(project);
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ message: "Invalid request payload", issues: error.issues });
      }
      return reply.code(500).send({ message: "Internal server error" });
    }
  });

  app.get("/v1/projects", async () => {
    const projects = await store.listProjects();
    return { count: projects.length, projects };
  });

  app.post("/v1/projects/:projectId/revisions", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    try {
      const payload = createRevisionSchema.parse(request.body);
      const project = await store.getProject(projectId);
      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const revision = await store.createRevision(
        crypto.randomUUID(),
        projectId,
        payload.shapeDefinition,
        payload.parentRevisionId
      );

      return reply.code(201).send(revision);
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ message: "Invalid request payload", issues: error.issues });
      }
      return reply.code(500).send({ message: "Internal server error" });
    }
  });

  app.get("/v1/projects/:projectId/revisions", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const project = await store.getProject(projectId);

    if (!project) {
      return reply.code(404).send({ message: "Project not found" });
    }

    const revisions = await store.listRevisions(projectId);
    return { count: revisions.length, revisions };
  });

  app.get("/v1/projects/:projectId", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const project = await store.getProject(projectId);

    if (!project) {
      return reply.code(404).send({ message: "Project not found" });
    }

    const [revisions, jobs] = await Promise.all([
      store.listRevisions(projectId),
      store.listJobsByProject(projectId)
    ]);

    return {
      project,
      revisionsCount: revisions.length,
      jobsCount: jobs.length,
      latestRevision: revisions[0] ?? null,
      latestJob: jobs[0]
        ? {
            jobId: jobs[0].id,
            revisionId: jobs[0].revisionId,
            status: jobs[0].status,
            createdAt: jobs[0].createdAt,
            updatedAt: jobs[0].updatedAt
          }
        : null
    };
  });

  app.get("/v1/jobs", async () => {
    const jobs = await store.listJobs();
    return {
      count: jobs.length,
      jobs: jobs.map((job) => ({
        jobId: job.id,
        projectId: job.projectId,
        revisionId: job.revisionId,
        status: job.status,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        shapeDefinition: job.payload.shapeDefinition,
        exportFormats: job.payload.exportFormats,
        artifacts: {
          hasSvg: Boolean(job.artifacts.svgPath),
          hasPdf: Boolean(job.artifacts.pdfPath),
          hasStl: Boolean(job.artifacts.stlPath)
        }
      }))
    };
  });

  app.post("/v1/jobs", async (request, reply) => {
    try {
      const payload = parseCreateJobRequest(request.body);

      let projectId = payload.projectId;
      if (!projectId) {
        const project = await store.createProject(crypto.randomUUID(), "Untitled Project");
        projectId = project.id;
      }

      const project = await store.getProject(projectId);
      if (!project) {
        return reply.code(404).send({ message: "Project not found" });
      }

      const revision = await store.createRevision(
        crypto.randomUUID(),
        projectId,
        payload.shapeDefinition,
        payload.parentRevisionId
      );

      const jobId = crypto.randomUUID();
      await store.createQueuedJob(jobId, projectId, revision.id, payload);
      await queue.add("export", { jobId }, { jobId });

      const response: CreateJobResponse = {
        jobId,
        status: "queued",
        projectId,
        revisionId: revision.id
      };

      return reply.code(202).send(response);
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ message: "Invalid request payload", issues: error.issues });
      }

      return reply.code(500).send({ message: "Internal server error" });
    }
  });

  app.get("/v1/jobs/:jobId", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = await store.getJob(jobId);

    if (!job) {
      return reply.code(404).send({ message: "Job not found" });
    }

    return reply.send({
      jobId: job.id,
      projectId: job.projectId,
      revisionId: job.revisionId,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      exportFormats: job.payload.exportFormats,
      geometry: job.geometry,
      artifacts: {
        hasSvg: Boolean(job.artifacts.svgPath),
        hasPdf: Boolean(job.artifacts.pdfPath),
        hasStl: Boolean(job.artifacts.stlPath)
      }
    });
  });

  app.post("/v1/jobs/:jobId/cancel", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = await store.getJob(jobId);

    if (!job) {
      return reply.code(404).send({ message: "Job not found" });
    }

    if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
      return reply.send({ status: "not_cancellable" });
    }

    const queueJob = await queue.getJob(jobId);
    if (queueJob) {
      await queueJob.remove();
    }

    const cancelled = await store.markCancelled(jobId);
    return reply.send({ status: cancelled ? "cancelled" : "not_cancellable" });
  });

  app.post("/v1/jobs/:jobId/retry", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const sourceJob = await store.getJob(jobId);

    if (!sourceJob) {
      return reply.code(404).send({ message: "Job not found" });
    }

    if (sourceJob.status !== "failed" && sourceJob.status !== "cancelled") {
      return reply.code(409).send({ message: "Only failed/cancelled jobs can be retried" });
    }

    const sourceRevision = await store.getRevision(sourceJob.revisionId);
    if (!sourceRevision) {
      return reply.code(404).send({ message: "Revision not found" });
    }

    const newRevision = await store.createRevision(
      crypto.randomUUID(),
      sourceJob.projectId,
      sourceRevision.shapeDefinition,
      sourceJob.revisionId
    );

    const payload = {
      ...sourceJob.payload,
      projectId: sourceJob.projectId,
      parentRevisionId: sourceJob.revisionId,
      shapeDefinition: sourceRevision.shapeDefinition
    };

    const newJobId = crypto.randomUUID();
    await store.createQueuedJob(newJobId, sourceJob.projectId, newRevision.id, payload);
    await queue.add("export", { jobId: newJobId }, { jobId: newJobId });

    const response: CreateJobResponse = {
      jobId: newJobId,
      status: "queued",
      projectId: sourceJob.projectId,
      revisionId: newRevision.id
    };

    return reply.code(202).send(response);
  });

  app.post("/v1/jobs/:jobId/fork", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const sourceJob = await store.getJob(jobId);

    if (!sourceJob) {
      return reply.code(404).send({ message: "Job not found" });
    }

    const sourceRevision = await store.getRevision(sourceJob.revisionId);
    if (!sourceRevision) {
      return reply.code(404).send({ message: "Revision not found" });
    }

    const newRevision = await store.createRevision(
      crypto.randomUUID(),
      sourceJob.projectId,
      sourceRevision.shapeDefinition,
      sourceJob.revisionId
    );

    const payload = {
      ...sourceJob.payload,
      projectId: sourceJob.projectId,
      parentRevisionId: sourceJob.revisionId,
      shapeDefinition: sourceRevision.shapeDefinition
    };

    const newJobId = crypto.randomUUID();
    await store.createQueuedJob(newJobId, sourceJob.projectId, newRevision.id, payload);
    await queue.add("export", { jobId: newJobId }, { jobId: newJobId });

    const response: CreateJobResponse = {
      jobId: newJobId,
      status: "queued",
      projectId: sourceJob.projectId,
      revisionId: newRevision.id
    };

    return reply.code(202).send(response);
  });

  app.get("/v1/jobs/:jobId/artifacts", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = await store.getJob(jobId);

    if (!job) {
      return reply.code(404).send({ message: "Job not found" });
    }

    return {
      jobId,
      artifacts: {
        svg: job.artifacts.svgPath ? `/v1/jobs/${jobId}/artifacts/svg` : null,
        pdf: job.artifacts.pdfPath ? `/v1/jobs/${jobId}/artifacts/pdf` : null,
        stl: job.artifacts.stlPath ? `/v1/jobs/${jobId}/artifacts/stl` : null
      }
    };
  });

  app.get("/v1/jobs/:jobId/artifacts/:format", async (request, reply) => {
    const { jobId, format } = request.params as { jobId: string; format: "svg" | "pdf" | "stl" };

    if (format !== "svg" && format !== "pdf" && format !== "stl") {
      return reply.code(404).send({ message: "Artifact format not found" });
    }

    const artifact = await store.readArtifact(jobId, format);
    if (!artifact) {
      return reply.code(404).send({ message: `${format.toUpperCase()} artifact not available for this job` });
    }

    const contentType =
      format === "svg" ? "image/svg+xml" : format === "pdf" ? "application/pdf" : "model/stl";

    reply.header("Content-Type", contentType);
    return reply.send(artifact);
  });

  return app;
}

export type { JobStoreLike, QueueLike, QueueJobLike, ProjectRecord, JobStatus };
