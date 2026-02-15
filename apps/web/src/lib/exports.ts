import {
  buildCanonicalGeometry,
  renderTemplatePdf,
  renderTemplateStl,
  renderTemplateSvg
} from '@torrify/geometry-engine';
import type {
  CanonicalGeometry,
  ExportFormat,
  ShapeDefinition,
  SvgLayer
} from '@torrify/shared-types';

export interface GeneratedArtifacts {
  geometry: CanonicalGeometry;
  artifacts: Partial<Record<ExportFormat, string>>;
}

export function filterTemplateLayers(
  geometry: CanonicalGeometry,
  layers: SvgLayer[]
): CanonicalGeometry {
  if (!layers.length) {
    return geometry;
  }

  const allowed = new Set(layers);
  return {
    ...geometry,
    template: {
      ...geometry.template,
      paths: geometry.template.paths.filter((path) => allowed.has(path.layer))
    }
  };
}

export function generateExportArtifacts(options: {
  shapeDefinition: ShapeDefinition;
  exportFormats: ExportFormat[];
  svgLayers: SvgLayer[];
}): GeneratedArtifacts {
  const { shapeDefinition, exportFormats, svgLayers } = options;

  if (exportFormats.length === 0) {
    throw new Error('Select at least one export format');
  }

  const geometry = buildCanonicalGeometry(shapeDefinition);
  const layeredGeometry = filterTemplateLayers(geometry, svgLayers);
  const artifacts: Partial<Record<ExportFormat, string>> = {};

  if (exportFormats.includes('svg')) {
    artifacts.svg = renderTemplateSvg(layeredGeometry);
  }

  if (exportFormats.includes('pdf')) {
    artifacts.pdf = renderTemplatePdf(layeredGeometry);
  }

  if (exportFormats.includes('stl')) {
    artifacts.stl = renderTemplateStl(shapeDefinition);
  }

  return {
    geometry,
    artifacts
  };
}

export function artifactMimeType(format: ExportFormat): string {
  if (format === 'svg') {
    return 'image/svg+xml;charset=utf-8';
  }

  if (format === 'pdf') {
    return 'application/pdf';
  }

  return 'model/stl;charset=utf-8';
}

export function artifactFileName(
  format: ExportFormat,
  kind: CanonicalGeometry['kind'],
  at = new Date()
): string {
  const stamp = at.toISOString().replace(/:/g, '-').replace(/\..+$/, '');
  return `torrify-${kind}-${stamp}.${format}`;
}

export function availableArtifactFormats(
  artifacts: Partial<Record<ExportFormat, string>>
): ExportFormat[] {
  return (['svg', 'pdf', 'stl'] as const).filter((format) => Boolean(artifacts[format]));
}
