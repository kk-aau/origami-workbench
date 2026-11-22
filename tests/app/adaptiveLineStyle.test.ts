import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveLineStroke,readAdaptiveLineStyle,saveAdaptiveLineStyle,ADAPTIVE_LINE_STYLE_KEY,ADAPTIVE_LINE_STYLE_EVENT,type AdaptiveLineStroke} from '../../src/app/adaptiveLineStyle';

const rounded={enabled:true,units:1,linecap:'round' as const};
const values=(stroke:AdaptiveLineStroke)=>stroke.dash!.split(/[\s,]+/).map(Number);
const period=(stroke:AdaptiveLineStroke)=>values(stroke).reduce((sum,value)=>sum+value,0);
const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
const memory=()=>{const data=new Map<string,string>();return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};};

test('legacy disabled preferences still apply automatic adaptation without changing the authored pen',()=>{
  const options={units:1,linecap:'round' as const,span:{length:8,offset:2}};
  assert.deepEqual(resolveLineStroke(1,9,'7 4',{...options,enabled:false}),resolveLineStroke(1,9,'7 4',{...options,enabled:true}));
});

test('solid lines retain their pen and long dashed strokes finish inside ink',()=>{
  for(const dash of [undefined,'','none','0 0'])assert.deepEqual(resolveLineStroke(2,8,dash,rounded),{width:8,...(dash!==undefined?{dash}:{}),limited:false});
  for(const length of [22,500]){
    const stroke=resolveLineStroke(length,1,'7,4',rounded);
    assert.equal(stroke.width,1);assert.equal(stroke.dash,'7,4');close(stroke.pathLength!%11,0);close(stroke.dashOffset!,3.5);
  }
});

test('short round strokes fit two cycles with a visible first dash and readable cap-adjusted gaps',()=>{
  const stroke=resolveLineStroke(18,1.5,'7 4',rounded),dash=values(stroke);
  close(period(stroke),9);close(dash[0]/dash[1],7/4);close(stroke.dashOffset!,dash[0]/2);assert.equal(stroke.width,1.5);assert.equal(stroke.limited,false);
  assert.ok(dash[1]-stroke.width>=.7);
});

test('wide round caps can lower the displayed pen only as far as needed to preserve two gaps',()=>{
  const stroke=resolveLineStroke(12,3,'7 4',rounded),dash=values(stroke);
  close(period(stroke),6);assert.ok(stroke.width<3&&stroke.width>=.65);close(dash[1]-stroke.width,.7);assert.equal(stroke.limited,false);
});

test('one repeat is preferred over an unreadable two-repeat pattern',()=>{
  const stroke=resolveLineStroke(6,1,'7 4',rounded);
  close(period(stroke),6);assert.equal(stroke.width,1);assert.ok(values(stroke)[1]-stroke.width>=.7);assert.equal(stroke.limited,false);
});

test('a genuinely unreadable stroke falls back to a fine same-colour solid with an explicit limit signal',()=>{
  const stroke=resolveLineStroke(2,2,'7 4',rounded);assert.deepEqual(stroke,{width:.65,limited:true});
  assert.equal(Object.hasOwn(stroke,'dash'),false);assert.equal(Object.hasOwn(stroke,'dashOffset'),false);
  assert.deepEqual(resolveLineStroke(.01,.1,'7 4',rounded),{width:.1,limited:true});
});

test('butt caps do not consume gaps and existing fine pens are never thickened',()=>{
  const butt=resolveLineStroke(4,20,'7 4',{enabled:true,units:1,linecap:'butt'});close(period(butt),2);assert.equal(butt.width,20);assert.equal(butt.limited,false);
  const thin=resolveLineStroke(3,.1,'7 4',rounded);assert.equal(thin.width,.1);assert.equal(thin.limited,false);
});

test('a mountain dash-dot keeps its dot and full custom length ratios after compression',()=>{
  const stroke=resolveLineStroke(10,1,'10 3 2 3',rounded),dash=values(stroke),dotStart=dash[0]+dash[1]-stroke.dashOffset!;
  assert.equal(dash.length,4);close(dash[0]/dash[2],5);close(dash[1]/dash[3],1);assert.ok(dotStart>=0&&dotStart+dash[2]<=10);
  assert.ok(dash[1]-stroke.width>=.7-1e-9&&dash[3]-stroke.width>=.7-1e-9);
});

test('an odd custom SVG dash list keeps its repeated odd-list semantics',()=>{
  const stroke=resolveLineStroke(14,.1,'5,2,1',rounded),dash=values(stroke);assert.equal(dash.length,6);
  close(dash[0]/dash[1],2.5);close(dash[1]/dash[2],2);close(dash[0],dash[3]);close(dash[1],dash[4]);close(dash[2],dash[5]);
});

