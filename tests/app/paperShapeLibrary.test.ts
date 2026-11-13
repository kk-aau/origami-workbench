import test from 'node:test';
import assert from 'node:assert/strict';
import {PAPER_SHAPE_LIBRARY_KEY,readPaperShapeLibrary,savePaperShape,removePaperShape} from '../../src/app/paperShapeLibrary';
import type {PaperShape} from '../../src/app/paperShapes';

const shape=():PaperShape=>({paper:{width:200,height:100},boundary:[{a:[0,0],b:[200,0]},{a:[200,0],b:[200,100]},{a:[200,100],b:[0,100]},{a:[0,100],b:[0,0]}]});
function storage(){
 const values=new Map<string,string>();let writes=0;
 return {values,get writes(){return writes;},getItem:(key:string)=>values.get(key)??null,setItem(key:string,value:string){values.set(key,value);writes++;}};
}

test('paper shape templates persist across separate reads and remove independently',()=>{
 const store=storage();assert.deepEqual(readPaperShapeLibrary(store),[]);assert.equal(store.writes,0);
 const first=savePaperShape('  2:1矩形  ',shape(),store),second=savePaperShape('同纸形另一模板',shape(),store);
 assert.equal(first[0].name,'2:1矩形');assert.equal(second[0].name,'同纸形另一模板');assert.equal(second[1].id,first[0].id);assert.notEqual(second[0].id,first[0].id);
 assert.deepEqual(JSON.parse(store.values.get(PAPER_SHAPE_LIBRARY_KEY)!),{version:1,shapes:second});
 assert.deepEqual(readPaperShapeLibrary({getItem:store.getItem,setItem:store.setItem}),second);
 assert.ok(Number.isSafeInteger(first[0].createdAt)&&first[0].createdAt>=0);
 assert.deepEqual(removePaperShape(first[0].id,store),[second[0]]);assert.deepEqual(readPaperShapeLibrary(store),[second[0]]);
 assert.deepEqual(removePaperShape(second[0].id,store),[]);assert.deepEqual(readPaperShapeLibrary(store),[]);
});

test('inputs, saved results and read results are independent deep copies',()=>{
 const store=storage(),input=shape(),snapshot=structuredClone(input),saved=savePaperShape('独立纸形',input,store);
 assert.deepEqual(input,snapshot);input.paper.width=999;input.boundary[0].a[0]=999;saved[0].name='外部改名';saved[0].shape.boundary[1].b[1]=999;
 const read=readPaperShapeLibrary(store);assert.equal(read[0].name,'独立纸形');assert.deepEqual(read[0].shape,snapshot);
 read[0].shape.paper.height=333;read[0].shape.boundary.pop();assert.deepEqual(readPaperShapeLibrary(store)[0].shape,snapshot);
});

test('saved paper shapes retain inner hole boundaries instead of only their bounding rectangle',()=>{
 const store=storage(),input=shape();input.boundary.push({a:[50,25],b:[50,75]},{a:[50,75],b:[150,75]},{a:[150,75],b:[150,25]},{a:[150,25],b:[50,25]});
 const before=structuredClone(input);savePaperShape('带孔纸形',input,store);
 const loaded=readPaperShapeLibrary(store);assert.equal(loaded[0].shape.boundary.length,8);assert.deepEqual(loaded[0].shape,before);assert.deepEqual(input,before);
});

test('invalid names and shapes cannot replace existing templates',()=>{
 const store=storage();savePaperShape('原模板',shape(),store);const before=store.values.get(PAPER_SHAPE_LIBRARY_KEY),writes=store.writes;
 for(const name of ['', '  ', '名'.repeat(161), '换\n行', '末尾\n', '\t前缀', '控制\u0000', '控制\u007f'])assert.throws(()=>savePaperShape(name,shape(),store),/名称/);
 const open=shape();open.boundary.pop();const crossed:PaperShape={paper:{width:200,height:100},boundary:[{a:[0,0],b:[200,100]},{a:[200,100],b:[0,100]},{a:[0,100],b:[200,0]},{a:[200,0],b:[0,0]}]};
 for(const invalid of [null,{},open,crossed,{...shape(),paper:{width:Infinity,height:100}}])assert.throws(()=>savePaperShape('无效纸形',invalid as PaperShape,store));
 assert.equal(store.values.get(PAPER_SHAPE_LIBRARY_KEY),before);assert.equal(store.writes,writes);
});

