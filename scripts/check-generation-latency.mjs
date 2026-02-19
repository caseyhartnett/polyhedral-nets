import { performance } from 'node:perf_hooks';
import { ShapeDefinitionSchema } from '../packages/shared-types/dist/index.js';
import { buildCanonicalGeometry } from '../services/geometry-engine/dist/index.js';

// CI-friendly geometry performance smoke test.
// Goal: catch order-of-magnitude regressions, not micro-benchmark noise.
const cases = [
  {
    name: 'legacy-high-segments',
    thresholdMs: Number(process.env.PERF_LEGACY_MS ?? 1000),
    shape: {
      schemaVersion: '1.0',
      height: 180,
      bottomWidth: 120,
      topWidth: 90,
      thickness: 4,
      units: 'mm',
      seamMode: 'tabbed',
      allowance: 8,
      notches: [],
      profilePoints: [],
      generationMode: 'legacy',
      includeTopCap: true,
      segments: 64,
      bottomSegments: 64,
      topSegments: 64
    }
  },
  {
    name: 'polyhedron-icosahedron',
    thresholdMs: Number(process.env.PERF_ICOSA_MS ?? 1200),
    shape: {
      schemaVersion: '1.0',
      height: 100,
      bottomWidth: 100,
      topWidth: 100,
      thickness: 3,
      units: 'mm',
      seamMode: 'straight',
      allowance: 0,
      notches: [],
      profilePoints: [],
      generationMode: 'polyhedron',
      includeTopCap: true,
      segments: 6,
      polyhedron: {
        preset: 'icosahedron',
        edgeLength: 40,
        faceMode: 'uniform'
      }
    }
  },
  {
    name: 'polyhedron-johnson',
    thresholdMs: Number(process.env.PERF_JOHNSON_MS ?? 2500),
    shape: {
      schemaVersion: '1.0',
      height: 100,
      bottomWidth: 100,
      topWidth: 100,
      thickness: 3,
      units: 'mm',
      seamMode: 'straight',
      allowance: 0,
      notches: [],
      profilePoints: [],
      generationMode: 'polyhedron',
      includeTopCap: true,
      segments: 6,
      polyhedron: {
        preset: 'johnson',
        johnsonId: 'j90',
        edgeLength: 32,
        faceMode: 'mixed'
      }
    }
  }
];

let failed = false;
for (const entry of cases) {
  const shape = ShapeDefinitionSchema.parse(entry.shape);
  const samples = [];
  // Run multiple samples and enforce worst-case to absorb warm-up variance.
  for (let i = 0; i < 3; i += 1) {
    const start = performance.now();
    buildCanonicalGeometry(shape);
    const durationMs = performance.now() - start;
    samples.push(durationMs);
  }

  const worst = Math.max(...samples);
  const avg = samples.reduce((sum, ms) => sum + ms, 0) / samples.length;
  console.log(
    `${entry.name}: avg=${avg.toFixed(1)}ms worst=${worst.toFixed(1)}ms threshold=${entry.thresholdMs}ms`
  );

  if (worst > entry.thresholdMs) {
    failed = true;
  }
}

if (failed) {
  console.error('Generation latency check failed: one or more scenarios exceeded thresholds.');
  process.exit(1);
}

console.log('Generation latency check passed.');
