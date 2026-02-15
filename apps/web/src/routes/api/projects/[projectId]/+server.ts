import { json } from '@sveltejs/kit';
import { toApiUrl } from '$lib/api';

export async function GET({ params }) {
  const response = await fetch(toApiUrl(`/v1/projects/${params.projectId}`));
  const data = await response.json();
  return json(data, { status: response.status });
}