test('damaged library JSON and entries are reported without resetting or overwriting them',()=>{
 const store=storage(),entry=savePaperShape('合法原始数据',shape(),store)[0];
 const bad:unknown[]=[null,[],{}, {version:2,shapes:[]},{version:1,shapes:{}},{version:1,shapes:[{...entry,id:'bad'}]},{version:1,shapes:[{...entry,name:' 空白 '} ]},{version:1,shapes:[{...entry,createdAt:-1}]},{version:1,shapes:[{...entry,createdAt:1.5}]},{version:1,shapes:[entry,entry]},{version:1,shapes:[{...entry,shape:{...shape(),boundary:[]}}]}];
 for(const raw of ['', '{', ...bad.map(value=>JSON.stringify(value))]){
  store.values.set(PAPER_SHAPE_LIBRARY_KEY,raw);const writes=store.writes;
  assert.throws(()=>readPaperShapeLibrary(store),/纸形库|名称/);assert.throws(()=>savePaperShape('不能覆盖',shape(),store));assert.throws(()=>removePaperShape(entry.id,store));
  assert.equal(store.values.get(PAPER_SHAPE_LIBRARY_KEY),raw);assert.equal(store.writes,writes);
 }
});

test('official storage writes use compare-and-set and preserve a concurrent update on conflict',()=>{
 const store=storage();let comparisons=0,conflict=false;
 const cas={getItem:store.getItem,setItem(){throw Error('不得绕过CAS');},compareAndSet(key:string,expected:string|null,value:string){comparisons++;assert.equal(key,PAPER_SHAPE_LIBRARY_KEY);if(conflict){store.values.set(key,JSON.stringify({version:1,shapes:[]}));return false;}assert.equal(store.getItem(key),expected);store.setItem(key,value);return true;}};
 const saved=savePaperShape('原模板',shape(),cas);assert.equal(comparisons,1);assert.deepEqual(readPaperShapeLibrary(cas),saved);
 conflict=true;assert.throws(()=>savePaperShape('并发新增',shape(),cas),/其他窗口修改/);assert.equal(comparisons,2);assert.deepEqual(readPaperShapeLibrary(cas),[]);
 store.values.set(PAPER_SHAPE_LIBRARY_KEY,JSON.stringify({version:1,shapes:saved}));assert.throws(()=>removePaperShape(saved[0].id,cas),/其他窗口修改/);assert.deepEqual(readPaperShapeLibrary(cas),[]);
});

test('storage capacity and write failures do not report success or replace prior templates',()=>{
 const store=storage(),saved=savePaperShape('原模板',shape(),store),raw=store.getItem(PAPER_SHAPE_LIBRARY_KEY);
 const blocked={getItem:store.getItem,setItem(){throw Error('桌面偏好设置格式无效或超过容量。');}};
 assert.throws(()=>savePaperShape('容量不足',shape(),blocked),/超过容量/);assert.throws(()=>removePaperShape(saved[0].id,blocked),/超过容量/);assert.equal(store.getItem(PAPER_SHAPE_LIBRARY_KEY),raw);
 const casFailure={...blocked,compareAndSet(){throw Error('保存目录暂不可用。');}};
 assert.throws(()=>savePaperShape('磁盘不可用',shape(),casFailure),/保存目录/);assert.equal(store.getItem(PAPER_SHAPE_LIBRARY_KEY),raw);
});

test('a synchronous fallback store detects a changed baseline instead of overwriting it',()=>{
 const store=storage();savePaperShape('旧模板',shape(),store);let reads=0;
 const concurrent=JSON.stringify({version:1,shapes:[]}),writes=store.writes;
 const changed={getItem(key:string){if(++reads===2)store.values.set(key,concurrent);return store.getItem(key);},setItem:store.setItem};
 assert.throws(()=>savePaperShape('不能覆盖新值',shape(),changed),/其他窗口修改/);assert.equal(store.getItem(PAPER_SHAPE_LIBRARY_KEY),concurrent);assert.equal(store.writes,writes);
});

test('invalid or deleted IDs cannot mutate the library',()=>{
 const store=storage(),saved=savePaperShape('仍然保留',shape(),store),raw=store.getItem(PAPER_SHAPE_LIBRARY_KEY),writes=store.writes;
 for(const id of ['', '../outside', 'not-a-uuid','12345678-ABCD-1234-ABCD-123456789ABC'])assert.throws(()=>removePaperShape(id,store),/编号/);
 assert.throws(()=>removePaperShape(crypto.randomUUID(),store),/找不到/);assert.equal(store.getItem(PAPER_SHAPE_LIBRARY_KEY),raw);assert.equal(store.writes,writes);
});
