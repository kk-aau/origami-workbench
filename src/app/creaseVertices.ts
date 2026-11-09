import type {Point,Segment} from '../core/types';
import type {CreaseDisplay} from './creaseDisplay';
/** Display markers only: never changes snap topology or hit testing. */
export function creaseVertices(segments:Segment[]):Point[]{
 const vertices=new Map<string,Point>();
 for(const s of segments)if(s.assignment!=='A')for(const p of [s.a,s.b])vertices.set(`${p[0]},${p[1]}`,[...p]);
 return [...vertices.values()];
}
export function creaseVertexShape(display:CreaseDisplay,units:number){
 if(display.pointSize===0)return null;
 const style=display.pointStyle??'hollow',hollow=style!=='square'&&style!=='circle';
 const radius=display.pointSize*units,strokeWidth=hollow?Math.min(1.15*units,2*radius):0;
 // radius is the outside edge; inset the SVG path to keep the stroke inside it.
 return {round:style!=='square',radius,pathRadius:radius-strokeWidth/2,strokeWidth,fill:hollow?'#fffefb':'#000000',stroke:hollow?'#5a7365':'none'};
}
export function creaseVerticesSVG(segments:Segment[],display:CreaseDisplay,units:number):string{
 const shape=creaseVertexShape(display,units);if(!shape)return '';
 return `<g fill="${shape.fill}" stroke="${shape.stroke}"${shape.strokeWidth?` stroke-width="${shape.strokeWidth}"`:''} pointer-events="none">${creaseVertices(segments).map(([x,y])=>shape.round?`<circle data-crease-vertex="true" cx="${x}" cy="${y}" r="${shape.pathRadius}"/>`:`<rect data-crease-vertex="true" x="${x-shape.pathRadius}" y="${y-shape.pathRadius}" width="${shape.pathRadius*2}" height="${shape.pathRadius*2}"/>`).join('')}</g>`;
}
