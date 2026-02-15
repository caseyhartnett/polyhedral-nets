import assert from "node:assert/strict";
import test from "node:test";
import { GET as getJobs, POST as postJobs } from "./jobs/+server";
import { GET as getPdfArtifact } from "./jobs/[jobId]/pdf/+server";

test("jobs GET route proxies to API_BASE_URL /v1/jobs", async () => {
  const originalFetch = globalThis.fetch;
  const originalBase = process.env.API_BASE_URL;
  process.env.API_BASE_URL = "http://api.internal:3000///";

  let capturedUrl = "";
  globalThis.fetch = async (input) => {
    capturedUrl = String(input);
    return new Response(JSON.stringify({ count: 0, jobs: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const response = await getJobs();
    assert.equal(capturedUrl, "http://api.internal:3000/v1/jobs");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { count: 0, jobs: [] });
  } finally {
    globalThis.fetch = originalFetch;
    process.env.API_BASE_URL = originalBase;
  }
});

test("jobs POST route forwards request body and method", async () => {
  const originalFetch = globalThis.fetch;
  const payload = { exportFormats: ["svg"] };

  let capturedMethod = "";
  let capturedBody = "";
  globalThis.fetch = async (_input, init) => {
    capturedMethod = String(init?.method ?? "");
    capturedBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ queued: true }), {
      status: 202,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const request = new Request("http://localhost/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const response = await postJobs({ request } as Parameters<typeof postJobs>[0]);
    assert.equal(capturedMethod, "POST");
    assert.deepEqual(JSON.parse(capturedBody), payload);
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { queued: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("artifact route preserves binary payloads", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(new Uint8Array([9, 8, 7]), {
      status: 200,
      headers: { "Content-Type": "application/pdf" }
    });

  try {
    const response = await getPdfArtifact({
      params: { jobId: "job-123" }
    } as Parameters<typeof getPdfArtifact>[0]);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.deepEqual(
      Array.from(new Uint8Array(await response.arrayBuffer())),
      [9, 8, 7]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
