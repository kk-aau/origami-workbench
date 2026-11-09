import type {FoldGraph} from '../core/types';
import {computeFlatGeometry,recomputeFlatLayers} from '../core/flatFold';
import {simulationLayerOrder,simulationLayerOrderSupported,simulationSourceSignature,type SimulationLayerOrder} from './simLayerOrder';

/** A flat-contact display certificate, never a solver pose or motion proof.
 * Older measured full folds contain decimal roundoff around signed 180°.
 * Canonicalize only a private certification copy; retain the original source
 * identity so a later CP edit cannot reuse these material-face relations. */
export function computeSimulationEndpointLayers(source:FoldGraph):SimulationLayerOrder|null {
  const signature=simulationSourceSignature(source);if(!signature)return null;
  const flat={...source,edges_foldAngle:source.edges_vertices.map((_,e)=>{
    const assignment=source.edges_assignment[e],angle=source.edges_foldAngle?.[e];
    const target=assignment==='M'?-180:assignment==='V'?180:0;
    return typeof angle==='number'&&Math.abs(angle-target)<=180*Number.EPSILON*4096?target:angle;
  })} as FoldGraph;
  // Use the strict endpoint check before the reflecting flat-fold solver.
  // Partial folds, cuts and unknown assignments cannot supply a certificate.
  if(!simulationLayerOrderSupported(flat))return null;
  const xs=flat.vertices_coords.map(p=>p[0]),ys=flat.vertices_coords.map(p=>p[1]);
  const epsilon=Math.max(1,Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))*1e-8;
  const geometry=computeFlatGeometry(flat,epsilon);
  if(geometry.geometry.status!=='ready')return null;
  const order=simulationLayerOrder(flat,recomputeFlatLayers(geometry));
  return order?{...order,sourceSignature:signature}:null;
}
