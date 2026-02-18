import type { CanonicalGeometry, ExportFormat } from '@torrify/shared-types';
import type { GeneratedSvgPage } from './export-contracts';
import { artifactFileName, artifactMimeType } from './export-contracts';

// Keep generated-download file assembly deterministic and reusable across UI actions.
export interface DownloadableOutputFile {
  fileName: string;
  mimeType: string;
  content: string;
}

export function countGeneratedDownloadFiles(
  artifacts: Partial<Record<ExportFormat, string>>,
  svgPages: GeneratedSvgPage[]
): number {
  // Split SVG mode can produce multiple downloadable SVG files.
  let count = 0;
  if (artifacts.svg) {
    count += svgPages.length > 0 ? svgPages.length : 1;
  }
  if (artifacts.pdf) count += 1;
  if (artifacts.stl) count += 1;
  return count;
}

export function collectGeneratedOutputFiles(options: {
  generatedGeometry: CanonicalGeometry | null;
  generatedArtifacts: Partial<Record<ExportFormat, string>>;
  generatedSvgPages: GeneratedSvgPage[];
  generatedAtDate: Date | null;
}): DownloadableOutputFile[] {
  const { generatedGeometry, generatedArtifacts, generatedSvgPages, generatedAtDate } = options;

  if (!generatedGeometry) {
    return [];
  }

  const when = generatedAtDate ?? new Date();
  const files: DownloadableOutputFile[] = [];

  if (generatedArtifacts.svg) {
    // Preserve stable ordering: all SVG pages first, then PDF, then STL.
    if (generatedSvgPages.length > 0) {
      for (const page of generatedSvgPages) {
        files.push({
          fileName: artifactFileName('svg', generatedGeometry.kind, when, page.fileNameSuffix),
          mimeType: artifactMimeType('svg'),
          content: page.content
        });
      }
    } else {
      files.push({
        fileName: artifactFileName('svg', generatedGeometry.kind, when),
        mimeType: artifactMimeType('svg'),
        content: generatedArtifacts.svg
      });
    }
  }

  if (generatedArtifacts.pdf) {
    files.push({
      fileName: artifactFileName('pdf', generatedGeometry.kind, when),
      mimeType: artifactMimeType('pdf'),
      content: generatedArtifacts.pdf
    });
  }

  if (generatedArtifacts.stl) {
    files.push({
      fileName: artifactFileName('stl', generatedGeometry.kind, when),
      mimeType: artifactMimeType('stl'),
      content: generatedArtifacts.stl
    });
  }

  return files;
}
