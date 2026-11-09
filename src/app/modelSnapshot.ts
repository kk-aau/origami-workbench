import {importModelSnapshot} from '../core/modelSnapshot';
import {upgradeProject} from '../core/project';
import {splitEditableSegments} from './planarize';
import {buildFold} from '../core/geometry';
import {resolveStartingFace,setStartingFace} from './flatFoldSettings';
import {hasMaterialTopology} from '../core/materialTopology';

/** Prepare completely before publishing either the source document or result model. */
export function prepareModelSnapshot(text:string,{preserveStartingFace=false}:{preserveStartingFace?:boolean}={}){
  const loaded=importModelSnapshot(text);
  let doc=splitEditableSegments(upgradeProject(loaded.source));
  const graph=buildFold(doc).graph;
  for(const key of ['vertices_coords','edges_vertices','faces_vertices','edges_assignment','edges_foldAngle'] as const){
    if(JSON.stringify(graph[key])!==JSON.stringify(loaded.graph[key]))throw new Error('工程升级改变了快照的顶点或拓扑编号，未替换当前工程。');
  }
  if(hasMaterialTopology(doc))for(const key of ['faces_edges','edges_faces','faces_faces'] as const){
    if(JSON.stringify(graph[key])!==JSON.stringify(loaded.graph[key]))throw new Error('工程升级改变了材料切口的面边关联，未替换当前工程。');
  }
  const root=loaded.result.geometry.startingFace??0,current=resolveStartingFace(doc,graph);
  // A collection carries its own editor document. Its model sources must keep
  // their original settings, including legacy roots ignored by default folding.
  if(!preserveStartingFace&&(current.stale||current.face!==root))doc=setStartingFace(doc,root);
  return {doc,graph,result:loaded.result};
}
