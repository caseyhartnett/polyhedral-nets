import { toApiUrl } from '$lib/api.server';
import { proxyJson } from '$lib/proxy';

export async function GET({ params }) {
  return proxyJson(toApiUrl(`/v1/projects/${params.projectId}/revisions`));
}

export async function POST({ params, request }) {
  const payload = await request.json();
  return proxyJson(toApiUrl(`/v1/projects/${params.projectId}/revisions`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}
