import fs from 'node:fs';
import assert from 'node:assert/strict';
for(const name of ['merit','period']){
 let text=fs.readFileSync(`scripts/verify-woven-${name}-1007.browser.js`,'utf8');
 text=text.replaceAll('显示背面','背面').replaceAll('显示正面','正面').replaceAll(`output/playwright/woven-${name}-`,`output/playwright/woven-independent-regression-${name}-`).replaceAll('1007','1008');
 const original="const foldedReady=()=>page.waitForFunction(()=>document.querySelector('.tess-flat-pane header span')?.textContent==='层序已解');";
 assert.ok(text.includes(original));text=text.replace(original,"const foldedReady=async()=>{if(await button('计算平折').count())await button('计算平折').click();await page.waitForFunction(()=>document.querySelector('.tess-flat-pane header span')?.textContent==='层序已解');};");
 text=text.replace(/^(\s*)await button\('计算平折'\)\.click\(\);/gm,"$1if(await button('计算平折').count())await button('计算平折').click();");
 fs.writeFileSync(`scripts/verify-woven-independent-regression-${name}-1008.browser.js`,text);
 const download=fs.readFileSync(`scripts/verify-woven-${name}-download-1007.ts`,'utf8').replaceAll(`output/playwright/woven-${name}-`,`output/playwright/woven-independent-regression-${name}-`).replaceAll(`output/audits/woven-${name}-`,`output/audits/woven-independent-regression-${name}-`).replaceAll('1007','1008');
 fs.writeFileSync(`scripts/verify-woven-independent-regression-${name}-download-1008.ts`,download);
}
console.log('Prepared original merit/period regression copies using current toolbar names and explicit flat preview.');
