import {solveSimulationSurfacePanelHeights} from './simSurfaceHeightSolver';

type Point=[number,number];
type Vector=[number,number,number];
type Panel={faces:number[];vertices:number[]};
interface Options {
  positions:Float32Array;
  sourceIndices:Uint32Array;
  panels:Panel[];
  group:{panels:number[];plane:{normal:Vector;offset:number};basis:[Vector,Vector];origin:Vector};
  /** Canonical below -> above panel IDs, retaining trusted FOLD relations. */
  relations:Array<[number,number]>;
}
type Result={status:'solved';heights:Map<number,(point:Vector)=>number>;layerCount:number}|{status:'unsupported'|'inconclusive';reason?:string};
const signedArea=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const polygonArea=(polygon:Point[])=>polygon.length<3?0:Math.abs(polygon.reduce((sum,p,k)=>sum+signedArea(polygon[0],p,polygon[(k+1)%polygon.length]),0))/2;
function clipTriangle(subject:Point[],triangle:Point[]):Point[]{
  let output=subject;const sign=Math.sign(signedArea(triangle[0],triangle[1],triangle[2]));
  for(let k=0;k<3;k++){
    const a=triangle[k],b=triangle[(k+1)%3],input=output;output=[];
    for(let j=0;j<input.length;j++){
      const p=input[j],q=input[(j+1)%input.length],first=sign*signedArea(a,b,p),last=sign*signedArea(a,b,q);
      if(first>=0)output.push(p);
      if(first>=0&&last<0||first<0&&last>=0){const t=first/(first-last);output.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}
    }
    if(output.length<3)return [];
  }
  return output;
}

/** Resolve interleaved whole paper panels with one affine height per panel.
 * Overlap polygons establish inequalities only: no clipping vertex, triangle,
 * edge or material weight is ever emitted into the display mesh. */
export function intactSurfaceLayerHeights(options:Options):Result {
  const {positions,sourceIndices,panels,group,relations}=options;
  const deadline=Date.now()+2500;
  const local=new Map(group.panels.map((p,i)=>[p,i])),project=(source:number):Point=>group.basis.map(axis=>axis.reduce((sum,n,k)=>sum+n*(positions[source*3+k]-group.origin[k]),0)) as Point;
  const projected=group.panels.map(p=>panels[p].faces.map(face=>[0,1,2].map(k=>project(sourceIndices[face*3+k]))));
  const parameterPanels=group.panels.map(p=>{
    const points=panels[p].vertices.map(project),low=[0,1].map(k=>Math.min(...points.map(point=>point[k]))),high=[0,1].map(k=>Math.max(...points.map(point=>point[k])));
    return {center:[(low[0]+high[0])/2,(low[1]+high[1])/2] as Point,scale:Math.max(high[0]-low[0],high[1]-low[1],1e-12)};
  });
  const directions=new Map<string,[number,number]>();
  for(const [below,above] of relations){
    const a=local.get(below),b=local.get(above);if(a===undefined||b===undefined||a===b)continue;
    const key=a<b?`${a}:${b}`:`${b}:${a}`,old=directions.get(key);
    if(old&&(old[0]!==a||old[1]!==b))return {status:'unsupported'};
    directions.set(key,[a,b]);
  }
  const bounds=projected.map(triangles=>triangles.map(triangle=>[Math.min(...triangle.map(p=>p[0])),Math.min(...triangle.map(p=>p[1])),Math.max(...triangle.map(p=>p[0])),Math.max(...triangle.map(p=>p[1]))]));
  const panelAreas=projected.map(triangles=>triangles.reduce((sum,t)=>sum+polygonArea(t),0)),unknownAreas=new Float64Array(group.panels.length);
  const constraints:Array<{above:number;below:number;point:Point;gap:number}>=[],probes:Point[]=[];let work=0;
  for(let a=0;a<projected.length;a++)for(let b=a+1;b<projected.length;b++)for(let i=0;i<projected[a].length;i++)for(let j=0;j<projected[b].length;j++){
    if(++work>2_000_000)return {status:'inconclusive',reason:'完整纸面的重叠检查超过预算，请缩小模型后重试。'};
    if((work&2047)===0&&Date.now()>=deadline)return {status:'inconclusive',reason:'完整纸面的重叠检查达到计算时间预算，请缩小模型后重试。'};
    const aa=bounds[a][i],bb=bounds[b][j];if(aa[2]<=bb[0]||bb[2]<=aa[0]||aa[3]<=bb[1]||bb[3]<=aa[1])continue;
    const polygon=clipTriangle(projected[a][i],projected[b][j]),area=polygonArea(polygon);
    if(area<=Math.max(1e-14,Math.min(panelAreas[a],panelAreas[b])*1e-12))continue;
    const relation=directions.get(`${a}:${b}`);
    if(!relation){unknownAreas[a]+=area;unknownAreas[b]+=area;continue;}
    const [below,above]=relation;
    for(const point of polygon)constraints.push({above,below,point,gap:1});
    const center=polygon.reduce((sum,p)=>[sum[0]+p[0]/polygon.length,sum[1]+p[1]/polygon.length] as Point,[0,0] as Point);
    probes.push(center);
    if(constraints.length>100_000)return {status:'inconclusive',reason:'完整纸面的层序约束超过预算，请缩小模型后重试。'};
  }
  if(!constraints.length)return {status:'unsupported'};
  if(unknownAreas.some((area,p)=>area>Math.max(1e-12,panelAreas[p]*1e-6)))return {status:'unsupported'};
  const result=solveSimulationSurfacePanelHeights({panels:parameterPanels,constraints,maxMs:Math.max(0,deadline-Date.now())});
  if(result.status!=='solved')return {status:'inconclusive',reason:result.reason??'未能验证保持完整纸面的层间距，请调整模型后重试。'};
  const heights=new Map<number,(point:Vector)=>number>();
  group.panels.forEach((p,i)=>{
    const parameters=parameterPanels[i],[a,b,c]=Array.from(result.coefficients.slice(i*3,i*3+3));
    heights.set(p,point=>{
      const uv=group.basis.map(axis=>axis.reduce((sum,n,k)=>sum+n*(point[k]-group.origin[k]),0));
      return a*(uv[0]-parameters.center[0])/parameters.scale+b*(uv[1]-parameters.center[1])/parameters.scale+c;
    });
  });
  // Count only positive-area coverage probes. Touching sector tips are not
  // paper layers, even when many original panels meet at the same vertex.
  let layerCount=2;
  // This diagnostic never changes the solved heights. A bounded sample keeps
  // a large arrangement from spending its layout budget on a layer label.
  const stride=Math.max(1,Math.ceil(probes.length/4096));
  for(let probe=0;probe<probes.length;probe+=stride){
    const point=probes[probe];
    let count=0;
    for(const [p,triangles] of projected.entries())if(triangles.some((triangle,t)=>{
      const box=bounds[p][t];if(point[0]<=box[0]||point[0]>=box[2]||point[1]<=box[1]||point[1]>=box[3])return false;
      const sign=Math.sign(signedArea(triangle[0],triangle[1],triangle[2]));
      return triangle.every((p,k)=>sign*signedArea(p,triangle[(k+1)%3],point)>0);
    }))count++;
    layerCount=Math.max(layerCount,count);
  }
  return {status:'solved',heights,layerCount};
}
