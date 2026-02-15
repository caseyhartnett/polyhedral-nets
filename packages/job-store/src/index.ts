import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import type {
  CanonicalGeometry,
  CreateJobRequest,
  ExportFormat,
  JobStatus,
  Revision,
  ShapeDefinition
} from "@torrify/shared-types";

export interface StoredJob {
  id: string;
  projectId: string;
  revisionId: string;
  status: JobStatus;
  payload: CreateJobRequest;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  geometry?: CanonicalGeometry;
  artifacts: {
    svgPath?: string;
    pdfPath?: string;
    stlPath?: string;
  };
}

export interface ArtifactMap {
  svg?: string;
  pdf?: string;
  stl?: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: string;
}

function toIso(value: string | Date): string {
  return typeof value === "string" ? value : value.toISOString();
}

const DEFAULT_DB_URL = "postgres://torrify:torrify@127.0.0.1:5432/torrify";

export class PgJobStore {
  private readonly pool: Pool;
  private readonly artifactsDir: string;

  constructor(
    databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DB_URL,
    artifactsDir = path.resolve(process.cwd(), process.env.TORRIFY_DATA_DIR ?? "data", "artifacts")
  ) {
    this.pool = new Pool({ connectionString: databaseUrl });
    this.artifactsDir = artifactsDir;
  }

