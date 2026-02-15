import { p as proxyJson, t as toApiUrl } from "../../../../../chunks/proxy.js";
async function GET({ params }) {
  return proxyJson(toApiUrl(`/v1/projects/${params.projectId}`));
}
export {
  GET
};
