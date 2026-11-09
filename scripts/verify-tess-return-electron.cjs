const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'../output/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright');
(async()=>{
  const root=path.resolve(__dirname,'..'),packed=process.argv[2];
  const data=path.join(root,'output',packed?'tess-return-packaged-1003':'tess-return-electron-fixed-1003');fs.mkdirSync(data,{recursive:true});
  const env={...process.env,ZHEZHI_DESKTOP_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
  const launcher=packed&&/Portable[^\\/]*\.exe$/i.test(packed)?require('./portableElectronTest.cjs'):_electron;
  const app=await launcher.launch({executablePath:packed?path.resolve(packed):path.join(root,'node_modules/electron/dist/electron.exe'),args:packed?[]:[root],cwd:root,env,timeout:30000});
  const checks=[];let helper;
  try{
    const page=await app.firstWindow();await page.waitForSelector('.app-header');
    const pid=await app.evaluate(({BrowserWindow,dialog})=>{
      const w=BrowserWindow.getAllWindows()[0];w.restore();w.show();w.focus();
      globalThis.__originalConfirm=dialog.showMessageBoxSync;globalThis.__confirmCalls=[];globalThis.__confirmAnswer=1;
      dialog.showMessageBoxSync=(_owner,options)=>{globalThis.__confirmCalls.push(options.message);return globalThis.__confirmAnswer;};return process.pid;
    });
    const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.dataset.pending==='false',null,{timeout:45000});
    const tess=page.getByRole('button',{name:'镶嵌设计',exact:true}),edit=page.getByRole('button',{name:'折痕编辑',exact:true});
    await tess.click();await page.getByRole('button',{name:/^\d+ 空间构造$/}).click();await ready();
    const models=page.getByRole('combobox',{name:'空间构造类型',exact:true}),adopt=page.getByRole('button',{name:'采用展开图副本 →',exact:true});
    // Test actual IPC accept/cancel paths, rather than stubbing renderer window.confirm.
    await adopt.click();await page.waitForFunction(()=>document.querySelector('.workspaces button[aria-pressed="true"]')?.textContent.includes('折痕编辑'));
    checks.push('initial adoption really enters crease editor');await tess.click();await ready();
    const before=await models.inputValue();await app.evaluate(()=>{globalThis.__confirmAnswer=0;});await adopt.click();
    assert.equal(await tess.getAttribute('aria-pressed'),'true');assert.equal(await models.inputValue(),before);checks.push('cancel preserves tessellation and original document');
    await app.evaluate(()=>{globalThis.__confirmAnswer=1;});
    const families=['radial-pot','rectangular-pot','twisted-pot','flasher','paraboloidal-flasher','curved-circle-polyhedral','linked-first-band-polyhedral'];
    const cdp=await page.context().newCDPSession(page);
    for(const family of families){
      await models.selectOption(family);await ready();assert.equal(await adopt.isEnabled(),true,family+' must be adoptable');
      await adopt.click();await page.waitForFunction(()=>document.querySelector('.workspaces button[aria-pressed="true"]')?.textContent.includes('折痕编辑'));
      assert.equal(await models.count(),0);await tess.click();await ready();assert.equal(await models.inputValue(),family);
      const state=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];return {enabled:w.isEnabled(),owner:w.isFocused(),renderer:w.webContents.isFocused()};});
      assert.deepEqual(state,{enabled:true,owner:true,renderer:true});
      await models.click();const ax=await cdp.send('Accessibility.getFullAXTree');
      assert.ok(ax.nodes.some(n=>n.name?.value==='空间构造类型'&&n.properties?.some(p=>p.name==='expanded'&&p.value.value===true)),'native select popup must actually open');
      await page.keyboard.press(family==='linked-first-band-polyhedral'?'ArrowUp':'ArrowDown');await page.keyboard.press('Enter');assert.notEqual(await models.inputValue(),family);await ready();
      checks.push(family+': adopt, return, retain type, native popup opens, selection changes');
      console.log('PASS',family);
    }
    const ipcCalls=await app.evaluate(()=>globalThis.__confirmCalls);assert.ok(ipcCalls.length>=families.length+1);checks.push('main-process confirmation IPC exercised');
    // Finally answer the real Windows modal through UI Automation, scoped to this test PID/title.
    await models.selectOption('radial-pot');await ready();
    await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=globalThis.__originalConfirm;});
    for(const answer of ['取消','继续']){
      const result=path.join(data,answer==='取消'?'native-cancel.txt':'native-accept.txt');
      helper=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/answer-test-confirmation.ps1'),'-TargetProcessId',String(pid),'-ResultFile',result,'-Answer',answer],{windowsHide:true,stdio:['ignore','pipe','pipe']});
      let diagnostic='';helper.stderr.on('data',b=>{diagnostic+=b;});
      const exited=new Promise(resolve=>helper.once('exit',resolve));
      await adopt.click({timeout:15000});const code=await exited;
      assert.equal(code,0,diagnostic);assert.match(fs.readFileSync(result,'utf8'),/invoked/);
      if(answer==='取消')assert.equal(await tess.getAttribute('aria-pressed'),'true');
      else {await page.waitForFunction(()=>document.querySelector('.workspaces button[aria-pressed="true"]')?.textContent.includes('折痕编辑'));await tess.click();await ready();}
      const state=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];return{enabled:w.isEnabled(),owner:w.isFocused(),renderer:w.webContents.isFocused()};});
      assert.deepEqual(state,{enabled:true,owner:true,renderer:true});
      await models.click();const ax=await cdp.send('Accessibility.getFullAXTree');assert.ok(ax.nodes.some(n=>n.name?.value==='空间构造类型'&&n.properties?.some(p=>p.name==='expanded'&&p.value.value===true)));await page.keyboard.press('Escape');
      checks.push('real Windows '+answer+': dialog closes, focus recovers, native select opens');
    }
    const report={passed:checks.length,checks,realWindowsModal:true,executable:packed||'source Electron',confirmationMessages:ipcCalls};
    fs.writeFileSync(path.join(data,'result.json'),JSON.stringify(report,null,2));console.log('TESS_RETURN_OK '+JSON.stringify(report));
  }finally{
    if(helper&&helper.exitCode===null)helper.kill();
    await app.evaluate(({app,BrowserWindow})=>{BrowserWindow.getAllWindows().forEach(w=>w.destroy());app.quit();}).catch(()=>{});await app.close().catch(()=>{});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
