import type {FoldAssignment,PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {SimulationLayerOrder} from './simLayerOrder';
import {intactSurfaceLayerHeights} from './simIntactSurfaceLayers';
import type {CameraUniforms} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';

export interface SimulationHingeLayerSpan {
  /** Unchanged prepared-mesh material edge and its solver vertices. */
  edge:number;
  sourceVertices:[number,number];
  /** A hinge crossing N intervening sheets has N+1 base-gap intervals. */
  layersApart:number;
  interveningLayers:number;
  /** Full endpoint display distance; blend does not change this target. */
  distance:number;
}

export interface SimulationSurfaceMesh {
  positions:Float32Array;
  indices:Uint32Array;
  edgesVertices:[number,number][];
  edgesAssignment:FoldAssignment[];
  /** Display vertex -> unchanged solver vertex, including both hinge banks. */
  sourceVertices:Uint32Array;
  /** Barycentric source coordinates for display-only vertices created by local overlap clipping. */
  sourceVertexWeights?:Array<Array<[number,number]>>;
  /** Exact zero-gap planar positions and rank*normal coefficients. Keeping
   * these separate prevents a camera-dependent gap from scaling solver noise
   * back into the corrected plane. */
  gapBasePositions?:Float64Array;
  gapDirections?:Float64Array;
  gapLimit?:number;
  /** Display triangle -> immutable prepared simulation triangle. */
  sourceTriangles?:Uint32Array;
  /** Source winding per display triangle, independent of a particular gap. */
  gapTriangleNormals?:Float64Array;
  /** Winding was bounded for every gap in [0,gapLimit], rather than sampled. */
  gapWindingValidated?:boolean;
  /** Explicit wide domains can repair only sub-resolution Float32 slivers.
   * Areas remain in unchanged material coordinates and share source IDs. */
  gapSliverRepair?:{
    triangleAreas:Float64Array;
    triangleReversed:Uint8Array;
    sourceAreas:Float64Array;
    missingAreas:Float64Array;
  };
  gapAllowSliverRepair?:boolean;
  /** Original whole-panel display banks: never flip or delete a material
   * triangle as a numerical repair. Reject an unsafe spacing atomically. */
  gapPreserveTopology?:boolean;
  /** Largest group of separated, overlapping panels. */
  layerCount:number;
  layerNormals:Vector[];
  layerGap:number;
  /** Only globally ordered hinge banks are reported. A local layer cycle has
   * no single rank difference and is never assigned an invented global span. */
  hingeLayerSpans?:SimulationHingeLayerSpan[];
}

export interface SimulationSurfaceLayerOptions {
  /** Explicit display-only resize domain. Omitting this preserves the legacy
   * radius*5e-5 cap. It never changes coplanarity or overlap tolerances. */
  maxGap?:number;
}

type Vector=[number,number,number];
type Point=[number,number];
type Panel={faces:number[];vertices:number[];sourceFaces:number[]};
type Plane={normal:Vector;offset:number};
type Projection={triangles:Point[][];bounds:[number,number,number,number]};
type Bounds=[number,number,number,number,number,number];
/** User-selected display separation: twice the original precision floor/cap. */
export const SIMULATION_SURFACE_GAP_SCALE=2;
export const SIMULATION_SURFACE_GAP_CAP=2e-5*SIMULATION_SURFACE_GAP_SCALE;
const dot=(a:Vector,b:Vector)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:Vector,b:Vector):Vector=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const minus=(a:Vector,b:Vector):Vector=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const position=(positions:Float32Array,v:number):Vector=>[positions[v*3],positions[v*3+1],positions[v*3+2]];

/** Smallest practical display-only gap for this perspective/depth precision.
 * Sixteen depth quanta leave room for Float32 shader arithmetic; sixteen coordinate
 * ULPs keep the separated vertices distinct before rasterisation. At grazing
 * angles or low-bit depth buffers the required gap can become visible, so it
 * is capped at radius*4e-5 instead of making the paper visibly thick. Such a
 * capped edge-on view cannot promise a fully resolved depth-buffer ordering. */
