const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const playwright=require(process.env.PLAYWRIGHT_MODULE||'../output/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright');
exports.launch=async options=>{
  const log=fs.createWriteStream(path.join(options.env.ZHEZHI_DESKTOP_TEST_DATA,'portable-launch.log'),{flags:'w'});
  const child=spawn(options.executablePath,['--inspect=127.0.0.1:9240','--remote-debugging-port=9237','--remote-debugging-address=127.0.0.1'],{cwd:options.cwd,env:{...options.env,ZHEZHI_DESKTOP_TEST_DATA:options.env.ZHEZHI_DESKTOP_TEST_DATA+'-portable'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(log);child.stderr.pipe(log);let info;
  for(let attempt=0;attempt<160;attempt++){
    try{info=await(await fetch('http://127.0.0.1:9240/json/list')).json();if(info[0]?.webSocketDebuggerUrl)break;}catch{}
    await new Promise(r=>setTimeout(r,250));
  }
  if(!info?.[0]?.webSocketDebuggerUrl)throw Error('Portable inspector startup timed out');
  const ws=new WebSocket(info[0].webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let serial=0;const waiting=new Map();ws.onmessage=e=>{const data=JSON.parse(e.data);const pending=waiting.get(data.id);if(pending){waiting.delete(data.id);data.error?pending.reject(Error(JSON.stringify(data.error))):pending.resolve(data.result);}};
  const evaluate=async fn=>{
    const expression=`(${fn.toString()})(process.getBuiltinModule('module').createRequire(process.resourcesPath+'/app.asar/package.json')('electron'))`;
    const result=await new Promise((resolve,reject)=>{const id=++serial;waiting.set(id,{resolve,reject});ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));});
    if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;
  };
  let browser;
  for(let attempt=0;attempt<100;attempt++){
    try{browser=await playwright.chromium.connectOverCDP('http://127.0.0.1:9237',{timeout:1000});break;}catch{}
    await new Promise(r=>setTimeout(r,250));
  }
  if(!browser)throw Error('Portable renderer startup timed out');
  const executable=await evaluate(()=>({pid:process.pid,resources:process.resourcesPath,portable:process.env.PORTABLE_EXECUTABLE_FILE,isolated:process.env.ZHEZHI_DESKTOP_TEST_DATA}));
  if(path.resolve(executable.portable||'')!==path.resolve(options.executablePath)||executable.isolated!==options.env.ZHEZHI_DESKTOP_TEST_DATA+'-portable')throw Error('Refusing a debugger endpoint outside this isolated portable test');
  fs.writeFileSync(path.join(options.env.ZHEZHI_DESKTOP_TEST_DATA,'actual-portable-process.json'),JSON.stringify(executable,null,2));
  return {evaluate,firstWindow:async()=>{for(let n=0;n<100;n++){const page=browser.contexts()[0]?.pages()[0];if(page)return page;await new Promise(r=>setTimeout(r,100));}throw Error('No portable window');},close:async()=>{ws.close();await browser.close().catch(()=>{});if(child.exitCode===null)child.kill();log.end();}};
};
