import {test} from 'node:test';
import assert from 'node:assert/strict';
import {changeTessParams,readTessParams,tessPreset} from '../../src/app/tessellation';
import {validRingVectorPolygon} from '../../src/app/ringVectorPolygon';
import {identityRingLinearMap,validRingLinearMap} from '../../src/app/ringLinearMaps';
import {exampleRingFourierCurve,validRingFourierCurve} from '../../src/app/ringFourierCurves';

test('explicit radii and center option persist without changing legacy geometric rings',()=>{
 const old=tessPreset('ring');assert.deepEqual(readTessParams(old),old);
 const p=readTessParams({...old,radii:[.4,1.3,2.2],includeCenter:true})!;
 assert.ok(p);assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(changeTessParams(p,{angle:42})))),{...p,angle:42});
 for(const radii of [[],[1,1],[2,1],[0,1],[1,NaN],[11]])assert.equal(readTessParams({...old,radii}),null);
 assert.equal(readTessParams({...old,includeCenter:true}),null);
 assert.equal(readTessParams({...p,radii:undefined,includeCenter:undefined})?.pruneBoundary,undefined);
});

test('original circular ring parameters keep two radius sequences and reject incompatible transforms',()=>{
 const old=tessPreset('ring');
 const original=readTessParams({...old,ringMode:'origamica',outerRadii:[1,1.8,2.6],creaseRadii:[1.35,2.15],offsetAngle:13})!;
 assert.equal(original.family,'ring');
 assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(original))),original);
 assert.deepEqual(readTessParams(changeTessParams(original,{angle:42})),{...original,angle:42});
 for(const patch of [{outerRadii:[1,1.8]},{creaseRadii:[1.9,2.15]},{angle:-1},{radii:[1,2]},{pruneBoundary:[[0,0],[1,0],[0,1]]},{parameterization:'gamma-alpha',gamma:1,pleatAngle:30}]){
   assert.equal(readTessParams({...original,...patch}),null);
 }
 assert.deepEqual(readTessParams(old),old);
 const wave=Array.from({length:16},(_,i)=>1+.08*Math.cos(2*Math.PI*i/8));
 const sampled=readTessParams({...original,outerProfiles:Array.from({length:3},()=>wave),creaseProfiles:Array.from({length:2},()=>wave)})!;
 assert.ok(sampled);assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(sampled))),sampled);
 assert.equal(readTessParams({...sampled,creaseProfiles:[wave]}),null);
});

test('analytic polar formulas persist and cannot be combined with sampled profiles',()=>{
 const old=tessPreset('ring');
 const formula='r*(1+0.08*cos(2*phi))';
 const original=readTessParams({...old,ringMode:'origamica',outerRadii:[1,1.8,2.6],creaseRadii:[1.35,2.15],offsetAngle:13,
   outerExpressions:Array(3).fill(formula),creaseExpressions:Array(2).fill(formula)})!;
 assert.ok(original);
 assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(original))),original);
 const sampled=Array(16).fill(1);
 assert.equal(readTessParams({...original,outerProfiles:Array(3).fill(sampled),creaseProfiles:Array(2).fill(sampled)}),null);
 assert.equal(readTessParams({...original,creaseExpressions:['r']}),null);
 assert.equal(readTessParams({...original,outerExpressions:['r','r','r();']}),null);
 const circular=readTessParams(changeTessParams(original,{outerExpressions:undefined,creaseExpressions:undefined}));
 assert.ok(circular&&circular.family==='ring'&&!('outerExpressions' in circular));
});

test('bounded Cartesian vector curves persist and reject malformed or incompatible polygons',()=>{
 const square:[[number,number],[number,number],[number,number],[number,number]]=[[1,1],[-1,1],[-1,-1],[1,-1]];
 const original=readTessParams({...tessPreset('ring'),ringMode:'origamica',outerRadii:[1,1.8,2.6],creaseRadii:[1.35,2.15],offsetAngle:13,
   outerVectors:[square,square,square],creaseVectors:[square,square]})!;
 assert.ok(original&&original.family==='ring');
 assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(original))),original);
 assert.equal(readTessParams({...original,outerVectors:[square]}),null);
 assert.equal(readTessParams({...original,outerVectors:[[[1,1],[1,-1],[-1,-1],[-1,1]],square,square]}),null);
 assert.equal(readTessParams({...original,outerVectors:[[[1,1],[0,0],[-1,1],[-1,-1],[1,-1]],square,square]}),null);
 assert.equal(readTessParams({...original,outerExpressions:['r','r','r'],creaseExpressions:['r','r']}),null);
 const circular=readTessParams(changeTessParams(original,{outerVectors:undefined,creaseVectors:undefined}));
 assert.ok(circular&&circular.family==='ring'&&!('outerVectors' in circular));
});