export function selectSimulationSurfaceBaseGap(camera:Pick<CameraUniforms,'camDist'|'depthRange'|'center'>,radius:number,depthBits=24,normalDepth=1):number {
  const extent=Number.isFinite(radius)&&radius>0?radius:1,cap=extent*SIMULATION_SURFACE_GAP_CAP;
  const magnitude=Math.max(extent,...camera.center.filter(Number.isFinite).map(v=>Math.abs(v)+extent));
  const rounded=Math.fround(magnitude),storedMagnitude=Number.isFinite(rounded)?Math.max(magnitude,rounded):magnitude;
  const coordinateUlp=2**Math.max(-149,Math.floor(Math.log2(storedMagnitude))-23),coordinateFloor=8*coordinateUlp;
  const bits=Number.isFinite(depthBits)&&depthBits>=1&&depthBits<=53?Math.floor(depthBits):24;
  const c=Number.isFinite(camera.camDist)&&camera.camDist>0?camera.camDist:extent*3.2;
  const range=Number.isFinite(camera.depthRange)&&camera.depthRange>0&&camera.depthRange<c?camera.depthRange:Math.min(extent*2,c*.9);
  const near=c-range,far=c+range,modelFar=Math.min(far,c+extent);
  // Window depth is far/(far-near) * (1-near/eyeDistance).
  // Its smallest slope over the visible model is at the farthest surface.
  const slope=near*far/((far-near)*modelFar*modelFar);
  const alignment=Number.isFinite(normalDepth)?Math.min(1,Math.max(1e-12,Math.abs(normalDepth))):1;
  const depthFloor=8/((2**bits-1)*slope*alignment);
  return Math.min(cap,SIMULATION_SURFACE_GAP_SCALE*Math.max(coordinateFloor,depthFloor));
}

/** Winding-independent direction, with the largest component always positive. */
function canonical(vector:Vector):Vector|null {
  const length=Math.hypot(...vector);
  if(!Number.isFinite(length)||length===0)return null;
  let axis=0;for(let i=1;i<3;i++)if(Math.abs(vector[i])>Math.abs(vector[axis]))axis=i;
  const factor=(vector[axis]<0?-1:1)/length;
  return vector.map(value=>value*factor) as Vector;
}

function panelPlane(panel:Panel,positions:Float32Array,indices:Uint32Array,tolerance:number):Plane|null {
  // Area-weighted canonical normals keep reverse-wound independent copies
  // consistent, and do not fit a bent material panel by averaging its vertices.
  const total:Vector=[0,0,0];let largest=0;
  for(const face of panel.faces){
    const a=position(positions,indices[face*3]),b=position(positions,indices[face*3+1]),c=position(positions,indices[face*3+2]);
    const raw=cross(minus(b,a),minus(c,a)),length=Math.hypot(...raw),normal=canonical(raw);
    if(!normal)continue;
    largest=Math.max(largest,length);for(let axis=0;axis<3;axis++)total[axis]+=normal[axis]*length;
  }
  const normal=canonical(total);if(!normal||largest===0)return null;
  const offset=panel.vertices.reduce((sum,v)=>sum+dot(normal,position(positions,v)),0)/panel.vertices.length;
  if(panel.vertices.some(v=>Math.abs(dot(normal,position(positions,v))-offset)>tolerance))return null;
  return {normal,offset};
}

function planeBasis(normal:Vector):[Vector,Vector] {
  let axis=0;for(let i=1;i<3;i++)if(Math.abs(normal[i])<Math.abs(normal[axis]))axis=i;
  const seed:Vector=[0,0,0];seed[axis]=1;
  const u=canonical(cross(normal,seed))!;
  return [u,cross(normal,u)];
}

function project(panel:Panel,positions:Float32Array,indices:Uint32Array,basis:[Vector,Vector],origin:Vector):Projection {
  const points=new Map<number,Point>();
  const bounds:[number,number,number,number]=[Infinity,Infinity,-Infinity,-Infinity];
  for(const v of panel.vertices){
    const point=minus(position(positions,v),origin),xy:Point=[dot(point,basis[0]),dot(point,basis[1])];points.set(v,xy);
    bounds[0]=Math.min(bounds[0],xy[0]);bounds[1]=Math.min(bounds[1],xy[1]);bounds[2]=Math.max(bounds[2],xy[0]);bounds[3]=Math.max(bounds[3],xy[1]);
  }
  return {bounds,triangles:panel.faces.map(face=>[0,1,2].map(k=>points.get(indices[face*3+k])!))};
}

/** Strict SAT: sharing only a point or a boundary has no positive overlap area. */
function trianglesOverlap(a:Point[],b:Point[],epsilon:number):boolean {
  for(const triangle of [a,b])for(let i=0;i<3;i++){
    const from=triangle[i],to=triangle[(i+1)%3],dx=to[0]-from[0],dy=to[1]-from[1],length=Math.hypot(dx,dy);
    if(length===0)return false;
    const nx=-dy/length,ny=dx/length;
    const aa=a.map(p=>p[0]*nx+p[1]*ny),bb=b.map(p=>p[0]*nx+p[1]*ny);
    if(Math.min(Math.max(...aa),Math.max(...bb))-Math.max(Math.min(...aa),Math.min(...bb))<=epsilon)return false;
  }
  return true;
}

function overlaps(a:Projection,b:Projection,epsilon:number):boolean {
  if(Math.min(a.bounds[2],b.bounds[2])-Math.max(a.bounds[0],b.bounds[0])<=epsilon||
     Math.min(a.bounds[3],b.bounds[3])-Math.max(a.bounds[1],b.bounds[1])<=epsilon)return false;
  return a.triangles.some(at=>b.triangles.some(bt=>trianglesOverlap(at,bt,epsilon)));
}

