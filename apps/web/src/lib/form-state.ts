import type { ExportFormat, SvgLayer } from '@polyhedral-nets/shared-types';

export function clampInt(value: number, min: number, max: number, fallback: number): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

export function toggleExportFormat(
  formats: ExportFormat[],
  format: ExportFormat
): ExportFormat[] {
  if (formats.includes(format)) {
    return formats.filter((value) => value !== format);
  }

  return [...formats, format];
}

export function toggleSvgLayerSelection(
  layers: SvgLayer[],
  layer: SvgLayer
): SvgLayer[] {
  if (layers.includes(layer)) {
    if (layers.length === 1) {
      return layers;
    }

    return layers.filter((value) => value !== layer);
  }

  return [...layers, layer];
}
