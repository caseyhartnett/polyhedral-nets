import {
  buildCanonicalGeometry,
  buildShapeDebugModel,
  type WireframeCamera
} from '@torrify/geometry-engine';
import type { Point2, ShapeDefinition, Units } from '@torrify/shared-types';
import { clampInt } from './form-state';

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
  units: Units;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  paths: PreviewPath[];
}

export interface SolidFace {
  points: Array<{ x: number; y: number }>;
  fill: string;
  stroke: string;
}

export interface SolidPreview {
  width: number;
  height: number;
  faces: SolidFace[];
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
  const base = clampInt(def.segments, 3, 256, 6);
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
    bottomSegments: clampInt(def.bottomSegments ?? base, 3, 256, base),
    topSegments: clampInt(def.topSegments ?? base, 1, 256, base)
  };
}

function emptyTemplate(): TemplatePreview {
  return {
    width: 460,
    height: 280,
    units: 'mm',
    bounds: {
      minX: 0,
      minY: 0,
      maxX: 460,
      maxY: 280
    },
    paths: []
  };
}

function buildTemplateBounds(paths: Array<{ points: Point2[] }>): TemplatePreview['bounds'] {
  const allPoints = paths.flatMap((path) => path.points);
  if (allPoints.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  const xs = allPoints.map((point) => point.x);
  const ys = allPoints.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys)
  };
}

function emptySolid(): SolidPreview {
  return {
    width: 460,
    height: 320,
    faces: []
  };
}

function normalizeVec(v: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const mag = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (mag <= 1e-9) return { x: 0, y: 0, z: 1 };
  return { x: v.x / mag, y: v.y / mag, z: v.z / mag };
}

function cross(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
): { x: number; y: number; z: number } {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function rotatePoint(
  p: { x: number; y: number; z: number },
  yaw = -0.7,
  pitch = 0.45
): { x: number; y: number; z: number } {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  const x1 = p.x * cy - p.y * sy;
  const y1 = p.x * sy + p.y * cy;
  const z1 = p.z;

  return {
    x: x1,
    y: y1 * cp - z1 * sp,
    z: y1 * sp + z1 * cp
  };
}

function shadeBlue(intensity: number): string {
  const base = { r: 37, g: 99, b: 235 };
  const clamped = Math.max(0.42, Math.min(1.05, intensity));
  const r = Math.round(base.r * clamped);
  const g = Math.round(base.g * clamped);
  const b = Math.round(base.b * clamped);
  return `rgb(${r}, ${g}, ${b})`;
}

export function buildTemplatePreview(def: PreviewShapeDefinition): TemplatePreview {
  try {
    const geometry = buildCanonicalGeometry(toShapeDefinition(def));
    return {
      width: geometry.template.width,
      height: geometry.template.height,
      units: geometry.template.units,
      bounds: buildTemplateBounds(geometry.template.paths),
      paths: geometry.template.paths.map((path) => ({
        layer: path.layer,
        d: toPath(path.points, path.closed)
      }))
    };
  } catch {
    return emptyTemplate();
  }
}

export function buildSolidPreview(def: PreviewShapeDefinition, camera: WireframeCamera = {}): SolidPreview {
  try {
    const shape = buildShapeDebugModel(toShapeDefinition(def));
    const yaw = camera.yaw ?? -0.7;
    const pitch = camera.pitch ?? 0.45;
    const width = 460;
    const height = 320;

    const rotated = shape.mesh.vertices.map((vertex) => rotatePoint(vertex, yaw, pitch));
    const projected = rotated.map((vertex) => ({
      x: vertex.x,
      y: -vertex.z,
      depth: vertex.y
    }));

    const xs = projected.map((point) => point.x);
    const ys = projected.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const scale = Math.min((width - 32) / spanX, (height - 32) / spanY);

    const light = normalizeVec({ x: -0.35, y: 0.72, z: 0.6 });
    const faces = shape.mesh.faces
      .map((face) => {
        const points = face.vertexIndices.map((index) => ({
          x: 16 + (projected[index].x - minX) * scale,
          y: 16 + (projected[index].y - minY) * scale
        }));

        const a = rotated[face.vertexIndices[0]];
        const b = rotated[face.vertexIndices[1]];
        const c = rotated[face.vertexIndices[2]];
        const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
        const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
        const normal = normalizeVec(cross(ab, ac));
        const intensity = 0.48 + Math.max(0, normal.x * light.x + normal.y * light.y + normal.z * light.z) * 0.55;
        const depth =
          face.vertexIndices.reduce((sum, index) => sum + projected[index].depth, 0) /
          face.vertexIndices.length;

        return {
          points,
          fill: shadeBlue(intensity),
          stroke: '#1d4ed8',
          depth
        };
      })
      .sort((a, b) => a.depth - b.depth)
      .map((face) => ({
        points: face.points,
        fill: face.fill,
        stroke: face.stroke
      }));

    return { width, height, faces };
  } catch {
    return emptySolid();
  }
}