/** Interval sweep with prefix-max pruning, on the least crowded world axis.
 * It keeps only linear-size boxes rather than constructing every possible
 * overlap pair, which would be quadratic for a deep coincident stack.
 */
function spatialCandidates(panels:Panel[],positions:Float32Array,planes:(Plane|null)[],padding:number){
  const bounds:Bounds[]=panels.map(panel=>{
    const box:Bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
    for(const v of panel.vertices)for(let axis=0;axis<3;axis++){const value=positions[v*3+axis];box[axis]=Math.min(box[axis],value);box[axis+3]=Math.max(box[axis+3],value);}
    return box;
  });
  const valid=planes.flatMap((plane,p)=>plane?[p]:[]);
  let axis=0,crowding=Infinity;
  for(let k=0;k<3;k++){
    let minimum=Infinity,maximum=-Infinity,total=0;
    for(const p of valid){minimum=Math.min(minimum,bounds[p][k]);maximum=Math.max(maximum,bounds[p][k+3]);total+=bounds[p][k+3]-bounds[p][k]+padding;}
    const span=maximum-minimum;
    if(span>padding&&total/span<crowding){axis=k;crowding=total/span;}
  }
  const sorted=valid.sort((a,b)=>bounds[a][axis]-bounds[b][axis]||a-b);
  const prefix=new Float64Array(sorted.length);let maximum=-Infinity;
  sorted.forEach((p,i)=>{maximum=Math.max(maximum,bounds[p][axis+3]);prefix[i]=maximum;});
  return (panel:number)=>{
    const query=bounds[panel],lower=query[axis]-padding,upper=query[axis+3]+padding,result:number[]=[];
    let lo=0,hi=sorted.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(bounds[sorted[mid]][axis]<=upper)lo=mid+1;else hi=mid;}
    for(let i=lo-1;i>=0&&prefix[i]>=lower;i--){
      const candidate=sorted[i],box=bounds[candidate];
      if(candidate===panel||box[axis+3]<lower)continue;
      if([0,1,2].some(k=>box[k]>query[k+3]+padding||box[k+3]<query[k]-padding))continue;
      result.push(candidate);
    }
    return result.sort((a,b)=>a-b);
  };
}

/** Resolve numerical near-coincidence for display only, never solver or exports.
 * The caller enables this at the stable full-fold endpoint. Only trusted,
 * solved source-face orders can separate panels; numeric face IDs never decide
 * which sheet is on top. F-linked triangles remain one material panel.
 */
export class SimulationSurfaceLayers {
  private readonly panels:Panel[];
  private readonly indices:Uint32Array;
  private readonly sourceVertices:Uint32Array;
  private readonly edgesVertices:[number,number][]=[];
  private readonly edgesAssignment:FoldAssignment[]=[];
  private readonly displayPanels:Uint32Array;
  private readonly sourceIndices:Uint32Array;
  private readonly sourceVertexCount:number;
  private readonly tolerance:number;
  private readonly gap:number;
  private readonly triangleSourceFaces:number[]|null;
  private readonly sourceFaceCount:number;
  private readonly hinges:Array<{edge:number;vertices:[number,number];panels:[number,number]}>=[];
  private layerOrder:SimulationLayerOrder|null=null;
  private issue:string|undefined;

