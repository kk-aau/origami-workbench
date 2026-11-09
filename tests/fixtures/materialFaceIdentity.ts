import type {Doc} from '../../src/core/types';
import {editMaterialFaces,type MaterialFaceInsertIntent} from '../../src/core/materialFaceEdit';
import {weakToolSheet,weakToolMaterial as mat,weakToolSource} from './materialWeakTools';
import {faceModelCase,faceModelSecond} from './materialFaceModel';
import {copyMaterialComponents} from '../../src/core/materialCopy';
import {copyModelRecipe} from './materialCopyModel';
export function faceIdentityRecipe(doc:Doc,face=0):MaterialFaceInsertIntent{const m=mat(doc),es=m.graph.faces_edges![face];return {kind:'material-face-insert',face,from:{edgeId:m.edgeSegmentIds[es[0]],fraction:.5},to:{edgeId:m.edgeSegmentIds[es[2]],fraction:.5},assignment:'F',fixedPart:0,cpOnly:false};}
export function faceIdentityCase(name:string){
 if(name==='chain'){const d=faceIdentityCase('move'),g=(d.metadata!.materialCurveModel as {groups:{id:string}[]}).groups[1];return editMaterialFaces(d,{kind:'material-face-insert',face:0,from:{edgeId:g.id+'::crease-0',fraction:.5},to:{edgeId:'material-edge-1',fraction:.5},assignment:'F',fixedPart:0,cpOnly:false,parametric:true}).doc;}
 const base=name==='hole'?weakToolSheet(true):name==='weak'?weakToolSource('boundary'):name==='shared'?faceModelCase('inserted'):weakToolSheet();
 if(name==='copy'){const copied=copyMaterialComponents(base,{...copyModelRecipe(base,150,2),parametric:true}).doc;return editMaterialFaces(copied,{...faceIdentityRecipe(copied,1),parametric:true}).doc;}
 const moved=editMaterialFaces(base,{kind:'material-transform',components:mat(base).components.map((_,i)=>i),operation:{kind:'move',a:20,b:10},parametric:true}).doc;
 const r=name==='shared'?{...faceModelSecond(base),from:{...faceModelSecond(base).from,fraction:.5},to:{...faceModelSecond(base).to,fraction:.5}}:faceIdentityRecipe(moved);
 if(name==='hole'||name==='weak'){const m=mat(moved),g=m.graph,left=g.edges_vertices.findIndex(([a,b],e)=>g.edges_assignment[e]==='B'&&g.vertices_coords[a][0]===20&&g.vertices_coords[b][0]===20),right=g.edges_vertices.findIndex(([a,b],e)=>g.edges_assignment[e]==='B'&&g.vertices_coords[a][0]===120&&g.vertices_coords[b][0]===120);r.from={edgeId:m.edgeSegmentIds[left],fraction:.7};r.to={edgeId:m.edgeSegmentIds[right],fraction:.3};}
 return editMaterialFaces(moved,{...r,parametric:true}).doc;
}
