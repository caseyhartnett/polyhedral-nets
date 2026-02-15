import { p as proxyJson, t as toApiUrl } from "../../../../../chunks/proxy.js";
async function GET({ params }) {
  return proxyJson(toApiUrl(`/v1/jobs/${params.jobId}`));
}
export {
  GET
};