  constructor(prepared:PreparedOrigamiModel,radius:number){
    this.sourceIndices=prepared.indices.slice();this.sourceVertexCount=prepared.vertexCount;
    const extent=Number.isFinite(radius)&&radius>0?radius:1;
    this.tolerance=extent*5e-4;this.gap=extent*5e-5;
    const parents=Array.from({length:prepared.faceCount},(_,i)=>i);
    const find=(n:number):number=>{while(parents[n]!==n){parents[n]=parents[parents[n]];n=parents[n];}return n;};
    prepared.edgesAssignment.forEach((assignment,e)=>{
      if(assignment!=='F')return;
      const fs=prepared.edgesFaces[e]??[];if(fs.length<2)return;
      for(let i=1;i<fs.length;i++){const a=find(fs[0]),b=find(fs[i]);parents[Math.max(a,b)]=Math.min(a,b);}
    });
    const byRoot=new Map<number,number[]>();
    for(let face=0;face<prepared.faceCount;face++){const root=find(face),faces=byRoot.get(root)??[];faces.push(face);byRoot.set(root,faces);}
    const mapping=prepared.triangleSourceFaces,count=prepared.sourceFaceCount;
    this.sourceFaceCount=Number.isInteger(count)&&count!>0?count!:0;
    this.triangleSourceFaces=this.sourceFaceCount&&mapping?.length===prepared.faceCount&&mapping.every(f=>Number.isInteger(f)&&f>=0&&f<this.sourceFaceCount)?[...mapping]:null;
    this.panels=Array.from(byRoot.values()).sort((a,b)=>a[0]-b[0]).map(faces=>({faces,vertices:[...new Set(faces.flatMap(face=>Array.from(this.sourceIndices.slice(face*3,face*3+3))))],sourceFaces:[...new Set(faces.map(f=>this.triangleSourceFaces?.[f]??-1))]}));
    const facePanels=new Uint32Array(prepared.faceCount),maps:Map<number,number>[]=[],source:number[]=[],owner:number[]=[];
    this.indices=new Uint32Array(this.sourceIndices.length);
    this.panels.forEach((panel,p)=>{
      const map=new Map<number,number>();maps.push(map);
      panel.vertices.forEach(v=>{map.set(v,source.length);source.push(v);owner.push(p);});
      panel.faces.forEach(face=>{facePanels[face]=p;for(let k=0;k<3;k++)this.indices[face*3+k]=map.get(this.sourceIndices[face*3+k])!;});
    });
    prepared.edgesVertices.forEach(([a,b],edge)=>{
      const owners=new Set((prepared.edgesFaces[edge]??[]).map(face=>facePanels[face]));
      for(const panel of owners){const map=maps[panel];if(!map.has(a)||!map.has(b))continue;this.edgesVertices.push([map.get(a)!,map.get(b)!]);this.edgesAssignment.push(prepared.edgesAssignment[edge]);}
      if((prepared.edgesAssignment[edge]==='M'||prepared.edgesAssignment[edge]==='V')&&owners.size===2){
        const banks=[...owners];this.hinges.push({edge,vertices:[a,b],panels:[banks[0],banks[1]]});
      }
    });
    this.sourceVertices=new Uint32Array(source);this.displayPanels=new Uint32Array(owner);
  }

  setLayerOrder(order:SimulationLayerOrder|null):void {
    this.layerOrder=order&&this.triangleSourceFaces&&typeof order.sourceSignature==='string'&&order.sourceSignature.length>0&&order.sourceFaceCount===this.sourceFaceCount&&Array.isArray(order.faceOrders)&&order.faceOrders.every(row=>Array.isArray(row)&&row.length===3&&Number.isInteger(row[0])&&Number.isInteger(row[1])&&row[0]>=0&&row[1]>=0&&row[0]<this.sourceFaceCount&&row[1]<this.sourceFaceCount&&row[0]!==row[1]&&(row[2]===1||row[2]===-1))?{...order,faceOrders:order.faceOrders.map(row=>[...row])}:null;
  }

  getIssue():string|undefined {return this.issue;}

