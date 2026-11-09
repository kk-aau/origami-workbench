async page=>{
 const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 await page.evaluate(()=>{window.confirm=()=>true;});await page.setViewportSize({width:1280,height:800});
 const button=name=>page.getByRole('button',{name,exact:true}),canvas=()=>page.frameLocator('iframe[title="三维折叠模拟画布"]').locator('#simulation');
 const waitState=async backend=>page.waitForFunction(expected=>{const c=document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation');return c?.dataset.backend===expected&&['loaded','running','paused'].includes(c.dataset.status);},backend,{timeout:30000});
 const capture=async()=>canvas().evaluate(()=>{window.__weakExports=[];const original=URL.createObjectURL;URL.createObjectURL=function(blob){window.__weakExports.push(blob);return original.call(this,blob);};});
 const download=async(label,name,ext)=>{const saving=page.waitForEvent('download');await button(label).click();const d=await saving;await d.saveAs(`output/playwright/material-weak-tools-sim-regression-${name}-1009.${ext}`);check(await d.failure()===null,`${name} ${ext} 实际下载成功`);};
 const fold=async()=>canvas().evaluate(async()=>JSON.parse(await window.__weakExports.at(-1).text()));
 const advanced=async()=>{if(await page.locator('.sim-advanced').getAttribute('open')===null)await page.locator('.sim-advanced > summary').click();};
 const percent=async n=>{const input=page.getByRole('spinbutton',{name:'目标折叠比例数字',exact:true});await input.fill(String(n));await input.press('Enter');};
 const waitSteps=async n=>page.waitForFunction(n=>Number(document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset.steps)>n,n,{timeout:30000});
 for(const [name,count]of [['interior',6],['boundary',5],['cross',12],['hole',10],['free-F',6],['free-M',6],['original-F',12],['hinge-F',8]]){
  await button('折痕编辑').click();await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`output/playwright/material-weak-tools-sim-regression-${name}-initial-1009.zhezhi.json`);
  await page.waitForFunction(name=>document.querySelector('[aria-label="工程名称"]')?.value===name,`弱边界三维-${name}`);
  await button('三维模拟').click();await waitState('webgl2');await capture();await button('展开复位').click();await advanced();
  await download('导出三维 FOLD',`${name}-reset`,'fold');let reset=await fold();check(reset.faces_vertices.length===count,`${name} 完整实际三角面数量`);check(reset.vertices_coords.every(p=>p.every(Number.isFinite)),`${name} 实际顶点有限`);
  await download('导出 OBJ 网格',`${name}-reset`,'obj');await download('导出 STL 网格',`${name}-reset`,'stl');
  for(const [label,mode]of [['只看折线','wireframe'],['应变热图','strain'],['纸面着色','paper']]){await button(label).click();await page.waitForFunction(mode=>document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset.displayMode===mode,mode);check(true,`${name} ${mode} 模式生效`);}
  await button('背面视角').click();await button('正面视角').click();await download('导出当前 PNG',`${name}-reset`,'png');
  if(name==='hole'){
   const px=await canvas().evaluate(async()=>{const b=await createImageBitmap(window.__weakExports.at(-1)),c=document.createElement('canvas');c.width=b.width;c.height=b.height;const ctx=c.getContext('2d');ctx.drawImage(b,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;let x0=c.width,y0=c.height,x1=0,y1=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=4*(y*c.width+x);if(Math.abs(data[i]-240)>2||Math.abs(data[i+1]-243)>2||Math.abs(data[i+2]-239)>2){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}return Array.from(ctx.getImageData(Math.round((x0+x1)/2),Math.round((y0+y1)/2),1,1).data);});
   check(px[3]===255&&Math.abs(px[0]-240)<=1&&Math.abs(px[1]-243)<=1&&Math.abs(px[2]-239)<=1,'弱单桥孔洞GPU没有填孔');
  }
  if(name==='hinge-F'||name==='free-M'){
   await percent(name==='hinge-F'?30:10);await waitSteps(256);if(await button('暂停').count())await button('暂停').click();await download('导出三维 FOLD',`${name}-gpu`,'fold');const moved=await fold();check(moved.vertices_coords.every(p=>p.every(Number.isFinite)),`${name} GPU 实际驱动有限`);if(name==='hinge-F')check(moved.vertices_coords.some(p=>Math.abs(p[2])>.001),'兼容M铰链GPU实际折起');
   await page.screenshot({path:`output/playwright/material-weak-tools-sim-regression-${name}-gpu-1009.png`});
   await page.locator('iframe[title="三维折叠模拟画布"]').evaluate(e=>{e.src='/simulator/index.html?backend=cpu';});await canvas().waitFor();await page.waitForFunction(()=>document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset.status==='ready');await button('载入当前折痕').click();await waitState('cpu');await capture();
   await percent(name==='hinge-F'?30:10);await waitSteps(256);if(await button('暂停').count())await button('暂停').click();await download('导出三维 FOLD',`${name}-cpu`,'fold');const cpu=await fold();check(cpu.vertices_coords.every(p=>p.every(Number.isFinite)),`${name} CPU 实际驱动有限`);if(name==='hinge-F')check(cpu.vertices_coords.some(p=>Math.abs(p[2])>.001),'兼容M铰链CPU实际折起');
   await download('导出 OBJ 网格',`${name}-cpu`,'obj');await download('导出 STL 网格',`${name}-cpu`,'stl');await button('展开复位').click();await download('导出三维 FOLD',`${name}-cpu-reset`,'fold');check(JSON.stringify((await fold()).vertices_coords)===JSON.stringify(reset.vertices_coords),`${name} CPU复位逐值恢复原位置`);
  }
  await page.screenshot({path:`output/playwright/material-weak-tools-sim-regression-${name}-1009.png`});
  await button('折痕编辑').click();await button('导出作品').click();const dialog=page.getByRole('dialog',{name:'导出作品',exact:true});await dialog.getByRole('combobox').first().selectOption('json');const saving=page.waitForEvent('download');await dialog.getByRole('button',{name:'导出文件',exact:true}).click();await(await saving).saveAs(`output/playwright/material-weak-tools-sim-regression-${name}-after-1009.zhezhi.json`);await button('关闭窗口').click();check(true,`${name} 返回原CP实际导出`);
 }
 check(errors.length===0,'零页面异常');return {passed:checks.length,checks,errors};
}
