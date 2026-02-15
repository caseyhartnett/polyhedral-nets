<script lang="ts">
  import { onMount } from 'svelte';
  import { buildTemplatePreview, buildWireframePreview } from '$lib/preview';

  type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  type ExportFormat = 'svg' | 'pdf' | 'stl';
  type ShapeBuilderMode = 'legacy' | 'polyhedron';
  type PolyhedronInputMode = 'catalog' | 'family';
  type PolyhedronPreset =
    | 'tetrahedron'
    | 'cube'
    | 'octahedron'
    | 'icosahedron'
    | 'dodecahedron'
    | 'cuboctahedron'
    | 'truncatedOctahedron'
    | 'regularPrism'
    | 'regularAntiprism'
    | 'regularBipyramid';
  type PolyhedronFamilyPreset = 'regularPrism' | 'regularAntiprism' | 'regularBipyramid';

  interface PolyhedronDefinition {
    preset: PolyhedronPreset;
    edgeLength: number;
    faceMode: 'uniform' | 'mixed';
    ringSides?: number;
  }

  interface ShapeDefinition {
    schemaVersion: '1.0';
    height: number;
    bottomWidth: number;
    topWidth: number;
    thickness: number;
    units: 'mm' | 'in';
    seamMode: 'straight' | 'overlap' | 'tabbed';
    allowance: number;
    notches: unknown[];
    profilePoints: unknown[];
    generationMode: ShapeBuilderMode;
    polyhedron?: PolyhedronDefinition;
    segments: number;
    bottomSegments: number;
    topSegments: number;
  }

  interface Project {
    id: string;
    name: string;
    createdAt: string;
  }

  interface Revision {
    id: string;
    projectId: string;
    parentRevisionId: string | null;
    shapeDefinition: ShapeDefinition;
    createdAt: string;
  }

  interface JobResponse {
    jobId: string;
    projectId: string;
    revisionId: string;
    status: JobStatus;
    error?: string;
    artifacts?: { hasSvg?: boolean; hasPdf?: boolean; hasStl?: boolean };
  }

  interface ProjectSummary {
    project: Project;
    revisionsCount: number;
    jobsCount: number;
    latestRevision: Revision | null;
    latestJob:
      | {
          jobId: string;
          revisionId: string;
          status: JobStatus;
          createdAt: string;
          updatedAt: string;
        }
      | null;
  }

  interface JobsListResponse {
    jobs: Array<{
      jobId: string;
      projectId: string;
      revisionId: string;
      status: JobStatus;
      createdAt: string;
      shapeDefinition: ShapeDefinition;
      artifacts?: { hasSvg?: boolean; hasPdf?: boolean; hasStl?: boolean };
    }>;
  }

  interface PolyhedronCatalogOption {
    key: string;
    label: string;
    faces: string;
    preset: PolyhedronPreset;
    ringSides?: number;
  }

  interface PolyhedronFamilyOption {
    value: PolyhedronFamilyPreset;
    label: string;
    faces: string;
    minSides: number;
    maxSides: number;
    defaultSides: number;
  }

  const POLYHEDRON_ALL_PRESETS: PolyhedronPreset[] = [
    'tetrahedron',
    'cube',
    'octahedron',
    'icosahedron',
    'dodecahedron',
    'cuboctahedron',
    'truncatedOctahedron',
    'regularPrism',
    'regularAntiprism',
    'regularBipyramid'
  ];

  const POLYHEDRON_CATALOG_OPTIONS: PolyhedronCatalogOption[] = [
    { key: 'cube', label: 'Cube', faces: '6 squares', preset: 'cube' },
    { key: 'tetrahedron', label: 'Tetrahedron', faces: '4 triangles', preset: 'tetrahedron' },
    { key: 'octahedron', label: 'Octahedron', faces: '8 triangles', preset: 'octahedron' },
    { key: 'icosahedron', label: 'Icosahedron', faces: '20 triangles', preset: 'icosahedron' },
    { key: 'dodecahedron', label: 'Dodecahedron', faces: '12 pentagons', preset: 'dodecahedron' },
    { key: 'cuboctahedron', label: 'Cuboctahedron', faces: '8 triangles + 6 squares', preset: 'cuboctahedron' },
    { key: 'truncatedOctahedron', label: 'Truncated Octahedron', faces: '8 hexagons + 6 squares', preset: 'truncatedOctahedron' },
    { key: 'triPrism', label: 'Triangular Prism', faces: '2 triangles + 3 squares', preset: 'regularPrism', ringSides: 3 },
    { key: 'pentPrism', label: 'Pentagonal Prism', faces: '2 pentagons + 5 squares', preset: 'regularPrism', ringSides: 5 },
    { key: 'hexPrism', label: 'Hexagonal Prism', faces: '2 hexagons + 6 squares', preset: 'regularPrism', ringSides: 6 },
    { key: 'squareAntiprism', label: 'Square Antiprism', faces: '2 squares + 8 triangles', preset: 'regularAntiprism', ringSides: 4 },
    { key: 'pentAntiprism', label: 'Pentagonal Antiprism', faces: '2 pentagons + 10 triangles', preset: 'regularAntiprism', ringSides: 5 },
    { key: 'triBipyramid', label: 'Triangular Bipyramid', faces: '6 triangles', preset: 'regularBipyramid', ringSides: 3 },
    { key: 'pentBipyramid', label: 'Pentagonal Bipyramid', faces: '10 triangles', preset: 'regularBipyramid', ringSides: 5 }
  ];

  const POLYHEDRON_FAMILY_OPTIONS: PolyhedronFamilyOption[] = [
    { value: 'regularPrism', label: 'Regular N-gon Prism', faces: '2 n-gons + n squares', minSides: 3, maxSides: 64, defaultSides: 6 },
    { value: 'regularAntiprism', label: 'Regular N-gon Antiprism', faces: '2 n-gons + 2n triangles', minSides: 3, maxSides: 64, defaultSides: 6 },
    { value: 'regularBipyramid', label: 'Regular N-gon Bipyramid', faces: '2n triangles', minSides: 3, maxSides: 5, defaultSides: 5 }
  ];

  function isFamilyPreset(preset: PolyhedronPreset): preset is PolyhedronFamilyPreset {
    return preset === 'regularPrism' || preset === 'regularAntiprism' || preset === 'regularBipyramid';
  }

  function familyOptionForPreset(preset: PolyhedronFamilyPreset): PolyhedronFamilyOption {
    return POLYHEDRON_FAMILY_OPTIONS.find((option) => option.value === preset) ?? POLYHEDRON_FAMILY_OPTIONS[0];
  }

  function clampSidesForPreset(preset: PolyhedronPreset, ringSides?: number): number {
    if (!isFamilyPreset(preset)) {
      return 6;
    }

    const family = familyOptionForPreset(preset);
    const value = Math.floor(Number(ringSides) || family.defaultSides);
    return Math.max(family.minSides, Math.min(family.maxSides, value));
  }

  function deriveFaceMode(preset: PolyhedronPreset, ringSides: number): 'uniform' | 'mixed' {
    if (preset === 'cuboctahedron' || preset === 'truncatedOctahedron') {
      return 'mixed';
    }
    if (preset === 'regularPrism') {
      return ringSides === 4 ? 'uniform' : 'mixed';
    }
    if (preset === 'regularAntiprism') {
      return ringSides === 3 ? 'uniform' : 'mixed';
    }
    if (preset === 'regularBipyramid') {
      return 'uniform';
    }
    return 'uniform';
  }

  const initialPolyhedron: PolyhedronDefinition = {
    preset: 'cube',
    edgeLength: 60,
    faceMode: 'uniform',
    ringSides: 6
  };

  const initialShapeDefinition: ShapeDefinition = {
    schemaVersion: '1.0',
    height: 160,
    bottomWidth: 90,
    topWidth: 120,
    thickness: 6,
    units: 'mm',
    seamMode: 'straight',
    allowance: 8,
    notches: [],
    profilePoints: [],
    generationMode: 'legacy',
    polyhedron: { ...initialPolyhedron },
    segments: 6,
    bottomSegments: 6,
    topSegments: 6
  };

  let shapeDefinition = { ...initialShapeDefinition };
  let exportFormats: ExportFormat[] = ['svg'];
  let svgLayers = ['cut', 'score', 'guide'];

  let creating = false;
  let historyLoading = false;
  let projectsLoading = false;
  let revisionsLoading = false;
  let jobId = '';
  let status: JobStatus | 'idle' = 'idle';
  let error = '';
  let svgUrl = '';

  let projects: Project[] = [];
  let selectedProjectId = '';
  let revisions: Revision[] = [];
  let selectedParentRevisionId = '';
  let newProjectName = '';
  let projectSummary: ProjectSummary | null = null;

  let history: JobsListResponse['jobs'] = [];
  let onlySelectedProject = false;
  let builderMode: ShapeBuilderMode = 'legacy';
  let polyhedronInputMode: PolyhedronInputMode = 'catalog';
  let selectedCatalogKey = 'cube';
  let selectedFamilyPreset: PolyhedronFamilyPreset = 'regularPrism';
  let useSplitEdges = false;
  let yaw = -0.7;
  let pitch = 0.45;
  let rotating = false;
  let lastPointerX = 0;
  let lastPointerY = 0;

  $: baseSegments = Math.max(3, Math.floor(shapeDefinition.segments || 3));
  $: normalizedPolyhedron = normalizePolyhedron(shapeDefinition.polyhedron);
  $: activeFamily = isFamilyPreset(normalizedPolyhedron.preset) ? familyOptionForPreset(normalizedPolyhedron.preset) : null;
  $: resolvedShapeDefinition = {
    ...shapeDefinition,
    generationMode: builderMode,
    polyhedron: builderMode === 'polyhedron' ? normalizedPolyhedron : shapeDefinition.polyhedron,
    segments: baseSegments,
    bottomSegments: useSplitEdges ? Math.max(3, Math.floor(shapeDefinition.bottomSegments || baseSegments)) : baseSegments,
    topSegments: useSplitEdges ? Math.max(1, Math.floor(shapeDefinition.topSegments || baseSegments)) : baseSegments
  };
  $: liveTemplate = buildTemplatePreview(resolvedShapeDefinition);
  $: liveWireframe = buildWireframePreview(resolvedShapeDefinition, { yaw, pitch });
  $: effectiveBottomSegments = resolvedShapeDefinition.bottomSegments;
  $: effectiveTopSegments = resolvedShapeDefinition.topSegments;

  $: visibleHistory = onlySelectedProject && selectedProjectId
    ? history.filter((job) => job.projectId === selectedProjectId)
    : history;

  function normalizePolyhedron(polyhedron?: Partial<PolyhedronDefinition>): PolyhedronDefinition {
    const merged = { ...initialPolyhedron, ...polyhedron };
    const preset = POLYHEDRON_ALL_PRESETS.includes((merged.preset as PolyhedronPreset) ?? 'cube')
      ? (merged.preset as PolyhedronPreset)
      : 'cube';
    const ringSides = clampSidesForPreset(preset, merged.ringSides);
    return {
      preset,
      edgeLength: Math.max(1, Number(merged.edgeLength) || initialPolyhedron.edgeLength),
      faceMode: deriveFaceMode(preset, ringSides),
      ringSides: isFamilyPreset(preset) ? ringSides : undefined
    };
  }

  function syncPolyhedronUiState(polyhedron?: Partial<PolyhedronDefinition>) {
    const normalized = normalizePolyhedron(polyhedron);
    const match = POLYHEDRON_CATALOG_OPTIONS.find(
      (option) => option.preset === normalized.preset && (option.ringSides ?? undefined) === (normalized.ringSides ?? undefined)
    );

    if (match) {
      polyhedronInputMode = 'catalog';
      selectedCatalogKey = match.key;
      return;
    }

    if (isFamilyPreset(normalized.preset)) {
      polyhedronInputMode = 'family';
      selectedFamilyPreset = normalized.preset;
      return;
    }

    polyhedronInputMode = 'catalog';
    selectedCatalogKey = 'cube';
  }

  function applyCatalogSelection(key: string) {
    const option = POLYHEDRON_CATALOG_OPTIONS.find((entry) => entry.key === key) ?? POLYHEDRON_CATALOG_OPTIONS[0];
    selectedCatalogKey = option.key;
    polyhedronInputMode = 'catalog';
    shapeDefinition = {
      ...shapeDefinition,
      polyhedron: normalizePolyhedron({
        ...shapeDefinition.polyhedron,
        preset: option.preset,
        ringSides: option.ringSides
      })
    };
  }

  function applyFamilyPreset(preset: PolyhedronFamilyPreset) {
    const family = familyOptionForPreset(preset);
    selectedFamilyPreset = family.value;
    polyhedronInputMode = 'family';
    shapeDefinition = {
      ...shapeDefinition,
      polyhedron: normalizePolyhedron({
        ...shapeDefinition.polyhedron,
        preset: family.value,
        ringSides: family.defaultSides
      })
    };
  }

  function setBuilderMode(mode: ShapeBuilderMode) {
    builderMode = mode;
    if (mode === 'polyhedron') {
      shapeDefinition = { ...shapeDefinition, generationMode: mode, polyhedron: normalizePolyhedron(shapeDefinition.polyhedron) };
      syncPolyhedronUiState(shapeDefinition.polyhedron);
      useSplitEdges = false;
      return;
    }

    shapeDefinition = { ...shapeDefinition, generationMode: mode };
  }

  async function loadProjects() {
    projectsLoading = true;
    try {
      const response = await fetch('/api/projects');
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? 'Failed to load projects');

      projects = data.projects;
      if (!selectedProjectId && projects.length > 0) {
        selectedProjectId = projects[0].id;
        await loadRevisions(selectedProjectId);
        await loadProjectSummary(selectedProjectId);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Project load failed';
    } finally {
      projectsLoading = false;
    }
  }

  async function createProject() {
    if (!newProjectName.trim()) return;

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim() })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? 'Failed to create project');

      newProjectName = '';
      await loadProjects();
      selectedProjectId = data.id;
      await loadRevisions(selectedProjectId);
      await loadProjectSummary(selectedProjectId);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Project create failed';
    }
  }

  async function loadRevisions(projectId: string) {
    if (!projectId) {
      revisions = [];
      return;
    }

    revisionsLoading = true;
    try {
      const response = await fetch(`/api/projects/${projectId}/revisions`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? 'Failed to load revisions');

      revisions = data.revisions;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Revision load failed';
    } finally {
      revisionsLoading = false;
    }
  }

  async function loadProjectSummary(projectId: string) {
    if (!projectId) {
      projectSummary = null;
      return;
    }

    try {
      const response = await fetch(`/api/projects/${projectId}`);
      const data = (await response.json()) as ProjectSummary;
      if (!response.ok) throw new Error((data as { message?: string }).message ?? 'Failed to load project');
      projectSummary = data;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Project summary load failed';
    }
  }

  async function loadHistory() {
    historyLoading = true;

    try {
      const response = await fetch('/api/jobs');
      const data = (await response.json()) as JobsListResponse;
      if (!response.ok) {
        throw new Error('Failed to load history');
      }

      history = data.jobs;
    } catch (err) {
      error = err instanceof Error ? err.message : 'History load failed';
    } finally {
      historyLoading = false;
    }
  }

  function normalizeShapeDefinition(input: Partial<ShapeDefinition>): ShapeDefinition {
    const merged = { ...initialShapeDefinition, ...input };
    const base = Math.max(3, Math.floor(merged.segments || 3));
    return {
      ...merged,
      generationMode: merged.generationMode ?? 'legacy',
      polyhedron: normalizePolyhedron(merged.polyhedron),
      segments: base,
      bottomSegments: Math.max(3, Math.floor(merged.bottomSegments || base)),
      topSegments: Math.max(1, Math.floor(merged.topSegments || base))
    };
  }

  function loadParamsFromJob(job: JobsListResponse['jobs'][number]) {
    const normalized = normalizeShapeDefinition(job.shapeDefinition);
    shapeDefinition = normalized;
    builderMode = normalized.generationMode ?? 'legacy';
    if (builderMode === 'polyhedron') {
      syncPolyhedronUiState(normalized.polyhedron);
    }
    useSplitEdges =
      normalized.bottomSegments !== normalized.segments || normalized.topSegments !== normalized.segments;
    selectedProjectId = job.projectId;
    selectedParentRevisionId = job.revisionId;
    loadRevisions(job.projectId);
    loadProjectSummary(job.projectId);
  }

  async function forkJob(sourceJobId: string) {
    error = '';

    try {
      const response = await fetch(`/api/jobs/${sourceJobId}/fork`, {
        method: 'POST'
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message ?? 'Failed to fork job');
      }

      jobId = data.jobId;
      status = data.status;
      selectedProjectId = data.projectId;
      selectedParentRevisionId = data.revisionId;
      svgUrl = '';
      pollJob();
      loadHistory();
      loadRevisions(selectedProjectId);
      loadProjectSummary(selectedProjectId);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Fork failed';
    }
  }

  async function cancelJob(targetJobId: string) {
    try {
      const response = await fetch(`/api/jobs/${targetJobId}/cancel`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? 'Cancel failed');
      await loadHistory();
      if (targetJobId === jobId) {
        await pollJob();
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Cancel failed';
    }
  }

  async function retryJob(targetJobId: string) {
    try {
      const response = await fetch(`/api/jobs/${targetJobId}/retry`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? 'Retry failed');

      jobId = data.jobId;
      status = data.status;
      selectedProjectId = data.projectId;
      selectedParentRevisionId = data.revisionId;
      svgUrl = '';
      await loadHistory();
      await loadRevisions(selectedProjectId);
      await loadProjectSummary(selectedProjectId);
      await pollJob();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Retry failed';
    }
  }

  function toggleExport(format: ExportFormat) {
    if (exportFormats.includes(format)) {
      exportFormats = exportFormats.filter((f) => f !== format);
      return;
    }

    exportFormats = [...exportFormats, format];
  }

  async function submitJob() {
    if (exportFormats.length === 0) {
      error = 'Select at least one export format';
      return;
    }

    creating = true;
    error = '';
    svgUrl = '';

    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId || undefined,
          parentRevisionId: selectedParentRevisionId || undefined,
          shapeDefinition: resolvedShapeDefinition,
          exportFormats,
          svgLayers
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? 'Failed to create job');
      }

      jobId = data.jobId;
      status = data.status;
      selectedProjectId = data.projectId;
      selectedParentRevisionId = data.revisionId;
      pollJob();
      loadHistory();
      loadProjects();
      loadRevisions(data.projectId);
      loadProjectSummary(data.projectId);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unexpected error';
    } finally {
      creating = false;
    }
  }

  async function pollJob() {
    if (!jobId) return;

    const pollOnce = async () => {
      const response = await fetch(`/api/jobs/${jobId}`);
      const data = (await response.json()) as JobResponse;

      if (!response.ok) {
        throw new Error(data.error ?? 'Unable to fetch job status');
      }

      status = data.status;

      if (status === 'failed' || status === 'cancelled') {
        error = data.error ?? `Job ${status}`;
        loadHistory();
        return;
      }

      if (status === 'succeeded') {
        if (data.artifacts?.hasSvg) {
          svgUrl = `/api/jobs/${jobId}/svg`;
        }
        loadHistory();
        return;
      }

      setTimeout(pollOnce, 800);
    };

    try {
      await pollOnce();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Polling failed';
    }
  }

  onMount(() => {
    loadProjects();
    loadHistory();
  });

  function useRevision(revision: Revision) {
    const normalized = normalizeShapeDefinition(revision.shapeDefinition);
    shapeDefinition = normalized;
    builderMode = normalized.generationMode ?? 'legacy';
    if (builderMode === 'polyhedron') {
      syncPolyhedronUiState(normalized.polyhedron);
    }
    useSplitEdges =
      normalized.bottomSegments !== normalized.segments || normalized.topSegments !== normalized.segments;
    selectedParentRevisionId = revision.id;
  }

  function startRotate(event: PointerEvent) {
    rotating = true;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
  }

  function onRotate(event: PointerEvent) {
    if (!rotating) return;

    const dx = event.clientX - lastPointerX;
    const dy = event.clientY - lastPointerY;
    yaw += dx * 0.01;
    pitch = Math.max(-1.3, Math.min(1.3, pitch + dy * 0.01));
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
  }

  function endRotate() {
    rotating = false;
  }

  function resetView() {
    yaw = -0.7;
    pitch = 0.45;
  }
