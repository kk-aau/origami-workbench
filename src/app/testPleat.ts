import {apiWhenIdle} from './api';
import type {XY} from './tessellation';
export type TestPleatQuery={family:'test-pleat-native';points:[XY,XY];angleDeg:number};
type Line={primitive:'Line';points:[XY,XY];style:'Black'|'Red'|'Blue'};
export type TestPleatResult={schema:'origamica-test-pleat-v1';query:TestPleatQuery;source:{function:'TestPleat';definitionCell:'In[2682]';definitionLines:[199210,199288];alphaRad:number;direction:XY;dab:number;length:number;pa:XY;pb:XY;originalGraphicOrder:string[];publicOptions:[];wolframExecuted:false;paperCertification:false};data:{graphics:[{primitive:'Polygon';points:[XY,XY,XY,XY];style:{Opacity:.1}},Line,Line,Line]}};
export function readTestPleatQuery(raw:unknown):TestPleatQuery|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;const r=raw as Record<string,unknown>,points=r.points===undefined?[[0,0],[1,0]]:r.points,angleDeg=r.angleDeg===undefined?36:r.angleDeg;
 if(r.family!=='test-pleat-native'||Object.keys(r).some(k=>!['family','points','angleDeg'].includes(k))||!Array.isArray(points)||points.length!==2||points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1000))||typeof angleDeg!=='number'||!Number.isFinite(angleDeg)||Math.abs(angleDeg)>36000)return null;
 const p=points as [XY,XY];if(Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1])===0)return null;return{family:'test-pleat-native',points:structuredClone(p),angleDeg};
}
/** Independent scalar rotation/dot/magnitude, with the original primitive order. */
export function testPleatReference(query:TestPleatQuery):TestPleatResult{
 const q=readTestPleatQuery(query);if(!q)throw Error('原TestPleat输入无效。');const [a,b]=q.points,dx=a[0]-b[0],dy=a[1]-b[1],d=Math.hypot(dx,dy),alpha=q.angleDeg*Math.PI/180,c=Math.cos(alpha),s=Math.sin(alpha),direction:XY=[(c*dx+s*dy)/d,(-s*dx+c*dy)/d],dab=(dx*direction[0]+dy*direction[1])/2,length=1.8*d,pa:XY=[a[0]+(length-dab)*direction[0],a[1]+(length-dab)*direction[1]],pb:XY=[b[0]+(length+dab)*direction[0],b[1]+(length+dab)*direction[1]];
 return{schema:'origamica-test-pleat-v1',query:q,source:{function:'TestPleat',definitionCell:'In[2682]',definitionLines:[199210,199288],alphaRad:alpha,direction,dab,length,pa,pb,originalGraphicOrder:['Polygon[pa,pb,qb,qa]','Line[qa,qb]','Line[qa,pa]','Line[qb,pb]'],publicOptions:[],wolframExecuted:false,paperCertification:false},data:{graphics:[{primitive:'Polygon',points:[pa,pb,b,a],style:{Opacity:.1}},{primitive:'Line',points:[a,b],style:'Black'},{primitive:'Line',points:[a,pa],style:'Red'},{primitive:'Line',points:[b,pb],style:'Blue'}]}};
}
export function readTestPleatResult(raw:unknown,q:TestPleatQuery):TestPleatResult{
 const expected=testPleatReference(q),scale=Math.max(1,...expected.query.points.flat().map(Math.abs),expected.source.length),same=(a:unknown,b:any):boolean=>typeof b==='number'?typeof a==='number'&&Number.isFinite(a)&&Math.abs(a-b)<=3e-11*Math.max(scale,Math.abs(b)):Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>same(a[i],v)):b&&typeof b==='object'?!!a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).sort().join(',')===Object.keys(b).sort().join(',')&&Object.entries(b).every(([k,v])=>same((a as any)[k],v)):a===b;
 if(!same(raw,expected))throw Error('原TestPleat端点、四图元、样式或来源独立回读失败。');return raw as TestPleatResult;
}
export async function fetchTestPleat(q:TestPleatQuery,signal?:AbortSignal){return readTestPleatResult(await apiWhenIdle('tessellation/test-pleat',q,signal),q);}
