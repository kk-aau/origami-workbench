import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkedJunctions,EditedJunctionCheck,graphJunctions} from '../../src/core/editedJunctions';
import type {Doc,Point,Segment} from '../../src/core/types';
const cp=(...segments:Segment[]):Doc=>({name:'局部检查',paper:{width:100,height:100},segments});
const line=(id:string,a:Point,b:Point,assignment:Segment['assignment']='M',angle:number|null=null):Segment=>({id,a,b,assignment,angle});
const at=(doc:Doc,p:Point,spatial=false)=>checkedJunctions(doc,spatial).find(w=>Math.hypot(w.point[0]-p[0],w.point[1]-p[1])<1e-6);
const bar=line('bar',[0,2],[8,2]),stem=line('stem',[4,2],[4,7]);
test('两端分别检查，辅助线不能连接悬空端，纸边允许结束',()=>{
  const lone=line('l',[0,0],[3,0]);
  assert.equal(checkedJunctions(cp(lone)).length,2);
  const doc=cp(lone,line('edge',[0,-2],[0,3],'B'),line('aux',[3,-1],[3,5],'A'));
  assert.deepEqual(checkedJunctions(doc),[{kind:'loose',point:[3,0]}]);
});
test('T 型包含已自动切开的横线，十字交点不会误报 T',()=>{
  assert.equal(at(cp(bar,stem),[4,2])?.kind,'t');
  assert.equal(at(cp({...bar,b:[4,2]},line('rest',[4,2],[8,2]),stem),[4,2])?.kind,'t');
  assert.equal(at(cp(bar,{...stem,a:[4,-4]}),[4,2]),undefined);
});
test('检查交替扇区角，空间结构仅豁免角度检查',()=>{
  const skew=line('skew',[2,0],[6,4],'V');
  const doc=cp(bar,skew,stem);
  const cross=cp(bar,skew);
  const issue=at(cross,[4,2]);
  assert.equal(issue?.kind,'angle');
  assert.ok(Math.abs((issue?.degrees??0)-180)>1);
  assert.equal(at(cross,[4,2],true),undefined);
  assert.equal(at(cross,[2,0],true)?.kind,'loose');
  assert.equal(at(cp(bar,{...skew,angle:90}),[4,2]),undefined);
  assert.ok(checkedJunctions(doc).length);
  assert.equal(at(cp(bar,stem),[4,2],true)?.kind,'t');
});
test('局部新增、移动、删除、撤销都和首次检查一致，远处结果保留',()=>{
  const remote=line('far',[21,22],[25,27]),base=cp(remote,bar);
  const checker=new EditedJunctionCheck();
  const far=at(base,remote.a);
  let prior=base;
  for(const s of [[remote,bar,stem],[remote,bar,{...stem,a:[2,0] as Point}], [remote,bar], [remote,bar,stem]]){
    const next=cp(...s),actual=checkedJunctions(next,false,prior,checker);
    assert.strictEqual(actual.find(w=>w.point[0]===21),far);
    const ordered=(values:typeof actual)=>values.map(v=>JSON.stringify(v)).sort();
    assert.deepEqual(ordered(actual),ordered(checkedJunctions(cp(...s))));
    prior=next;
  }
});
test('材料图上坐标相同的切口两岸保持独立',()=>{
  const issues=graphJunctions({vertices_coords:[[0,0],[1,0],[0,0],[0,1]],edges_vertices:[[0,1],[2,3]],edges_assignment:['M','V'],edges_foldAngle:[-180,180]});
  assert.equal(issues.filter(w=>w.point[0]===0&&w.point[1]===0&&w.kind==='loose').length,2);
});

test('奇数条非 T 形折线也无法围成交替的两组角',()=>{
  const center:Point=[5,5];
  const doc=cp(line('a',center,[9,5]),line('b',center,[3,9]),line('c',center,[3,1]));
  assert.equal(at(doc,center)?.rayCount,3);
  assert.equal(at(doc,center,true),undefined);
});