  build(positions:Float32Array,baseGap=this.gap,options:SimulationSurfaceLayerOptions={}):SimulationSurfaceMesh|null {
    this.issue=undefined;
    if(!this.layerOrder?.faceOrders.length||!this.triangleSourceFaces||positions.length!==this.sourceVertexCount*3||positions.some(value=>!Number.isFinite(value)))return null;
    if(!Number.isFinite(baseGap)||baseGap<=0)return null;
    // Layout classification uses the established microscopic spacing even
    // when a user explicitly requests a wider display-only resize domain.
    // A wider domain must not merge distinct material planes or tiny overlaps.
    const limit=options.maxGap??this.gap;
    if(!Number.isFinite(limit)||limit<=0)return null;
    const gap=Math.min(baseGap,limit),overlapEpsilon=Math.min(gap,this.gap)*2e-4;
    const planes=this.panels.map(panel=>panelPlane(panel,positions,this.sourceIndices,this.tolerance));
    const nearby=spatialCandidates(this.panels,positions,planes,this.tolerance*2);
    const used=new Set<number>(),adjustments=new Map<number,{plane:Plane;shift:number;height?:(point:Vector)=>number}>(),layerNormals:Vector[]=[];
    let layerCount=0;
    for(let base=0;base<this.panels.length;base++){
      const plane=planes[base];if(!plane||used.has(base))continue;
      const basis=planeBasis(plane.normal),origin=position(positions,this.panels[base].vertices[0]);
      const projected=new Map<number,Projection>(),accepted=new Set([base]),incompatible=new Set<number>();
      const projection=(panel:number)=>{
        let result=projected.get(panel);if(!result){result=project(this.panels[panel],positions,this.sourceIndices,basis,origin);projected.set(panel,result);}return result;
      };
      const group=[base];
      for(let i=0;i<group.length;i++)for(const next of nearby(group[i])){
        if(next<base||used.has(next)||accepted.has(next)||incompatible.has(next))continue;
        const other=planes[next]!;
        // Every member is compared to the same lowest-source panel plane.
        // Pairwise near-height chains must never accumulate this tolerance.
        if(Math.hypot(...cross(plane.normal,other.normal))>2e-3||
          this.panels[next].vertices.some(v=>Math.abs(dot(plane.normal,position(positions,v))-plane.offset)>this.tolerance)){
          incompatible.add(next);continue;
        }
        // A failed area comparison is not globally incompatible: the panel
        // can still overlap another member of the same fixed-plane group.
        if(overlaps(projection(group[i]),projection(next),overlapEpsilon)){group.push(next);accepted.add(next);}
      }
      if(group.length<2)continue;
      // Display spacing is adjustable, so a fixed paper-count aesthetic cap
      // must not silently discard a large trustworthy stack. Local cyclic
      // layouts remain bounded by their actual triangle/arrangement budgets.
      group.forEach(panel=>used.add(panel));
      const relations=this.groupRelations(group,positions,plane.normal);
      if(!relations){this.issue='部分重叠纸面缺少可靠的层序关系，未应用整面间距。';return null;}
      const rank=this.groupRanks(group,positions,plane.normal,relations);if(!rank)return null;const ranks=rank(group);
      if(ranks){
        layerCount=Math.max(layerCount,group.length);layerNormals.push([...plane.normal]);
        group.forEach(panel=>adjustments.set(panel,{plane,shift:ranks.get(panel)!*gap}));
      }else{
        const intact=intactSurfaceLayerHeights({positions,sourceIndices:this.sourceIndices,panels:this.panels,group:{panels:group,plane,basis,origin},relations});
        if(intact.status!=='solved'){
          this.issue=intact.reason??(intact.status==='inconclusive'?'未能验证完整纸面的层间距，请调整模型后重试。':'部分重叠纸面的层序关系尚不完整，未应用整面间距。');
          return null;
        }
        layerCount=Math.max(layerCount,intact.layerCount);layerNormals.push([...plane.normal]);
        group.forEach(panel=>adjustments.set(panel,{plane,shift:0,height:intact.heights.get(panel)!}));
      }
    }
    if(!adjustments.size)return null;
    const display=new Float32Array(this.sourceVertices.length*3),gapBasePositions=new Float64Array(display.length),gapDirections=new Float64Array(display.length);
    this.sourceVertices.forEach((source,v)=>{
      const p=position(positions,source),adjustment=adjustments.get(this.displayPanels[v]);
      const distance=adjustment?adjustment.plane.offset-dot(adjustment.plane.normal,p):0;
      for(let axis=0;axis<3;axis++){
        const base=p[axis]+(adjustment?distance*adjustment.plane.normal[axis]:0),direction=adjustment?(adjustment.height?.(p)??adjustment.shift/gap)*adjustment.plane.normal[axis]:0;
        gapBasePositions[v*3+axis]=base;gapDirections[v*3+axis]=direction;display[v*3+axis]=base+direction*gap;
      }
    });
    const result:SimulationSurfaceMesh={positions:display,indices:this.indices,edgesVertices:this.edgesVertices,edgesAssignment:this.edgesAssignment,sourceVertices:this.sourceVertices,layerCount,layerNormals,layerGap:gap,
      gapBasePositions,gapDirections,gapLimit:limit,gapPreserveTopology:true,sourceTriangles:Uint32Array.from({length:this.indices.length/3},(_,f)=>f)};
    result.hingeLayerSpans=this.hinges.flatMap(hinge=>{
      const a=adjustments.get(hinge.panels[0]),b=adjustments.get(hinge.panels[1]);
      if(!a||!b||a.plane!==b.plane||a.height||b.height)return [];
      const layersApart=Math.round(Math.abs(a.shift-b.shift)/gap);
      return layersApart>0?[{edge:hinge.edge,sourceVertices:[...hinge.vertices] as [number,number],layersApart,interveningLayers:layersApart-1,distance:layersApart*gap}]:[];
    });
    if(result.layerCount<2)return null;
    const complete=prepareSimulationSurfaceGapResize(result,positions,this.sourceIndices);
    if(!complete.gapWindingValidated)for(let f=0;f<complete.indices.length;f+=3){
      const shown=triangleNormal(complete.positions,complete.indices[f],complete.indices[f+1],complete.indices[f+2]),source=complete.gapTriangleNormals!;
      if(!shown.every(Number.isFinite)||dot(shown,[source[f],source[f+1],source[f+2]])<=0){
        this.issue='当前间距无法保持完整纸面的有效朝向，请调整间距后重试。';return null;
      }
    }
    return complete;
  }

