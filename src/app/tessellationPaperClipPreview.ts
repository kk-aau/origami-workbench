import {postRotation,type PrimalDualOptions} from './primalDualParams';
import type {TessGraph,TessPaperSpec,XY} from './tessellation';

/** The backend retains the extended source graph before clipping. */
export interface PaperClipPreviewRecipe {
  kind:'convex-clip-v1';
  sourceFold:Pick<TessGraph,'vertices_coords'|'edges_vertices'|'edges_assignment'|'faces_vertices'>;
  sourcePreview:{kind:'shrink-rotate';vertices:[number,number,number,number][]}|null;
  translation:XY;
  translationBeforeRotation?:XY;
  paper:TessPaperSpec;
  polygon:XY[];
  polygonBeforeRotation?:XY[];
}

type MovingParams={angle:number;scale:number;paper?:TessPaperSpec}&PrimalDualOptions;
const cross=(a:XY,b:XY,c:XY)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const distance=(a:XY,b:XY)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const area=(points:XY[])=>points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-p[1]*q[0];},0)/2;
const edgeKey=(a:number,b:number)=>a<b?`${a},${b}`:`${b},${a}`;

function strictlyConvex(points:XY[],eps:number){
  if(points.length<3)return false;
  const turns=points.map((p,i)=>cross(p,points[(i+1)%points.length],points[(i+2)%points.length]));
  return turns.every(v=>v>eps)||turns.every(v=>v< -eps);
}
function onSegment(point:XY,a:XY,b:XY,eps:number){
  const length=distance(a,b);if(length<=eps)return false;
  const t=((point[0]-a[0])*(b[0]-a[0])+(point[1]-a[1])*(b[1]-a[1]))/(length*length);
  return t>=-eps/length&&t<=1+eps/length&&Math.abs(cross(a,b,point))<=eps*length;
}
function clippedFace(face:XY[],paper:XY[],eps:number):XY[]{
  let output=face;
  for(let side=0;side<paper.length;side++){
    const a=paper[side],b=paper[(side+1)%paper.length],previous=output;
    output=[];if(!previous.length)break;
    for(let i=0;i<previous.length;i++){
      const p=previous[(i+previous.length-1)%previous.length],q=previous[i];
      const dp=cross(a,b,p),dq=cross(a,b,q),insideP=dp>=-eps,insideQ=dq>=-eps;
      if(insideP!==insideQ){const t=dp/(dp-dq);output.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}
      if(insideQ)output.push(q);
    }
    const distinct:XY[]=[];
    for(const point of output)if(!distinct.length||distance(point,distinct[distinct.length-1])>eps)distinct.push(point);
    if(distinct.length>1&&distance(distinct[0],distinct[distinct.length-1])<=eps)distinct.pop();
    output=distinct;
  }
  return output;
}

/** Rebuild intersections as the extended pattern moves. A topology change is
 * handed to the backend instead of drawing old crease IDs in new positions.
 */