test('origin-visible concave vector curves persist and self-crossings are rejected',()=>{
 const circle=Array.from({length:8},(_,i)=>[Math.cos(i*Math.PI/4),Math.sin(i*Math.PI/4)] as [number,number]);
 const star=circle.map(([x,y],i)=>[x*(i%2?.65:1),y*(i%2?.65:1)] as [number,number]);
 assert.ok(validRingVectorPolygon(star));
 const params=readTessParams({...tessPreset('ring'),ringMode:'origamica',sides:6,rings:2,
   outerRadii:[.2,1.4,3],creaseRadii:[.8,2.2],angle:20,offsetAngle:0,
   outerVectors:[circle,star,circle],creaseVectors:[circle,circle]});
 assert.ok(params&&params.family==='ring');
 assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
 assert.equal(validRingVectorPolygon([[1,0],[-.5,.5],[.5,.5],[-1,0],[0,-1]]),false);
});

test('certified linear ellipse maps persist as a distinct vector-function mode',()=>{
 const unit=identityRingLinearMap(),sheared:[[number,number],[number,number]]=[[1.12,.2],[.08,.92]];
 assert.ok(validRingLinearMap(unit)&&validRingLinearMap(sheared));
 for(const bad of [[[1,0],[0,-1]],[[1,0],[0,.001]],[[3,0],[0,1]],[[1,0],[0,Infinity]],[[true,0],[0,1]]])
   assert.equal(validRingLinearMap(bad),false);
 const base={...tessPreset('ring'),ringMode:'origamica',outerRadii:[1,1.8,2.6],creaseRadii:[1.35,2.15],offsetAngle:13};
 const original=readTessParams({...base,outerLinearMaps:[unit,sheared,unit],creaseLinearMaps:[sheared,unit]});
 assert.ok(original&&original.family==='ring');
 assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(original))),original);
 assert.equal(readTessParams({...original,creaseLinearMaps:[unit]}),null);
 assert.equal(readTessParams({...original,outerExpressions:['r','r','r'],creaseExpressions:['r','r']}),null);
 assert.equal(readTessParams({...tessPreset('ring'),outerLinearMaps:[unit],creaseLinearMaps:[unit]}),null);
 const circular=readTessParams(changeTessParams(original,{outerLinearMaps:undefined,creaseLinearMaps:undefined}));
 assert.ok(circular&&circular.family==='ring'&&!('outerLinearMaps' in circular));
});

test('smooth vector Fourier curves persist separately from ellipse and polar modes',()=>{
 const curve=exampleRingFourierCurve();
 assert.ok(validRingFourierCurve(curve));
 assert.equal(validRingFourierCurve({...curve,harmonics:[[[1,0],[0,-1]]]}),false);
 assert.equal(validRingFourierCurve({...curve,harmonics:[[[1,0],[0,1]],[[.8,0],[0,.8]]]}),false);
 const params=readTessParams({...tessPreset('ring'),ringMode:'origamica',sides:8,rings:2,
   outerRadii:[1,1.8,2.6],creaseRadii:[1.35,2.15],offsetAngle:13,
   outerFourierCurves:[curve,curve,curve],creaseFourierCurves:[curve,curve]});
 assert.ok(params&&params.family==='ring');
 assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
 assert.equal(readTessParams({...params,creaseFourierCurves:[curve]}),null);
 assert.equal(readTessParams({...params,outerLinearMaps:[identityRingLinearMap(),identityRingLinearMap(),identityRingLinearMap()],
   creaseLinearMaps:[identityRingLinearMap(),identityRingLinearMap()]}),null);
 assert.equal(readTessParams({...tessPreset('ring'),outerFourierCurves:[curve],creaseFourierCurves:[curve]}),null);
 const circular=readTessParams(changeTessParams(params,{outerFourierCurves:undefined,creaseFourierCurves:undefined}));
 assert.ok(circular&&circular.family==='ring'&&!('outerFourierCurves' in circular));
});

