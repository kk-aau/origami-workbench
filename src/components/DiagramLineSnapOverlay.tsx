import type {Point} from '../core/types';
import type {DiagramLineSnapResult} from '../app/diagramLineSnap';

interface DiagramLineSnapOverlayProps {
  snap:DiagramLineSnapResult;
  anchor:Point;
  /** Drawing units represented by one screen pixel. */
  units:number;
  viewportAngle?:number;
  showLabel?:boolean;
}

const ink='#426f59';
const paper='#fffefb';
const add=(origin:Point,direction:Point,distance:number):Point=>[origin[0]+direction[0]*distance,origin[1]+direction[1]*distance];
const dot=(a:Point,b:Point)=>a[0]*b[0]+a[1]*b[1];
const delta=(a:Point,b:Point):Point=>[a[0]-b[0],a[1]-b[1]];
const length=(p:Point)=>Math.hypot(p[0],p[1]);
const unit=(p:Point,fallback:Point=[1,0]):Point=>{const size=length(p);return size>1e-10?[p[0]/size,p[1]/size]:fallback;};
const linePath=(a:Point,b:Point)=>`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`;

/** Only the nearby part of the actual reference is highlighted, even for a snap to its extension. */
function nearbyReference(a:Point,b:Point,vertex:Point,extent:number):[Point,Point]|null {
  const ab=delta(b,a),size=length(ab);
  if(size<1e-10)return null;
  const direction=unit(ab),center=dot(delta(vertex,a),direction);
  const from=Math.max(0,center-extent),to=Math.min(size,center+extent);
  return to>from?[add(a,direction,from),add(a,direction,to)]:null;
}

function angleArc(vertex:Point,radius:number,from:number,to:number){
  const a=add(vertex,[Math.cos(from),Math.sin(from)],radius),b=add(vertex,[Math.cos(to),Math.sin(to)],radius);
  return `M${a[0]} ${a[1]}A${radius} ${radius} 0 0 ${to>from?1:0} ${b[0]} ${b[1]}`;
}

/** Transient drafting feedback; this group is never part of the stored drawing. */
export default function DiagramLineSnapOverlay({snap,anchor,units,viewportAngle=0,showLabel=true}:DiagramLineSnapOverlayProps){
  const px=Number.isFinite(units)&&units>0?units:1;
  const {point,vertex}=snap,extent=28*px,referenceDirections=snap.referenceDirections.map(direction=>unit(direction));
  const direction=unit(snap.direction),reference=referenceDirections[0]??[1,0];
  const anchorOffset=delta(anchor,vertex);
  const perpendicularRay=length(anchorOffset)>px*.1?unit(anchorOffset):direction;
  const referenceEnd=snap.references[0];
  const referenceRay:Point=referenceEnd&&Math.max(dot(delta(referenceEnd.a,vertex),reference),dot(delta(referenceEnd.b,vertex),reference))<0?[-reference[0],-reference[1]]:reference;
  const squareSize=9*px,squareA=add(vertex,perpendicularRay,squareSize),squareB=add(squareA,referenceRay,squareSize),squareC=add(vertex,referenceRay,squareSize);

  // Extend the draft only when the true intersection lies outside its current segment.
  const draft=delta(point,anchor),draftLength=length(draft),draftDirection=unit(draft,direction);
  const vertexDistance=dot(delta(vertex,anchor),draftDirection);
  const extensionFrom=vertexDistance<0?anchor:vertexDistance>draftLength?point:null;
  const showExtension=extensionFrom&&length(delta(vertex,extensionFrom))>px;

  const firstAngle=Math.atan2(reference[1],reference[0]);
  const second=referenceDirections[1];
  const signedAngle=second?Math.atan2(reference[0]*second[1]-reference[1]*second[0],dot(reference,second)):0;
  const middleAngle=firstAngle+signedAngle/2,arcRadius=17*px;
  const label=snap.kind==='perpendicular'?`⊥ ${(snap.label||'垂直').replace(/^⊥\s*/,'')}`:snap.label||'角平分线';

  return <g data-diagram-line-snap={snap.kind}
    data-snap-point-x={point[0]} data-snap-point-y={point[1]}
    data-snap-vertex-x={vertex[0]} data-snap-vertex-y={vertex[1]}
    pointerEvents="none" aria-hidden="true" style={{userSelect:'none'}}
    fill="none" stroke={ink} strokeWidth={1.4*px} strokeLinecap="round" strokeLinejoin="round">
    {snap.kind==='perpendicular'?<path d={linePath(add(vertex,reference,-extent),add(vertex,reference,extent))} strokeWidth={px} strokeOpacity=".45" strokeDasharray={`${3*px} ${3*px}`}/>
      :referenceDirections.slice(0,2).map((ray,index)=><path key={index} d={linePath(vertex,add(vertex,ray,extent))} strokeWidth={px} strokeOpacity=".45" strokeDasharray={`${3*px} ${3*px}`}/>)}
    {snap.references.map(item=>{
      const nearby=nearbyReference(item.a,item.b,vertex,extent);
      return nearby&&<path key={item.id} data-snap-reference={item.id} d={linePath(...nearby)} strokeWidth={1.7*px} strokeOpacity=".75"/>;
    })}
    {showExtension&&<path data-snap-line-extension="true" d={linePath(extensionFrom,vertex)} strokeWidth={px} strokeOpacity=".5" strokeDasharray={`${3*px} ${3*px}`}/>}
    {snap.kind==='perpendicular'?<path data-snap-right-angle="true" d={`M${squareA[0]} ${squareA[1]}L${squareB[0]} ${squareB[1]}L${squareC[0]} ${squareC[1]}`} stroke={ink} strokeWidth={1.5*px}/>
      :second&&Math.abs(signedAngle)>1e-6&&<g>
        {[firstAngle,middleAngle].map((from,index)=>{
          const to=index===0?middleAngle:firstAngle+signedAngle,angle=(from+to)/2,tickDirection:Point=[Math.cos(angle),Math.sin(angle)];
          return <g key={index}>
            <path data-snap-equal-angle={index+1} d={angleArc(vertex,arcRadius,from,to)}/>
            <path d={linePath(add(vertex,tickDirection,arcRadius-2.2*px),add(vertex,tickDirection,arcRadius+2.2*px))} strokeWidth={1.3*px}/>
          </g>;
        })}
      </g>}
    <circle data-snap-endpoint="true" cx={point[0]} cy={point[1]} r={3*px} fill={paper} strokeWidth={1.4*px}/>
    {showLabel&&<g data-diagram-snap-label="true" transform={`translate(${point[0]} ${point[1]}) rotate(${-viewportAngle})`}>
      <text x={11*px} y={-11*px} fill={ink} stroke={paper} strokeWidth={4*px} paintOrder="stroke" fontSize={12*px} fontWeight="600" strokeLinejoin="round">{label}</text>
    </g>}
  </g>;
}
