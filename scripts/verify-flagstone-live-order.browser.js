async page=>{
 const checks=[],errors=[],check=(ok,message)=>{if(!ok)throw Error(message);checks.push(message);};
 const error=e=>errors.push(e.message);page.on('pageerror',error);
 const button=name=>page.getByRole('button',{name,exact:true});
 const ready=()=>page.waitForFunction(()=>document.querySelector('.tess-flat-pane')?.getAttribute('data-current')==='true'&&document.querySelector('.tess-flat-drawing')?.getAttribute('data-surface-status')==='verified');
 const shape=()=>page.locator('[data-tess-flat-face]').evaluateAll(ps=>ps.map(p=>p.getAttribute('points')).join('|'));
 try{
  for(const name of ['关闭窗口','保留当前工程'])if(await button(name).count())await button(name).click();
  await page.setViewportSize({width:1440,height:900});await button('镶嵌设计').click();await button('08 铺石镶嵌').click();
  await page.getByLabel('行数',{exact:true}).fill('2');await page.getByLabel('列数',{exact:true}).fill('2');await button('实体').click();await button('正面').click();
  if(!await page.locator('.tess-flat-pane').count())await button('计算平折').click();await ready();
  check((await page.locator('.tess-flat-pane header').innerText()).includes('层序已解'),'方形铺石得到真实层序解');
  const color=async()=>page.locator('[data-tess-flat-face]').evaluateAll(ps=>{
   const polygons=ps.map(p=>({points:Array.from(p.points).map(p=>[p.x,p.y]),material:p.getAttribute('data-material')})),points=polygons.flatMap(p=>p.points),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
   const inside=(x,y,ps)=>{let hit=false;for(let i=0,j=ps.length-1;i<ps.length;j=i++){const a=ps[i],b=ps[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
   const area=ps=>Math.abs(ps.reduce((s,p,i)=>{const q=ps[(i+1)%ps.length];return s+p[0]*q[1]-p[1]*q[0];},0)/2),stoneArea=Math.max(...polygons.map(p=>area(p.points)));
   const count={front:0,back:0,uncovered:0,flaps:0};for(let j=0;j<79;j++)for(let i=0;i<83;i++){const p=[x+(i+.371)*w/83,y+(j+.619)*h/79],top=[...polygons].reverse().find(f=>inside(...p,f.points));count[top?.material??'uncovered']++;if(top&&area(top.points)<stoneArea*(1-1e-7))count.flaps++;}return count;
  });
  const front=await color();check(front.back===0&&front.uncovered===0&&front.flaps===0,'铺石正面由完整石块覆盖且单色，没有反面小三角或露出的同色褶片');await button('背面').click();await ready();const back=await color();check(back.front===0&&back.uncovered===0,'铺石背面材料及遮挡一致');await button('正面').click();await ready();
  await page.screenshot({path:'output/flagstone-correct.png'});
  await button('04 混合平铺').click();await ready();await page.waitForFunction(()=>document.querySelectorAll('[data-region-fill]').length>0);
  check(true,'混合平铺使用已确认的局部遮挡');
  await page.evaluate(()=>{
   const d=window.__liveOrder={stop:false,frames:0,updates:0,missingSurface:0,unverified:0,rects:[],times:[],last:''};
   function sample(now){if(d.stop)return;d.frames++;d.times.push(now);const shape=Array.from(document.querySelectorAll('[data-tess-flat-face]')).map(p=>p.getAttribute('points')).join('|');if(shape!==d.last){d.last=shape;d.updates++;}
    if(!document.querySelector('[data-region-fill]'))d.missingSurface++;if(document.querySelector('.tess-flat-drawing')?.getAttribute('data-surface-status')==='geometry')d.unverified++;
    const rect=document.querySelector('svg.crease-canvas').getBoundingClientRect();d.rects.push([rect.x,rect.y,rect.width,rect.height]);requestAnimationFrame(sample);
   }requestAnimationFrame(sample);
  });
  const range=page.getByLabel('缩放比例滑条',{exact:true}),box=await range.boundingBox(),y=box.y+box.height/2,x=v=>box.x+7+(box.width-14)*(v-.1)/.75;
  await page.mouse.move(x(.3),y);await page.mouse.down();await page.mouse.move(x(.5),y,{steps:90});
  const held=await page.evaluate(()=>window.__liveOrder.updates);await page.mouse.up();await ready();
  const metrics=await page.evaluate(()=>{const d=window.__liveOrder;d.stop=true;const intervals=d.times.slice(1).map((t,i)=>t-d.times[i]).sort((a,b)=>a-b);return {frames:d.frames,updates:d.updates,missingSurface:d.missingSurface,unverified:d.unverified,maxShift:Math.max(...d.rects.flatMap(r=>r.map((v,i)=>Math.abs(v-d.rects[0][i])))),rafP95:intervals[Math.floor(intervals.length*.95)]};});
  check(held>=10,'拖动未松开时持续更新正确的平折结构');check(metrics.missingSurface===0&&metrics.unverified===0,'拖动全程没有丢失遮挡或回到按编号叠放');check(metrics.maxShift<.1,'调参期间画布不抖动');
  let release;const gate=new Promise(resolve=>release=resolve);await page.route('**/api/tessellate',async route=>{await gate;await route.continue();});
  try{const old=await shape();await page.getByLabel('缩放比例',{exact:true}).fill('.46');await ready();check(await shape()!==old,'后台构造未返回时，几何与经过验证的遮挡仍同步更新');check(await button('采用折痕副本 →').isDisabled(),'实时显示不会绕过候选采用检查');}finally{release();await page.waitForFunction(()=>document.querySelector('.tess-preview-status')?.getAttribute('data-pending')==='false');await page.unroute('**/api/tessellate');}
  const camera=await page.getByLabel('镶嵌实时平折画面',{exact:true}).getAttribute('viewBox');await button('背面').click();await ready();await button('正面').click();await ready();
  check(await page.getByLabel('镶嵌实时平折画面',{exact:true}).getAttribute('viewBox')===camera,'切换正背面保留位置和缩放');
  await page.screenshot({path:'output/mixed-live-order-correct.png'});check(errors.length===0,'无浏览器运行错误');
  const result={passed:checks.length,checks,metrics,front,back};await page.evaluate(result=>{window.__flagstoneLiveResult=result;},result);return result;
 }finally{page.off('pageerror',error);}
}
