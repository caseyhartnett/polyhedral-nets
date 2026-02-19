import type { ShapeDefinition } from '@torrify/shared-types';

// Static copy and content metadata for the app route.
// Keeping this separate makes route logic easier to scan and test.
export type ShapeBuilderMode = 'legacy' | 'polyhedron';
export type PolyhedronInputMode = 'catalog' | 'johnson' | 'family';
export type PolyhedronFamilyPreset = 'regularPrism' | 'regularAntiprism' | 'regularBipyramid';
export type MaterialPreset = 'paper' | 'slabClay' | 'board';
export type TourTarget = 'builder' | 'fabrication' | 'preview' | 'help';

export interface HelpItem {
  term: string;
  description: string;
  tags: string[];
}

export interface TourStep {
  target: TourTarget;
  title: string;
  detail: string;
}

export interface MaterialPresetConfig {
  label: string;
  note: string;
  thickness: number;
  allowance: number;
  seamMode: ShapeDefinition['seamMode'];
}

export const HELP_ITEMS: HelpItem[] = [
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

export const TROUBLESHOOTING: string[] = [
  'If warnings appear, increase allowance or reduce extreme taper differences.',
  'If folds tear, increase thickness for stronger material settings.',
  'If shape is too complex, start with fewer segments and iterate upward.',
  'If export does not look right in another tool, try SVG first.'
];

export const TOUR_STEPS: TourStep[] = [
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

export const MATERIAL_PRESET_CONTENT: Record<MaterialPreset, MaterialPresetConfig> = {
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
