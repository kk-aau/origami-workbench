import type {Doc,Point} from '../../src/core/types';
import type {MaterialFaceNetworkIntent} from '../../src/core/materialFaceEdit';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {copyMaterialComponents} from '../../src/core/materialCopy';
import {materialDoc,materialSlitFixture} from './materialModel';
import {weakToolSource as source,weakToolSheet as sheet,weakToolLine as line,weakToolMaterial as mat} from './materialWeakTools';
export const weakNetworkBox=(x0:number,x1:number,y0=x0,y1=x1):MaterialFaceNetworkIntent=>({kind:'material-face-network',face:0,graph:{vertices:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],edges:[[0,1],[1,2],[2,3],[3,0]]},assignments:['F','F','F','F'],fixedPoint:[5,5],cpOnly:false});
export function weakNetworkCase(name:string):{doc:Doc;intent:MaterialFaceNetworkIntent}{
 if(name==='joined-loops'){const a=weakNetworkBox(20,35),b=weakNetworkBox(65,80);return {doc:sheet(),intent:{...a,scope:'face',graph:{vertices:[...a.graph.vertices,...b.graph.vertices],edges:[...a.graph.edges,...b.graph.edges.map(([x,y])=>[x+4,y+4] as [number,number]),[2,4]]},assignments:Array(9).fill('F')}};}
 if(name.startsWith('strict-')){const kind=name.slice(7),doc=source(kind),intent=kind==='interior'||kind==='cross'?weakNetworkBox(15,85):weakNetworkBox(10,30);return {doc,intent};}
 if(name==='clip-interior')return {doc:source('interior'),intent:{...weakNetworkBox(40,60,35,65),scope:'face'}};
 if(name==='clip-boundary')return {doc:source('boundary'),intent:{...weakNetworkBox(20,70,30,70),scope:'face'}};
 if(name==='clip-cross')return {doc:source('cross'),intent:{...weakNetworkBox(35,65),scope:'face'}};
 if(name==='clip-hole')return {doc:source('hole'),intent:{...weakNetworkBox(30,70,45,55),scope:'face'}};
 if(name==='preserve-FF'){const d=editMaterialFaces(sheet(),line([25,50],[75,50],'F',false)).doc,g=mat(d).graph,doc=materialDoc(g,g.vertices_coords.map(([x,y])=>[200-y,300+x]));return {doc,intent:{...weakNetworkBox(40,60,35,65),scope:'face'}};}
 if(name==='independent-all'||name==='independent-face'){const d=editMaterialFaces(sheet(),line([25,50],[75,50],'F',false)).doc,c=copyMaterialComponents(d,{kind:'material-copy',segmentIds:d.segments.map(s=>s.id),placements:[{dx:0,dy:0,rotation:0,scale:1,mirror:'none'}]}).doc,g=mat(c).graph,n=mat(d).graph.vertices_coords.length,ff:Point[]=g.vertices_coords.map(([x,y],v)=>v<n?[200-y,300+x]:[-200-y,-300+x]),doc=materialDoc(g,ff);return {doc,intent:{...weakNetworkBox(40,60,35,65),scope:name==='independent-all'?'all':'face'}};}
 if(name==='component-grid'){const d=materialSlitFixture().source,doc=copyMaterialComponents(d,{kind:'material-copy',segmentIds:d.segments.map(s=>s.id),placements:[{dx:400,dy:0,rotation:0,scale:1,mirror:'none'}]}).doc;return {doc,intent:{...weakNetworkBox(50,250),scope:'component',fixedPoint:[10,10]}};}
 if(name==='mixed-CP'){const c=weakNetworkCase('clip-interior');return {...c,intent:{...c.intent,cpOnly:true,assignments:['M','V','F','U']}};}
 throw Error('Unknown weak network case '+name);
}
