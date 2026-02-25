#!/usr/bin/env node

import fs from "node:fs/promises";

const API_URL = "https://zenodo.org/api/records/10729583";
const OUT_FILE = new URL("../services/geometry-engine/src/johnson-data.ts", import.meta.url);

function formatNum(value) {
  if (Object.is(value, -0)) return "0";
  if (!Number.isFinite(value)) throw new Error(`Non-finite number: ${value}`);
  return Number(value.toFixed(15)).toString();
}

function toFileContent(entries) {
  const lines = [];
  lines.push('import type { JohnsonSolidId } from "@polyhedral-nets/shared-types";');
  lines.push("");
  lines.push("export interface JohnsonMeshData {");
  lines.push("  vertices: Array<{ x: number; y: number; z: number }>;");
  lines.push("  faces: number[][];");
  lines.push("}");
  lines.push("");
  lines.push("export const JOHNSON_MESH_DATA: Record<JohnsonSolidId, JohnsonMeshData> = {");

  for (const entry of entries) {
    lines.push(`  ${entry.id}: {`);
    lines.push("    vertices: [");
    for (const v of entry.vertices) {
      lines.push(`      { x: ${formatNum(v.x)}, y: ${formatNum(v.y)}, z: ${formatNum(v.z)} },`);
    }
    lines.push("    ],");
    lines.push("    faces: [");
    for (const face of entry.faces) {
      lines.push(`      [${face.join(", ")}],`);
    }
    lines.push("    ]");
    lines.push("  },");
  }

  lines.push("};");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status}) for ${url}`);
  }
  return response.json();
}

async function main() {
  const record = await fetchJson(API_URL);
  const files = (record.files ?? [])
    .filter((f) => /^j([1-9]|[1-8][0-9]|9[0-2])$/.test(f.key))
    .sort((a, b) => Number(a.key.slice(1)) - Number(b.key.slice(1)));

  if (files.length !== 92) {
    throw new Error(`Expected 92 Johnson files, found ${files.length}`);
  }

  const entries = [];
  for (const file of files) {
    const solid = await fetchJson(file.links.self);
    const floatData = solid?.data?.float;
    const verticesRaw = Array.isArray(floatData?.VERTICES) ? floatData.VERTICES : [];
    const facesRaw = Array.isArray(floatData?.VERTICES_IN_FACETS) ? floatData.VERTICES_IN_FACETS : [];

    const vertices = verticesRaw.map((row) => {
      if (!Array.isArray(row) || row.length < 4) {
        throw new Error(`Invalid VERTICES row in ${file.key}`);
      }
      return { x: Number(row[1]), y: Number(row[2]), z: Number(row[3]) };
    });

    const faces = facesRaw
      .filter((row) => Array.isArray(row))
      .map((row) => row.map((idx) => Number(idx)));

    if (vertices.length < 4 || faces.length < 4) {
      throw new Error(`Invalid mesh data in ${file.key}`);
    }

    entries.push({ id: file.key, vertices, faces });
  }

  const content = toFileContent(entries);
  await fs.writeFile(OUT_FILE, content, "utf8");
  console.log(`Wrote ${entries.length} solids to ${OUT_FILE.pathname}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