  /** A unique order is required only for the faces which actually cover this
   * region. Restricting each query to its cover supports valid local cycles. */
  private groupRelations(group:number[],positions:Float32Array,normal:Vector):Array<[number,number]>|null {
    const facePanel=new Map<number,number>(),normals=new Map<number,Vector>();
    for(const p of group)for(const face of this.panels[p].faces){
      const source=this.triangleSourceFaces![face],a=position(positions,this.sourceIndices[face*3]),b=position(positions,this.sourceIndices[face*3+1]),c=position(positions,this.sourceIndices[face*3+2]),raw=cross(minus(b,a),minus(c,a));
      const sum=normals.get(source)??[0,0,0];for(let axis=0;axis<3;axis++)sum[axis]+=raw[axis];normals.set(source,sum);
      const old=facePanel.get(source);if(old!==undefined&&old!==p)return null;facePanel.set(source,p);
    }
    const relations:Array<[number,number]>=[];
    for(const [a,b,sign] of this.layerOrder!.faceOrders){
      const pa=facePanel.get(a),pb=facePanel.get(b);if(pa===undefined||pb===undefined||pa===pb)continue;
      const nb=normals.get(b)!,length=Math.hypot(...nb),alignment=dot(nb,normal)/length;
      if(!Number.isFinite(alignment)||Math.abs(alignment)<.999)return null;
      relations.push(sign*alignment>0?[pb,pa]:[pa,pb]);
    }
    return relations.length?relations:null;
  }

  private groupRanks(group:number[],positions:Float32Array,normal:Vector,knownRelations?:Array<[number,number]>):((cover:number[])=>Map<number,number>|null)|null {
    const relations=knownRelations??this.groupRelations(group,positions,normal);if(!relations)return null;
    return cover=>{
      const present=new Set(cover),out=new Map(cover.map(p=>[p,new Set<number>()])),indegree=new Map(cover.map(p=>[p,0]));
      for(const [a,b] of relations){if(!present.has(a)||!present.has(b)||out.get(a)!.has(b))continue;out.get(a)!.add(b);indegree.set(b,indegree.get(b)!+1);}
      const queue=cover.filter(p=>indegree.get(p)===0),ranks=new Map<number,number>();
      while(queue.length){
        // Two unconstrained faces in the same region have no trusted order.
        if(queue.length!==1)return null;
        const p=queue.pop()!;ranks.set(p,ranks.size);
        for(const next of out.get(p)!){const degree=indegree.get(next)!-1;indegree.set(next,degree);if(!degree)queue.push(next);}
      }
      return ranks.size===cover.length?ranks:null;
    };
  }
}

/** Evaluate a display vertex on the unchanged simulation mesh. */
function sourcePosition(mesh:SimulationSurfaceMesh,positions:Float32Array,v:number,axis:number):number {
  const weights=mesh.sourceVertexWeights?.[v];
  return weights?weights.reduce((sum,[source,weight])=>sum+positions[source*3+axis]*weight,0):positions[mesh.sourceVertices[v]*3+axis];
}

const arrayPosition=(positions:ArrayLike<number>,v:number):Vector=>[positions[v*3],positions[v*3+1],positions[v*3+2]];
const triangleNormal=(positions:ArrayLike<number>,a:number,b:number,c:number):Vector=>cross(minus(arrayPosition(positions,b),arrayPosition(positions,a)),minus(arrayPosition(positions,c),arrayPosition(positions,a)));

/** Bound Float32 winding over the whole supported gap range once. Every
 * ordinary cell has one rank/normal, hence translates rigidly. The quadratic
 * form also covers future cells whose direction varies between vertices.
 * Only source-area-bounded subpixel fragments may be dropped for stability. */
