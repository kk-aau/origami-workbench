import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as sink from '../../src/app/diagramSinkGuide';
import {blankDoc} from '../../src/app/state';
import {buildDiagramFold} from '../../src/core/geometry';
import type {Doc,Point,Segment} from '../../src/core/types';

const corners:Point[]=[[60,60],[140,60],[140,140],[60,140]];
const sheetCorners:Point[]=[[0,0],[200,0],[200,200],[0,200]];
const center:Point=[100,100];

function crease(id:string,a:Point,b:Point,angle:number):Segment{
  return {id,a,b,assignment:angle<0?'M':'V',angle};
}
function sheet(creases:Segment[]):Doc{
  const doc=blankDoc('跨沉口变号',200,200);
  return {...doc,segments:[...doc.segments,...creases]};
}
function rim(angle:number){
  return corners.map((p,i)=>crease('rim-'+i,p,corners[(i+1)%4],angle));
}
function split(s:Segment):Segment[]{
  const mid:Point=[(s.a[0]+s.b[0])/2,(s.a[1]+s.b[1])/2];
  return [{...s,id:s.id+'-a',a:mid,b:s.a},{...s,id:s.id+'-b',a:s.b,b:mid}];
}
function assertCorners(result:{ring:Point[]}|undefined){
  assert.ok(result,'应识别方形沉口');
  assert.deepEqual(new Set(result.ring.map(p=>p.join(','))),new Set(corners.map(p=>p.join(','))));
}

// Four diagonals pass through corners. The horizontal passes through the
// middle of two sides, with the opposite outer/inner assignment to the diagonals.
function screenshot(polarity:number):Doc{
  const diagonal=-180*polarity,horizontal=-diagonal;
  return sheet([
    ...rim(diagonal),
    ...sheetCorners.map((p,i)=>crease('outside-'+i,p,corners[i],diagonal)),
    ...corners.map((p,i)=>crease('inside-'+i,center,p,-diagonal)),
    crease('left',[0,100],[60,100],horizontal),
    crease('middle',[60,100],[140,100],-horizontal),
    crease('right',[140,100],[200,100],horizontal),
  ]);
}
for(const polarity of [1,-1])test('对角和水平线过环变号，同一张 CP 可识别'+(polarity===1?'峰折环':'谷折环'),()=>{
  const doc=screenshot(polarity);
  assertCorners(sink.findSinkBoundaryPattern(doc));
  const before=sheet([]);
  assertCorners(sink.findAutomaticSinkPattern(before,doc));
});

test('整圈山谷反转后，三维中间态的实测沉口与支撑折角也要反号',()=>{
  for(const polarity of [1,-1]){
    const diagonal=-180*polarity;
    const before=sheet([...sheetCorners.map((p,i)=>crease('old-'+i,center,p,diagonal)),
      crease('old-horizontal',[0,100],[200,100],-diagonal)]);
    const after=screenshot(polarity);
    const pattern=sink.findAutomaticSinkPattern(before,after);
    assert.ok(pattern);
    const {doc,pose}=sink.createAutomaticSinkGuide(before,after,pattern);
    const {graph}=buildDiagramFold(doc);
    const onRim=(v:number)=>corners.some(([x,y])=>graph.vertices_coords[v][0]===x&&graph.vertices_coords[v][1]===y);
    let rimCount=0,supportCount=0;
    graph.edges_vertices.forEach(([a,b],i)=>{
      if(Math.abs(graph.edges_foldAngle[i]??0)!==90)return;
      const rimEdge=onRim(a)&&onRim(b);
      if(rimEdge)rimCount++;else supportCount++;
      const measured=pose.spatial.measuredAngles[i];
      assert.ok(measured!==null&&Math.abs(measured-(rimEdge?-90:90)*polarity)<1e-6);
    });
    assert.deepEqual([rimCount,supportCount],[4,4]);
  }
});

test('闭环同时含有山边和谷边时，仍可按每个入口变号识别',()=>{
  const doc=screenshot(1);
  const mixed={...doc,segments:doc.segments.map(s=>s.id==='rim-1'||s.id==='rim-3'?crease(s.id,s.a,s.b,180):s)};
  assertCorners(sink.findSinkBoundaryPattern(mixed));
});

test('沉口中心相同、尺寸改变时，识别本步的新轮廓',()=>{
  const before=screenshot(1);
  const resized=(p:Point):Point=>corners.some(([x,y])=>x===p[0]&&y===p[1])?
    [100+(p[0]-100)*.5,100+(p[1]-100)*.5]:
    (p[1]===100&&(p[0]===60||p[0]===140)?[100+(p[0]-100)*.5,100]:p);
  const after={...before,segments:before.segments.map(s=>({...s,a:resized(s.a),b:resized(s.b)}))};
  const event=sink.findAutomaticSinkPattern(before,after);
  assert.ok(event);
  assert.deepEqual(new Set(event.ring.map(p=>p.join(','))),new Set(corners.map(p=>resized(p).join(','))));
});

