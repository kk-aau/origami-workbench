import test from 'node:test';
import assert from 'node:assert/strict';
import {TOOL_GUIDES,TOOL_NAMES,type Tool} from '../../src/app/tools';
import {TOOL_COMMANDS,normalizeToolCommand,resolveToolCommand,searchToolCommands} from '../../src/app/toolCommands';

test('command table covers each implemented tool exactly once with a letter alias',()=>{
  assert.deepEqual(TOOL_COMMANDS.map(command=>command.tool).sort(),Object.keys(TOOL_GUIDES).sort());
  assert.equal(new Set(TOOL_COMMANDS.map(command=>command.tool)).size,TOOL_COMMANDS.length);
  for(const command of TOOL_COMMANDS){
    assert.equal(command.name,TOOL_NAMES[command.tool]);
    assert.ok(command.aliases.some(alias=>/^[A-Z]+$/.test(alias)),command.tool+' has an alphabetic command');
    for(const input of [command.tool,command.name,...command.aliases])assert.equal(resolveToolCommand(input),command,input);
  }
});

test('aliases, complete IDs and names have no cross-tool collisions after normalization',()=>{
  const owners=new Map<string,Tool>();
  for(const command of TOOL_COMMANDS)for(const input of [command.tool,command.name,...command.aliases]){
    const key=normalizeToolCommand(input),previous=owners.get(key);
    assert.ok(previous===undefined||previous===command.tool,`${input}: ${previous} / ${command.tool}`);
    owners.set(key,command.tool);
  }
});

test('common CAD aliases resolve to existing tools rather than introducing CAD operations',()=>{
  const expected:Record<string,Tool>={
    L:'line',LINE:'line',V:'select',SELECT:'select',C:'circle',CIRCLE:'circle',
    E:'erase',ERASE:'erase',M:'moveselection',MOVE:'moveselection',
    CO:'copyselection',CP:'copyselection',COPY:'copyselection',MI:'mirrorselection',MIRROR:'mirrorselection',
    TR:'trim',TRIM:'trim',EX:'extend',EXTEND:'extend',O:'offsetparallel',OFFSET:'offsetparallel',
    DI:'measure',DIST:'measure',PL:'parallel',PARALLEL:'parallel',PER:'perpendicular',PERP:'perpendicular',
    POL:'polygon',POLYGON:'polygon',RE:'rabbitear',RABBITEAR:'rabbitear',
    H:'pan',
  };
  for(const [input,tool] of Object.entries(expected)){
    assert.equal(resolveToolCommand(input)?.tool,tool,input);
    assert.equal(resolveToolCommand(input.toLowerCase())?.tool,tool,input.toLowerCase());
  }
});

test('Chinese names and familiar synonyms match exactly, including circle and erase',()=>{
  const expected:Record<string,Tool>={
    线段:'line',选择:'select',圆:'circle',两点圆:'circle',橡皮擦:'erase',擦除线段:'erase',
    移动所选:'moveselection',两点移动:'moveselection',复制所选:'copyselection',两点复制:'copyselection',
    镜像选区:'mirrorselection',截断:'trim',延长:'extend',平行偏移:'offsetparallel',
    测量:'measure',平行:'parallel',垂线:'perpendicular',正多边形:'polygon',兔耳:'rabbitear',
  };
  for(const [input,tool] of Object.entries(expected))assert.equal(resolveToolCommand(input)?.tool,tool,input);
});

test('NFKC, case and surrounding whitespace normalization also work for IDs and numbered tools',()=>{
  assert.equal(normalizeToolCommand(' \tｃｏＰｙ\n'),'COPY');
  assert.equal(normalizeToolCommand('　Ｖｏｒｏｎｏｉ　参考图　'),'VORONOI 参考图');
  assert.equal(resolveToolCommand('　ｍｏＶｅＳｅｌｅｃｔｉｏｎ　')?.tool,'moveselection');
  assert.equal(resolveToolCommand(' ｐＥｒＰ ' )?.tool,'perpendicular');
  assert.equal(resolveToolCommand('公理　５')?.tool,'axiom5');
  assert.equal(resolveToolCommand('Ｌ１')?.tool,'measurel1');
  assert.equal(resolveToolCommand('ｃ３')?.tool,'circle3');
});

test('incomplete, unsupported and parameterized commands never activate a tool',()=>{
  for(const input of ['', ' \n\t', 'ROTATE','ROT','RO','SCALE','SC','FILLET','F','ARC',
    'circl','镜像','LINE 10,20','L;COPY','L\nCOPY','__proto__','constructor','<script>','未知工具']){
    assert.equal(resolveToolCommand(input),null,input);
  }
  assert.ok(searchToolCommands('circl').length>0,'suggesting a prefix does not activate it');
});

test('search prioritizes exact aliases and IDs over prefixes and uses stable ordering',()=>{
  assert.equal(searchToolCommands('CO')[0].tool,'copyselection');
  assert.equal(searchToolCommands('circle')[0].tool,'circle');
  assert.equal(searchToolCommands('COPYSELECTION')[0].tool,'copyselection');
  assert.equal(searchToolCommands('圆')[0].tool,'circle');
  assert.equal(searchToolCommands('MI')[0].tool,'mirrorselection');
  const list=searchToolCommands('c',20);
  assert.equal(list[0].tool,'circle');
  assert.ok(list.some(command=>command.tool==='copyselection'));
  assert.deepEqual(searchToolCommands('　ｃ　',20),list);
  assert.deepEqual(searchToolCommands('c',20),list);
  assert.equal(new Set(list.map(command=>command.tool)).size,list.length);
});

test('search recognizes full ID prefixes and Chinese name substrings',()=>{
  assert.deepEqual(searchToolCommands('angle',20).map(command=>command.tool),['angledrag','angledirection','angleconverge','angleproject']);
  const circles=searchToolCommands('半径',20);
  assert.ok(circles.some(command=>command.tool==='circleradius'));
  assert.ok(circles.some(command=>command.tool==='circleequal'));
  assert.ok(circles.every(command=>command.name.includes('半径')));
  assert.equal(resolveToolCommand('半径'),null,'Chinese substring is only a suggestion');
});

test('empty searches list common tools, limits are respected and unknown searches stay empty',()=>{
  assert.deepEqual(searchToolCommands('').map(command=>command.tool),['line','select','circle','erase','moveselection','copyselection']);
  assert.equal(searchToolCommands('',3).length,3);
  assert.equal(searchToolCommands('',2.8).length,2);
  assert.equal(searchToolCommands('',1000).length,TOOL_COMMANDS.length);
  for(const limit of [0,-2,NaN,Infinity])assert.deepEqual(searchToolCommands('',limit),[]);
  assert.equal(resolveToolCommand('RCOPY')?.tool,'rotatecopyselection');
  assert.equal(resolveToolCommand('ROTATE'),null);
  for(const input of ['UNKNOWNTOOL','不存在','LINE 10,20','__proto__'])assert.deepEqual(searchToolCommands(input),[]);
});