test('numeric pfn/rfn vector expressions persist and reject incompatible curve modes',()=>{
 const pair:[string,string]=['cos(phi)/(1+0.06*cos(3*phi))','sin(phi)/(1+0.06*cos(3*phi))'];
 const base={...tessPreset('ring'),ringMode:'origamica',outerRadii:[1,1.8,2.6],creaseRadii:[1.35,2.15],offsetAngle:13};
 const params=readTessParams({...base,outerVectorExpressions:[pair,pair,pair],creaseVectorExpressions:[pair,pair]});
 assert.ok(params&&params.family==='ring');
 assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
 assert.equal(readTessParams({...params,creaseVectorExpressions:[pair]}),null);
 assert.equal(readTessParams({...params,outerVectorExpressions:[pair,pair,['phi;','sin(phi)']]}),null);
 assert.equal(readTessParams({...params,outerExpressions:['r','r','r'],creaseExpressions:['r','r']}),null);
 assert.equal(readTessParams({...tessPreset('ring'),outerVectorExpressions:[pair],creaseVectorExpressions:[pair]}),null);
 const circular=readTessParams(changeTessParams(params,{outerVectorExpressions:undefined,creaseVectorExpressions:undefined}));
 assert.ok(circular&&circular.family==='ring'&&!('outerVectorExpressions' in circular));
});

test('indexed pfn[i]/rfn[i] formulas round-trip and are exclusive with per-ring curves',()=>{
 const pair:[string,string]=['cos(phi)/(1+0.015*i*cos(3*phi))','sin(phi)/(1+0.015*i*cos(3*phi))'];
 const base={...tessPreset('ring'),ringMode:'origamica',outerRadii:[1,1.8,2.6],creaseRadii:[1.35,2.15],offsetAngle:13};
 const params=readTessParams({...base,outerVectorTemplate:pair,creaseVectorTemplate:pair});
 assert.ok(params&&params.family==='ring');
 assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
 assert.deepEqual(readTessParams(changeTessParams(params,{angle:42})),{...params,angle:42});
 assert.equal(readTessParams({...params,creaseVectorTemplate:undefined}),null);
 assert.equal(readTessParams({...params,outerVectorTemplate:['cos(phi);','sin(phi)']}),null);
 assert.equal(readTessParams({...params,outerVectorExpressions:[pair,pair,pair],creaseVectorExpressions:[pair,pair]}),null);
 assert.equal(readTessParams({...tessPreset('ring'),outerVectorTemplate:pair,creaseVectorTemplate:pair}),null);
 const circle=readTessParams(changeTessParams(params,{outerVectorTemplate:undefined,creaseVectorTemplate:undefined}));
 assert.ok(circle&&circle.family==='ring'&&!('outerVectorTemplate' in circle));
});

test('indexed exp/sqrt pfn/rfn formulas survive editor and project parameter readback',()=>{
 const pair:[string,string]=[
  'sqrt(1+0.08*cos(2*phi))*exp(0.015*i*cos(3*phi))*cos(phi)',
  'sqrt(1+0.08*cos(2*phi))*exp(0.015*i*cos(3*phi))*sin(phi)',
 ];
 const params=readTessParams({...tessPreset('ring'),ringMode:'origamica',rings:2,
  outerRadii:[1,1.8,2.6],creaseRadii:[1.35,2.15],offsetAngle:13,
  outerVectorTemplate:pair,creaseVectorTemplate:pair});
 assert.ok(params&&params.family==='ring');
 const changed=changeTessParams(params,{angle:42});
 assert.equal(changed.family,'ring');
 assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(changed))),changed);
 if(changed.family==='ring'){
  assert.deepEqual(changed.outerVectorTemplate,pair);
  assert.deepEqual(changed.creaseVectorTemplate,pair);
 }
});

