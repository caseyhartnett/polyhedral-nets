export interface Point {
  x: number;
  y: number;
}

export interface PointInt {
  x: number;
  y: number;
}

export type Path = Point[];
export type PathInt = PointInt[];
export type Polyline = Path;
export type PolylineInt = PathInt;

export interface PolygonWithHoles {
  id: string;
  outer: Path;
  holes: Path[];
}

export interface PolygonWithHolesInt {
  id: string;
  outer: PathInt;
  holes: PathInt[];
}

export interface RectInt {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type LineKind = "score" | "guide";

export interface LineFeature {
  id: string;
  kind: LineKind;
  path: Polyline;
}

export interface LineFeatureInt {
  id: string;
  kind: LineKind;
  path: PolylineInt;
}

export interface TemplateGeometry {
  cutPolygons: PolygonWithHoles[];
  scoreLines: LineFeature[];
  guideLines: LineFeature[];
}

export interface TemplateGeometryInt {
  cutPolygons: PolygonWithHolesInt[];
  scoreLines: LineFeatureInt[];
  guideLines: LineFeatureInt[];
}

export interface GridTile {
  id: string;
  rect: RectInt;
}

export interface SheetSpec {
  width: number;
  height: number;
  margins: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
}

export type Rotation = 0 | 90 | 180 | 270;

export interface ClippedLineSegmentInt extends LineFeatureInt {
  tileId: string;
  sourceLineId: string;
}

export interface Shard {
  id: string;
  sourcePolygonId: string;
  tileId: string;
  drawGeo: PolygonWithHolesInt;
  packGeo: PolygonWithHolesInt[];
  area: number;
  bbox: RectInt;
  width: number;
  height: number;
  centroid: PointInt;
  lines: ClippedLineSegmentInt[];
}

export interface Placement {
  shardId: string;
  sheetId: string;
  x: number;
  y: number;
  rotation: Rotation;
  bbox: RectInt;
}

export interface PlacedShard {
  shard: Shard;
  placement: Placement;
  drawGeoPlaced: PolygonWithHolesInt;
  packGeoPlaced: PolygonWithHolesInt[];
  linesPlaced: LineFeatureInt[];
}

export interface Sheet {
  id: string;
  rect: RectInt;
  placed: PlacedShard[];
}

export interface Config {
  SCALE: number;
  AREA_EPS: number;
  DIM_EPS: number;
  spacing: number;
  fillRule: "EvenOdd" | "NonZero";
  allowedRotations: readonly Rotation[];
  sheet: SheetSpec;
  forceKernelFailure?: boolean;
}

export interface PipelineDebug {
  tileShardCounts: Record<string, number>;
  droppedShardIds: string[];
  splitShardCount: number;
  keptShardCount: number;
}

export interface PipelineMetrics {
  baselineSheetCount: number;
  optimizedSheetCount: number;
  shardCount: number;
  droppedArtifacts: number;
  runtimeMs: number;
}

export type PipelineResult =
  | {
      mode: "optimized";
      sheets: Sheet[];
      metrics: PipelineMetrics;
      debug: PipelineDebug;
    }
  | {
      mode: "fallback";
      fallbackGridSheets: Sheet[];
      reason: string;
      metrics: PipelineMetrics;
      debug: PipelineDebug;
    };

export interface TemplateInputInt extends TemplateGeometryInt {
  fallbackGridSheets?: Sheet[];
}
