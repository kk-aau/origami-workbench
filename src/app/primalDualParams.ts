export type PrimalDualOptions={parameterization?:'rho-beta'|'gamma-alpha';gamma?:number;pleatAngle?:number;twistDirection?:'cw'|'ccw';postRotation?:'none'|'primal'|'dual'};
export const TRANSFORM_KEYS=['angle','scale','parameterization','gamma','pleatAngle','twistDirection','postRotation'];
export function shrinkAndTwist(gamma:number,alpha:number,direction:'cw'|'ccw'='ccw'){
 const a=alpha*Math.PI/180,d=Math.hypot(gamma+Math.sin(a),Math.cos(a));
 return {scale:gamma/d,angle:Math.atan2(Math.cos(a),gamma+Math.sin(a))*180/Math.PI*(direction==='cw'?-1:1)};
}
export function gammaAndAlpha(scale:number,angle:number){
 const b=angle*Math.PI/180,d=Math.hypot(1-scale*Math.cos(b),scale*Math.sin(b));
 return {gamma:scale/d,pleatAngle:Math.atan2(Math.cos(b)-scale,Math.abs(Math.sin(b)))*180/Math.PI,twistDirection:angle<0?'cw' as const:'ccw' as const};
}
export function postRotation(p:{angle:number;scale:number}&PrimalDualOptions){
 const b=p.angle*Math.PI/180;
 return p.postRotation==='primal'?-b:p.postRotation==='dual'?-Math.atan2(-p.scale*Math.sin(b),1-p.scale*Math.cos(b)):0;
}
export function readPrimalDualOptions(raw:Record<string,unknown>):PrimalDualOptions|null{
 const out:PrimalDualOptions={};
 if(raw.postRotation!==undefined){if(!['none','primal','dual'].includes(String(raw.postRotation)))return null;out.postRotation=raw.postRotation as PrimalDualOptions['postRotation'];}
 if(raw.parameterization!==undefined){if(!['rho-beta','gamma-alpha'].includes(String(raw.parameterization)))return null;out.parameterization=raw.parameterization as PrimalDualOptions['parameterization'];}
 if(out.parameterization==='gamma-alpha'){
  const gamma=raw.gamma??1,alpha=raw.pleatAngle??30,direction=raw.twistDirection??'ccw';
  if(typeof gamma!=='number'||!Number.isFinite(gamma)||gamma<.01||gamma>100||typeof alpha!=='number'||!Number.isFinite(alpha)||alpha<.1||alpha>89.9||!['cw','ccw'].includes(String(direction)))return null;
  Object.assign(out,{gamma,pleatAngle:alpha,twistDirection:direction});
 }else if(['gamma','pleatAngle','twistDirection'].some(k=>raw[k]!==undefined))return null;
 return out;
}
