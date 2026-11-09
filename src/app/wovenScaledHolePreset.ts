import {wovenHolePreset,type WovenParams} from './wovenParams';
export function wovenScaledHolePreset(kind:'symmetric'|'asymmetric'|'two-independent'='asymmetric'):WovenParams&{mode:'graph'}{
 if(!['symmetric','asymmetric','two-independent'].includes(kind))throw Error('小尺度孔洞示例无效。');
 const p=wovenHolePreset();p.optimization='origamica-merit';if(kind!=='symmetric')p.graph.vertices[0][0]=-2.01;
 if(kind==='two-independent'){const n=p.graph.vertices.length;p.graph.vertices.push(...p.graph.vertices.map(([x,y])=>[x+6,y] as [number,number]));p.graph.edges.push(...p.graph.edges.map(([a,b])=>[a+n,b+n] as [number,number]));p.graph.holeFaces=[4,9];}
 const scale=1e-5;p.graph.vertices=p.graph.vertices.map(([x,y])=>[x*scale,y*scale]);
 p.fullEdgeInsets={edgeCount:p.graph.edges.length,entries:p.graph.edges.map(([a,b],edge)=>({edge,line:edge%(12)<8?-1:0,from:[...p.graph.vertices[a]],to:[...p.graph.vertices[b]],inset:p.width/2*scale}))};
 return p;
}
