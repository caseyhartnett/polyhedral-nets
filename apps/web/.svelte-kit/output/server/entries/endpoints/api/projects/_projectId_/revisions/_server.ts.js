import { json } from "@sveltejs/kit";
import { t as toApiUrl } from "../../../../../../chunks/api.js";
async function GET({ params }) {
  const response = await fetch(toApiUrl(`/v1/projects/${params.projectId}/revisions`));
  const data = await response.json();
  return json(data, { status: response.status });
}
async function POST({ params, request }) {
  const payload = await request.json();
  const response = await fetch(toApiUrl(`/v1/projects/${params.projectId}/revisions`), {
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
