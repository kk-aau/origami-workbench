import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Point} from '../../src/core/types';
import {computeFlatFold} from '../../src/core/flatFold';
import {blankDoc} from '../../src/app/state';
import type {DiagramPose} from '../../src/app/diagramProject';
import type {DiagramAnnotation,DiagramSymbolAnnotation,DiagramLineAnnotation} from '../../src/app/diagramAnnotations';
import {diagramAnnotationMarkup,annotationBounds} from '../../src/app/diagramAnnotationSVG';
import {diagramDrawingFrame,diagramPresentation,diagramModelMarkup,drawingSVG,diagramFoldBackgroundLines,diagramFoldPreviewAppearanceSegments,diagramFoldPreviewAttributes,diagramFoldPreviewDrawingOrder,diagramBackgroundLinesForDrawing,isDiagramBackgroundLine} from '../../src/app/diagramDrawing';
import {defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import {defaultModelView} from '../../src/app/modelViewState';
import {projectDiagramFoldCP} from '../../src/app/diagramFoldLink';
import type {DiagramFoldPreviewSegment} from '../../src/app/diagramFoldLinkTypes';
import {buildFold,distance} from '../../src/core/geometry';
import {moveFoldedVertices} from '../../src/app/foldedVertexEdit';
import {materialCanonical} from '../../src/core/materialFaceCommon';
import {materialDoc} from '../fixtures/materialModel';
import {svgElements,linesAt,type SvgElementNode} from '../helpers/svgElements';

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
test('opening strokes use the action pen and only carry explicit old-handle overrides on the same material interval',()=>{
  const palette=defaultDiagramLineDefaults();
  palette.valley={color:'#0011ff',width:.3,strokePattern:'dashed'};
  palette.mountain={color:'#ff0000',width:1.4,strokePattern:'dash-dot'};
  const opening:DiagramFoldPreviewSegment={face:4,a:[0,0],b:[100,0],assignment:'F',existing:true,unfolding:true,style:'valley',visibility:'visible'};
  const old:DiagramLineAnnotation={id:'cp-existing:open',kind:'line',a:[25,0],b:[75,0],style:'mountain',foldFaces:[4],
    color:palette.mountain.color,width:.9,strokePattern:'dotted',appearanceOverrides:['width','strokePattern']};
  const unrelated:DiagramLineAnnotation[]=[
    {...old,id:'cp-existing:neighbor',a:[5,0],foldFaces:[3],appearanceOverrides:['color']},
    {...old,id:'cp-existing:plain',b:[90,0],style:'crease',appearanceOverrides:['color']},
    {...old,id:'cp-existing:unbound',a:[5,0],style:'valley',foldFaces:undefined,appearanceOverrides:['color']},
  ];
  const annotations=[old,...unrelated];
  const parts=diagramFoldPreviewAppearanceSegments([opening],annotations);
  assert.deepEqual(parts.map(p=>[p.a[0],p.b[0]]),[[0,25],[25,75],[75,100]]);
  assert.deepEqual(parts.map(p=>diagramFoldPreviewAttributes(p,annotations,'#000000',palette)),[
    {...palette.valley,opacity:1},{color:palette.valley.color,width:.9,strokePattern:'dotted',opacity:1,appearanceOverrides:['width','strokePattern']},{...palette.valley,opacity:1},
  ]);
  const whitePaperCrease={...old,style:'valley' as const,color:'#8d9b92',width:.45,strokePattern:'solid' as const,appearanceOverrides:undefined};
  assert.deepEqual(diagramFoldPreviewAttributes(parts[1],[whitePaperCrease],'#000000',palette),{...palette.valley,opacity:1});
  assert.equal(diagramFoldPreviewAttributes(parts[1],[{...old,appearanceOverrides:['color'],color:'#65391a'}],'#000000',palette).color,'#65391a');
  const reversed={...opening,style:'mountain' as const};
  assert.deepEqual(diagramFoldPreviewAttributes(reversed,[],'#000000',palette),{...palette.mountain,opacity:1});
  const svg=drawingSVG(null,annotations,'','',[opening],[],true,palette);
  const strokes=svgElements(svg).filter(node=>node.tag==='line');
  assert.deepEqual(strokes.map(s=>s.attrs.stroke),[palette.valley.color,palette.valley.color,palette.valley.color]);
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

function assertSymbolArtwork(nodes:SvgElementNode[],symbol:DiagramSymbolAnnotation){
  // Compare the positioned component and its primitives at the export's actual pen scale.
  const root=nodes[0].attrs,[,,width,height]=root.viewBox.split(/\s+/).map(Number);
  const units=Math.max(width/Number(root.width),height/Number(root.height));
  const [reference,...primitives]=svgElements(diagramAnnotationMarkup(symbol,{units,enabled:true}));
  const groups=nodes.filter(node=>node.tag==='g'&&node.attrs.transform===reference.attrs.transform);
  assert.equal(groups.length,1,`one positioned ${symbol.symbol} symbol`);
  const group=groups[0];
  for(const key of ['color','stroke','fill','stroke-width'])assert.equal(group.attrs[key],reference.attrs[key]);
  const geometry=({tag,attrs,text}:SvgElementNode)=>({tag,attrs,text});
  assert.ok(primitives.length>0);
  assert.deepEqual(nodes.filter(node=>node.parent===group).map(geometry),primitives.map(geometry));
  return group;
}

function assertFixtureArtwork(nodes:SvgElementNode[],annotations:DiagramAnnotation[]){
  const [line,symbol]=annotations;
  assert.ok(line.kind==='line'&&symbol.kind==='symbol');
  const ink=linesAt(nodes,line.a,line.b);
  assert.equal(ink.length,1);
  assert.equal(ink[0].attrs.stroke,line.color);
  assert.ok(Number(ink[0].attrs['stroke-width'])>0);
  assert.ok(ink[0].attrs['stroke-dasharray'],'valley fold must be dashed');
  return {ink:ink[0],symbol:assertSymbolArtwork(nodes,symbol)};
}

test('real CP flat geometry exports its paper faces and the same editable line and symbol artwork',()=>{
  const {pose,annotations}=fixture(),before=structuredClone({pose,annotations});
  const svg=drawingSVG(pose,annotations,'谷折示意','把右侧纸角折向中线');
  assert.match(svg,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.ok(svg.endsWith('</svg>'));viewBox(svg);
  assert.equal(svg.match(/fill-rule="evenodd"/g)?.length,pose.result.geometry.faces.length);
  assert.match(svg,/<path d="M [^>]+ Z" fill="#[0-9a-fA-F]+"/);
  const nodes=svgElements(svg),{ink}=assertFixtureArtwork(nodes,annotations);
  const faces=nodes.filter(node=>node.attrs['fill-rule']==='evenodd');
  assert.ok(faces.every(face=>nodes.indexOf(face)<nodes.indexOf(ink)));
  assert.match(svg,/>谷折示意<\/text>/);assert.match(svg,/>把右侧纸角折向中线<\/text>/);
  assert.deepEqual({pose,annotations},before);
});

test('visible paper boundaries cover instruction ink while symbols remain on top',()=>{
  const {pose,annotations}=fixture(),line=annotations[0],symbol=annotations[1];
  const svg=drawingSVG(pose,[symbol,line],'','',undefined,[],true,undefined,[],undefined,{enabled:false});
  const nodes=svgElements(svg),art=assertFixtureArtwork(nodes,annotations);
  const boundaries=nodes.filter(node=>node.attrs['data-diagram-top-boundary']==='true');
  assert.ok(boundaries.length>0);
  assert.ok(boundaries.every(edge=>nodes.indexOf(art.ink)<nodes.indexOf(edge)&&nodes.indexOf(edge)<nodes.indexOf(art.symbol)));
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
  const nodes=svgElements(magnifier),reference=assertSymbolArtwork(nodes,zoom),circles=nodes.filter(node=>node.tag==='circle');
  assert.equal(circles.length,1);
  assert.equal(circles[0].parent,reference);
  assert.ok(Number(circles[0].attrs.r)>0);
  assert.doesNotMatch(magnifier,/vertex|handle|data-annotation-id|tabindex=/);
});

test('annotations can be exported without any folded pose, including a completely empty drawing',()=>{
  const {annotations}=fixture(),svg=drawingSVG(null,annotations,'自由绘图','先画步骤所需折线');
  assert.ok(svg.endsWith('</svg>'));viewBox(svg);
  assert.doesNotMatch(svg,/fill-rule="evenodd"/);
  assertFixtureArtwork(svgElements(svg),annotations);
  const [x,y,width,height]=viewBox(svg),bounds=annotationBounds(annotations)!;
  contains({x,y,width,height},[bounds.x,bounds.y]);contains({x,y,width,height},[bounds.x+bounds.width,bounds.y+bounds.height]);
  const empty=drawingSVG(null,[],'','');viewBox(empty);
  assert.match(empty,/<rect [^>]+ fill="white"\/>/);
  assert.doesNotMatch(empty,/<path\b|<line\b|<circle\b/);
});

test('original CAD components and independent source labels share the main paper export without editing grip graphics',()=>{
 const {pose,annotations}=fixture(),source:DiagramSymbolAnnotation={id:'cad',kind:'symbol',symbol:'fold',position:[20,30],size:35,rotation:23,color:'#222222',width:.5,cadProperties:{'距离1':40}},division:DiagramSymbolAnnotation={...source,id:'division',symbol:'equalDivision',position:[-80,40],cadProperties:{'距离1':14},cadAttributes:{'13648':'A & B','13650':'2'}};
 const svg=drawingSVG(pose,[...annotations,source,division],'原插件折图','');
 const nodes=svgElements(svg),fold=assertSymbolArtwork(nodes,source),divider=assertSymbolArtwork(nodes,division);
 assert.ok(nodes.some(node=>node.parent===fold&&node.tag==='path'&&node.attrs['data-source-handle']==='1644'));
 const labels=nodes.filter(node=>node.parent===divider&&node.tag==='text');
 assert.deepEqual(labels.map(node=>[node.attrs['data-cad-attribute'],node.text]),[['13648','A & B'],['13650','2']]);
 assert.equal(svg.match(/fill-rule="evenodd"/g)?.length,pose.result.geometry.faces.length);assert.doesNotMatch(svg,/data-(?:grip|editor-handle|annotation-id)|tabindex=/);viewBox(svg);
});

// Compare the rendered geometry and paint. Opposite paper layers can project
// onto the same endpoints; their opacity distinguishes their drawing roles.
function assertInk(nodes:SvgElementNode[],segment:{a:Point;b:Point},color:string,dashRatios:number[],opacity?:number){
  const matches=linesAt(nodes,segment.a,segment.b).filter(node=>
    node.attrs.stroke===color&&(opacity===undefined||Number(node.parent?.attrs.opacity)===opacity));
  assert.equal(matches.length,1,`expected one ${color} stroke from ${segment.a} to ${segment.b}`);
  const attrs=matches[0].attrs,width=Number(attrs['stroke-width']);
  assert.ok(width>0);
  const dash=attrs['stroke-dasharray']?.trim().split(/[ ,]+/).map(Number)??[];
  assert.equal(dash.length,dashRatios.length);
  for(let i=0;i<dash.length;i++){
    assert.ok(dash[i]>0&&Math.abs(dash[i]/dash[0]-dashRatios[i]/dashRatios[0])<1e-8);
  }
  return width;
}

test('legacy linked SVG keeps source pens and adapts projected ink with a saved disabled flag',()=>{
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
  const nodes=svgElements(svg);
  assertSymbolArtwork(nodes,annotations[1] as DiagramSymbolAnnotation);
  const sourceFold=annotations[0] as DiagramLineAnnotation;
  assert.equal(linesAt(nodes,source.a,source.b).length,0);
  assert.equal(linesAt(nodes,sourceFold.a,sourceFold.b).length,0);
  const valleyWidth=assertInk(nodes,preview[0],'#314b3c',[7,4],1);
  const scale=valleyWidth/.7;
  assert.ok(scale>0&&scale<1,'the authored pen adapts to the view');
  const widths=[
    [assertInk(nodes,preview[1],'#551122',[9,3,1,3],.24),2],
    [assertInk(nodes,preview[2],'#809389',[],.5),.7],
    [assertInk(nodes,preview[3],'#314b3c',[1,4],1),.7],
    [assertInk(nodes,auxiliary,auxiliary.color,[1,4]),auxiliary.width],
    [assertInk(nodes,crease,crease.color,[]),crease.width],
  ];
  for(const [shown,authored] of widths)assert.ok(Math.abs(shown-scale*authored)<1e-8);
  assert.doesNotMatch(svg,/data-diagram-fold-fixed|data-diagram-fold-selected|data-symbol-native-grip|tabindex=/);
  assert.deepEqual({pose,drawing,preview},before);viewBox(svg);
});

test('an omitted linked preview retains old drawings while an explicitly empty preview removes only fold lines',()=>{
  const {pose,annotations}=fixture(),plain=drawingSVG(pose,annotations,'',''),empty=drawingSVG(pose,annotations,'','',[]);
  const fold=annotations[0] as DiagramLineAnnotation,symbol=annotations[1] as DiagramSymbolAnnotation;
  const plainNodes=svgElements(plain),emptyNodes=svgElements(empty);
  assertInk(plainNodes,fold,fold.color,[7,4]);assertSymbolArtwork(plainNodes,symbol);
  assert.equal(linesAt(emptyNodes,fold.a,fold.b).length,0);assertSymbolArtwork(emptyNodes,symbol);
  assert.equal(plain,drawingSVG(pose,annotations,'','',undefined));viewBox(empty);
});

test('an explicitly unassigned fold mark remains visible in SVG when its CP layer range is empty',()=>{
  const {pose,annotations}=fixture(),unassigned={...annotations[0],foldFaces:[]} as DiagramLineAnnotation;
  const svg=drawingSVG(pose,[unassigned,annotations[1]],'','',[]);
  const nodes=svgElements(svg);
  assertInk(nodes,unassigned,unassigned.color,[7,4]);
  assertSymbolArtwork(nodes,annotations[1] as DiagramSymbolAnnotation);
});

test('legacy CP-derived routes keep their projected geometry, back-side ink and frame after rotation',()=>{
  const {pose,annotations}=fixture();pose.view={...defaultModelView(),side:'back',rotation:37};
  const before=pose.sourceDoc,after=structuredClone(before);
  after.segments.push({id:'second-fold',a:[0,50],b:[100,50],assignment:'V',angle:180});
  const {preview}=projectDiagramFoldCP(pose,before,after);
  assert.ok(preview.length>0);assert.ok(preview.some(segment=>Math.abs(segment.a[1]-segment.b[1])>1));
  const svg=drawingSVG(pose,annotations,'CP 自动映射','',preview,[],true,undefined,[],undefined,{enabled:false}),[x,y,width,height]=viewBox(svg);
  const nodes=svgElements(svg),patterns={M:[9,3,1,3],V:[7,4],F:[],U:[1,4]};
  assert.deepEqual(preview.map(s=>[s.assignment,s.visibility]).sort(),[['M','hidden'],['V','visible']]);
  for(const segment of preview){
    contains({x,y,width,height},segment.a);contains({x,y,width,height},segment.b);
    assertInk(nodes,segment,'#41634e',patterns[segment.assignment],segment.visibility==='hidden'?.24:1);
  }
  const source=annotations[0] as DiagramLineAnnotation;
  assert.equal(linesAt(nodes,source.a,source.b).length,0);
  assertSymbolArtwork(nodes,annotations[1] as DiagramSymbolAnnotation);
});

test('precrease instructions retain valley and mountain styles while inherited F routes export once as subdued existing creases',()=>{
  const {pose}=fixture();
  const current:DiagramLineAnnotation={id:'current-precrease',kind:'line',a:[0,20],b:[50,20],style:'valley',foldAction:'precrease',color:'#112233',width:1};
  const mountain:DiagramLineAnnotation={...current,id:'mountain-precrease',a:[0,30],b:[50,30],style:'mountain'};
  const existing:DiagramLineAnnotation={...current,id:'cp-existing:old',a:[0,40],b:[50,40],style:'crease',foldAction:undefined,width:.45};delete existing.foldAction;
  const linkedFlat:DiagramLineAnnotation={...existing,id:'cp-link:flat'};
  const preview:DiagramFoldPreviewSegment[]=[
    {face:0,a:current.a,b:current.b,assignment:'F',style:'valley',visibility:'visible',existing:false},
    {face:0,a:mountain.a,b:mountain.b,assignment:'F',style:'mountain',visibility:'visible',existing:false},
    {face:0,a:existing.a,b:existing.b,assignment:'F',style:'crease',visibility:'visible',existing:true},
    {face:1,a:[0,60],b:[50,60],assignment:'F',style:'crease',visibility:'hidden',existing:true},
  ];
  const svg=drawingSVG(pose,[current,mountain,existing,linkedFlat],'预折后展开','',preview);
  const nodes=svgElements(svg),marks=nodes.filter(n=>n.tag==='line'&&!n.attrs['data-diagram-top-boundary']);
  assert.equal(marks.length,3,'only the two new precreases and the visible old crease are painted');
  const valleyWidth=assertInk(marks,current,current.color,[7,4],1);
  assert.equal(assertInk(marks,mountain,mountain.color,[9,3,1,3],1),valleyWidth);
  const oldWidth=assertInk(marks,existing,existing.color,[],.55);
  assert.ok(Math.abs(oldWidth/valleyWidth-existing.width/current.width)<1e-8);
  assert.equal(linesAt(marks,preview[3].a,preview[3].b).length,0);
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
  const nodes=svgElements(svg),paper=nodes.findIndex(node=>node.tag==='path'&&node.attrs['fill-rule']==='evenodd');
  assert.ok(paper>=0);
  for(const fragment of background){
    const painted=linesAt(nodes,fragment.a,fragment.b);
    assert.equal(painted.length,1);
    assert.equal(painted[0].attrs.stroke,fragment.color);
    assert.ok(nodes.indexOf(painted[0])<paper,'each exterior fragment is painted beneath the paper');
  }
  const onPaper=linesAt(nodes,preview[0].a,preview[0].b);
  assert.equal(onPaper.length,1);
  assert.ok(nodes.indexOf(onPaper[0])>paper);
  assert.equal(nodes.filter(mark=>mark.tag==='line'&&!mark.attrs['data-diagram-top-boundary']).length,3,'paper and background are separate, without painting the full instruction twice');
  const [x,y,width,height]=viewBox(svg);contains({x,y,width,height},line.a);contains({x,y,width,height},line.b);
  assert.deepEqual({pose,line},before);
});

test('entirely exterior linked lines survive an empty CP projection while CP routes and dormant marks are not duplicated',()=>{
  const {pose}=fixture(),line:DiagramLineAnnotation={id:'outside',kind:'line',a:[-100,-50],b:[-70,-50],style:'valley',color:'#abc123',width:2};
  const dormant={...line,id:'background-saved',color:'#451a81',foldFaces:[]},cp={...line,id:'cp-link:authoritative',color:'#308265'};
  assert.equal(diagramFoldBackgroundLines(pose,[line,dormant,cp]).length,1);
  const svg=drawingSVG(pose,[line,dormant,cp],'','',[],[],true,undefined,[],undefined,{enabled:false});
  const nodes=svgElements(svg),painted=linesAt(nodes,line.a,line.b);
  assert.deepEqual(painted.map(mark=>mark.attrs.stroke),[line.color,dormant.color]);
  assert.equal(nodes.filter(mark=>mark.tag==='line'&&!mark.attrs['data-diagram-top-boundary']).length,2);
  assert.ok(painted.every(mark=>mark.attrs['stroke-dasharray']),'both authored valley strokes retain their dash style');
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
  function assertLayerStrokes(markup:string,layers:{line:DiagramLineAnnotation;opacity:number}[]){
    const strokes=linesAt(svgElements(markup),visible.a,visible.b);
    assert.deepEqual(strokes.map(stroke=>stroke.attrs.stroke),layers.map(layer=>layer.line.color));
    const [, ,width,height]=viewBox(markup),units=Math.max(width/1200,height/900);
    assert.ok(units<.4,'the fixture is enlarged enough for the adaptive maximum to apply');
    strokes.forEach((stroke,i)=>{
      // At this scale the common paper pen displays 2.5 pixels per authored width unit.
      const expectedPixels=layers[i].line.width*2.5;
      assert.ok(Math.abs(Number(stroke.attrs['stroke-width'])/units-expectedPixels)<1e-7);
      let opacity=1;
      for(let node:SvgElementNode|undefined=stroke;node;node=node.parent)opacity*=Number(node.attrs.opacity??1);
      assert.equal(opacity,layers[i].opacity);
    });
  }
  assertLayerStrokes(svg,[{line:base,opacity:.55}]);
  assert.deepEqual(diagramFoldPreviewDrawingOrder([visible,hidden]),[visible]);
  assert.deepEqual(diagramFoldPreviewDrawingOrder([visible,hidden],{xray:true}),[hidden,visible]);
  const transparent=drawingSVG({...pose,view:{...defaultModelView(),xray:true}},[base,lower],'','',[visible,hidden]);
  assertLayerStrokes(transparent,[{line:lower,opacity:.16},{line:base,opacity:.55}]);
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
    const nodes=svgElements(drawingSVG(pose,[stored],'','',preview));
    const fragments=linesAt(nodes,stored.a,stored.b);
    assert.equal(fragments.length,1);
    assert.equal(fragments[0].attrs.stroke,stored.color);
    assert.ok(fragments[0].attrs['stroke-dasharray']);
    const paper=nodes.findIndex(node=>node.tag==='path'&&node.attrs['fill-rule']==='evenodd');
    assert.ok(nodes.indexOf(fragments[0])<paper,'stored background fragment must be painted before the first paper face');
  }
});