  async init(): Promise<void> {
    await mkdir(this.artifactsDir, { recursive: true });

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS revisions (
        id UUID PRIMARY KEY,
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        parent_revision_id UUID REFERENCES revisions(id) ON DELETE SET NULL,
        shape_definition JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS export_jobs (
        id UUID PRIMARY KEY,
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        revision_id UUID NOT NULL REFERENCES revisions(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        payload JSONB NOT NULL,
        geometry JSONB,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS artifacts (
        id UUID PRIMARY KEY,
        job_id UUID NOT NULL REFERENCES export_jobs(id) ON DELETE CASCADE,
        format TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (job_id, format)
      );
    `);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async createProject(id: string, name: string): Promise<ProjectRecord> {
    const result = await this.pool.query(
      `INSERT INTO projects (id, name) VALUES ($1, $2) RETURNING id, name, created_at`,
      [id, name]
    );
    const row = result.rows[0];
    return { id: row.id, name: row.name, createdAt: toIso(row.created_at) };
  }

  async listProjects(): Promise<ProjectRecord[]> {
    const result = await this.pool.query(
      `SELECT id, name, created_at FROM projects ORDER BY created_at DESC`
    );
    return result.rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      name: String(row.name),
      createdAt: toIso(String(row.created_at))
    }));
  }

  async getProject(projectId: string): Promise<ProjectRecord | undefined> {
    const result = await this.pool.query(
      `SELECT id, name, created_at FROM projects WHERE id = $1`,
      [projectId]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return { id: row.id, name: row.name, createdAt: toIso(row.created_at) };
  }

  async createRevision(
    id: string,
    projectId: string,
    shapeDefinition: ShapeDefinition,
    parentRevisionId?: string
  ): Promise<Revision> {
    const result = await this.pool.query(
      `
      INSERT INTO revisions (id, project_id, parent_revision_id, shape_definition)
      VALUES ($1, $2, $3, $4)
      RETURNING id, project_id, parent_revision_id, shape_definition, created_at
      `,
      [id, projectId, parentRevisionId ?? null, shapeDefinition]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      projectId: row.project_id,
      parentRevisionId: row.parent_revision_id,
      shapeDefinition: row.shape_definition,
      createdAt: toIso(row.created_at)
    };
  }

  async listRevisions(projectId: string): Promise<Revision[]> {
    const result = await this.pool.query(
      `
      SELECT id, project_id, parent_revision_id, shape_definition, created_at
      FROM revisions
      WHERE project_id = $1
      ORDER BY created_at DESC
      `,
      [projectId]
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      projectId: String(row.project_id),
      parentRevisionId: (row.parent_revision_id as string | null) ?? null,
      shapeDefinition: row.shape_definition as ShapeDefinition,
      createdAt: toIso(String(row.created_at))
    }));
  }

  async getRevision(revisionId: string): Promise<Revision | undefined> {
    const result = await this.pool.query(
      `
      SELECT id, project_id, parent_revision_id, shape_definition, created_at
      FROM revisions
      WHERE id = $1
      `,
      [revisionId]
    );
    const row = result.rows[0];
    if (!row) return undefined;

    return {
      id: row.id,
      projectId: row.project_id,
      parentRevisionId: row.parent_revision_id,
      shapeDefinition: row.shape_definition,
      createdAt: toIso(row.created_at)
    };
  }

  async createQueuedJob(
    jobId: string,
    projectId: string,
    revisionId: string,
    payload: CreateJobRequest
  ): Promise<StoredJob> {
    const result = await this.pool.query(
      `
      INSERT INTO export_jobs (id, project_id, revision_id, status, payload)
      VALUES ($1, $2, $3, 'queued', $4)
      RETURNING id, project_id, revision_id, status, payload, created_at, updated_at, started_at, completed_at, error, geometry
      `,
      [jobId, projectId, revisionId, payload]
    );

    return this.rowToJob(result.rows[0], []);
  }

  async markRunning(jobId: string): Promise<boolean> {
    const result = await this.pool.query(
      `
      UPDATE export_jobs
      SET status = 'running', started_at = now(), updated_at = now()
      WHERE id = $1 AND status = 'queued'
      `,
      [jobId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markFailed(jobId: string, message: string): Promise<void> {
    await this.pool.query(
      `
      UPDATE export_jobs
      SET status = 'failed', error = $2, completed_at = now(), updated_at = now()
      WHERE id = $1 AND status = 'running'
      `,
      [jobId, message]
    );
  }

  async markCancelled(jobId: string): Promise<boolean> {
    const result = await this.pool.query(
      `
      UPDATE export_jobs
      SET status = 'cancelled', completed_at = now(), updated_at = now()
      WHERE id = $1 AND status IN ('queued', 'running')
      `,
      [jobId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  private artifactPath(jobId: string, format: ExportFormat): string {
    return path.join(this.artifactsDir, `${jobId}.${format}`);
  }

  private async persistArtifact(jobId: string, format: ExportFormat, content: string): Promise<string> {
    const filePath = this.artifactPath(jobId, format);
    await writeFile(filePath, content, "utf8");

    await this.pool.query(
      `
      INSERT INTO artifacts (id, job_id, format, storage_path)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (job_id, format)
      DO UPDATE SET storage_path = EXCLUDED.storage_path
      `,
      [crypto.randomUUID(), jobId, format, filePath]
    );

    return filePath;
  }

  async markSucceeded(jobId: string, geometry: CanonicalGeometry, artifacts: ArtifactMap): Promise<void> {
    if (artifacts.svg) {
      await this.persistArtifact(jobId, "svg", artifacts.svg);
    }
    if (artifacts.pdf) {
      await this.persistArtifact(jobId, "pdf", artifacts.pdf);
    }
    if (artifacts.stl) {
      await this.persistArtifact(jobId, "stl", artifacts.stl);
    }

    await this.pool.query(
      `
      UPDATE export_jobs
      SET status = 'succeeded', geometry = $2, completed_at = now(), updated_at = now()
      WHERE id = $1 AND status = 'running'
      `,
      [jobId, geometry]
    );
  }

  private async artifactsByJob(jobId: string): Promise<Array<{ format: string; storagePath: string }>> {
    const result = await this.pool.query(
      `SELECT format, storage_path FROM artifacts WHERE job_id = $1`,
      [jobId]
    );
    return result.rows.map((row: Record<string, unknown>) => ({
      format: String(row.format),
      storagePath: String(row.storage_path)
    }));
  }

  private rowToJob(row: Record<string, unknown>, artifacts: Array<{ format: string; storagePath: string }>): StoredJob {
    const artifactMap: StoredJob["artifacts"] = {};
    for (const artifact of artifacts) {
      if (artifact.format === "svg") artifactMap.svgPath = artifact.storagePath;
      if (artifact.format === "pdf") artifactMap.pdfPath = artifact.storagePath;
      if (artifact.format === "stl") artifactMap.stlPath = artifact.storagePath;
    }

    return {
      id: String(row.id),
      projectId: String(row.project_id),
      revisionId: String(row.revision_id),
      status: row.status as JobStatus,
      payload: row.payload as CreateJobRequest,
      createdAt: toIso(row.created_at as string),
      updatedAt: toIso(row.updated_at as string),
      startedAt: row.started_at ? toIso(row.started_at as string) : undefined,
      completedAt: row.completed_at ? toIso(row.completed_at as string) : undefined,
      error: (row.error as string | null) ?? undefined,
      geometry: (row.geometry as CanonicalGeometry | null) ?? undefined,
      artifacts: artifactMap
    };
  }

  async getJob(jobId: string): Promise<StoredJob | undefined> {
    const jobResult = await this.pool.query(
      `
      SELECT id, project_id, revision_id, status, payload, created_at, updated_at, started_at, completed_at, error, geometry
      FROM export_jobs
      WHERE id = $1
      `,
      [jobId]
    );

    const row = jobResult.rows[0];
    if (!row) return undefined;

    const artifacts = await this.artifactsByJob(jobId);
    return this.rowToJob(row, artifacts);
  }

  async listJobs(): Promise<StoredJob[]> {
    const jobResult = await this.pool.query(
      `
      SELECT id, project_id, revision_id, status, payload, created_at, updated_at, started_at, completed_at, error, geometry
      FROM export_jobs
      ORDER BY created_at DESC
      LIMIT 200
      `
    );

    const out: StoredJob[] = [];
    for (const row of jobResult.rows) {
      const jobId = String(row.id);
      const artifacts = await this.artifactsByJob(jobId);
      out.push(this.rowToJob(row, artifacts));
    }
    return out;
  }

  async listJobsByProject(projectId: string): Promise<StoredJob[]> {
    const jobResult = await this.pool.query(
      `
      SELECT id, project_id, revision_id, status, payload, created_at, updated_at, started_at, completed_at, error, geometry
      FROM export_jobs
      WHERE project_id = $1
      ORDER BY created_at DESC
      LIMIT 500
      `,
      [projectId]
    );

    const out: StoredJob[] = [];
    for (const row of jobResult.rows) {
      const jobId = String(row.id);
      const artifacts = await this.artifactsByJob(jobId);
      out.push(this.rowToJob(row, artifacts));
    }
    return out;
  }

  async readArtifact(jobId: string, format: ExportFormat): Promise<string | undefined> {
    const result = await this.pool.query(
      `SELECT storage_path FROM artifacts WHERE job_id = $1 AND format = $2`,
      [jobId, format]
    );

    const row = result.rows[0];
    if (!row) return undefined;

    return readFile(String(row.storage_path), "utf8");
  }
}
