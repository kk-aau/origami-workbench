async page=>{
 const checks=[],metrics=[],check=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
 const button=name=>page.getByRole('button',{name,exact:true});
 for(const name of ['关闭窗口','保留当前工程'])if(await button(name).count())await button(name).click();
 await button('镶嵌设计').click();await button('01 单元扭转').click();
 await page.getByLabel('边数',{exact:true}).fill('10');
 await page.getByLabel('平折正面颜色',{exact:true}).fill('#33aa11');await page.getByLabel('平折背面颜色',{exact:true}).fill('#ffebc4');
 if(!await page.locator('.tess-flat-pane').count())await button('计算平折').click();
 await button('实体').click();
 const ready=()=>page.waitForFunction(()=>document.querySelectorAll('[data-region-fill]').length>0&&document.querySelector('.tess-flat-pane')?.getAttribute('data-current')==='true');
 await ready();
 async function pixels(size){return page.locator('.tess-flat-drawing svg').evaluate(async(svg,size)=>{
  const cells=Array.from(svg.querySelectorAll('[data-region-status]')).map(p=>({points:p.getAttribute('points').split(' ').map(p=>p.split(',').map(Number)),fill:p.getAttribute('fill')}));
  const colors=[...new Set(cells.map(c=>c.fill))];if(colors.some(c=>!/^#[0-9a-f]{6}$/i.test(c)))throw Error('Expected completely ordered solid sample');
  const points=cells.flatMap(c=>c.points),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const x=Math.min(...xs)-1,y=Math.min(...ys)-1,w=Math.max(...xs)-x+1,h=Math.max(...ys)-y+1,scale=size/Math.max(w,h),width=Math.ceil(w*scale),height=Math.ceil(h*scale);
  const labels=new Int16Array(width*height).fill(-1);
  const materialEdges=cells.map(c=>{const ps=c.points.map(p=>[(p[0]-x)*scale,(p[1]-y)*scale]);return {label:colors.indexOf(c.fill),ps,left:Math.min(...ps.map(p=>p[0]))-3,right:Math.max(...ps.map(p=>p[0]))+3,top:Math.min(...ps.map(p=>p[1]))-3,bottom:Math.max(...ps.map(p=>p[1]))+3};});
  // Pixel-center masks miss subpixel tips of a different material. Exclude their
  // real geometric boundaries too; decomposition seams of the same fill remain.
  const nearOtherMaterial=(px,py,label)=>materialEdges.some(c=>c.label!==label&&px>=c.left&&px<=c.right&&py>=c.top&&py<=c.bottom&&c.ps.some((a,i)=>{const b=c.ps[(i+1)%c.ps.length],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((px-a[0])*dx+(py-a[1])*dy)/(dx*dx+dy*dy||1)));return (px-a[0]-t*dx)**2+(py-a[1]-t*dy)**2<9;}));
  const inside=(px,py,ps)=>{let hit=false;for(let i=0,j=ps.length-1;i<ps.length;j=i++){const a=ps[i],b=ps[j];if((a[1]>py)!==(b[1]>py)&&px<(b[0]-a[0])*(py-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
  for(const cell of cells){const ps=cell.points.map(p=>[(p[0]-x)*scale,(p[1]-y)*scale]),label=colors.indexOf(cell.fill);
   const left=Math.max(0,Math.floor(Math.min(...ps.map(p=>p[0])))),right=Math.min(width-1,Math.ceil(Math.max(...ps.map(p=>p[0])))),top=Math.max(0,Math.floor(Math.min(...ps.map(p=>p[1])))),bottom=Math.min(height-1,Math.ceil(Math.max(...ps.map(p=>p[1]))));
   for(let iy=top;iy<=bottom;iy++)for(let ix=left;ix<=right;ix++)if(inside(ix+.5,iy+.5,ps))labels[iy*width+ix]=label;
  }
  async function raster(legacy){
   const clone=svg.cloneNode(true);clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('viewBox',`${x} ${y} ${width/scale} ${height/scale}`);clone.setAttribute('width',width);clone.setAttribute('height',height);clone.removeAttribute('class');clone.removeAttribute('style');
   // Check material coverage independently of the intentional visible boundary ink.
   clone.querySelectorAll('line').forEach(e=>e.remove());clone.querySelectorAll('[stroke]').forEach(e=>e.setAttribute('stroke','none'));
   if(legacy){clone.querySelectorAll('[data-region-fill]').forEach(e=>e.remove());clone.querySelectorAll('[data-region-status]').forEach(e=>e.setAttribute('fill-opacity','1'));}
   const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'}));
   try{const img=new Image();img.src=url;await img.decode();const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return ctx.getImageData(0,0,width,height).data;}finally{URL.revokeObjectURL(url);}
  }
  const actual=await raster(false),old=await raster(true),rgb=colors.map(c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)));
  let sampled=0,bleeding=0,legacyBleeding=0;const errors=[];
  for(let iy=3;iy<height-3;iy++)for(let ix=3;ix<width-3;ix++){
   const index=iy*width+ix,label=labels[index];if(label<0)continue;
   let interior=true;for(let dy=-3;dy<=3&&interior;dy++)for(let dx=-3;dx<=3;dx++)if(labels[index+dy*width+dx]!==label){interior=false;break;}if(!interior)continue;
   const offset=index*4,expected=rgb[label],wrong=data=>data[offset+3]!==255||expected.some((v,i)=>Math.abs(data[offset+i]-v)>1);
   if((wrong(actual)||wrong(old))&&nearOtherMaterial(ix+.5,iy+.5,label))continue;sampled++;
   if(wrong(actual)){bleeding++;if(errors.length<10)errors.push({point:[ix,iy],expected,actual:Array.from(actual.slice(offset,offset+4))});}if(wrong(old))legacyBleeding++;
  }
  return {size,cells:cells.length,fills:svg.querySelectorAll('[data-region-fill]').length,sampled,bleeding,legacyBleeding,errors};
 },size);}
 for(const side of ['正面','背面']){
  await button(side).click();await ready();
  for(const size of [320,800]){const metric=await pixels(size);metrics.push({side,...metric});check(metric.sampled>1000&&metric.bleeding===0,`${side} ${size}px 实体内部无透色 ${JSON.stringify(metric)}`);check(metric.legacyBleeding>100,`${side} ${size}px 能检出旧版区域接缝`);}
 }
 await button('平折顺时针旋转45度').click();await ready();const rotated=await pixels(640);metrics.push({side:'背面旋转45度',...rotated});check(rotated.bleeding===0,'旋转后接缝不透色');
 const camera=await page.locator('.tess-flat-drawing svg').getAttribute('viewBox');
 await button('透视').click();check(await page.locator('[data-region-fill]').count()===0,'透视模式仍明确显示下层');await button('实体').click();await ready();
 check(await page.locator('.tess-flat-drawing svg').getAttribute('viewBox')===camera,'模式切换保留图像位置');
 await page.screenshot({path:'output/playwright/solid-seams-fixed.png'});
 // The same surface is used in the editor, where opaque paths must not consume
 // the original per-region hit targets. Pointer capture must preserve clicks.
 await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();await button('采用折痕副本 →').click();await button('计算平折').click();
 await page.waitForFunction(()=>document.querySelectorAll('.flat-workspace [data-region-fill]').length>0);
 const hit=async()=>page.locator('.flat-workspace [data-region-top]').evaluateAll(ps=>{for(const p of ps){const pts=Array.from(p.points),a=new DOMPoint(pts.reduce((s,p)=>s+p.x,0)/pts.length,pts.reduce((s,p)=>s+p.y,0)/pts.length).matrixTransform(p.getScreenCTM());const hit=document.elementFromPoint(a.x,a.y);if(hit?.hasAttribute('data-region-top'))return {x:a.x,y:a.y,id:Number(hit.getAttribute('data-region-top'))};}throw Error('no visible region hit target');});
 let point=await hit();await page.mouse.click(point.x,point.y);
 check((await page.locator('.face-map strong').innerText()).startsWith('F'+(point.id+1)),'编辑区单击仍选择实际可见面');
 check(await page.locator('[data-region-fill][fill="#d2b57b"]').count()>0,'选面高亮保留独立颜色');await button('取消面选择').click();
 const editor=page.getByLabel('实际平折面几何，点击面查看原始位置',{exact:true}),editorCamera=await editor.getAttribute('viewBox');point=await hit();
 await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x-35,point.y+20,{steps:8});await page.mouse.up();
 check(await editor.getAttribute('viewBox')!==editorCamera,'实体模型仍可拖动');check(await page.locator('.face-map').count()===0,'拖动不会误选纸面');
 const result={passed:checks.length,checks,metrics};await page.evaluate(result=>{window.__solidSeamResult=result;},result);return result;
}
