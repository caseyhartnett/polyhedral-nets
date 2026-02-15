import { json } from "@sveltejs/kit";
import { t as toApiUrl } from "../../../../../chunks/api.js";
async function GET({ params }) {
  const response = await fetch(toApiUrl(`/v1/jobs/${params.jobId}`));
  const data = await response.json();
  return json(data, { status: response.status });
}
export {
  GET
};
