import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Point} from '../../src/core/types';
import {computeFlatFold} from '../../src/core/flatFold';
import {blankDoc} from '../../src/app/state';
import type {DiagramPose} from '../../src/app/diagramProject';
import type {DiagramAnnotation,DiagramSymbolAnnotation,DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import {diagramAnnotationMarkup,annotationBounds} from '../../src/app/diagramAnnotationSVG';
import {diagramDrawingFrame,diagramPresentation,diagramModelMarkup,drawingSVG,diagramFoldBackgroundLines,diagramFoldPreviewAttributes,diagramFoldPreviewDrawingOrder,diagramBackgroundLinesForDrawing,isDiagramBackgroundLine} from '../../src/app/diagramDrawing';
import {defaultModelView} from '../../src/app/modelViewState';
import {projectDiagramFoldCP} from '../../src/app/diagramFoldLink';
import type {DiagramFoldPreviewSegment} from '../../src/app/diagramFoldLinkTypes';
import {buildFold,distance} from '../../src/core/geometry';
import {moveFoldedVertices} from '../../src/app/foldedVertexEdit';
import {materialCanonical} from '../../src/core/materialFaceCommon';
import {materialDoc} from '../fixtures/materialModel';

function fixture(){
  const sourceDoc=blankDoc('实际折纸 CP',100,100);
  sourceDoc.segments.push({id:'fold',a:[50,0],b:[50,100],assignment:'M',angle:-180});
  const result=computeFlatFold(sourceDoc);
  assert.equal(result.geometry.status,'ready');
  assert.ok(result.geometry.faces.length>1);
  const pose:DiagramPose={sourceStateId:'cp-0',sourceRevision:0,sourceDoc,result,view:defaultModelView()};
  const annotations:DiagramAnnotation[]=[
    {id:'crease',kind:'line',a:[15,20],b:[35,80],style:'valley',color:'#222222',width:1},
    {id:'arrow',kind:'symbol',symbol:'fold',position:[35,40],size:25,rotation:15,color:'#333333',width:.5},
  ];
  return {pose,annotations};
}

test('existing-crease visibility hides old ink in exports while keeping new folds and unfolding instructions',()=>{
  const {pose}=fixture(),original=structuredClone(pose);
  const marks:DiagramAnnotation[]=[
    {id:'old',kind:'line',a:[10,10],b:[20,20],style:'crease',color:'#abcdef',width:1},
    {id:'new',kind:'line',a:[30,10],b:[40,20],style:'valley',color:'#fedcba',width:1},
  ];
  assert.match(drawingSVG(pose,marks,'',''),/#abcdef/);
  const hidden={...pose,view:{...pose.view!,showExistingCreases:false}};
  const svg=drawingSVG(hidden,marks,'','');
  assert.doesNotMatch(svg,/#abcdef/);assert.match(svg,/#fedcba/);
  const segments=[
    {id:'old',existing:true,visibility:'visible' as const},
    {id:'legacy',assignment:'F',visibility:'visible' as const},
    {id:'new',existing:false,visibility:'visible' as const},
    {id:'unfold',existing:true,unfolding:true,visibility:'visible' as const},
  ];
  assert.deepEqual(diagramFoldPreviewDrawingOrder(segments,{showExistingCreases:false}).map(s=>s.id),['new','unfold']);
  assert.equal(diagramFoldPreviewDrawingOrder(segments).length,4);
  assert.deepEqual(pose,original);
});
function viewBox(svg:string):number[]{
  const raw=svg.match(/viewBox="([^"]+)"/)?.[1];assert.ok(raw);
  const values=raw.split(/\s+/).map(Number);assert.equal(values.length,4);
  assert.ok(values.every(Number.isFinite));assert.ok(values[2]>0&&values[3]>0);
  return values;
}
function contains(frame:{x:number;y:number;width:number;height:number},point:Point){
  assert.ok(point[0]>=frame.x&&point[0]<=frame.x+frame.width,`x=${point[0]} is outside ${JSON.stringify(frame)}`);
  assert.ok(point[1]>=frame.y&&point[1]<=frame.y+frame.height,`y=${point[1]} is outside ${JSON.stringify(frame)}`);
}

test('real CP flat geometry exports its paper faces and the same editable line and symbol artwork',()=>{
  const {pose,annotations}=fixture(),before=structuredClone({pose,annotations});
  const svg=drawingSVG(pose,annotations,'谷折示意','把右侧纸角折向中线');
  assert.match(svg,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.ok(svg.endsWith('</svg>'));viewBox(svg);
  assert.equal(svg.match(/fill-rule="evenodd"/g)?.length,pose.result.geometry.faces.length);
  assert.match(svg,/<path d="M [^>]+ Z" fill="#[0-9a-fA-F]+"/);
  for(const annotation of annotations)assert.ok(svg.includes(diagramAnnotationMarkup(annotation)));
  assert.ok(svg.indexOf('fill-rule="evenodd"')<svg.indexOf('<line '));
  assert.match(svg,/>谷折示意<\/text>/);assert.match(svg,/>把右侧纸角折向中线<\/text>/);
  assert.deepEqual({pose,annotations},before);
});

test('visible paper boundaries cover instruction ink while symbols remain on top',()=>{
  const {pose,annotations}=fixture(),line=annotations[0],symbol=annotations[1];
  const svg=drawingSVG(pose,[symbol,line],'','',undefined,[],true,undefined,[],undefined,{enabled:false});
  const ink=svg.indexOf(diagramAnnotationMarkup(line)),boundary=svg.indexOf('data-diagram-top-boundary="true"'),mark=svg.indexOf(diagramAnnotationMarkup(symbol));
  assert.ok(ink>=0&&ink<boundary&&boundary<mark);
});

test('drawing frame and export encompass a rotated model, a distant crease and a distant rotated symbol',()=>{
  const {pose}=fixture();pose.view={...defaultModelView(),side:'back',rotation:37};
  const farSymbol:DiagramSymbolAnnotation={id:'far',kind:'symbol',symbol:'rotate',position:[-480,700],size:120,rotation:45,color:'#333',width:8};
  const annotations:DiagramAnnotation[]=[farSymbol,{id:'far-line',kind:'line',a:[250,-120],b:[390,30],style:'mountain',color:'#111',width:2}];
  const before=structuredClone({pose,annotations}),frame=diagramDrawingFrame(pose,annotations);
  const expected=annotationBounds(annotations)!;
  for(const point of diagramPresentation(pose).vertices)contains(frame,point);
  contains(frame,[expected.x,expected.y]);contains(frame,[expected.x+expected.width,expected.y+expected.height]);
  assert.ok(frame.x<-480&&frame.y<-120&&frame.x+frame.width>390&&frame.y+frame.height>700);
  const [x,y,width,height]=viewBox(drawingSVG(pose,annotations,'远处符号',''));
  const exported={x,y,width,height};contains(exported,[frame.x,frame.y]);contains(exported,[frame.x+frame.width,frame.y+frame.height]);
  assert.deepEqual({pose,annotations},before);
});

test('titles and descriptions are XML escaped without adding executable markup',()=>{
  const {pose,annotations}=fixture();
  const svg=drawingSVG(pose,annotations,'<script>"折叠" & \'展开\'</script>','<image onload="run()"> A & B');
  assert.ok(svg.includes('&lt;script&gt;&quot;折叠&quot; &amp; &apos;展开&apos;&lt;/script&gt;'));
  assert.ok(svg.includes('&lt;image onload=&quot;run()&quot;&gt; A &amp; B'));
  assert.doesNotMatch(svg,/<script\b|<image\b|<foreignObject\b|onload="/);
});

test('exports contain no special intersection marks or editing handles, while a reference symbol may have its own circle',()=>{
  const {pose,annotations}=fixture(),plain=drawingSVG(pose,annotations,'','');
  assert.doesNotMatch(plain,/<circle\b|vertex|handle|data-annotation-id|tabindex=/);
  const zoom:DiagramSymbolAnnotation={id:'reference',kind:'symbol',symbol:'referencePoint',position:[75,20],size:35,rotation:0,color:'#444444',width:1};
  const magnifier=drawingSVG(pose,[...annotations,zoom],'','');
  assert.equal(magnifier.match(/<circle\b/g)?.length,1);
  assert.ok(magnifier.includes(diagramAnnotationMarkup(zoom)));
  assert.doesNotMatch(magnifier,/vertex|handle|data-annotation-id|tabindex=/);
});

test('annotations can be exported without any folded pose, including a completely empty drawing',()=>{
  const {annotations}=fixture(),svg=drawingSVG(null,annotations,'自由绘图','先画步骤所需折线');
  assert.ok(svg.endsWith('</svg>'));viewBox(svg);
  assert.doesNotMatch(svg,/fill-rule="evenodd"/);
  for(const annotation of annotations)assert.ok(svg.includes(diagramAnnotationMarkup(annotation)));
  const [x,y,width,height]=viewBox(svg),bounds=annotationBounds(annotations)!;
  contains({x,y,width,height},[bounds.x,bounds.y]);contains({x,y,width,height},[bounds.x+bounds.width,bounds.y+bounds.height]);
  const empty=drawingSVG(null,[],'','');viewBox(empty);
  assert.match(empty,/<rect [^>]+ fill="white"\/>/);
  assert.doesNotMatch(empty,/<path\b|<line\b|<circle\b/);
});

test('original CAD components and independent source labels share the main paper export without editing grip graphics',()=>{
 const {pose,annotations}=fixture(),source:DiagramSymbolAnnotation={id:'cad',kind:'symbol',symbol:'fold',position:[20,30],size:35,rotation:23,color:'#222222',width:.5,cadProperties:{'距离1':40}},division:DiagramSymbolAnnotation={...source,id:'division',symbol:'equalDivision',position:[-80,40],cadProperties:{'距离1':14},cadAttributes:{'13648':'A & B','13650':'2'}};
 const svg=drawingSVG(pose,[...annotations,source,division],'原插件折图','');
 assert.ok(svg.includes(diagramAnnotationMarkup(source)));assert.ok(svg.includes(diagramAnnotationMarkup(division)));assert.match(svg,/data-source-handle="1644"/);assert.match(svg,/A &amp; B/);
 assert.equal(svg.match(/fill-rule="evenodd"/g)?.length,pose.result.geometry.faces.length);assert.doesNotMatch(svg,/data-(?:grip|editor-handle|annotation-id)|tabindex=/);viewBox(svg);
});

test('legacy linked SVG with adaptation disabled preserves visible and occluded source artwork',()=>{
  const {pose,annotations}=fixture();
  pose.view={...defaultModelView(),colors:{front:'#fff0d8',back:'#a9c5b0',line:'#314b3c'}};
  const source:DiagramAnnotation={id:'source-fold',kind:'line',a:[0,40],b:[100,40],style:'mountain',color:'#551122',width:2};
  const auxiliary:DiagramAnnotation={id:'guide',kind:'line',a:[10,5],b:[60,65],style:'auxiliary',color:'#778899',width:.4};
  const crease:DiagramAnnotation={id:'existing',kind:'line',a:[5,15],b:[25,15],style:'crease',color:'#999999',width:.8};
  const drawing=[...annotations,source,auxiliary,crease];
  const preview:DiagramFoldPreviewSegment[]=[
    {face:0,a:[0,40],b:[30,40],assignment:'V',visibility:'visible'},
    {face:1,a:[30,40],b:[70,40],assignment:'M',visibility:'hidden'},
    {face:1,a:[70,40],b:[100,40],assignment:'F',visibility:'unknown'},
    {face:0,a:[15,60],b:[30,60],assignment:'U',visibility:'visible'},
  ];
  const before=structuredClone({pose,drawing,preview}),svg=drawingSVG(pose,drawing,'本步折线','',preview,[],true,undefined,[],undefined,{enabled:false});
  for(const annotation of drawing.filter(annotation=>annotation.kind==='symbol'||annotation.kind==='line'&&!['valley','mountain'].includes(annotation.style)))assert.ok(svg.includes(diagramAnnotationMarkup(annotation)));
  assert.ok(!svg.includes(diagramAnnotationMarkup(source)));assert.ok(!svg.includes(diagramAnnotationMarkup(annotations[0])));
  const expected=(index:number,style:'valley'|'mountain'|'crease'|'auxiliary',color:string,width:number)=>diagramAnnotationMarkup({id:'expected',kind:'line',a:preview[index].a,b:preview[index].b,style,color,width});
  assert.ok(svg.includes(`<g opacity="1">${expected(0,'valley','#314b3c',.7)}</g>`),'unmatched valley uses defaults rather than a coincident mountain source');
  assert.ok(svg.includes(`<g opacity="0.24">${expected(1,'mountain','#551122',2)}</g>`),'matched mountain preserves source style while actual occlusion fades it');
  assert.ok(svg.includes(`<g opacity="0.5">${expected(2,'crease','#809389',.7)}</g>`));
  assert.ok(svg.includes(`<g opacity="1">${expected(3,'auxiliary','#314b3c',.7)}</g>`));
  assert.doesNotMatch(svg,/data-diagram-fold-fixed|data-diagram-fold-selected|data-symbol-native-grip|tabindex=/);
  assert.deepEqual({pose,drawing,preview},before);viewBox(svg);
});

test('an omitted linked preview retains old drawings while an explicitly empty preview removes only fold lines',()=>{
  const {pose,annotations}=fixture(),plain=drawingSVG(pose,annotations,'',''),empty=drawingSVG(pose,annotations,'','',[]);
  assert.ok(plain.includes(diagramAnnotationMarkup(annotations[0])));
  assert.ok(!empty.includes(diagramAnnotationMarkup(annotations[0])));
  assert.ok(empty.includes(diagramAnnotationMarkup(annotations[1])));
  assert.equal(plain,drawingSVG(pose,annotations,'','',undefined));viewBox(empty);
});

test('an explicitly unassigned fold mark remains visible in SVG when its CP layer range is empty',()=>{
  const {pose,annotations}=fixture(),unassigned={...annotations[0],foldFaces:[]} as DiagramLineAnnotation;
  const svg=drawingSVG(pose,[unassigned,annotations[1]],'','',[]);
  assert.ok(svg.includes(diagramAnnotationMarkup(unassigned)));
  assert.ok(svg.includes(diagramAnnotationMarkup(annotations[1])));
});

test('legacy CP-derived routes with adaptation disabled keep rotated back-side source artwork and frame',()=>{
  const {pose,annotations}=fixture();pose.view={...defaultModelView(),side:'back',rotation:37};
  const before=pose.sourceDoc,after=structuredClone(before);
  after.segments.push({id:'second-fold',a:[0,50],b:[100,50],assignment:'V',angle:180});
  const {preview}=projectDiagramFoldCP(pose,before,after);
  assert.ok(preview.length>0);assert.ok(preview.some(segment=>Math.abs(segment.a[1]-segment.b[1])>1));
  const svg=drawingSVG(pose,annotations,'CP 自动映射','',preview,[],true,undefined,[],undefined,{enabled:false}),[x,y,width,height]=viewBox(svg);
  const styles={M:'mountain',V:'valley',F:'crease',U:'auxiliary'} as const;
  for(const segment of preview){
    contains({x,y,width,height},segment.a);contains({x,y,width,height},segment.b);
    const markup=diagramAnnotationMarkup({id:'check',kind:'line',a:segment.a,b:segment.b,style:styles[segment.assignment],color:segment.visibility==='unknown'?'#809389':'#41634e',width:.7});
    assert.ok(svg.includes(markup),`missing CP projection ${JSON.stringify(segment)}`);
  }
  assert.ok(!svg.includes(diagramAnnotationMarkup(annotations[0])));
  assert.ok(svg.includes(diagramAnnotationMarkup(annotations[1])));
});

test('precrease instructions retain valley and mountain styles while inherited F routes export once as subdued existing creases',()=>{
  const {pose}=fixture();
  const current:DiagramLineAnnotation={id:'current-precrease',kind:'line',a:[0,20],b:[50,20],style:'valley',foldAction:'precrease',color:'#112233',width:1};
  const existing:DiagramLineAnnotation={...current,id:'cp-existing:old',a:[0,40],b:[50,40],style:'crease',foldAction:undefined,width:.45};delete existing.foldAction;
  const linkedFlat:DiagramLineAnnotation={...existing,id:'cp-link:flat'};
  const preview:DiagramFoldPreviewSegment[]=[
    {face:0,a:current.a,b:current.b,assignment:'F',style:'valley',visibility:'visible',existing:false},
    {face:0,a:existing.a,b:existing.b,assignment:'F',style:'crease',visibility:'visible',existing:true},
    {face:1,a:[0,60],b:[50,60],assignment:'F',style:'crease',visibility:'hidden',existing:true},
  ];
  const svg=drawingSVG(pose,[current,existing,linkedFlat],'预折后展开','',preview);
  const marks=(svg.match(/<line\b[^>]*\/>/g)??[]).filter(mark=>!mark.includes('data-diagram-top-boundary'));assert.equal(marks.length,2,'old buried crease is omitted; CP handles do not duplicate projected paint');
  const currentMarkup=diagramAnnotationMarkup(current);
  const oldMarkup=diagramAnnotationMarkup(existing);
  assert.ok(svg.includes(`<g opacity="1">${currentMarkup}</g>`));assert.ok(svg.includes(`<g opacity="0.55">${oldMarkup}</g>`));
  assert.doesNotMatch(svg,/<g opacity="0.16"><line [^>]+stroke="#8d9b92"/);
  assert.equal(marks.filter(mark=>mark===currentMarkup).length,1);assert.equal(marks.filter(mark=>mark===oldMarkup).length,1);
});

test('F face subdivisions have no solid model outline when the projected crease preview paints them',()=>{
  const sourceDoc=blankDoc('预折痕',100,100);sourceDoc.segments.push({id:'old-F',a:[0,40],b:[100,40],assignment:'F',angle:0});
  const pose:DiagramPose={sourceStateId:'cp-F',sourceRevision:0,sourceDoc,result:computeFlatFold(sourceDoc),view:defaultModelView()};
  assert.equal(pose.result.geometry.faces.length,2);
  const raw=diagramModelMarkup(pose),filtered=diagramModelMarkup(pose,undefined,true);assert.notEqual(filtered,raw);
  const outlines=[...filtered.matchAll(/<path d="([^"]*)" fill="none"/g)].map(match=>match[1]);assert.equal(outlines.length,2);
  const graph=pose.result.geometry.graph!,vertices=diagramPresentation(pose).vertices;
  graph.edges_vertices.forEach(([a,b],index)=>{if(graph.edges_assignment[index]!=='F')return;for(const outline of outlines){assert.ok(!outline.includes(`M ${vertices[a].join(' ')} L ${vertices[b].join(' ')}`));assert.ok(!outline.includes(`M ${vertices[b].join(' ')} L ${vertices[a].join(' ')}`));}});
  assert.equal(filtered.match(/fill-rule="evenodd"/g)?.length,2,'face fills retain the real material topology');
});

test('live pulled CP projection keeps precrease intent and follows inherited F geometry without modifying CP',()=>{
  const sourceDoc=blankDoc('预折扯角',100,100);sourceDoc.segments.push({id:'existing-F',a:[0,40],b:[100,40],assignment:'F',angle:0});
  const pose:DiagramPose={sourceStateId:'cp-F',sourceRevision:0,sourceDoc,result:computeFlatFold(sourceDoc),view:defaultModelView()};
  const after=structuredClone(sourceDoc),intent={id:'precrease-intent',a:[0,20] as Point,b:[100,20] as Point,assignment:'V' as const,angle:180};after.segments.push({...intent,id:'pending-F',assignment:'F',angle:0});
  const graph=buildFold(sourceDoc).graph,index=graph.vertices_coords.findIndex(point=>distance(point,[100,0])<1e-7),pulled={...pose,result:moveFoldedVertices(pose.result,{group:[index],selected:[index]},[125,-25])};
  const before=structuredClone({pose,after,intent}),flat=projectDiagramFoldCP(pose,sourceDoc,after,undefined,[intent]).preview,live=projectDiagramFoldCP(pulled,sourceDoc,after,undefined,[intent]).preview;
  assert.ok(live.some(segment=>segment.existing&&segment.style==='crease'));assert.ok(live.some(segment=>!segment.existing&&segment.assignment==='F'&&segment.style==='valley'));
  assert.notDeepEqual(live.map(segment=>[segment.a,segment.b]),flat.map(segment=>[segment.a,segment.b]));
  const exported=drawingSVG(pulled,[],'扯角姿态','',live);assert.match(exported,/stroke-dasharray=/);assert.match(exported,/<g opacity="0\.(?:55|32|16)"><line [^>]+stroke="#8d9b92"/);
  assert.deepEqual({pose,after,intent},before);
});

test('linked folds keep paper-exterior portions on the background and export them before paper',()=>{
  const sourceDoc=blankDoc('背景画线',100,100),pose:DiagramPose={sourceStateId:'before',sourceRevision:0,sourceDoc,result:computeFlatFold(sourceDoc)};
  const line:DiagramLineAnnotation={id:'through-paper',kind:'line',a:[-20,50],b:[120,50],style:'mountain',foldAction:'precrease',color:'#913b2c',width:1.4};
  const before=structuredClone({pose,line}),background=diagramFoldBackgroundLines(pose,[line]);
  assert.deepEqual(background.map(a=>[a.a,a.b]),[[[-20,50],[0,50]],[[100,50],[120,50]]]);
  for(const part of background){assert.equal(part.color,line.color);assert.equal(part.width,line.width);assert.equal(part.style,line.style);assert.equal(part.foldAction,'precrease');assert.deepEqual(part.foldFaces,[]);}
  assert.equal(new Set(background.map(a=>a.id)).size,2);
  const preview:DiagramFoldPreviewSegment[]=[{face:0,a:[0,50],b:[100,50],assignment:'F',style:'mountain',visibility:'visible',existing:false}];
  const svg=drawingSVG(pose,[line],'','',preview);
  for(const part of background)assert.ok(svg.indexOf(diagramAnnotationMarkup(part))<svg.indexOf('fill-rule="evenodd"'));
  assert.equal((svg.match(/<line\b[^>]*>/g)??[]).filter(mark=>!mark.includes('data-diagram-top-boundary')).length,3,'paper and background are separate, without painting the full instruction twice');
  const [x,y,width,height]=viewBox(svg);contains({x,y,width,height},line.a);contains({x,y,width,height},line.b);
  assert.deepEqual({pose,line},before);
});

test('entirely exterior linked lines survive an empty CP projection while CP routes and dormant marks are not duplicated',()=>{
  const {pose}=fixture(),line:DiagramLineAnnotation={id:'outside',kind:'line',a:[-100,-50],b:[-70,-50],style:'valley',color:'#abc123',width:2};
  const dormant={...line,id:'background-saved',foldFaces:[]},cp={...line,id:'cp-link:authoritative'};
  assert.equal(diagramFoldBackgroundLines(pose,[line,dormant,cp]).length,1);
  const svg=drawingSVG(pose,[line,dormant,cp],'','',[],[],true,undefined,[],undefined,{enabled:false});
  assert.equal((svg.match(/<line\b[^>]*>/g)??[]).filter(mark=>!mark.includes('data-diagram-top-boundary')).length,2);
  assert.ok(svg.includes(diagramAnnotationMarkup(line)));
  assert.deepEqual(diagramFoldBackgroundLines(null,[line])[0],line,'a drawing with no pose is fully on the background');
});

test('overlapping folded faces do not duplicate background fragments and real material holes stay drawable',()=>{
  const {pose}=fixture(),line:DiagramLineAnnotation={id:'stacked',kind:'line',a:[-20,50],b:[120,50],style:'valley',color:'#123456',width:1};
  const stacked=diagramFoldBackgroundLines(pose,[line]);assert.equal(stacked.length,2);
  assert.ok(distance(stacked[0].a,[-20,50])<1e-7&&distance(stacked[0].b,[0,50])<1e-7&&distance(stacked[1].a,[50,50])<1e-7&&distance(stacked[1].b,[120,50])<1e-7);
  const points:Point[]=[[0,0],[100,0],[100,100],[0,100],[40,40],[60,40],[60,60],[40,60]],edges:[number,number][]=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4]];
  const graph=materialCanonical(points,edges,edges.map(()=>'B'),edges.map(()=>0),[[0,1,2,3]],[[0,1,2,3]],[[[4,7,6,5]]],[[[7,6,5,4]]]),sourceDoc=materialDoc(graph,points),holePose:DiagramPose={sourceStateId:'hole',sourceRevision:0,sourceDoc,result:computeFlatFold(sourceDoc)};
  assert.deepEqual(diagramFoldBackgroundLines(holePose,[line]).map(a=>[a.a,a.b]),[[[-20,50],[0,50]],[[40,50],[60,50]],[[100,50],[120,50]]]);
});

test('visible and hidden coincident paper creases preserve each layer color and width after editing existing attributes',()=>{
  const base:DiagramLineAnnotation={id:'cp-existing:upper',kind:'line',a:[0,30],b:[50,30],style:'crease',color:'#a1253e',width:1.5,foldFaces:[1]};
  const lower={...base,id:'cp-existing:lower',color:'#1967b2',width:.6,foldFaces:[0]},background={...base,id:'bg:unrelated',color:'#00aa00',width:9,foldFaces:[]};
  const visible:DiagramFoldPreviewSegment={face:1,a:[10,30],b:[30,30],assignment:'F',style:'crease',visibility:'visible',existing:true};
  const hidden={...visible,face:0,visibility:'hidden' as const};
  assert.deepEqual(diagramFoldPreviewAttributes(visible,[background,lower,base],'#333333'),{color:'#a1253e',width:1.5,opacity:.55});
  assert.deepEqual(diagramFoldPreviewAttributes(hidden,[background,lower,base],'#333333'),{color:'#1967b2',width:.6,opacity:.16});
  const active={...base,id:'activated',style:'valley' as const},folded={...visible,assignment:'V' as const,style:'valley' as const,existing:false};
  assert.deepEqual(diagramFoldPreviewAttributes(folded,[base,active],'#333333'),{color:'#a1253e',width:1.5,opacity:1});
  const {pose}=fixture(),svg=drawingSVG(pose,[base,lower,background],'','',[visible,hidden]);
  assert.match(svg,/<g opacity="0\.55"><line [^>]+stroke="#a1253e"[^>]+stroke-width="1\.5"/);
  assert.doesNotMatch(svg,/<g opacity="0\.16"><line [^>]+stroke="#1967b2"/,'buried old creases must not paint over solid paper');
  assert.deepEqual(diagramFoldPreviewDrawingOrder([visible,hidden]),[visible]);
  assert.deepEqual(diagramFoldPreviewDrawingOrder([visible,hidden],{xray:true}),[hidden,visible]);
  const transparent=drawingSVG({...pose,view:{...defaultModelView(),xray:true}},[base,lower],'','',[visible,hidden]);
  assert.match(transparent,/<g opacity="0\.16"><line [^>]+stroke="#1967b2"/);
  assert.deepEqual(diagramFoldPreviewDrawingOrder([visible,hidden],{cutaway:true}),[hidden,visible]);
  assert.equal(diagramFoldPreviewDrawingOrder([{...hidden,unfolding:true}]).length,1,'an explicit unfolding instruction keeps its intended ink');
});

test('saved background fragments remain beneath paper after CP refresh, with or without linked preview',()=>{
  const sourceDoc=blankDoc('背景保留层',100,100),pose:DiagramPose={sourceStateId:'paper',sourceRevision:0,sourceDoc,result:computeFlatFold(sourceDoc)};
  const stored:DiagramLineAnnotation={id:'bg:saved:0',kind:'line',a:[10,20],b:[90,20],style:'mountain',color:'#742baa',width:1.2,foldFaces:[]};
  const source:DiagramLineAnnotation={...stored,id:'new-outside',a:[-30,50],b:[-10,50],foldFaces:undefined};delete source.foldFaces;
  assert.equal(isDiagramBackgroundLine(stored),true);assert.deepEqual(diagramFoldBackgroundLines(pose,[stored]),[],'the fragment extractor does not return persisted background again');
  assert.deepEqual(diagramBackgroundLinesForDrawing(pose,[stored],false),[stored]);
  assert.equal(diagramBackgroundLinesForDrawing(pose,[stored,source],true).length,2);
  for(const preview of [undefined,[]]){
    const svg=drawingSVG(pose,[stored],'','',preview),markup=diagramAnnotationMarkup(stored);
    assert.equal(svg.split(markup).length-1,1);assert.ok(svg.indexOf(markup)<svg.indexOf('fill-rule="evenodd"'));
  }
});
