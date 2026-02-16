import { z } from "zod";

export const UnitsSchema = z.enum(["mm", "in"]);
export type Units = z.infer<typeof UnitsSchema>;

export const SeamModeSchema = z.enum(["straight", "overlap", "tabbed"]);
export type SeamMode = z.infer<typeof SeamModeSchema>;

export const PolyhedronPresetSchema = z.enum([
  "tetrahedron",
  "cube",
  "octahedron",
  "icosahedron",
  "dodecahedron",
  "cuboctahedron",
  "truncatedOctahedron",
  "regularPrism",
  "regularAntiprism",
  "regularBipyramid"
]);
export type PolyhedronPreset = z.infer<typeof PolyhedronPresetSchema>;

export const PolyhedronFaceModeSchema = z.enum(["uniform", "mixed"]);
export type PolyhedronFaceMode = z.infer<typeof PolyhedronFaceModeSchema>;

export const PolyhedronDefinitionSchema = z
  .object({
    preset: PolyhedronPresetSchema,
    edgeLength: z.number().positive().max(10000),
    faceMode: PolyhedronFaceModeSchema.default("uniform"),
    ringSides: z.number().int().min(3).max(64).optional()
  })
  .strict();
export type PolyhedronDefinition = z.infer<typeof PolyhedronDefinitionSchema>;

export const NotchSchema = z
  .object({
    position: z.number().min(0).max(1),
    width: z.number().positive().max(1000),
    depth: z.number().positive().max(1000)
  })
  .strict();

export const ProfilePointSchema = z
  .object({
    heightRatio: z.number().min(0).max(1),
    radius: z.number().positive().max(10000)
  })
  .strict();

export const ShapeDefinitionSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    height: z.number().positive().max(10000),
    bottomWidth: z.number().positive().max(10000),
    topWidth: z.number().positive().max(10000),
    thickness: z.number().positive().max(1000),
    units: UnitsSchema.default("mm"),
    seamMode: SeamModeSchema.default("straight"),
    allowance: z.number().min(0).max(1000).default(0),
    notches: z.array(NotchSchema).default([]),
    profilePoints: z.array(ProfilePointSchema).default([]),
    generationMode: z.enum(["legacy", "polyhedron"]).default("legacy"),
    includeTopCap: z.boolean().default(true),
    polyhedron: PolyhedronDefinitionSchema.optional(),
    // Base edge count; must be >= 3 for supported solids.
    segments: z.number().int().min(3).max(256).default(6),
    // Optional split controls:
    // - bottom must always be >= 3
    // - top can be 1 (pyramid) or must match bottom
    bottomSegments: z.number().int().min(3).max(256).optional(),
    topSegments: z.number().int().min(1).max(256).optional()
  })
  .strict()
  .transform((shape) => ({
    ...shape,
    includeTopCap: shape.includeTopCap ?? true,
    bottomSegments: shape.bottomSegments ?? shape.segments,
    topSegments: shape.topSegments ?? shape.segments
  }))
  .superRefine((shape, ctx) => {
    if (shape.generationMode === "polyhedron") {
      if (!shape.polyhedron) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["polyhedron"],
          message: "Polyhedron generation mode requires a polyhedron preset definition"
        });
        return;
      }

      const mixedPresets = new Set(["cuboctahedron", "truncatedOctahedron"]);
      const familyPresets = new Set(["regularPrism", "regularAntiprism", "regularBipyramid"]);

      const ringSides = shape.polyhedron.ringSides ?? 0;
      if (familyPresets.has(shape.polyhedron.preset)) {
        if (!Number.isInteger(ringSides) || ringSides < 3 || ringSides > 64) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["polyhedron", "ringSides"],
            message: `Preset ${shape.polyhedron.preset} requires ringSides (3-64)`
          });
        }

        if (shape.polyhedron.preset === "regularBipyramid" && ringSides > 5) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["polyhedron", "ringSides"],
            message: "regularBipyramid supports ringSides 3-5 for equal-edge geometry"
          });
        }
      } else {
        const expectedFaceMode = mixedPresets.has(shape.polyhedron.preset) ? "mixed" : "uniform";
        if (shape.polyhedron.faceMode !== expectedFaceMode) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["polyhedron", "faceMode"],
            message: `Preset ${shape.polyhedron.preset} must use faceMode "${expectedFaceMode}"`
          });
        }
      }
      return;
    }

    const bottom = shape.bottomSegments;
    const top = shape.topSegments;
    const isPyramid = top === 1;
    const isMatching = top === bottom;

    if (!isPyramid && !isMatching) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["topSegments"],
        message:
          "Unsupported shape: top edge count must be 1 (pyramid) or equal bottom edge count (prism/frustum)"
      });
    }
  });

export type ShapeDefinition = z.infer<typeof ShapeDefinitionSchema>;

export const ExportFormatSchema = z.enum(["svg", "pdf", "stl"]);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;

export const SvgLayerSchema = z.enum(["cut", "score", "guide"]);
export type SvgLayer = z.infer<typeof SvgLayerSchema>;

export const Point2Schema = z
  .object({
    x: z.number(),
    y: z.number()
  })
  .strict();

export type Point2 = z.infer<typeof Point2Schema>;

export const LayerPathSchema = z
  .object({
    layer: SvgLayerSchema,
    closed: z.boolean(),
    points: z.array(Point2Schema).min(2)
  })
  .strict();

export type LayerPath = z.infer<typeof LayerPathSchema>;

export const FlattenedTemplateSchema = z
  .object({
    units: UnitsSchema,
    width: z.number().positive(),
    height: z.number().positive(),
    paths: z.array(LayerPathSchema)
  })
  .strict();

export type FlattenedTemplate = z.infer<typeof FlattenedTemplateSchema>;

export const CanonicalGeometrySchema = z
  .object({
    kind: z.enum(["prism", "frustum", "pyramid", "polyhedron"]),
    metrics: z
      .object({
        bottomRadius: z.number().positive(),
        topRadius: z.number().min(0),
        slantHeight: z.number().positive(),
        surfaceArea: z.number().positive(),
        faceCount: z.number().int().positive()
      })
      .strict(),
    template: FlattenedTemplateSchema,
    warnings: z.array(z.string())
  })
  .strict();

export type CanonicalGeometry = z.infer<typeof CanonicalGeometrySchema>;
