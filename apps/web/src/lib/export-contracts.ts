import type {
  CanonicalGeometry,
  ExportFormat,
  SvgLayer,
  Units
} from '@torrify/shared-types';

export type MaterialSizePreset =
  | 'none'
  | 'printer-letter'
  | 'printer-a4'
  | 'cricut-mat-12x12'
  | 'cricut-mat-12x24'
  | 'cricut-smart-13x24'
  | 'custom';

export type SplitJoinStyle = 'tabs' | 'tape';

export interface MaterialSizePresetOption {
  value: MaterialSizePreset;
  label: string;
  width?: number;
  height?: number;
  units?: Units;
}

export const MATERIAL_SIZE_PRESET_OPTIONS: MaterialSizePresetOption[] = [
  { value: 'none', label: 'No size constraint (raw SVG)' },
  { value: 'printer-letter', label: 'Printer Letter 8.5x11 in', width: 8.5, height: 11, units: 'in' },
  { value: 'printer-a4', label: 'Printer A4 210x297 mm', width: 210, height: 297, units: 'mm' },
  { value: 'cricut-mat-12x12', label: 'Cricut mat 12x12 in', width: 12, height: 12, units: 'in' },
  { value: 'cricut-mat-12x24', label: 'Cricut mat 12x24 in', width: 12, height: 24, units: 'in' },
  {
    value: 'cricut-smart-13x24',
    label: 'Cricut smart material 13x24 in chunk',
    width: 13,
    height: 24,
    units: 'in'
  },
  { value: 'custom', label: 'Custom size' }
];

export interface ExportSheetLayoutOptions {
  materialSizePreset: MaterialSizePreset;
  customSize?: {
    width: number;
    height: number;
    units: Units;
  };
  optimizePacking?: boolean;
  allowRotation?: boolean;
  includeAssemblyGuide?: boolean;
  // Legacy split-join controls are ignored; split pages now always use straight cuts.
  joinStyle?: SplitJoinStyle;
  includeAlignmentKeys?: boolean;
}

export interface SvgPerforationOptions {
  enabled: boolean;
  layers?: SvgLayer[];
  cutLength: number;
  gapLength: number;
}

export interface GeneratedSvgPage {
  kind: 'sheet' | 'assembly-guide';
  index: number;
  row: number;
  column: number;
  fileNameSuffix: string;
  label: string;
  content: string;
}

export interface GeneratedArtifacts {
  geometry: CanonicalGeometry;
  artifacts: Partial<Record<ExportFormat, string>>;
  svgPages: GeneratedSvgPage[];
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
  at = new Date(),
  suffix?: string
): string {
  const stamp = at.toISOString().replace(/:/g, '-').replace(/\..+$/, '');
  const suffixPart = suffix ? `-${suffix}` : '';
  return `polygonewild-${kind}-${stamp}${suffixPart}.${format}`;
}

export function availableArtifactFormats(
  artifacts: Partial<Record<ExportFormat, string>>
): ExportFormat[] {
  return (['svg', 'pdf', 'stl'] as const).filter((format) => Boolean(artifacts[format]));
}
