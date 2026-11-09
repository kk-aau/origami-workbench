import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const source='src/app/tessellation.ts',test='tests/app/wovenFamilyReadGuards.test.ts';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const folder='output/parallel/integration-shared-tolerance-guard-1010-before';
assert.ok(!fs.existsSync(folder));
const records=[];
for(const file of [source,test]) {
  const before=fs.readFileSync(file),backup=folder+'/'+file;
  fs.mkdirSync(backup.slice(0,backup.lastIndexOf('/')),{recursive:true});
  fs.writeFileSync(backup,before,{flag:'wx'});
  let text=before.toString('utf8');
  if(file===source) {
    const anchor="  if(family!=='woven-lines'&&(['lines','graph','graphSource'";
    assert.equal(text.split(anchor).length,2);
    const key="'randomVersion','samePtTolerance','intersectionTolerance','order'";
    assert.equal(text.split(key).length,2);
    text=text.replace(key,"'randomVersion','intersectionTolerance','order'");
    text=text.replace(anchor,
      "  // SamePtTolerance also belongs to the original rigid-quad reader.\n"+
      "  if(family!=='woven-lines'&&family!=='rigid-quad'&&Object.hasOwn(raw,'samePtTolerance'))return null;\n"+anchor);
  } else {
    text+=`\n\ntest('Graph tolerance guards preserve the original rigid-quad shared option',()=>{\n`+
      `  const rigid=tessPreset('rigid-quad');\n`+
      `  for(const samePtTolerance of [null,0,1e-6]){\n`+
      `    const input={...rigid,samePtTolerance};\n`+
      `    assert.deepEqual(readTessParams(input),input);\n`+
      `    assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(input))),input);\n`+
      `  }\n`+
      `  assert.equal(readTessParams({...rigid,intersectionTolerance:1e-6}),null);\n`+
      `  for(const family of generic)for(const key of ['samePtTolerance','intersectionTolerance'])\n`+
      `    assert.equal(readTessParams({...tessPreset(family),[key]:1e-6}),null,family+': '+key);\n`+
      `});\n`;
  }
  const after=Buffer.from(text,'utf8');fs.writeFileSync(file,after);
  assert.equal(hash(fs.readFileSync(file)),hash(after));
  records.push({file,before:hash(before),after:hash(after),capturedBaseline:hash(before),alreadyIntegratedExact:false});
}
fs.writeFileSync('output/parallel/shared-tolerance-guard-integrated-1010.json',JSON.stringify({
  verified:true,integrationMethod:'root failure-driven shared option guard correction',files:records,
  initialFailureLog:'output/original-topology-factors-checks-1010.log',
},null,2),{flag:'wx'});
console.log('Preserved rigid-quad SamePtTolerance; unrelated Graph tolerance fields still reject.');
