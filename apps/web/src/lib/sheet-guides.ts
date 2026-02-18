import type { ExportSheetLayoutOptions, MaterialSizePresetOption } from './export-contracts';
import type { Units } from '@torrify/shared-types';

// Keep all sheet-guide math in one place so route components stay UI-focused.
const MM_PER_INCH = 25.4;

export interface SheetGuideOverlay {
  cols: number;
  rows: number;
  vertical: number[];
  horizontal: number[];
}

export interface Bounds2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function convertUnits(value: number, from: Units, to: Units): number {
  if (from === to) {
    return value;
  }

  if (from === 'in' && to === 'mm') {
    return value * MM_PER_INCH;
  }

  return value / MM_PER_INCH;
}

export function resolveSheetSizeForLayout(
  layout: Pick<ExportSheetLayoutOptions, 'materialSizePreset' | 'customSize'> | undefined,
  units: Units,
  presets: MaterialSizePresetOption[]
): { width: number; height: number } | undefined {
  // "none" means keep one unconstrained SVG; no virtual sheet grid.
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

  const preset = presets.find((option) => option.value === layout.materialSizePreset);
  if (!preset || !preset.width || !preset.height || !preset.units) {
    return undefined;
  }

  return {
    width: convertUnits(preset.width, preset.units, units),
    height: convertUnits(preset.height, preset.units, units)
  };
}

export function buildSheetGuideOverlayFromBounds(
  bounds: Bounds2D,
  units: Units,
  sheetSize: { width: number; height: number }
): SheetGuideOverlay | undefined {
  // Margin mirrors export behavior so the preview grid and generated pages align.
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

export function buildSheetGuideOverlayForPaths(
  paths: Array<{ points: Array<{ x: number; y: number }> }>,
  units: Units,
  layout: Pick<ExportSheetLayoutOptions, 'materialSizePreset' | 'customSize'> | undefined,
  presets: MaterialSizePresetOption[]
): SheetGuideOverlay | undefined {
  // Compute bounds from live path data to produce a rough but fast split estimate.
  const sheetSize = resolveSheetSizeForLayout(layout, units, presets);
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

  return buildSheetGuideOverlayFromBounds(bounds, units, sheetSize);
}
