import type {FoldGraph,Point} from './types';
import {polygonArea} from './geometry';

/** Only the solver copy changes basis. Face/edge/vertex identities, the saved
 * coordinates and the physical linear tolerance all remain unchanged. Rabbit
 * Ear also compares some cross products to epsilon, so sub-unit geometry needs
 * a well-scaled private basis before entering its contact calculations. */
export function convexLayerGeometry(graph:FoldGraph,epsilon:number):{graph:FoldGraph;epsilon:number}{
  const points=graph.vertices_coords,faces=graph.faces_vertices??[];
  if(!points.length||!Number.isFinite(epsilon)||epsilon<=0||faces.some(face=>{
    const area=polygonArea(face.map(v=>points[v]));return !Number.isFinite(area)||Math.abs(area)<=epsilon*epsilon;
  }))throw new Error('纸面退化或法向无法可靠确定，未确认层序。');
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const [x,y]of points){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  const span=Math.max(maxX-minX,maxY-minY),scale=Math.max(1,1/span);
  if(!Number.isFinite(scale))throw new Error('层序几何没有可验证的尺寸。');
  const vertices:Point[]=points.map(([x,y])=>[(x-minX)*scale,(y-minY)*scale]);
  return {graph:{vertices_coords:vertices,edges_vertices:graph.edges_vertices,edges_assignment:graph.edges_assignment,
    edges_foldAngle:graph.edges_foldAngle,faces_vertices:faces,faces_edges:graph.faces_edges,edges_faces:graph.edges_faces,faces_faces:graph.faces_faces},epsilon:epsilon*scale};
}
