import type {DiagramPose} from './diagramProject';
import type {ModelViewState} from './modelViewState';
import {projectDiagramSpatialPoint} from './diagramSpatialPose';

/** Illustration lighting changes paint only. The fixed-face orthographic
 * projection, original material colors and actual fold angles remain intact.
 * Common height/normal yields the same fill, keeping flat subdivisions seamless. */
export function diagramSpatialFaceColor(pose:DiagramPose,view:ModelViewState):((face:number,color:string)=>string)|null {
  const spatial=pose.spatial;if(!spatial||view.xray||pose.paperDeformation?.nodes.length)return null;
  const projected=spatial.vertices.map(p=>projectDiagramSpatialPoint(p,spatial.camera)),side=view.side==='back'?-1:1;
  const depths=projected.map(p=>p[2]*side),nearest=Math.max(...depths),scale=Math.max(1,pose.sourceDoc.paper.width,pose.sourceDoc.paper.height);
  const xs=projected.map(p=>p[0]*side),ys=projected.map(p=>p[1]),reference=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2,nearest];
  const angle=view.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  const origin=projectDiagramSpatialPoint([0,0,0],spatial.camera);
  const shades=spatial.faceTransforms.map(({rotation:r},face)=>{
    const q=projectDiagramSpatialPoint([r[2],r[5],r[8]],spatial.camera),n=q.map((v,k)=>v-origin[k]);
    // The back camera mirrors X and looks in the opposite depth direction.
    const nx=n[0]*side,ny=n[1],nz=n[2]*side,facing=nz<0?-1:1;
    const light=facing*((c*nx-s*ny)*-.35+(s*nx+c*ny)*-.45+nz*.82);
    const vertex=pose.result.geometry.faces[face][0],point=[xs[vertex],ys[vertex],depths[vertex]];
    // Plane offset, rather than centroid depth, keeps every subdivision of
    // the same slanted sheet exactly the same tone (including F crease marks).
    const offset=facing*(nx*(reference[0]-point[0])+ny*(reference[1]-point[1])+nz*(reference[2]-point[2]));
    const recession=Math.min(.14,Math.max(0,offset)/scale*1.1);
    return Math.max(-.035,Math.min(.27,(.82-light)*.28+recession));
  });
  return (face,color)=>{
    const shade=shades[face];if(!shade||!/^#[0-9a-f]{6}$/i.test(color))return color;
    const channels=[1,3,5].map(i=>Number.parseInt(color.slice(i,i+2),16));
    return '#'+channels.map(v=>Math.round(shade>0?v*(1-shade):v+(255-v)*-shade).toString(16).padStart(2,'0')).join('');
  };
}