</script>

<svelte:head>
  <title>Pottery Pattern CAD</title>
</svelte:head>

<main>
  <section class="card">
    <h1>Pottery Pattern CAD</h1>
    <p class="sub">Project + revision aware slab template generation</p>

    <div class="row">
      <input placeholder="New project name" bind:value={newProjectName} />
      <button class="small" on:click={createProject}>Create</button>
    </div>

    <label>Project
      <select
        bind:value={selectedProjectId}
        on:change={() => {
          loadRevisions(selectedProjectId);
          loadProjectSummary(selectedProjectId);
        }}
      >
        <option value="">Auto-create project</option>
        {#each projects as project}
          <option value={project.id}>{project.name}</option>
        {/each}
      </select>
    </label>

    <label>Parent Revision
      <select bind:value={selectedParentRevisionId} disabled={!selectedProjectId || revisionsLoading}>
        <option value="">None</option>
        {#each revisions as revision}
          <option value={revision.id}>{revision.id.slice(0, 8)} • {new Date(revision.createdAt).toLocaleString()}</option>
        {/each}
      </select>
    </label>

    {#if projectSummary}
      <div class="project-summary">
        <div><strong>{projectSummary.project.name}</strong></div>
        <div class="muted">Revisions: {projectSummary.revisionsCount} • Jobs: {projectSummary.jobsCount}</div>
        {#if projectSummary.latestJob}
          <div class="muted">
            Latest job: {projectSummary.latestJob.jobId.slice(0, 8)} ({projectSummary.latestJob.status})
          </div>
        {/if}
        <div style="margin-top:0.35rem;">
          <a href={`/projects/${projectSummary.project.id}`} class="small link">Open Project Page</a>
        </div>
      </div>
    {/if}

    {#if revisions.length > 0}
      <div class="revisions-panel">
        <div class="muted">Recent revisions</div>
        <div class="revisions-list">
          {#each revisions.slice(0, 6) as revision}
            <button class="small rev-btn" on:click={() => useRevision(revision)}>
              {revision.id.slice(0, 8)} • H{revision.shapeDefinition.height} BW{revision.shapeDefinition.bottomWidth}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="builder-tabs">
      <button
        type="button"
        class="small"
        class:tab-active={builderMode === 'legacy'}
        on:click={() => setBuilderMode('legacy')}
      >
        Dimension Builder
      </button>
      <button
        type="button"
        class="small"
        class:tab-active={builderMode === 'polyhedron'}
        on:click={() => setBuilderMode('polyhedron')}
      >
        Polyhedron Templates
      </button>
    </div>

    {#if builderMode === 'legacy'}
      <div class="grid">
        <label>Height
          <input type="number" bind:value={shapeDefinition.height} min="1" />
        </label>
        <label>Bottom Width
          <input type="number" bind:value={shapeDefinition.bottomWidth} min="1" />
        </label>
        <label>Top Width
          <input type="number" bind:value={shapeDefinition.topWidth} min="1" />
        </label>
        <label>Segments
          <input type="number" bind:value={shapeDefinition.segments} min="3" max="256" />
        </label>
        <label class="split-toggle">
          <input type="checkbox" bind:checked={useSplitEdges} />
          Use separate top/bottom edges
        </label>
        {#if useSplitEdges}
          <label>Bottom Edges
            <input type="number" bind:value={shapeDefinition.bottomSegments} min="3" max="256" />
          </label>
          <label>Top Edges
            <input type="number" bind:value={shapeDefinition.topSegments} min="1" max="256" />
          </label>
        {/if}
      </div>
    {:else}
      <div class="grid">
        <div class="poly-subtabs">
          <button
            type="button"
            class="small"
            class:tab-active={polyhedronInputMode === 'catalog'}
            on:click={() => (polyhedronInputMode = 'catalog')}
          >
            Catalog
          </button>
          <button
            type="button"
            class="small"
            class:tab-active={polyhedronInputMode === 'family'}
            on:click={() => {
              polyhedronInputMode = 'family';
              if (!isFamilyPreset(normalizedPolyhedron.preset)) {
                applyFamilyPreset(selectedFamilyPreset);
              }
            }}
          >
            Family
          </button>
        </div>
      </div>

      <div class="grid">
        {#if polyhedronInputMode === 'catalog'}
          <label>Template Catalog
            <select value={selectedCatalogKey} on:change={(event) => applyCatalogSelection((event.currentTarget as HTMLSelectElement).value)}>
              {#each POLYHEDRON_CATALOG_OPTIONS as option}
                <option value={option.key}>{option.label} ({option.faces})</option>
              {/each}
            </select>
          </label>
        {:else}
          <label>Family
            <select value={selectedFamilyPreset} on:change={(event) => applyFamilyPreset((event.currentTarget as HTMLSelectElement).value as PolyhedronFamilyPreset)}>
              {#each POLYHEDRON_FAMILY_OPTIONS as family}
                <option value={family.value}>{family.label} ({family.faces})</option>
              {/each}
            </select>
          </label>
        {/if}
        <label>Face Edge Length
          <input
            type="number"
            min="1"
            step="0.1"
            value={normalizedPolyhedron.edgeLength}
            on:input={(event) => {
              const edgeLength = Number((event.currentTarget as HTMLInputElement).value);
              shapeDefinition = {
                ...shapeDefinition,
                polyhedron: {
                  ...normalizedPolyhedron,
                  edgeLength
                }
              };
            }}
          />
        </label>
        {#if polyhedronInputMode === 'family' && activeFamily}
          <label>N-gon Sides
            <input
              type="number"
              min={activeFamily.minSides}
              max={activeFamily.maxSides}
              step="1"
              value={normalizedPolyhedron.ringSides}
              on:input={(event) => {
                const ringSides = Number((event.currentTarget as HTMLInputElement).value);
                shapeDefinition = {
                  ...shapeDefinition,
                  polyhedron: {
                    ...normalizedPolyhedron,
                    ringSides
                  }
                };
              }}
            />
          </label>
        {/if}
        <label>Face Composition
          <input value={normalizedPolyhedron.faceMode === 'uniform' ? 'Uniform (single face type)' : 'Mixed face types'} disabled />
        </label>
      </div>
      <p class="muted">
        Catalog exposes only vetted solids. Family mode constrains side counts to valid ranges per family.
      </p>
      {#if normalizedPolyhedron.preset === 'regularPrism' && normalizedPolyhedron.ringSides === 6}
        <p class="muted">This is the hexagon + square case.</p>
      {/if}
    {/if}

    <div class="grid fabrication-grid">
      <label>Thickness
        <input type="number" bind:value={shapeDefinition.thickness} min="0.1" step="0.1" />
      </label>
      <label>Allowance
        <input type="number" bind:value={shapeDefinition.allowance} min="0" step="0.1" />
      </label>
      <label>Units
        <select bind:value={shapeDefinition.units}>
          <option value="mm">mm</option>
          <option value="in">in</option>
        </select>
      </label>
      <label>Seam Mode
        <select bind:value={shapeDefinition.seamMode}>
          <option value="straight">straight</option>
          <option value="overlap">overlap</option>
          <option value="tabbed">tabbed</option>
        </select>
      </label>
    </div>

    <div class="formats">
      <label><input type="checkbox" checked={exportFormats.includes('svg')} on:change={() => toggleExport('svg')} /> SVG</label>
      <label><input type="checkbox" checked={exportFormats.includes('pdf')} on:change={() => toggleExport('pdf')} /> PDF</label>
      <label><input type="checkbox" checked={exportFormats.includes('stl')} on:change={() => toggleExport('stl')} /> STL</label>
    </div>

    <button on:click={submitJob} disabled={creating || projectsLoading}>
      {creating ? 'Submitting...' : 'Generate Export Job'}
    </button>

    {#if jobId}
      <p><strong>Job:</strong> {jobId}</p>
      <p><strong>Status:</strong> {status}</p>
    {/if}

    {#if error}
      <p class="error">{error}</p>
    {/if}
  </section>

  <section class="card history">
    <div class="history-head">
      <h2>Job History</h2>
      <div class="history-tools">
        <label class="tiny-toggle">
          <input type="checkbox" bind:checked={onlySelectedProject} />
          This project
        </label>
        <button class="small" on:click={loadHistory} disabled={historyLoading}>
          {historyLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
    </div>

    {#if visibleHistory.length === 0}
      <p>No jobs yet.</p>
    {:else}
      <div class="history-list">
        {#each visibleHistory as job}
          <article class="history-item">
            <div>
              <strong>{job.status}</strong>
              <div class="muted">{job.jobId.slice(0, 8)} • {new Date(job.createdAt).toLocaleString()}</div>
              <div class="muted">Proj {job.projectId.slice(0, 8)} • Rev {job.revisionId.slice(0, 8)}</div>
            </div>
            <div class="actions">
              <button class="small" on:click={() => loadParamsFromJob(job)}>Load Params</button>
              <button class="small" on:click={() => forkJob(job.jobId)}>Fork</button>
              {#if job.status === 'queued' || job.status === 'running'}
                <button class="small" on:click={() => cancelJob(job.jobId)}>Cancel</button>
              {/if}
              {#if job.status === 'failed' || job.status === 'cancelled'}
                <button class="small" on:click={() => retryJob(job.jobId)}>Retry</button>
              {/if}
              {#if job.artifacts?.hasSvg}
                <a class="small link" href={`/api/jobs/${job.jobId}/svg`} target="_blank" rel="noreferrer">SVG</a>
              {/if}
              {#if job.artifacts?.hasPdf}
                <a class="small link" href={`/api/jobs/${job.jobId}/pdf`} target="_blank" rel="noreferrer">PDF</a>
              {/if}
              {#if job.artifacts?.hasStl}
                <a class="small link" href={`/api/jobs/${job.jobId}/stl`} target="_blank" rel="noreferrer">STL</a>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </section>

  <section class="card preview">
    <h2>Live Preview</h2>
    <p class="muted">2D and 3D update together from the current parameters.</p>
    {#if builderMode === 'polyhedron'}
      <p class="muted">
        Polyhedron preset: {normalizedPolyhedron.preset}
        {#if isFamilyPreset(normalizedPolyhedron.preset)}
          • sides: {normalizedPolyhedron.ringSides}
        {/if}
        • face mode: {normalizedPolyhedron.faceMode}
      </p>
    {:else if useSplitEdges}
      <p class="muted">Live preview uses bottom/top edge counts ({effectiveBottomSegments}/{effectiveTopSegments}).</p>
    {:else}
      <p class="muted">Split edges are off, so both ends use {baseSegments} edges.</p>
    {/if}

    <div class="preview-dual">
      <div class="preview-pane">
        <h3>2D Template</h3>
        <svg
          viewBox={`0 0 ${liveTemplate.width.toFixed(3)} ${liveTemplate.height.toFixed(3)}`}
          role="img"
          aria-label="Live 2D template preview"
        >
          {#each liveTemplate.paths as path}
            <path d={path.d} class={`layer-${path.layer}`} />
          {/each}
        </svg>
      </div>
      <div class="preview-pane">
        <div class="preview-pane-head">
          <h3>3D Form</h3>
          <button class="small" type="button" on:click={resetView}>Reset View</button>
        </div>
        <svg
          viewBox={`0 0 ${liveWireframe.width.toFixed(3)} ${liveWireframe.height.toFixed(3)}`}
          role="img"
          aria-label="Live 3D wireframe preview"
          class:rotating-active={rotating}
          on:pointerdown={startRotate}
          on:pointermove={onRotate}
          on:pointerup={endRotate}
          on:pointerleave={endRotate}
        >
          {#each liveWireframe.lines as line}
            <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} class="wire-line" />
          {/each}
        </svg>
        <div class="muted">Drag to rotate.</div>
      </div>
    </div>

    <h2>Exported SVG</h2>
    {#if svgUrl}
      <a href={svgUrl} target="_blank" rel="noreferrer">Open SVG</a>
      <object data={svgUrl} type="image/svg+xml" aria-label="Generated SVG template"></object>
    {:else}
      <p>No SVG yet. Submit or fork a job and wait for completion.</p>
    {/if}
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
    background: radial-gradient(circle at 20% 20%, #e9f4ff, #f7f3e8 45%, #efe4d4 100%);
    color: #1f2937;
  }

  main {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 420px 380px 1fr;
    gap: 1rem;
    padding: 1rem;
  }

  .card {
    background: rgba(255, 255, 255, 0.88);
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 1rem;
  }

  .row {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.7rem;
  }

  h1 {
    margin: 0;
    font-size: 1.35rem;
  }

  .sub {
    margin-top: 0.25rem;
    color: #475569;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
    margin: 1rem 0;
  }

  .fabrication-grid {
    margin-top: 0.2rem;
  }

  .builder-tabs {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.8rem;
  }

  .builder-tabs button {
    background: #d6f0ed;
    color: #0f4d47;
    border: 1px solid #9ed7cf;
  }

  .builder-tabs button.tab-active {
    background: #0f766e;
    color: #ffffff;
    border-color: #0f766e;
  }

  .poly-subtabs {
    display: flex;
    gap: 0.45rem;
    grid-column: 1 / -1;
    margin-bottom: 0.15rem;
  }

  .poly-subtabs button {
    background: #e8f2ff;
    color: #194578;
    border: 1px solid #bcd2f0;
  }

  .poly-subtabs button.tab-active {
    background: #1e4f90;
    color: #ffffff;
    border-color: #1e4f90;
  }

  .formats {
    display: flex;
    gap: 0.8rem;
    margin-bottom: 0.8rem;
  }

  .revisions-panel {
    border: 1px solid #dbe5f0;
    border-radius: 10px;
    padding: 0.55rem 0.65rem;
    margin-bottom: 0.75rem;
    background: rgba(251, 252, 255, 0.8);
  }

  .revisions-list {
    margin-top: 0.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .rev-btn {
    width: 100%;
    justify-content: flex-start;
  }

  .project-summary {
    border: 1px solid #dbe5f0;
    border-radius: 10px;
    padding: 0.55rem 0.65rem;
    margin-bottom: 0.75rem;
    background: rgba(248, 251, 255, 0.8);
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.9rem;
    margin-bottom: 0.45rem;
  }

  input,
  select {
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 0.5rem;
    font-size: 0.92rem;
  }

  input:disabled {
    background: #f8fafc;
    color: #475569;
  }

  button,
  .small.link {
    border: none;
    background: #0f766e;
    color: white;
    border-radius: 9px;
    padding: 0.62rem 0.85rem;
    font-size: 0.88rem;
    cursor: pointer;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .small {
    padding: 0.32rem 0.54rem;
    font-size: 0.78rem;
  }

  button:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .error {
    color: #b91c1c;
  }

  .history-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.4rem;
  }

  .history-tools {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .tiny-toggle {
    flex-direction: row;
    align-items: center;
    gap: 0.25rem;
    margin: 0;
    font-size: 0.78rem;
    color: #4b5563;
  }

  .split-toggle {
    flex-direction: row;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.2rem;
  }

  .history-list {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    max-height: 78vh;
    overflow: auto;
  }

  .history-item {
    border: 1px solid #dbe5f0;
    border-radius: 10px;
    padding: 0.6rem;
    display: flex;
    justify-content: space-between;
    gap: 0.55rem;
  }

  .muted {
    color: #64748b;
    font-size: 0.77rem;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.36rem;
    min-width: 86px;
  }

  .preview object {
    width: 100%;
    height: 46vh;
    border: 1px solid #dbeafe;
    border-radius: 10px;
    margin-top: 0.5rem;
    background: white;
  }

  .preview-dual {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.7rem;
    margin-top: 0.5rem;
    margin-bottom: 0.85rem;
  }

  .preview-pane {
    border: 1px solid #dbe5f0;
    border-radius: 10px;
    padding: 0.5rem;
    background: #fff;
  }

  .preview-pane h3 {
    margin: 0 0 0.4rem 0;
    font-size: 0.87rem;
    color: #334155;
  }

  .preview-pane-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.35rem;
  }

  .preview-pane svg {
    width: 100%;
    height: 260px;
    display: block;
    border: 1px solid #f1f5f9;
    border-radius: 8px;
    background:
      linear-gradient(#f8fafc 1px, transparent 1px) 0 0 / 100% 20px,
      linear-gradient(90deg, #f8fafc 1px, transparent 1px) 0 0 / 20px 100%,
      #ffffff;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }

  .preview-pane svg.rotating-active {
    cursor: grabbing;
  }

  .layer-cut {
    fill: none;
    stroke: #111827;
    stroke-width: 0.8;
  }

  .layer-score {
    fill: none;
    stroke: #0a66c2;
    stroke-width: 0.65;
    stroke-dasharray: 4 3;
  }

  .layer-guide {
    fill: none;
    stroke: #64748b;
    stroke-width: 0.55;
    stroke-dasharray: 2.4 2.2;
  }

  .wire-line {
    stroke: #0f172a;
    stroke-width: 1.25;
    stroke-linecap: round;
    opacity: 0.8;
  }

  @media (max-width: 1350px) {
    main {
      grid-template-columns: 1fr;
    }

    .history-list {
      max-height: 42vh;
    }

    .preview object {
      height: 42vh;
    }

    .preview-dual {
      grid-template-columns: 1fr;
    }
  }
</style>
