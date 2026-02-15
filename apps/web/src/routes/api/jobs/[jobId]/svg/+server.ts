import { toApiUrl } from '$lib/api';

export async function GET({ params }) {
  const response = await fetch(toApiUrl(`/v1/jobs/${params.jobId}/artifacts/svg`));
  const body = await response.text();

  return new Response(body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'text/plain'
    }
  });
}
