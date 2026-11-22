import {trianglePlaneLookup,reliablePlane,sameTrianglePlane,type Vector,subtract,vectorDot} from './simTrianglePlane';
import {toViewSpace,projectViewPoint,type CameraUniforms} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import {cameraEdgeAssignment,edgeAssignmentCode,edgeAssignmentVisible,edgeAssignmentColor,edgeAssignmentDash,normalDirectionColor,diagramPaperColor,diagramEdgeColor,diagramEdgeFolded,meshTopologyFor,type MeshTopology,type RenderSettings} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';
import {strainInk} from './simDisplay';
import {creasePlaneInverseDepthGradient} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/creasePlaneDepth';

/** Trusted material-face relations for this exact pose (not a paint order).
 * A relation uses FOLD semantics: its sign is relative to the second face's
 * material normal. Only numerically coincident triangles or roundoff-equal
 * depth samples can use it; separated samples retain physical depth. */
export interface SimulationRasterLayerOrder {
  rigidContact?:(face:number,other:number)=>boolean;
  triangleSourceFaces:readonly number[];
  faceOrders:readonly (readonly [number,number,number])[];
}

// A Float32 coordinate is an integer multiple of 2^-149. Using that common
// unit gives exact plane membership for the stored mesh, even for two
// different triangulations. No coordinate or distance tolerance is involved.
function exactRasterPlaneLookup(positions:Float32Array,indices:Uint32Array){
  type Point=[bigint,bigint,bigint];
  type Plane=[bigint,bigint,bigint,bigint];
  const vertices=new Map<number,Point>(),planes=new Map<number,Plane>();
  function point(i:number):Point{
    let p=vertices.get(i);
    if(!p){
      const unit=2**149;
      p=[BigInt(positions[i*3]*unit),BigInt(positions[i*3+1]*unit),BigInt(positions[i*3+2]*unit)];
      vertices.set(i,p);
    }
    return p;
  }
  return (face:number,other:number)=>{
    let plane=planes.get(face);
    if(!plane){
      const a=point(indices[3*face]),b=point(indices[3*face+1]),c=point(indices[3*face+2]);
      const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
      const x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx;
      plane=[x,y,z,x*a[0]+y*a[1]+z*a[2]];
      planes.set(face,plane);
    }
    const [x,y,z,d]=plane;
    if(x===0n&&y===0n&&z===0n)return false;
    for(let corner=0;corner<3;corner++){
      const p=point(indices[3*other+corner]);
      if(x*p[0]+y*p[1]+z*p[2]!==d)return false;
    }
    return true;
  };
}

export function rasterLayerComparison(positions:Float32Array,indices:Uint32Array,camera:CameraUniforms,order:SimulationRasterLayerOrder|undefined):((face:number,owner:number,equalDepth:boolean)=>number)|null {
  if(!order||order.triangleSourceFaces.length!==indices.length/3||!order.faceOrders.length)return null;
  const relations=new Map<number,Map<number,{a:number;b:number;sign:number}>>();
  for(const [a,b,sign] of order.faceOrders){
    if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<0||b<0||a===b||(sign!==1&&sign!==-1))continue;
    const relation={a,b,sign};
    for(const [left,right] of [[a,b],[b,a]]){const rows=relations.get(left)??new Map();rows.set(right,relation);relations.set(left,rows);}
  }
  if(!relations.size)return null;
  const cache=new Map<number,Map<number,{coplanar:number;contact:number}>>();
  const plane=trianglePlaneLookup(positions,indices);
  const eye=camera.center.map((n,k)=>n+camera.camDist*camera.rotation[k+6]) as Vector;
  return (face,owner,equalDepth)=>{
    let known=cache.get(face);if(!known){known=new Map();cache.set(face,known);}
    const old=known.get(owner);if(old!==undefined)return old.coplanar||(equalDepth?old.contact:0);
    let comparison=0,contact=0;
    const a=order.triangleSourceFaces[face],b=order.triangleSourceFaces[owner],relation=relations.get(a)?.get(b);
    if(relation){
      const current=plane(face),previous=plane(owner);
      // Both complete triangles must share a plane within their own Float32
      // uncertainty. Crossing triangles and real micro-gaps retain depth order.
      if(reliablePlane(current)&&reliablePlane(previous)){
        const second=a===relation.b?current:previous;
        const facing=vectorDot(second.normal,subtract(eye,second.vertices[0]));
        const side=facing!==0?(relation.sign*facing>0?1:-1)*(a===relation.a?1:-1):0;
        if(sameTrianglePlane(current,previous)||order.rigidContact?.(face,owner))comparison=side;
        contact=side;
      }
    }
    known.set(owner,{coplanar:comparison,contact});return comparison||(equalDepth?contact:0);
  };
}

