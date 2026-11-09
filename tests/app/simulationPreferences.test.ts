import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultSimulationPreferences,normalizeSimulationPreferences,readSimulationPreferences,saveSimulationPreferences,SIMULATION_PREFERENCES_KEY,type SimulationPreferences} from '../../src/app/simulationPreferences';
import {DEFAULT_SIMULATION_SOLVER_SETTINGS} from '../../src/engine/simSettings';
import {DEFAULT_SIMULATION_DISPLAY_OPTIONS} from '../../src/engine/simDisplay';
import {preferenceStorage} from '../../src/app/preferenceStorage';

function memoryStorage(initial:string|null=null){
  let saved=initial,writes=0;
  return {
    getItem:(key:string)=>{assert.equal(key,SIMULATION_PREFERENCES_KEY);return saved;},
    setItem:(key:string,value:string)=>{assert.equal(key,SIMULATION_PREFERENCES_KEY);saved=value;writes++;},
    get saved(){return saved;},get writes(){return writes;},
  };
}

test('defaults contain only reusable simulation settings and every call owns its mutable objects',()=>{
  const first=defaultSimulationPreferences(),second=defaultSimulationPreferences();
  assert.deepEqual(first.solver,DEFAULT_SIMULATION_SOLVER_SETTINGS);
  assert.deepEqual(first.display,DEFAULT_SIMULATION_DISPLAY_OPTIONS);
  assert.equal(first.front,'#faf4e0');assert.equal(first.back,'#7fa78f');
  assert.equal(first.mode,'paper');assert.equal(first.camera,'isometric');assert.equal(first.creaseStyle,'assignment');
  assert.equal(first.speed,1);assert.equal(first.loop,false);assert.equal(first.pngScale,1);
  assert.deepEqual(first.animation,[{id:'fold-to-100',kind:'fold',target:100,duration:10}]);
  first.solver.axialStiffness=100;first.display.background='#000000';first.animation[0].duration=20;
  assert.deepEqual(second,defaultSimulationPreferences());
  for(const forbidden of ['model','progress','running','status','vertices'])assert.ok(!(forbidden in second));
});

test('known partial settings inherit defaults and colours normalize without mutating the input',()=>{
  const input={mode:'normals',camera:'bottom',front:'#ABCDEF',display:{showFaces:false,facets:true},animation:[{id:'wait',kind:'hold',duration:1}]};
  const normalized=normalizeSimulationPreferences(input)!;
  assert.equal(normalized.mode,'normals');assert.equal(normalized.camera,'bottom');assert.equal(normalized.front,'#abcdef');
  assert.equal(normalized.display.showFaces,false);assert.equal(normalized.display.facets,true);
  assert.equal(normalized.display.strainClip,DEFAULT_SIMULATION_DISPLAY_OPTIONS.strainClip);
  assert.equal(normalized.speed,1);normalized.animation[0].duration=2;assert.equal(input.animation[0].duration,1);
});

test('all persisted settings round-trip through a versioned in-memory record',()=>{
  const preferences:SimulationPreferences={
    ...defaultSimulationPreferences(),
    solver:{...DEFAULT_SIMULATION_SOLVER_SETTINGS,integrationType:'verlet',axialStiffness:75,panelStiffness:.2,maxStepsPerFrame:80},
    display:{...DEFAULT_SIMULATION_DISPLAY_OPTIONS,mountains:false,unassigned:false,strainClip:2,background:'#123456'},
    mode:'strain',creaseStyle:'crease',camera:'free',front:'#010203',back:'#fedcba',speed:.25,loop:true,pngScale:4,
    animation:[{id:'invert',kind:'fold',target:-100,duration:4},{id:'wait',kind:'hold',duration:.1}],
  };
  const storage=memoryStorage();saveSimulationPreferences(preferences,storage);
  assert.equal(SIMULATION_PREFERENCES_KEY,'zhezhi.simulation-preferences.v1');
  assert.deepEqual(JSON.parse(storage.saved!),{version:1,preferences});
  assert.deepEqual(readSimulationPreferences(storage),preferences);
  assert.equal(storage.writes,1);
});

