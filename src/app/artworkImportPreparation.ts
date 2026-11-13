import type {ArtworkProject} from './artworkProject';
import {prepareArtworkProject,prepareParsedArtworkProject} from './artworkProject';
import type {DiagramProject} from './diagramProject';
import {exportDiagramProject,importDiagramProject} from './diagramProject';
import {normalizeDiagramProjectCP} from './diagramCP';
import {prepareExistingCreases} from './diagramProjectPreparation';
import {curveDesignFromDocument} from './curveDesignProject';
import {registerDiagramProjectSaveBlob} from './diagramProjectTransport';

export interface ArtworkImportPreparation {editorSignature:string}
export interface PreparedArtworkImport {project:ArtworkProject;preparation:ArtworkImportPreparation}
const preparedProjects=new WeakMap<ArtworkProject,ArtworkImportPreparation>();
const preparedDiagrams=new WeakSet<DiagramProject>();

/** Trusted only after the owned import Worker completed its entire transfer.
 * No persisted property or JSON flag can enable the UI's prepared fast path. */
export function registerPreparedArtworkImport(value:PreparedArtworkImport,diagramSaveBlob?:Blob):ArtworkProject {
  if(!value||typeof value!=='object'||!value.project||typeof value.project!=='object'
    ||typeof value.preparation?.editorSignature!=='string'||!value.project.editor
    ||!Array.isArray(value.project.editor.segments)||!Array.isArray(value.project.models?.entries))throw new Error('完整作品准备结果不完整，当前作品未替换。');
  if(diagramSaveBlob){
    if(!value.project.diagram)throw new Error('完整作品的绘图保存数据无对应工程，当前作品未替换。');
    registerDiagramProjectSaveBlob(value.project.diagram,diagramSaveBlob);
  }
  preparedProjects.set(value.project,value.preparation);
  if(value.project.diagram)preparedDiagrams.add(value.project.diagram);
  return value.project;
}
export function getArtworkImportPreparation(project:ArtworkProject):ArtworkImportPreparation|undefined{return preparedProjects.get(project);}
export function isPreparedArtworkDiagram(project:DiagramProject):boolean{return preparedDiagrams.has(project);}

/** Run in the import Worker. Keep the same validators and normalization that
 * restoreArtworkDiagram previously ran synchronously on the UI thread. */
export function prepareArtworkImport(value:string|unknown,onStage?:(message:string)=>void):PreparedArtworkImport {
  onStage?.('正在检查完整作品');
  const project=typeof value==='string'?prepareArtworkProject(value):prepareParsedArtworkProject(value);
  curveDesignFromDocument(project.editor);
  if(project.diagram){
    onStage?.('正在后台准备折序与完整交点');
    project.diagram=prepareExistingCreases(normalizeDiagramProjectCP(importDiagramProject(exportDiagramProject(project.diagram))).project);
  }
  onStage?.('正在准备作品显示数据');
  return {project,preparation:{editorSignature:JSON.stringify(project.editor)}};
}
