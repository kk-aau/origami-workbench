import { diagnose } from '../core/diagnostics';
import { validateDoc, type DiagnosticResult, type Doc } from '../core/types';

/**
 * cAMV-style local flat-fold check. It deliberately reports only vertex-level
 * Maekawa/Kawasaki/degree findings. Ordinary overlap, dangling-line and
 * paper-boundary notices remain in the full crease diagnostic so a local test
 * can be used while a construction is still being drawn.
 */
export function checkCamv(doc: Doc): DiagnosticResult {
  validateDoc(doc);
  const full = diagnose(doc);
  const local = new Set(['odd-degree', 'kawasaki', 'maekawa', 'unassigned', 'invalid-document']);
  const issues = full.issues.filter(issue => local.has(issue.code));
  return {
    issues,
    summary: {
      errors: issues.filter(issue => issue.severity === 'error').length,
      warnings: issues.filter(issue => issue.severity === 'warning').length,
      checkedVertices: full.summary.checkedVertices,
      skippedVertices: full.summary.skippedVertices,
    },
  };
}