function prepareSimulationSurfaceGapResize(mesh:SimulationSurfaceMesh,solverPositions:Float32Array,sourceIndices:Uint32Array):SimulationSurfaceMesh {
  const bases=mesh.gapBasePositions,directions=mesh.gapDirections,sources=mesh.sourceTriangles,limit=mesh.gapLimit;
  if(!bases||!directions||!sources||limit===undefined)return mesh;
  const sourceNormals=Array.from({length:sourceIndices.length/3},(_,f)=>triangleNormal(solverPositions,sourceIndices[f*3],sourceIndices[f*3+1],sourceIndices[f*3+2]));
  const sourceAreas=sourceNormals.map(n=>Math.hypot(...n)/2),covered=new Float64Array(sourceAreas.length),unsafeAreas=new Float64Array(sourceAreas.length),unsafe=new Uint8Array(mesh.indices.length/3),materialAreas=new Float64Array(sources.length),materialReversed=new Uint8Array(sources.length);
  const rounding=new Float64Array(bases.length);
  for(let i=0;i<bases.length;i++){
    const magnitude=Math.max(Math.abs(bases[i]),Math.abs(bases[i]+directions[i]*limit));
    // One full ULP (rather than half) also covers an exponent-boundary round.
    rounding[i]=2**Math.max(-149,Math.floor(Math.log2(magnitude||Number.MIN_VALUE))-23);
  }
  for(let f=0;f<sources.length;f++){
    const [a,b,c]=Array.from(mesh.indices.slice(f*3,f*3+3)),source=sources[f],raw=sourceNormals[source],length=Math.hypot(...raw),normal=raw.map(n=>n/length) as Vector;
    const material=[a,b,c].flatMap(v=>[0,1,2].map(k=>sourcePosition(mesh,solverPositions,v,k))),area=Math.hypot(...triangleNormal(material,0,1,2))/2;
    covered[source]+=area;materialAreas[f]=area;materialReversed[f]=dot(triangleNormal(material,0,1,2),raw)<0?1:0;
    const ab=minus(arrayPosition(bases,b),arrayPosition(bases,a)),ac=minus(arrayPosition(bases,c),arrayPosition(bases,a)),dab=minus(arrayPosition(directions,b),arrayPosition(directions,a)),dac=minus(arrayPosition(directions,c),arrayPosition(directions,a));
    const q2=dot(cross(dab,dac),normal),q1=dot(cross(dab,ac),normal)+dot(cross(ab,dac),normal),q0=dot(cross(ab,ac),normal),at=(g:number)=>q0+g*(q1+g*q2);
    let minimum=Math.min(at(0),at(limit));const critical=q2>0?-q1/(2*q2):-1;if(critical>0&&critical<limit)minimum=Math.min(minimum,at(critical));
    const errorAB=[0,1,2].map(k=>rounding[a*3+k]+rounding[b*3+k]),errorAC=[0,1,2].map(k=>rounding[a*3+k]+rounding[c*3+k]);
    const acCross=cross(ac,normal),dacCross=cross(dac,normal),abCross=cross(normal,ab),dabCross=cross(normal,dab);
    // Bound the signed source-normal component, not the entire cross-product
    // norm. Rounding perpendicular to a flat paper plane cannot reverse that
    // plane's winding and must not erase a meaningful narrow cell.
    let error=Number.EPSILON*32*(Math.abs(q0)+limit*Math.abs(q1)+limit*limit*Math.abs(q2));
    for(let k=0;k<3;k++){
      error+=errorAB[k]*Math.max(Math.abs(acCross[k]),Math.abs(acCross[k]+limit*dacCross[k]))+errorAC[k]*Math.max(Math.abs(abCross[k]),Math.abs(abCross[k]+limit*dabCross[k]));
      error+=Math.abs(normal[k])*(errorAB[(k+1)%3]*errorAC[(k+2)%3]+errorAB[(k+2)%3]*errorAC[(k+1)%3]);
    }
    if(!Number.isFinite(minimum)||minimum<=error){unsafe[f]=1;unsafeAreas[source]+=area;}
  }
  const mayRemove=sourceAreas.map((area,f)=>!mesh.gapPreserveTopology&&unsafeAreas[f]+Math.max(0,area-covered[f])<=Math.max(1e-12,area*1e-6)),indices:number[]=[],retainedSources:number[]=[],normals:number[]=[],retainedAreas:number[]=[],retainedReversed:number[]=[],retainedCoverage=new Float64Array(sourceAreas.length);
  let removed=false,validated=true;
  for(let f=0;f<sources.length;f++){
    const source=sources[f];if(unsafe[f]&&mayRemove[source]){removed=true;continue;}
    if(unsafe[f])validated=false;
    indices.push(mesh.indices[f*3],mesh.indices[f*3+1],mesh.indices[f*3+2]);retainedSources.push(source);normals.push(...sourceNormals[source]);retainedAreas.push(materialAreas[f]);retainedReversed.push(materialReversed[f]);retainedCoverage[source]+=materialAreas[f];
  }
  return {...mesh,indices:removed?Uint32Array.from(indices):mesh.indices,sourceTriangles:removed?Uint32Array.from(retainedSources):sources,gapTriangleNormals:Float64Array.from(normals),gapWindingValidated:validated,
    gapSliverRepair:mesh.gapAllowSliverRepair&&!mesh.gapPreserveTopology?{triangleAreas:Float64Array.from(retainedAreas),triangleReversed:Uint8Array.from(retainedReversed),sourceAreas:Float64Array.from(sourceAreas),missingAreas:Float64Array.from(sourceAreas,(area,f)=>Math.max(0,area-retainedCoverage[f]))}:undefined};
}

/** Resize an already solved display layout without recomputing overlap cells
 * or material weights. An explicit wide domain permits source-area-bounded
 * Float32 sliver winding correction; meaningful changes reject atomically.
 * Callers keep their last valid display mesh instead of rebuilding arrangement.
 */
