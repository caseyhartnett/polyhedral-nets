import { p as proxyJson, t as toApiUrl } from "../../../../../../chunks/proxy.js";
async function POST({ params }) {
  return proxyJson(toApiUrl(`/v1/jobs/${params.jobId}/retry`), {
    method: "POST"
  });
}
export {
  POST
};
