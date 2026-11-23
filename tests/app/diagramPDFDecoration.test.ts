import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc} from '../../src/app/state';
import {appendDiagramStep,createDiagramProject,exportDiagramProject,importDiagramProject} from '../../src/app/diagramProject';
import {defaultDiagramPDFOptions,planDiagramPDF} from '../../src/app/diagramPDFLayout';
import {diagramPDFPageSVG} from '../../src/app/diagramPDFPage';
import {defaultDiagramLineDefaults} from '../../src/app/diagramLineStyles';
import type {Point} from '../../src/core/types';
import {defaultDiagramPDFPaint,defaultDiagramPDFRibbon,diagramPDFRibbonArrowPath,diagramPDFRibbonKey,diagramPDFRibbonNodes,diagramPDFRibbonPath,diagramPDFRibbonTracks} from '../../src/app/diagramPDFDecoration';
import {diagramPDFBranchContinuationPaths,diagramPDFRibbonAnchor,diagramPDFRibbonSeamNeighbors} from '../../src/app/diagramPDFBranchContinuation';
import {diagramPDFSeamKey} from '../../src/app/diagramPDFSeams';
import {setDiagramPDFRibbonSegmentColor} from '../../src/app/diagramPDFBranchColors';
function fixture(){
  let project=createDiagramProject(blankDoc('配色',100,100));
  for(let i=1;i<14;i++)project=appendDiagramStep(project);
  const options={...defaultDiagramPDFOptions(project),readingOrder:'snake' as const,ribbon:defaultDiagramPDFRibbon()};
  return {project,options};
}
test('a cross-page ribbon stays inside its gutter at the end of a long straight run',()=>{
  const route:[number,number][]=[[0,.8],[.03,.8],[.035,.795],[.035,.21],[.04,.20],[.25,.20]];
  const plan={width:500,height:800};
  const path=diagramPDFRibbonPath(route,plan,true);
  const segments=path.split(' C ').slice(1);
  assert.equal(segments.length,route.length-1);
  segments.forEach((segment,i)=>{
    const values=segment.split(' ').map(Number);
    for(const axis of [0,1] as const){
      const extent=axis===0?plan.width:plan.height;
      const from=route[i][axis]*extent,to=route[i+1][axis]*extent;
      for(const control of [values[axis],values[axis+2]]){
        assert.ok(control>=Math.min(from,to)&&control<=Math.max(from,to),'a control point escaped its turn');
      }
    }
  });
});
test('a 3 by 3 chapter keeps its original row-turn curves when the page seam is set to 33%',()=>{
  const {project,options}=fixture();
  const configured={...options,cover:'diagram' as const,introLayout:'3x3' as const,layout:'3x3' as const};
  const plan=planDiagramPDF(project,configured),page=plan.pages[0],seam=page.linearSeams!.outgoing!;
  const edited={...configured,ribbonSeamHeights:{[seam.key]:.33}};
  const curves=(settings:typeof configured)=>{
    const track=diagramPDFRibbonTracks(settings,plan,page)[0];
    return diagramPDFRibbonPath(track.nodes,plan,track.bounded).split(' C ').slice(1);
  };
  const original=curves(configured),adjusted=curves(edited);
  assert.deepEqual(adjusted.slice(0,7),original.slice(0,7));
  const x=diagramPDFRibbonAnchor(page.cells[2])[0];
  assert.ok(Number(adjusted[2].split(' ')[0])>x,'the right-hand turn retains its outer bow');
  const track=diagramPDFRibbonTracks(edited,plan,page)[0];
  const authored={...edited,ribbon:{...edited.ribbon,paths:{[track.key]:track.nodes}}};
  assert.deepEqual(diagramPDFRibbonNodes(authored,plan,page),track.nodes,'saving an edit must not insert extra bends');
  assert.deepEqual(curves(authored),adjusted,'the visible inlet and outlet keep their shape after saving the path');
});
test('a manually placed inlet curves across the available space and meets the preceding outlet horizontally',()=>{
  const paper={x:0,y:0,width:600,height:800};
  const source={x:398,y:100,width:160,height:160},target={...source,x:36,y:80};
  const {incoming,outgoing,slopes}=diagramPDFBranchContinuationPaths(
    {cell:source,cells:[source],paper,gap:12},{cell:target,cells:[target],paper,gap:12},(source.y+source.height*.4)/paper.height);
  const tip=incoming[0],end=incoming.at(-1)!;
  assert.equal(tip[1],outgoing.at(-1)![1]);
  const nodes=incoming.map(([x,y]):Point=>[x/paper.width,y/paper.height]);
  const route=diagramPDFRibbonPath(nodes,paper,true,diagramPDFRibbonSeamNeighbors(nodes,'incoming',slopes?.incoming,paper));
  const turns=route.split(' C ').slice(1).map(s=>s.split(' ').map(Number));
  assert.equal(turns[0][1],tip[1]);
  const mid=turns[0],last=turns.at(-1)!;
  assert.ok(Math.abs(mid[4]-end[0]/2)<1e-8,'the turn uses the free space up to the model');
  assert.ok(Math.abs((mid[5]-tip[1])/(end[1]-tip[1])-.25)<1e-8,'the inlet gains height gently through the first half');
  assert.equal(last[5],end[1]);
});
test('snake ribbon is behind its steps, follows snake order and never emits editor handles',()=>{
  const {project,options}=fixture(),plan=planDiagramPDF(project,options),page=plan.pages[0];
  const nodes=diagramPDFRibbonNodes(options,plan,page);
  const anchors=page.cells.map(c=>{const [x,y]=diagramPDFRibbonAnchor(c);return [x/plan.width,y/plan.height];});
  assert.deepEqual(nodes.slice(0,anchors.length),anchors);assert.equal(nodes.at(-1)![0],1);assert.ok(nodes[0][0]<nodes[1][0]&&nodes[3][0]>nodes[4][0]);
  const svg=diagramPDFPageSVG(project,options,plan,0,defaultDiagramLineDefaults(),true);
  assert.ok(svg.indexOf('data-pdf-ribbon')<svg.indexOf('data-pdf-step='));
  assert.doesNotMatch(svg,/data-ribbon-editor|data-ribbon-node|data-pdf-reading-guide/);
  assert.match(svg,/data-pdf-page-background="true"/);
  assert.equal((svg.match(/<rect[^>]*fill="white"/g)??[]).length,0,'generated white panel canvases do not cover the colour scheme');
  assert.match(diagramPDFRibbonPath(nodes,plan),/^M .* C /);
});
test('a linear page turn shares one sloped SVG tangent across the spread, including after editing and reloading',()=>{
  const {project,options}=fixture(),plan=planDiagramPDF(project,options),[left,right]=plan.pages;
  const [outlet,inlet]=[left,right].map(page=>diagramPDFRibbonTracks(options,plan,page)[0]);
  const cubic=(track:typeof outlet)=>diagramPDFRibbonPath(track.nodes,plan,track.bounded,track.neighbors).split(' C ');
  const end=cubic(outlet).at(-1)!.split(' ').map(Number),start=cubic(inlet)[1].split(' ').map(Number);
  const y=inlet.nodes[0][1]*plan.height,dx=end[4]-end[2],dy=end[5]-end[3];
  assert.ok(Math.abs(y-end[5])<1e-8);
  assert.ok(Math.abs(dy)>1e-4);
  assert.ok(Math.abs(dy/dx-(start[1]-y)/start[0])<1e-8);
  const edit=outlet.nodes.map((p,i)=>i===1?[p[0],p[1]+.01] as Point:p);
  const configured={...options,ribbon:{...options.ribbon,paths:{[outlet.key]:edit,[inlet.key]:inlet.nodes}}};
  const saved=importDiagramProject(exportDiagramProject({...project,exportSettings:{pdf:configured}}));
  const restored={...options,...saved.exportSettings!.pdf},next=planDiagramPDF(saved,restored);
  for(const [index,expected] of [outlet,inlet].entries()){
    const track=diagramPDFRibbonTracks(restored,next,next.pages[index])[0];
    assert.deepEqual(track.nodes,index?expected.nodes:edit);
    assert.deepEqual(track.neighbors,expected.neighbors);
    assert.equal(index?cubic(track)[1]:cubic(track).at(-1),index?cubic(expected)[1]:cubic(expected).at(-1));
  }
});
test('a linked linear seam between its artwork heights keeps the chosen height and continues in the same direction',()=>{
  const {project,options}=fixture(),plan=planDiagramPDF(project,options),[left,right]=plan.pages;
  const sourceY=diagramPDFRibbonAnchor(left.cells.at(-1)!)[1],targetY=diagramPDFRibbonAnchor(right.cells[0])[1];
  const chosen=(sourceY*.4+targetY*.6)/plan.height;
  const edited={...options,ribbonSeamHeights:{[left.linearSeams!.outgoing!.key]:chosen}};
  const outlet=diagramPDFRibbonTracks(edited,plan,left)[0],inlet=diagramPDFRibbonTracks(edited,plan,right)[0];
  const slope=([x,y]:Point,[nextX,nextY]:Point)=>(nextY-y)/(nextX-x);
  assert.ok(Math.abs(outlet.nodes.at(-1)![1]-chosen)<1e-10&&Math.abs(inlet.nodes[0][1]-chosen)<1e-10);
  const leftSlope=slope(outlet.nodes.at(-1)!,outlet.neighbors!.after!),rightSlope=slope(inlet.neighbors!.before!,inlet.nodes[0]);
  assert.ok(leftSlope*(targetY-sourceY)>0);
  assert.ok(Math.abs(leftSlope-rightSlope)<1e-8);
  assert.ok(outlet.neighbors?.after&&inlet.neighbors?.before);
});
test('edited nodes belong to one exact page grid and survive options roundtrip',()=>{
  const {project,options}=fixture(),plan=planDiagramPDF(project,options);
  const key=diagramPDFRibbonKey(plan,plan.pages[0]),other=diagramPDFRibbonNodes(options,plan,plan.pages[1]);
  const edited={...options,ribbon:{...options.ribbon,paths:{[key]:[[.1,.2],[.5,.6],[.8,.9]] as [number,number][]}}};
  assert.deepEqual(diagramPDFRibbonNodes(edited,plan,plan.pages[0]),[[.1,.2],[.5,.6],[.8,.9],[1,.9]]);
  const continued=diagramPDFRibbonNodes(edited,plan,plan.pages[1]);
  assert.deepEqual(continued[0],[0,.9]);
  assert.equal(continued[1][1],.9,'the horizontal run follows the edited preceding exit');
  const count=plan.pages[1].cells.length;
  assert.deepEqual(continued.slice(-count),other.slice(-count));
  const restored=JSON.parse(JSON.stringify(edited));assert.deepEqual(diagramPDFRibbonNodes(restored,plan,plan.pages[0]).slice(0,-1),edited.ribbon.paths[key]);
  const newPlan=planDiagramPDF(project,{...edited,introLayout:'2x3'});
  assert.notEqual(diagramPDFRibbonKey(newPlan,newPlan.pages[0]),key);
  const changedPage=newPlan.pages[0],changedNodes=diagramPDFRibbonNodes(edited,newPlan,changedPage);
  assert.deepEqual(changedNodes.slice(0,changedPage.cells.length),changedPage.cells.map(c=>{
    const [x,y]=diagramPDFRibbonAnchor(c);return [x/newPlan.width,y/newPlan.height];
  }));
});
test('old edge nodes are removed only at the two ends of the exported range',()=>{
  const {project,options}=fixture();
  const ranged={...options,cover:'standard' as const,scope:'range' as const,rangeStart:3,rangeEnd:7,layout:'2x2' as const};
  const plan=planDiagramPDF(project,ranged),[first,last]=plan.pages.filter(p=>p.cells.length);
  const paths:Record<string,[number,number][]>={
    [diagramPDFRibbonKey(plan,first)]:[[0,.3],[.2,.3],[.6,.8],[1,.8]],
    [diagramPDFRibbonKey(plan,last)]:[[0,.6],[.4,.5],[1,.5]],
  };
  const edited={...ranged,ribbon:{...options.ribbon,paths}};
  assert.deepEqual(diagramPDFRibbonNodes(edited,plan,first),[[.2,.3],[.6,.8],[1,.8]]);
  assert.deepEqual(diagramPDFRibbonNodes(edited,plan,last),[[0,.8],[.4,.5]]);
  const single={...edited,rangeStart:7},one=planDiagramPDF(project,single);
  const i=one.pages.findIndex(p=>p.cells.length);
  assert.doesNotMatch(diagramPDFPageSVG(project,single,one,i,defaultDiagramLineDefaults(),true),/data-pdf-ribbon=/);
});
test('multi-stop linear and radial backgrounds reach SVG as vector gradients',()=>{
  const {project,options}=fixture(),paint={...defaultDiagramPDFPaint(),kind:'linear' as const,angle:90,stops:[{id:'a',offset:0,color:'#fff3e9',opacity:1},{id:'b',offset:35,color:'#ecb2a3',opacity:.4},{id:'c',offset:100,color:'#f2dce4',opacity:1}]};
  for(const kind of ['linear','radial'] as const){
    const configured={...options,pageBackground:{...paint,kind},ribbon:{...options.ribbon,paint:{...paint,kind}},pageTextColor:'#293d35'};
    const plan=planDiagramPDF(project,configured),svg=diagramPDFPageSVG(project,configured,plan,0,defaultDiagramLineDefaults(),true);
    assert.match(svg,new RegExp('<'+(kind==='linear'?'linearGradient':'radialGradient')));
    assert.match(svg,/offset="35%" stop-color="#ecb2a3" stop-opacity="0.4"/);
    assert.doesNotMatch(svg,/<image/);
  }
});

