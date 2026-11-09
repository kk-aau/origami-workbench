const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {load}=require('js-yaml');
const {FileMatcher}=require('app-builder-lib/out/fileMatcher.js');

test('packaging includes local runtime dependencies and the staged server actually starts',async()=>{
  const root=path.resolve(__dirname,'../..'),base=fs.realpathSync(os.tmpdir()),staging=fs.mkdtempSync(path.join(base,'zhezhi-runtime-test-'));
  let child;
  try{
    const config=load(fs.readFileSync(path.join(root,'desktop/electron-builder.yml'),'utf8'));
    const filter=new FileMatcher(root,staging,s=>s,config.files).createFilter();
    const visited=new Set();
    function copyRuntime(file){
      if(visited.has(file))return;visited.add(file);
      const source=path.join(root,file);assert.ok(filter(source,fs.statSync(source)),`Missing packaged runtime: ${file}`);
      const target=path.join(staging,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
      const code=fs.readFileSync(source,'utf8');
      for(const match of code.matchAll(/(?:from\s*|require\(\s*)['"](\.[^'"]+)['"]/g))copyRuntime(path.normalize(path.join(path.dirname(file),match[1])));
    }
    for(const file of ['package.json','server.mjs','desktop/main.cjs','desktop/preload.cjs'])copyRuntime(file);
    child=spawn(process.execPath,[path.join(staging,'server.mjs')],{windowsHide:true,env:{...process.env,ZHEZHI_PORT:'0',ZHEZHI_DATA_DIR:path.join(staging,'data')},stdio:['ignore','pipe','pipe']});
    const port=await new Promise((resolve,reject)=>{
      let output='';const timer=setTimeout(()=>reject(Error('Staged server startup timed out: '+output)),10000);
      const failed=error=>{clearTimeout(timer);reject(error);};child.once('error',failed);child.once('exit',code=>failed(Error('Staged server exited '+code+': '+output)));
      child.stdout.on('data',chunk=>{output+=chunk;const match=/http:\/\/127\.0\.0\.1:(\d+)/.exec(output);if(match){clearTimeout(timer);resolve(Number(match[1]));}});
      child.stderr.on('data',chunk=>{output+=chunk;});
    });
    const health=await fetch(`http://127.0.0.1:${port}/api/health`);assert.equal(health.status,200);const session=await health.json();assert.equal(session.app,'zhezhi-workbench');
    const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;assert.equal(session.version,version);
    const activity=await fetch(`http://127.0.0.1:${port}/api/activity`,{headers:{'X-Zhezhi-Token':session.token}});assert.equal(activity.status,200);assert.equal((await activity.json()).appVersion,version);
  }finally{
    if(child&&child.exitCode===null&&child.signalCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}
    assert.equal(path.dirname(staging),base);assert.match(path.basename(staging),/^zhezhi-runtime-test-/);fs.rmSync(staging,{recursive:true,force:true});
  }
});
