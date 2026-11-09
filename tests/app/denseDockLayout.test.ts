import test from 'node:test';
import assert from 'node:assert/strict';
import {LEFT_MAIN_GROUPS,LEFT_EXTRA_GROUPS} from '../../src/app/orieditaToolLayout';
import {denseDockLayout} from '../../src/app/denseDockLayout';

const groups=[...LEFT_MAIN_GROUPS,{name:'扩展',tools:LEFT_EXTRA_GROUPS.flatMap(g=>g.tools)}];
test('all 65 left tools fit the dock at desktop and narrow viewport sizes',()=>{
  for(const [width,height] of [[388,450],[368,395],[388,330],[180,270]])for(const requested of [0,6,7,8]){
    const layout=denseDockLayout(groups,width,height,requested);
    const rows=groups.reduce((n,g)=>n+Math.ceil(g.tools.length/layout.columns),0);
    const used=rows*(layout.rowHeight+2)+groups.length*(layout.showHeadings?20:2);
    assert.ok(used<=height,`${width} × ${height}, ${layout.columns} columns needs ${used}`);
    assert.equal(groups.flatMap(g=>g.tools).length,65);
  }
});
test('normal desktop fits eight columns with text labels; narrow docks retain named icon buttons',()=>{
  const normal=denseDockLayout(groups,388,450);
  assert.equal(normal.columns,8);
  assert.equal(normal.showLabels,true);
  assert.equal(normal.showHeadings,true);
  assert.equal(denseDockLayout(groups,180,270).showLabels,false);
});