test('all occlusion fragments share one pattern and pen while phase follows cumulative source distance',()=>{
  const full=resolveLineStroke(18,1.5,'7 4',rounded),saved=structuredClone(rounded),span={length:18,offset:0};
  for(const [length,offset] of [[.01,0],[1.3,2.5],[2,10.5],[.1,17.9]]){
    span.offset=offset;const fragment=resolveLineStroke(length,1.5,'7 4',{...rounded,span});
    assert.equal(fragment.dash,full.dash);assert.equal(fragment.width,full.width);assert.equal(fragment.limited,full.limited);
    close(fragment.dashOffset!,((full.dashOffset!+offset)%period(full)+period(full))%period(full));
  }
  const long=resolveLineStroke(.01,3,'7 4',{...rounded,span:{length:100,offset:7}});
  assert.equal(long.dash,'7 4');close(long.dashOffset!,3.5+7*.99);close(long.pathLength!,.01*.99);assert.deepEqual(rounded,saved);
});

test('world-unit conversions preserve the same pixel appearance',()=>{
  const a=resolveLineStroke(10,1,'10 3 2 3',rounded),b=resolveLineStroke(5,.5,'5 1.5 1 1.5',{...rounded,units:.5});
  assert.equal(a.limited,b.limited);close(a.width,b.width*2);close(a.dashOffset!,b.dashOffset!*2);
  values(a).forEach((value,index)=>close(value,values(b)[index]*2));
});

test('a long world-space diagram line normalizes subpixel dots and cap-consumed gaps before the long-line fast path',()=>{
  const stroke=resolveLineStroke(1000,1,'10 3 2 3',{...rounded,units:10}),dash=values(stroke);
  assert.equal(stroke.limited,false);assert.equal(stroke.width,1);assert.ok(period(stroke)>18);
  close(dash[0]/dash[2],5);close(dash[1]/dash[3],1);assert.ok((dash[1]-stroke.width)/10>=.7-1e-9);assert.ok((dash[2]+stroke.width)/10>=.65-1e-9);
  const fragment=resolveLineStroke(.1,1,'10 3 2 3',{...rounded,units:10,span:{length:1000,offset:123}});
  assert.equal(fragment.dash,stroke.dash);assert.equal(fragment.width,stroke.width);close(fragment.dashOffset!,(dash[0]/2+123*stroke.pathLength!/1000)%period(stroke));
  assert.equal(resolveLineStroke(1000,1,'10 3 2 3',{...rounded,enabled:false,units:10}).dash,stroke.dash);
});

test('butt-cap subpixel ink normalizes at distant zoom and an unreadable dotted butt stroke reports its limit',()=>{
  const stroke=resolveLineStroke(1000,1,'9 3 1 3',{enabled:true,units:10,linecap:'butt'}),dash=values(stroke);
  assert.ok(dash[2]/10>=.65-1e-9);assert.ok(dash[1]/10>=.7-1e-9);assert.equal(stroke.width,1);
  assert.deepEqual(resolveLineStroke(1000,1,'0 3',{enabled:true,units:10,linecap:'butt'}),{width:1,limited:true});
});

test('invalid or unsupported patterns and non-finite inputs leave authored display data untouched',()=>{
  for(const dash of ['1 -2','1,,2','10% 4%','NaN 2','1e999 2','2 '.repeat(70)])assert.deepEqual(resolveLineStroke(2,1,dash,rounded),{width:1,dash,limited:false});
  for(const length of [0,-1,NaN,Infinity])assert.deepEqual(resolveLineStroke(length,1,'7 4',rounded),{width:1,dash:'7 4',limited:false});
  for(const units of [0,-1,NaN,Infinity])assert.deepEqual(resolveLineStroke(2,1,'7 4',{...rounded,units}),{width:1,dash:'7 4',limited:false});
  assert.deepEqual(resolveLineStroke(2,1,'7 4',{...rounded,span:{length:18,offset:Infinity}}),{width:1,dash:'7 4',limited:false});
});

test('display preference defaults on and round-trips strict boolean values through its own versioned key',()=>{
  const storage=memory();assert.equal(readAdaptiveLineStyle(storage),true);
  saveAdaptiveLineStyle(false,storage);assert.equal(readAdaptiveLineStyle(storage),true);assert.deepEqual(JSON.parse(storage.getItem(ADAPTIVE_LINE_STYLE_KEY)!),{version:1,enabled:false});
  saveAdaptiveLineStyle(true,storage);assert.equal(readAdaptiveLineStyle(storage),true);
  for(const raw of ['bad','null','[]','false','{"version":2,"enabled":false}','{"version":1,"enabled":0}','{"version":1,"enabled":false,"unknown":1}']){
    storage.setItem(ADAPTIVE_LINE_STYLE_KEY,raw);assert.equal(readAdaptiveLineStyle(storage),true);
  }
  assert.equal(readAdaptiveLineStyle({getItem:()=>{throw Error('read denied');}}),true);
  assert.throws(()=>saveAdaptiveLineStyle('false' as unknown as boolean,storage),/布尔/);
});

test('successful preference writes publish one shared event and failed writes publish none',()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window'),target=new EventTarget(),storage=memory();let notifications=0;
  target.addEventListener(ADAPTIVE_LINE_STYLE_EVENT,()=>{notifications++;assert.equal(readAdaptiveLineStyle(storage),true);});
  Object.defineProperty(globalThis,'window',{configurable:true,value:target});
  try{
    saveAdaptiveLineStyle(false,storage);assert.equal(notifications,1);
    assert.throws(()=>saveAdaptiveLineStyle(true,{setItem:()=>{throw Error('write denied');}}),/write denied/);assert.equal(notifications,1);
  }finally{if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window');}
});