test('horizontal and vertical single-route ribbons retain a visible gradient when a segment colour is applied or cleared',()=>{
  const {project,options}=fixture();
  for(const direction of ['horizontal','vertical'] as const)for(const kind of ['linear','radial'] as const){
    const ribbon={...options.ribbon,paint:{...options.ribbon.paint,kind}};
    const pdf={...options,ribbon,cover:'none' as const,layout:'3x3' as const,scope:'range' as const,rangeStart:1,rangeEnd:3,snakeDirection:direction};
    const plan=planDiagramPDF(project,pdf),cells=plan.pages[0].cells,xy=cells.map(diagramPDFRibbonAnchor);
    const key=diagramPDFSeamKey(cells[0].ribbonNodeId!,cells[1].ribbonNodeId!);
    const override=setDiagramPDFRibbonSegmentColor(ribbon,key,'#dc1177');
    for(const current of [ribbon,override,setDiagramPDFRibbonSegmentColor(override,key)]){
      const svg=diagramPDFPageSVG(project,{...pdf,ribbon:current},plan,0,defaultDiagramLineDefaults(),true);
      const gradients=[...svg.matchAll(new RegExp('<'+kind+'Gradient\\b[^>]*id="pdf-ribbon-paint-0-[^"]+"[^>]*>','g'))];
      assert.ok(gradients.length,'gradient remains visible alongside the overridden segment');
      for(const [gradient] of gradients){
        assert.match(gradient,/gradientUnits="userSpaceOnUse"/);
        const [ux,uy,vx,vy]=gradient.match(/gradientTransform="matrix\(([^)]+)\)"/)![1].split(' ').map(Number);
        assert.ok(Math.hypot(ux,uy)>0,'along-path extent is nonzero');
        assert.ok(Math.abs(Math.hypot(vx,vy)-ribbon.widthMm*72/25.4)<1e-5,'transverse extent is ribbon width');
        assert.ok(Math.abs(ux*vx+uy*vy)<1e-3,'unrolled axes stay perpendicular');
        if(direction==='vertical')assert.ok(Math.abs(uy)>Math.abs(ux),'vertical path rotates its paint frame');
      }
      assert.match(svg,/data-pdf-ribbon="true"[^>]*stroke="url\(#pdf-ribbon-paint-0-/);
      assert.equal(svg.includes('stroke="#dc1177"'),'segmentColors' in current);
    }
    const curved={...pdf,rangeEnd:5},curvedPlan=planDiagramPDF(project,curved);
    const curvedSVG=diagramPDFPageSVG(project,curved,curvedPlan,0,defaultDiagramLineDefaults(),true);
    const transforms=[...curvedSVG.matchAll(/gradientTransform="matrix\(([^)]+)\)"/g)].map(match=>match[1].split(' ').map(Number));
    assert.ok(transforms.some(([ux,uy])=>Math.abs(ux)>1&&Math.abs(uy)>1),'curves use changing tangent frames instead of one page gradient');

  }
});

function pageArrows(svg:string,verticesPerArrow=6):Point[][] {
  const d=svg.match(/<path\b[^>]*\bdata-pdf-ribbon-arrows="true"[^>]*\bd="([^"]*)"/)?.[1];
  assert.ok(d,'the page contains the ribbon arrow path');
  return arrowPolygons(d,verticesPerArrow);
}

