<script lang="ts">
  export let data: {
    project: {
      project: { id: string; name: string; createdAt: string };
      revisionsCount: number;
      jobsCount: number;
      latestRevision: { id: string } | null;
      latestJob: { jobId: string; status: string } | null;
    };
    revisions: Array<{ id: string; createdAt: string; shapeDefinition: { height: number; bottomWidth: number; topWidth: number } }>;
    jobs: Array<{
      jobId: string;
      status: string;
      createdAt: string;
      artifacts?: { hasSvg?: boolean; hasPdf?: boolean; hasStl?: boolean };
    }>;
  };
</script>

<svelte:head>
  <title>{data.project.project.name} • Pottery Pattern CAD</title>
</svelte:head>

<main>
  <a href="/">← Back</a>
  <h1>{data.project.project.name}</h1>
  <p>
    Created {new Date(data.project.project.createdAt).toLocaleString()} • Revisions {data.project.revisionsCount} • Jobs {data.project.jobsCount}
  </p>

  <section>
    <h2>Recent Revisions</h2>
    {#if data.revisions.length === 0}
      <p>No revisions.</p>
    {:else}
      <ul>
        {#each data.revisions.slice(0, 20) as rev}
          <li>{rev.id.slice(0, 8)} • {new Date(rev.createdAt).toLocaleString()} • H{rev.shapeDefinition.height}/BW{rev.shapeDefinition.bottomWidth}/TW{rev.shapeDefinition.topWidth}</li>
        {/each}
      </ul>
    {/if}
  </section>

  <section>
    <h2>Recent Jobs</h2>
    {#if data.jobs.length === 0}
      <p>No jobs.</p>
    {:else}
      <ul>
        {#each data.jobs.slice(0, 30) as job}
          <li>
            {job.jobId.slice(0, 8)} • {job.status} • {new Date(job.createdAt).toLocaleString()}
            {#if job.artifacts?.hasSvg}<a href={`/api/jobs/${job.jobId}/svg`} target="_blank" rel="noreferrer">SVG</a>{/if}
            {#if job.artifacts?.hasPdf}<a href={`/api/jobs/${job.jobId}/pdf`} target="_blank" rel="noreferrer">PDF</a>{/if}
            {#if job.artifacts?.hasStl}<a href={`/api/jobs/${job.jobId}/stl`} target="_blank" rel="noreferrer">STL</a>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
    background: linear-gradient(150deg, #f5fbff, #f5efe1);
    color: #1f2937;
  }

  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 1rem;
  }

  section {
    background: rgba(255, 255, 255, 0.88);
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 0.8rem 1rem;
    margin-bottom: 1rem;
  }

  ul {
    margin: 0;
    padding-left: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  li a {
    margin-left: 0.5rem;
  }
</style>
