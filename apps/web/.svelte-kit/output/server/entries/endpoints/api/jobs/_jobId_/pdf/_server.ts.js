import { a as proxyArtifact, t as toApiUrl } from "../../../../../../chunks/proxy.js";
async function GET({ params }) {
  return proxyArtifact(toApiUrl(`/v1/jobs/${params.jobId}/artifacts/pdf`));
}
export {
  GET
};
