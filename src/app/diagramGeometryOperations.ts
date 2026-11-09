import type {Doc} from '../core/types';
import {normalizeDiagramCP} from './diagramCP';
import {hasDiagramActiveFoldChanges,chooseDiagramPrecreaseAnchor} from './diagramPrecreaseAdvance';
import {diagramStepLayerPreferences,inheritDiagramFixedAnchor} from './diagramStepInheritance';
import {alignDiagramFoldResult,projectDiagramFoldCP} from './diagramFoldLink';
import {prepareDiagramFoldDrawing,prepareDiagramFoldCPAdoption} from './diagramFoldTransactions';
import type {DiagramProject,DiagramStep,DiagramCPState} from './diagramProject';
function singleStep(step:DiagramStep,before:DiagramCPState,after:DiagramCPState):DiagramProject {
  return {format:'zhezhi-diagram',version:1,name:'',steps:[step],states:[before,after],activeStepId:step.id};
}
export const diagramGeometryOperations={
  normalize:normalizeDiagramCP,activeFold:hasDiagramActiveFoldChanges,
  prepare:(before:Doc,after:Doc)=>({cleaned:normalizeDiagramCP(after),activeFold:hasDiagramActiveFoldChanges(before,after)}),
  anchor:chooseDiagramPrecreaseAnchor,preferences:diagramStepLayerPreferences,
  fixed:inheritDiagramFixedAnchor,align:alignDiagramFoldResult,project:projectDiagramFoldCP,
  refresh:(step:DiagramStep,before:DiagramCPState,after:DiagramCPState,preserve:boolean)=>prepareDiagramFoldDrawing(singleStep(step,before,after),step.id,undefined,preserve),
  adoptCP:(step:DiagramStep,before:DiagramCPState,after:DiagramCPState)=>prepareDiagramFoldCPAdoption(singleStep(step,before,after),step.id,after.doc),
};
export type DiagramGeometryKind=keyof typeof diagramGeometryOperations;
export type DiagramGeometryArgs<K extends DiagramGeometryKind>=Parameters<typeof diagramGeometryOperations[K]>;
export type DiagramGeometryResult<K extends DiagramGeometryKind>=ReturnType<typeof diagramGeometryOperations[K]>;
