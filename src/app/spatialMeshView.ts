import type {TessResult} from './tessellation';
import type {RigidQuadScene} from './rigidQuadView';
import {gorePaperSourceValid} from './goreData';
import {flasherSourceFaceVertexBudget} from './flasherSourceBudget';

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const index=(value:unknown,count:number):value is number=>typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<count;
type Vec2=[number,number];
type Vec3=[number,number,number];

/**
 * Read a static spatial construction only when its source explicitly attests
 * isometry and the supplied developed FOLD faces independently agree with it.
 * A spatial projection is not evidence of a continuous rigid folding path.
 */
export function spatialMeshScene(result:(Pick<TessResult,'source'|'fold'>&Partial<Pick<TessResult,'stats'|'doc'>>)|null,form:'folded'|'deployed'='folded'):RigidQuadScene|null{
  if(!result||typeof result.source.spatialKind!=='string'||!result.source.spatialKind.trim()||
    result.source.staticGlobalIsometryChecked!==true)return null;
  const source=result.source,fold=result.fold;
  const parameterFamily=(result.stats as unknown as {parameters?:{family?:unknown}}|undefined)?.parameters?.family;
  if((source.spatialKind==='origamica-planar-flasher'||parameterFamily==='flasher')&&flasherSourceFaceVertexBudget(result)===null)return null;
  if(['origamica-single-gore','origamica-multiple-gore'].includes(source.spatialKind as string)&&!gorePaperSourceValid(source,fold))return null;
  if(form==='deployed'&&(source.spatialKind!=='origamica-paraboloidal-flasher-cut'||
    source.deployedPatternChecked!==true))return null;
  if(!fold||typeof fold!=='object'||Array.isArray(fold))return null;
  const graph=fold as Record<string,unknown>;
  const flat=graph.vertices_coords,vertices=form==='deployed'?source.deployedForm3D:source.foldedForm3D,
    edges=graph.edges_vertices,assignments=graph.edges_assignment,faces=graph.faces_vertices;
  // A large center requires the complete original parameter/topology/XY source
  // contract. A source string alone never enlarges the general capacity.
  const enlargedCenter=Array.isArray(faces)&&faces.some(face=>Array.isArray(face)&&face.length>64);
  const sourceBudget=enlargedCenter?flasherSourceFaceVertexBudget(result):null;
  if(enlargedCenter&&sourceBudget===null)return null;
  const faceVertexLimit=sourceBudget??64;
  if(!Array.isArray(flat)||!Array.isArray(vertices)||vertices.length!==flat.length||
    vertices.length<3||vertices.length>10000||!Array.isArray(edges)||edges.length>30000||
    !Array.isArray(assignments)||edges.length!==assignments.length||
    !Array.isArray(faces)||!faces.length||faces.length>600)return null;
  if(flat.some(point=>!Array.isArray(point)||point.length!==2||point.some(value=>!finite(value)))||
    vertices.some(point=>!Array.isArray(point)||point.length!==3||point.some(value=>!finite(value)))||
    edges.some(edge=>!Array.isArray(edge)||edge.length!==2||
      !index(edge[0],vertices.length)||!index(edge[1],vertices.length)||edge[0]===edge[1])||
    assignments.some(value=>!['B','M','V','U','F','A'].includes(value))||
    faces.some(face=>!Array.isArray(face)||face.length<3||face.length>faceVertexLimit||
      face.some(value=>!index(value,vertices.length))||new Set(face).size!==face.length))return null;
  const developed=flat as Vec2[],spatial=vertices as Vec3[];
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const [x,y] of developed){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  const scale=Math.max(1,Math.hypot(maxX-minX,maxY-minY)),tolerance=1e-7*scale;
  if(!finite(scale)||!finite(tolerance))return null;
  let maximumFaceDistanceError=0;
  const verifiedFaces:number[][]=[];
  for(const originalFace of faces as number[][]){
    const origin2=developed[originalFace[0]];
    let area=0,localSpan=0;
    for(let position=0;position<originalFace.length;position++){
      const a=developed[originalFace[position]],b=developed[originalFace[(position+1)%originalFace.length]];
      area+=(a[0]-origin2[0])*(b[1]-origin2[1])-(a[1]-origin2[1])*(b[0]-origin2[0]);
      localSpan=Math.max(localSpan,Math.hypot(a[0]-origin2[0],a[1]-origin2[1]));
    }
    if(!finite(area)||!finite(localSpan)||localSpan<=0||Math.abs(area)<=1e-12*localSpan*localSpan)return null;
    const face=area>0?originalFace:[...originalFace].reverse();
    const origin3=spatial[face[0]];
    let normal:Vec3|null=null,normalLength=0;
    for(let a=1;a<face.length;a++)for(let b=a+1;b<face.length;b++){
      const u=spatial[face[a]],v=spatial[face[b]];
      const ux=u[0]-origin3[0],uy=u[1]-origin3[1],uz=u[2]-origin3[2];
      const vx=v[0]-origin3[0],vy=v[1]-origin3[1],vz=v[2]-origin3[2];
      const cross:Vec3=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];
      const length=Math.hypot(...cross);
      if(length>normalLength){normal=cross;normalLength=length;}
    }
    if(!normal||!finite(normalLength)||normalLength<=1e-12*localSpan*localSpan)return null;
    const unit:Vec3=[normal[0]/normalLength,normal[1]/normalLength,normal[2]/normalLength];
    for(const vertex of face){
      const point=spatial[vertex];
      const height=Math.abs((point[0]-origin3[0])*unit[0]+(point[1]-origin3[1])*unit[1]+(point[2]-origin3[2])*unit[2]);
      if(!finite(height)||height>tolerance)return null;
    }
    for(let a=0;a<face.length;a++)for(let b=a+1;b<face.length;b++){
      const p=face[a],q=face[b];
      const planarDistance=Math.hypot(developed[p][0]-developed[q][0],developed[p][1]-developed[q][1]);
      const spatialDistance=Math.hypot(spatial[p][0]-spatial[q][0],spatial[p][1]-spatial[q][1],spatial[p][2]-spatial[q][2]);
      const error=Math.abs(planarDistance-spatialDistance);
      if(!finite(error)||error>tolerance)return null;
      maximumFaceDistanceError=Math.max(maximumFaceDistanceError,error);
    }
    verifiedFaces.push(face);
  }
  const claimedError=form==='deployed'?source.maximumDeployedFaceDistanceError:source.maximumFaceDistanceError;
  if(claimedError!==undefined&&(!finite(claimedError)||claimedError<0||claimedError>tolerance))return null;
  let minimumSpatialEdgeLength=Infinity;
  for(const [a,b] of edges as [number,number][]){
    const first=spatial[a],second=spatial[b];
    const length=Math.hypot(first[0]-second[0],first[1]-second[1],first[2]-second[2]);
    if(!finite(length)||length<=0)return null;
    minimumSpatialEdgeLength=Math.min(minimumSpatialEdgeLength,length);
  }
  if(!finite(minimumSpatialEdgeLength))return null;
  return {vertices:spatial,edges:edges as [number,number][],
    assignments:assignments as RigidQuadScene['assignments'],faces:verifiedFaces,
    maximumFaceDistanceError:Math.max(maximumFaceDistanceError,finite(claimedError)?claimedError:0),
    maximumGridClosureError:0,maximumFoldAngleErrorRad:0,minimumSpatialEdgeLength};
}