function arrowPolygons(d:string,verticesPerArrow=6):Point[][] {
  return (d.match(/M [^Z]+Z/g)??[]).map(shape=>{
    const points=Array.from(shape.matchAll(/[ML] ([-.\d]+) ([-.\d]+)/g),m=>[Number(m[1]),Number(m[2])] as Point);
    assert.equal(points.length,verticesPerArrow,'each closed arrow has the expected contour');
    return points;
  });
}

test('double chevrons point to the next step on outbound, turning and return segments in both snake directions',()=>{
  const {project,options}=fixture();
  for(const snakeDirection of ['horizontal','vertical'] as const){
    const configured={...options,cover:'none' as const,scope:'range' as const,rangeEnd:6,layout:snakeDirection==='horizontal'?'3x2' as const:'2x3' as const,snakeDirection};
    const plan=planDiagramPDF(project,configured),page=plan.pages[0],nodes=diagramPDFRibbonNodes(configured,plan,page);
    const svg=diagramPDFPageSVG(project,configured,plan,0,defaultDiagramLineDefaults(),true);
    const arrows=pageArrows(svg);
    assert.equal(arrows.length,10);
    const directions:Point[]=snakeDirection==='horizontal'?[[1,0],[1,0],[0,1],[-1,0],[-1,0]]:[[0,1],[0,1],[1,0],[0,-1],[0,-1]];
    for(const [i,[x,y]] of directions.entries()){
      const pair=arrows.slice(2*i,2*i+2),start=nodes[i],end=nodes[i+1];
      for(const vertices of pair){
        const tip=vertices[2],notch=vertices[5],dx=tip[0]-notch[0],dy=tip[1]-notch[1];
        assert.ok(dx*x+dy*y>.8*Math.hypot(dx,dy),'both arrow tips point along the reading direction');
        assert.ok(vertices.every(([px,py])=>(px-start[0]*plan.width)*x+(py-start[1]*plan.height)*y>0 &&
          (end[0]*plan.width-px)*x+(end[1]*plan.height-py)*y>0),'the entire pair lies between consecutive step anchors');
      }
      const [first,second]=pair.map(shape=>shape[2]);
      assert.ok((second[0]-first[0])*x+(second[1]-first[1])*y>1,'the two heads are spaced along the ribbon');
    }
  }
});

