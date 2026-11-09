const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {createPreferences,registerPreferences}=require('../../desktop/preferences.cjs');

test('preferences persist on disk; invalid writes and damaged files preserve existing data',()=>{
  const base=fs.realpathSync(os.tmpdir()),directory=fs.mkdtempSync(path.join(base,'zhezhi-preferences-test-')),file=path.join(directory,'preferences.json');
  try{
    const store=createPreferences(file);store.setItem('zhezhi.theme.v1','{"version":1,"theme":"dark"}');
    assert.equal(createPreferences(file).getItem('zhezhi.theme.v1'),'{"version":1,"theme":"dark"}');
    const prior=fs.readFileSync(file,'utf8');
    for(const key of ['../projects','__proto__','zhezhi-recovery'])assert.throws(()=>store.setItem(key,'x'));
    assert.throws(()=>store.setItem('zhezhi.theme.v1','x'.repeat(256*1024)));
    assert.equal(fs.readFileSync(file,'utf8'),prior);assert.deepEqual(fs.readdirSync(directory),['preferences.json']);
    fs.writeFileSync(file,'broken');assert.throws(()=>store.setItem('zhezhi.theme.v1','light'));
    assert.equal(fs.readFileSync(file,'utf8'),'broken');
  }finally{assert.equal(path.dirname(directory),base);assert.match(path.basename(directory),/^zhezhi-preferences-test-/);fs.rmSync(directory,{recursive:true,force:true});}
});

test('diagram drafts above former file limits persist independently of ordinary preferences',()=>{
  const base=fs.realpathSync(os.tmpdir()),directory=fs.mkdtempSync(path.join(base,'zhezhi-preferences-test-')),file=path.join(directory,'preferences.json');
  try{
    const key='zhezhi.diagram-project.v1',store=createPreferences(file);
    const draft=JSON.stringify({name:'折序工程',description:'折'.repeat(120_000)});
    assert.ok(Buffer.byteLength(draft)>256*1024);
    store.setItem('zhezhi.theme.v1','dark');store.setItem(key,draft);
    assert.equal(createPreferences(file).getItem(key),draft);
    assert.equal(createPreferences(file).getItem('zhezhi.theme.v1'),'dark');
    const exactLimit=JSON.stringify({description:'x'.repeat(8_000_000-Buffer.byteLength(JSON.stringify({description:''})))});
    assert.equal(Buffer.byteLength(exactLimit),8_000_000);
    store.setItem(key,exactLimit);assert.equal(createPreferences(file).getItem(key),exactLimit);
    const large=JSON.stringify({description:'x'.repeat(32*1024*1024+1)});
    store.setItem(key,large);assert.equal(createPreferences(file).getItem(key),large);
    const unicode=JSON.stringify({description:'折'.repeat(2_666_667)});
    store.setItem(key,unicode);assert.equal(createPreferences(file).getItem(key),unicode);
    assert.deepEqual(fs.readdirSync(directory).sort(),['preferences.json',key+'.json']);
    assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(file,'utf8')),key),false);
  }finally{assert.equal(path.dirname(directory),base);assert.match(path.basename(directory),/^zhezhi-preferences-test-/);fs.rmSync(directory,{recursive:true,force:true});}
});

test('ordinary preferences keep the 256 KiB aggregate limit when a diagram draft is present',()=>{
  const base=fs.realpathSync(os.tmpdir()),directory=fs.mkdtempSync(path.join(base,'zhezhi-preferences-test-')),file=path.join(directory,'preferences.json');
  try{
    const key='zhezhi.theme.v1',store=createPreferences(file);
    const value='x'.repeat(256*1024-Buffer.byteLength(JSON.stringify({[key]:''})));
    assert.equal(Buffer.byteLength(JSON.stringify({[key]:value})),256*1024);
    store.setItem(key,value);store.setItem('zhezhi.diagram-project.v1',JSON.stringify({draft:'x'.repeat(400_000)}));
    assert.equal(createPreferences(file).getItem(key),value);
    const prior=fs.readFileSync(file,'utf8');
    assert.throws(()=>store.setItem(key,value+'x'));
    assert.throws(()=>store.setItem('zhezhi.angle-settings.v1','x'));
    assert.throws(()=>store.setItem(key,'折'.repeat(90_000)));
    assert.equal(fs.readFileSync(file,'utf8'),prior);
  }finally{assert.equal(path.dirname(directory),base);assert.match(path.basename(directory),/^zhezhi-preferences-test-/);fs.rmSync(directory,{recursive:true,force:true});}
});

