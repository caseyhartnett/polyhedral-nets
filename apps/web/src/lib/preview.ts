import {
  buildCanonicalGeometry,
  buildWireframePreview as buildEngineWireframePreview,
  type WireframeCamera
} from '@torrify/geometry-engine';
import type { ShapeDefinition } from '@torrify/shared-types';

export interface PreviewShapeDefinition {
  schemaVersion?: '1.0';
  height: number;
  bottomWidth: number;
  topWidth: number;
  thickness?: number;
  units?: 'mm' | 'in';
  allowance: number;
  seamMode: 'straight' | 'overlap' | 'tabbed';
  segments: number;
  bottomSegments?: number;
  topSegments?: number;
  generationMode?: 'legacy' | 'polyhedron';
  polyhedron?: {
    preset:
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
    edgeLength: number;
    faceMode: 'uniform' | 'mixed';
    ringSides?: number;
  };
  notches?: unknown[];
  profilePoints?: unknown[];
}

export interface PreviewPath {
  d: string;
  layer: 'cut' | 'score' | 'guide';
}

export interface TemplatePreview {
  width: number;
  height: number;
  paths: PreviewPath[];
}

export interface WireLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface WireframePreview {
  width: number;
  height: number;
  lines: WireLine[];
}

function toPath(points: Array<{ x: number; y: number }>, closed = false): string {
  if (points.length === 0) return '';
  const start = points[0];
  let d = `M ${start.x.toFixed(3)} ${start.y.toFixed(3)}`;
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    d += ` L ${p.x.toFixed(3)} ${p.y.toFixed(3)}`;
  }
  if (closed) d += ' Z';
  return d;
}

function toShapeDefinition(def: PreviewShapeDefinition): ShapeDefinition {
  const base = Math.max(1, Math.floor(def.segments || 1));
  return {
    schemaVersion: def.schemaVersion ?? '1.0',
    height: def.height,
    bottomWidth: def.bottomWidth,
    topWidth: def.topWidth,
    thickness: def.thickness ?? 1,
    units: def.units ?? 'mm',
    seamMode: def.seamMode,
    allowance: def.allowance,
    notches: (def.notches ?? []) as ShapeDefinition['notches'],
    profilePoints: (def.profilePoints ?? []) as ShapeDefinition['profilePoints'],
    generationMode: def.generationMode ?? 'legacy',
    polyhedron: def.polyhedron,
    segments: base,
    bottomSegments: Math.max(1, Math.floor(def.bottomSegments ?? base)),
    topSegments: Math.max(1, Math.floor(def.topSegments ?? base))
  };
}

function emptyTemplate(): TemplatePreview {
  return {
    width: 460,
    height: 280,
    paths: []
  };
}

function emptyWireframe(): WireframePreview {
  return {
    width: 460,
    height: 320,
    lines: []
  };
}

export function buildTemplatePreview(def: PreviewShapeDefinition): TemplatePreview {
  try {
    const geometry = buildCanonicalGeometry(toShapeDefinition(def));
    return {
      width: geometry.template.width,
      height: geometry.template.height,
      paths: geometry.template.paths.map((path) => ({
        layer: path.layer,
        d: toPath(path.points, path.closed)
      }))
    };
  } catch {
    return emptyTemplate();
  }
}

export function buildWireframePreview(def: PreviewShapeDefinition, camera: WireframeCamera = {}): WireframePreview {
  try {
    return buildEngineWireframePreview(toShapeDefinition(def), camera);
  } catch {
    return emptyWireframe();
  }
}
