import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SYMBOL_CATALOG} from '../../src/app/diagramSymbolCatalog';
import {cadPropertyDefinitions,getCadSymbolBlock} from '../../src/app/diagramCadSymbols';
import {buildCadSymbolGeometry,moveCadSymbolPropertyGrip} from '../../src/app/diagramCadSymbolGeometry';
import {symbolNativeGrips,moveSymbolNativeGrip,toggleSymbolNativeMirror,symbolNativeBaseline} from '../../src/app/diagramAnnotationSVG';
import type {DiagramSymbolAnnotation} from '../../src/app/diagramAnnotations';
import type {Point} from '../../src/core/types';
const base:DiagramSymbolAnnotation={id:'mirror-rotation',kind:'symbol',symbol:'unfold',position:[23,-51],rotation:37,size:150,color:'#123456',width:.7,cadProperties:{}};
const angularError=(a:number,b:number)=>Math.abs(((a-b+540)%360)-180);

test('native rotation grips recover their evaluated angle after each source mirror across the symbol catalog',()=>{
 let checked=0;
 for(const item of SYMBOL_CATALOG){
  if(!getCadSymbolBlock(item.kind))continue;
  const definitions=cadPropertyDefinitions(item.kind),flips=definitions.filter(d=>d.type==='flip'&&d.editable);
  for(const properties of [{},...flips.map(f=>({[f.key]:1-f.defaultValue}))]){
   const a={...base,symbol:item.kind,cadProperties:properties},geometry=buildCadSymbolGeometry(a);
   for(const angle of definitions.filter(d=>d.type==='angle'&&d.editable)){
    const value=(angle.defaultValue+27)%360,target=buildCadSymbolGeometry({...a,cadProperties:{...properties,[angle.key]:value}});
    for(const grip of geometry.controls.filter(c=>c.parameterHandle===angle.parameterHandle)){
     const control=target.controls.find(c=>c.id===grip.id)!;
     const next=moveCadSymbolPropertyGrip(a,grip.id??grip.key,control.point),actual=next.cadProperties?.[angle.key]??angle.defaultValue;
     assert.ok(angularError(actual,value)<1e-6,`${item.kind}/${grip.id}/${JSON.stringify(properties)}: ${actual} vs ${value}`);checked++;
    }
   }
  }
 }
 assert.ok(checked>50);
});

test('world-space mirrored unfold grip follows clockwise and counterclockwise pointer arcs with a fixed paper anchor',()=>{
 for(const mirrored of [false,true])for(const delta of [-18,18]){
  const a={...base,mirrored},flip=symbolNativeGrips(a).find(g=>g.semantic==='mirror')!,flipped=toggleSymbolNativeMirror(a,flip.id),grip=symbolNativeGrips(flipped).find(g=>g.semantic==='rotate')!,root=symbolNativeBaseline(flipped)!.start;
  const t=delta*Math.PI/180,dx=grip.point[0]-root[0],dy=grip.point[1]-root[1],target:Point=[root[0]+dx*Math.cos(t)-dy*Math.sin(t),root[1]+dx*Math.sin(t)+dy*Math.cos(t)];
  const next=moveSymbolNativeGrip(flipped,grip.id,target),moved=symbolNativeGrips(next).find(g=>g.id===grip.id)!;
  // The source shaft endpoint and CAD rotation base differ by ~1e-5 units.
  assert.ok(Math.hypot(moved.point[0]-target[0],moved.point[1]-target[1])<1e-4);
  const nextRoot=symbolNativeBaseline(next)!.start;assert.ok(Math.hypot(root[0]-nextRoot[0],root[1]-nextRoot[1])<1e-7);
 }
});
