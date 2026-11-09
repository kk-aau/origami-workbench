async page=>{
 const checks=[],metrics=[],errors=[],check=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
 const button=name=>page.getByRole('button',{name,exact:true}),error=e=>errors.push(e.message);
 page.on('pageerror',error);
 const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-flat-pane')?.getAttribute('data-current')==='true'&&document.querySelector('.tess-flat-drawing')?.getAttribute('data-surface-status')==='verified');
 async function inspect(hullRequired){return page.locator('.tess-flat-drawing svg').evaluate(async(svg,hullRequired)=>{
  const cells=Array.from(svg.querySelectorAll('[data-region-status]')),ps=Array.from(svg.querySelectorAll('[data-tess-flat-face]')).flatMap(p=>Array.from(p.points).map(p=>[p.x,p.y]));
  const edges=Array.from(svg.querySelectorAll('[data-region-boundary]')).map(e=>[+e.getAttribute('x1'),+e.getAttribute('y1'),+e.getAttribute('x2'),+e.getAttribute('y2')]);
  const xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]),x=Math.min(...xs)-2,y=Math.min(...ys)-2,w=Math.max(...xs)-x+2,h=Math.max(...ys)-y+2,scale=1000/Math.max(w,h),width=Math.ceil(w*scale),height=Math.ceil(h*scale);
  const clone=svg.cloneNode(true);clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('viewBox',`${x} ${y} ${width/scale} ${height/scale}`);clone.setAttribute('width',width);clone.setAttribute('height',height);clone.removeAttribute('style');
  const raster=async()=>{const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'}));try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,width,height).data;}finally{URL.revokeObjectURL(url);}};
  const data=await raster();clone.querySelectorAll('[data-region-boundary]').forEach(e=>e.remove());const paper=await raster();
  // Compare against the identical paper fill without boundary ink. Absolute
  // RGB thresholds confuse light paper and subpixel antialiasing with lost ink.
  const ink=([px,py])=>{const ix=Math.round((px-x)*scale-.5),iy=Math.round((py-y)*scale-.5);for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const k=((iy+dy)*width+ix+dx)*4;if(data[k+3]>paper[k+3]+20||[0,1,2].some(c=>paper[k+c]-data[k+c]>10))return true;}return false;};
  let samples=0,missingInk=0;for(const [ax,ay,bx,by] of edges)if(Math.hypot(bx-ax,by-ay)*scale>12)for(const t of [.2,.5,.8]){samples++;if(!ink([ax+(bx-ax)*t,ay+(by-ay)*t]))missingInk++;}
  let missingHull=0,hullEdges=0;
  if(hullRequired){
   const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),points=ps.sort((a,b)=>a[0]-b[0]||a[1]-b[1]),lower=[],upper=[];
   for(const p of points){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=1e-7)lower.pop();lower.push(p);}
   for(const p of [...points].reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=1e-7)upper.pop();upper.push(p);}
   const hull=[...lower.slice(0,-1),...upper.slice(0,-1)];hullEdges=hull.length;
   for(let i=0;i<hull.length;i++){const a=hull[i],b=hull[(i+1)%hull.length];for(const t of [.2,.5,.8]){const p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];if(!edges.some(([ax,ay,bx,by])=>{const dx=bx-ax,dy=by-ay,u=Math.max(0,Math.min(1,((p[0]-ax)*dx+(p[1]-ay)*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-ax-u*dx,p[1]-ay-u*dy)<1e-5;}))missingHull++;}}
  }
  return {cells:cells.length,edges:edges.length,samples,missingInk,missingHull,hullEdges,wholeFaceUnderpaint:Array.from(svg.querySelectorAll('[data-tess-flat-face]')).filter(p=>p.getAttribute('fill')!=='none'||p.getAttribute('stroke')!=='none').length};
 },hullRequired);}
 try{
  for(const name of ['关闭窗口','保留当前工程'])if(await button(name).count())await button(name).click();
  await page.setViewportSize({width:1440,height:900});await button('镶嵌设计').click();await button('01 单元扭转').click();
  await page.getByLabel('边数',{exact:true}).fill('10');await page.getByLabel('内接半径比',{exact:true}).fill('.7');
  await button('实体').click();if(!await page.locator('.tess-flat-pane').count())await button('计算平折').click();await ready();
  for(const side of ['正面','背面']){await button(side).click();await ready();const m=await inspect(true);metrics.push({case:'twist-36-.7',side,...m});check(m.hullEdges===10&&m.missingHull===0,`${side}保留十边形全部外轮廓，原先遗漏的上下边完整`);check(m.samples>=30&&m.missingInk===0,`${side}可见结构边均实际绘制`);check(m.wholeFaceUnderpaint===0,`${side}局部实体下方无任意纸面底图`);}
  await page.getByLabel('平折正面颜色',{exact:true}).fill('#f3e8cd');await page.getByLabel('平折背面颜色',{exact:true}).fill('#f3e8cd');await page.getByLabel('平折边线颜色',{exact:true}).fill('#173026');await ready();const same=await inspect(true);metrics.push({case:'same-color',...same});check(same.missingHull===0&&same.missingInk===0,'正背设置同色仍保留结构边');
  await page.screenshot({path:'output/back-surface-twist-correct.png'});
  await button('04 混合平铺').click();
  for(const [angle,scale] of [[20,.5],[60,.2]]){
   await page.getByLabel('旋转角度',{exact:true}).fill(String(angle));await page.getByLabel('缩放比例',{exact:true}).fill(String(scale));await ready();
   for(const side of ['正面','背面']){await button(side).click();await ready();const m=await inspect(false);metrics.push({case:`mixed-${angle}-${scale}`,side,...m});check(m.cells>0&&m.edges>0&&m.samples>30&&m.missingInk===0,`混合${angle}°/${scale}${side}轮廓闭合且结构边完整`);check(m.wholeFaceUnderpaint===0,`混合${angle}°/${scale}${side}无旧纸面错误遮挡`);}
  }
  const camera=await page.getByLabel('镶嵌实时平折画面',{exact:true}).getAttribute('viewBox');
  for(let i=0;i<8;i++){await button(i%2?'背面':'正面').click();await ready();}
  check(await page.getByLabel('镶嵌实时平折画面',{exact:true}).getAttribute('viewBox')===camera,'快速切换正反不改变相机');
  await page.screenshot({path:'output/back-surface-mixed-correct.png'});check(errors.length===0,'所有案例均无轮廓异常或浏览器运行错误');
  const result={passed:checks.length,checks,metrics,errors};await page.evaluate(r=>{window.__backSurfaceResult=r;},result);return result;
 }finally{await page.evaluate(r=>{window.__backSurfaceDebug=r;},{checks,metrics,errors});page.off('pageerror',error);}
}