export function previewClippedCoordinates(fold:TessGraph,params:MovingParams,recipe:PaperClipPreviewRecipe):XY[]|null {
  const samePaper=!!params.paper&&params.paper.shape===recipe.paper.shape&&
    (params.paper.fit??'extend')===(recipe.paper.fit??'extend')&&
    params.paper.margin===recipe.paper.margin&&
    (params.paper.aspect??1)===(recipe.paper.aspect??1)&&
    (params.paper.sides??6)===(recipe.paper.sides??6);
  if(recipe.kind!=='convex-clip-v1'||recipe.sourcePreview?.kind!=='shrink-rotate'||
      !samePaper||
      !Number.isFinite(params.angle)||!Number.isFinite(params.scale)||
      !Array.isArray(recipe.translation)||recipe.translation.length!==2||
      recipe.translation.some(n=>!Number.isFinite(n)))return null;
  const source=recipe.sourceFold,coefficients=recipe.sourcePreview.vertices;
  if(!source||!Array.isArray(source.vertices_coords)||coefficients.length!==source.vertices_coords.length||
      !Array.isArray(source.faces_vertices)||!source.faces_vertices.length||
      source.edges_vertices.length!==source.edges_assignment.length||
      recipe.polygon.length<3||recipe.polygon.some(p=>p.length!==2||p.some(n=>!Number.isFinite(n))))return null;
  const theta=params.angle*Math.PI/180,c=Math.cos(theta)*params.scale,s=Math.sin(theta)*params.scale;
  const rotation=postRotation(params),rc=Math.cos(rotation),rs=Math.sin(rotation);
  const orient=(point:XY):XY=>[rc*point[0]-rs*point[1],rs*point[0]+rc*point[1]];
  const translation=recipe.translationBeforeRotation?orient(recipe.translationBeforeRotation):recipe.translation;
  const outline=recipe.polygonBeforeRotation?recipe.polygonBeforeRotation.map(orient):recipe.polygon;
  if(translation.some(n=>!Number.isFinite(n))||outline.some(p=>p.length!==2||p.some(n=>!Number.isFinite(n))))return null;
  const sourceCoords:XY[]=coefficients.map(([cx,cy,dx,dy])=>{
    const px=cx+c*dx-s*dy,py=cy+s*dx+c*dy;
    return [rc*px-rs*py+translation[0],rs*px+rc*py+translation[1]];
  });
  if(sourceCoords.some(p=>p.some(n=>!Number.isFinite(n))))return null;
  const span=Math.max(1,...[0,1].map(axis=>Math.max(...sourceCoords.map(p=>p[axis]))-Math.min(...sourceCoords.map(p=>p[axis]))));
  const eps=span*1e-9,areaEps=eps*span,quantum=span*1e-11;
  const paper=area(outline)<0?[...outline].reverse():outline;
  if(!strictlyConvex(paper,areaEps))return null;
  const originalEdges=source.edges_vertices.map(([a,b],i)=>({a,b,kind:source.edges_assignment[i]}));
  if(originalEdges.some(({a,b})=>!sourceCoords[a]||!sourceCoords[b]||distance(sourceCoords[a],sourceCoords[b])<=eps))return null;

  const ids=new Map<string,number>(),coords:XY[]=[],faces:number[][]=[];
  for(const face of source.faces_vertices){
    if(face.length<3||face.some(i=>!sourceCoords[i]))return null;
    const subject=face.map(i=>sourceCoords[i]);
    if(!strictlyConvex(subject,areaEps))return null;
    const polygon=clippedFace(subject,paper,eps);
    const perimeter=polygon.reduce((sum,point,i)=>sum+distance(point,polygon[(i+1)%polygon.length]),0);
    if(polygon.length<3||Math.abs(area(polygon))<=eps*perimeter/2)continue;
    const indices=polygon.map(point=>{
      const key=`${Math.round(point[0]/quantum)},${Math.round(point[1]/quantum)}`;
      let index=ids.get(key);
      if(index===undefined){index=coords.length;ids.set(key,index);coords.push(point);}
      else if(distance(coords[index],point)>eps)return -1;
      return index;
    });
    if(indices.includes(-1)||new Set(indices).size!==indices.length)return null;
    faces.push(indices);
  }
  if(!faces.length||coords.length!==fold.vertices_coords.length||faces.length!==fold.faces_vertices.length)return null;
  const owners=new Map<string,number[]>();
  for(let fi=0;fi<faces.length;fi++){
    const face=faces[fi];
    for(let i=0;i<face.length;i++){
      const key=edgeKey(face[i],face[(i+1)%face.length]);
      owners.set(key,[...(owners.get(key)??[]),fi]);
    }
  }
  if([...owners.values()].some(pair=>pair.length>2))return null;
  const keys=[...owners.keys()].map(key=>key.split(',').map(Number) as [number,number])
    .sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  if(keys.length!==fold.edges_vertices.length)return null;
  let totalArea=0;
  for(let fi=0;fi<faces.length;fi++){
    const face=faces[fi],expected=fold.faces_vertices[fi];
    if(face.length!==expected.length||face.some((v,i)=>v!==expected[i]))return null;
    const points=face.map(i=>coords[i]);
    const perimeter=points.reduce((sum,point,i)=>sum+distance(point,points[(i+1)%points.length]),0);
    if(!strictlyConvex(points,eps*perimeter/2))return null;
    totalArea+=Math.abs(area(points));
  }
  if(Math.abs(totalArea-Math.abs(area(paper)))>areaEps*Math.max(10,faces.length)||
      coords.length-keys.length+faces.length!==1)return null;
  for(let i=0;i<keys.length;i++){
    const [a,b]=keys[i],[oldA,oldB]=fold.edges_vertices[i],p=coords[a],q=coords[b];
    if(a!==oldA||b!==oldB||distance(p,q)<=eps)return null;
    const uses=owners.get(edgeKey(a,b))!;
    let kind:string;
    if(uses.length===1){
      if(!paper.some((u,j)=>onSegment(p,u,paper[(j+1)%paper.length],eps)&&
              onSegment(q,u,paper[(j+1)%paper.length],eps)))return null;
      kind='B';
    }else{
      const matches=originalEdges.filter(({a:x,b:y})=>onSegment(p,sourceCoords[x],sourceCoords[y],eps)&&
          onSegment(q,sourceCoords[x],sourceCoords[y],eps));
      if(matches.length!==1||matches[0].kind==='B')return null;
      kind=matches[0].kind;
    }
    if(kind!==fold.edges_assignment[i])return null;
  }
  return coords;
}
