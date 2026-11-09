import {readWovenParams,type WovenLine,type WovenParams} from './wovenParams';
import type {XY} from './tessellation';
export type EditableWovenLines=Extract<WovenParams,{mode:'lines'|'chord'}>;
const clone=<T>(x:T):T=>structuredClone(x),cross=(a:XY,b:XY)=>a[0]*b[1]-a[1]*b[0],dot=(a:XY,b:XY)=>a[0]*b[0]+a[1]*b[1];
/** The backend line frame is tangent T=(cos θ,sin θ), left normal N=JT. */
export function wovenLineFrame(line:WovenLine,copyAngle=0){const theta=(line[0]+copyAngle)*Math.PI/180,tangent:XY=[Math.cos(theta),Math.sin(theta)],normal:XY=[-tangent[1],tangent[0]],base:XY=[line[1]*normal[0],line[1]*normal[1]];return {tangent,normal,base};}
export function translateWovenLine(line:WovenLine,delta:XY,copyAngle=0):WovenLine{const {normal}=wovenLineFrame(line,copyAngle);return [line[0],line[1]+dot(delta,normal),line[2]];}
/** Rotation keeps the raw input branch; an out-of-interface angle is reported, never modulo-clamped. */
export function rotateWovenLine(line:WovenLine,from:XY,to:XY):WovenLine{if(Math.hypot(...from)===0||Math.hypot(...to)===0)return clone(line);const delta=Math.atan2(cross(from,to),dot(from,to))*180/Math.PI;return [line[0]+delta,line[1],line[2]];}
function clearGeometryReferences(next:WovenParams){delete next.periodicity;delete next.periodicityEnabled;delete next.segmentInsets;delete next.fullEdgeInsets;next.stationaryFace=0;}
export function commitWovenLineDraft(params:EditableWovenLines,lines:WovenLine[]):EditableWovenLines{
 const next={...clone(params),lines:clone(lines)},changed=lines.length!==params.lines.length||lines.some((r,i)=>r[0]!==params.lines[i]?.[0]||r[1]!==params.lines[i]?.[1]);if(changed)clearGeometryReferences(next);
 const read=readWovenParams(next);if(!read||(read.mode!=='lines'&&read.mode!=='chord'))throw Error('角度 -360…360°、有符号距离 -10…10、倍率 0.2…5；旋转后至多32条。');return read;
}
export function commitWovenBoundaryDraft(params:Exclude<WovenParams,{mode:'graph'}>,points:XY[]):Exclude<WovenParams,{mode:'graph'}>{
 const next=clone(params);if(next.mode==='chord'&&!points.length)delete next.boundary;else next.boundary=clone(points);
 if(JSON.stringify(params.boundary)!==JSON.stringify(next.boundary))clearGeometryReferences(next);
 const read=readWovenParams(next);if(!read||read.mode==='graph')throw Error(params.mode==='chord'?'旋转边界保留1–32个有限源点；空集为圆弦。坐标须在-10…10且源点不能重合。':'边界需要3–32个按顺序排列的非退化凸顶点，坐标-10…10；不能重合或自交。');return read;
}
export function wovenBoundaryDraftError(params:Exclude<WovenParams,{mode:'graph'}>,points:XY[]):string{try{commitWovenBoundaryDraft(params,points);return '';}catch(e){return (e as Error).message;}}
/** Hull is only a preview of rotated source points. It never replaces the persisted point list. */
export function wovenPreviewHull(points:XY[]):XY[]{const sorted=clone(points).sort((a,b)=>a[0]-b[0]||a[1]-b[1]).filter((p,i,a)=>i===0||p[0]!==a[i-1][0]||p[1]!==a[i-1][1]),turn=(a:XY,b:XY,c:XY)=>cross([b[0]-a[0],b[1]-a[1]],[c[0]-a[0],c[1]-a[1]]);if(sorted.length<3)return sorted;const side=(rows:XY[])=>{const h:XY[]=[];for(const p of rows){while(h.length>1&&turn(h.at(-2)!,h.at(-1)!,p)<=0)h.pop();h.push(p);}return h;};return [...side(sorted).slice(0,-1),...side(sorted.slice().reverse()).slice(0,-1)];}
export function wovenRotatedBoundary(points:XY[],order:number):XY[]{return wovenPreviewHull(Array.from({length:order},(_,i)=>{const a=2*Math.PI*i/order,c=Math.cos(a),s=Math.sin(a);return points.map(([x,y])=>[x*c-y*s,x*s+y*c] as XY);}).flat());}
function canonical(line:WovenLine):WovenLine{let a=line[0]%360,d=line[1];if(a<0)a+=360;if(a>=180){a-=180;d=-d;}return [a,d,line[2]];}
export function clipWovenSourceLine(line:WovenLine,boundary:XY[]):[XY,XY]|null{
 if(boundary.length<3)return null;const ring=clone(boundary),area=ring.reduce((a,p,i)=>a+cross(p,ring[(i+1)%ring.length]),0);if(area<0)ring.reverse();const {tangent,base}=wovenLineFrame(line);let low=-Infinity,high=Infinity;
 for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],edge:XY=[b[0]-a[0],b[1]-a[1]],slope=cross(edge,tangent),value=cross(edge,[base[0]-a[0],base[1]-a[1]]);if(Math.abs(slope)<1e-10){if(value< -1e-9)return null;}else if(slope>0)low=Math.max(low,-value/slope);else high=Math.min(high,-value/slope);}
 return high-low<1e-7||!Number.isFinite(low)||!Number.isFinite(high)?null:[low,high].map(t=>[base[0]+t*tangent[0],base[1]+t*tangent[1]]) as [XY,XY];
}
export type WovenSourceLinePreview={sourceIndex:number;copy:number;copyAngle:number;line:WovenLine;rawFrame:ReturnType<typeof wovenLineFrame>;ends:[XY,XY]|null;physicalReferenceWidth:number};
export function previewWovenSource(params:EditableWovenLines,lines=params.lines){
 const order=params.mode==='chord'?params.order:1,circle=params.mode==='chord'&&!params.boundary,expanded:WovenSourceLinePreview[]=[],canonicalRows:WovenLine[]=[],circleEnds:XY[]=[];
 const seeds=lines.map(canonical);if(seeds.some((row,i)=>seeds.slice(0,i).some(x=>Math.abs(x[0]-row[0])<1e-7&&Math.abs(x[1]-row[1])<1e-7)))throw Error('源线重合；请合并为同一条带，未隐藏或合并草稿。');
 lines.forEach((raw,sourceIndex)=>{if(raw.some(x=>!Number.isFinite(x)))throw Error('源线参数须为有限数字。');const seed=canonical(raw);for(let copy=0;copy<order;copy++){
  const copyAngle=360*copy/order,row=canonical([seed[0]+copyAngle,seed[1],seed[2]]);if(canonicalRows.some(x=>Math.abs(x[0]-row[0])<1e-7&&Math.abs(x[1]-row[1])<1e-7))continue;canonicalRows.push(row);
  let ends:[XY,XY]|null=null;if(circle){if(!(Math.abs(row[1])>1e-7&&Math.abs(row[1])<1))throw Error('圆弦距离须非零且绝对值小于1；未自动推回圆内。');const f=wovenLineFrame(row),extent=Math.sqrt(1-row[1]*row[1]);ends=[-1,1].map(k=>[f.base[0]+k*extent*f.tangent[0],f.base[1]+k*extent*f.tangent[1]]) as [XY,XY];circleEnds.push(...ends);}
  expanded.push({sourceIndex,copy,copyAngle,line:row,rawFrame:wovenLineFrame(raw,copyAngle),ends,physicalReferenceWidth:params.width*raw[2]});
 }});
 const boundary=circle?wovenPreviewHull(circleEnds):params.mode==='chord'?wovenRotatedBoundary(params.boundary??[],order):clone(params.boundary);
 if(!circle)expanded.forEach(row=>{row.ends=clipWovenSourceLine(row.line,boundary);});
 return {boundary,expanded,circle,sourcePoints:params.mode==='chord'?clone(params.boundary??[]):clone(params.boundary),unitCircleReference:circle,description:circle?'无boundary字段：原圆弦端点取凸包':params.mode==='chord'?'原source points旋转后取凸包；source point顺序不变':'原有序凸边界'};
}
