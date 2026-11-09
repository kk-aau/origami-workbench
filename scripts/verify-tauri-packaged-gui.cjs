/* Actual Release WebView2/CDP acceptance. Does not launch or modify the app. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/11312/AppData/Local/npm-cache/_npx/ef40dfadc1438043/node_modules/playwright');
const args={};for(let i=2;i<process.argv.length;i+=2)args[process.argv[i].replace(/^--/,'')]=process.argv[i+1];
const root=path.resolve(__dirname,'..'),release=JSON.parse(fs.readFileSync(path.join(root,'desktop-tauri/release.json'),'utf8'));
const stage=args.stage||'all',version=args.version||JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const out=path.resolve(args.output||path.join(root,`output/tauri-release-${version}-${release.candidate}/gui`));
assert(out.startsWith(root+path.sep),'QA evidence must stay in migration project');
const profile=path.resolve(args.profile||path.join(out,'profile'));
fs.mkdirSync(out,{recursive:true});const fixtures=path.join(out,'fixtures');fs.mkdirSync(fixtures,{recursive:true});
const cpRows=[[1,0,0,100,0],[1,100,0,100,100],[1,100,100,0,100],[1,0,100,0,0],[2,0,0,100,100]];
const cp=cpRows.map(r=>r.join(' ')).join('\n')+'\n';
const fold=JSON.stringify({file_spec:1.2,file_creator:'Tauri release QA',frame_classes:['creasePattern'],frame_unit:'mm',vertices_coords:[[0,0],[100,0],[100,100],[0,100]],edges_vertices:[[0,1],[1,2],[2,3],[3,0],[0,2]],edges_assignment:['B','B','B','B','M']},null,2);
const valid=[];
for(const [extension,text]of [['CP',cp],['fold',fold]]){
 for(const [suffix,newline]of [['lf','\n'],['cr','\r'],['crlf','\r\n']]){const name=`${extension.toLowerCase()}-${suffix}.${extension}`;fs.writeFileSync(path.join(fixtures,name),text.replace(/\n/g,newline));valid.push(name);}
 for(const suffix of ['utf8-bom','utf16le-bom','utf16be-bom']){const name=`${extension.toLowerCase()}-${suffix}.${extension}`;const bytes=suffix==='utf8-bom'?Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(text)]):suffix==='utf16le-bom'?Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(text,'utf16le')]):Buffer.concat([Buffer.from([0xfe,0xff]),Buffer.from(text,'utf16le').swap16()]);fs.writeFileSync(path.join(fixtures,name),bytes);valid.push(name);}
}
fs.writeFileSync(path.join(fixtures,'invalid-utf8.CP'),Buffer.from([0xc3,0x28]));
fs.writeFileSync(path.join(fixtures,'invalid-record.CP'),'1 0 0 100\n');
fs.writeFileSync(path.join(fixtures,'slow.cp'),cp);
const grid=cpRows.slice(0,4).map(r=>r.join(' '));for(let i=1;i<=80;i++){const n=100*i/81;grid.push(`2 0 ${n} 100 ${n}`,`3 ${n} 0 ${n} 100`);}fs.writeFileSync(path.join(fixtures,'former-limit-grid.cp'),grid.join('\n'));
const opx='<?xml version="1.0" encoding="UTF-8"?><java version="17" class="java.beans.XMLDecoder"><object class="oripa.DataSet"><void property="title"><string>OPX 中文 &amp; 对角线</string></void><void property="lines"><array class="oripa.OriLineProxy" length="5">'+cpRows.map((row,index)=>'<void index="'+index+'"><object class="oripa.OriLineProxy">'+['type','x0','y0','x1','y1'].map((key,i)=>'<void property="'+key+'"><'+(i?'double':'int')+'>'+row[i]+'</'+(i?'double':'int')+'></void>').join('')+'</object></void>').join('')+'</array></void></object></java>';
fs.writeFileSync(path.join(fixtures,'unicode-geometry.opx'),opx);
fs.writeFileSync(path.join(fixtures,'invalid-geometry.opx'),opx.replace('length="5"','length="6"'));
const report={stage,version,cdpPort:Number(args.port||59232),appPid:Number(args.pid||0),profile,checks:[],errors:[],blockedExternalRequests:[],boundaries:['File import uses the unchanged production file input and parser worker; OS native file-picker automation is not used.','Late result fixture delays delivery of a real Worker result; parsing and result data are not replaced.']};
let browser,page;
const pass=(ok,label)=>{assert(ok,label);report.checks.push(label);};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 browser=await chromium.connectOverCDP('http://127.0.0.1:'+report.cdpPort);
 const pages=browser.contexts().flatMap(c=>c.pages());
 page=pages.find(p=>/^http:\/\/127\.0\.0\.1:\d+\/$/.test(p.url()));assert(page,'main local WebView2 page');
 page.setDefaultTimeout(15000);page.on('pageerror',error=>report.errors.push(String(error)));page.on('dialog',dialog=>dialog.accept());
 await page.context().route('**/*',route=>{const url=new URL(route.request().url());if(['http:','https:'].includes(url.protocol)&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)){report.blockedExternalRequests.push(url.href);return route.abort('internetdisconnected');}return route.continue();});
 const exact=name=>page.getByRole('button',{name,exact:true}).first(),button=name=>page.getByRole('button',{name:new RegExp(name)}).first();
 const first=exact('设置并开始使用');if(await first.isVisible().catch(()=>false)){await first.click();await first.waitFor({state:'hidden'});}
 const health=await page.evaluate(()=>fetch('/api/health').then(r=>r.json()));pass(health.version===version&&health.runtime==='rust','running Release host uses expected Rust service version');
 report.webviewVersion=browser.version();
 if(Number.isSafeInteger(report.appPid)&&report.appPid>0){
  const inspect=`$all=@(Get-CimInstance Win32_Process);$ids=[System.Collections.Generic.HashSet[uint32]]::new();[void]$ids.Add(${report.appPid});do{$added=$false;foreach($p in $all){if($ids.Contains([uint32]$p.ParentProcessId)-and $ids.Add([uint32]$p.ProcessId)){$added=$true}}}while($added);@($all|Where-Object{$ids.Contains([uint32]$_.ProcessId)}|ForEach-Object{@{pid=$_.ProcessId;name=$_.Name;parent=$_.ParentProcessId;hostPath=$(if($_.ProcessId -eq ${report.appPid}){$_.ExecutablePath}else{$null});sandboxDisabled=($_.CommandLine -match '--no-sandbox');gpuDisabled=($_.CommandLine -match '--disable-gpu(?: |$)')}})|ConvertTo-Json -Depth 3 -Compress`;
  report.processes=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command','[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false);'+inspect],{encoding:'utf8',windowsHide:true}).replace(/^\uFEFF/,''));
  if(!Array.isArray(report.processes))report.processes=[report.processes];
  const host=report.processes.find(p=>p.pid===report.appPid);assert(host&&path.resolve(host.hostPath).startsWith(root+path.sep),'QA host belongs to the migration directory');
  pass(report.processes.every(p=>!p.sandboxDisabled&&!p.gpuDisabled),'actual process tree has no sandbox/GPU disabling flags');
  pass(report.processes.every(p=>p.name.toLowerCase()!=='node.exe'),'packaged application process tree contains no Node runtime');
 }
 report.origin=new URL(page.url()).origin;
 pass(!pages.some(p=>p.url().includes('/_desktop/startup.html')),'startup page hands off to ready workspace');
 async function save(){await exact('保存折痕').click();await page.locator('.save-dot.saved').first().waitFor();}
 async function snapshot(){await save();return page.evaluate(async()=>{const h=await(await fetch('/api/health')).json(),headers={'X-Zhezhi-Token':h.token},name=document.querySelector('[aria-label="工程名称"]').value;const {projects}=await(await fetch('/api/projects',{headers})).json();const project=projects.find(p=>p.name===name);if(!project)throw Error('Saved project not listed');return(await(await fetch('/api/projects/'+project.id,{headers})).json()).doc;});}
 async function open(name){await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(path.join(fixtures,name));}
 async function opened(name){await open(name);await page.locator('.toast').filter({hasText:'已打开“'+name+'”'}).waitFor();await page.locator('.import-status').waitFor({state:'detached'});}
 async function download(click){
  const cdp=await browser.newBrowserCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'default',eventsEnabled:true});
  let timer;const completion=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Native Blob download timed out')),30000);cdp.on('Browser.downloadProgress',event=>{if(event.state==='completed'){clearTimeout(timer);resolve(event);}else if(event.state==='canceled'){clearTimeout(timer);reject(Error('Native download cancelled'));}});});
  try{await click();const result=await completion;assert(result.filePath&&path.resolve(result.filePath).startsWith(profile+path.sep),'download stays in isolated profile');assert(fs.statSync(result.filePath).size>0);return result.filePath;}finally{clearTimeout(timer);await cdp.detach();}
 }
 if(stage==='all'||stage==='imports'){
  await button('折痕编辑').click();
  for(const name of valid){await opened(name);pass(await page.locator('#workspace [data-segment]').count()===5,name+' imports five actual segments');await save();}
  const baseline=await snapshot(),failure=page.getByRole('dialog',{name:'未能导入文件',exact:true});
  for(const [name,reason]of [['invalid-utf8.CP','编码'],['invalid-record.CP','格式'],['invalid-geometry.opx','数组']]){
   await open(name);await failure.waitFor();pass((await failure.innerText()).includes(reason),name+' shows a visible reason');await failure.getByRole('button',{name:'知道了',exact:true}).click();assert.deepEqual(await snapshot(),baseline);pass(true,name+' preserves complete current document');
  }
  await opened('former-limit-grid.cp');pass(await page.locator('#workspace [data-segment]').count()===13284,'former 13284-segment limit fixture now imports successfully');await save();
  await opened(valid[0]);await save();const repeated=await snapshot();await opened(valid[0]);assert.deepEqual(await snapshot(),repeated);pass(true,'same file can be imported repeatedly');
  await page.route('**/api/projects/draft',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'QA isolated draft destination unavailable'})}));
  await page.getByLabel('工程名称',{exact:true}).fill('暂存失败保留修改');await open(valid[1]);await failure.waitFor();pass((await failure.innerText()).includes('草稿暂存未完成')&&await page.getByLabel('工程名称',{exact:true}).inputValue()==='暂存失败保留修改','unavailable draft storage prevents destructive replacement');await failure.getByRole('button',{name:'知道了',exact:true}).click();await page.unroute('**/api/projects/draft');await save();
  const beforeCancel=await snapshot();
  await page.evaluate(()=>{const NativeWorker=window.Worker;window.__qaNativeWorker=NativeWorker;window.Worker=class extends NativeWorker{postMessage(message,...args){if(message.file?.name==='slow.cp'){const handler=this.onmessage;this.onmessage=event=>{if(event.data?.type==='result')window.__qaDeliverLate=()=>handler.call(this,event);else handler.call(this,event);};}return super.postMessage(message,...args);}};});
  try{await open('slow.cp');await exact('取消导入').waitFor();await page.waitForFunction(()=>typeof window.__qaDeliverLate==='function');await exact('取消导入').click();await page.evaluate(()=>window.__qaDeliverLate());await delay(200);assert.deepEqual(await snapshot(),beforeCancel);pass(true,'cancelled import ignores a late actual parser result');}finally{await page.evaluate(()=>{window.Worker=window.__qaNativeWorker;delete window.__qaNativeWorker;delete window.__qaDeliverLate;});}
  await opened('unicode-geometry.opx');const opxDoc=await snapshot();pass(opxDoc.name==='OPX 中文 & 对角线'&&opxDoc.segments.length===5,'OPX Chinese entities and geometry retained');assert.deepEqual(opxDoc.segments.map(s=>[s.assignment,...s.a,...s.b]),cpRows.map(r=>[r[0]===1?'B':'M',...r.slice(1)]));
  await exact('计算平折').click();await page.waitForFunction(()=>document.querySelectorAll('.flat-view svg polygon').length>=2&&document.body.innerText.includes('已找到符合引擎约束的平折层序解'),{},{timeout:30000});pass(true,'real packaged flat-fold worker computes multiple faces and layer order');await page.screenshot({path:path.join(out,'opx-flat-fold.png')});
 }
 if(stage==='all'||stage==='ring3d'){
  await button('镶嵌设计').click();await button('环状镶嵌').click();await page.getByText('72 顶点',{exact:false}).first().waitFor({timeout:30000});
  await exact('计算平折').click();await page.waitForFunction(()=>document.body.innerText.includes('层序已解'),{},{timeout:30000});
  const slider=page.getByRole('slider',{name:'旋转角度滑条',exact:true}),before=await slider.inputValue();const response=page.waitForResponse(r=>r.url().includes('/api/tessellate')&&r.status()===200);await slider.focus();await slider.press('ArrowRight');await response;assert.notEqual(await slider.inputValue(),before);await page.waitForFunction(()=>document.body.innerText.includes('层序已解'),{},{timeout:30000});pass(true,'ring parameter changes regenerate real Python geometry and flat fold');
  await button('采用折痕副本').click();await button('三维模拟').click();await exact('载入当前折痕').click();
  await page.waitForFunction(()=>{const canvas=document.querySelector('iframe')?.contentDocument?.querySelector('#simulation');return canvas&&['webgl2','cpu'].includes(canvas.dataset.backend)&&Number(canvas.dataset.steps)>0;},{},{timeout:30000});
  const frame=page.frames().find(f=>f.url().includes('/simulator/'));assert(frame);const imageBefore=await frame.locator('canvas').first().screenshot();const target=page.getByRole('spinbutton',{name:'目标折叠比例数字',exact:true});await target.fill('25');await target.press('Enter');await delay(1600);const imageAfter=await frame.locator('canvas').first().screenshot();assert(!imageBefore.equals(imageAfter));
  report.simulator=await frame.locator('#simulation').evaluate(e=>({backend:e.dataset.backend,status:e.dataset.status,steps:Number(e.dataset.steps)}));pass(report.simulator.steps>0&&report.simulator.status!=='error','actual 3D solver steps and changed fold canvas');await page.screenshot({path:path.join(out,'ring-3d.png')});
 }
 if(stage==='all'||stage==='diagram'){
  await button('折痕编辑').click();await opened('cp-lf.CP');await save();
  await button('折序绘图').click();await button('新建绘图').click();
  await exact('更多属性').click();await page.locator('[aria-label="折序属性"]').getByRole('button',{name:'工程',exact:true}).click();await exact('从当前 CP 新建折序工程').click();await exact('打开并替换').click();
  await exact('计算操作前 CP').click();await page.waitForFunction(()=>document.body.innerText.includes('层序已确认'),{},{timeout:30000});
  await button('下一步').click();await page.waitForFunction(()=>document.body.innerText.includes('第 2 / 2 步')&&document.body.innerText.includes('层序已确认'),{},{timeout:30000});
  if(!await page.locator('#diagram-advanced-properties').isVisible())await exact('更多属性').click();
  await page.locator('[aria-label="折序属性"]').getByRole('button',{name:'工程',exact:true}).click();await exact('保存折序工程').click();
  await exact('导出 PDF 图解').click();await page.getByLabel('作品标题',{exact:true}).fill('Tauri 实包验收图解');
  report.pdfDownload=await download(()=>exact('导出 PDF').click());pass(fs.readFileSync(report.pdfDownload).subarray(0,5).toString()==='%PDF-','two-step diagram exports a real native PDF file');await page.screenshot({path:path.join(out,'diagram-pdf.png')});await exact('关闭 PDF 导出').click();
 }
 if(stage==='all'||stage==='logs'){
  await page.getByRole('button',{name:'帮助与版本',exact:true}).click();await exact('查看与导出工作日志').click();const dialog=page.getByRole('dialog',{name:'工作日志',exact:true});await dialog.waitFor();await exact('导出日志').waitFor({state:'visible'});
  report.logDownload=await download(()=>exact('导出日志').click());const log=JSON.parse(fs.readFileSync(report.logDownload,'utf8'));pass(log.format==='zhezhi-activity-log'&&log.entries.length>0,'actual native log download contains retained operation entries');pass(!JSON.stringify(log).includes(health.token),'session token absent from exported logs');
 }
 if(stage==='all'||stage==='prepare-close'){
  for(let i=0;i<4;i++){
   const dialogs=page.locator('dialog[open]'),before=await dialogs.count();if(!before)break;
   await dialogs.last().getByRole('button',{name:'关闭窗口',exact:true}).click();
   await page.waitForFunction(count=>document.querySelectorAll('dialog[open]').length<count,before);
  }
  report.artworkDownload=await download(()=>exact('保存完整作品').click());pass(JSON.parse(fs.readFileSync(report.artworkDownload,'utf8')).format==='zhezhi-artwork','full artwork saved through actual UI before native close');
 }
 pass(report.errors.length===0,'no page errors');pass(report.blockedExternalRequests.length===0,'no external network needed during acceptance');
 report.completed=true;
})().catch(async error=>{report.error=String(error.stack||error);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}).finally(async()=>{if(browser)await browser.close().catch(()=>{});report.passed=!!report.completed;fs.writeFileSync(path.join(out,'gui-'+stage+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));});
