import test from 'node:test';
import assert from 'node:assert/strict';
import {TOOL_COMMANDS,resolveToolCommand,searchToolCommands,type ToolCommand} from '../../src/app/toolCommands';

type DiagramTestTool='diagramSelect'|'diagramLine'|'diagramCurve'|'diagramRotate';
const diagramCommands:readonly ToolCommand<DiagramTestTool>[]=[
  {tool:'diagramSelect',name:'选择图形',aliases:['V','SELECT']},
  {tool:'diagramLine',name:'折序线',aliases:['L','LINE']},
  {tool:'diagramCurve',name:'曲线箭头',aliases:['C','CURVE']},
  {tool:'diagramRotate',name:'旋转箭头',aliases:['RO','ROTATE']},
];

test('custom command catalogs resolve their own aliases, IDs and Chinese names',()=>{
  for(const command of diagramCommands)for(const input of [command.tool,command.name,...command.aliases]){
    assert.equal(resolveToolCommand(input,diagramCommands),command,input);
  }
  assert.equal(resolveToolCommand('　ｃ　',diagramCommands)?.tool,'diagramCurve');
  assert.equal(resolveToolCommand(' ｄｉａｇｒａｍＬｉｎｅ ',diagramCommands)?.tool,'diagramLine');
  assert.equal(resolveToolCommand('ROT',diagramCommands),null,'prefixes remain suggestions');
});

test('custom and default command catalogs never leak aliases into each other',()=>{
  assert.equal(TOOL_COMMANDS.length,93);
  assert.equal(resolveToolCommand('C')?.tool,'circle');
  assert.equal(resolveToolCommand('C',diagramCommands)?.tool,'diagramCurve');
  assert.equal(resolveToolCommand('ROTATE'),null);
  assert.equal(resolveToolCommand('ROTATE',diagramCommands)?.tool,'diagramRotate');
  for(const input of ['CIRCLE','CO','circle','复制所选'])assert.equal(resolveToolCommand(input,diagramCommands),null,input);
  for(const input of ['diagramLine','折序线','CURVE','旋转箭头'])assert.equal(resolveToolCommand(input),null,input);
  assert.equal(searchToolCommands('c')[0].tool,'circle');
  assert.equal(searchToolCommands('c',6,diagramCommands)[0].tool,'diagramCurve');
  assert.deepEqual(searchToolCommands('CO',6,diagramCommands),[]);
  assert.deepEqual(searchToolCommands('CURVE'),[]);
});

test('custom searches preserve catalog order, ranking, normalization and limits',()=>{
  assert.deepEqual(searchToolCommands('',undefined,diagramCommands),diagramCommands);
  assert.deepEqual(searchToolCommands('',2.8,diagramCommands),diagramCommands.slice(0,2));
  assert.deepEqual(searchToolCommands('diagram',20,diagramCommands),diagramCommands);
  assert.deepEqual(searchToolCommands('　ｌ　',6,diagramCommands),[diagramCommands[1]]);
  assert.deepEqual(searchToolCommands('箭头',6,diagramCommands),diagramCommands.slice(2));
  for(const limit of [0,-2,NaN,Infinity])assert.deepEqual(searchToolCommands('',limit,diagramCommands),[]);
  assert.deepEqual(searchToolCommands('',6,[]),[]);
  assert.equal(resolveToolCommand('L',[]),null);
});

test('collisions are checked within each catalog independently',()=>{
  const duplicate:readonly ToolCommand<DiagramTestTool>[]=[
    ...diagramCommands,
    {tool:'diagramSelect',name:'重复命令',aliases:['ｃ']},
  ];
  assert.throws(()=>resolveToolCommand('L',duplicate),/工具命令重复/);
  assert.equal(resolveToolCommand('L',diagramCommands)?.tool,'diagramLine');
  assert.equal(resolveToolCommand('L')?.tool,'line');
});
