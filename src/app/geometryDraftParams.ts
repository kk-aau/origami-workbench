import {changeTessParams,type TessParams,type XY} from './tessellation';
export type GeometryPaperMode='inscribed'|'boundary';
/** Manual target solving uses the mother graph; extension cannot replace its correspondence. */
export function dualTargetsParams(params:TessParams,targets:XY[],mode:GeometryPaperMode='inscribed'):TessParams{
 const paper=params.paper&&mode==='inscribed'?{...params.paper,fit:'inscribed' as const,margin:Math.min(.45,params.paper.margin)}:undefined;
 const next=changeTessParams(params,{dualTargets:structuredClone(targets),paper});
 // Absence must survive the editor's draft/commit cycle just as it does JSON
 // transport. Finite constructions reject a supplied paper-adaptation field.
 if(paper===undefined)delete next.paper;
 return next;
}
