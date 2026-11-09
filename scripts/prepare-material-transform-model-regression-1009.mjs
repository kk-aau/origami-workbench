import fs from 'node:fs';
for(const family of ['topology','trace','network']){
 const original=family==='topology'?'material-topology-model-':`material-topology-model-${family}-regression-`,prefix=`material-transform-model-${family}-regression-`;
 const from=family==='topology'?'output/playwright/material-topology-model-final-run-1009.browser.js':`scripts/verify-material-topology-model-${family}-regression-1009.browser.js`;
 if(!fs.existsSync(from))throw Error(`Missing actual prior browser script: ${from}`);
 fs.writeFileSync(`scripts/verify-${prefix}1009.browser.js`,fs.readFileSync(from,'utf8').replaceAll(original,prefix));
 const download=family==='topology'?'scripts/verify-material-topology-model-download-1009.ts':`scripts/verify-material-topology-model-${family}-regression-download-1009.ts`;
 fs.writeFileSync(`scripts/verify-${prefix}download-1009.ts`,fs.readFileSync(download,'utf8').replaceAll(original,prefix));
 for(const f of fs.readdirSync('output/playwright').filter(f=>f.startsWith(original)&&f.endsWith('-initial-1009.zhezhi.json')&&(family!=='topology'||!f.includes('regression'))))fs.copyFileSync(`output/playwright/${f}`,`output/playwright/${f.replace(original,prefix)}`);
 const recipes=`output/audits/${original}recipes-1009.json`;if(fs.existsSync(recipes))fs.copyFileSync(recipes,recipes.replace(original,prefix));
}
for(const suffix of ['1009.browser.js','download-1009.ts']){
 const from=`scripts/verify-material-topology-model-mesh-${suffix}`,to=`scripts/verify-material-transform-model-mesh-${suffix}`;
 fs.writeFileSync(to,fs.readFileSync(from,'utf8').replaceAll('material-topology-model-','material-transform-model-').replaceAll("['source-saved','original-saved','fold-reedited']","['mirrorX-saved','original-saved','cut-changed']"));
}
console.log('Prepared actual prior v1-v4 browser/download regressions and current transform mesh exports.');
