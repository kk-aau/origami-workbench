import fs from 'node:fs';
import {materialDoc,materialSlitFixture} from '../tests/fixtures/materialModel';
import {exportDocument} from '../src/core/formats';
import type {Point} from '../src/core/types';
const polygon=(p:Point[])=>materialDoc({vertices_coords:p,edges_vertices:p.map((_,i)=>[i,(i+1)%p.length]),edges_assignment:p.map(()=>'B'),edges_foldAngle:p.map(()=>0),faces_vertices:[p.map((_,i)=>i)],faces_edges:[p.map((_,i)=>i)],edges_faces:p.map(()=>[0]),faces_faces:[p.map(()=>null)] as unknown as number[][]},p);
const square=polygon([[0,0],[100,0],[100,100],[0,100]]);square.name='批量交叉源';const h=50*Math.sqrt(3),hex=polygon([[100,0],[50,h],[-50,h],[-100,0],[-50,-h],[50,-h]]);hex.name='批量六角源';const slit=materialSlitFixture().source;slit.name='批量切口源';
for(const [name,doc]of [['square-source',square],['hex-source',hex],['slit-source',slit]] as const)fs.writeFileSync(`output/playwright/material-weak-tools-batch-regression-${name}-1009.zhezhi.json`,exportDocument(doc,'json').text);
console.log('Prepared exact square, origin-centred hexagon and slit batch fixtures.');
