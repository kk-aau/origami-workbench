type Point=[number,number];

const cross=(a:Point,b:Point)=>a[0]*b[1]-a[1]*b[0];
const sub=(a:Point,b:Point):Point=>[a[0]-b[0],a[1]-b[1]];

function segmentsIntersect(a:Point,b:Point,c:Point,d:Point):boolean{
  const u=sub(b,a),v=sub(d,c),displacement=sub(c,a),det=cross(u,v);
  const tolerance=1e-10*Math.max(1,Math.hypot(...u)*Math.hypot(...v));
  if(Math.abs(det)<=tolerance){
    if(Math.abs(cross(u,displacement))>tolerance)return false;
    const axis=Math.abs(u[0])>=Math.abs(u[1])?0:1;
    return Math.max(Math.min(a[axis],b[axis]),Math.min(c[axis],d[axis]))<=
      Math.min(Math.max(a[axis],b[axis]),Math.max(c[axis],d[axis]))+1e-9;
  }
  const alongU=cross(displacement,v)/det,alongV=cross(displacement,u)/det;
  return alongU>=-1e-9&&alongU<=1+1e-9&&alongV>=-1e-9&&alongV<=1+1e-9;
}

/** A simple CCW vector curve whose every radial ray has a single hit. */
export function validRingVectorPolygon(value:unknown):value is Point[]{
  if(!Array.isArray(value)||value.length<3||value.length>64||value.some(point=>
    !Array.isArray(point)||point.length!==2||point.some(coordinate=>typeof coordinate!=='number'||!Number.isFinite(coordinate)||Math.abs(coordinate)>2)))return false;
  const points=value as Point[],count=points.length;
  for(let i=0;i<count;i++){
    const a=points[i],b=points[(i+1)%count],c=points[(i+2)%count];
    const u=sub(b,a),v=sub(c,b),lu=Math.hypot(...u),lv=Math.hypot(...v);
    if(lu<1e-5||lv<1e-5||Math.abs(cross(u,v))<=1e-8*lu*lv||cross(u,[-a[0],-a[1]])<=1e-6*lu)return false;
  }
  for(let i=0;i<count;i++)for(let j=i+2;j<count;j++){
    if(i===0&&j===count-1)continue;
    if(segmentsIntersect(points[i],points[(i+1)%count],points[j],points[(j+1)%count]))return false;
  }
  return true;
}
