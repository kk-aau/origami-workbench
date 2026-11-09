async (page) => {
 const checks=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
 await page.evaluate(()=>{window.confirm=()=>true;window.__exports=[];const create=window.__nativeCreateURL??=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{if(blob instanceof Blob)blob.text().then(text=>window.__exports.push(text));return create(blob);};});
 const upload=async(doc)=>{await page.evaluate(doc=>{const input=document.querySelector('input[aria-label="折痕工程文件"]');const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify({format:'zhezhi-workbench',version:2,...doc})],'grid.zhezhi.json',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));},doc);await page.waitForFunction(name=>document.querySelector('input[aria-label="工程名称"]').value===name,doc.name);};
 const small={schemaVersion:2,name:'网格界面验收',objects:[],paper:{width:200,height:200},segments:[
  {id:'b0',a:[0,0],b:[200,0],assignment:'B',angle:0},{id:'b1',a:[200,0],b:[200,200],assignment:'B',angle:0},
  {id:'b2',a:[200,200],b:[0,200],assignment:'B',angle:0},{id:'b3',a:[0,200],b:[0,0],assignment:'B',angle:0},
  {id:'crease',a:[50,75],b:[150,125],assignment:'V',angle:180}
 ]};
 if(await page.getByRole('button',{name:'保留当前工程',exact:true}).count())await page.getByRole('button',{name:'保留当前工程',exact:true}).click();
 if(await page.getByRole('button',{name:'关闭窗口',exact:true}).count())await page.getByRole('button',{name:'关闭窗口',exact:true}).click();
 await upload(small);
 await page.getByRole('button',{name:'纸张属性',exact:true}).click();
 await page.getByLabel('宽度',{exact:true}).fill('320');await page.getByLabel('宽度',{exact:true}).press('Enter');
 await page.getByLabel('高度',{exact:true}).fill('120');await page.getByLabel('高度',{exact:true}).press('Enter');
 await page.getByRole('button',{name:'关闭工具设置',exact:true}).click();
 const grid=page.locator('svg.crease-canvas pattern').first();
 check(+await grid.getAttribute('width')===40&&+await grid.getAttribute('height')===15,'矩形尺寸修改后网格为40×15');
 const coords=await page.locator('[data-segment="crease"] [data-crease-stroke]').evaluate(el=>['x1','y1','x2','y2'].map(k=>+el.getAttribute(k)));
 check(JSON.stringify(coords)==='[80,45,240,75]','已有折痕与新的格点对齐');
 await page.getByRole('button',{name:'撤销',exact:true}).click();check(+await grid.getAttribute('height')===25,'撤销高度恢复纵向格距');
 await page.getByRole('button',{name:'重做',exact:true}).click();check(+await grid.getAttribute('height')===15,'重做恢复矩形网格');
 await page.getByRole('button',{name:'线段',exact:true}).click();
 const screen=async(x,y)=>page.locator('svg.crease-canvas').evaluate((svg,q)=>{const p=svg.createSVGPoint();p.x=q[0];p.y=q[1];const s=p.matrixTransform(svg.getScreenCTM());return {x:s.x,y:s.y};},[x,y]);
 for(const q of [[83,32],[197,32]]){const p=await screen(...q);await page.mouse.click(p.x,p.y);}
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-crease-stroke]')).some(el=>el.getAttribute('x1')==='80'&&el.getAttribute('y1')==='30'&&el.getAttribute('x2')==='200'&&el.getAttribute('y2')==='30'));
 check(true,'矩形网格绘制吸附横纵格点正确');
 await page.getByRole('button',{name:'导出作品',exact:true}).click();await page.getByRole('combobox',{name:'输出格式',exact:true}).selectOption('cp');
 check(await page.getByLabel('CP 坐标',{exact:true}).inputValue()==='paper','CP默认对齐原工具坐标');
 await page.getByRole('button',{name:'导出文件',exact:true}).click();await page.waitForFunction(()=>window.__exports.length===1);
 const normalized=await page.evaluate(()=>window.__exports[0].trim().split('\n').map(s=>s.split(/\s+/).map(Number)));
 check(normalized.some(r=>r[0]===1&&r[1]===-200&&r[2]===-75&&r[3]===200&&r[4]===-75),'CP矩形等比居中400×150');
 await page.getByLabel('CP 坐标',{exact:true}).selectOption('original');
 await page.getByRole('button',{name:'导出文件',exact:true}).click();await page.waitForFunction(()=>window.__exports.length===2);
 const raw=await page.evaluate(()=>window.__exports[1]);check(raw.includes('3 80 45 240 75'),'CP原始坐标保持已有折痕毫米数值');
 check(+await grid.getAttribute('width')===40&&+await grid.getAttribute('height')===15,'导出未改变工程与网格');
 await page.getByRole('button',{name:'关闭窗口',exact:true}).click();
 await page.getByRole('button',{name:'帮助与版本',exact:true}).click();
 const chapters=page.getByRole('tab');check(await chapters.count()===6,'使用教程有六章');
 for(let i=0;i<6;i++){await chapters.nth(i).click();check(await chapters.nth(i).getAttribute('aria-selected')==='true'&&(await page.getByRole('tabpanel').innerText()).length>150,'教程第'+(i+1)+'章可读');}
 await page.getByRole('button',{name:'展开完整教程',exact:true}).click();check(await page.locator('.usage-tutorial article').count()===6,'可展开完整教程');
 await page.getByRole('button',{name:'按章节阅读',exact:true}).click();await chapters.nth(3).click();
 await page.screenshot({path:'output/playwright/cp-grid-tutorial-20260930.png'});
 await page.getByRole('button',{name:'关闭窗口',exact:true}).click();
 const big={...small,name:'12000条保存验收',segments:Array.from({length:12000},(_,i)=>({id:'big'+i,a:[20,i/70],b:[180,i/70],assignment:'V',angle:180}))};
 await upload(big);check(await page.locator('[data-segment]').count()===12000,'实际界面加载12000条无截断');
 await page.getByRole('button',{name:'保存工程',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.document-name small')?.textContent.startsWith('已保存'),{},{timeout:30000});
 check(true,'12000条实际界面保存成功');
 await page.getByRole('button',{name:'工程库',exact:true}).click();await page.getByRole('button',{name:/12000条保存验收.*12000 条线/}).first().click();
 check(await page.locator('[data-segment]').count()===12000,'工程库重开12000条无丢失');
 check(errors.length===0,'浏览器无运行错误');
 return {checks:checks.length,results:checks,errors};
}