test('C1 piecewise pfn/rfn subset survives editor and project parameter readback',()=>{
  const pair:[string,string]=[
    'piecewise(cos(phi),1,.04+.004*i,.02+.002*i)*cos(phi)',
    'piecewise(cos(phi),1,.04+.004*i,.02+.002*i)*sin(phi)',
  ];
  const params=readTessParams({...tessPreset('ring'),ringMode:'origamica',rings:2,
    outerRadii:[1,1.8,2.6],creaseRadii:[1.35,2.15],offsetAngle:13,
    outerVectorTemplate:pair,creaseVectorTemplate:pair});
  assert.ok(params&&params.family==='ring');
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  assert.deepEqual(readTessParams(changeTessParams(params,{angle:42})),{...params,angle:42});
  assert.equal(readTessParams({...params,outerVectorTemplate:['piecewise(cos(phi),1,.04,.02);','sin(phi)']}),null);
});

test('ordinary three-argument piecewise branches survive parameter readback',()=>{
  const pair:[string,string]=[
    'piecewise(cos(phi),1+(.04+.004*i)*cos(phi)**2,1+(.02+.002*i)*cos(phi)**2)*cos(phi)',
    'piecewise(cos(phi),1+(.04+.004*i)*cos(phi)**2,1+(.02+.002*i)*cos(phi)**2)*sin(phi)',
  ];
  const params=readTessParams({...tessPreset('ring'),ringMode:'origamica',rings:2,
    outerRadii:[1,1.8,2.6],creaseRadii:[1.35,2.15],offsetAngle:13,
    outerVectorTemplate:pair,creaseVectorTemplate:pair});
  assert.ok(params&&params.family==='ring');
  assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
  assert.deepEqual(readTessParams(changeTessParams(params,{angle:42})),{...params,angle:42});
});

test('the saved Squaring the Circle formula pair persists as an indexed vector function',()=>{
 const pair:[string,string]=[
  'sign(cos(phi))*abs(cos(phi))**(1/(i+1))',
  'sign(sin(phi))*abs(sin(phi))**(1/(i+1))',
 ];
 const params=readTessParams({...tessPreset('ring'),ringMode:'origamica',sides:20,rings:3,
  angle:45,offsetAngle:6,outerRadii:[.75,1.75,2.75,3.75],creaseRadii:[1,2,3],
  outerVectorTemplate:pair,creaseVectorTemplate:pair});
 assert.ok(params&&params.family==='ring');
 assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
});

test('section 31 Mathematica numeric component syntax survives project readback',()=>{
 const pair:[string,string]=[
  'Sign[Cos[φ]] Abs[Cos[φ]]^(1/(i+1))',
  'Sign[Sin[φ]] Abs[Sin[φ]]^(1/(i+1))',
 ];
 const base={...tessPreset('ring'),ringMode:'origamica',sides:20,rings:3,
  angle:45,offsetAngle:6,outerRadii:[.75,1.75,2.75,3.75],creaseRadii:[1,2,3]};
 const params=readTessParams({...base,outerVectorTemplate:pair,creaseVectorTemplate:pair});
 assert.ok(params&&params.family==='ring');
 assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
 assert.deepEqual(params.outerVectorTemplate,pair);
 const escaped:[string,string]=['2Cos[\\[Phi]+\\[Pi]/4]','2Sin[\\[Phi]+\\[Pi]/4]'];
 assert.ok(readTessParams({...base,outerVectorTemplate:escaped,creaseVectorTemplate:escaped}));
 assert.equal(readTessParams({...base,outerVectorTemplate:['Cos[φ];1','Sin[φ]'],creaseVectorTemplate:pair}),null);
});

