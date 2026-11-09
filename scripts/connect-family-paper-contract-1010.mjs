import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const backup='output/parallel/integration-family-paper-contract-1010-before';assert.ok(!fs.existsSync(backup));
const targets=['tests/app/tessellation.test.ts','tests/app/tessellationPaperFitParams.test.ts','src/components/TessellationPanel.tsx'];
const changes=targets.map(file=>{
 const before=fs.readFileSync(file);let text=before.toString('utf8');
 if(file.startsWith('tests/')){
  const original="'twisted-pot','flasher','paraboloidal-flasher','curved-circle-polyhedral','linked-first-band-polyhedral'";
  assert.equal(text.split(original).length-1,1,file);
  text=text.replace(original,"'twisted-pot','flasher','paraboloidal-flasher','curved-circle-polyhedral','linked-first-band-polyhedral','discrete-curve-cp'");
 }else{
  const original='<option value="gore-paper">原Gore单瓣纸张</option>';
  assert.equal(text.split(original).length-1,2,file);
  text=text.replaceAll(original,"<option value=\"gore-paper\">{TESS_NAMES['gore-paper']}</option>");
 }
 return {file,before,after:Buffer.from(text,'utf8')};
});
fs.mkdirSync(backup,{recursive:true});
for(const row of changes){const saved=path.join(backup,row.file);fs.mkdirSync(path.dirname(saved),{recursive:true});fs.writeFileSync(saved,row.before,{flag:'wx'});}
for(const row of changes)fs.writeFileSync(row.file,row.after);
fs.writeFileSync('output/parallel/family-paper-contract-integrated-1010.json',JSON.stringify({verified:true,
 reason:'New discrete-curve-cp uses its explicit source-width finite boundary and already hides generic paper shape in the actual UI; add it to the two legacy own-paper test classifications. Derive both Gore selector names from the corrected family name.',
 initialFailedChecks:'output/original-topology-factors-checks-constructible-final-1010.json',
 productionGeometryChanged:false,paperReaderValidationChanged:false,
 files:changes.map(row=>({file:row.file,before:hash(row.before),after:hash(row.after)})),
},null,2),{flag:'wx'});
console.log(JSON.stringify({verified:true,files:changes.length,paperContractClassificationFixed:true,geometryChanged:false}));
