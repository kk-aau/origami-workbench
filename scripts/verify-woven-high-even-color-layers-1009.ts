import fs from 'node:fs';
import {materialDoc} from '../tests/fixtures/materialModel';
import {materialCanonical} from '../src/core/materialFaceCommon';
import {computeFlatFold} from '../src/core/flatFold';
const cases=JSON.parse(fs.readFileSync('output/audits/woven-high-even-color-roots-1009.json','utf8'));
for(const c of cases.filter((c:any)=>c.status==='candidate')){const g=c.fold;g.faces_vertices=g.faces_vertices.map((r:number[])=>r.reduce((s:number,v:number,i:number)=>{const a=g.vertices_coords[v],b=g.vertices_coords[r[(i+1)%r.length]];return s+a[0]*b[1]-a[1]*b[0];},0)>0?r:[...r].reverse());const lookup=new Map(g.edges_vertices.map((e:number[],i:number)=>[[...e].sort((a,b)=>a-b).join(','),i])),fe=g.faces_vertices.map((r:number[])=>r.map((v:number,i:number)=>lookup.get([v,r[(i+1)%r.length]].sort((a,b)=>a-b).join(','))));const d=materialDoc(materialCanonical(g.vertices_coords,g.edges_vertices,g.edges_assignment,g.edges_foldAngle,g.faces_vertices,fe),c.foldedForm,0),r=computeFlatFold(d);console.log(JSON.stringify({degree:c.degree,layers:r.layers}));}
