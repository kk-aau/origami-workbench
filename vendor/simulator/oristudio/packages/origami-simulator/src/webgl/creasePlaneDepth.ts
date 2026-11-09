import type {CameraUniforms} from './camera.js';

/** Inverse eye distance is affine on a projected plane. Screen-space ribbons
 * must follow that plane across their width, otherwise their centre-line depth
 * cuts through the sheet above them at oblique viewing angles. The returned
 * gradient uses drawing-buffer pixels, with screen y pointing down. */
export function creasePlaneInverseDepthGradient(
  normal:readonly [number,number,number]|undefined,
  camera:CameraUniforms,
  anchorView:readonly [number,number,number],
):[number,number]|null {
  if(!normal||normal.some(value=>!Number.isFinite(value)))return null;
  const m=camera.rotation,n=[0,1,2].map(row=>m[row*3]*normal[0]+m[row*3+1]*normal[1]+m[row*3+2]*normal[2]);
  const length=Math.hypot(...n),denominator=n[2]*camera.camDist-n.reduce((sum,value,axis)=>sum+value*anchorView[axis],0);
  if(!length||!Number.isFinite(denominator)||Math.abs(denominator)<=length*camera.camDist*1e-6)return null;
  const divisor=camera.scale*camera.camDist*denominator;
  return [-n[0]/divisor,n[1]/divisor];
}

/** Same calculation for the GPU, expressed as the NDC-depth change at a ribbon
 * corner. offsetPx has screen y pointing up, as does the shader's NDC space. */
export const CREASE_PLANE_DEPTH_GLSL=`
uniform vec3 u_creasePlaneNormal;

float creasePlaneDepthOffset(vec3 anchorView,vec2 offsetPx){
  vec3 normal=u_view*u_creasePlaneNormal;
  float normalLength=length(normal);
  float denominator=normal.z*u_camDist-dot(normal,anchorView);
  if(normalLength==0.0||abs(denominator)<=normalLength*u_camDist*0.000001)return 0.0;
  float inverseOffset=-dot(normal.xy,offsetPx)/(u_scale*u_camDist*denominator);
  return -(u_camDist*u_camDist-u_depthRange*u_depthRange)/u_depthRange*inverseOffset;
}

vec4 creaseViewPlane(vec3 anchorView){
  vec3 normal=u_view*u_creasePlaneNormal;
  return vec4(normal,normal.z*u_camDist-dot(normal,anchorView));
}
`;