test('manually curved ribbon places both chevrons on the bend and follows its local tangent',()=>{
  const {project,options}=fixture();
  const configured={...options,cover:'none' as const,scope:'range' as const,rangeEnd:4};
  const plan=planDiagramPDF(project,configured),page=plan.pages[0],key=diagramPDFRibbonKey(plan,page);
  const nodes:Point[]=[[.13,.17],[.30,.70],[.63,.70],[.79,.86]];
  const edited={...configured,ribbon:{...options.ribbon,paths:{[key]:nodes}}};
  const svg=diagramPDFPageSVG(project,edited,plan,0,defaultDiagramLineDefaults(),true);
  const arrows=pageArrows(svg);
  assert.equal(arrows.length,6);
  // The middle segment has level endpoints, but its cubic bows downward then turns up and right.
  for(const shape of arrows.slice(2,4)){
    const [tip,notch]=[shape[2],shape[5]];
    assert.ok(tip[1]>nodes[1][1]*plan.height+2,'the arrow lies on the curved band below the straight chord');
    assert.ok(tip[0]>notch[0] && tip[1]-notch[1]<-.1*(tip[0]-notch[0]),'the arrow follows the upward-right tangent');
  }
  assert.equal(diagramPDFRibbonArrowPath([nodes[1],nodes[1]],plan,8),'');
});

