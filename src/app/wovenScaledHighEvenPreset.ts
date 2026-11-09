import {wovenHighEvenPreset,type WovenParams} from './wovenParams';
/** A local similarity witness, not a saved Wolfram output or near-circle claim. */
export function wovenScaledHighEvenPreset(degree=12):WovenParams&{mode:'graph'}{
 if(![12,16,32].includes(degree))throw new Error('小尺度见证仅包含 12／16／32 度。');
 const p=wovenHighEvenPreset(degree),scale=1e-4;
 p.graph.vertices=p.graph.vertices.map(q=>[q[0]*scale,q[1]*scale]);
 p.fullEdgeInsets={edgeCount:p.graph.edges.length,entries:p.graph.edges.map(([a,b],edge)=>({edge,line:a===0||b===0?0:-1,from:[...p.graph.vertices[a]],to:[...p.graph.vertices[b]],inset:p.width/2*scale}))};
 return p;
}
