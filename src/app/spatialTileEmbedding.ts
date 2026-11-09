import type {TessResult} from './tessellation';
import {projectRigidQuad,rigidQuadScene,type RigidQuadProjection,type RigidQuadScene} from './rigidQuadView';
import {spatialMeshScene} from './spatialMeshView';

type XY=[number,number];
type XYZ=[number,number,number];

/** The numeric part of Origamica's {tiletype, offset, rotation, scale} placement. */
export type SpatialTilePlacement={offset:XY;rotationRad:number;scale:number};

/** A verified graph with both its developed and actual folded embeddings. This is not a Mathematica TObj. */
export type EmbeddedSpatialTile={developedVertices:XY[];referenceScene:RigidQuadScene;scene:RigidQuadScene};

/** Project the original and placed embeddings in one world frame. */
export function projectEmbeddedSpatialTile(
  embedded:EmbeddedSpatialTile,azimuth:number,elevation:number,back:boolean,rotation:number,
):{projection:RigidQuadProjection;placedVertexOffset:number}{
  const placedVertexOffset=embedded.referenceScene.vertices.length;
  const comparison:RigidQuadScene={...embedded.scene,
    vertices:[...embedded.referenceScene.vertices,...embedded.scene.vertices],
    faces:embedded.scene.faces.map(face=>face.map(index=>index+placedVertexOffset))};
  return {projection:projectRigidQuad(comparison,azimuth,elevation,back,rotation),placedVertexOffset};
}

/**
 * Apply a tiling placement to an existing, independently verified static 3D
 * construction. The 3D coordinate comes only from foldedForm3D; a 2D FOLD
 * vertex is never promoted to z=0 to stand in for a folded form.
 *
 * Origamica's saved In[2829] defines the correct 3D transform as f3d, but
 * applies f2d to Vertices3D. This numeric subset follows its stated 3D
 * placement rule, rather than reproducing that dimension mismatch.
 */
export function embedVerifiedSpatialTile(
  result:Pick<TessResult,'source'|'fold'>|null,
  placement:SpatialTilePlacement,
):EmbeddedSpatialTile|null{
  if(!result||!Array.isArray(placement.offset)||placement.offset.length!==2||
    !placement.offset.every(Number.isFinite)||!Number.isFinite(placement.rotationRad)||
    !Number.isFinite(placement.scale)||placement.scale===0)return null;
  const scene=spatialMeshScene(result)??rigidQuadScene(result);
  if(!scene)return null;
  const fold=result.fold as Record<string,unknown>;
  const developed=fold.vertices_coords as XY[];
  const {offset:[tx,ty],rotationRad:angle,scale}=placement;
  const c=Math.cos(angle),s=Math.sin(angle);
  const transformXY=([x,y]:XY):XY=>[tx+scale*(c*x-s*y),ty+scale*(s*x+c*y)];
  const transformXYZ=([x,y,z]:XYZ):XYZ=>[tx+scale*(c*x-s*y),ty+scale*(s*x+c*y),scale*z];
  const developedVertices=developed.map(transformXY),vertices=scene.vertices.map(transformXYZ);
  if(developedVertices.some(point=>point.some(value=>!Number.isFinite(value)))||
    vertices.some(point=>point.some(value=>!Number.isFinite(value))))return null;
  const graph={vertices_coords:developedVertices,edges_vertices:scene.edges,
    edges_assignment:scene.assignments,faces_vertices:scene.faces};
  const checked=spatialMeshScene({fold:graph,source:{spatialKind:'embedded-static-tile',
    staticGlobalIsometryChecked:true,foldedForm3D:vertices}});
  if(!checked)return null;
  return {developedVertices,referenceScene:scene,scene:{...checked,
    maximumGridClosureError:scene.maximumGridClosureError*Math.abs(scale),
    maximumFoldAngleErrorRad:scene.maximumFoldAngleErrorRad}};
}
