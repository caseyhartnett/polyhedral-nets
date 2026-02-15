import { toApiUrl } from '$lib/api.server';
import { proxyArtifact } from '$lib/proxy';

export async function GET({ params }) {
  return proxyArtifact(toApiUrl(`/v1/jobs/${params.jobId}/artifacts/stl`));
}
