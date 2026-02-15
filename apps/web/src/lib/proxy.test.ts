import assert from "node:assert/strict";
import test from "node:test";
import { proxyArtifact, proxyJson } from "./proxy";

test("proxyJson forwards upstream JSON payload and status", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });

  try {
    const response = await proxyJson("http://127.0.0.1:3000/v1/jobs");
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("proxyJson returns 502 on upstream fetch failure", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("connect ECONNREFUSED");
  };

  try {
    const response = await proxyJson("http://127.0.0.1:3000/v1/jobs");
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.message, "Upstream API unavailable");
    assert.match(String(body.detail), /ECONNREFUSED/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("proxyArtifact forwards bytes and content headers", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=test.pdf"
      }
    });

  try {
    const response = await proxyArtifact("http://127.0.0.1:3000/v1/jobs/abc/artifacts/pdf");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(
      response.headers.get("content-disposition"),
      "attachment; filename=test.pdf"
    );
    assert.deepEqual(
      Array.from(new Uint8Array(await response.arrayBuffer())),
      [1, 2, 3, 4]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
