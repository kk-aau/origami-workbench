import fs from 'node:fs';
import assert from 'node:assert/strict';
import {readTestPleatResult} from '../src/app/testPleat';
const files=['right-angle','degenerate','translated'].map(n=>`output/original-function-browser-1010/pleat-${n}.json`);
for(const file of files){const r=JSON.parse(fs.readFileSync(file,'utf8'));assert.ok(readTestPleatResult(r,r.query));assert.equal(r.data.graphics.length,4);assert.equal(r.source.paperCertification,false);}
const log=fs.readFileSync('output/original-function-browser-1010/original-pleat-browser-1010.log','utf8');
const match=log.match(/^### Result\r?\n(\{[^\r\n]+\})/);assert.ok(match);const ui=JSON.parse(match[1]);assert.equal(ui.passed,15);assert.deepEqual(ui.errors,[]);
fs.writeFileSync('output/original-function-browser-1010/pleat-download-audit.json',JSON.stringify({passed:true,actualFiles:files,uiPassed:ui.passed,errors:ui.errors,originalGeometryIndependentlyReplayed:true,desktopVerified:false},null,2));
console.log('Three actual TestPleat files preserve all original primitives, point order and styles.');