// The two horizontal creases cross at different heights and enter through
// different locations. The rim already exists and there is no shared tip.
function parallelFolds(inverted:boolean):Segment[]{
  return [83,117].flatMap((y,i)=>{
    const outside=i===0?-80:65;
    return [
      crease('left-'+i,[0,y],[60,y],outside),
      crease('inside-'+i,[60,y],[140,y],inverted?-outside:outside),
      crease('right-'+i,[140,y],[200,y],outside),
    ];
  });
}
test('已有的非平折沉口、分段及反向绘制的折痕、没有公共尖点',()=>{
  const before=sheet([...rim(-80),...parallelFolds(false)]);
  const after=sheet([...rim(-80),...parallelFolds(true)].flatMap(split).reverse());
  assertCorners(sink.findSinkBoundaryPattern(after));
  assertCorners(sink.findAutomaticSinkPattern(before,after));
});

test('保留沉口、无折叠动作或仅在远处新增折线不会重报沉折',()=>{
  const oldLines=[...rim(-90),...parallelFolds(true)];
  const before=sheet(oldLines),copied=structuredClone(before);
  const after=sheet([...oldLines.flatMap(split),crease('elsewhere',[0,8],[8,0],135)]);
  assertCorners(sink.findSinkBoundaryPattern(after));
  assert.equal(sink.findAutomaticSinkPattern(before,copied),undefined);
  assert.equal(sink.findAutomaticSinkPattern(before,after),undefined);
});

test('已有沉口和本步新的沉口并存时，事件返回本步发生的沉口',()=>{
  const shifted=(p:Point,x:number):Point=>[x+.4*p[0],60+.4*p[1]];
  const shape=(x:number,inverted:boolean)=>[...rim(-90),...parallelFolds(inverted)].map(s=>({
    ...s,id:x+'-'+s.id,a:shifted(s.a,x),b:shifted(s.b,x),
  }));
  const original=shape(10,true);
  const before=sheet([...original,...shape(110,false)]);
  const after=sheet([...original,...shape(110,true)]);
  const event=sink.findAutomaticSinkPattern(before,after);
  assert.ok(event);
  assert.deepEqual(new Set(event.ring.map(p=>p.join(','))),new Set(corners.map(p=>shifted(p,110).join(','))));
});

test('边界有缺口、折痕贯穿而未变号或仅有一个入口未变号时不构成该沉口',()=>{
  const crossing=parallelFolds(true).filter(s=>s.id.endsWith('-0'));
  const open=sheet([...rim(-90).slice(1),...crossing]);
  const same=sheet([...rim(-90),...parallelFolds(false)]);
  const oneUnchanged=sheet([...rim(-90),...crossing.map(s=>
    s.id==='left-0'?crease(s.id,s.a,s.b,-s.angle!):s)]);
  for(const doc of [open,same,oneUnchanged])assert.equal(sink.findSinkBoundaryPattern(doc),undefined);
});

test('尖点辐射线前后步骤均反色，仍须核对操作后每个实际入口的内外山谷',()=>{
  const before=sheet([
    ...sheetCorners.map((p,i)=>crease('old-diagonal-'+i,p,center,-180)),
    crease('old-horizontal',[0,100],[200,100],180),
  ]);
  const after=sheet([
    ...rim(-180),
    ...sheetCorners.map((p,i)=>crease('outer-'+i,p,corners[i],-180)),
    ...corners.map((p,i)=>crease('inner-'+i,p,center,180)),
    // The left entrance is M on both sides. Every spoke incident
    // to the centre nevertheless has the opposite sign to its old CP.
    crease('left',[0,100],[60,100],-180),
    crease('inner-horizontal',[60,100],[140,100],-180),
    crease('right',[140,100],[200,100],180),
  ]);
  assert.equal(sink.findSinkBoundaryPattern(after),undefined);
  assert.equal(sink.findAutomaticSinkPattern(before,after),undefined);
});

test('同一顶点外侧相切的两个异号线段未穿过环，不能充当入口',()=>{
  const tangents=corners.flatMap((p,i)=>{
    const dx=i===0||i===2?30:-30;
    return [crease('touch-a-'+i,[p[0]-30,p[1]+dx],p,-90),crease('touch-b-'+i,p,[p[0]+30,p[1]-dx],90)];
  });
  assert.equal(sink.findSinkBoundaryPattern(sheet([...rim(-90),...tangents])),undefined);
});