test('a vertical arrow pair moves along its ribbon to clear an overlapping caption',()=>{
  const plan={width:200,height:300},nodes:Point[]=[[.5,.15],[.5,.85]];
  const caption={x:70,y:135,width:60,height:30};
  const original=arrowPolygons(diagramPDFRibbonArrowPath(nodes,plan,8));
  assert.ok(original.flat().some(([,y])=>y>caption.y&&y<caption.y+caption.height));
  const shifted=arrowPolygons(diagramPDFRibbonArrowPath(nodes,plan,8,[caption]));
  assert.equal(shifted.length,2);
  const allY=shifted.flat().map(([,y])=>y);
  assert.ok(Math.max(...allY)<caption.y||Math.min(...allY)>caption.y+caption.height,'both heads clear the caption together');
  for(const shape of shifted){
    const [tip,notch]=[shape[2],shape[5]];
    assert.equal(tip[0],100);assert.equal(notch[0],100);
    assert.ok(tip[1]>notch[1]&&notch[1]>45&&tip[1]<255,'the pair still follows the ribbon toward the second step');
  }
});

test('arrow settings from before style selection retain the original double-chevron geometry',()=>{
  const plan={width:100,height:100},nodes:Point[]=[[.2,.5],[.8,.5]],widthMm=10*25.4/72;
  const expected=[
    [[44.2,45.7],[46.6,45.7],[50.5,50],[46.6,54.3],[44.2,54.3],[48.1,50]],
    [[49,45.7],[51.4,45.7],[55.3,50],[51.4,54.3],[49,54.3],[52.9,50]],
  ];
  for(const appearance of [undefined,defaultDiagramPDFRibbon(),{arrowStyle:'double' as const,arrowThicknessPercent:100}]){
    const d=diagramPDFRibbonArrowPath(nodes,plan,widthMm,[],appearance);
    assert.deepEqual(arrowPolygons(d),expected);
  }
});