test('large crease-library indexes do not consume the ordinary settings budget',()=>{
  const task=isolated();try{
    const key='zhezhi.crease-library.v1',store=createPreferences(task.file),index=JSON.stringify({version:1,folders:[],documents:{},lastOpenId:null,padding:'x'.repeat(1_000_001)});
    store.setItem('zhezhi.theme.v1','dark');store.setItem(key,index);
    assert.equal(createPreferences(task.file).getItem(key),index);assert.equal(store.getItem('zhezhi.theme.v1'),'dark');
    assert.throws(()=>store.setItem('zhezhi.theme.v1','x'.repeat(256*1024)));
    assert.equal(createPreferences(task.file).getItem(key),index);assert.equal(store.getItem('zhezhi.theme.v1'),'dark');
  }finally{task.dispose();}
});

test('large escaped diagram strings and legacy combined files migrate without a byte ceiling',()=>{
  const base=fs.realpathSync(os.tmpdir()),directory=fs.mkdtempSync(path.join(base,'zhezhi-preferences-test-')),file=path.join(directory,'preferences.json');
  try{
    const key='zhezhi.diagram-project.v1',store=createPreferences(file),escaped='\u0000'.repeat(9_000_000);
    store.setItem(key,escaped);assert.ok(fs.statSync(path.join(directory,key+'.json')).size>8_000_000);
    assert.equal(createPreferences(file).getItem(key),escaped);
    store.setItem(key,'');
    const legacy='x'.repeat(8_000_001);fs.writeFileSync(file,JSON.stringify({[key]:legacy}));
    assert.equal(store.getItem(key),legacy);
    assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(file,'utf8')),key),false);
  }finally{assert.equal(path.dirname(directory),base);assert.match(path.basename(directory),/^zhezhi-preferences-test-/);fs.rmSync(directory,{recursive:true,force:true});}
});

test('diagram library saved and draft records persist independently without raising ordinary preference limits',()=>{
  const base=fs.realpathSync(os.tmpdir()),directory=fs.mkdtempSync(path.join(base,'zhezhi-preferences-test-')),file=path.join(directory,'preferences.json');
  try{
    const store=createPreferences(file),index='zhezhi.diagram-library.v1',saved='zhezhi.diagram-library-doc-aabb.v1',draft='zhezhi.diagram-library-doc-ccdd.v1';
    const snapshot=JSON.stringify({name:'独立图解',description:'折'.repeat(100_000)});
    store.setItem(index,JSON.stringify({documents:[{savedKey:saved,draftKey:draft}]}));store.setItem(saved,snapshot);store.setItem(draft,snapshot+' ');
    store.setItem('zhezhi.theme.v1','dark');store.setItem('zhezhi.diagram-project.v1',snapshot);
    const reloaded=createPreferences(file);assert.equal(reloaded.getItem(saved),snapshot);assert.equal(reloaded.getItem(draft),snapshot+' ');assert.equal(reloaded.getItem('zhezhi.theme.v1'),'dark');
    const large='x'.repeat(8_500_001);store.setItem(saved,large);assert.equal(createPreferences(file).getItem(saved),large);
    const largeIndex='x'.repeat(1_000_001);store.setItem(index,largeIndex);assert.equal(createPreferences(file).getItem(index),largeIndex);
    const prior=fs.readFileSync(file,'utf8');
    assert.throws(()=>store.setItem('zhezhi.theme.v1','x'.repeat(256*1024)));
    assert.equal(fs.readFileSync(file,'utf8'),prior);
    store.setItem(draft,'');assert.equal(store.getItem(saved),large);assert.equal(store.getItem(draft),'');
  }finally{assert.equal(path.dirname(directory),base);assert.match(path.basename(directory),/^zhezhi-preferences-test-/);fs.rmSync(directory,{recursive:true,force:true});}
});

