async page=>{
 const checks=[],check=(condition,message)=>{if(!condition)throw Error(message);checks.push(message);};
 const button=name=>page.getByRole('button',{name,exact:true});
 const canvas=()=>page.frameLocator('iframe[title="三维折叠模拟画布"]').locator('#simulation');
 const state=()=>page.evaluate(()=>{
  const element=document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation');
  if(!element)return null;
  return {status:element.dataset.status,backend:element.dataset.backend,steps:Number(element.dataset.steps),displayMode:element.dataset.displayMode,view:element.dataset.view};
 });
 const upload=async(label,document)=>{
  const text=JSON.stringify(document);
  await page.getByLabel(label,{exact:true}).evaluate((element,value)=>{
   const transfer=new DataTransfer();
   transfer.items.add(new File([value],'simulation-workspace.zhezhi.json',{type:'application/json'}));
   element.files=transfer.files;
   element.dispatchEvent(new Event('change',{bubbles:true}));
  },text);
 };
 const setPercent=async percent=>{
  await page.getByRole('slider',{name:'目标折叠比例'}).evaluate((element,value)=>{
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,String(value));
   element.dispatchEvent(new Event('input',{bubbles:true}));
   element.dispatchEvent(new Event('change',{bubbles:true}));
  },percent);
  await page.waitForFunction(value=>document.querySelector('[aria-label="目标折叠比例数字"]')?.value===String(value),percent);
 };
 const waitState=async status=>page.waitForFunction(value=>document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset.status===value,status);
 const waitSteps=async minimum=>page.waitForFunction(value=>{
  const step=Number(document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset.steps);
  return Number.isFinite(step)&&step>value;
 },minimum,{timeout:30000});
 await page.evaluate(()=>{window.__simulationOriginalConfirm=window.confirm;window.confirm=()=>true;});
 try{
  await page.setViewportSize({width:1200,height:800});
  for(const name of ['关闭窗口','保留当前工程'])if(await button(name).count())await button(name).click();
  const segment=(id,a,b,assignment='B',angle=0)=>({id,a,b,assignment,angle});
  const document={format:'zhezhi-workbench',version:2,schemaVersion:2,name:'三维模拟回归-'+Date.now(),paper:{width:200,height:100},segments:[
   segment('top',[0,0],[200,0]),segment('right',[200,0],[200,100]),segment('bottom',[200,100],[0,100]),segment('left',[0,100],[0,0]),
   segment('crease',[100,0],[100,100],'M',-90),
  ]};
  await upload('折痕工程文件',document);
  await page.waitForFunction(name=>document.querySelector('[aria-label="工程名称"]')?.value===name,document.name);
  await button('三维模拟').click();
  await page.waitForFunction(()=>{
   const element=document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation');
   return element&&['loaded','running','paused'].includes(element.dataset.status)&&['cpu','webgl2'].includes(element.dataset.backend);
  },null,{timeout:30000});
  check((await state()).backend==='webgl2','本机 WebGL2 后端实际载入');
  check((await page.locator('aside').innerText()).includes('已载入'),'父页显示当前输入已载入');
  check(await canvas().count()===1,'三维画布与父页同源连接');
  const controls=page.locator('.sim-controls');
  check(await controls.evaluate(element=>element.getBoundingClientRect().height<100&&element.scrollHeight<=element.clientHeight+1),'宽屏控制栏紧凑且没有内部滚动');
  await page.screenshot({path:'output/playwright/simulation-workspace-loaded.png'});
  await page.setViewportSize({width:1000,height:720});
  check(await controls.evaluate(element=>element.scrollHeight<=element.clientHeight+1&&getComputedStyle(element).overflowY==='visible'),'较窄视口控制栏仍无需内部滚动');
  check(await page.locator('aside.inspector').evaluate(element=>element.scrollHeight<=element.clientHeight+1),'模拟状态侧栏无需纵向滚动');
  await page.screenshot({path:'output/playwright/simulation-workspace-1000x720.png'});
  await page.setViewportSize({width:1200,height:800});
  await canvas().evaluate(()=>{
   window.__simulationExports={original:URL.createObjectURL,items:[]};
   URL.createObjectURL=function(blob){window.__simulationExports.items.push((async()=>({text:blob.type==='image/png'?'':await blob.text(),type:blob.type,size:blob.size,header:blob.type==='image/png'?Array.from(new Uint8Array(await blob.arrayBuffer()).slice(0,8)):[]}))());return window.__simulationExports.original.call(this,blob);};
  });

  await setPercent(50);
  await waitSteps(0);
  check((await state()).steps>0,'目标比例 50% 推动求解器实际计算');
  await page.screenshot({path:'output/playwright/simulation-workspace-folding.png'});
  if(!(await button('暂停').count()))await button('继续').click();
  await button('暂停').click();await waitState('paused');
  const paused=(await state()).steps;
  await page.waitForTimeout(350);
  check((await state()).steps===paused,'暂停后求解步数保持不变');
  await button('继续').click();await waitSteps(paused);
  check((await state()).steps>paused,'继续后求解步数增加');
  await button('展开复位').click();
  await page.waitForFunction(()=>{
   const element=document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation');
   return element?.dataset.status==='paused'&&element.dataset.steps==='0'&&document.querySelector('[aria-label="目标折叠比例数字"]')?.value==='0';
  });
  check((await state()).steps===0,'复位同时清零目标比例和求解步数');

  await button('推进 20 步').click();
  await page.waitForFunction(()=>document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset.steps==='20');
  check((await state()).steps===20,'手动推进精确执行 20 步');
  await button('播放目标').click();
  await page.waitForFunction(()=>Number(document.querySelector('[aria-label="目标折叠比例数字"]')?.value)>0);
  check(Number(await page.getByLabel('目标折叠比例数字').inputValue())>0,'播放会自动推进目标折叠比例');
  await button('停止播放').click();
  const stopped=await page.getByLabel('目标折叠比例数字').inputValue();
  await page.waitForTimeout(350);
  check(await page.getByLabel('目标折叠比例数字').inputValue()===stopped,'停止播放后目标比例保持不变');
  await button('展开复位').click();

  const displayModes=[];
  for(const [name,expected] of [['纸面着色','paper'],['只看折线','wireframe'],['透视纸面','xray'],['应变热图','strain']]){
   await button(name).click();
   check(await button(name).getAttribute('aria-pressed')==='true',`${name} 切换后按钮状态明确`);
   await page.waitForFunction(value=>document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset.displayMode===value,expected);
   displayModes.push((await state()).displayMode);
  }
  check(displayModes.every(Boolean)&&new Set(displayModes).size===4,'四种显示模式均传入三维渲染核心');
  const views=[];
  for(const [name,expected] of [['正面视角','front'],['背面视角','back'],['立体视角','isometric']]){
   await button(name).click();
   check(await button(name).getAttribute('aria-pressed')==='true',`${name} 切换后按钮状态明确`);
   await page.waitForFunction(value=>document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset.view===value,expected);
   views.push((await state()).view);
  }
  check(views.every(Boolean)&&new Set(views).size===3,'三个固定视角均传入三维渲染核心');
  const area=await canvas().boundingBox();
  await page.mouse.move(area.x+area.width/2,area.y+area.height/2);
  await page.mouse.down();await page.mouse.move(area.x+area.width/2+24,area.y+area.height/2);await page.mouse.up();
  await page.waitForFunction(()=>document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset.view==='free');
  await page.waitForFunction(()=>document.querySelector('button[aria-label="立体视角"]')?.getAttribute('aria-pressed')==='false');
  check(await button('立体视角').getAttribute('aria-pressed')==='false','手动旋转后固定视角按钮取消选中');
  await button('立体视角').click();
  await page.waitForFunction(()=>document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset.view==='isometric');
  check((await state()).view==='isometric','固定视角可从自由旋转恢复');

  await setPercent(50);
  await page.waitForFunction(()=>{
   const element=document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation');
   return Number(element?.dataset.steps)>=5000||element?.dataset.status==='paused';
  },null,{timeout:30000});
  if(await button('暂停').count())await button('暂停').click();
  await page.locator('.sim-advanced > summary').click();
  const foldDownload=page.waitForEvent('download');await button('导出三维 FOLD').click();
  const foldFile=await foldDownload;await foldFile.saveAs('output/playwright/simulation-workspace.fold');
  check((await foldFile.failure())===null,'三维 FOLD 文件下载成功');
  const foldText=await canvas().evaluate(async()=>await window.__simulationExports.items.at(-1));
  const fold=JSON.parse(foldText.text),candidates=[fold,...(fold.file_frames??[])];
  const spatial=candidates.find(frame=>Array.isArray(frame.vertices_coords)&&frame.vertices_coords.some(point=>Array.isArray(point)&&point.length===3));
  check(!!spatial&&spatial.vertices_coords.length>=6,'导出的 FOLD 保留三维顶点与网格');
  check(spatial.vertices_coords.every(point=>point.length===3&&point.every(Number.isFinite)),'导出的三维顶点均为有限数');
  check(spatial.vertices_coords.some(point=>Math.abs(point[2])>1e-3),'导出的当前状态确实离开原纸面');
  check(Array.isArray(spatial.edges_vertices)&&spatial.edges_vertices.length>=7,'导出的三维 FOLD 保留折线拓扑');

  const svgDownload=page.waitForEvent('download');await button('导出当前 SVG').click();
  const svgFile=await svgDownload;await svgFile.saveAs('output/playwright/simulation-workspace.svg');
  check((await svgFile.failure())===null,'当前 SVG 文件下载成功');
  const svg=await canvas().evaluate(async()=>await window.__simulationExports.items.at(-1));
  check(svg.text.includes('<svg')&&/<(?:path|polygon|line)\b/.test(svg.text),'导出的 SVG 含真实矢量纸面或折线');

  for(const [name,extension,pattern] of [['导出 OBJ 网格','obj',/^f \d+\/\/\d+ \d+\/\/\d+ \d+\/\/\d+$/m],['导出 STL 网格','stl',/facet normal [-+\d.eE ]+/]]){
   const download=page.waitForEvent('download');await button(name).click();
   const file=await download;await file.saveAs(`output/playwright/simulation-workspace.${extension}`);
   check((await file.failure())===null,`${extension.toUpperCase()} 网格下载成功`);
   const exported=await canvas().evaluate(async()=>await window.__simulationExports.items.at(-1));
   check(pattern.test(exported.text),`${extension.toUpperCase()} 包含当前三角面与法向`);
  }
  const pngDownload=page.waitForEvent('download');await button('导出当前 PNG').click();
  const pngFile=await pngDownload;await pngFile.saveAs('output/playwright/simulation-workspace.png');
  check((await pngFile.failure())===null,'当前 PNG 文件下载成功');
  const png=await canvas().evaluate(async()=>await window.__simulationExports.items.at(-1));
  check(png.size>1000&&png.header.join(',')==='137,80,78,71,13,10,26,10','PNG 文件头有效且画面非空');
  await button('柔软').click();
  check(await button('柔软').getAttribute('aria-pressed')==='true','材质预设即时同步到控制状态');
  await page.waitForFunction(()=>{
   const data=document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset;
   return data?.creaseStiffness==='0.4'&&data.damping==='0.7';
  });
  check(true,'材质参数即时传入数值求解器');
  await button('常规').click();

  await page.locator('iframe[title="三维折叠模拟画布"]').evaluate(element=>{element.src='/simulator/index.html?backend=cpu';});
  await waitState('ready');
  await button('载入当前折痕').click();
  await page.waitForFunction(()=>document.querySelector('iframe[title="三维折叠模拟画布"]')?.contentDocument?.querySelector('#simulation')?.dataset.backend==='cpu');
  check((await state()).backend==='cpu','同一工程可切换到 CPU 兼容求解后端');
  await setPercent(50);await waitSteps(0);
  const cpuPngDownload=page.waitForEvent('download');await button('导出当前 PNG').click();
  const cpuPng=await cpuPngDownload;await cpuPng.saveAs('output/playwright/simulation-workspace-cpu.png');
  check((await cpuPng.failure())===null,'CPU 绘图路径也可导出 PNG');

  // Start another target while the iframe is mounted, then load invalid input.
  const beforeInvalid=(await state()).steps;
  await setPercent(70);
  await waitSteps(beforeInvalid);
  const invalid={format:'zhezhi-workbench',version:2,schemaVersion:2,name:'未知折角追加',paper:{width:200,height:100},segments:[segment('unknown',[150,0],[150,100],'V',null)]};
  await upload('追加导入折痕文件',invalid);
  await page.locator('.sim-stale').waitFor();
  check((await page.locator('.sim-stale').innerText()).includes('折痕已修改'),'工作区标明旧模拟已过期');
  await button('载入当前折痕').click();
  await waitState('error');
  const rejected=await state();
  check(rejected.backend===''&&rejected.steps===0,'无效新输入清除旧求解后端与旧步数');
  check((await page.locator('aside').innerText()).includes('目标角未知'),'无效目标角给出中文错误而不标为已载入');
  await page.waitForTimeout(350);
  check((await state()).steps===0,'载入失败后旧动画不再推进');
  await page.screenshot({path:'output/playwright/simulation-workspace-complete.png'});
  return {passed:checks.length,checks,backend:rejected.backend,displayModes,views};
 }finally{
  await page.evaluate(()=>{
   if(window.__simulationOriginalConfirm){window.confirm=window.__simulationOriginalConfirm;delete window.__simulationOriginalConfirm;}
  });
  await canvas().evaluate(()=>{if(window.__simulationExports){URL.createObjectURL=window.__simulationExports.original;delete window.__simulationExports;}}).catch(()=>{});
 }
}