test('solid arrows span the ribbon and only their forward height changes with thickness',()=>{
  const plan={width:200,height:200},widthMm=8,bandWidth=widthMm*72/25.4;
  for(const [x,y] of [[1,0],[0,1],[-1,0],[0,-1]]){
    const nodes:Point[]=[[.5-.3*x,.5-.3*y],[.5+.3*x,.5+.3*y]];
    for(const arrowThicknessPercent of [50,100,150]){
      const d=diagramPDFRibbonArrowPath(nodes,plan,widthMm,[],{arrowStyle:'solid',arrowThicknessPercent});
      const triangles=arrowPolygons(d,3);
      assert.equal(triangles.length,1);
      const projected=triangles[0].map(([px,py])=>({forward:px*x+py*y,side:-px*y+py*x})).sort((a,b)=>b.forward-a.forward);
      const [tip,baseA,baseB]=projected;
      const height=tip.forward-baseA.forward;
      assert.ok(Math.abs(height-bandWidth*.95*arrowThicknessPercent/100)<.002,'the height increases in the reading direction');
      assert.equal(baseA.forward,baseB.forward,'the flat base faces backward');
      assert.ok(Math.abs(Math.abs(baseA.side-baseB.side)-bandWidth)<.002,'the base spans the full band');
      assert.ok(Math.abs(tip.side-(baseA.side+baseB.side)/2)<.01,'the tip follows the ribbon centreline');
    }
  }
});

test('solid arrow bases keep the full band width on short spans and around a turn',()=>{
  const plan={width:200,height:200},widthMm=10,bandWidth=widthMm*72/25.4;
  // The first anchors are only 12 pt apart on a band more than 28 pt wide.
  const nodes:Point[]=[[.2,.5],[.26,.5],[.45,.8],[.8,.8]];
  let previousHeights:number[]=[];
  for(const arrowThicknessPercent of [50,100,150]){
    const triangles=arrowPolygons(diagramPDFRibbonArrowPath(nodes,plan,widthMm,[],{arrowStyle:'solid',arrowThicknessPercent}),3);
    assert.equal(triangles.length,nodes.length-1);
    const heights=triangles.map(([a,tip,b],index)=>{
      const baseWidth=Math.hypot(a[0]-b[0],a[1]-b[1]);
      assert.ok(Math.abs(baseWidth-bandWidth)<.002,'slanted bases also reach both sides of the band');
      const height=2*polygonArea([a,tip,b])/baseWidth;
      assert.ok(height>(previousHeights[index]??0));
      return height;
    });
    previousHeights=heights;
  }
});

function polygonArea(points:Point[]){
  const twiceArea=points.reduce((sum,[x,y],i)=>{
    const [nextX,nextY]=points[(i+1)%points.length];
    return sum+x*nextY-y*nextX;
  },0);
  return Math.abs(twiceArea)/2;
}

