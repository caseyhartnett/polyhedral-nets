import test from "node:test";
import assert from "node:assert/strict";
import { buildApp, type JobStoreLike, type QueueLike, type QueueJobLike, type ProjectRecord } from "./app.js";
import type { CreateJobRequest, JobStatus, Revision, ShapeDefinition } from "@torrify/shared-types";
import type { StoredJob } from "@torrify/job-store";

const baseShape: ShapeDefinition = {
  schemaVersion: "1.0",
  height: 160,
  bottomWidth: 90,
  topWidth: 120,
  thickness: 6,
  units: "mm",
  seamMode: "straight",
  allowance: 8,
  notches: [],
  profilePoints: [],
  generationMode: "legacy",
  segments: 6,
  bottomSegments: 6,
  topSegments: 6
};

class FakeQueue implements QueueLike {
  public readonly jobs = new Map<string, { removed: boolean }>();

  async add(_name: string, data: { jobId: string }, opts?: { jobId?: string }): Promise<void> {
    const id = opts?.jobId ?? data.jobId;
    this.jobs.set(id, { removed: false });
  }

  async getJob(jobId: string): Promise<QueueJobLike | null> {
    const job = this.jobs.get(jobId);
    if (!job || job.removed) return null;

    return {
      remove: async () => {
        job.removed = true;
      }
    };
  }
}

class FakeStore implements JobStoreLike {
  private readonly projects = new Map<string, ProjectRecord>();
  private readonly revisions = new Map<string, Revision>();
  private readonly jobs = new Map<string, StoredJob>();

  async init(): Promise<void> {}

  async createProject(id: string, name: string): Promise<ProjectRecord> {
    const project = { id, name, createdAt: new Date().toISOString() };
    this.projects.set(id, project);
    return project;
  }

  async listProjects(): Promise<ProjectRecord[]> {
    return Array.from(this.projects.values());
  }

  async getProject(projectId: string): Promise<ProjectRecord | undefined> {
    return this.projects.get(projectId);
  }

  async createRevision(
    id: string,
    projectId: string,
    shapeDefinition: ShapeDefinition,
    parentRevisionId?: string
  ): Promise<Revision> {
    const revision: Revision = {
      id,
      projectId,
      parentRevisionId: parentRevisionId ?? null,
      shapeDefinition,
      createdAt: new Date().toISOString()
    };
    this.revisions.set(id, revision);
    return revision;
  }

  async listRevisions(projectId: string): Promise<Revision[]> {
    return Array.from(this.revisions.values()).filter((r) => r.projectId === projectId);
  }

  async getRevision(revisionId: string): Promise<Revision | undefined> {
    return this.revisions.get(revisionId);
  }

  async createQueuedJob(
    jobId: string,
    projectId: string,
    revisionId: string,
    payload: CreateJobRequest
  ): Promise<StoredJob> {
    const now = new Date().toISOString();
    const job: StoredJob = {
      id: jobId,
      projectId,
      revisionId,
      status: "queued",
      payload,
      createdAt: now,
      updatedAt: now,
      artifacts: {}
    };

    this.jobs.set(jobId, job);
    return job;
  }

  async listJobs(): Promise<StoredJob[]> {
    return Array.from(this.jobs.values());
  }

  async listJobsByProject(projectId: string): Promise<StoredJob[]> {
    return Array.from(this.jobs.values()).filter((j) => j.projectId === projectId);
  }

  async getJob(jobId: string): Promise<StoredJob | undefined> {
    return this.jobs.get(jobId);
  }

  async markCancelled(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    if (job.status !== "queued" && job.status !== "running") return false;

    job.status = "cancelled";
    job.updatedAt = new Date().toISOString();
    job.completedAt = new Date().toISOString();
    this.jobs.set(jobId, job);
    return true;
  }

  async readArtifact(): Promise<string | undefined> {
    return undefined;
  }

  // test helper
  setJobStatus(jobId: string, status: JobStatus): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.status = status;
    this.jobs.set(jobId, job);
  }
}

function makeJobPayload(projectId?: string): CreateJobRequest {
  return {
    ...(projectId ? { projectId } : {}),
    shapeDefinition: baseShape,
    exportFormats: ["svg"],
    svgLayers: ["cut", "score", "guide"]
  };
}

test("POST /v1/jobs auto-creates project and queues job", async () => {
  const store = new FakeStore();
  const queue = new FakeQueue();
  const app = buildApp(store, queue);

  const response = await app.inject({
    method: "POST",
    url: "/v1/jobs",
    payload: makeJobPayload()
  });

  assert.equal(response.statusCode, 202);
  const body = response.json();
  assert.equal(body.status, "queued");
  assert.ok(body.projectId);
  assert.ok(body.revisionId);
  assert.ok(body.jobId);
  assert.equal(queue.jobs.has(body.jobId), true);

  await app.close();
});

test("POST /v1/jobs/:id/cancel cancels queued job", async () => {
  const store = new FakeStore();
  const queue = new FakeQueue();
  const app = buildApp(store, queue);

  const createResponse = await app.inject({
    method: "POST",
    url: "/v1/jobs",
    payload: makeJobPayload()
  });
  const createBody = createResponse.json();

  const cancelResponse = await app.inject({
    method: "POST",
    url: `/v1/jobs/${createBody.jobId}/cancel`
  });

  assert.equal(cancelResponse.statusCode, 200);
  assert.equal(cancelResponse.json().status, "cancelled");

  const job = await store.getJob(createBody.jobId);
  assert.equal(job?.status, "cancelled");

  await app.close();
});

