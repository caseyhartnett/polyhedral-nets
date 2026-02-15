import { json } from "@sveltejs/kit";
import { t as toApiUrl } from "../../../../chunks/api.js";
async function GET() {
  const response = await fetch(toApiUrl("/v1/projects"));
  const data = await response.json();
  return json(data, { status: response.status });
}
async function POST({ request }) {
  const payload = await request.json();
  const response = await fetch(toApiUrl("/v1/projects"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  return json(data, { status: response.status });
}
export {
  GET,
  POST
};
