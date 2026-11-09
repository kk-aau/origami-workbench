import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const modulePath=process.env.PLAYWRIGHT_MODULE;
const {chromium}=await import(modulePath?pathToFileURL(modulePath).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM?{executablePath:process.env.PLAYWRIGHT_CHROMIUM}:{})});
const base=process.env.ZHEZHI_BROWSER_URL??'http://127.0.0.1:8813';

try{
  for(const width of [1000,390]){
    const page=await browser.newPage({viewport:{width,height:720},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'镶嵌设计'}).click();
    await page.getByRole('button',{name:'06 自定义'}).click();
    await page.locator('.tess-preview-status:not([data-pending=true])').waitFor();
    const before=await page.locator('.crease-canvas').innerHTML();
    await page.getByRole('button',{name:'拼块装饰'}).click();
    const dialog=page.getByRole('dialog',{name:'拼块装饰与编号'});
    await dialog.locator('.test-tile-source-preview summary').click();
    const saved=dialog.locator('[data-saved-in2811]');
    assert.equal(await saved.getAttribute('data-saved-in2811'),'true');
    assert.equal(await saved.locator('[data-source-test-tile]').count(),2);
    assert.equal(await saved.locator('[data-source-test-outline]').count(),2);
    assert.equal(await saved.locator('[data-source-test-text]').count(),10);
    assert.equal(await saved.locator('[data-source-test-text="1:tile-index"]').getAttribute('fill'),'#000000');
    assert.equal(await saved.locator('[data-source-test-text="1:vertex-index"]').first().getAttribute('fill'),'#1f140a');
    await page.screenshot({path:`output/playwright/p33-testtile-in2811-${width}-20260928.png`});
    await dialog.getByLabel('TestTile 边数').selectOption('3');
    assert.equal(await saved.getAttribute('data-saved-in2811'),'false');
    assert.equal(await saved.locator('[data-source-test-text]').count(),8);
    await dialog.getByRole('button',{name:'恢复 In[2811]'}).click();
    assert.equal(await saved.getAttribute('data-saved-in2811'),'true');
    await dialog.getByRole('button',{name:'关闭'}).click();
    assert.equal(await page.locator('.crease-canvas').innerHTML(),before,'read-only preview must not change the current drawing');
    assert.deepEqual(errors,[]);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page must not overflow horizontally');
    console.log(`${width}×720: saved graphics, local variation, restore, unchanged drawing, no pageerror or horizontal overflow`);
    await page.close();
  }
}finally{await browser.close();}
