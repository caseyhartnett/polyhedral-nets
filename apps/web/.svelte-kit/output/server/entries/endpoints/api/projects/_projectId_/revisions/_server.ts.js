import { p as proxyJson, t as toApiUrl } from "../../../../../../chunks/proxy.js";
async function GET({ params }) {
  return proxyJson(toApiUrl(`/v1/projects/${params.projectId}/revisions`));
}
async function POST({ params, request }) {
  const payload = await request.json();
  return proxyJson(toApiUrl(`/v1/projects/${params.projectId}/revisions`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}
export {
  GET,
  POST
};
