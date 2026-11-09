import type {Doc} from '../../src/core/types';
import {traceModelCase} from './materialTraceModel';
import {editMaterialLineProperties,type MaterialLinePropertiesIntent} from '../../src/core/materialLineProperties';
import {weakToolMaterial as mat} from './materialWeakTools';
export function propertiesRecipe(doc:Doc,operation:MaterialLinePropertiesIntent['operation']={kind:'assignment',assignment:'M'}):MaterialLinePropertiesIntent{const m=mat(doc);return {kind:'material-line-properties',segmentIds:m.edgeSegmentIds.filter((_,e)=>m.graph.edges_assignment[e]!=='B'),operation,cpOnly:false};}
export function propertiesModelCase(name:string){const d=traceModelCase('single');if(name==='source')return d;const folded=editMaterialLineProperties(d,{...propertiesRecipe(d),parametric:true}).doc;if(name==='mountain')return folded;if(name==='angle')return editMaterialLineProperties(folded,{...propertiesRecipe(folded,{kind:'angle',magnitude:73}),parametric:true}).doc;throw Error(name);}
