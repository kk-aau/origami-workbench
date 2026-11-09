import type {WovenGraph} from './wovenGraph';
import type {XY} from './tessellation';

/** An analytic boundary remains saved alongside its explicit CP chords. */
export type WovenEllipseHole={kind:'ellipse';center:XY;radii:XY;rotation:number};
export type WovenCurveHole={component:number;curve:WovenEllipseHole;segments:number;maxError:number};
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const pair=(x:unknown):x is XY=>Array.isArray(x)&&x.length===2&&x.every(finite);
export function readWovenEllipseHole(value:unknown):WovenEllipseHole|null {
 if(!record(value)||Object.keys(value).sort().join(',')!=='center,kind,radii,rotation'||value.kind!=='ellipse'||!pair(value.center)||value.center.some(x=>Math.abs(x)>1000)||!pair(value.radii)||value.radii.some(x=>x<=0||x>1000)||!finite(value.rotation)||Math.abs(value.rotation)>360)return null;
 return structuredClone(value) as WovenEllipseHole;
}
/** Ellipses are an affine image of a circle; this operator-norm bound applies
 * to every entire parameter interval, not just its midpoint. */
export function wovenEllipseChordError(curve:WovenEllipseHole,segments:number):number {return Math.max(...curve.radii)*(1-Math.cos(Math.PI/segments));}
export function sampleWovenEllipseHole(curve:WovenEllipseHole,segments:number):XY[] {
 if(!readWovenEllipseHole(curve)||!Number.isInteger(segments)||segments<8||segments>256)throw Error('曲线孔需要有效圆／椭圆参数和8–256段。');
 const angle=curve.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 return Array.from({length:segments},(_,i)=>{const t=i*2*Math.PI/segments,x=curve.radii[0]*Math.cos(t),y=curve.radii[1]*Math.sin(t);return [curve.center[0]+c*x-s*y,curve.center[1]+s*x+c*y] as XY;});
}
function components(graph:Pick<WovenGraph,'vertices'|'edges'>):number[][] {
 const ns=graph.vertices.map(()=>[] as number[]);for(const [a,b] of graph.edges){ns[a].push(b);ns[b].push(a);}const seen=new Set<number>(),out:number[][]=[];
 for(let v=0;v<ns.length;v++){if(seen.has(v))continue;const q=[v];seen.add(v);for(let i=0;i<q.length;i++)for(const x of ns[q[i]])if(!seen.has(x)){seen.add(x);q.push(x);}out.push(q.sort((a,b)=>a-b));}return out;
}
/** Validate the analytic identity without changing any submitted coordinates.
 * A small ulp allowance only covers JS/Python libm replay; it never snaps. */
export function wovenCurveHolesMatch(value:unknown,graph:Pick<WovenGraph,'vertices'|'edges'|'ringHoles'>):value is WovenCurveHole[] {
 if(!Array.isArray(value)||value.length<1||value.length>32)return false;const cs=components(graph),used=new Set<number>();
 return value.every(h=>{
  if(!record(h)||Object.keys(h).sort().join(',')!=='component,curve,maxError,segments'||!Number.isInteger(h.component)||Number(h.component)<0||used.has(Number(h.component))||!finite(h.maxError)||h.maxError<=0||h.maxError>1000||!Number.isInteger(h.segments)||Number(h.segments)<8||Number(h.segments)>256)return false;
  const curve=readWovenEllipseHole(h.curve),vertices=cs[Number(h.component)];if(!curve||!vertices||vertices.length!==h.segments||!graph.ringHoles?.some(b=>b.component===h.component))return false;used.add(Number(h.component));
  if(wovenEllipseChordError(curve,Number(h.segments))>h.maxError)return false;
  const expected=sampleWovenEllipseHole(curve,Number(h.segments)),selected=graph.edges.filter(([a])=>vertices.includes(a));
  if(selected.length!==vertices.length||vertices.some((v,i)=>!selected.some(([a,b])=>a===v&&b===vertices[(i+1)%vertices.length]||b===v&&a===vertices[(i+1)%vertices.length])))return false;
  return vertices.every((v,i)=>graph.vertices[v].every((x,k)=>Math.abs(x-expected[i][k])<=32*Number.EPSILON*Math.max(1,Math.abs(x),Math.abs(expected[i][k]))));
 });
}
/** Appending preserves all original vertex, edge, face and component indices. */
export function appendWovenEllipseHole(graph:WovenGraph,face:number,curve:WovenEllipseHole,maxError:number):WovenGraph {
 if(!readWovenEllipseHole(curve)||!Number.isInteger(face)||face<0||face>=256||!finite(maxError)||maxError<=0||maxError>1000)throw Error('曲线孔原面、参数或最大弦误差无效。');
 let segments=8;while(segments<=256&&wovenEllipseChordError(curve,segments)>maxError)segments++;
 if(segments>256)throw Error('曲线孔弦误差需要超过256段；请增大误差或缩小半径。');
 const points=sampleWovenEllipseHole(curve,segments),offset=graph.vertices.length,component=components(graph).length;
 if(offset+segments>512||graph.edges.length+segments>1024)throw Error('曲线孔超过母图512点／1024边容量，未截断。');
 if(points.some(p=>p.some(x=>Math.abs(x)>1000)))throw Error('曲线孔超出母图坐标范围。');
 return {...structuredClone(graph),vertices:[...structuredClone(graph.vertices),...points],edges:[...structuredClone(graph.edges),...points.map((_,i)=>[offset+i,offset+(i+1)%segments] as [number,number])],ringHoles:[...(graph.ringHoles??[]),{face,component}],curveHoles:[...(graph.curveHoles??[]),{component,curve:structuredClone(curve),segments,maxError}]};
}
