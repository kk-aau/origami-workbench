import {readTessParams,type TessParams} from './tessellation';

/** Original numeric pfn[i]/rfn[i] source with a structurally proved C1 angular seam. */
export function ringAngularIfPreset():Extract<TessParams,{family:'ring'}>{
 const next=readTessParams({family:'ring',ringMode:'origamica',sides:12,rings:2,growth:1.8,scale:.3,
  angle:35,offsetAngle:0,outerRadii:[1,1.8,2.6],creaseRadii:[1.35,2.15],
  vectorFunctionDefinitions:['Radial[t_,k_]:=If[Cos[t]>=0,1+(.04+.002 k) Cos[t]^2,1+(.02+.001 k) Cos[t]^2]'],
  outerVectorTemplate:['Radial[phi,i] Cos[phi]','Radial[phi,i] Sin[phi]'],
  creaseVectorTemplate:['Radial[phi,i] Cos[phi]','Radial[phi,i] Sin[phi]']});
 if(!next||next.family!=='ring')throw Error('C1角度条件环预设无效。');
 return next;
}
