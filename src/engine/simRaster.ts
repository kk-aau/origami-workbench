import {toViewSpace,projectViewPoint,type CameraUniforms} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera';
import {edgeAssignmentCode,edgeAssignmentVisible,edgeAssignmentColor,edgeAssignmentDash,normalDirectionColor,diagramPaperColor,diagramEdgeColor,diagramEdgeFolded,meshTopologyFor,type MeshTopology,type RenderSettings} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';
import {strainInk} from './simDisplay';
import {creasePlaneInverseDepthGradient} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/creasePlaneDepth';

/** Trusted material-face relations for this exact pose (not a paint order).
 * A relation uses FOLD semantics: its sign is relative to the second face's
 * material normal. Only numerically coincident triangles or roundoff-equal
 * depth samples can use it; separated samples retain physical depth. */
export interface SimulationRasterLayerOrder {
  triangleSourceFaces:readonly number[];
  faceOrders:readonly (readonly [number,number,number])[];
}

type Vector=[number,number,number];
type RasterPlane={vertices:Vector[];errors:Vector[];normal:Vector;normalError:Vector};
const subtract=(a:Vector,b:Vector):Vector=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const vectorCross=(a:Vector,b:Vector):Vector=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const vectorDot=(a:Vector,b:Vector)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
/** A solver coordinate was rounded once to Float32. Its uncertainty is local
 * to that coordinate, including the subnormal range. A separate edge-scaled
 * term below accounts for the preceding double-precision rigid transform;
 * cancellation near the origin must not make that uncertainty disappear. */
const coordinateError=(value:number)=>2**Math.max(-150,Math.floor(Math.log2(Math.abs(value)||2**-149))-24);

