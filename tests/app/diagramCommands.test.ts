import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DIAGRAM_COMMANDS,isDiagramDrawingCommand} from '../../src/app/diagramCommands';
import {DIAGRAM_SYMBOL_KINDS} from '../../src/app/diagramAnnotations';
import {normalizeToolCommand,resolveToolCommand,searchToolCommands} from '../../src/app/toolCommands';

test('diagram commands cover all drawing tools and all symbols without normalized collisions',()=>{
  assert.equal(DIAGRAM_COMMANDS.length,63);
  const owners=new Map<string,string>();
  for(const command of DIAGRAM_COMMANDS)for(const token of [command.tool,command.name,...command.aliases]){
    const key=normalizeToolCommand(token),previous=owners.get(key);
    assert.ok(!previous||previous===command.tool,`${token}: ${previous} / ${command.tool}`);owners.set(key,command.tool);
    assert.equal(resolveToolCommand(token,DIAGRAM_COMMANDS),command);
  }
  assert.deepEqual(DIAGRAM_COMMANDS.filter(command=>isDiagramDrawingCommand(command.tool)).map(command=>command.tool).sort(),[
    'select','vertex','line','symbol','pan','erase','polyline','perpendicular','parallel','bisector','trim','extend','fixed','layer','ratio-point','special-point','mirror-copy',
  ].sort());
  assert.deepEqual(DIAGRAM_COMMANDS.filter(command=>command.tool.startsWith('symbol:')).map(command=>command.tool.slice(7)).sort(),[...DIAGRAM_SYMBOL_KINDS].sort());
});

test('diagram aliases preserve familiar supported tools and expose crease types and symbols',()=>{
  const expected={L:'line',V:'select',PLINE:'polyline',PL:'parallel',PER:'perpendicular',MI:'mirror-copy',CO:'copy-selection',MV:'line:valley',MM:'line:mountain',MF:'line:crease',MB:'line:boundary',PFC:'action:precrease',SFOLD:'symbol:fold',谷折箭头:'symbol:fold',双向段折箭头:'symbol:swivelDouble',旋转:'symbol:rotate',顺时针旋转:'symbol:rotate',逆时针旋转:'symbol:rotateCCW',SROTATECCW:'symbol:rotateCCW'};
  for(const [input,command] of Object.entries(expected))assert.equal(resolveToolCommand(input,DIAGRAM_COMMANDS)?.tool,command);
  assert.equal(resolveToolCommand(' ｍｉ ',DIAGRAM_COMMANDS)?.tool,'mirror-copy');
  assert.equal(resolveToolCommand('sfold',DIAGRAM_COMMANDS)?.tool,'symbol:fold');
  assert.equal(searchToolCommands('箭头',60,DIAGRAM_COMMANDS).filter(command=>command.tool.startsWith('symbol:')).length,9);
});

test('unsupported editor-only commands and numeric parameters cannot switch a diagram tool',()=>{
  for(const input of ['C','CIRCLE','DI','DIST','M','MOVE','L 10,20','MI;DEL','不存在'])assert.equal(resolveToolCommand(input,DIAGRAM_COMMANDS),null,input);
  assert.equal(resolveToolCommand('MI')?.tool,'mirrorselection');
  assert.equal(resolveToolCommand('MI',DIAGRAM_COMMANDS)?.tool,'mirror-copy');
});