test('preference IPC rejects subframes and foreign pages before accessing storage',()=>{
  let handler;const mainFrame={url:'http://127.0.0.1:54321/'},webContents={mainFrame};
  registerPreferences({on:(channel,callback)=>{assert.equal(channel,'desktop:preferences');handler=callback;}},()=>({webContents}),'http://127.0.0.1:54321',path.join(os.tmpdir(),'must-not-write-preferences.json'));
  for(const event of [{sender:{},senderFrame:mainFrame},{sender:webContents,senderFrame:{url:mainFrame.url}}]){
    handler(event,'set','zhezhi.theme.v1','dark');assert.ok(event.returnValue.error);
  }
  mainFrame.url='https://external.example/';const event={sender:webContents,senderFrame:mainFrame};handler(event,'set','zhezhi.theme.v1','dark');assert.ok(event.returnValue.error);
});

function isolated(){
  const base=fs.realpathSync(os.tmpdir()),directory=fs.mkdtempSync(path.join(base,'zhezhi-preferences-test-')),file=path.join(directory,'preferences.json');
  const dispose=()=>{assert.equal(path.dirname(directory),base);assert.match(path.basename(directory),/^zhezhi-preferences-test-/);fs.rmSync(directory,{recursive:true,force:true});};
  return {directory,file,dispose};
}
const documentKey=index=>'zhezhi.diagram-library-doc-'+index.toString(16).replace(/[0-9a-f]/g,c=>'abcdefghijklmnop'[parseInt(c,16)])+'.v1';

test('legacy records migrate once with empty deletion tombstones and ordinary settings intact',()=>{
  const task=isolated();try{
    const saved=documentKey(1),deleted=documentKey(2),legacy={'zhezhi.theme.v1':'dark','zhezhi.diagram-project.v1':'legacy draft','zhezhi.diagram-library.v1':'library',[saved]:'saved snapshot',[deleted]:''};
    fs.writeFileSync(task.file,JSON.stringify(legacy));const store=createPreferences(task.file);
    assert.equal(store.getItem(saved),'saved snapshot');assert.equal(store.getItem(deleted),'');assert.equal(store.getItem('zhezhi.theme.v1'),'dark');
    const migrated=JSON.parse(fs.readFileSync(task.file,'utf8'));assert.equal(Object.hasOwn(migrated,saved),false);assert.equal(migrated[deleted],'');
    assert.equal(JSON.parse(fs.readFileSync(path.join(task.directory,saved+'.json'),'utf8')),'saved snapshot');
    assert.equal(createPreferences(task.file).getItem('zhezhi.diagram-project.v1'),'legacy draft');
  }finally{task.dispose();}
});

test('conflicting and partially copied legacy migration preserves the authoritative aggregate and both snapshots',()=>{
  const task=isolated();try{
    const a=documentKey(1),b=documentKey(2),text=JSON.stringify({[a]:'old A',[b]:'old B'});fs.writeFileSync(task.file,text);
    fs.writeFileSync(path.join(task.directory,a+'.json'),JSON.stringify('old A'));fs.writeFileSync(path.join(task.directory,b+'.json'),JSON.stringify('different B'));
    const store=createPreferences(task.file);assert.throws(()=>store.getItem(a),/不同/);assert.throws(()=>store.setItem(a,'replacement'),/不同/);
    assert.equal(fs.readFileSync(task.file,'utf8'),text);assert.equal(JSON.parse(fs.readFileSync(path.join(task.directory,b+'.json'),'utf8')),'different B');
  }finally{task.dispose();}
});

