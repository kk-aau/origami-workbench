import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ALL_DOCK_GROUPS,LEFT_MAIN_GROUPS,LEFT_EXTRA_GROUPS,RIGHT_DOCK_GROUPS,TOOL_CATEGORY_GROUPS} from '../../src/app/orieditaToolLayout';
import {TOOL_GUIDES} from '../../src/app/tools';
test('dock migration places every existing tool exactly once without inventing tools',()=>{
 const ids=ALL_DOCK_GROUPS.flatMap(g=>g.tools);
 assert.equal(new Set(ids).size,ids.length);
 assert.deepEqual([...ids].sort(),Object.keys(TOOL_GUIDES).sort());
});
test('task categories explicitly assign every existing tool once, including type conversions and background operations',()=>{
 const ids=TOOL_CATEGORY_GROUPS.flatMap(group=>group.tools);
 assert.equal(new Set(ids).size,ids.length);
 assert.deepEqual([...ids].sort(),Object.keys(TOOL_GUIDES).sort());
 assert.deepEqual(TOOL_CATEGORY_GROUPS.map(group=>group.name),['类型','选择','绘制','高级','删除','复制与移动','变换','修复','注释','生成','测量','整理与检查']);
 assert.deepEqual(TOOL_CATEGORY_GROUPS.find(group=>group.id==='types')!.tools,[]);
 for(const id of ['makemountain','makevalley','makeedge','makeaux','replacetype','regionalswap','cycletype'])assert.ok(TOOL_CATEGORY_GROUPS.find(group=>group.id==='transform')!.tools.includes(id as never));
 for(const id of ['alternatecollinear','alternatecross'])assert.ok(TOOL_CATEGORY_GROUPS.find(group=>group.id==='repair')!.tools.includes(id as never));
 assert.deepEqual(TOOL_CATEGORY_GROUPS.find(group=>group.id==='copy-move')!.tools,['moveselection','movefour','copyselection','copyfour','mirrorselection','mirrorline','pan']);
 for(const id of ['backgroundposition','advancetype','operationframe'])assert.ok(TOOL_CATEGORY_GROUPS.find(group=>group.id==='transform')!.tools.includes(id as never));
 assert.deepEqual(TOOL_CATEGORY_GROUPS.find(group=>group.id==='generation')!.tools,['voronoi','axiom5','axiom7','rabbitear','fishbone','drawdivide','drawratio','reflection','reflectionlines','transverse','continuous']);
});
test('advanced contains drawing circles, polygons, tangents, inversions and radius differences while ordinary drawing stays intact',()=>{
 assert.deepEqual(TOOL_CATEGORY_GROUPS.find(group=>group.id==='advanced')!.tools,['polygon','circle','circleradius','circle3','circleseparate','circleconcentric','circleequal','restrictedcircle','tangentpoint','tangentcircles','circleinvert','lineinvert','circledifference']);
 assert.deepEqual(TOOL_CATEGORY_GROUPS.find(group=>group.id==='drawing')!.tools,['line','restrictedline','parallel','offsetparallel','perpendicular','bisect','bisectlines','midperp','angledrag','angledirection','angleconverge','angleproject','divide','ratio','addvertex']);
 for(const id of ['selectpolygon','unselectpolygon'])assert.ok(TOOL_CATEGORY_GROUPS.find(group=>group.id==='selection')!.tools.includes(id as never));
 assert.ok(TOOL_CATEGORY_GROUPS.find(group=>group.id==='transform')!.tools.includes('circleedit'));
 assert.ok(TOOL_CATEGORY_GROUPS.find(group=>group.id==='repair')!.tools.includes('circlepair'));
});
test('Oriedita side assignments keep geometry left and angles/circles/marks/measurement right',()=>{
 const left=new Set([...LEFT_MAIN_GROUPS,...LEFT_EXTRA_GROUPS].flatMap(g=>g.tools)),right=new Set(RIGHT_DOCK_GROUPS.flatMap(g=>g.tools));
 for(const id of ['line','perpendicular','bisect','moveselection','mirrorselection','erase'] as const)assert.ok(left.has(id));
 for(const id of ['angledrag','polygon','circle3','circleinvert','mark','erasemark','measurel1','text'] as const)assert.ok(right.has(id));
 assert.deepEqual(LEFT_MAIN_GROUPS[0].tools.slice(0,4),['line','bisect','rabbitear','localflat']);
});