test('Mathematica Piecewise comparisons and scientific constants remain verbatim in indexed and per-ring projects',()=>{
 const pair:[string,string]=[
  'Piecewise[{{1+.04 Cos[φ]^2,Cos[φ]≥0}},1+.02 Cos[φ]^2] Cos[φ]',
  'Piecewise[{{1+.04 Cos[φ]^2,Cos[φ]>=0}},1+.02 Cos[φ]^2] Sin[φ]',
 ];
 const base={...tessPreset('ring'),ringMode:'origamica',rings:2,offsetAngle:13,
  outerRadii:[1,1.8,2.6],creaseRadii:[1.35,2.15]};
 const indexed=readTessParams({...base,outerVectorTemplate:pair,creaseVectorTemplate:pair});
 assert.ok(indexed&&indexed.family==='ring');
 assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(indexed))),indexed);
 const rows={outerVectorExpressions:Array.from({length:3},()=>pair),creaseVectorExpressions:Array.from({length:2},()=>pair)};
 const perRing=readTessParams({...base,...rows});
 assert.ok(perRing&&perRing.family==='ring');
 assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(perRing))),perRing);
 assert.ok(readTessParams({...base,outerVectorTemplate:['1.5*^-2 Cos[φ+90°]','E Sin[φ+90\\[Degree]]'],creaseVectorTemplate:pair}));
 assert.equal(readTessParams({...base,outerVectorTemplate:['Cos[φ]:=1','Sin[φ]'],creaseVectorTemplate:pair}),null);
 assert.equal(readTessParams({...base,...rows,outerVectorTemplate:pair,creaseVectorTemplate:pair}),null);
});

test('section 31 local pure function definitions and actual calls survive strict project readback',()=>{
 const definitions=['F[x_,i_]:=Sign[x] Abs[x]^(1/(1+i))'];
 const pair:[string,string]=['F[Cos[φ],i]','F[Sin[φ],i]'];
 const base={...tessPreset('ring'),ringMode:'origamica',sides:20,rings:3,
  angle:45,offsetAngle:6,outerRadii:[.75,1.75,2.75,3.75],creaseRadii:[1,2,3]};
 const params=readTessParams({...base,vectorFunctionDefinitions:definitions,outerVectorTemplate:pair,creaseVectorTemplate:pair});
 assert.ok(params&&params.family==='ring');
 assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
 assert.deepEqual(params.vectorFunctionDefinitions,definitions);
 assert.deepEqual(params.outerVectorTemplate,pair);
 const changed=changeTessParams(params,{offsetAngle:9});
 assert.deepEqual(changed.vectorFunctionDefinitions,definitions);
 const rows=(n:number)=>Array.from({length:n},(_,i)=>pair.map(item=>item.replace(/,i\]/g,`,${i}]`)));
 const perRing=readTessParams({...base,vectorFunctionDefinitions:definitions,outerVectorExpressions:rows(4),creaseVectorExpressions:rows(3)});
 assert.ok(perRing&&perRing.family==='ring');
 assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(perRing))),perRing);
 const generic=['Component[t_,c_]:=Radial[t] c','Radial[t_]:=1+.02 Cos[3t]'];
 assert.ok(readTessParams({...base,vectorFunctionDefinitions:generic,outerVectorTemplate:['Component[φ,Cos[φ]]','Component[φ,Sin[φ]]'],creaseVectorTemplate:['Component[φ,Cos[φ]]','Component[φ,Sin[φ]]']}));
 for(const value of [[],null,['F[x_]:=F[x]'],['F[x_]:=G[x]','G[x_]:=F[x]'],['F[x_]:=x','F[x_]:=x'],['Cos[x_]:=x'],['F[x_,x_]:=x'],['F[x_]:=x+i'],['F[x_]:=Unknown[x]'],['F[x_]:=1e999'],['F[x_]:=1000001'],['F[x_]:=x;1'],['F[x_]:=x=1']]){
  assert.equal(readTessParams({...params,vectorFunctionDefinitions:value}),null);
 }
 assert.equal(readTessParams({...base,vectorFunctionDefinitions:definitions}),null);
 assert.equal(readTessParams({...tessPreset('ring'),vectorFunctionDefinitions:definitions}),null);
 assert.equal(readTessParams({...tessPreset('periodic'),vectorFunctionDefinitions:definitions}),null);
});

test('the notebook Squaring the Circle preserves vector-valued signed powers',()=>{
 const params=readTessParams({...tessPreset('ring'),ringMode:'origamica',sides:20,rings:3,
   angle:45,offsetAngle:6,outerRadii:[.75,1.75,2.75,3.75],creaseRadii:[1,2,3],
   outerSignedPowers:[1,2,3,4],creaseSignedPowers:[1,2,3]});
 assert.ok(params&&params.family==='ring');
 assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
 assert.equal(readTessParams({...params,outerSignedPowers:[1,2,3]}),null);
 assert.equal(readTessParams({...params,outerSignedPowers:[1,2,3,2.5]}),null);
 assert.equal(readTessParams({...params,outerExpressions:['r','r','r','r'],creaseExpressions:['r','r','r']}),null);
 assert.equal(readTessParams({...tessPreset('ring'),sides:20}),null,'mesh mode keeps its 16-sector limit');
});

