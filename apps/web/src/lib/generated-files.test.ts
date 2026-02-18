import assert from 'node:assert/strict';
import test from 'node:test';
import type { CanonicalGeometry, ExportFormat } from '@torrify/shared-types';
import { collectGeneratedOutputFiles, countGeneratedDownloadFiles } from './generated-files';
import type { GeneratedSvgPage } from './export-contracts';

const geometry: CanonicalGeometry = {
  kind: 'prism',
  metrics: {
    bottomRadius: 1,
    topRadius: 1,
    slantHeight: 1,
    surfaceArea: 1,
    faceCount: 6
  },
  template: {
    units: 'mm',
    width: 10,
    height: 10,
    paths: []
  },
  warnings: []
};

test('countGeneratedDownloadFiles handles split svg pages', () => {
  const artifacts: Partial<Record<ExportFormat, string>> = {
    svg: '<svg/>',
    pdf: '%PDF-1.4'
  };
  const pages: GeneratedSvgPage[] = [
    { kind: 'sheet', index: 1, row: 1, column: 1, fileNameSuffix: 'sheet-r1-c1', label: 'Sheet 1', content: '<svg/>' },
    { kind: 'sheet', index: 2, row: 1, column: 2, fileNameSuffix: 'sheet-r1-c2', label: 'Sheet 2', content: '<svg/>' }
  ];

  assert.equal(countGeneratedDownloadFiles(artifacts, pages), 3);
});

test('collectGeneratedOutputFiles returns deterministic file list', () => {
  const at = new Date('2026-02-18T02:03:04.000Z');
  const files = collectGeneratedOutputFiles({
    generatedGeometry: geometry,
    generatedArtifacts: {
      svg: '<svg/>',
      stl: 'solid data'
    },
    generatedSvgPages: [],
    generatedAtDate: at
  });

  assert.equal(files.length, 2);
  assert.equal(files[0].fileName, 'polygonewild-prism-2026-02-18T02-03-04.svg');
  assert.equal(files[1].fileName, 'polygonewild-prism-2026-02-18T02-03-04.stl');
});