export function resizeSimulationSurfaceGap(mesh:SimulationSurfaceMesh,gap:number):SimulationSurfaceMesh|null {
  const bases=mesh.gapBasePositions,directions=mesh.gapDirections,normals=mesh.gapTriangleNormals;
  if(!Number.isFinite(gap)||gap<=0||!bases||!directions||bases.length!==mesh.positions.length||directions.length!==bases.length||!normals||normals.length!==mesh.indices.length||gap>(mesh.gapLimit??mesh.layerGap))return null;
  if(gap===mesh.layerGap)return mesh;
  const positions=new Float32Array(bases.length);
  for(let i=0;i<positions.length;i++)positions[i]=bases[i]+gap*directions[i];
  let indices=mesh.indices,sourceTriangles=mesh.sourceTriangles,gapTriangleNormals=normals,gapSliverRepair=mesh.gapSliverRepair;
  if(!mesh.gapWindingValidated){
    const invalid=new Map<number,number>(),repair=mesh.gapSliverRepair,affected=repair?new Float64Array(repair.sourceAreas.length):null;
    for(let f=0;f<mesh.indices.length;f+=3){
      const normal=triangleNormal(positions,mesh.indices[f],mesh.indices[f+1],mesh.indices[f+2]),alignment=dot(normal,[normals[f],normals[f+1],normals[f+2]]);
      if(!normal.every(Number.isFinite)||!Number.isFinite(alignment))return null;
      if(alignment>0){if(repair&&sourceTriangles&&affected&&repair.triangleReversed[f/3])affected[sourceTriangles[f/3]]+=repair.triangleAreas[f/3];continue;}
      if(mesh.gapPreserveTopology||!repair||!sourceTriangles||!affected)return null;
      invalid.set(f/3,alignment);if(alignment===0||!repair.triangleReversed[f/3])affected[sourceTriangles[f/3]]+=repair.triangleAreas[f/3];
    }
    if(invalid.size){
      if(!repair||!sourceTriangles||!affected||affected.some((area,f)=>area+repair.missingAreas[f]>Math.max(1e-12,repair.sourceAreas[f]*1e-6)))return null;
      const keptIndices:number[]=[],keptSources:number[]=[],keptNormals:number[]=[],keptAreas:number[]=[],keptReversed:number[]=[],missingAreas=repair.missingAreas.slice();
      for(let f=0;f<mesh.indices.length/3;f++){
        const alignment=invalid.get(f),source=sourceTriangles[f];
        if(alignment===0){missingAreas[source]+=repair.triangleAreas[f];continue;}
        const offset=f*3;keptIndices.push(mesh.indices[offset],mesh.indices[offset+(alignment!==undefined?2:1)],mesh.indices[offset+(alignment!==undefined?1:2)]);
        keptSources.push(source);keptNormals.push(normals[offset],normals[offset+1],normals[offset+2]);keptAreas.push(repair.triangleAreas[f]);keptReversed.push(repair.triangleReversed[f]^(alignment!==undefined?1:0));
      }
      indices=Uint32Array.from(keptIndices);sourceTriangles=Uint32Array.from(keptSources);gapTriangleNormals=Float64Array.from(keptNormals);
      gapSliverRepair={...repair,triangleAreas:Float64Array.from(keptAreas),triangleReversed:Uint8Array.from(keptReversed),missingAreas};
    }
  }
  return {...mesh,positions,indices,sourceTriangles,gapTriangleNormals,gapSliverRepair,layerGap:gap,hingeLayerSpans:mesh.hingeLayerSpans?.map(span=>({...span,distance:span.layersApart*gap}))};
}

/** Animate the display offset without rebuilding local overlap subdivisions. */
export function blendSimulationSurface(mesh:SimulationSurfaceMesh,solverPositions:Float32Array,blend:number):SimulationSurfaceMesh {
  const amount=Number.isFinite(blend)?Math.max(0,Math.min(1,blend)):0;if(amount===1)return mesh;
  const positions=new Float32Array(mesh.positions.length);
  for(let v=0;v<mesh.sourceVertices.length;v++)for(let axis=0;axis<3;axis++){
    const base=sourcePosition(mesh,solverPositions,v,axis);positions[v*3+axis]=base+(mesh.positions[v*3+axis]-base)*amount;
  }
  return {...mesh,positions};
}

/** Preserve strain colouring when a display cell introduces barycentric points. */
export function simulationSurfaceStrain(mesh:SimulationSurfaceMesh,sourceStrain:Float32Array):Float32Array {
  return Float32Array.from(mesh.sourceVertices,(source,v)=>mesh.sourceVertexWeights?.[v]?.reduce((sum,[original,weight])=>sum+sourceStrain[original]*weight,0)??sourceStrain[source]);
}

/** A shared plane may correct the depth across a screen-width crease ribbon
 * only when all material triangles (including untouched panels) are parallel.
 * Check the original triangles, not the tiny display subdivision fragments. */
export function simulationCreasePlaneNormal(positions:Float32Array,indices:Uint32Array,layerNormals:readonly Vector[]):Vector|undefined {
  const normal=layerNormals[0]&&canonical(layerNormals[0]);if(!normal)return undefined;
  const parallel=(raw:Vector)=>{
    const length=Math.hypot(...raw);if(!Number.isFinite(length))return false;
    if(length===0)return true;
    return Math.hypot(...cross(normal,raw))/length<=2e-3;
  };
  if(layerNormals.some(n=>!parallel(n)))return undefined;
  for(let i=0;i<indices.length;i+=3){
    const a=position(positions,indices[i]),b=position(positions,indices[i+1]),c=position(positions,indices[i+2]);
    if(!parallel(cross(minus(b,a),minus(c,a))))return undefined;
  }
  return normal;
}
