const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

const root=path.resolve(__dirname,'../..');
const windows={skip:process.platform!=='win32'};
const powershell=path.join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');

function fixture(){
  const base=fs.realpathSync(os.tmpdir()),directory=fs.mkdtempSync(path.join(base,'zhezhi-launcher-test-'));
  const workbench=path.join(directory,'workbench'),scripts=path.join(workbench,'scripts'),release=path.join(workbench,'release'),record=path.join(directory,'launch.json');
  fs.mkdirSync(scripts,{recursive:true});fs.mkdirSync(release);
  fs.writeFileSync(path.join(workbench,'package.json'),JSON.stringify({name:'zhezhi-workbench',description:'中文项目',version:'0.13.14'}));
  fs.copyFileSync(path.join(root,'scripts','launch-desktop.ps1'),path.join(scripts,'launch-desktop.ps1'));
  for(const name of ['启动折纸工坊.cmd','打开折纸工坊桌面版.cmd','打开折纸工坊浏览器版.cmd'])fs.copyFileSync(path.join(root,'..',name),path.join(directory,name));
  fs.writeFileSync(path.join(workbench,'launch.ps1'),[
    'param([int]$Port=8787,[switch]$NoBrowser)',
    '[IO.File]::WriteAllText($env:ZHEZHI_LAUNCHER_TEST_OUTPUT,(@{kind="browser";port=$Port;noBrowser=[bool]$NoBrowser}|ConvertTo-Json -Compress))',
    'exit 0',
  ].join('\r\n'));
  const wrapper=path.join(directory,'mock-launch.ps1');
  fs.writeFileSync(wrapper,[
    'function Start-Process {',
    '  param([string]$FilePath,[string]$WorkingDirectory)',
    '  [IO.File]::WriteAllText($env:ZHEZHI_LAUNCHER_TEST_OUTPUT,(@{kind="desktop";filePath=$FilePath;workingDirectory=$WorkingDirectory}|ConvertTo-Json -Compress))',
    '}',
    '$launcher=Join-Path $env:ZHEZHI_LAUNCHER_TEST_ROOT "scripts/launch-desktop.ps1"',
    'if($env:ZHEZHI_LAUNCHER_TEST_FALLBACK -eq "1"){ & $launcher -FallbackToBrowser }else{ & $launcher }',
    'exit $LASTEXITCODE',
  ].join('\r\n'));
  const env={...process.env,ZHEZHI_LAUNCHER_TEST_ROOT:workbench,ZHEZHI_LAUNCHER_TEST_OUTPUT:record};
  return {
    directory,workbench,release,record,
    addPackage(version){const file=path.join(release,`Zhezhi-Workbench-${version}-Portable-x64.exe`);fs.writeFileSync(file,'Isolated test placeholder: never executed.');return file;},
    runHelper(fallback=false){return spawnSync(powershell,['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',wrapper],{env:{...env,ZHEZHI_LAUNCHER_TEST_FALLBACK:fallback?'1':'0'},encoding:'utf8',windowsHide:true,timeout:15000});},
    runEntry(name,args=[]){return spawnSync(process.env.ComSpec??'cmd.exe',['/d','/c','call',path.join(directory,name),...args],{env,encoding:'utf8',windowsHide:true,timeout:15000,input:''});},
    readRecord(){return JSON.parse(fs.readFileSync(record,'utf8'));},
    dispose(){assert.equal(path.dirname(directory),base);assert.match(path.basename(directory),/^zhezhi-launcher-test-/);fs.rmSync(directory,{recursive:true,force:true});},
  };
}

test('desktop launcher chooses the exact package version instead of old or lexically newer packages',windows,()=>{
  const task=fixture();try{
    for(const version of ['0.9.1','0.13.9','9.0.0'])task.addPackage(version);
    const expected=task.addPackage('0.13.14');
    const result=task.runHelper();assert.equal(result.status,0,result.stdout+result.stderr);
    assert.deepEqual(task.readRecord(),{kind:'desktop',filePath:expected,workingDirectory:task.workbench});
  }finally{task.dispose();}
});

test('desktop-only launch fails when the current package is absent even if an old package exists',windows,()=>{
  const task=fixture();try{
    task.addPackage('0.9.1');const result=task.runHelper();
    assert.equal(result.status,1,result.stdout+result.stderr);assert.match(result.stdout,/v0\.13\.14 was not found/);
    assert.equal(fs.existsSync(task.record),false);
  }finally{task.dispose();}
});

test('default root entry falls back to the browser when the current desktop package is absent',windows,()=>{
  const task=fixture();try{
    task.addPackage('0.9.1');const result=task.runEntry('启动折纸工坊.cmd');
    assert.equal(result.status,0,result.stdout+result.stderr);
    assert.deepEqual(task.readRecord(),{kind:'browser',port:8787,noBrowser:false});
  }finally{task.dispose();}
});

test('root entry preserves browser launch parameters even when a current desktop package exists',windows,()=>{
  const task=fixture();try{
    task.addPackage('0.13.14');const result=task.runEntry('启动折纸工坊.cmd',['-Port','54321','-NoBrowser']);
    assert.equal(result.status,0,result.stdout+result.stderr);
    assert.deepEqual(task.readRecord(),{kind:'browser',port:54321,noBrowser:true});
  }finally{task.dispose();}
});

test('invalid package versions cannot select an unrelated executable or trigger browser fallback',windows,()=>{
  const task=fixture();try{
    task.addPackage('0.9.1');fs.writeFileSync(path.join(task.workbench,'package.json'),JSON.stringify({version:'../0.9.1'}));
    const result=task.runHelper(true);assert.equal(result.status,1,result.stdout+result.stderr);
    assert.match(result.stdout,/valid application version/);assert.equal(fs.existsSync(task.record),false);
  }finally{task.dispose();}
});
