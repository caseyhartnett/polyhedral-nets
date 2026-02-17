<script lang="ts">
  import JSZip from 'jszip';
  import { onDestroy, onMount } from 'svelte';
  import { buildTemplatePreview, buildSolidPreview } from '$lib/preview';
  import {
    MATERIAL_SIZE_PRESET_OPTIONS,
    availableArtifactFormats,
    artifactFileName,
    artifactMimeType,
    filterTemplateLayers,
    generateExportArtifacts
  } from '$lib/exports';
  import type {
    ExportSheetLayoutOptions,
    GeneratedSvgPage,
    MaterialSizePreset,
    SvgPerforationOptions
  } from '$lib/exports';
  import { renderTemplateSvg } from '@torrify/geometry-engine';
  import { clampInt, toggleExportFormat, toggleSvgLayerSelection } from '$lib/form-state';
  import type {
    CanonicalGeometry,
    ExportFormat,
    PolyhedronDefinition,
    PolyhedronPreset,
    ShapeDefinition,
    SvgLayer,
    Units
  } from '@torrify/shared-types';

  type ShapeBuilderMode = 'legacy' | 'polyhedron';
  type PolyhedronInputMode = 'catalog' | 'family';
  type PolyhedronFamilyPreset = 'regularPrism' | 'regularAntiprism' | 'regularBipyramid';
  type MaterialPreset = 'paper' | 'slabClay' | 'board';
  type TourTarget = 'builder' | 'fabrication' | 'preview' | 'help';

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

  interface HelpItem {
    term: string;
    description: string;
    tags: string[];
  }

  interface TourStep {
    target: TourTarget;
    title: string;
    detail: string;
  }

  interface DownloadableOutputFile {
    fileName: string;
    mimeType: string;
    content: string;
  }

  interface SheetGuideOverlay {
    cols: number;
    rows: number;
    vertical: number[];
    horizontal: number[];
  }

  type GeneratedSvgPreviewMode = 'combined' | 'sheets';

  const MM_PER_INCH = 25.4;

  const ONBOARDING_SEEN_KEY = 'pgw_onboarding_seen';

  const HELP_ITEMS: HelpItem[] = [
    {
      term: 'Segments',
      description: 'How many sides your form has around the base. More sides makes a rounder result.',
      tags: ['edges', 'shape', 'legacy']
    },
    {
      term: 'Allowance',
      description: 'Extra edge material added for joining pieces. Increase if your seam needs more overlap.',
      tags: ['join', 'seam', 'fabrication']
    },
    {
      term: 'Seam mode',
      description: 'How the joining edge is built: straight, overlap, or tabbed.',
      tags: ['join', 'tab', 'glue']
    },
    {
      term: 'Face edge length',
      description: 'The size of each polyhedron edge. Larger values scale the whole template up.',
      tags: ['polyhedron', 'size']
    },
    {
      term: 'Score layer',
      description: 'Fold lines that should be lightly scored, not fully cut.',
      tags: ['layers', 'cutting']
    },
    {
      term: 'Guide layer',
      description: 'Reference lines for alignment and layout checks.',
      tags: ['layers', 'reference']
    }
  ];

  const TROUBLESHOOTING: string[] = [
    'If warnings appear, increase allowance or reduce extreme taper differences.',
    'If folds tear, increase thickness for stronger material settings.',
    'If shape is too complex, start with fewer segments and iterate upward.',
    'If export does not look right in another tool, try SVG first.'
  ];

  const TOUR_STEPS: TourStep[] = [
    {
      target: 'builder',
      title: 'Choose a build path',
      detail: 'Pick Dimension Builder for pots and frustums, or Polyhedron Templates for geometric solids.'
    },
    {
      target: 'fabrication',
      title: 'Set fabrication rules',
      detail: 'Thickness, seam mode, and allowance directly affect assembly fit.'
    },
    {
      target: 'preview',
      title: 'Validate shape before export',
      detail: 'Use the 2D net and 3D preview to catch mistakes early.'
    },
    {
      target: 'help',
      title: 'Use built-in support',
      detail: 'Search terms, apply recipes, and follow troubleshooting tips without leaving the app.'
    }
  ];

  const MATERIAL_PRESET_CONTENT: Record<
    MaterialPreset,
    { label: string; note: string; thickness: number; allowance: number; seamMode: ShapeDefinition['seamMode'] }
  > = {
    paper: {
      label: 'Paper Prototype',
      note: 'Fast, easy fold testing before final fabrication.',
      thickness: 1,
      allowance: 4,
      seamMode: 'tabbed'
    },
    slabClay: {
      label: 'Slab Clay',
      note: 'Balanced defaults for ceramic slab construction.',
      thickness: 6,
      allowance: 8,
      seamMode: 'straight'
    },
    board: {
      label: 'Thick Board/Card',
      note: 'More allowance for stiffer material joins.',
      thickness: 2.5,
      allowance: 7,
      seamMode: 'overlap'
    }
  };

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
    includeTopCap: true,
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

  let exportFormats: ExportFormat[] = ['svg', 'pdf'];
  let svgLayers: SvgLayer[] = ['cut', 'score', 'guide'];
  let materialSizePreset: MaterialSizePreset = 'none';
  let customMaterialWidth = 12;
  let customMaterialHeight = 24;
  let customMaterialUnits: Units = 'in';
  let cricutPerforationEnabled = true;
  let cricutPerforationCutLength = 0.8;
  let cricutPerforationGapLength = 0.8;

  let generating = false;
  let error = '';
  let generatedGeometry: CanonicalGeometry | null = null;
  let generatedArtifacts: Partial<Record<ExportFormat, string>> = {};
  let generatedSvgPages: GeneratedSvgPage[] = [];
  let generatedSvgPreviewSheetIndex = 0;
  let generatedSvgPreviewMode: GeneratedSvgPreviewMode = 'combined';
  let generatedSvgLayerSnapshot: SvgLayer[] = ['cut', 'score', 'guide'];
  let generatedSheetLayoutSnapshot: ExportSheetLayoutOptions | undefined;
  let generatedAtDate: Date | null = null;
  let generatedAt = '';
  let svgPreviewUrl = '';

  let exportSuccess = '';
  let showWarningHelp = false;
  let helpQuery = '';

  let showWelcomeModal = false;
  let guidedSetupActive = false;
  let onboardingStep = 1;
  let onboardingShapeFamily: ShapeBuilderMode = 'legacy';
  let onboardingMaterialPreset: MaterialPreset = 'slabClay';

  let tourMode = false;
  let tourStepIndex = 0;

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
  $: totalGeneratedDownloadFileCount = countGeneratedDownloadFiles();
  $: selectedMaterialPresetOption =
    MATERIAL_SIZE_PRESET_OPTIONS.find((option) => option.value === materialSizePreset) ??
    MATERIAL_SIZE_PRESET_OPTIONS[0];
  $: usingCricutMaterial =
    materialSizePreset === 'cricut-mat-12x12' ||
    materialSizePreset === 'cricut-mat-12x24' ||
    materialSizePreset === 'cricut-smart-13x24';
  $: previewSheetGuides = buildPreviewSheetGuides();
  $: filteredHelpItems = HELP_ITEMS.filter((item) => {
    const term = helpQuery.trim().toLowerCase();
    if (!term) {
      return true;
    }

    const haystack = `${item.term} ${item.description} ${item.tags.join(' ')}`.toLowerCase();
    return haystack.includes(term);
  });
  $: activeTourStep = TOUR_STEPS[tourStepIndex];

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const forceGuided = params.get('start') === 'guided';
    const forceTour = params.get('tour') === '1';
    const hasSeenOnboarding = window.localStorage.getItem(ONBOARDING_SEEN_KEY) === '1';

    if (forceGuided) {
      startGuidedSetup();
    } else if (!hasSeenOnboarding) {
      showWelcomeModal = true;
    }

    if (forceTour) {
      startTour();
    }
  });

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

  function convertUnits(value: number, from: Units, to: Units): number {
    if (from === to) {
      return value;
    }

    if (from === 'in' && to === 'mm') {
      return value * MM_PER_INCH;
    }

    return value / MM_PER_INCH;
  }

  function resolvePreviewSheetSize(units: Units): { width: number; height: number } | undefined {
    return resolveSheetSizeForLayout(
      {
        materialSizePreset,
        customSize:
          materialSizePreset === 'custom'
            ? {
                width: customMaterialWidth,
                height: customMaterialHeight,
                units: customMaterialUnits
              }
            : undefined
      },
      units
    );
  }

  function resolveSheetSizeForLayout(
    layout: Pick<ExportSheetLayoutOptions, 'materialSizePreset' | 'customSize'> | undefined,
    units: Units
  ): { width: number; height: number } | undefined {
    if (!layout || layout.materialSizePreset === 'none') {
      return undefined;
    }

    if (layout.materialSizePreset === 'custom') {
      const custom = layout.customSize;
      if (!custom || !(custom.width > 0) || !(custom.height > 0)) {
        return undefined;
      }

      return {
        width: convertUnits(custom.width, custom.units, units),
        height: convertUnits(custom.height, custom.units, units)
      };
    }

    const preset = MATERIAL_SIZE_PRESET_OPTIONS.find(
      (option) => option.value === layout.materialSizePreset
    );
    if (!preset || !preset.width || !preset.height || !preset.units) {
      return undefined;
    }

    return {
      width: convertUnits(preset.width, preset.units, units),
      height: convertUnits(preset.height, preset.units, units)
    };
  }

  function buildPreviewSheetGuides(): SheetGuideOverlay | undefined {
    const sheetSize = resolvePreviewSheetSize(liveTemplate.units);
    if (!sheetSize) {
      return undefined;
    }

    const margin = Math.min(
      convertUnits(8, 'mm', liveTemplate.units),
      sheetSize.width * 0.2,
      sheetSize.height * 0.2
    );
    const usableWidth = sheetSize.width - margin * 2;
    const usableHeight = sheetSize.height - margin * 2;
    if (usableWidth <= 0 || usableHeight <= 0) {
      return undefined;
    }

    const contentWidth = liveTemplate.bounds.maxX - liveTemplate.bounds.minX;
    const contentHeight = liveTemplate.bounds.maxY - liveTemplate.bounds.minY;
    const cols = Math.max(1, Math.ceil(contentWidth / usableWidth));
    const rows = Math.max(1, Math.ceil(contentHeight / usableHeight));

    const vertical: number[] = [];
    for (let col = 1; col < cols; col += 1) {
      vertical.push(Math.min(liveTemplate.bounds.maxX, liveTemplate.bounds.minX + col * usableWidth));
    }

    const horizontal: number[] = [];
    for (let row = 1; row < rows; row += 1) {
      horizontal.push(Math.min(liveTemplate.bounds.maxY, liveTemplate.bounds.minY + row * usableHeight));
    }

    return {
      cols,
      rows,
      vertical,
      horizontal
    };
  }

  function buildSheetGuidesForPaths(
    paths: Array<{ points: Array<{ x: number; y: number }> }>,
    units: Units,
    layout: Pick<ExportSheetLayoutOptions, 'materialSizePreset' | 'customSize'> | undefined
  ): SheetGuideOverlay | undefined {
    const sheetSize = resolveSheetSizeForLayout(layout, units);
    if (!sheetSize) {
      return undefined;
    }

    const allPoints = paths.flatMap((path) => path.points);
    if (allPoints.length === 0) {
      return undefined;
    }

    const xs = allPoints.map((point) => point.x);
    const ys = allPoints.map((point) => point.y);
    const bounds = {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys)
    };

    const margin = Math.min(convertUnits(8, 'mm', units), sheetSize.width * 0.2, sheetSize.height * 0.2);
    const usableWidth = sheetSize.width - margin * 2;
    const usableHeight = sheetSize.height - margin * 2;
    if (usableWidth <= 0 || usableHeight <= 0) {
      return undefined;
    }

    const contentWidth = bounds.maxX - bounds.minX;
    const contentHeight = bounds.maxY - bounds.minY;
    const cols = Math.max(1, Math.ceil(contentWidth / usableWidth));
    const rows = Math.max(1, Math.ceil(contentHeight / usableHeight));

    const vertical: number[] = [];
    for (let col = 1; col < cols; col += 1) {
      vertical.push(Math.min(bounds.maxX, bounds.minX + col * usableWidth));
    }

    const horizontal: number[] = [];
    for (let row = 1; row < rows; row += 1) {
      horizontal.push(Math.min(bounds.maxY, bounds.minY + row * usableHeight));
    }

    return { cols, rows, vertical, horizontal };
  }

  function buildCombinedGeneratedSvgPreview(): string | undefined {
    if (!generatedGeometry) {
      return undefined;
    }

    const layeredGeometry = filterTemplateLayers(
      generatedGeometry,
      generatedSvgLayerSnapshot.length > 0 ? generatedSvgLayerSnapshot : ['cut', 'score', 'guide']
    );
    const baseSvg = renderTemplateSvg(layeredGeometry);

    const guides = buildSheetGuidesForPaths(
      layeredGeometry.template.paths,
      layeredGeometry.template.units,
      generatedSheetLayoutSnapshot
    );
    if (!guides || (guides.vertical.length === 0 && guides.horizontal.length === 0)) {
      return baseSvg;
    }

    const allPoints = layeredGeometry.template.paths.flatMap((path) => path.points);
    const xs = allPoints.map((point) => point.x);
    const ys = allPoints.map((point) => point.y);
    const bounds = {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys)
    };

    const lineEls = [
      ...guides.vertical.map(
        (x) =>
          `<line x1="${x.toFixed(3)}" y1="${bounds.minY.toFixed(3)}" x2="${x.toFixed(3)}" y2="${bounds.maxY.toFixed(3)}" />`
      ),
      ...guides.horizontal.map(
        (y) =>
          `<line x1="${bounds.minX.toFixed(3)}" y1="${y.toFixed(3)}" x2="${bounds.maxX.toFixed(3)}" y2="${y.toFixed(3)}" />`
      )
    ].join('\n    ');

    const guideGroup = `  <g id="split-guides-preview" style="fill:none;stroke:#ef4444;stroke-width:0.9;stroke-dasharray:5 4;vector-effect:non-scaling-stroke;pointer-events:none;opacity:0.92;">\n    ${lineEls}\n  </g>\n`;

    return baseSvg.replace('</svg>', `${guideGroup}</svg>`);
  }

  function refreshGeneratedSvgPreview(): void {
    if (generatedSvgPages.length > 1 && generatedSvgPreviewMode === 'combined') {
      updateSvgPreview(buildCombinedGeneratedSvgPreview());
      return;
    }

    if (generatedSvgPages.length > 0) {
      const clamped = Math.max(0, Math.min(generatedSvgPages.length - 1, generatedSvgPreviewSheetIndex));
      generatedSvgPreviewSheetIndex = clamped;
      updateSvgPreview(generatedSvgPages[clamped]?.content);
      return;
    }

    updateSvgPreview(generatedArtifacts.svg);
  }

  function setGeneratedSvgPreviewMode(mode: GeneratedSvgPreviewMode): void {
    generatedSvgPreviewMode = mode;
    refreshGeneratedSvgPreview();
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
      POLYHEDRON_CATALOG_OPTIONS.find((entry) => entry.key === key) ?? POLYHEDRON_CATALOG_OPTIONS[0];
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
      includeTopCap: mode === 'polyhedron' ? true : shapeDefinition.includeTopCap,
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

    const previewSvg = makeSvgPreviewFriendly(svg);
    const blob = new Blob([previewSvg], { type: artifactMimeType('svg') });
    svgPreviewUrl = URL.createObjectURL(blob);
  }

  function makeSvgPreviewFriendly(svg: string): string {
    if (svg.includes('data-preview-friendly="1"')) {
      return svg;
    }

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svg, 'image/svg+xml');
      const root = doc.documentElement;
      if (root.tagName.toLowerCase() !== 'svg') {
        return svg;
      }

      root.setAttribute('data-preview-friendly', '1');

      const existingBg = root.querySelector('#preview-bg');
      if (!existingBg) {
        const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('id', 'preview-bg');
        rect.setAttribute('x', '0');
        rect.setAttribute('y', '0');
        rect.setAttribute('width', '100%');
        rect.setAttribute('height', '100%');
        rect.setAttribute('fill', '#ffffff');
        root.insertBefore(rect, root.firstChild);
      }

      const setPathStyle = (path: Element, layer: 'cut' | 'score' | 'guide'): void => {
        path.removeAttribute('style');
        path.setAttribute('fill', 'none');
        path.setAttribute('vector-effect', 'non-scaling-stroke');

        if (layer === 'cut') {
          path.setAttribute('stroke', '#0f172a');
          path.setAttribute('stroke-width', '1.35');
          path.removeAttribute('stroke-dasharray');
          path.removeAttribute('opacity');
          return;
        }

        if (layer === 'score') {
          path.setAttribute('stroke', '#0284c7');
          path.setAttribute('stroke-width', '1.15');
          path.setAttribute('stroke-dasharray', '5 4');
          path.removeAttribute('opacity');
          return;
        }

        path.setAttribute('stroke', '#f97316');
        path.setAttribute('stroke-width', '1.0');
        path.setAttribute('stroke-dasharray', '3 3');
        path.setAttribute('opacity', '0.9');
      };

      for (const path of root.querySelectorAll('path.cut')) setPathStyle(path, 'cut');
      for (const path of root.querySelectorAll('path.score')) setPathStyle(path, 'score');
      for (const path of root.querySelectorAll('path.guide')) setPathStyle(path, 'guide');

      for (const line of root.querySelectorAll('#split-guides-preview line')) {
        line.removeAttribute('style');
        line.setAttribute('stroke', '#dc2626');
        line.setAttribute('stroke-width', '1.4');
        line.setAttribute('stroke-dasharray', '8 5');
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        line.setAttribute('opacity', '0.95');
      }

      const serializer = new XMLSerializer();
      return serializer.serializeToString(root);
    } catch {
      return svg;
    }
  }

  function previewGeneratedSvgSheet(index: number): void {
    generatedSvgPreviewMode = 'sheets';
    generatedSvgPreviewSheetIndex = Math.max(0, Math.min(generatedSvgPages.length - 1, index));
    refreshGeneratedSvgPreview();
  }

  function downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function countGeneratedDownloadFiles(): number {
    let count = 0;
    if (generatedArtifacts.svg) {
      count += generatedSvgPages.length > 0 ? generatedSvgPages.length : 1;
    }
    if (generatedArtifacts.pdf) count += 1;
    if (generatedArtifacts.stl) count += 1;
    return count;
  }

  function collectGeneratedOutputFiles(): DownloadableOutputFile[] {
    if (!generatedGeometry) {
      return [];
    }

    const when = generatedAtDate ?? new Date();
    const files: DownloadableOutputFile[] = [];

    if (generatedArtifacts.svg) {
      if (generatedSvgPages.length > 0) {
        for (const page of generatedSvgPages) {
          files.push({
            fileName: artifactFileName('svg', generatedGeometry.kind, when, page.fileNameSuffix),
            mimeType: artifactMimeType('svg'),
            content: page.content
          });
        }
      } else {
        files.push({
          fileName: artifactFileName('svg', generatedGeometry.kind, when),
          mimeType: artifactMimeType('svg'),
          content: generatedArtifacts.svg
        });
      }
    }

    if (generatedArtifacts.pdf) {
      files.push({
        fileName: artifactFileName('pdf', generatedGeometry.kind, when),
        mimeType: artifactMimeType('pdf'),
        content: generatedArtifacts.pdf
      });
    }

    if (generatedArtifacts.stl) {
      files.push({
        fileName: artifactFileName('stl', generatedGeometry.kind, when),
        mimeType: artifactMimeType('stl'),
        content: generatedArtifacts.stl
      });
    }

    return files;
  }

  async function downloadOutputAsZip(files: DownloadableOutputFile[]): Promise<void> {
    if (!generatedGeometry) {
      error = 'Generate files first.';
      return;
    }

    const when = generatedAtDate ?? new Date();
    const folderName = artifactFileName('svg', generatedGeometry.kind, when, 'files').replace(/\.svg$/, '');
    const zipFileName = artifactFileName('svg', generatedGeometry.kind, when, 'exports').replace(
      /\.svg$/,
      '.zip'
    );

    const zip = new JSZip();
    const folder = zip.folder(folderName);
    for (const file of files) {
      if (folder) {
        folder.file(file.fileName, file.content);
      } else {
        zip.file(file.fileName, file.content);
      }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, zipFileName);
  }

  async function downloadSelectedAsZip(): Promise<void> {
    const files = collectGeneratedOutputFiles();
    if (files.length === 0) {
      error = 'Generate files first.';
      return;
    }

    await downloadOutputAsZip(files);
  }

  function generateExports(): void {
    error = '';
    exportSuccess = '';
    generating = true;

    try {
      const sheetLayoutOptions: ExportSheetLayoutOptions = {
        materialSizePreset,
        customSize:
          materialSizePreset === 'custom'
            ? {
                width: Math.max(0, Number(customMaterialWidth) || 0),
                height: Math.max(0, Number(customMaterialHeight) || 0),
                units: customMaterialUnits
              }
            : undefined
      };
      const svgPerforation: SvgPerforationOptions | undefined =
        usingCricutMaterial && cricutPerforationEnabled
          ? {
              enabled: true,
              layers: ['score'],
              cutLength: Math.max(0.05, Number(cricutPerforationCutLength) || 0.8),
              gapLength: Math.max(0.05, Number(cricutPerforationGapLength) || 0.8)
            }
          : undefined;
      const exportLayers =
        usingCricutMaterial
          ? (Array.from(new Set<SvgLayer>([...svgLayers, 'cut', 'score'])) as SvgLayer[])
          : svgLayers;

      const generated = generateExportArtifacts({
        shapeDefinition: resolvedShapeDefinition,
        exportFormats,
        svgLayers: exportLayers,
        sheetLayout: sheetLayoutOptions,
        svgPerforation
      });

      generatedGeometry = generated.geometry;
      generatedArtifacts = generated.artifacts;
      generatedSvgPages = generated.svgPages;
      generatedSvgPreviewSheetIndex = 0;
      generatedSvgPreviewMode = generated.svgPages.length > 1 ? 'combined' : 'sheets';
      generatedSvgLayerSnapshot = [...exportLayers];
      generatedSheetLayoutSnapshot = sheetLayoutOptions;
      generatedAtDate = new Date();
      generatedAt = generatedAtDate.toLocaleString();
      refreshGeneratedSvgPreview();

      const formats = availableArtifactFormats(generated.artifacts).map((format) => format.toUpperCase());
      const svgSplitNote =
        generated.svgPages.length > 1
          ? ` SVG split into ${generated.svgPages.length} sheets for ${selectedMaterialPresetOption.label}.`
          : '';
      exportSuccess = `Files ready: ${formats.join(', ')}.${svgSplitNote} Start by downloading SVG for print testing.`;

      if (guidedSetupActive) {
        guidedSetupActive = false;
        onboardingStep = 1;
        persistOnboardingSeen();
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to generate exports';
      generatedGeometry = null;
      generatedArtifacts = {};
      generatedSvgPages = [];
      generatedSvgPreviewSheetIndex = 0;
      generatedSvgPreviewMode = 'combined';
      generatedSvgLayerSnapshot = ['cut', 'score', 'guide'];
      generatedSheetLayoutSnapshot = undefined;
      generatedAtDate = null;
      generatedAt = '';
      updateSvgPreview(undefined);
    } finally {
      generating = false;
    }
  }

  function applyDefaultExportPreset(): void {
    exportFormats = ['svg', 'pdf'];
    svgLayers = ['cut', 'score', 'guide'];
  }

  function applyMaterialPreset(preset: MaterialPreset): void {
    onboardingMaterialPreset = preset;
    const config = MATERIAL_PRESET_CONTENT[preset];
    shapeDefinition = {
      ...shapeDefinition,
      thickness: config.thickness,
      allowance: config.allowance,
      seamMode: config.seamMode,
      units: 'mm'
    };
  }

  function applyFamilyDefaults(mode: ShapeBuilderMode): void {
    onboardingShapeFamily = mode;
    if (mode === 'legacy') {
      setBuilderMode('legacy');
      useSplitEdges = false;
      shapeDefinition = {
        ...shapeDefinition,
        height: 150,
        bottomWidth: 100,
        topWidth: 120,
        segments: 8,
        bottomSegments: 8,
        topSegments: 8
      };
      return;
    }

    setBuilderMode('polyhedron');
    applyCatalogSelection('dodecahedron');
    shapeDefinition = {
      ...shapeDefinition,
      polyhedron: normalizePolyhedron({
        ...shapeDefinition.polyhedron,
        preset: 'dodecahedron',
        edgeLength: 55
      })
    };
  }

  function applyOnboardingDefaultsAndGenerate(): void {
    applyDefaultExportPreset();
    applyFamilyDefaults(onboardingShapeFamily);
    applyMaterialPreset(onboardingMaterialPreset);
    generateExports();
  }

  function restoreSafeDefaults(): void {
    shapeDefinition = { ...initialShapeDefinition, polyhedron: { ...initialPolyhedron } };
    builderMode = 'legacy';
    polyhedronInputMode = 'catalog';
    selectedCatalogKey = 'cube';
    selectedFamilyPreset = 'regularPrism';
    useSplitEdges = false;
    materialSizePreset = 'none';
    customMaterialWidth = 12;
    customMaterialHeight = 24;
    customMaterialUnits = 'in';
    generatedSvgPreviewMode = 'combined';
    generatedSvgLayerSnapshot = ['cut', 'score', 'guide'];
    generatedSheetLayoutSnapshot = undefined;
    applyDefaultExportPreset();
    error = '';
    exportSuccess = 'Safe defaults restored. Generate to see updated files.';
  }

  function loadSampleProject(): void {
    applyDefaultExportPreset();
    applyFamilyDefaults('legacy');
    applyMaterialPreset('slabClay');
    exportSuccess = 'Sample project loaded. Generate files when ready.';
  }

  function startGuidedSetup(): void {
    showWelcomeModal = false;
    guidedSetupActive = true;
    onboardingStep = 1;
  }

  function skipGuidedSetup(): void {
    guidedSetupActive = false;
    showWelcomeModal = false;
    persistOnboardingSeen();
  }

  function persistOnboardingSeen(): void {
    window.localStorage.setItem(ONBOARDING_SEEN_KEY, '1');
  }

  function nextOnboardingStep(): void {
    onboardingStep = Math.min(3, onboardingStep + 1);
  }

  function previousOnboardingStep(): void {
    onboardingStep = Math.max(1, onboardingStep - 1);
  }

  function startTour(): void {
    tourMode = true;
    tourStepIndex = 0;
  }

  function stopTour(): void {
    tourMode = false;
    tourStepIndex = 0;
  }

  function nextTourStep(): void {
    if (tourStepIndex >= TOUR_STEPS.length - 1) {
      stopTour();
      return;
    }

    tourStepIndex += 1;
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
  <title>OpenPottery Template Maker</title>
</svelte:head>

<main>
  <section
    class="card"
    class:tour-highlight={tourMode && activeTourStep?.target === 'builder'}
    data-tour-target="builder"
  >
    <div class="header-row">
      <div>
        <h1>OpenPottery Template Maker</h1>
        <p class="sub">Guided-first for non-technical users. Session state clears on refresh.</p>
      </div>
      <div class="header-actions">
        <a class="small-link" href="/">Back to landing</a>
        <button class="small" type="button" on:click={loadSampleProject}>Load Sample</button>
        <button class="small" type="button" on:click={startGuidedSetup}>Guided Setup</button>
      </div>
    </div>

    <div class="quick-role-row">
      <button type="button" class="small" on:click={restoreSafeDefaults}>Reset to Safe Defaults</button>
      <button type="button" class="small" on:click={tourMode ? stopTour : startTour}>
        {tourMode ? 'Stop Tour' : 'Start Tour'}
      </button>
    </div>

    {#if tourMode}
      <div class="tour-banner">
        <strong>Tour step {tourStepIndex + 1} of {TOUR_STEPS.length}:</strong>
        {activeTourStep.title} - {activeTourStep.detail}
        <button type="button" class="small" on:click={nextTourStep}>Next</button>
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
        <label>
          <span class="field-title">Height <span class="tip" title="Overall form height.">?</span></span>
          <input type="number" bind:value={shapeDefinition.height} min="1" />
        </label>
        <label>
          <span class="field-title"
            >Bottom Width <span class="tip" title="Width of the base opening.">?</span></span
          >
          <input type="number" bind:value={shapeDefinition.bottomWidth} min="1" />
        </label>
        <label>
          <span class="field-title">Top Width <span class="tip" title="Width of the top opening.">?</span></span>
          <input type="number" bind:value={shapeDefinition.topWidth} min="1" />
        </label>
        <label>
          <span class="field-title"
            >Segments
            <span class="tip" title="Number of sides around the form. Higher values feel rounder.">?</span></span
          >
          <input type="number" bind:value={shapeDefinition.segments} min="3" max="256" />
        </label>
        <label class="split-toggle">
          <input type="checkbox" bind:checked={useSplitEdges} />
          Use separate top/bottom edges
        </label>
        {#if useSplitEdges}
          <label>
            <span class="field-title"
              >Bottom Edges
              <span class="tip" title="Number of edges at the bottom profile.">?</span></span
            >
            <input type="number" bind:value={shapeDefinition.bottomSegments} min="3" max="256" />
          </label>
          <label>
            <span class="field-title"
              >Top Edges
              <span class="tip" title="Number of edges at the top profile.">?</span></span
            >
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
          <label>
            <span class="field-title"
              >Template Catalog
              <span class="tip" title="Pre-vetted solids for reliable first results.">?</span></span
            >
            <select
              value={selectedCatalogKey}
              on:change={(event) => applyCatalogSelection((event.currentTarget as HTMLSelectElement).value)}
            >
              {#each POLYHEDRON_CATALOG_OPTIONS as option}
                <option value={option.key}>{option.label} ({option.faces})</option>
              {/each}
            </select>
          </label>
        {:else}
          <label>
            <span class="field-title"
              >Family
              <span class="tip" title="Parametric families with side-count constraints.">?</span></span
            >
            <select
              value={selectedFamilyPreset}
              on:change={(event) =>
                applyFamilyPreset((event.currentTarget as HTMLSelectElement).value as PolyhedronFamilyPreset)}
            >
              {#each POLYHEDRON_FAMILY_OPTIONS as family}
                <option value={family.value}>{family.label} ({family.faces})</option>
              {/each}
            </select>
          </label>
        {/if}

        <label>
          <span class="field-title"
            >Face Edge Length
            <span class="tip" title="Larger values scale the entire polyhedron template.">?</span></span
          >
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
          <label>
            <span class="field-title"
              >N-gon Sides
              <span class="tip" title="How many sides on top and bottom rings in family mode.">?</span></span
            >
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

        <label>
          <span class="field-title"
            >Face Composition
            <span class="tip" title="Shows whether the model uses one face type or mixed faces.">?</span></span
          >
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

      <p class="muted">Catalog exposes vetted solids. Family mode constrains side counts to valid ranges.</p>
    {/if}

    <div
      class="grid fabrication-grid"
      class:tour-highlight={tourMode && activeTourStep?.target === 'fabrication'}
      data-tour-target="fabrication"
    >
      <label>
        <span class="field-title"
          >Thickness
          <span class="tip" title="Material thickness used for practical fabrication defaults.">?</span></span
        >
        <input type="number" bind:value={shapeDefinition.thickness} min="0.1" step="0.1" />
      </label>
      <label>
        <span class="field-title"
          >Allowance
          <span class="tip" title="Extra join material for overlap or tabs.">?</span></span
        >
        <input type="number" bind:value={shapeDefinition.allowance} min="0" step="0.1" />
      </label>
      <label>
        <span class="field-title"
          >Units
          <span class="tip" title="Set this to match your print and measuring workflow.">?</span></span
        >
        <select bind:value={shapeDefinition.units}>
          <option value="mm">mm</option>
          <option value="in">in</option>
        </select>
      </label>
      <label>
        <span class="field-title"
          >Seam Mode
          <span class="tip" title="Choose seam style for your assembly method.">?</span></span
        >
        <select bind:value={shapeDefinition.seamMode}>
          <option value="straight">straight</option>
          <option value="overlap">overlap</option>
          <option value="tabbed">tabbed</option>
        </select>
      </label>
      {#if builderMode === 'legacy'}
        <label class="inline-check">
          <input
            type="checkbox"
            bind:checked={shapeDefinition.includeTopCap}
            disabled={resolvedShapeDefinition.topSegments === 1}
          />
          Include top cap piece
        </label>
      {/if}
    </div>

    <div class="config-group">
      <div class="config-title">Material Size and SVG Splitting</div>
      <div class="grid material-grid">
        <label>
          <span class="field-title"
            >Target Material
            <span class="tip" title="Split SVG pages to match printer paper or cutting mat limits.">?</span></span
          >
          <select bind:value={materialSizePreset}>
            {#each MATERIAL_SIZE_PRESET_OPTIONS as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </label>

        {#if materialSizePreset === 'custom'}
          <label>
            <span class="field-title">Custom Width</span>
            <input type="number" min="0.1" step="0.1" bind:value={customMaterialWidth} />
          </label>
          <label>
            <span class="field-title">Custom Height</span>
            <input type="number" min="0.1" step="0.1" bind:value={customMaterialHeight} />
          </label>
          <label>
            <span class="field-title">Custom Units</span>
            <select bind:value={customMaterialUnits}>
              <option value="mm">mm</option>
              <option value="in">in</option>
            </select>
          </label>
        {/if}
      </div>

      {#if usingCricutMaterial}
        <div class="cricut-perf-box">
          <label class="inline-check">
            <input type="checkbox" bind:checked={cricutPerforationEnabled} />
            Perforate score lines for Cricut (keeps base/folds attached)
          </label>
          {#if cricutPerforationEnabled}
            <div class="grid material-grid">
              <label>
                <span class="field-title">Perforation cut length ({resolvedShapeDefinition.units})</span>
                <input
                  type="number"
                  min="0.05"
                  step="0.05"
                  bind:value={cricutPerforationCutLength}
                />
              </label>
              <label>
                <span class="field-title">Perforation gap length ({resolvedShapeDefinition.units})</span>
                <input
                  type="number"
                  min="0.05"
                  step="0.05"
                  bind:value={cricutPerforationGapLength}
                />
              </label>
            </div>
            <p class="muted">
              Start with equal cut/gap values (50% duty), then adjust until folds are flexible but still held.
            </p>
          {/if}
        </div>
      {/if}

      {#if materialSizePreset !== 'none'}
        {#if previewSheetGuides}
          <p class="muted">
            Live split estimate: {previewSheetGuides.cols}x{previewSheetGuides.rows} (
            {previewSheetGuides.cols * previewSheetGuides.rows} sheets).
          </p>
        {/if}
        <p class="muted">
          SVG export is automatically split into one or more sheets/mats that fit your selected size.
        </p>
      {:else}
        <p class="muted">No size constraint selected. SVG export remains one raw file.</p>
      {/if}
    </div>

    <div class="config-group">
      <div class="config-title">Export Formats</div>
      <div class="formats">
        <label
          ><input
            type="checkbox"
            checked={exportFormats.includes('svg')}
            on:change={() => toggleExport('svg')}
          /> SVG</label
        >
        <label
          ><input
            type="checkbox"
            checked={exportFormats.includes('pdf')}
            on:change={() => toggleExport('pdf')}
          /> PDF</label
        >
        <label
          ><input
            type="checkbox"
            checked={exportFormats.includes('stl')}
            on:change={() => toggleExport('stl')}
          /> STL</label
        >
      </div>
    </div>

    <div class="config-group">
      <div class="config-title">2D Layers (SVG/PDF)</div>
      {#if usingCricutMaterial}
        <p class="muted">
          Cricut mode always includes <strong>Cut</strong> (outer separation) and <strong>Score</strong>
          (piece-to-piece connections).
        </p>
      {/if}
      <div class="formats">
        <label
          ><input
            type="checkbox"
            checked={svgLayers.includes('cut')}
            on:change={() => toggleSvgLayer('cut')}
          /> Cut</label
        >
        <label
          ><input
            type="checkbox"
            checked={svgLayers.includes('score')}
            on:change={() => toggleSvgLayer('score')}
          /> Score</label
        >
        <label
          ><input
            type="checkbox"
            checked={svgLayers.includes('guide')}
            on:change={() => toggleSvgLayer('guide')}
          /> Guide</label
        >
      </div>
    </div>

    <button on:click={generateExports} disabled={generating}>
      {generating ? 'Generating...' : 'Generate Files'}
    </button>

    {#if exportSuccess}
      <div class="success-panel">
        <p>{exportSuccess}</p>
        <div class="actions-row">
          <button type="button" class="small" on:click={downloadSelectedAsZip}>
            Download ZIP ({totalGeneratedDownloadFileCount} files)
          </button>
        </div>
      </div>
    {/if}

    {#if generatedGeometry}
      <div class="output-summary">
        <div><strong>Last Generated:</strong> {generatedAt}</div>
        <div class="muted">
          Kind: {generatedGeometry.kind} - Faces: {generatedGeometry.metrics.faceCount} - Surface Area:
          {generatedGeometry.metrics.surfaceArea.toFixed(2)}
        </div>
        {#if generatedSvgPages.length > 0}
          <div class="muted">
            SVG sheets: {generatedSvgPages.length}
            {#if materialSizePreset !== 'none'}
              ({selectedMaterialPresetOption.label})
            {/if}
          </div>
        {/if}
      </div>
    {:else}
      <div class="coach-card">
        <strong>First time here?</strong>
        <p>Use "Load Sample" or "Guided Setup" above, then click Generate Files.</p>
      </div>
    {/if}

    {#if generatedGeometry?.warnings.length}
      <div class="warnings">
        {#each generatedGeometry.warnings as warning}
          <p class="error">{warning}</p>
        {/each}
        <button class="small" type="button" on:click={() => (showWarningHelp = !showWarningHelp)}>
          {showWarningHelp ? 'Hide warning help' : 'Why am I seeing this warning?'}
        </button>
        {#if showWarningHelp}
          <p class="muted warning-help">
            Warnings appear when dimensions, seam choices, or edge counts may be hard to assemble. Try
            increasing allowance, reducing extreme tapers, or choosing a simpler template.
          </p>
        {/if}
      </div>
    {/if}

    {#if error}
      <p class="error">{error}</p>
    {/if}
  </section>

  <section
    class="card preview"
    class:tour-highlight={tourMode && activeTourStep?.target === 'preview'}
    data-tour-target="preview"
  >
    <h2>Live Preview</h2>
    <p class="muted">2D and 3D update from current parameters.</p>

    {#if builderMode === 'polyhedron'}
      <p class="muted">
        Polyhedron: {normalizedPolyhedron.preset}
        {#if isFamilyPreset(normalizedPolyhedron.preset)}
          - sides: {normalizedPolyhedron.ringSides}
        {/if}
        - face mode: {normalizedPolyhedron.faceMode}
      </p>
    {:else if useSplitEdges}
      <p class="muted">Split edges active ({effectiveBottomSegments}/{effectiveTopSegments}).</p>
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
            {#if previewSheetGuides}
              <g class="sheet-guides" aria-hidden="true">
                {#each previewSheetGuides.vertical as x}
                  <line
                    class="sheet-guide-line"
                    x1={x}
                    y1={liveTemplate.bounds.minY}
                    x2={x}
                    y2={liveTemplate.bounds.maxY}
                  />
                {/each}
                {#each previewSheetGuides.horizontal as y}
                  <line
                    class="sheet-guide-line"
                    x1={liveTemplate.bounds.minX}
                    y1={y}
                    x2={liveTemplate.bounds.maxX}
                    y2={y}
                  />
                {/each}
              </g>
            {/if}
          </g>
        </svg>
        <div class="muted">
          Drag to pan. Mouse wheel to zoom.
          {#if previewSheetGuides}
            Sheet preview: {previewSheetGuides.cols}x{previewSheetGuides.rows} ({selectedMaterialPresetOption.label}).
          {/if}
        </div>
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
    {#if generatedSvgPages.length > 1}
      <div class="actions-row">
        <button
          type="button"
          class="small"
          class:tab-active={generatedSvgPreviewMode === 'combined'}
          on:click={() => setGeneratedSvgPreviewMode('combined')}
        >
          Combined Split Map
        </button>
        <button
          type="button"
          class="small"
          class:tab-active={generatedSvgPreviewMode === 'sheets'}
          on:click={() => setGeneratedSvgPreviewMode('sheets')}
        >
          Sheet by Sheet
        </button>
      </div>

      {#if generatedSvgPreviewMode === 'sheets'}
        <p class="muted">
          Showing sheet {generatedSvgPreviewSheetIndex + 1} of {generatedSvgPages.length}. Select another sheet:
        </p>
        <div class="actions-row">
          {#each generatedSvgPages as page, idx}
            <button
              type="button"
              class="small"
              class:tab-active={generatedSvgPreviewSheetIndex === idx}
              on:click={() => previewGeneratedSvgSheet(idx)}
            >
              Sheet {page.row},{page.column}
            </button>
          {/each}
        </div>
      {:else}
        <p class="muted">
          Combined map: one full template with red split lines and no split tabs, for alignment/debug review.
        </p>
      {/if}
    {:else if previewSheetGuides && materialSizePreset !== 'none'}
      <p class="muted">
        Live split estimate: {previewSheetGuides.cols}x{previewSheetGuides.rows} (
        {previewSheetGuides.cols * previewSheetGuides.rows} sheets). Generate files to preview split sheets here.
      </p>
    {/if}
    {#if svgPreviewUrl}
      <img class="svg-preview" src={svgPreviewUrl} alt="Generated SVG template" />
    {:else}
      <p>No SVG generated yet.</p>
    {/if}

    <div
      class="help-panel"
      class:tour-highlight={tourMode && activeTourStep?.target === 'help'}
      data-tour-target="help"
    >
      <div class="help-head">
        <h2>Help</h2>
        <input
          type="search"
          placeholder="Search terms like seam, segments, score..."
          bind:value={helpQuery}
          aria-label="Search help topics"
        />
      </div>

      <div class="recipes">
        <h3>Common Recipes</h3>
        <div class="recipe-grid">
          <article>
            <strong>Tapered cup starter</strong>
            <p class="muted">Legacy mode, 8 segments, slab clay defaults.</p>
            <button class="small" type="button" on:click={() => {
              applyFamilyDefaults('legacy');
              applyMaterialPreset('slabClay');
              shapeDefinition = { ...shapeDefinition, topWidth: 110, bottomWidth: 80, height: 120 };
            }}>Apply</button>
          </article>
          <article>
            <strong>Geometric lamp mockup</strong>
            <p class="muted">Polyhedron dodecahedron with paper defaults.</p>
            <button class="small" type="button" on:click={() => {
              applyFamilyDefaults('polyhedron');
              applyMaterialPreset('paper');
              shapeDefinition = {
                ...shapeDefinition,
                polyhedron: normalizePolyhedron({ ...shapeDefinition.polyhedron, preset: 'dodecahedron', edgeLength: 48 })
              };
            }}>Apply</button>
          </article>
        </div>
      </div>

      <div class="glossary">
        <h3>Glossary</h3>
        {#if filteredHelpItems.length === 0}
          <p class="muted">No help topics match your search.</p>
        {:else}
          {#each filteredHelpItems as item}
            <article>
              <strong>{item.term}</strong>
              <p class="muted">{item.description}</p>
            </article>
          {/each}
        {/if}
      </div>

      <div class="troubleshooting">
        <h3>Troubleshooting</h3>
        <ul>
          {#each TROUBLESHOOTING as step}
            <li>{step}</li>
          {/each}
        </ul>
      </div>
    </div>
  </section>

  {#if showWelcomeModal}
    <div class="modal-shell" role="dialog" aria-modal="true" aria-label="Welcome setup">
      <div class="modal">
        <h2>Welcome to the Template Maker</h2>
        <p>Would you like a guided setup for your first export?</p>
        <div class="actions-row">
          <button class="small" type="button" on:click={startGuidedSetup}>Guided setup (recommended)</button>
          <button class="small" type="button" on:click={skipGuidedSetup}>Skip to editor</button>
        </div>
      </div>
    </div>
  {/if}

  {#if guidedSetupActive}
    <div class="modal-shell" role="dialog" aria-modal="true" aria-label="Guided setup wizard">
      <div class="modal wizard">
        <h2>Guided setup</h2>
        <p class="muted">Step {onboardingStep} of 3</p>

        {#if onboardingStep === 1}
          <h3>Choose a shape family</h3>
          <div class="choice-row">
            <button
              type="button"
              class="chip"
              class:chip-active={onboardingShapeFamily === 'legacy'}
              on:click={() => (onboardingShapeFamily = 'legacy')}
            >
              Dimension Builder
            </button>
            <button
              type="button"
              class="chip"
              class:chip-active={onboardingShapeFamily === 'polyhedron'}
              on:click={() => (onboardingShapeFamily = 'polyhedron')}
            >
              Polyhedron Templates
            </button>
          </div>
        {/if}

        {#if onboardingStep === 2}
          <h3>Choose material and purpose</h3>
          <div class="choice-grid">
            {#each Object.entries(MATERIAL_PRESET_CONTENT) as [key, preset]}
              <button
                type="button"
                class="choice-card"
                class:choice-active={onboardingMaterialPreset === key}
                on:click={() => (onboardingMaterialPreset = key as MaterialPreset)}
              >
                <strong>{preset.label}</strong>
                <span>{preset.note}</span>
              </button>
            {/each}
          </div>

        {/if}

        {#if onboardingStep === 3}
          <h3>Apply safe defaults and generate</h3>
          <p class="muted">
            Family: {onboardingShapeFamily === 'legacy' ? 'Dimension Builder' : 'Polyhedron Templates'}
          </p>
          <p class="muted">Material: {MATERIAL_PRESET_CONTENT[onboardingMaterialPreset].label}</p>
        {/if}

        <div class="actions-row">
          <button class="small" type="button" disabled={onboardingStep === 1} on:click={previousOnboardingStep}>
            Back
          </button>
          {#if onboardingStep < 3}
            <button class="small" type="button" on:click={nextOnboardingStep}>Next</button>
          {:else}
            <button class="small" type="button" on:click={applyOnboardingDefaultsAndGenerate}>
              Apply and generate
            </button>
          {/if}
          <button class="small" type="button" on:click={skipGuidedSetup}>Close</button>
        </div>
      </div>
    </div>
  {/if}
</main>

<style>
  :global(body) {
    --bg-0: #f5efe4;
    --bg-1: #f3eadb;
    --card: #fffdf8;
    --card-border: #ddcdb4;
    --panel: #fcf5ea;
    --text: #1f1d1a;
    --muted: #5b554c;
    --input-bg: #fffdf8;
    --input-border: #ddcdb4;
    --button: #eee4d5;
    --button-hover: #d7c5aa;
    --button-text: #1f1d1a;
    --accent: #b25a2e;
    --accent-2: #8f3f18;
    --danger: #c2410c;
    --success: #166534;
    margin: 0;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    background: linear-gradient(160deg, var(--bg-0), var(--bg-1));
    color: var(--text);
  }

  main {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 430px 1fr;
    gap: 1rem;
    padding: 1rem;
    position: relative;
  }

  .card {
    background: var(--card);
    border: 1px solid var(--card-border);
    border-radius: 12px;
    padding: 1rem;
    box-shadow: 0 4px 20px rgba(31, 29, 26, 0.06);
  }

  h1,
  h2,
  h3 {
    margin: 0;
  }

  h1 {
    font-size: 1.3rem;
  }

  h2 {
    font-size: 1.05rem;
    margin-bottom: 0.25rem;
  }

  h3 {
    font-size: 0.93rem;
  }

  .sub {
    margin-top: 0.25rem;
    color: var(--muted);
    font-size: 0.8rem;
  }

  .header-row {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    align-items: flex-start;
  }

  .header-actions {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .small-link {
    color: var(--accent);
    text-decoration: none;
    font-size: 0.8rem;
  }

  .small-link:hover {
    text-decoration: underline;
  }

  .quick-role-row {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    margin-top: 0.8rem;
    margin-bottom: 0.4rem;
  }

  .chip {
    border: 1px solid var(--card-border);
    background: #eee4d5;
    color: var(--text);
    border-radius: 999px;
    padding: 0.35rem 0.7rem;
    font-size: 0.75rem;
  }

  .chip-active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fffdf8;
  }

  .tour-banner {
    margin-top: 0.6rem;
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
    border: 1px dashed var(--accent);
    border-radius: 10px;
    background: rgba(178, 90, 46, 0.1);
    padding: 0.5rem;
    font-size: 0.82rem;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
    margin: 1rem 0;
  }

  .builder-tabs {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.9rem;
  }

  .builder-tabs button,
  .poly-subtabs button {
    background: var(--button);
    color: var(--text);
    border: 1px solid var(--card-border);
  }

  .builder-tabs button.tab-active,
  .poly-subtabs button.tab-active {
    background: var(--accent);
    color: #fffdf8;
    border-color: var(--accent);
  }

  .poly-subtabs {
    display: flex;
    gap: 0.45rem;
    grid-column: 1 / -1;
    margin-bottom: 0.15rem;
  }

  .field-title {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.86rem;
  }

  .tip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    border-radius: 999px;
    border: 1px solid var(--card-border);
    color: var(--muted);
    font-size: 0.68rem;
    cursor: help;
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

  .cricut-perf-box {
    border: 1px solid var(--card-border);
    border-radius: 9px;
    background: #eee4d5;
    padding: 0.55rem 0.6rem;
    margin: 0.2rem 0 0.45rem;
  }

  .inline-check {
    flex-direction: row;
    align-items: center;
    gap: 0.45rem;
    margin: 0 0 0.45rem;
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
    background: #eee4d5;
    color: var(--muted);
  }

  button {
    border: 1px solid var(--card-border);
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

  .success-panel {
    border: 1px solid rgba(22, 101, 52, 0.4);
    background: rgba(22, 101, 52, 0.1);
    border-radius: 10px;
    padding: 0.6rem;
    margin-top: 0.7rem;
  }

  .success-panel p {
    margin: 0;
    font-size: 0.82rem;
  }

  .coach-card {
    border: 1px dashed var(--card-border);
    border-radius: 10px;
    background: #fcf5ea;
    padding: 0.65rem;
    margin-top: 0.7rem;
  }

  .coach-card p {
    margin: 0.35rem 0 0;
    color: var(--muted);
    font-size: 0.78rem;
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

  .warning-help {
    margin-top: 0.4rem;
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
    background: var(--panel);
  }

  .preview-pane h3 {
    margin: 0;
    font-size: 0.87rem;
    color: var(--text);
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
      linear-gradient(rgba(221, 205, 180, 0.5) 1px, transparent 1px) 0 0 / 100% 20px,
      linear-gradient(90deg, rgba(221, 205, 180, 0.5) 1px, transparent 1px) 0 0 / 20px 100%,
      #fcf5ea;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }

  .preview-pane svg.rotating-active,
  .preview-pane svg.template-panning-active {
    cursor: grabbing;
  }

  .preview .svg-preview {
    width: 100%;
    height: 46vh;
    border: 1px solid var(--card-border);
    border-radius: 10px;
    margin-top: 0.5rem;
    background: #fffdf8;
    object-fit: contain;
  }

  .help-panel {
    margin-top: 0.9rem;
    border: 1px solid var(--card-border);
    border-radius: 11px;
    background: #fcf5ea;
    padding: 0.7rem;
  }

  .help-head {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .help-head input {
    flex: 1;
    min-width: 200px;
  }

  .recipe-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.55rem;
    margin-bottom: 0.75rem;
  }

  .recipe-grid article,
  .glossary article {
    border: 1px solid var(--card-border);
    border-radius: 9px;
    padding: 0.5rem;
    background: #eee4d5;
  }

  .recipe-grid p,
  .glossary p {
    margin: 0.35rem 0;
  }

  .troubleshooting ul {
    margin: 0.35rem 0 0;
    padding-left: 1rem;
    color: var(--muted);
  }

  .troubleshooting li {
    margin-bottom: 0.25rem;
    font-size: 0.8rem;
  }

  .tour-highlight {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .modal-shell {
    position: fixed;
    inset: 0;
    background: rgba(31, 29, 26, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    z-index: 20;
  }

  .modal {
    width: min(560px, 100%);
    background: #fffdf8;
    border: 1px solid var(--card-border);
    border-radius: 14px;
    padding: 1rem;
  }

  .wizard {
    width: min(650px, 100%);
  }

  .choice-row {
    display: flex;
    gap: 0.45rem;
    flex-wrap: wrap;
    margin: 0.45rem 0 0.8rem;
  }

  .choice-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.55rem;
    margin-top: 0.4rem;
    margin-bottom: 0.75rem;
  }

  .choice-card {
    text-align: left;
    min-height: 102px;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.65rem;
    border-radius: 11px;
    border: 1px solid var(--card-border);
    background: #eee4d5;
    color: var(--text);
  }

  .choice-card span {
    font-size: 0.78rem;
    color: var(--muted);
  }

  .choice-active {
    border-color: var(--accent);
    background: var(--accent-2);
    color: #fffdf8;
  }

  .choice-active span {
    color: rgba(255, 253, 248, 0.9);
  }

  .layer-cut {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.1;
  }

  .layer-score {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.1;
  }

  .layer-guide {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.1;
  }

  .sheet-guide-line {
    stroke: var(--danger);
    stroke-width: 1.35;
    stroke-dasharray: 6 4;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
    opacity: 0.95;
    filter: drop-shadow(0 0 1.1px rgba(194, 65, 12, 0.45));
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

    .preview-dual,
    .recipe-grid,
    .choice-grid {
      grid-template-columns: 1fr;
    }

    .preview .svg-preview {
      height: 42vh;
    }

    .help-head {
      flex-direction: column;
      align-items: flex-start;
    }

    .help-head input {
      width: 100%;
      min-width: 0;
    }
  }
</style>
