import type {
  CreateJobRequest,
  CreateJobResponse
} from "@torrify/shared-types";

export async function createJob(
  baseUrl: string,
  request: CreateJobRequest
): Promise<CreateJobResponse> {
  const response = await fetch(`${baseUrl}/v1/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(`Failed to create job: ${response.status}`);
  }

  return (await response.json()) as CreateJobResponse;
}
