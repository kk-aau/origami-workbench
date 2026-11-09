const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'output');fs.mkdirSync(output,{recursive:true});
const testRoot=fs.mkdtempSync(path.join(output,'desktop-preferences-'));
const run=phase=>new Promise((resolve,reject)=>{
  const env={...process.env,ZHEZHI_DESKTOP_TEST_DATA:testRoot,ZHEZHI_DESKTOP_PREFERENCES_TEST:phase};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(require('electron'),[root,'--desktop-smoke'],{cwd:root,windowsHide:true,env,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
  const timer=setTimeout(()=>{child.kill();reject(Error('Desktop preference test timed out: '+output));},45000);
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.once('exit',code=>{
    clearTimeout(timer);fs.writeFileSync(path.join(testRoot,phase+'.log'),output);
    if(code!==0||!output.includes('DESKTOP_SMOKE_OK'))return reject(Error('Desktop phase '+phase+' failed: '+output));
    try{const result=JSON.parse(fs.readFileSync(path.join(testRoot,'smoke-result.json'),'utf8'));fs.writeFileSync(path.join(testRoot,phase+'.json'),JSON.stringify(result,null,2));resolve(result);}catch(error){reject(error);}
  });
});
void(async()=>{
  console.log('Testing desktop preferences with isolated data: '+testRoot);
  const first=await run('write');console.log('First process wrote preferences: '+first.origin);
  // Occupy the previous port so a second OS allocation cannot accidentally reuse it.
  const blocker=net.createServer();
  await new Promise((resolve,reject)=>{blocker.once('error',reject);blocker.listen(Number(new URL(first.origin).port),'127.0.0.1',resolve);});
  try{
    const second=await run('read');
    if(first.origin===second.origin)throw Error('Expected different service ports');
    console.log('DESKTOP_PREFERENCES_RESTART_OK '+JSON.stringify({first,second,testRoot}));
  }finally{await new Promise(resolve=>blocker.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
