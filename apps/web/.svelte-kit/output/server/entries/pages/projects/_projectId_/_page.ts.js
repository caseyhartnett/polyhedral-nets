import { error } from "@sveltejs/kit";
const load = async ({ fetch, params }) => {
  const projectRes = await fetch(`/api/projects/${params.projectId}`);
  if (!projectRes.ok) {
    throw error(projectRes.status, "Project not found");
  }
  const revisionsRes = await fetch(`/api/projects/${params.projectId}/revisions`);
  const jobsRes = await fetch("/api/jobs");
  const project = await projectRes.json();
  const revisions = revisionsRes.ok ? await revisionsRes.json() : { revisions: [] };
  const jobs = jobsRes.ok ? await jobsRes.json() : { jobs: [] };
  return {
    project,
    revisions: revisions.revisions ?? [],
    jobs: (jobs.jobs ?? []).filter((job) => job.projectId === params.projectId)
  };
};
export {
  load
};
