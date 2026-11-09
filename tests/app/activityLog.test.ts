import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connect} from '../../src/app/api';
import {flushActivityLog,installRuntimeActivityLogging,recordActivity} from '../../src/app/activityLog';

test('activity events use the authenticated local API and exclude document data and full paths',async()=>{
  const original=globalThis.fetch,posted:Record<string,any>[]=[];
  globalThis.fetch=async(input,options)=>{
    if(input==='/api/health')return new Response(JSON.stringify({token:'test-session'}));
    assert.equal((options?.headers as Record<string,string>)['X-Zhezhi-Token'],'test-session');
    posted.push(JSON.parse(String(options?.body)));return new Response('{"ok":true}');
  };
  try{
    await connect();recordActivity('document.import.error',{fileName:'C:\\Users\\private\\作品.cp',reason:'x'.repeat(1600),bytes:32,body:'private document',stack:'private stack',count:NaN},'error');
    assert.equal(await flushActivityLog(),true);assert.equal(posted.length,1);
    assert.equal(posted[0].details.fileName,'作品.cp');assert.equal(posted[0].details.reason.length,800);
    assert.equal(posted[0].details.bytes,32);assert.ok(posted[0].details.sessionId);
    for(const key of ['body','stack','count'])assert.equal(posted[0].details[key],undefined);
    recordActivity('invalid action',{reason:'ignored'});await flushActivityLog();assert.equal(posted.length,1);
  }finally{globalThis.fetch=original;}
});

test('a logging failure never throws into editing and queued events can be retried before export',async()=>{
  const original=globalThis.fetch;let failed=true,accepted=0;
  globalThis.fetch=async()=>{if(failed)throw Error('disk/service temporarily unavailable');accepted++;return new Response('{"ok":true}');};
  try{
    assert.doesNotThrow(()=>recordActivity('document.save.error',{reason:'保存失败'},'error'));
    assert.equal(await flushActivityLog(),false);
    failed=false;assert.equal(await flushActivityLog(),true);assert.equal(accepted,1);
  }finally{globalThis.fetch=original;}
});

test('runtime errors record bounded diagnostics and removing listeners stops collection',async()=>{
  const target=new EventTarget(),previousWindow=globalThis.window,originalFetch=globalThis.fetch,posted:Record<string,any>[]=[];
  globalThis.window=target as unknown as Window&typeof globalThis;
  globalThis.fetch=async(_input,options)=>{posted.push(JSON.parse(String(options?.body)));return new Response('{"ok":true}');};
  const remove=installRuntimeActivityLogging();
  try{
    target.dispatchEvent(Object.assign(new Event('error'),{message:'broken import',filename:'http://127.0.0.1/assets/main.js?private=value',lineno:7,colno:9}));
    target.dispatchEvent(Object.assign(new Event('unhandledrejection'),{reason:new Error('async failed')}));
    await flushActivityLog();assert.equal(posted.length,2);assert.equal(posted[0].details.line,7);assert.equal(posted[0].details.source,'main.js');assert.equal(posted[0].details.reason,'broken import');assert.equal(posted[1].details.reason,'async failed');
    remove();target.dispatchEvent(Object.assign(new Event('error'),{message:'must not log'}));await flushActivityLog();assert.equal(posted.length,2);
  }finally{remove();globalThis.window=previousWindow;globalThis.fetch=originalFetch;}
});
