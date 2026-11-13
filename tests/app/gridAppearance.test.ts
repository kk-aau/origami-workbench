import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultGridAppearance,readGridAppearance,saveGridAppearance,validateGridAppearance} from '../../src/app/gridAppearance';
test('grid appearance validates and round trips',()=>{const store=new Map<string,string>(),s={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>store.set(k,v)};const value={gridColor:'#112233',diagonalColor:'#aabbcc',lineWidth:1.2,defaultDivisions:16,minGridPixelSize:4,pattern:'triangular' as const,squareRotation:30};saveGridAppearance(value,s);assert.deepEqual(readGridAppearance(s),value);assert.deepEqual(defaultGridAppearance(),{gridColor:'#d9e1d6',diagonalColor:'#e7ece3',lineWidth:.7,defaultDivisions:4,minGridPixelSize:3,pattern:'square',squareRotation:0});assert.throws(()=>validateGridAppearance({...value,lineWidth:5}),/线宽/);assert.throws(()=>validateGridAppearance({...value,gridColor:'red'}),/颜色/);});
test('grid appearance falls back on invalid persisted data',()=>{const s={getItem:()=>'{"version":1,"settings":{"gridColor":"red"}}'};assert.deepEqual(readGridAppearance(s),defaultGridAppearance());});

test('up to 512 default divisions persist exactly and invalid values cannot replace the saved preference',()=>{
 const values=new Map<string,string>(),store={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)};
 for(const defaultDivisions of [128,129,256,512]){
  const value={...defaultGridAppearance(),defaultDivisions,gridColor:'#123456'};
  assert.equal(validateGridAppearance(value).defaultDivisions,defaultDivisions);
  saveGridAppearance(value,store);assert.deepEqual(readGridAppearance(store),value);
 }
 const before=[...values];
 for(const defaultDivisions of [0,513,Infinity,512.5]){
  assert.throws(()=>saveGridAppearance({...defaultGridAppearance(),defaultDivisions},store),/1—512/);
  assert.deepEqual([...values],before);
 }
 assert.equal(readGridAppearance(store).defaultDivisions,512);
});

test('old grid preferences retain custom colors and widths when density fields are added',()=>{
 const old={gridColor:'#123456',diagonalColor:'#abcdef',lineWidth:2};
 const migrated=readGridAppearance({getItem:()=>JSON.stringify({version:1,settings:old})});
 assert.deepEqual(migrated,{...old,defaultDivisions:4,minGridPixelSize:3,pattern:'square',squareRotation:0});
 let saved='';saveGridAppearance(migrated,{setItem:(_key,value)=>{saved=value;}});
 assert.deepEqual(readGridAppearance({getItem:()=>saved}),migrated);
 for(const field of ['defaultDivisions','minGridPixelSize'])for(const value of [null,undefined,'8',0,Infinity])assert.throws(()=>validateGridAppearance({...old,[field]:value}));
 for(const pattern of [null,undefined,'hexagon',0,Infinity,NaN])assert.throws(()=>validateGridAppearance({...old,pattern}),/格式/);
});

test('withdrawn angle settings are ignored without losing other appearance settings',()=>{
 const old={gridColor:'#123456',diagonalColor:'#abcdef',lineWidth:2,defaultDivisions:16,minGridPixelSize:4};
 for(const diagonalAngle of [22.5,30,0,90,null,'15']){
  const expected={...old,pattern:'square' as const,squareRotation:0};
  assert.deepEqual(validateGridAppearance({...old,diagonalAngle}),expected);
  const migrated=readGridAppearance({getItem:()=>JSON.stringify({version:1,settings:{...old,diagonalAngle}})});
  assert.deepEqual(migrated,expected);
  let saved='';saveGridAppearance(migrated,{setItem:(_key,value)=>{saved=value;}});assert.doesNotMatch(saved,/diagonalAngle/);
 }
 assert.equal(validateGridAppearance({...old,pattern:'triangular',diagonalAngle:30}).pattern,'triangular');
});

test('square grid rotation accepts finite turns and persists normalized degrees independently of pattern',()=>{
 const base={...defaultGridAppearance(),gridColor:'#123456'};
 for(const [rotation,expected] of [[0,0],[30,30],[-22.5,-22.5],[90,90],[270,-90],[360,0],[-450,-90],[1080,0]]){
  const checked=validateGridAppearance({...base,squareRotation:rotation});
  assert.equal(checked.squareRotation,expected);
  let saved='';saveGridAppearance({...checked,pattern:'triangular'},{setItem:(_key,value)=>{saved=value;}});
  const restored=readGridAppearance({getItem:()=>saved});
  assert.equal(restored.pattern,'triangular');assert.equal(restored.squareRotation,expected);assert.equal(restored.gridColor,'#123456');
 }
 for(const squareRotation of [null,undefined,'30',Infinity,-Infinity,NaN])assert.throws(()=>validateGridAppearance({...base,squareRotation}),/旋转/);
 assert.equal(validateGridAppearance({...base,diagonalAngle:30,squareRotation:45}).squareRotation,45);
});