function rasterLayerComparison(positions:Float32Array,indices:Uint32Array,camera:CameraUniforms,order:SimulationRasterLayerOrder|undefined):((face:number,owner:number,equalDepth:boolean)=>number)|null {
  if(!order||order.triangleSourceFaces.length!==indices.length/3||!order.faceOrders.length)return null;
  const relations=new Map<number,Map<number,{a:number;b:number;sign:number}>>();
  for(const [a,b,sign] of order.faceOrders){
    if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<0||b<0||a===b||(sign!==1&&sign!==-1))continue;
    const relation={a,b,sign};
    for(const [left,right] of [[a,b],[b,a]]){const rows=relations.get(left)??new Map();rows.set(right,relation);relations.set(left,rows);}
  }
  if(!relations.size)return null;
  const planes=new Map<number,RasterPlane>(),cache=new Map<number,Map<number,{coplanar:number;contact:number}>>();
  const plane=(face:number):RasterPlane=>{
    const old=planes.get(face);if(old)return old;
    const vertices=Array.from({length:3},(_,i)=>Array.from(positions.slice(indices[face*3+i]*3,indices[face*3+i]*3+3)) as Vector);
    const u=subtract(vertices[1],vertices[0]),v=subtract(vertices[2],vertices[0]);
    // A rigid transform can cancel an O(edge-length) coordinate down to 1e-15
    // before the final Float32 conversion. Its last rounding alone would then
    // suggest an impossible 1e-22 accuracy and reject a retained paper stack.
    // Bound those earlier double operations in this triangle's own units;
    // neither the scene size nor another remote sheet changes the tolerance.
    const transformError=Math.max(Math.hypot(...u),Math.hypot(...v),Math.hypot(...subtract(vertices[2],vertices[1])))*Number.EPSILON*64;
    const errors=vertices.map(p=>p.map(n=>coordinateError(n)+transformError) as Vector);
    const du=errors[1].map((e,k)=>e+errors[0][k]),dv=errors[2].map((e,k)=>e+errors[0][k]);
    const normal=vectorCross(u,v),normalError=[0,1,2].map(k=>{
      const j=(k+1)%3,l=(k+2)%3;
      return Math.abs(u[j])*dv[l]+Math.abs(v[l])*du[j]+du[j]*dv[l]+Math.abs(u[l])*dv[j]+Math.abs(v[j])*du[l]+du[l]*dv[j];
    }) as Vector;
    const result={vertices,errors,normal,normalError};planes.set(face,result);return result;
  };
  const liesOn=(points:RasterPlane,reference:RasterPlane)=>points.vertices.every((p,i)=>{
    const w=subtract(p,reference.vertices[0]),dw=points.errors[i].map((e,k)=>e+reference.errors[0][k]);
    let uncertainty=0,roundoff=0;
    for(let k=0;k<3;k++){
      uncertainty+=Math.abs(reference.normal[k])*dw[k]+Math.abs(w[k])*reference.normalError[k]+dw[k]*reference.normalError[k];
      roundoff+=Math.abs(reference.normal[k]*w[k]);
    }
    return Math.abs(vectorDot(reference.normal,w))<=uncertainty+roundoff*Number.EPSILON*32;
  });
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
      if(Math.hypot(...current.normal)>Math.hypot(...current.normalError)*100&&Math.hypot(...previous.normal)>Math.hypot(...previous.normalError)*100){
        const second=a===relation.b?current:previous;
        const facing=vectorDot(second.normal,subtract(eye,second.vertices[0]));
        const side=facing!==0?(relation.sign*facing>0?1:-1)*(a===relation.a?1:-1):0;
        if(liesOn(current,previous)&&liesOn(previous,current))comparison=side;
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

  render(positions:Float32Array,model:Parameters<typeof meshTopologyFor>[0],camera:CameraUniforms,settings:RenderSettings,strain?:Float32Array,layerOrder?:SimulationRasterLayerOrder,boundaryWidthPx?:number):Uint8ClampedArray {
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
      for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
        const px=x+.5,py=y+.5;
        const wb=((px-ax)*(cy-ay)-(py-ay)*(cx-ax))/area;
        const wc=((bx-ax)*(py-ay)-(by-ay)*(px-ax))/area,wa=1-wb-wc;
        if(wa<-1e-8||wb<-1e-8||wc<-1e-8)continue;
        const q=wa*inverse[a]+wb*inverse[b]+wc*inverse[c],pixel=y*width+x;
        const distance=1/q;
        if(distance<camera.camDist-camera.depthRange||distance>camera.camDist+camera.depthRange)continue;
        if(settings.faceAlpha<1){paint(pixel,color,settings.faceAlpha);continue;}
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
        if(layer<0||layer===0&&stableDepth<=depth[pixel])continue;
        depth[pixel]=stableDepth;this.owner[pixel]=face;paint(pixel,color);
      }
    }
    let topology:MeshTopology|undefined;
    if(settings.diagramStyle){
      topology=this.diagramTopologies.get(model);
      if(!topology){topology=meshTopologyFor(model);this.diagramTopologies.set(model,topology);}
    }
    if(settings.showEdges)model.edgesVertices.forEach(([a,b],edge)=>{
      const assignment=model.edgesAssignment[edge];
      const code=edgeAssignmentCode(assignment);
      if(!edgeAssignmentVisible(code,settings))return;
      if(topology&&topology.edgeMaterial?.[edge]!==1)return;
      const ax=screen[a*2],ay=screen[a*2+1],bx=screen[b*2],by=screen[b*2+1],dx=bx-ax,dy=by-ay,length=Math.hypot(dx,dy);
      if(!Number.isFinite(length)||length<1e-8)return;
      const half=(assignment==='B'&&boundaryWidthPx!==undefined?boundaryWidthPx:settings.creaseWidthPx??1.6)/2;
      const color=(topology?diagramEdgeColor(code===0||diagramEdgeFolded(positions,a,b,topology.edgeOpposites![edge*2],topology.edgeOpposites![edge*2+1]),settings):edgeAssignmentColor(code,settings)).map(value=>value*255);
      const dash=edgeAssignmentDash(code,settings);
      const period=dash?.reduce((sum,run)=>sum+run,0)??0;
      const minX=Math.max(0,Math.floor(Math.min(ax,bx)-half)),maxX=Math.min(width-1,Math.ceil(Math.max(ax,bx)+half));
      const minY=Math.max(0,Math.floor(Math.min(ay,by)-half)),maxY=Math.min(height-1,Math.ceil(Math.max(ay,by)+half));
      // Same NDC tolerance as the GPU crease pass, converted to inverse distance.
      const bias=(settings.creaseDepthBias??.000002)*camera.depthRange/(camera.camDist**2-camera.depthRange**2);
      const gradient=creasePlaneInverseDepthGradient(settings.creasePlaneNormal,camera,[points[a*3],points[a*3+1],points[a*3+2]]);
      for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
        const t=((x+.5-ax)*dx+(y+.5-ay)*dy)/(length*length);
        if(t<0||t>1||Math.hypot(x+.5-ax-t*dx,y+.5-ay-t*dy)>half)continue;
        if(dash&&period>0){let along=t*length%period,run=0;while(run<dash.length-1&&along>=dash[run])along-=dash[run++];if(run%2===1)continue;}
        const offsetX=x+.5-ax-t*dx,offsetY=y+.5-ay-t*dy;
        const q=inverse[a]*(1-t)+inverse[b]*t+(gradient?gradient[0]*offsetX+gradient[1]*offsetY:0),pixel=y*width+x;
        const distance=1/q;
        if(distance<camera.camDist-camera.depthRange||distance>camera.camDist+camera.depthRange)continue;
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

