export type TriangleAngles=readonly [number,number,number];
export type TriangleTwistTypes=('M'|'V')[];

const degreesPerRadian=180/Math.PI;

/** The angle-dependent factor in Origamica's UnitTriangleOffset formulas. */
function triangleFactor(angles:TriangleAngles):number|null{
  if(angles.length!==3||angles.some(value=>!Number.isFinite(value)||value<=0||value>=180)||
    Math.abs(angles[0]+angles[1]+angles[2]-180)>1e-6)return null;
  const [a,b,c]=angles.map(value=>value/degreesPerRadian);
  const factor=Math.sin(a)*Math.sin(b)*Math.sin(c)/
    (1+Math.cos(a)*Math.cos(b)*Math.cos(c));
  return Number.isFinite(factor)&&factor>0?factor:null;
}

/** UnitTriangleOffsetTwistAngle, notebook lines 225983–226011; returns degrees.
 * Its printed two-argument ArcTan does not reproduce the notebook's saved
 * example (36.829° instead of 22.843°). This inverse of the next source
 * formula agrees with that example and with the exact tile geometry.
 */
export function unitTriangleOffsetTwistAngle(angles:TriangleAngles,width:number,offset:number):number|null{
  const factor=triangleFactor(angles);
  if(factor===null||!Number.isFinite(width)||width<=0||!Number.isFinite(offset))return null;
  return Math.atan2(width*factor,2*offset)*degreesPerRadian;
}

/** UnitTriangleOffsetTwistOffset, notebook lines 226071–226099. */
export function unitTriangleOffsetTwistOffset(angles:TriangleAngles,width:number,angle:number):number|null{
  const factor=triangleFactor(angles);
  if(factor===null||!Number.isFinite(width)||width<=0||
    !Number.isFinite(angle)||angle<=0||angle>=180)return null;
  const alpha=angle/degreesPerRadian;
  const offset=width*factor*Math.cos(alpha)/(2*Math.sin(alpha));
  return Number.isFinite(offset)?offset:null;
}

/** UnitTriangleOffsetTwistShrinkage = w csc(α), lines 226195–226215. */
export function unitTriangleOffsetTwistShrinkage(angles:TriangleAngles,width:number,offset:number):number|null{
  const angle=unitTriangleOffsetTwistAngle(angles,width,offset);
  return angle===null?null:width/Math.sin(angle/degreesPerRadian);
}

/** UnitTriangleOffsetTwistRotation = 90° − α, lines 226236–226255. */
export function unitTriangleOffsetTwistRotation(angles:TriangleAngles,width:number,offset:number):number|null{
  const angle=unitTriangleOffsetTwistAngle(angles,width,offset);
  return angle===null?null:90-angle;
}

/** Triangle-specific form of the source's M/V validity rules.
 * The source's UnitTriangleOffsetTwistSelfContainedQ accidentally calls
 * RegularPolygonTwistValidQ with `angles` where that function expects n.
 * For a triangle, replace the regular 30° critical angle with the triangle's
 * own critical angle; the mixed-assignment limit is its 90° complement.
 */
export function unitTriangleOffsetTwistValid(angles:TriangleAngles,angle:number,types:TriangleTwistTypes):boolean{
  const factor=triangleFactor(angles);
  if(factor===null||!Number.isFinite(angle)||angle<=0||angle>=180||
    types.length!==3||types.some(type=>type!=='M'&&type!=='V'))return false;
  const foldedAngle=Math.min(angle,180-angle);
  const critical=Math.atan(factor)*degreesPerRadian;
  const allSame=types.every(type=>type===types[0]);
  return foldedAngle<=(allSame?critical:90-critical)+1e-10;
}

/** UnitTriangleOffsetTwistSelfContainedQ with the source's width bound.
 * The intended Boolean predicate uses the corrected triangle M/V check above.
 */
export function unitTriangleOffsetTwistSelfContained(
  angles:TriangleAngles,width:number,offset:number,types:TriangleTwistTypes
):boolean{
  const angle=unitTriangleOffsetTwistAngle(angles,width,offset);
  return angle!==null&&unitTriangleOffsetTwistValid(angles,angle,types)&&
    width<=(1-2*Math.abs(offset))/3;
}

/** Same query when the user supplies α instead of d. */
export function unitTriangleOffsetTwistAngleSelfContained(
  angles:TriangleAngles,width:number,angle:number,types:TriangleTwistTypes
):boolean{
  const offset=unitTriangleOffsetTwistOffset(angles,width,angle);
  return offset!==null&&unitTriangleOffsetTwistSelfContained(angles,width,offset,types);
}