/** Origamica's PotFlatFlangeInset is a drawing offset, never a paper metric. */
export function potFlangeDisplayScene(scene:RigidQuadScene|null,source:Record<string,unknown>):RigidQuadScene|null{
  const kind=String(source.spatialKind);
  if(!scene||!['origamica-radial-pot','origamica-rectangular-pot','origamica-twisted-pot'].includes(kind))return null;
  const raw=source.flatFlangeDisplay;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const display=raw as Record<string,unknown>,fraction=display.fraction,indices=display.vertexIndices;
  const letter=String(display.sourceLetter);
  if(!finite(fraction)||fraction<=0||fraction>.5||display.displayOnly!==true||
    display.metricPreserving!==false||!(kind==='origamica-twisted-pot'?['p','r']:['b','e']).includes(letter)||
    !Array.isArray(indices)||!indices.length||indices.length>scene.vertices.length||
    indices.some(value=>!index(value,scene.vertices.length))||
    new Set(indices).size!==indices.length)return null;
  const vertices=scene.vertices.map(point=>[...point] as Vec3);
  for(const vertex of indices as number[]){
    vertices[vertex][0]*=1-fraction;
    vertices[vertex][1]*=1-fraction;
  }
  let minimumSpatialEdgeLength=Infinity;
  for(const [a,b] of scene.edges){
    minimumSpatialEdgeLength=Math.min(minimumSpatialEdgeLength,Math.hypot(
      vertices[a][0]-vertices[b][0],vertices[a][1]-vertices[b][1],vertices[a][2]-vertices[b][2]));
  }
  if(!finite(minimumSpatialEdgeLength)||minimumSpatialEdgeLength<=0)return null;
  return {...scene,vertices,minimumSpatialEdgeLength};
}
