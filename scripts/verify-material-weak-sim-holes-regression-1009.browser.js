async page=>{
 const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 await page.evaluate(()=>{window.confirm=()=>true;});await page.setViewportSize({width:1280,height:800});
 const button=name=>page.getByRole('button',{name,exact:true}),canvas=()=>page.frameLocator('iframe[title="三维折叠模拟画布"]').locator('#simulation');
 const waitState=async backend=>page.waitForFunction(expected=>{const c=document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation');return c?.dataset.backend===expected&&['loaded','running','paused'].includes(c.dataset.status);},backend,{timeout:30000});
 const capture=async()=>canvas().evaluate(()=>{window.__holeExports=[];const original=URL.createObjectURL;URL.createObjectURL=function(blob){window.__holeExports.push(blob);return original.call(this,blob);};});
 const load=async name=>{
  if(await button('折痕编辑').count())await button('折痕编辑').click();
  await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`output/playwright/material-weak-sim-holes-regression-${name}-1009.zhezhi.json`);
  await page.waitForFunction(value=>document.querySelector('[aria-label="工程名称"]')?.value===value,`带孔三维-${name}`);
  await button('三维模拟').click();await waitState('webgl2');await capture();
 };
 const download=async(label,name,extension)=>{
  const saving=page.waitForEvent('download');await button(label).click();const d=await saving;await d.saveAs(`output/playwright/material-weak-sim-holes-regression-${name}-1009.${extension}`);check((await d.failure())===null,`${name} ${extension} 实际下载成功`);
 };
 const advanced=async()=>{if((await page.locator('.sim-advanced').getAttribute('open'))===null)await page.locator('.sim-advanced > summary').click();};
 const pngPixels=async()=>canvas().evaluate(async()=>{
  const blob=window.__holeExports.at(-1),bitmap=await createImageBitmap(blob),c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
  const sample=(dx)=>Array.from(ctx.getImageData(Math.round(c.width/2+dx*Math.min(c.width,c.height)),Math.round(c.height/2),1,1).data);
  return {center:sample(0),left:sample(-.2),right:sample(.2),holeLeft:sample(-.15),holeRight:sample(.15),width:c.width,height:c.height};
 });
 const isBlank=p=>p[3]===255&&Math.abs(p[0]-240)<=1&&Math.abs(p[1]-243)<=1&&Math.abs(p[2]-239)<=1;
 await load('ring');check(await canvas().getAttribute('data-backend')==='webgl2','单孔实际GPU载入');
 await button('展开复位').click();await button('正面视角').click();await advanced();
 for(const side of ['front','back']){
  if(side==='back')await button('背面视角').click();
  await download('导出当前 PNG',`ring-${side}`,'png');const px=await pngPixels();check(isBlank(px.center),`${side} GPU 孔中心是背景`);check(!isBlank(px.left)&&!isBlank(px.right),`${side} GPU 孔左右是真实纸面`);
 }
 await download('导出三维 FOLD','ring-flat','fold');check((await canvas().evaluate(async()=>JSON.parse(await window.__holeExports.at(-1).text()))).faces_vertices.length===16,'单孔实际导出完整16片');await download('导出 OBJ 网格','ring-flat','obj');await download('导出 STL 网格','ring-flat','stl');
 await page.screenshot({path:'output/playwright/material-weak-sim-holes-regression-ring-back-1009.png'});
 await load('two');check(await canvas().getAttribute('data-backend')==='webgl2','双孔实际GPU载入');
 await button('展开复位').click();await button('正面视角').click();await advanced();await download('导出当前 PNG','two-front','png');let px=await pngPixels();check(isBlank(px.holeLeft)&&isBlank(px.holeRight),'GPU 两个孔中心都为空白');check(!isBlank(px.center),'GPU 两孔之间的纸面保持完整');await download('导出三维 FOLD','two-flat','fold');check((await canvas().evaluate(async()=>JSON.parse(await window.__holeExports.at(-1).text()))).faces_vertices.length===26,'双孔实际导出完整26片');
 await load('hinge');await advanced();
 const percent=async value=>{await page.getByRole('spinbutton',{name:'目标折叠比例数字',exact:true}).fill(String(value));await page.getByRole('spinbutton',{name:'目标折叠比例数字',exact:true}).press('Enter');};
 const waitSteps=async min=>page.waitForFunction(value=>Number(document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset.steps)>value,min,{timeout:30000});
 await percent(30);await waitSteps(128);if(await button('暂停').count())await button('暂停').click();
 await download('导出三维 FOLD','hinge-gpu','fold');const gpu=await canvas().evaluate(async()=>JSON.parse(await window.__holeExports.at(-1).text()));check(gpu.vertices_coords.every(p=>p.length===3&&p.every(Number.isFinite)),'GPU 折叠导出顶点有限');check(gpu.vertices_coords.some(p=>Math.abs(p[2])>.001),'GPU 铰链实际离开输入平面');check(!gpu.faces_holes&&!gpu.faces_holeEdges,'GPU 三维网格不残留源面孔环索引');
 await download('导出 OBJ 网格','hinge-gpu','obj');await download('导出 STL 网格','hinge-gpu','stl');await download('导出当前 PNG','hinge-gpu','png');
 await percent(45);const before=await canvas().getAttribute('data-steps');await waitSteps(Number(before));check(true,'带孔目标参数调整推动GPU继续计算');
 await button('展开复位').click();await download('导出三维 FOLD','hinge-reset','fold');const reset=await canvas().evaluate(async()=>JSON.parse(await window.__holeExports.at(-1).text()));check(reset.vertices_coords.every(p=>Math.abs(p[2])<1e-7),'带孔GPU复位恢复原输入平面');
 await page.locator('iframe[title="三维折叠模拟画布"]').evaluate(e=>{e.src='/simulator/index.html?backend=cpu';});
 await canvas().waitFor();await page.waitForFunction(()=>document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset.status==='ready');await button('载入当前折痕').click();await waitState('cpu');await capture();
 await percent(30);await waitSteps(128);if(await button('暂停').count())await button('暂停').click();
 await download('导出三维 FOLD','hinge-cpu','fold');const cpu=await canvas().evaluate(async()=>JSON.parse(await window.__holeExports.at(-1).text()));check(cpu.vertices_coords.every(p=>p.length===3&&p.every(Number.isFinite)),'CPU 折叠导出顶点有限');check(cpu.vertices_coords.some(p=>Math.abs(p[2])>.001),'CPU 铰链实际离开输入平面');
 await page.screenshot({path:'output/playwright/material-weak-sim-holes-regression-hinge-cpu-1009.png'});
 await button('展开复位').click();await button('正面视角').click();await download('导出当前 PNG','hinge-cpu-reset','png');px=await pngPixels();check(isBlank(px.center),'CPU 复位后的实际孔中心是背景');
 await button('折痕编辑').click();await button('导出作品').click();const dialog=page.getByRole('dialog',{name:'导出作品',exact:true});await dialog.getByRole('combobox').first().selectOption('json');let saving=page.waitForEvent('download');await dialog.getByRole('button',{name:'导出文件',exact:true}).click();await(await saving).saveAs('output/playwright/material-weak-sim-holes-regression-hinge-after-1009.zhezhi.json');await button('关闭窗口').click();
 await button('计算平折').click();await page.waitForFunction(()=>document.querySelector('.flat-result-label')?.textContent?.includes('已找到层序解'));check(true,'三维返回后二维材料仍可平折');check(errors.length===0,'零页面异常');return {passed:checks.length,checks,errors};
}