test('null and malformed aggregate or independent records remain untouched after read and write failures',()=>{
  const task=isolated();try{
    const key=documentKey(1),record=path.join(task.directory,key+'.json'),store=createPreferences(task.file);
    for(const value of ['null','false','[]','"wrong"','broken']){
      fs.writeFileSync(task.file,value);assert.throws(()=>store.getItem('zhezhi.theme.v1'));assert.throws(()=>store.setItem('zhezhi.theme.v1','replacement'));assert.equal(fs.readFileSync(task.file,'utf8'),value);
    }
    fs.writeFileSync(task.file,'{}');
    for(const value of ['null','{}','1','broken']){
      fs.writeFileSync(record,value);assert.throws(()=>store.getItem(key));assert.throws(()=>store.setItem(key,'replacement'));assert.throws(()=>store.compareAndSet(key,null,'replacement'));assert.equal(fs.readFileSync(record,'utf8'),value);
    }
  }finally{task.dispose();}
});

test('CAS rechecks independent replacements and keeps a deleted record distinct from an unused slot',()=>{
  const task=isolated();try{
    const key=documentKey(1),a=createPreferences(task.file),b=createPreferences(task.file);
    assert.equal(a.compareAndSet(key,null,'first'),true);assert.equal(a.getItem(key),'first');
    assert.equal(b.compareAndSet(key,'first','second'),true);assert.equal(a.getItem(key),'second');
    assert.equal(a.compareAndSet(key,'first','lost update'),false);assert.equal(a.compareAndSet(key,'second',''),true);
    assert.equal(fs.existsSync(path.join(task.directory,key+'.json')),false);assert.equal(b.getItem(key),'');assert.equal(b.compareAndSet(key,null,'revived'),false);
    assert.equal(b.compareAndSet(key,'','third'),true);assert.equal(a.getItem(key),'third');assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(task.file,'utf8')),key),false);
  }finally{task.dispose();}
});

test('relative paths address the same record and IPC library updates require CAS after initialization',()=>{
  const task=isolated();try{
    const relative=createPreferences(path.relative(process.cwd(),task.file));relative.setItem('zhezhi.theme.v1','relative');assert.equal(createPreferences(task.file).getItem('zhezhi.theme.v1'),'relative');
    let handler;const mainFrame={url:'http://127.0.0.1:54321/'},webContents={mainFrame};registerPreferences({on:(_channel,callback)=>{handler=callback;}},()=>({webContents}),'http://127.0.0.1:54321',task.file);
    const invoke=(action,key,value,expected)=>{const event={sender:webContents,senderFrame:mainFrame};handler(event,action,key,value,expected);return event.returnValue;},key='zhezhi.diagram-library.v1';
    assert.deepEqual(invoke('set',key,'first'),{value:null});assert.ok(invoke('set',key,'unsafe replacement').error);
    assert.deepEqual(invoke('compareAndSet',key,'second','first'),{value:true});assert.deepEqual(invoke('compareAndSet',key,'lost update','first'),{value:false});assert.equal(createPreferences(task.file).getItem(key),'second');
  }finally{task.dispose();}
});

test('active locks reject writes, abandoned unique markers recover, and cleanup leaves other owners untouched',()=>{
  const task=isolated();try{
    const key='zhezhi.theme.v1',store=createPreferences(task.file);store.setItem(key,'old');
    const marker=task.file+'.lock.'+process.pid+'.'+randomUUID();fs.writeFileSync(marker,'');
    assert.throws(()=>store.setItem(key,'new'),error=>error.status===409);assert.equal(store.compareAndSet(key,'old','new'),false);assert.equal(fs.existsSync(marker),true);assert.equal(store.getItem(key),'old');fs.unlinkSync(marker);
    fs.writeFileSync(task.file+'.lock',JSON.stringify({pid:process.pid}));assert.equal(store.compareAndSet(key,'old','new'),false);fs.unlinkSync(task.file+'.lock');
  }finally{task.dispose();}
});