test('increasing arrow thickness increases visible vector area in both styles and leaves the band width and path intact',()=>{
  const {project,options}=fixture();
  let referenceBand:string|undefined;
  for(const arrowStyle of ['double','solid'] as const){
    const inkAreas=[];
    for(const arrowThicknessPercent of [50,100,150]){
      const configured={...options,cover:'none' as const,scope:'range' as const,rangeEnd:6,layout:'3x2' as const,
        ribbon:{...options.ribbon,arrowStyle,arrowThicknessPercent}};
      const svg=diagramPDFPageSVG(project,configured,planDiagramPDF(project,configured),0,defaultDiagramLineDefaults(),true);
      const band=svg.match(/<path\b[^>]*data-pdf-ribbon="true"[^>]*>/)?.[0];
      assert.ok(band?.includes('stroke-width="'));
      referenceBand??=band;
      assert.equal(band,referenceBand);
      const heads=pageArrows(svg,arrowStyle==='solid'?3:6);
      assert.equal(heads.length,arrowStyle==='solid'?5:10);
      inkAreas.push(heads.reduce((sum,shape)=>sum+polygonArea(shape),0));
    }
    assert.ok(inkAreas[0]>0 && inkAreas[0]<inkAreas[1] && inkAreas[1]<inkAreas[2]);
  }
});

test('arrow visibility, colour and opacity round-trip through project files and preserve older colours',()=>{
  const {project,options}=fixture();
  const legacy={enabled:true,widthMm:8,opacity:1,paint:defaultDiagramPDFPaint()};
  for(const [ribbon,expectedColor,expectedOpacity] of [
    [options.ribbon,'#ffffff',.2],
    [{...legacy,showArrows:true},'#ffffff',.2],
    [{...legacy,showArrows:true,arrowColor:'#1878aa'},'#1878aa',1],
    [{...legacy,showArrows:true,arrowColor:'#ffffff'},'#ffffff',1],
    [{...options.ribbon,arrowColor:'#ac385b',arrowOpacity:0},'#ac385b',0],
    [{...options.ribbon,arrowStyle:'solid',arrowThicknessPercent:75,arrowColor:'#ac385b',arrowOpacity:.65},'#ac385b',.65],
    [{...options.ribbon,showArrows:false,arrowStyle:'double',arrowThicknessPercent:150},null,null],
    [{...options.ribbon,showArrows:false,arrowColor:'#ac385b'},null,null],
    [legacy,null,null],
  ] as const){
    const saved={...project,exportSettings:{pdf:{readingOrder:'snake' as const,ribbon}}};
    const restored=importDiagramProject(exportDiagramProject(saved));
    assert.deepEqual(restored.exportSettings,saved.exportSettings);
    const configured={...defaultDiagramPDFOptions(restored),...restored.exportSettings!.pdf};
    const svg=diagramPDFPageSVG(restored,configured,planDiagramPDF(restored,configured),0,defaultDiagramLineDefaults(),true);
    assert.match(svg,/data-pdf-ribbon="true"/);
    const arrow=svg.match(/<path\b[^>]*data-pdf-ribbon-arrows="true"[^>]*>/)?.[0];
    if(expectedColor){
      assert.ok(arrow);
      assert.ok(arrow.includes(`fill="${expectedColor}"`));
      const opacity=Number(arrow.match(/\bfill-opacity="([^"]+)"/)?.[1]??1);
      assert.equal(opacity,expectedOpacity);
    }else assert.equal(arrow,undefined);
  }
});

test('invalid colours, opacity, paint types and out-of-page nodes are rejected before export',()=>{
  const {project,options}=fixture();
  for(const patch of [
    {pageTextColor:'red'},
    {pageBackground:{...defaultDiagramPDFPaint(),color:'"><script/>'}},
    {ribbon:{...options.ribbon,widthMm:0}},
    {ribbon:{...options.ribbon,opacity:1.1}},
    {ribbon:{...options.ribbon,arrowColor:'red'}},
    ...[-.01,1.01,Infinity,NaN,'0.2'].map(arrowOpacity=>({ribbon:{...options.ribbon,arrowOpacity:arrowOpacity as number}})),
    {ribbon:{...options.ribbon,showArrows:1 as unknown as boolean}},
    {ribbon:{...options.ribbon,arrowStyle:'dashed' as 'double'}},
    ...[49.9,150.1,Infinity,NaN,'100'].map(arrowThicknessPercent=>({ribbon:{...options.ribbon,arrowThicknessPercent:arrowThicknessPercent as number}})),
    {ribbon:{...options.ribbon,paths:{p:[[0,0],[2,1]]}}},
  ])assert.throws(()=>planDiagramPDF(project,{...options,...patch}));
});
