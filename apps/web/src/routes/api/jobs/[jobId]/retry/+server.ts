import { json } from '@sveltejs/kit';
import { toApiUrl } from '$lib/api';

export async function POST({ params }) {
  const response = await fetch(toApiUrl(`/v1/jobs/${params.jobId}/retry`), {
    method: 'POST'
  });

  const data = await response.json();
  return json(data, { status: response.status });
}
