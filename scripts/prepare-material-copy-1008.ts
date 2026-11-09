import fs from 'node:fs';
import {materialCutFixture,materialDoc} from '../tests/fixtures/materialModel';
import {setStartingFace} from '../src/app/flatFoldSettings';
import {exportDocument} from '../src/core/formats';
import type {Point} from '../src/core/types';
const original=materialCutFixture().source;original.name='材料复制原版验收';const source=setStartingFace(original,(original.metadata!.materialTopology as {startingFace:number}).startingFace);
const p:Point[]=[[0,0],[100,0],[100,100],[0,100]],square=materialDoc({vertices_coords:p,edges_vertices:[[0,1],[1,2],[2,3],[3,0]],edges_assignment:['B','B','B','B'],edges_foldAngle:[0,0,0,0],faces_vertices:[[0,1,2,3]],faces_edges:[[0,1,2,3]],edges_faces:[[0],[0],[0],[0]],faces_faces:[[null,null,null,null]] as unknown as number[][]},p);square.name='原位材料复制验收';
for(const [name,doc]of [['source',source],['square-source',setStartingFace(square,0)]] as const)fs.writeFileSync(`output/playwright/material-copy-${name}-1008.zhezhi.json`,exportDocument(doc,'json').text);
console.log('Prepared original three-part and coincident-root material copy sources.');