test("POST /v1/jobs/:id/retry requeues cancelled job", async () => {
  const store = new FakeStore();
  const queue = new FakeQueue();
  const app = buildApp(store, queue);

  const createResponse = await app.inject({
    method: "POST",
    url: "/v1/jobs",
    payload: makeJobPayload()
  });
  const createBody = createResponse.json();

  await app.inject({
    method: "POST",
    url: `/v1/jobs/${createBody.jobId}/cancel`
  });

  const retryResponse = await app.inject({
    method: "POST",
    url: `/v1/jobs/${createBody.jobId}/retry`
  });

  assert.equal(retryResponse.statusCode, 202);
  const retryBody = retryResponse.json();
  assert.equal(retryBody.status, "queued");
  assert.notEqual(retryBody.jobId, createBody.jobId);
  assert.equal(queue.jobs.has(retryBody.jobId), true);

  await app.close();
});

test("POST /v1/jobs/:id/retry rejects non-failed/non-cancelled jobs", async () => {
  const store = new FakeStore();
  const queue = new FakeQueue();
  const app = buildApp(store, queue);

  const createResponse = await app.inject({
    method: "POST",
    url: "/v1/jobs",
    payload: makeJobPayload()
  });
  const createBody = createResponse.json();

  store.setJobStatus(createBody.jobId, "running");

  const retryResponse = await app.inject({
    method: "POST",
    url: `/v1/jobs/${createBody.jobId}/retry`
  });

  assert.equal(retryResponse.statusCode, 409);

  await app.close();
});

test("POST /v1/jobs rejects unsupported edge-count combinations", async () => {
  const store = new FakeStore();
  const queue = new FakeQueue();
  const app = buildApp(store, queue);

  const invalidN = await app.inject({
    method: "POST",
    url: "/v1/jobs",
    payload: {
      ...makeJobPayload(),
      shapeDefinition: {
        ...baseShape,
        segments: 2,
        bottomSegments: 2,
        topSegments: 2
      }
    }
  });

  assert.equal(invalidN.statusCode, 400);
  assert.match(invalidN.body, /Invalid request payload/);

  const mismatched = await app.inject({
    method: "POST",
    url: "/v1/jobs",
    payload: {
      ...makeJobPayload(),
      shapeDefinition: {
        ...baseShape,
        segments: 6,
        bottomSegments: 6,
        topSegments: 5
      }
    }
  });

  assert.equal(mismatched.statusCode, 400);
  assert.match(mismatched.body, /Unsupported shape/);

  await app.close();
});

test("POST /v1/jobs reuses parent revision project when projectId is omitted", async () => {
  const store = new FakeStore();
  const queue = new FakeQueue();
  const app = buildApp(store, queue);

  const initial = await app.inject({
    method: "POST",
    url: "/v1/jobs",
    payload: makeJobPayload()
  });
  const first = initial.json();

  const followUp = await app.inject({
    method: "POST",
    url: "/v1/jobs",
    payload: {
      ...makeJobPayload(),
      parentRevisionId: first.revisionId
    }
  });

  assert.equal(followUp.statusCode, 202);
  const second = followUp.json();
  assert.equal(second.projectId, first.projectId);

  await app.close();
});

test("POST /v1/jobs rejects parent revision from a different project", async () => {
  const store = new FakeStore();
  const queue = new FakeQueue();
  const app = buildApp(store, queue);

  const seedJob = await app.inject({
    method: "POST",
    url: "/v1/jobs",
    payload: makeJobPayload()
  });
  const seed = seedJob.json();

  const otherProjectRes = await app.inject({
    method: "POST",
    url: "/v1/projects",
    payload: { name: "Other Project" }
  });
  const otherProject = otherProjectRes.json();

  const response = await app.inject({
    method: "POST",
    url: "/v1/jobs",
    payload: {
      ...makeJobPayload(otherProject.id),
      parentRevisionId: seed.revisionId
    }
  });

  assert.equal(response.statusCode, 409);
  assert.match(response.body, /different project/i);

  await app.close();
});

test("POST /v1/projects/:projectId/revisions rejects parent revision from another project", async () => {
  const store = new FakeStore();
  const queue = new FakeQueue();
  const app = buildApp(store, queue);

  const parentJobRes = await app.inject({
    method: "POST",
    url: "/v1/jobs",
    payload: makeJobPayload()
  });
  const parentJob = parentJobRes.json();

  const targetProjectRes = await app.inject({
    method: "POST",
    url: "/v1/projects",
    payload: { name: "Target Project" }
  });
  const targetProject = targetProjectRes.json();

  const response = await app.inject({
    method: "POST",
    url: `/v1/projects/${targetProject.id}/revisions`,
    payload: {
      shapeDefinition: baseShape,
      parentRevisionId: parentJob.revisionId
    }
  });

  assert.equal(response.statusCode, 409);
  assert.match(response.body, /different project/i);

  await app.close();
});
