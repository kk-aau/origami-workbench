import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {blankDoc,line} from '../src/app/state';
import {resizeDocument} from '../src/app/drawingObjects';
import {exportDocument} from '../src/core/formats';

const originalTool=process.env.ZHEZHI_ORIGINAL_TOOL_JAR??resolve('../zhezhi/dist/zhezhi-studio-0.1.jar');
const directory=resolve('output/cp-grid-compatibility');mkdirSync(directory,{recursive:true});
const doc=blankDoc('CP 网格对齐',210,210);
doc.segments=doc.segments.map(s=>({...s,a:[s.a[0]-500,s.a[1]+90],b:[s.b[0]-500,s.b[1]+90]}));
doc.segments.push(line([-447.5,90],[-447.5,300],'V'));
const files=[doc,resizeDocument(doc,420,420)].map((item,i)=>{
 const file=resolve(directory,`paper-${i}.cp`);writeFileSync(file,exportDocument(item,'cp').text);return file;
});
const result=spawnSync('java',['-cp',originalTool,resolve('tests/fixtures/ValidateCpGrid.java'),...files],{encoding:'utf8',timeout:20000,windowsHide:true});
assert.ifError(result.error);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/CP_ORIGINAL_TOOL_GRID_OK endpoints=20/);
console.log(result.stdout.trim());
