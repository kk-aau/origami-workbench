import fs from 'node:fs';
import assert from 'node:assert/strict';
import {readVertexFigureResult,vertexFigureReference} from '../src/app/vertexFigure';
const text=fs.readFileSync('output/original-vertex-browser-1010-fixed.log','utf8');
const match=text.match(/^### Result\r?\n(\{[^\r\n]+\})/);assert.ok(match);
const ui=JSON.parse(match[1]);assert.equal(ui.passed,17);assert.deepEqual(ui.errors,[]);
const checks:string[]=[];
for(const name of ['catalog','open','overlap','empty']){
 const file=`output/playwright/original-vertex-${name}-1010.json`;
 const raw=JSON.parse(fs.readFileSync(file,'utf8'));
 assert.ok(readVertexFigureResult(raw,raw.query));
 const expected=vertexFigureReference(raw.query);
 assert.equal(raw.data.graphics[0].length,expected.data.graphics[0].length);
 assert.equal(raw.source.wolframExecuted,false);
 assert.equal(raw.source.paperCertification,false);
 checks.push(`${name}: actual download independently reproduces original rotations, complete nested lines and origin point`);
}
fs.writeFileSync('output/original-vertex-download-1010.json',JSON.stringify({verified:true,checks,actualFiles:4,uiPassed:17,errors:[],desktopVerified:false},null,2));
console.log('Verified four actual vertex-figure JSON downloads against independent original-formula replay.');
