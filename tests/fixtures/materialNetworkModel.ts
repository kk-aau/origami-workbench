import type {Doc} from '../../src/core/types';
import type {MaterialCurveIntent} from '../../src/core/materialCurves';
import type {MaterialFaceNetworkIntent} from '../../src/core/materialNetwork';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {weakToolSheet,weakToolSource} from './materialWeakTools';
export const networkModelRecipe=(a=25,b=75,scope:'face'|'component'|'all'='component'):MaterialFaceNetworkIntent=>({kind:'material-face-network',face:0,graph:{vertices:[[a,a],[b,a],[b,b],[a,b]],edges:[[0,1],[1,2],[2,3],[3,0]]},assignments:['F','F','F','F'],fixedPoint:[10,10],cpOnly:false,scope});
export const networkModelCurve=(r=8):MaterialCurveIntent=>({kind:'material-face-curves',face:0,curves:[{kind:'ellipse',center:[50,50],radii:[r,r],rotation:0,assignment:'F'}],deviation:1,fixedPoint:[10,10],cpOnly:false,scope:'component'});
export function networkModelCase(name:string):Doc{
 let doc=weakToolSheet();
 if(name==='eight'){for(let i=0;i<8;i++){const x=10+(i%4)*20,y=10+Math.floor(i/4)*40;doc=editMaterialFaces(doc,{...networkModelRecipe(),graph:{vertices:[[x,y],[x+3,y],[x+3,y+3],[x,y+3]],edges:[[0,1],[1,2],[2,3],[3,0]]},fixedPoint:[2,2],parametric:true}).doc;}return doc;}
 if(name==='cut'){doc=weakToolSource('interior');return editMaterialFaces(doc,{...networkModelRecipe(40,60),graph:{vertices:[[40,35],[60,35],[60,65],[40,65]],edges:[[0,1],[1,2],[2,3],[3,0]]},parametric:true}).doc;}
 if(name==='curve-network'){doc=editMaterialFaces(doc,networkModelCurve(15)).doc;return editMaterialFaces(doc,{...networkModelRecipe(),parametric:true}).doc;}
 doc=editMaterialFaces(doc,{...networkModelRecipe(),parametric:true}).doc;
 if(name==='single')return doc;
 if(name==='two')return editMaterialFaces(doc,{...networkModelRecipe(35,65),parametric:true}).doc;
 if(name==='network-curve')return editMaterialFaces(doc,networkModelCurve()).doc;
 if(name==='three'){doc=editMaterialFaces(doc,networkModelCurve()).doc;return editMaterialFaces(doc,{...networkModelRecipe(35,65),parametric:true}).doc;}
 throw Error('Unknown network model case '+name);
}