test('original literal F overloads remain verbatim in indexed and per-ring projects',()=>{
 const definitions=['F[x_,i_]:=Sign[x] Abs[x]^(1/(1+i))','F[0,i_]:=0','F[x_,0]:=x'];
 const pair:[string,string]=['F[Cos[φ],i]','F[Sin[φ],i]'];
 const base={...tessPreset('ring'),ringMode:'origamica',sides:20,rings:3,angle:45,offsetAngle:6,
  outerRadii:[.75,1.75,2.75,3.75],creaseRadii:[1,2,3]};
 const indexed=readTessParams({...base,vectorFunctionDefinitions:definitions,outerVectorTemplate:pair,creaseVectorTemplate:pair});
 assert.ok(indexed&&indexed.family==='ring');
 assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(indexed))),indexed);
 assert.deepEqual(readTessParams(changeTessParams(indexed,{offsetAngle:9})),{...indexed,offsetAngle:9});
 const rows=(n:number)=>Array.from({length:n},(_,index)=>pair.map(item=>item.replace(/,i\]/g,`,${index}]`)));
 const perRing=readTessParams({...base,vectorFunctionDefinitions:definitions,outerVectorExpressions:rows(4),creaseVectorExpressions:rows(3)});
 assert.ok(perRing&&perRing.family==='ring');assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(perRing))),perRing);
 for(const bad of [definitions.slice(1),[...definitions,'F[0.0,j_]:=0'],['F[x_]:=x','F[x_,0]:=x'],['F[x_]:=x','F[1e999]:=0'],['F[x_]:=x','F[0]:=F[1]'],['Module[x_]:=x']]){
  assert.equal(readTessParams({...indexed,vectorFunctionDefinitions:bad}),null);
 }
});

test('lexical scalar Module and finite index modes survive strict project and editor readback',()=>{
 const definitions=['Component[t_,c_,k_]:=Module[{r=1+.015 k Cos[3t]},r c]','Component[t_,c_,0]:=c'];
 const pair:[string,string]=['Component[φ,Cos[φ],i]','Component[φ,Sin[φ],i]'];
 const base={...tessPreset('ring'),ringMode:'origamica',rings:2,offsetAngle:13,
  outerRadii:[1,1.8,2.6],creaseRadii:[1.35,2.15]};
 const params=readTessParams({...base,vectorFunctionDefinitions:definitions,outerVectorTemplate:pair,creaseVectorTemplate:pair});
 assert.ok(params&&params.family==='ring');assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(params))),params);
 assert.deepEqual(readTessParams(changeTessParams(params,{angle:42})),{...params,angle:42});
 const generic=['Basis[t_,order_]:=Module[{power=1/(1+order)},Sign[t] Abs[t]^power]','Basis[0,order_]:=0','Basis[t_,0]:=t'];
 assert.ok(readTessParams({...base,vectorFunctionDefinitions:generic,outerVectorTemplate:['Basis[Cos[φ],i]','Basis[Sin[φ],i]'],creaseVectorTemplate:['Basis[Cos[φ],i]','Basis[Sin[φ],i]']}));
 const scoped=['Scoped[t_]:=Module[{t=Cos[t]},Module[{t=t+.02},t]]'];
 assert.ok(readTessParams({...params,vectorFunctionDefinitions:scoped}));
 for(const bad of [['F[x_]:=Module[{a},x]'],['F[x_]:=Module[{a=1,b=2,c=3,d=4,e=5},x]'],['F[x_]:=Module[{a=1,a=2},x]'],['F[x_]:=Module[{a=1e999},x]'],['F[x_]:=Module[{a=1,b=a},b]'],['F[x_]:=Module[{a=x},a=1]'],['F[x_]:=Module[{a=x},a;1]'],['F[x_]:=Module[{a=x},While[a>0,a]]'],['F[x_]:=Module[{a=Unknown[x]},x]'],['F[x_]:=Module[{a=F[x]},x]']]){
  assert.equal(readTessParams({...params,vectorFunctionDefinitions:bad}),null);
 }
});
