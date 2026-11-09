import fs from 'node:fs';
import assert from 'node:assert/strict';
const old='material-location-move-model',next='material-properties-model';
for(const kind of ['reflect','clipboard','identity'])for(const extension of ['browser.js','ts']){
 const suffix=extension==='browser.js'?'':'-download',source=`scripts/verify-${old}-${kind}-regression${suffix}-1009.${extension}`,target=`scripts/verify-${next}-${kind}-regression${suffix}-1009.${extension}`;
 assert.ok(!fs.existsSync(target),`Do not overwrite existing evidence: ${target}`);
 fs.writeFileSync(target,fs.readFileSync(source,'utf8').replaceAll(old,next));
}
for(const suffix of ['','-drag','-download']){
 const extension=suffix==='-download'?'ts':'browser.js',source=`scripts/verify-${old}${suffix}-1009.${extension}`,target=`scripts/verify-${next}-move-regression${suffix}-1009.${extension}`;
 assert.ok(!fs.existsSync(target),target);
 let value=fs.readFileSync(source,'utf8').replaceAll(old,`${next}-move-regression`);
 value=value.replaceAll(`${next}-move-regression-\${name}-initial-1009`,`${old}-\${name}-initial-1009`).replaceAll(`${next}-move-regression-\${n}-initial-1009`,`${old}-\${n}-initial-1009`).replaceAll(`${next}-move-regression-source-initial-1009`,`${old}-source-initial-1009`);
 fs.writeFileSync(target,value);
}
for(const extension of ['browser.js','ts']){
 const suffix=extension==='browser.js'?'':'-download',source=`scripts/verify-${old}-mesh${suffix}-1009.${extension}`,target=`scripts/verify-${next}-mesh${suffix}-1009.${extension}`;
 assert.ok(!fs.existsSync(target),target);
 fs.writeFileSync(target,fs.readFileSync(source,'utf8').replaceAll(old,next).replaceAll("'similarity-saved'","'source-saved'"));
}
console.log('Prepared independent regression scripts, retaining the previous initial fixtures and writing new evidence only.');
