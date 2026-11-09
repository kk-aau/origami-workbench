export type Point2=readonly [number,number];

export type PolygonTwistProperties={
  numSides:number;
  centralVertices:[number,number][];
  twistAngles:number[];
  centralPolygonSides:number[];
  centralPolygonAngles:number[];
  centralPolygonAnglesExcess:number[];
};

const sub=(a:Point2,b:Point2):[number,number]=>[a[0]-b[0],a[1]-b[1]];
const cross=(a:Point2,b:Point2)=>a[0]*b[1]-a[1]*b[0];
const dot=(a:Point2,b:Point2)=>a[0]*b[0]+a[1]*b[1];
const addScaled=(p:Point2,v:Point2,t:number):[number,number]=>[p[0]+t*v[0],p[1]+t*v[1]];
const degreesPerRadian=180/Math.PI;

/** Reconstructs the five Origamica polygon-twist property queries from a tile.
 * The source's TGraphAssigned order is [outer vertex, pleat entry, pleat exit,
 * central vertex] for each edge. See notebook lines 212258–212327 and
 * 212845–213489. Angles are degrees; side lengths use outer-vertex units.
 */
export function polygonTwistProperties(
  vertices:readonly Point2[],width:number,offset:number,pleatAngle:number
):PolygonTwistProperties|null{
  const n=vertices.length;
  if(n<3||n>24||vertices.some(p=>p.length!==2||p.some(v=>!Number.isFinite(v)))||
    !Number.isFinite(width)||width<=0||width>=1||!Number.isFinite(offset)||
    Math.abs(offset)+width/2>=.5||!Number.isFinite(pleatAngle)||
    pleatAngle<=0||pleatAngle>=180)return null;
  // All predicates below describe shape, not the units used for its vertices.
  // Work in a local unit-scale frame so a valid small tile cannot be rejected
  // by absolute area, determinant, or side-length thresholds.
  const origin=vertices[0];
  const scale=Math.max(...vertices.map(p=>Math.hypot(p[0]-origin[0],p[1]-origin[1])));
  if(!Number.isFinite(scale)||scale===0)return null;
  const points=vertices.map((p):Point2=>[(p[0]-origin[0])/scale,(p[1]-origin[1])/scale]);
  const signedArea=points.reduce((sum,p,i)=>sum+cross(p,points[(i+1)%n]),0);
  if(Math.abs(signedArea)<1e-12)return null;
  const outer=signedArea>0?[...points]:[points[0],...points.slice(1).reverse()];
  const edges=outer.map((p,i)=>sub(outer[(i+1)%n],p));
  if(edges.some(e=>dot(e,e)<1e-16))return null;
  for(let i=0;i<n;i++)for(let j=0;j<n;j++)if(cross(edges[i],sub(outer[j],outer[i]))<-1e-10)return null;
  const theta=pleatAngle/degreesPerRadian,c=Math.cos(theta),s=Math.sin(theta);
  const directions=edges.map(([x,y]):[number,number]=>[x*c-y*s,x*s+y*c]);
  const entry=edges.map((edge,i)=>addScaled(outer[i],edge,(1-width)/2+offset));
  const exit=edges.map((edge,i)=>addScaled(outer[i],edge,(1+width)/2+offset));
  const centralVertices:[number,number][]=[];
  for(let i=0;i<n;i++){
    const j=(i+n-1)%n,denominator=cross(directions[i],directions[j]);
    if(Math.abs(denominator)<1e-12)return null;
    const delta=sub(exit[j],entry[i]);
    const forward=cross(delta,directions[j])/denominator;
    const previous=cross(delta,directions[i])/denominator;
    if(forward<=1e-10||previous<=1e-10)return null;
    const point=addScaled(entry[i],directions[i],forward);
    if(point.some(v=>!Number.isFinite(v)))return null;
    centralVertices.push(point);
  }
  const centralArea=centralVertices.reduce((sum,p,i)=>sum+cross(p,centralVertices[(i+1)%n]),0);
  if(centralArea<=1e-12)return null;
  const normalizedSides=centralVertices.map((p,i)=>Math.hypot(...sub(centralVertices[(i+1)%n],p)));
  if(normalizedSides.some(side=>side<=1e-8))return null;
  const centralPolygonAngles=centralVertices.map((p,i)=>{
    const incoming=sub(p,centralVertices[(i+n-1)%n]);
    const outgoing=sub(centralVertices[(i+1)%n],p);
    return 180-Math.atan2(cross(incoming,outgoing),dot(incoming,outgoing))*degreesPerRadian;
  });
  const twistAngles=centralVertices.map((_,i)=>{
    const next=(i+1)%n,q=centralVertices[next];
    const edgeToPrevious=sub(centralVertices[i],q);
    const edgeToExit=sub(exit[i],q);
    return Math.atan2(cross(edgeToPrevious,edgeToExit),dot(edgeToPrevious,edgeToExit))*degreesPerRadian;
  });
  const centralPolygonAnglesExcess=twistAngles.map((angle,i)=>
    2*(angle-twistAngles[(i+n-1)%n]));
  const centralPolygonSides=normalizedSides.map(side=>side*scale);
  const actualVertices=centralVertices.map(([x,y]):[number,number]=>[
    origin[0]+x*scale,origin[1]+y*scale
  ]);
  if(centralPolygonSides.some(side=>!Number.isFinite(side))||
    actualVertices.some(point=>point.some(value=>!Number.isFinite(value))))return null;
  return {numSides:n,centralVertices:actualVertices,twistAngles,centralPolygonSides,
    centralPolygonAngles,centralPolygonAnglesExcess};
}
