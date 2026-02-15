import { toApiUrl } from '$lib/api.server';
import { proxyJson } from '$lib/proxy';

export async function POST({ params }) {
  return proxyJson(toApiUrl(`/v1/jobs/${params.jobId}/cancel`), {
    method: 'POST'
  });
}
