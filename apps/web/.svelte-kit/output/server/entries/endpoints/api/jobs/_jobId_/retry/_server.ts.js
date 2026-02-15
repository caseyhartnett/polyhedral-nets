import { json } from "@sveltejs/kit";
import { t as toApiUrl } from "../../../../../../chunks/api.js";
async function POST({ params }) {
  const response = await fetch(toApiUrl(`/v1/jobs/${params.jobId}/retry`), {
    method: "POST"
  });
  const data = await response.json();
  return json(data, { status: response.status });
}
export {
  POST
};
