import type { MaterialSizePreset } from './export-contracts';
import type { PolyhedronPreset, ShapeDefinition } from '@torrify/shared-types';

// Heuristic pre-flight guard to avoid accidental "click and wait forever" flows.
// This does not replace measured perf checks in CI.
export interface GenerationComplexityGuard {
  score: number;
  message: string;
}

export function assessGenerationComplexity(
  shape: ShapeDefinition,
  materialSizePreset: MaterialSizePreset,
  optimizePacking: boolean
): GenerationComplexityGuard | null {
  const baseScore =
    shape.generationMode === 'polyhedron'
      ? estimatePolyhedronScore(shape.polyhedron?.preset ?? 'cube', shape.polyhedron?.ringSides ?? 0)
      : estimateLegacyScore(shape);

  const splitPenalty = materialSizePreset === 'none' ? 1 : 1.35;
  const packingPenalty = optimizePacking ? 1.35 : 1;
  const score = baseScore * splitPenalty * packingPenalty;

  // Threshold tuned to trigger only on clearly expensive cases.
  if (score < 220) {
    return null;
  }

  return {
    score,
    message:
      'This configuration is computationally heavy and may take longer to generate. Click Generate Files again to confirm.'
  };
}

function estimateLegacyScore(shape: ShapeDefinition): number {
  // Segment count drives face/path count in legacy mode.
  const bottom = shape.bottomSegments ?? shape.segments;
  const top = shape.topSegments ?? shape.segments;
  const segmentWeight = Math.max(bottom, top);
  const seamPenalty = shape.seamMode === 'tabbed' ? 1.25 : shape.seamMode === 'overlap' ? 1.1 : 1;
  return segmentWeight * seamPenalty * 10;
}

function estimatePolyhedronScore(preset: PolyhedronPreset, ringSides: number): number {
  // Static weights reflect known relative complexity of current unfold/export logic.
  switch (preset) {
    case 'tetrahedron':
      return 40;
    case 'cube':
      return 60;
    case 'octahedron':
      return 80;
    case 'dodecahedron':
      return 120;
    case 'icosahedron':
      return 200;
    case 'cuboctahedron':
      return 140;
    case 'truncatedOctahedron':
      return 160;
    case 'regularPrism':
      return (ringSides + 2) * 18;
    case 'regularAntiprism':
      return (ringSides * 2 + 2) * 16;
    case 'regularBipyramid':
      return ringSides * 28;
    case 'johnson':
      return 260;
    default:
      return 80;
  }
}
