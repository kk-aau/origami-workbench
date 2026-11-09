import {buildFold,buildDiagramFold,type BuildFoldResult} from '../core/geometry';
import type {Doc} from '../core/types';
import type {DiagramPose} from './diagramProject';

/** Legacy poses keep their exact source/result indexing until recomputed. */
export function buildDiagramPoseDocFold(doc:Doc,pose:Pick<DiagramPose,'result'>):BuildFoldResult {
  return pose.result.geometry.graph?.zhezhi_flatCreases==='marks'?buildDiagramFold(doc):buildFold(doc);
}
export function buildDiagramPoseFold(pose:Pick<DiagramPose,'sourceDoc'|'result'>):BuildFoldResult {
  return buildDiagramPoseDocFold(pose.sourceDoc,pose);
}
