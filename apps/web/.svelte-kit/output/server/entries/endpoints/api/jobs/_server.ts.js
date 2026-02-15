import { p as proxyJson, t as toApiUrl } from "../../../../chunks/proxy.js";
async function GET() {
  return proxyJson(toApiUrl("/v1/jobs"));
}
async function POST({ request }) {
  const payload = await request.json();
  return proxyJson(toApiUrl("/v1/jobs"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}
export {
  GET,
  POST
};