test('diagram style round-trips without replacing the assignment style default',()=>{
  const storage=memoryStorage(),preferences={...defaultSimulationPreferences(),creaseStyle:'diagram' as const,collision:true};
  saveSimulationPreferences(preferences,storage);
  assert.equal(readSimulationPreferences(storage).creaseStyle,'diagram');
  assert.equal(readSimulationPreferences(storage).collision,true);
  assert.equal(normalizeSimulationPreferences({collision:1}),null);
  assert.equal(normalizeSimulationPreferences({speed:1})?.collision,false);
  assert.equal(defaultSimulationPreferences().creaseStyle,'assignment');
});

test('unknown keys, unsupported choices and nonfinite nested settings reject the whole preference record',()=>{
  const invalid:unknown[]=[null,[],new Date(),{progress:20},{running:true},{unknown:1},{mode:'material'},{camera:'diagonal'},
    {creaseStyle:'dash'},{front:'faf4e0'},{back:'#fff'},{front:'#12345z'},{speed:3},{speed:'1'},{loop:1},{pngScale:3},
    {solver:{...DEFAULT_SIMULATION_SOLVER_SETTINGS,axialStiffness:Infinity}},{solver:{...DEFAULT_SIMULATION_SOLVER_SETTINGS,unknown:1}},
    {solver:{axialStiffness:20}},{display:{strainClip:NaN}},{display:{unassigned:'yes'}},{display:{unknown:true}},
    {animation:[{id:'fold',kind:'fold',target:Infinity,duration:1}]},{animation:[{id:'hold',kind:'hold',duration:1,target:100}]},
    {animation:[{id:'hold',kind:'hold',duration:1,unknown:1}]},{animation:new Array(1)},{mode:undefined},
  ];
  for(const record of invalid)assert.equal(normalizeSimulationPreferences(record),null,JSON.stringify(record));
  assert.equal(normalizeSimulationPreferences({[Symbol('unknown')]:true}),null);
  const inherited=Object.create({mode:'paper'});inherited.speed=1;assert.equal(normalizeSimulationPreferences(inherited),null);
});

test('damaged storage and unknown versions return fresh defaults without rewriting the original record',()=>{
  const valid=defaultSimulationPreferences();
  for(const raw of [null,'not JSON','null','[]','{}',JSON.stringify({version:2,preferences:{...valid,speed:2}}),
    JSON.stringify({version:1,preferences:{...valid,unknown:1}}),JSON.stringify({version:1,preferences:valid,unknown:1}),
    JSON.stringify({version:1,preferences:{...valid,display:{strainClip:0}}})]){
    const storage=memoryStorage(raw);assert.deepEqual(readSimulationPreferences(storage),defaultSimulationPreferences());
    assert.equal(storage.saved,raw);assert.equal(storage.writes,0);
  }
  const storage=memoryStorage('{"version":1,"preferences":{"speed":2}}');
  assert.equal(readSimulationPreferences(storage).speed,2);assert.equal(storage.writes,0);
  assert.deepEqual(readSimulationPreferences({getItem:()=>{throw Error('disk unavailable');}}),defaultSimulationPreferences());
});

test('save errors propagate and invalid preferences never reach storage',()=>{
  const storage=memoryStorage('previous');
  assert.throws(()=>saveSimulationPreferences({...defaultSimulationPreferences(),speed:3} as unknown as SimulationPreferences,storage),/无效/);
  assert.equal(storage.saved,'previous');assert.equal(storage.writes,0);
  const failure=Error('disk is read-only');
  assert.throws(()=>saveSimulationPreferences(defaultSimulationPreferences(),{setItem:()=>{throw failure;}}),error=>error===failure);
});

test('default persistence routes through preferenceStorage without touching user storage',()=>{
  const storage=memoryStorage(),get=preferenceStorage.getItem,set=preferenceStorage.setItem;
  try{
    preferenceStorage.getItem=storage.getItem;preferenceStorage.setItem=storage.setItem;
    const preferences={...defaultSimulationPreferences(),loop:true};
    saveSimulationPreferences(preferences);assert.deepEqual(readSimulationPreferences(),preferences);assert.equal(storage.writes,1);
  }finally{preferenceStorage.getItem=get;preferenceStorage.setItem=set;}
});
