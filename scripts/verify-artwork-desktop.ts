/** Development Electron acceptance. Requires a current `npm run build`; does not package. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {blankDoc} from '../src/app/state';
import {exportArtworkProject,prepareArtworkProject} from '../src/app/artworkProject';
import {emptyFoldedModelCollection,foldedModelCollectionReducer} from '../src/app/foldedModelCollection';
import {createDiagramProject,updateDiagramStep} from '../src/app/diagramProject';
import {tessPreset} from '../src/app/tessellation';
import {prepareProjectImport} from '../src/app/prepareProjectImport';
import {buildFold} from '../src/core/geometry';
import {computeFlatFold} from '../src/core/flatFold';
import {prepareSimulationDocument} from '../src/engine/simmodel';
import {DEFAULT_SIMULATION_SOLVER_SETTINGS} from '../src/engine/simSettings';
import {OrigamiModel} from '../vendor/simulator/oristudio/packages/origami-simulator/src/model';
import {ReferenceSolver} from '../vendor/simulator/oristudio/packages/origami-simulator/src/referenceSolver';

const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||path.join(root,'output/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright'));
const output=path.join(root,'output/playwright');fs.mkdirSync(output,{recursive:true});
const testRoot=fs.mkdtempSync(path.join(output,'artwork-desktop-1021-'));
const fixtures=path.join(testRoot,'fixtures'),downloads=path.join(testRoot,'downloads'),temporary=path.join(testRoot,'tmp');
for(const directory of [fixtures,downloads,temporary])fs.mkdirSync(directory);
const checks:string[]=[],errors:string[]=[],ports:number[]=[],report:any={testRoot,checks,errors,ports,scope:'真实开发版 Electron 与本机服务；原生文件选择结果在隔离主进程受控，其后生产 IPC、文件读取与前端导入均未替换；未打包。'};
const pass=(value:unknown,label:string)=>{assert.ok(value,label);checks.push(label);console.log('PASS '+label);};
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async<T>(read:()=>Promise<T>|T,description:string,timeout=30000):Promise<T>=>{const deadline=Date.now()+timeout;while(Date.now()<deadline){const value=await read();if(value)return value;await delay(100);}throw Error('Timed out: '+description);};
const closed=(port:number)=>new Promise<boolean>(resolve=>{const socket=net.createConnection({host:'127.0.0.1',port});socket.setTimeout(1000);socket.once('connect',()=>{socket.destroy();resolve(false);});socket.once('error',()=>resolve(true));socket.once('timeout',()=>{socket.destroy();resolve(true);});});

const editor=blankDoc('桌面完整作品验收',180,160),sourceRaw=blankDoc('桌面独立模型来源',100,100);
editor.metadata={author:'桌面验收',parameters:{original:17}};
editor.objects=[{id:'desktop-circle',kind:'circle',center:[30,40],radius:12,color:'#367d86'}];
sourceRaw.segments.push({id:'crease',a:[50,0],b:[50,100],assignment:'M',angle:-180});
const source=prepareProjectImport(sourceRaw),graph=buildFold(source).graph,result=computeFlatFold(source);
const models=foldedModelCollectionReducer(emptyFoldedModelCollection(),{type:'add',id:'desktop-model',name:'桌面独立模型',source:{doc:source,graph},result});
let diagram=createDiagramProject(blankDoc('桌面独立折序',120,110));
diagram=updateDiagramStep(diagram,diagram.activeStepId,{title:'桌面第一步',description:'重启后恢复说明'});
const simSource=JSON.parse(JSON.stringify(graph)),solver=new ReferenceSolver(new OrigamiModel(prepareSimulationDocument(simSource).prepared),{...DEFAULT_SIMULATION_SOLVER_SETTINGS,foldPercent:37});
solver.step(40);const initial=solver.capturePose();solver.setVertexConstraint(0,initial.positions.slice(0,3) as [number,number,number]);
const pose=solver.capturePose();solver.dispose();
const text=exportArtworkProject({editor,models,diagram,simulation:{version:1,source:simSource,solver:pose,progress:.37,settings:{...DEFAULT_SIMULATION_SOLVER_SETTINGS},view:{yaw:.62,pitch:.41,zoom:1.3}},construction:{tessellation:tessPreset('ring'),curve:null}});
const expected=JSON.parse(text),largeName='large-valid.zhezhi-artwork.json',badName='damaged.zhezhi-artwork.json',oversizedName='oversized.zhezhi-artwork.json';
// Legal JSON whitespace proves the native boundary accepts a complete artwork
// between the previous 16 MiB limit and the current 32 MiB limit.
fs.writeFileSync(path.join(fixtures,largeName),text+' '.repeat(17*1024*1024));
const bad=JSON.parse(text);bad.construction.tessellation={family:'invalid'};fs.writeFileSync(path.join(fixtures,badName),JSON.stringify(bad));
fs.writeFileSync(path.join(fixtures,oversizedName),' '.repeat(32*1024*1024+1));
prepareArtworkProject(fs.readFileSync(path.join(fixtures,largeName),'utf8'));
if(process.argv.includes('--prepare-only')){console.log(JSON.stringify({testRoot,largeBytes:fs.statSync(path.join(fixtures,largeName)).size,fixtureValidated:true}));process.exit(0);}

let application:any,page:any,child:any,logs='';
async function launch(){
  const env={...process.env,ZHEZHI_DESKTOP_TEST_DATA:testRoot,TEMP:temporary,TMP:temporary};
  for(const key of Object.keys(env))if(key.startsWith('PORTABLE_')||['ELECTRON_RUN_AS_NODE','ZHEZHI_DIST_DIR','ZHEZHI_DESKTOP_PREFERENCES_TEST','ZHEZHI_DESKTOP_STORAGE_TEST'].includes(key))delete env[key];
  application=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[root],cwd:root,env,timeout:45000});
  child=application.process();child.stdout?.on('data',(data:Buffer)=>{logs+=data;});child.stderr?.on('data',(data:Buffer)=>{logs+=data;});
  page=await until(()=>application.windows().find((candidate:any)=>candidate.url().startsWith('http://127.0.0.1:')),'desktop main window',45000);
  await page.locator('.app-header').waitFor({timeout:30000});page.on('pageerror',(error:Error)=>errors.push(error.message));
  page.on('dialog',(dialog:any)=>{if(dialog.type()!=='beforeunload')void dialog.dismiss().catch(()=>{});});
  const identity=await application.evaluate(({app,BrowserWindow}:any)=>{const window=BrowserWindow.getAllWindows().find((item:any)=>item.webContents.getURL().startsWith('http:'));return {version:app.getVersion(),profile:app.getPath('userData'),isolated:process.env.ZHEZHI_DESKTOP_TEST_DATA,sandbox:window.webContents.getLastWebPreferences().sandbox,visible:window.isVisible()};});
  assert.equal(path.resolve(identity.profile),path.join(testRoot,'profile'));assert.equal(identity.isolated,testRoot);assert.equal(identity.sandbox,true);
  report.identity=identity;report.pid=child.pid;const port=Number(new URL(page.url()).port);assert.ok(port!==8933&&port!==8934&&port!==8787);ports.push(port);
  const setup=page.getByRole('button',{name:'设置并开始使用',exact:true});if(await setup.isVisible().catch(()=>false))await setup.click();
  await page.locator('[data-storage-settings]').waitFor({state:'detached'});
  await application.evaluate(({dialog,BrowserWindow}:any,{downloads}:any)=>{
    (globalThis as any).__artworkPicker={path:null,cancel:false,calls:0};(globalThis as any).__artworkDownloads=[];
    dialog.showOpenDialog=async(_owner:any,options:any)=>{if(options.title!=='打开折痕工程')throw Error('Unexpected picker');const next=(globalThis as any).__artworkPicker;next.calls++;return next.cancel?{canceled:true,filePaths:[]}:{canceled:false,filePaths:[next.path]};};
    const owner=BrowserWindow.getAllWindows().find((item:any)=>item.webContents.getURL().startsWith('http:'));
    owner.webContents.session.on('will-download',(_event:any,item:any)=>{const file=downloads+'/'+Date.now()+'-'+item.getFilename();item.setSavePath(file);item.once('done',(_event:any,state:string)=>(globalThis as any).__artworkDownloads.push({file,state}));});
  },{downloads});
  await page.evaluate(()=>{(window as any).__desktopStatuses=[];window.addEventListener('message',event=>{if(event.data?.type==='zhezhi-sim-status')(window as any).__desktopStatuses.push(event.data);});});
  return identity;
}
async function openFile(name:string,cancel=false){await application.evaluate((_electron:any,value:any)=>{Object.assign((globalThis as any).__artworkPicker,value);},{path:path.join(fixtures,name),cancel});await page.getByRole('button',{name:'打开文件',exact:true}).click({noWaitAfter:true});}
async function waitRestored(){await page.waitForFunction(()=>document.querySelector<HTMLInputElement>('[aria-label="工程名称"]')?.value==='桌面完整作品验收');await page.waitForFunction(()=>(window as any).__desktopStatuses.some((status:any)=>status.backend&&status.poseRestored&&status.status==='paused'),null,{timeout:45000});}
async function saveArtwork(){const n=await application.evaluate(()=>(globalThis as any).__artworkDownloads.length);await page.getByRole('button',{name:'保存完整作品',exact:true}).click();const done:any=await until(()=>application.evaluate((_electron:any,n:number)=>(globalThis as any).__artworkDownloads[n],n),'complete artwork download');assert.equal(done.state,'completed');return JSON.parse(fs.readFileSync(done.file,'utf8'));}
function assertContents(saved:any){assert.deepEqual(saved.editor,expected.editor);assert.deepEqual(saved.models,expected.models);assert.deepEqual(saved.construction,expected.construction);assert.deepEqual(saved.diagram,expected.diagram);assert.equal(saved.simulation.progress,.37);assert.deepEqual(saved.simulation.view,expected.simulation.view);assert.deepEqual(saved.simulation.solver.pins,expected.simulation.solver.pins);assert.deepEqual(saved.simulation.source,expected.simulation.source);assert.ok(Math.max(...saved.simulation.solver.positions.map((n:number,i:number)=>Math.abs(n-expected.simulation.solver.positions[i])))<1e-6);}
async function closeWithAnswer(accept:boolean){
  const popup=application.waitForEvent('window',{timeout:15000});
  await application.evaluate(({BrowserWindow}:any)=>{BrowserWindow.getAllWindows().find((item:any)=>item.webContents.getURL().startsWith('http:')).close();}).catch((error:Error)=>{if(!/closed|Target/.test(error.message))throw error;});
  const confirmation=await popup;await confirmation.locator('#message-cancel').waitFor();
  const detail=await confirmation.locator('#message-detail').innerText();assert.match(detail,/最近成功暂存/);assert.match(detail,/尚未暂存/);assert.ok(!detail.includes('自动恢复仅包含原始折痕'));
  const exited=accept?application.waitForEvent('close',{timeout:15000}):null;
  await confirmation.locator(accept?'#message-accept':'#message-cancel').click({noWaitAfter:true}).catch((error:Error)=>{if(!/closed|Target/.test(error.message))throw error;});
  if(exited){await exited;assert.equal(child.exitCode,0);application=null;}
}

try{
  const html=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');report.bundle=(html.match(/src="([^"]+\.js)"/)??[])[1];
  await launch();pass(true,'真实 Electron 入口使用独立 profile/data、随机端口，renderer sandbox 保持开启');
  await page.getByRole('button',{name:/作品总览/}).waitFor();pass(true,'当前构建包含新版作品总览入口');
  await openFile(largeName);await waitRestored();pass(true,'超过 16 MiB 的合法完整作品经真实桌面文件桥打开，三维以暂停姿态恢复');
  const saved=await saveArtwork();assertContents(saved);pass(true,'桌面真实下载保留辅助圆、元数据、独立模型与来源、折序、构造参数、三维固定点和视角');
  pass((await page.locator('.document-name').innerText()).includes('未保存'),'下载完整作品不会清除折痕独立文档的未保存标记');
  const disk:any=await until(()=>{const directory=path.join(testRoot,'data');for(const name of fs.readdirSync(directory).filter(name=>/^artwork-recovery-.*\.json$/.test(name))){const raw=JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));if(raw.artwork?.editor?.name===editor.name&&raw.artwork.simulation)return {name,raw};}return null;},'complete disk recovery',45000);
  assertContents(disk.raw.artwork);report.recoveryId=disk.raw.id;pass(true,'真实本机服务已将完整恢复副本写入隔离磁盘目录');
  const failure=page.getByRole('dialog',{name:'未能导入文件',exact:true});
  for(const [name,message]of [[badName,'镶嵌构造参数'],[oversizedName,'32 MiB']]){await openFile(name);await failure.waitFor();assert.match(await failure.innerText(),new RegExp(message));await failure.getByRole('button',{name:'知道了',exact:true}).click();assertContents(await saveArtwork());pass(true,name+'明确报错，原完整作品所有模块保持');}
  const beforeCalls=await application.evaluate(()=>(globalThis as any).__artworkPicker.calls);await openFile(largeName,true);await delay(150);assert.equal(await application.evaluate(()=>(globalThis as any).__artworkPicker.calls),beforeCalls+1);assertContents(await saveArtwork());pass(true,'原生选择取消后作品与三维姿态保持');
  await application.evaluate(({BrowserWindow}:any)=>{const owner=BrowserWindow.getAllWindows().find((item:any)=>item.webContents.getURL().startsWith('http:'));owner.setContentSize(1366,768);});
  await page.screenshot({path:path.join(testRoot,'desktop-complete-artwork.png')});
  await closeWithAnswer(false);assertContents(await saveArtwork());pass(true,'BrowserWindow.close 触发真实关闭确认，取消后作品保留且提示说明完整恢复边界');
  await closeWithAnswer(true);pass(true,'确认关闭后开发版 Electron 正常退出，退出码 0');
  await launch();await page.getByRole('button',{name:/作品总览.*可恢复/}).waitFor();pass(true,'同一隔离目录重启后首屏直接发现完整恢复副本');
  await page.getByRole('button',{name:/作品总览/}).click();const overview=page.getByRole('dialog',{name:'作品总览与恢复',exact:true});await overview.waitFor();
  const entry=overview.locator('.artwork-recovery-list li').filter({hasText:editor.name}).first();await entry.getByRole('button',{name:'恢复此作品',exact:true}).click();await waitRestored();assertContents(await saveArtwork());pass(true,'重启后从恢复目录恢复全部模块，三维姿态与固定点保持，无旧空模块串入');
  await page.getByRole('button',{name:/作品总览/}).click();await page.screenshot({path:path.join(testRoot,'desktop-recovered-overview.png')});await page.getByRole('dialog',{name:'作品总览与恢复',exact:true}).getByRole('button',{name:'关闭窗口',exact:true}).click();
  pass(errors.length===0,'真实桌面导入、下载、关闭与重启恢复无 renderer 异常');
  await closeWithAnswer(true);pass(true,'恢复后仍可走原生关闭流程并正常退出');report.completed=true;
}catch(error){report.error=String((error as Error).stack||error);process.exitCode=1;if(page&&!page.isClosed())await page.screenshot({path:path.join(testRoot,'failure.png')}).catch(()=>{});}
finally{
  if(application){await application.evaluate(({app,BrowserWindow}:any)=>{BrowserWindow.getAllWindows().forEach((window:any)=>window.destroy());app.quit();}).catch(()=>{});await application.close().catch(()=>{});}
  report.cleanup=await Promise.all(ports.map(async port=>({port,closed:await closed(port)})));report.passed=checks.length;
  fs.writeFileSync(path.join(testRoot,'launcher.log'),logs);fs.writeFileSync(path.join(testRoot,'result.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
