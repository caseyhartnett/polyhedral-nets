import { json } from "@sveltejs/kit";
function toApiUrl(pathname) {
  const base = (process.env.API_BASE_URL ?? "http://127.0.0.1:3000").trim().replace(/\/+$/, "");
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${path}`;
}
async function proxyJson(url, init) {
  try {
    const response = await fetch(url, init);
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return json(await response.json(), { status: response.status });
    }
    const textBody = await response.text();
    return json({ message: textBody || "Unexpected upstream response" }, { status: response.status });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown upstream error";
    return json({ message: "Upstream API unavailable", detail }, { status: 502 });
  }
}
async function proxyArtifact(url) {
  try {
    const response = await fetch(url);
    const body = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const contentDisposition = response.headers.get("content-disposition");
    const headers = new Headers({ "Content-Type": contentType });
    if (contentDisposition) {
      headers.set("Content-Disposition", contentDisposition);
    }
    return new Response(body, {
      status: response.status,
      headers
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown upstream error";
    return json({ message: "Upstream API unavailable", detail }, { status: 502 });
  }
}
export {
  proxyArtifact as a,
  proxyJson as p,
  toApiUrl as t
};
