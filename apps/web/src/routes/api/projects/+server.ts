import { toApiUrl } from '$lib/api.server';
import { proxyJson } from '$lib/proxy';

export async function GET() {
  return proxyJson(toApiUrl('/v1/projects'));
}

export async function POST({ request }) {
  const payload = await request.json();
  return proxyJson(toApiUrl('/v1/projects'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}
