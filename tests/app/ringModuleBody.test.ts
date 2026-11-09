import {test} from 'node:test';
import assert from 'node:assert/strict';
import {changeTessParams,readTessParams,tessPreset} from '../../src/app/tessellation';
import {readRingVectorFunctionDefinitions} from '../../src/app/ringVectorFunctionDefinitions';
import {validRingVectorFormulaText} from '../../src/app/ringVectorFormulaText';

const smooth=['Component[t_,c_,k_]:=Module[{r,g},r=1+.015 k Cos[3t];g[x_]:=r x;g[c]]','Component[t_,c_,0]:=c'];
const original=['Basis[x_,i_]:=Module[{g},g[t_,k_]:=Sign[t] Abs[t]^(1/(1+k));g[0,k_]:=0;g[t_,0]:=t;g[x,i]]'];
const base={...tessPreset('ring'),ringMode:'origamica',rings:2,offsetAngle:13,
  outerRadii:[1,1.8,2.6],creaseRadii:[1.35,2.15]};

test('Module assignments and lexical helpers preserve verbatim indexed and per-ring project source',()=>{
  const pair=['Component[φ,Cos[φ],i]','Component[φ,Sin[φ],i]'];
  const indexed=readTessParams({...base,vectorFunctionDefinitions:smooth,outerVectorTemplate:pair,creaseVectorTemplate:pair});
  assert.ok(indexed&&indexed.family==='ring');
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(indexed))),indexed);
  assert.deepEqual(readTessParams(changeTessParams(indexed,{angle:42})),{...indexed,angle:42});
  const rows=(count:number)=>Array.from({length:count},(_,i)=>pair.map(item=>item.replace(/,i\]/g,`,${i}]`)));
  const perRing=readTessParams({...base,vectorFunctionDefinitions:smooth,outerVectorExpressions:rows(3),creaseVectorExpressions:rows(2)});
  assert.ok(perRing&&perRing.family==='ring');assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(perRing))),perRing);
  assert.deepEqual(readRingVectorFunctionDefinitions(original),original);
});

test('Set and SetDelayed, outer initialization, nested write and local/global shadow all survive the lexical reader',()=>{
  for(const body of [
    'Module[{a=1,g},g[t_]=a t;a=2;g[x]]',
    'Module[{a=1,g},g[t_]:=a t;a=2;g[x]]',
    'Module[{x=2,a=x},a Cos[x]]',
    'Module[{a=1},a+Module[{},a=2;a]]',
    'Module[{a=1,b},b=Module[{},a=2;a];a+b]',
    'Module[{a=1,g},g[t_]:=a t;Module[{a=2},g[x]]]',
    'Module[{t=2,g},g[t_]:=t+1;g[x]]',
    'Module[{g},g[t_]:=Cos[t];Module[{g},g[t_]:=Sin[t];g[x]]+g[x]]',
    'Module[{g,h},g[t_]:=h[t];h[t_]:=Module[{a},a=Cos[t];a];g[x]]',
    'Module[{a=1,b=2,c=3,d=4,f=5,h=6},a+b+c+d+f+h]',
  ]){
    const definitions=['H[x_]:='+body];assert.deepEqual(readRingVectorFunctionDefinitions(definitions),definitions,body);
  }
  const definitions=['H[x_]:=Module[{g},g[t_]:=t;B[x]+g[x]]','g[t_]:=2t','B[t_]:=g[t]'];
  assert.deepEqual(readRingVectorFunctionDefinitions(definitions),definitions);
  // Local g must not create a false global self-dependency.
  const ownName=['g[x_]:=Module[{g},g[t_]:=Cos[t];g[x]]'];
  assert.deepEqual(readRingVectorFunctionDefinitions(ownName),ownName);
});

test('unassigned names, external writes, captured-state writes and cyclic local definitions fail closed',()=>{
  for(const body of [
    'Module[{a,b},b=a+Module[{},a=1;a];b]',
    'Module[{a},a=x;outside=1;a]', 'Module[{a},x=1;a=x;a]',
    'Module[{a},a=x;Print[a];a]', 'Module[{a},a=x;While[a>0,a];a]',
    'Module[{a},a=x;a+=1;a]', 'Module[{a},a:=x;a]',
    'Module[{g},g[t_]:=t+free;g[x]]', 'Module[{g},g[t_]:=g[t];x]',
    'Module[{g,h},g[t_]:=h[t];h[t_]:=g[t];x]',
    'Module[{g},g[t_]:={t,t};x]', 'Module[{g},g[t_]:=Cos;x]',
    'Module[{a=1,g},g[t_]:=Module[{},a=2;t];g[x]]',
    'Module[{g},g[0]:=0;x]', 'Module[{g},g[t_]:=t;g[0]:=0;g[0.0]:=0;x]',
    'Module[{g},g[t_]:=t;g[t_,k_]:=t;x]',
    'Module[{g},g[t_]:=t;g=1;x]', 'Module[{g=1},g[t_]:=t;x]',
    'Module[{g},outside[t_]:=t;x]', 'Module[{a},a=free;a]',
  ])assert.equal(readRingVectorFunctionDefinitions(['H[x_]:='+body]),null,body);
  // The original filters still reject separators outside numeric Modules.
  for(const source of ['Cos[φ];1','Cos[φ]:=1','phi;'])assert.equal(validRingVectorFormulaText(source),false);
  assert.equal(readRingVectorFunctionDefinitions(['H[x_]:=x+i']),null);
  assert.equal(readRingVectorFunctionDefinitions(['H[x_]:=Module[{a=1,b=a},b]']),null);
  assert.equal(readRingVectorFunctionDefinitions(['H[x_]:=Module[{g},g[t_]:=B[t,t];x]','B[t_]:=t']),null);
});