test('simultaneous processes cannot both commit the same CAS revision',async()=>{
  const task=isolated();try{
    const key='zhezhi.theme.v1';createPreferences(task.file).setItem(key,'base');const start=path.join(task.directory,'start');
    const modulePath=path.resolve(__dirname,'../../desktop/preferences.cjs');
    const script=`const fs=require('node:fs');const {createPreferences}=require(process.argv[1]);const pause=new Int32Array(new SharedArrayBuffer(4));process.stdout.write('READY\\n');while(!fs.existsSync(process.argv[3]))Atomics.wait(pause,0,0,5);const store=createPreferences(process.argv[2]);let result=false;for(let attempt=0;attempt<20;attempt++){result=store.compareAndSet('zhezhi.theme.v1','base',process.argv[4]);if(result||store.getItem('zhezhi.theme.v1')!=='base')break;Atomics.wait(pause,0,0,2+Number(process.argv[4])*3);}process.stdout.write(JSON.stringify({result})+'\\n');`;
    const children=Array.from({length:4},(_,i)=>{
      const child=spawn(process.execPath,['-e',script,modulePath,task.file,start,String(i)],{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',errors='',ready;
      const readyPromise=new Promise(resolve=>{ready=resolve;});child.stdout.on('data',chunk=>{output+=chunk;if(output.includes('READY\n'))ready();});child.stderr.on('data',chunk=>{errors+=chunk;});
      const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve({pid:child.pid,...JSON.parse(output.trim().split('\n').at(-1))}):reject(Error(errors||output)));});
      return {child,ready:readyPromise,done};
    });
    try{
      await Promise.all(children.map(item=>item.ready));fs.writeFileSync(start,'go');const results=await Promise.all(children.map(item=>item.done));assert.equal(results.filter(row=>row.result).length,1);
      const dead=results[0].pid,marker=task.file+'.lock.'+dead+'.'+randomUUID();fs.writeFileSync(marker,'');const store=createPreferences(task.file);store.setItem(key,'after recovery');assert.equal(store.getItem(key),'after recovery');assert.equal(fs.existsSync(marker),false);
      assert.deepEqual(fs.readdirSync(task.directory).filter(name=>name.includes('.lock')),[]);
    }finally{for(const {child}of children)if(child.exitCode===null)child.kill();}
  }finally{task.dispose();}
});

test('independent libraries above 128 MB still save, migrate and preserve deletion tombstones',()=>{
  const task=isolated();try{
    const store=createPreferences(task.file),body='x'.repeat(8_500_000),text=JSON.stringify(body);
    for(let i=0;i<15;i++)fs.writeFileSync(path.join(task.directory,documentKey(i)+'.json'),text);
    store.setItem(documentKey(16),'x'.repeat(500_000));assert.equal(store.getItem(documentKey(16)).length,500_000);
    const legacy=JSON.stringify({[documentKey(17)]:'x'.repeat(1_000_000)});fs.writeFileSync(task.file,legacy);
    assert.equal(store.getItem(documentKey(17)).length,1_000_000);assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(task.file,'utf8')),documentKey(17)),false);
    store.setItem(documentKey(0),'');assert.equal(store.getItem(documentKey(0)),'');store.setItem(documentKey(16),body);assert.equal(store.getItem(documentKey(16)),body);
    store.setItem('zhezhi.diagram-library.v1','x'.repeat(500_000));assert.equal(createPreferences(task.file).getItem('zhezhi.diagram-library.v1').length,500_000);
    assert.equal(createPreferences(task.file).getItem(documentKey(0)),'');assert.equal(store.getItem(documentKey(1)),body);
  }finally{task.dispose();}
});