/** Software depth buffer for devices which cannot run the GPU solver. */
export class SimulationRasterizer {
  private width=0;
  private height=0;
  private pixels=new Uint8ClampedArray();
  private depth=new Float64Array();
  private owner=new Int32Array();
  private diagramTopologies=new WeakMap<object,MeshTopology>();

  render(positions:Float32Array,model:Parameters<typeof meshTopologyFor>[0],camera:CameraUniforms,settings:RenderSettings,strain?:Float32Array,layerOrder?:SimulationRasterLayerOrder,boundaryWidthPx?:number,displayAssignments?:Parameters<typeof meshTopologyFor>[0]['edgesAssignment'],coloredEdges?:ReadonlySet<number>):Uint8ClampedArray {
    const {width,height}=camera;
    if(width!==this.width||height!==this.height){
      this.width=width;this.height=height;
      this.pixels=new Uint8ClampedArray(width*height*4);this.depth=new Float64Array(width*height);this.owner=new Int32Array(width*height);
    }
    const pixels=this.pixels,depth=this.depth;
    const background=settings.background.map(value=>Math.round(value*255));
    for(let i=0;i<pixels.length;i+=4){pixels[i]=background[0];pixels[i+1]=background[1];pixels[i+2]=background[2];pixels[i+3]=255;}
    depth.fill(-Infinity);
    this.owner.fill(-1);
    const compareLayers=settings.faceAlpha===1?rasterLayerComparison(positions,model.indices,camera,layerOrder):null;
    const exactlyCoplanar=exactRasterPlaneLookup(positions,model.indices);
    // Keep depth comparisons transitive: round away three low mantissa bits
    // at the nearest visible depth. A pairwise epsilon creates inconsistent
    // ties (A≈B, B≈C, A≠C) and makes contact colours depend on draw order.
    // This tracks double precision and camera scale, not a fixed model gap.
    const depthStep=2**(Math.floor(Math.log2(1/Math.max(camera.camDist-camera.depthRange,.001)))-49);
    // Keep this software depth path in double precision. Rounding projected
    // screen/view coordinates to Float32 makes two coplanar sheets interpolate
    // different depths when they use different triangulations.
    const count=Math.floor(positions.length/3),points=new Float64Array(count*3),screen=new Float64Array(count*2),inverse=new Float64Array(count);
    for(let vertex=0;vertex<count;vertex++){
      const point=toViewSpace(positions[vertex*3],positions[vertex*3+1],positions[vertex*3+2],camera),pixel=projectViewPoint(point,camera);
      points.set(point,vertex*3);screen.set(pixel,vertex*2);
      // Inverse eye distance is linear across a projected triangle. View z is not.
      inverse[vertex]=1/Math.max(camera.camDist-point[2],.001);
    }
    const faces=Array.from({length:model.indices.length/3},(_,i)=>i);
    if(settings.faceAlpha<1)faces.sort((a,b)=>{
      const mean=(f:number)=>[0,1,2].reduce((sum,c)=>sum+points[model.indices[f*3+c]*3+2],0);
      return mean(a)-mean(b);
    });
    const paint=(pixel:number,color:number[],alpha=1)=>{
      const offset=pixel*4;
      for(let c=0;c<3;c++)pixels[offset+c]=pixels[offset+c]*(1-alpha)+color[c]*alpha;
    };
    if(settings.showFaces)for(const face of faces){
      const a=model.indices[face*3],b=model.indices[face*3+1],c=model.indices[face*3+2];
      const ax=screen[a*2],ay=screen[a*2+1],bx=screen[b*2],by=screen[b*2+1],cx=screen[c*2],cy=screen[c*2+1];
      const area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
      if(!Number.isFinite(area)||Math.abs(area)<1e-8)continue;
      const minX=Math.max(0,Math.floor(Math.min(ax,bx,cx))),maxX=Math.min(width-1,Math.ceil(Math.max(ax,bx,cx)));
      const minY=Math.max(0,Math.floor(Math.min(ay,by,cy))),maxY=Math.min(height-1,Math.ceil(Math.max(ay,by,cy)));
      const print=settings.colorMode!=='strain'&&settings.colorMode!=='normals'?settings.paperPrint:undefined;
      const image=area>0?print?.front:print?.back;
      let color=(area>0?settings.backColor:settings.frontColor).map(value=>value*255);
      if(settings.colorMode==='normals'){
        const u=[0,1,2].map(axis=>points[b*3+axis]-points[a*3+axis]),v=[0,1,2].map(axis=>points[c*3+axis]-points[a*3+axis]);
        color=normalDirectionColor([u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]).map(value=>value*255);
      }
      else if(strain){const ink=strainInk((strain[a]+strain[b]+strain[c])/3,settings.strainClip??5);color=ink.match(/[\d.]+/g)!.map(Number);}
      else if(settings.lighting){
        const u=[0,1,2].map(axis=>points[b*3+axis]-points[a*3+axis]),v=[0,1,2].map(axis=>points[c*3+axis]-points[a*3+axis]);
        const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
        const nLength=Math.hypot(...normal),lLength=Math.hypot(...settings.lightDir),sign=normal[2]<0?-1:1;
        const diffuse=Math.max(0,normal.reduce((sum,n,axis)=>sum+n*sign*settings.lightDir[axis],0)/(nLength*lLength));
        const shade=Math.max(.68,Math.min(1.08,.74+diffuse*.3+Math.abs(normal[2])/nLength*.04));
        color=settings.diagramStyle?diagramPaperColor(color.map(v=>v/255),normal).map(v=>v*255):color.map(value=>value*shade);
      }
      // Interpolate in material coordinates with perspective correction. The
      // physical back is mirrored so a print reads normally from that side.
      const tinted=[0,0,0];
      const base=area>0?settings.backColor:settings.frontColor;
      const light=image?color.map((v,k)=>base[k]>0?v/(255*base[k]):1):undefined;
      let coplanarOwners:Map<number,boolean>|undefined;
      for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
        const px=x+.5,py=y+.5;
        const wb=((px-ax)*(cy-ay)-(py-ay)*(cx-ax))/area;
        const wc=((bx-ax)*(py-ay)-(by-ay)*(px-ax))/area,wa=1-wb-wc;
        if(wa<-1e-8||wb<-1e-8||wc<-1e-8)continue;
        const q=wa*inverse[a]+wb*inverse[b]+wc*inverse[c],pixel=y*width+x;
        const distance=1/q;
        if(distance<camera.camDist-camera.depthRange||distance>camera.camDist+camera.depthRange)continue;
        const transparent=settings.faceAlpha<1;
        // Trusted coincident material layers outrank topology IDs. Without a
        // certified relation (or at a real separation), retain physical depth.
        // A fixed depth epsilon discards real small separations (for example,
        // a saved 179.99999999996-degree fold) and makes the first triangle win.
        // Remove only low-bit noise in the inverse-depth interpolation (three
        // weighted terms and their sum), instead of imposing a world-space gap.
        // At a roundoff-equal sample, an existing relation resolves a shared
        // edge/contact without widening the whole-plane coplanarity tolerance.
        const stableDepth=Math.round(q/depthStep)*depthStep;
        const layer=compareLayers&&this.owner[pixel]>=0?compareLayers(face,this.owner[pixel],stableDepth===depth[pixel]):0;
        if(!transparent&&(layer<0||layer===0&&stableDepth<=depth[pixel]))continue;
        // Even double interpolation can land on opposite sides of a rounding
        // bin. Keep the existing material on an exact geometric tie without
        // overriding a certified contact or swallowing a real depth gap.
        const owner=this.owner[pixel];
        if(!transparent&&layer===0&&owner>=0){
          coplanarOwners??=new Map();
          let same=coplanarOwners.get(owner);
          if(same===undefined){same=exactlyCoplanar(face,owner);coplanarOwners.set(owner,same);}
          if(same)continue;
        }
        if(!transparent){depth[pixel]=stableDepth;this.owner[pixel]=face;}
        if(image&&print&&light){
          const uv=print.uv,fa=wa*inverse[a]/q,fb=wb*inverse[b]/q,fc=wc*inverse[c]/q;
          const u=uv[a*2]*fa+uv[b*2]*fb+uv[c*2]*fc,v=uv[a*2+1]*fa+uv[b*2+1]*fb+uv[c*2+1]*fc;
          const ix=Math.max(0,Math.min(image.width-1,(area>0?u:1-u)*image.width-.5)),iy=Math.max(0,Math.min(image.height-1,v*image.height-.5));
          const x0=Math.floor(ix),y0=Math.floor(iy),dx=ix-x0,dy=iy-y0,x1=Math.min(x0+1,image.width-1),y1=Math.min(y0+1,image.height-1);
          for(let k=0;k<3;k++)tinted[k]=color[k];
          for(let j=0;j<4;j++){
            const off=4*((j>=2?y1:y0)*image.width+(j%2?x1:x0)),w=(j%2?dx:1-dx)*(j>=2?dy:1-dy)*image.data[off+3]/255;
            for(let k=0;k<3;k++)tinted[k]+=w*(image.data[off+k]*light[k]-color[k]);
          }
          paint(pixel,tinted,settings.faceAlpha);
        }else paint(pixel,color,settings.faceAlpha);
      }
    }
    let creaseTopology=this.diagramTopologies.get(model);
    if(!creaseTopology){creaseTopology=meshTopologyFor(model);this.diagramTopologies.set(model,creaseTopology);}
    const topology=settings.diagramStyle?creaseTopology:undefined;
    const eye=camera.center.map((value,k)=>value+camera.camDist*camera.rotation[k+6]);
    if(settings.showEdges)model.edgesVertices.forEach(([a,b],edge)=>{
      const assignment=(displayAssignments??model.edgesAssignment)[edge];
      const code=cameraEdgeAssignment(edgeAssignmentCode(assignment),creaseTopology,edge,positions,eye);
      if(!edgeAssignmentVisible(code,settings))return;
      if(topology&&topology.edgeMaterial?.[edge]!==1)return;
      const ax=screen[a*2],ay=screen[a*2+1],bx=screen[b*2],by=screen[b*2+1],dx=bx-ax,dy=by-ay,length=Math.hypot(dx,dy);
      if(!Number.isFinite(length)||length<1e-8)return;
      const half=(assignment==='B'&&boundaryWidthPx!==undefined?boundaryWidthPx:settings.creaseWidthPx??1.6)/2;
      const neutral=coloredEdges!==undefined&&!coloredEdges.has(edge)&&(code===1||code===2);
      const color=(neutral?settings.borderColor:topology?diagramEdgeColor(code===0||diagramEdgeFolded(positions,a,b,topology.edgeOpposites![edge*2],topology.edgeOpposites![edge*2+1]),settings):edgeAssignmentColor(code,settings)).map(value=>value*255);
      const dash=neutral?null:edgeAssignmentDash(code,settings);
      const period=dash?.reduce((sum,run)=>sum+run,0)??0;
      const minX=Math.max(0,Math.floor(Math.min(ax,bx)-half)),maxX=Math.min(width-1,Math.ceil(Math.max(ax,bx)+half));
      const minY=Math.max(0,Math.floor(Math.min(ay,by)-half)),maxY=Math.min(height-1,Math.ceil(Math.max(ay,by)+half));
      // Same NDC tolerance as the GPU crease pass, converted to inverse distance.
      const bias=(settings.creaseDepthBias??.000002)*camera.depthRange/(camera.camDist**2-camera.depthRange**2);
      const gradient=creasePlaneInverseDepthGradient(settings.creasePlaneNormal,camera,[points[a*3],points[a*3+1],points[a*3+2]]);
      // A closed fold can give an interior hinge the outline style. Its ink
      // still belongs to its incident paper, including at zero depth gap.
      const incident=model.edgesFaces?.[edge];
      let occludedOwners:Map<number,boolean>|undefined;
      for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
        const t=((x+.5-ax)*dx+(y+.5-ay)*dy)/(length*length);
        if(t<0||t>1||Math.hypot(x+.5-ax-t*dx,y+.5-ay-t*dy)>half)continue;
        if(dash&&period>0){let along=t*length%period,run=0;while(run<dash.length-1&&along>=dash[run])along-=dash[run++];if(run%2===1)continue;}
        const offsetX=x+.5-ax-t*dx,offsetY=y+.5-ay-t*dy;
        const q=inverse[a]*(1-t)+inverse[b]*t+(gradient?gradient[0]*offsetX+gradient[1]*offsetY:0),pixel=y*width+x;
        const distance=1/q;
        if(distance<camera.camDist-camera.depthRange||distance>camera.camDist+camera.depthRange)continue;
        const visibleFace=this.owner[pixel];
        if(compareLayers&&incident?.length&&visibleFace>=0){
          occludedOwners??=new Map();
          let hidden=occludedOwners.get(visibleFace);
          if(hidden===undefined){
            hidden=incident.every(face=>compareLayers(face,visibleFace,false)<0);
            occludedOwners.set(visibleFace,hidden);
          }
          if(hidden)continue;
        }
        if(settings.faceAlpha===1&&settings.showFaces&&q+bias<depth[pixel]){
          // A wide material stroke lies on its incident triangles. Testing all
          // of its pixels at the centreline's depth makes a sloping owner face
          // erase alternating parts of that stroke. Only that exact mesh owner
          // may keep its line; unrelated overlapping sheets still occlude it.
          const owner=this.owner[pixel]*3;
          const ownsLine=!!topology&&owner>=0&&
            (model.indices[owner]===a||model.indices[owner+1]===a||model.indices[owner+2]===a)&&
            (model.indices[owner]===b||model.indices[owner+1]===b||model.indices[owner+2]===b);
          if(!ownsLine)continue;
        }
        paint(pixel,color);
      }
    });
    return pixels;
  }
}

