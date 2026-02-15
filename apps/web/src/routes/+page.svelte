<script lang="ts">
  import { onDestroy } from 'svelte';
  import { buildTemplatePreview, buildSolidPreview } from '$lib/preview';
  import {
    availableArtifactFormats,
    artifactFileName,
    artifactMimeType,
    generateExportArtifacts
  } from '$lib/exports';
  import {
    clampInt,
    toggleExportFormat,
    toggleSvgLayerSelection
  } from '$lib/form-state';
  import type {
    CanonicalGeometry,
    ExportFormat,
    PolyhedronDefinition,
    PolyhedronPreset,
    ShapeDefinition,
    SvgLayer
  } from '@torrify/shared-types';

  type ShapeBuilderMode = 'legacy' | 'polyhedron';
  type PolyhedronInputMode = 'catalog' | 'family';
  type PolyhedronFamilyPreset = 'regularPrism' | 'regularAntiprism' | 'regularBipyramid';

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
    {
      key: 'cuboctahedron',
      label: 'Cuboctahedron',
      faces: '8 triangles + 6 squares',
      preset: 'cuboctahedron'
    },
    {
      key: 'truncatedOctahedron',
      label: 'Truncated Octahedron',
      faces: '8 hexagons + 6 squares',
      preset: 'truncatedOctahedron'
    },
    {
      key: 'triPrism',
      label: 'Triangular Prism',
      faces: '2 triangles + 3 squares',
      preset: 'regularPrism',
      ringSides: 3
    },
    {
      key: 'pentPrism',
      label: 'Pentagonal Prism',
      faces: '2 pentagons + 5 squares',
      preset: 'regularPrism',
      ringSides: 5
    },
    {
      key: 'hexPrism',
      label: 'Hexagonal Prism',
      faces: '2 hexagons + 6 squares',
      preset: 'regularPrism',
      ringSides: 6
    },
    {
      key: 'squareAntiprism',
      label: 'Square Antiprism',
      faces: '2 squares + 8 triangles',
      preset: 'regularAntiprism',
      ringSides: 4
    },
    {
      key: 'pentAntiprism',
      label: 'Pentagonal Antiprism',
      faces: '2 pentagons + 10 triangles',
      preset: 'regularAntiprism',
      ringSides: 5
    },
    {
      key: 'triBipyramid',
      label: 'Triangular Bipyramid',
      faces: '6 triangles',
      preset: 'regularBipyramid',
      ringSides: 3
    },
    {
      key: 'pentBipyramid',
      label: 'Pentagonal Bipyramid',
      faces: '10 triangles',
      preset: 'regularBipyramid',
      ringSides: 5
    }
  ];

  const POLYHEDRON_FAMILY_OPTIONS: PolyhedronFamilyOption[] = [
    {
      value: 'regularPrism',
      label: 'Regular N-gon Prism',
      faces: '2 n-gons + n squares',
      minSides: 3,
      maxSides: 64,
      defaultSides: 6
    },
    {
      value: 'regularAntiprism',
      label: 'Regular N-gon Antiprism',
      faces: '2 n-gons + 2n triangles',
      minSides: 3,
      maxSides: 64,
      defaultSides: 6
    },
    {
      value: 'regularBipyramid',
      label: 'Regular N-gon Bipyramid',
      faces: '2n triangles',
      minSides: 3,
      maxSides: 5,
      defaultSides: 5
    }
  ];

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

  let shapeDefinition: ShapeDefinition = { ...initialShapeDefinition };
  let builderMode: ShapeBuilderMode = 'legacy';
  let polyhedronInputMode: PolyhedronInputMode = 'catalog';
  let selectedCatalogKey = 'cube';
  let selectedFamilyPreset: PolyhedronFamilyPreset = 'regularPrism';
  let useSplitEdges = false;

  let exportFormats: ExportFormat[] = ['svg'];
  let svgLayers: SvgLayer[] = ['cut', 'score', 'guide'];

  let generating = false;
  let error = '';
  let generatedGeometry: CanonicalGeometry | null = null;
  let generatedArtifacts: Partial<Record<ExportFormat, string>> = {};
  let generatedAt = '';
  let svgPreviewUrl = '';

  let yaw = -0.7;
  let pitch = 0.45;
  let rotating = false;
  let lastPointerX = 0;
  let lastPointerY = 0;

  let templateZoom = 1;
  let templateRotation = 0;
  let templatePanX = 0;
  let templatePanY = 0;
  let templatePanning = false;
  let lastTemplatePointerX = 0;
  let lastTemplatePointerY = 0;

  $: baseSegments = clampInt(shapeDefinition.segments, 3, 256, 6);
  $: normalizedPolyhedron = normalizePolyhedron(shapeDefinition.polyhedron);
  $: activeFamily = isFamilyPreset(normalizedPolyhedron.preset)
    ? familyOptionForPreset(normalizedPolyhedron.preset)
    : null;
  $: resolvedShapeDefinition = {
    ...shapeDefinition,
    generationMode: builderMode,
    polyhedron: builderMode === 'polyhedron' ? normalizedPolyhedron : shapeDefinition.polyhedron,
    segments: baseSegments,
    bottomSegments: useSplitEdges
      ? clampInt(shapeDefinition.bottomSegments ?? baseSegments, 3, 256, baseSegments)
      : baseSegments,
    topSegments: useSplitEdges
      ? clampInt(shapeDefinition.topSegments ?? baseSegments, 1, 256, baseSegments)
      : baseSegments
  } as ShapeDefinition;
  $: liveTemplate = buildTemplatePreview(resolvedShapeDefinition);
  $: liveSolid = buildSolidPreview(resolvedShapeDefinition, { yaw, pitch });
  $: templateTransform = `translate(${templatePanX.toFixed(3)} ${templatePanY.toFixed(3)}) translate(${(
    liveTemplate.width / 2
  ).toFixed(3)} ${(liveTemplate.height / 2).toFixed(3)}) rotate(${templateRotation.toFixed(
    3
  )}) scale(${templateZoom.toFixed(4)}) translate(${(-liveTemplate.width / 2).toFixed(3)} ${(
    -liveTemplate.height / 2
  ).toFixed(3)})`;
  $: effectiveBottomSegments = resolvedShapeDefinition.bottomSegments;
  $: effectiveTopSegments = resolvedShapeDefinition.topSegments;
  $: generatedFormats = availableArtifactFormats(generatedArtifacts);

  onDestroy(() => {
    revokeSvgPreviewUrl();
  });

  function isFamilyPreset(preset: PolyhedronPreset): preset is PolyhedronFamilyPreset {
    return (
      preset === 'regularPrism' ||
      preset === 'regularAntiprism' ||
      preset === 'regularBipyramid'
    );
  }

  function familyOptionForPreset(preset: PolyhedronFamilyPreset): PolyhedronFamilyOption {
    return (
      POLYHEDRON_FAMILY_OPTIONS.find((option) => option.value === preset) ??
      POLYHEDRON_FAMILY_OPTIONS[0]
    );
  }

  function clampSidesForPreset(preset: PolyhedronPreset, ringSides?: number): number {
    if (!isFamilyPreset(preset)) {
      return 6;
    }

    const family = familyOptionForPreset(preset);
    const value = Math.floor(Number(ringSides) || family.defaultSides);
    return Math.max(family.minSides, Math.min(family.maxSides, value));
  }

  function deriveFaceMode(
    preset: PolyhedronPreset,
    ringSides: number
  ): PolyhedronDefinition['faceMode'] {
    if (preset === 'cuboctahedron' || preset === 'truncatedOctahedron') {
      return 'mixed';
    }
    if (preset === 'regularPrism') {
      return ringSides === 4 ? 'uniform' : 'mixed';
    }
    if (preset === 'regularAntiprism') {
      return ringSides === 3 ? 'uniform' : 'mixed';
    }
    return 'uniform';
  }

  function normalizePolyhedron(
    polyhedron?: Partial<PolyhedronDefinition>
  ): PolyhedronDefinition {
    const merged = { ...initialPolyhedron, ...polyhedron };
    const preset = POLYHEDRON_ALL_PRESETS.includes(
      (merged.preset as PolyhedronPreset) ?? 'cube'
    )
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

  function syncPolyhedronUiState(polyhedron?: Partial<PolyhedronDefinition>): void {
    const normalized = normalizePolyhedron(polyhedron);
    const match = POLYHEDRON_CATALOG_OPTIONS.find(
      (option) =>
        option.preset === normalized.preset &&
        (option.ringSides ?? undefined) === (normalized.ringSides ?? undefined)
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

  function applyCatalogSelection(key: string): void {
    const option =
      POLYHEDRON_CATALOG_OPTIONS.find((entry) => entry.key === key) ??
      POLYHEDRON_CATALOG_OPTIONS[0];
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

  function applyFamilyPreset(preset: PolyhedronFamilyPreset): void {
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

  function setBuilderMode(mode: ShapeBuilderMode): void {
    builderMode = mode;
    if (mode === 'polyhedron') {
      shapeDefinition = {
        ...shapeDefinition,
        generationMode: mode,
        polyhedron: normalizePolyhedron(shapeDefinition.polyhedron)
      };
      useSplitEdges = false;
      syncPolyhedronUiState(shapeDefinition.polyhedron);
      return;
    }

    shapeDefinition = { ...shapeDefinition, generationMode: mode };
  }

  function toggleExport(format: ExportFormat): void {
    exportFormats = toggleExportFormat(exportFormats, format);
  }

  function toggleSvgLayer(layer: SvgLayer): void {
    svgLayers = toggleSvgLayerSelection(svgLayers, layer);
  }

  function revokeSvgPreviewUrl(): void {
    if (!svgPreviewUrl) {
      return;
    }

    URL.revokeObjectURL(svgPreviewUrl);
    svgPreviewUrl = '';
  }

  function updateSvgPreview(svg?: string): void {
    revokeSvgPreviewUrl();
    if (!svg) {
      return;
    }

    const blob = new Blob([svg], { type: artifactMimeType('svg') });
    svgPreviewUrl = URL.createObjectURL(blob);
  }

  function downloadArtifact(format: ExportFormat): void {
    const content = generatedArtifacts[format];
    if (!content || !generatedGeometry) {
      error = `Generate ${format.toUpperCase()} first.`;
      return;
    }

    const blob = new Blob([content], { type: artifactMimeType(format) });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = artifactFileName(format, generatedGeometry.kind);
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function downloadAllGenerated(): void {
    for (const format of generatedFormats) {
      downloadArtifact(format);
    }
  }

  function generateExports(): void {
    error = '';
    generating = true;

    try {
      const generated = generateExportArtifacts({
        shapeDefinition: resolvedShapeDefinition,
        exportFormats,
        svgLayers
      });

      generatedGeometry = generated.geometry;
      generatedArtifacts = generated.artifacts;
      generatedAt = new Date().toLocaleString();
      updateSvgPreview(generated.artifacts.svg);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to generate exports';
      generatedGeometry = null;
      generatedArtifacts = {};
      generatedAt = '';
      updateSvgPreview(undefined);
    } finally {
      generating = false;
    }
  }

  function startRotate(event: PointerEvent): void {
    rotating = true;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
  }

  function onRotate(event: PointerEvent): void {
    if (!rotating) {
      return;
    }

    const dx = event.clientX - lastPointerX;
    const dy = event.clientY - lastPointerY;
    yaw += dx * 0.01;
    pitch = Math.max(-1.3, Math.min(1.3, pitch + dy * 0.01));
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
  }

  function endRotate(): void {
    rotating = false;
  }

  function resetSolidView(): void {
    yaw = -0.7;
    pitch = 0.45;
  }

  function zoomTemplate(factor: number): void {
    templateZoom = Math.max(0.2, Math.min(8, templateZoom * factor));
  }

  function rotateTemplate(degrees: number): void {
    templateRotation += degrees;
  }

  function resetTemplateView(): void {
    templateZoom = 1;
    templateRotation = 0;
    templatePanX = 0;
    templatePanY = 0;
  }

  function startTemplatePan(event: PointerEvent): void {
    templatePanning = true;
    lastTemplatePointerX = event.clientX;
    lastTemplatePointerY = event.clientY;
    (event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId);
  }

  function onTemplatePan(event: PointerEvent): void {
    if (!templatePanning) {
      return;
    }

    const target = event.currentTarget as SVGSVGElement;
    const rect = target.getBoundingClientRect();
    const dxPx = event.clientX - lastTemplatePointerX;
    const dyPx = event.clientY - lastTemplatePointerY;
    const dx = (dxPx * liveTemplate.width) / Math.max(rect.width, 1);
    const dy = (dyPx * liveTemplate.height) / Math.max(rect.height, 1);
    templatePanX += dx;
    templatePanY += dy;
    lastTemplatePointerX = event.clientX;
    lastTemplatePointerY = event.clientY;
  }

  function endTemplatePan(event: PointerEvent): void {
    templatePanning = false;
    if ((event.currentTarget as SVGSVGElement).hasPointerCapture(event.pointerId)) {
      (event.currentTarget as SVGSVGElement).releasePointerCapture(event.pointerId);
    }
  }

  function onTemplateWheel(event: WheelEvent): void {
    event.preventDefault();
    zoomTemplate(event.deltaY < 0 ? 1.08 : 0.92);
  }
</script>

<svelte:head>
  <title>Pottery Pattern CAD (Stateless)</title>
</svelte:head>

<main>
  <section class="card">
    <h1>Pottery Pattern CAD</h1>
    <p class="sub">Browser-first and stateless. Refreshing the page clears session state.</p>

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
            <select
              value={selectedCatalogKey}
              on:change={(event) =>
                applyCatalogSelection((event.currentTarget as HTMLSelectElement).value)}
            >
              {#each POLYHEDRON_CATALOG_OPTIONS as option}
                <option value={option.key}>{option.label} ({option.faces})</option>
              {/each}
            </select>
          </label>
        {:else}
          <label>Family
            <select
              value={selectedFamilyPreset}
              on:change={(event) =>
                applyFamilyPreset(
                  (event.currentTarget as HTMLSelectElement).value as PolyhedronFamilyPreset
                )}
            >
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
          <input
            value={
              normalizedPolyhedron.faceMode === 'uniform'
                ? 'Uniform (single face type)'
                : 'Mixed face types'
            }
            disabled
          />
        </label>
      </div>

      <p class="muted">
        Catalog exposes vetted solids. Family mode constrains side counts to valid ranges.
      </p>
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

    <div class="config-group">
      <div class="config-title">Export Formats</div>
      <div class="formats">
        <label><input type="checkbox" checked={exportFormats.includes('svg')} on:change={() => toggleExport('svg')} /> SVG</label>
        <label><input type="checkbox" checked={exportFormats.includes('pdf')} on:change={() => toggleExport('pdf')} /> PDF</label>
        <label><input type="checkbox" checked={exportFormats.includes('stl')} on:change={() => toggleExport('stl')} /> STL</label>
      </div>
    </div>

    <div class="config-group">
      <div class="config-title">2D Layers (SVG/PDF)</div>
      <div class="formats">
        <label><input type="checkbox" checked={svgLayers.includes('cut')} on:change={() => toggleSvgLayer('cut')} /> Cut</label>
        <label><input type="checkbox" checked={svgLayers.includes('score')} on:change={() => toggleSvgLayer('score')} /> Score</label>
        <label><input type="checkbox" checked={svgLayers.includes('guide')} on:change={() => toggleSvgLayer('guide')} /> Guide</label>
      </div>
    </div>

    <button on:click={generateExports} disabled={generating}>
      {generating ? 'Generating...' : 'Generate Files'}
    </button>

    {#if generatedGeometry}
      <div class="output-summary">
        <div><strong>Last Generated:</strong> {generatedAt}</div>
        <div class="muted">
          Kind: {generatedGeometry.kind} • Faces: {generatedGeometry.metrics.faceCount} •
          Surface Area: {generatedGeometry.metrics.surfaceArea.toFixed(2)}
        </div>
        <div class="actions-row">
          {#each generatedFormats as format}
            <button class="small" on:click={() => downloadArtifact(format)}>
              Download {format.toUpperCase()}
            </button>
          {/each}
          {#if generatedFormats.length > 1}
            <button class="small" on:click={downloadAllGenerated}>Download All</button>
          {/if}
        </div>
      </div>
    {/if}

    {#if generatedGeometry?.warnings.length}
      <div class="warnings">
        {#each generatedGeometry.warnings as warning}
          <p class="error">{warning}</p>
        {/each}
      </div>
    {/if}

    {#if error}
      <p class="error">{error}</p>
    {/if}
  </section>

  <section class="card preview">
    <h2>Live Preview</h2>
    <p class="muted">2D and 3D update from current parameters.</p>

    {#if builderMode === 'polyhedron'}
      <p class="muted">
        Polyhedron: {normalizedPolyhedron.preset}
        {#if isFamilyPreset(normalizedPolyhedron.preset)}
          • sides: {normalizedPolyhedron.ringSides}
        {/if}
        • face mode: {normalizedPolyhedron.faceMode}
      </p>
    {:else if useSplitEdges}
      <p class="muted">
        Split edges active ({effectiveBottomSegments}/{effectiveTopSegments}).
      </p>
    {:else}
      <p class="muted">Both ends use {baseSegments} edges.</p>
    {/if}

    <div class="preview-dual">
      <div class="preview-pane">
        <div class="preview-pane-head">
          <h3>2D Template</h3>
          <div class="view-controls">
            <button class="small" type="button" on:click={() => zoomTemplate(1.2)} aria-label="Zoom in">+</button>
            <button class="small" type="button" on:click={() => zoomTemplate(1 / 1.2)} aria-label="Zoom out">-</button>
            <button class="small" type="button" on:click={() => rotateTemplate(-15)} aria-label="Rotate left">L</button>
            <button class="small" type="button" on:click={() => rotateTemplate(15)} aria-label="Rotate right">R</button>
            <button class="small" type="button" on:click={resetTemplateView}>Reset</button>
          </div>
        </div>

        <svg
          viewBox={`0 0 ${liveTemplate.width.toFixed(3)} ${liveTemplate.height.toFixed(3)}`}
          role="img"
          aria-label="Live 2D template preview"
          class:template-panning-active={templatePanning}
          on:pointerdown={startTemplatePan}
          on:pointermove={onTemplatePan}
          on:pointerup={endTemplatePan}
          on:pointerleave={endTemplatePan}
          on:wheel={onTemplateWheel}
        >
          <g transform={templateTransform}>
            {#each liveTemplate.paths as path}
              <path d={path.d} class={`layer-${path.layer}`} />
            {/each}
          </g>
        </svg>
        <div class="muted">Drag to pan. Mouse wheel to zoom.</div>
      </div>

      <div class="preview-pane">
        <div class="preview-pane-head">
          <h3>3D Form</h3>
          <button class="small" type="button" on:click={resetSolidView}>Reset View</button>
        </div>

        <svg
          viewBox={`0 0 ${liveSolid.width.toFixed(3)} ${liveSolid.height.toFixed(3)}`}
          role="img"
          aria-label="Live 3D solid preview"
          class:rotating-active={rotating}
          on:pointerdown={startRotate}
          on:pointermove={onRotate}
          on:pointerup={endRotate}
          on:pointerleave={endRotate}
        >
          {#each liveSolid.faces as face}
            <polygon
              class="solid-face"
              points={face.points.map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(' ')}
              fill={face.fill}
              stroke={face.stroke}
            />
          {/each}
        </svg>
        <div class="muted">Drag to rotate.</div>
      </div>
    </div>

    <h2>Generated SVG Preview</h2>
    {#if svgPreviewUrl}
      <object data={svgPreviewUrl} type="image/svg+xml" aria-label="Generated SVG template"></object>
    {:else}
      <p>No SVG generated yet.</p>
    {/if}
  </section>
</main>

<style>
  :global(body) {
    --bg-0: #1e1e1e;
    --bg-1: #252526;
    --card: #2d2d30;
    --card-border: #3e3e42;
    --panel: #252526;
    --text: #f3f4f6;
    --muted: #9ca3af;
    --input-bg: #1e1e1e;
    --input-border: #3e3e42;
    --button: #3e3e42;
    --button-hover: #4e4e52;
    --button-text: #f9fafb;
    --accent: #2563eb;
    --danger: #ef4444;
    margin: 0;
    font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
    background: linear-gradient(160deg, var(--bg-0), var(--bg-1));
    color: var(--text);
  }

  main {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 420px 1fr;
    gap: 1rem;
    padding: 1rem;
  }

  .card {
    background: var(--card);
    border: 1px solid var(--card-border);
    border-radius: 12px;
    padding: 1rem;
    box-shadow: 0 16px 34px rgba(4, 9, 20, 0.42);
  }

  h1,
  h2,
  h3 {
    margin: 0;
  }

  h1 {
    font-size: 1.35rem;
  }

  h2 {
    font-size: 1.05rem;
    margin-bottom: 0.25rem;
  }

  .sub {
    margin-top: 0.25rem;
    color: var(--muted);
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
    margin-top: 0.9rem;
  }

  .builder-tabs button,
  .poly-subtabs button {
    background: #3e3e42;
    color: #d1d5db;
    border: 1px solid #4e4e52;
  }

  .builder-tabs button.tab-active,
  .poly-subtabs button.tab-active {
    background: var(--accent);
    color: #ffffff;
    border-color: var(--accent);
  }

  .poly-subtabs {
    display: flex;
    gap: 0.45rem;
    grid-column: 1 / -1;
    margin-bottom: 0.15rem;
  }

  .config-group {
    margin: 0.75rem 0;
  }

  .config-title {
    font-size: 0.85rem;
    color: var(--muted);
    margin-bottom: 0.3rem;
  }

  .formats {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-bottom: 0.2rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.9rem;
    margin-bottom: 0.45rem;
  }

  .formats label,
  .split-toggle {
    flex-direction: row;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
  }

  input,
  select {
    border: 1px solid var(--input-border);
    border-radius: 8px;
    padding: 0.5rem;
    font-size: 0.92rem;
    background: var(--input-bg);
    color: var(--text);
  }

  input:disabled {
    background: #0f1b35;
    color: #8ea2c5;
  }

  button {
    border: 1px solid #4e4e52;
    background: var(--button);
    color: var(--button-text);
    border-radius: 9px;
    padding: 0.62rem 0.85rem;
    font-size: 0.88rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  button:hover {
    background: var(--button-hover);
  }

  .small {
    padding: 0.32rem 0.54rem;
    font-size: 0.78rem;
  }

  button:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .muted {
    color: var(--muted);
    font-size: 0.77rem;
  }

  .error {
    color: var(--danger);
  }

  .output-summary {
    border: 1px solid var(--card-border);
    border-radius: 10px;
    padding: 0.6rem;
    margin-top: 0.75rem;
    background: var(--panel);
  }

  .actions-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin-top: 0.45rem;
  }

  .warnings {
    margin-top: 0.6rem;
  }

  .warnings p {
    margin: 0.25rem 0;
  }

  .preview-dual {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.7rem;
    margin-top: 0.5rem;
    margin-bottom: 0.85rem;
  }

  .preview-pane {
    border: 1px solid var(--card-border);
    border-radius: 10px;
    padding: 0.5rem;
    background: #252526;
  }

  .preview-pane h3 {
    margin: 0;
    font-size: 0.87rem;
    color: #f3f4f6;
  }

  .preview-pane-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.35rem;
  }

  .view-controls {
    display: flex;
    gap: 0.3rem;
  }

  .preview-pane svg {
    width: 100%;
    height: 260px;
    display: block;
    border: 1px solid var(--card-border);
    border-radius: 8px;
    background:
      linear-gradient(rgba(62, 62, 66, 0.7) 1px, transparent 1px) 0 0 / 100% 20px,
      linear-gradient(90deg, rgba(62, 62, 66, 0.7) 1px, transparent 1px) 0 0 / 20px 100%,
      #1e1e1e;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }

  .preview-pane svg.rotating-active,
  .preview-pane svg.template-panning-active {
    cursor: grabbing;
  }

  .preview object {
    width: 100%;
    height: 46vh;
    border: 1px solid var(--card-border);
    border-radius: 10px;
    margin-top: 0.5rem;
    background: #1e1e1e;
  }

  .layer-cut {
    fill: none;
    stroke: #2563eb;
    stroke-width: 1.1;
  }

  .layer-score {
    fill: none;
    stroke: #2563eb;
    stroke-width: 1.1;
  }

  .layer-guide {
    fill: none;
    stroke: #2563eb;
    stroke-width: 1.1;
  }

  .solid-face {
    stroke-width: 1;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  @media (max-width: 1350px) {
    main {
      grid-template-columns: 1fr;
    }

    .preview-dual {
      grid-template-columns: 1fr;
    }

    .preview object {
      height: 42vh;
    }
  }
</style>
