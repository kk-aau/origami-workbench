async page=>{
 const results=[],check=(ok,msg)=>{if(!ok)throw Error(msg);results.push(msg);};
 const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
 const eq=(a,b,msg)=>check(stable(a)===stable(b),msg);
 await page.setViewportSize({width:1440,height:1000});
 const keep=page.getByRole('button',{name:'保留当前工程',exact:true});if(await keep.count())await keep.click();
 const button=name=>page.getByRole('button',{name,exact:true});
 const close=async()=>{if(await button('关闭工具设置').count())await button('关闭工具设置').click();};
 const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const save=async()=>{await close();await button('保存工程').click();await page.locator('.save-dot.saved').waitFor();};
 const stored=async()=>{await save();return page.evaluate(async()=>{const name=document.querySelector('[aria-label="工程名称"]').value;const {projects}=await(await fetch('/api/projects')).json();return(await(await fetch('/api/projects/'+projects.find(p=>p.name===name).id)).json()).doc;});};
 const xy=p=>page.locator('svg.crease-canvas').evaluate((el,p)=>{const q=new DOMPoint(...p).matrixTransform(el.getScreenCTM());return[q.x,q.y];},p);
 const click=async p=>{await page.mouse.click(...await xy(p));await settle();};
 const tool=async id=>{await close();await page.locator('button[data-tool='+id+']').click();await settle();};
 const number=async(name,value)=>{const el=page.getByRole('spinbutton',{name,exact:true});await el.fill(String(value));await el.press('Enter');await settle();};
 const s=(id,a,b,assignment='B',angle=0)=>({id,a,b,assignment,angle});
 const seed=[s('top',[0,0],[200,0]),s('right',[200,0],[200,200]),s('bottom',[200,200],[0,200]),s('left',[0,200],[0,0]),s('crease',[25,50],[75,50],'M',-72)];
 async function fixture(){
  await close();await page.keyboard.press('Escape');await save();const name='编辑验收-'+Date.now();
  await page.getByLabel('折痕工程文件',{exact:true}).evaluate((el,doc)=>{const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(doc)],'editing.json',{type:'application/json'}));el.files=dt.files;el.dispatchEvent(new Event('change',{bubbles:true}));},{format:'zhezhi-workbench',version:2,schemaVersion:2,name,paper:{width:200,height:200},segments:seed,objects:[]});
  await page.waitForFunction(name=>document.querySelector('[aria-label="工程名称"]').value===name,name);
  await button('适合画布').click();await page.getByRole('combobox',{name:'网格范围',exact:true}).selectOption('paper');await number('网格等分',8);await tool('select');await page.getByRole('checkbox',{name:'保护边界',exact:true}).check();
 }
 await fixture();await click([50,50]);await button('选区 (1)').click();await number('目标角绝对值',35);
 check((await stored()).segments.find(s=>s.id==='crease').angle===-35,'属性角度按山折保存负值');
 await button('选区 (1)').click();await button('设为未知角度').click();check((await stored()).segments.find(s=>s.id==='crease').angle===null,'属性支持未知角度');
 await button('选区 (1)').click();await number('目标角绝对值',0);await button('仅互换所选山谷').click();
 let doc=await stored();check(doc.segments.find(s=>s.id==='crease').assignment==='V'&&doc.segments.find(s=>s.id==='crease').angle===0,'互换山谷保留零角');
 await button('选区 (1)').click();await number('终点 X',100);check((await stored()).segments.find(s=>s.id==='crease').b[0]===100,'坐标属性修改写入几何');
 await button('撤销').click();check((await stored()).segments.find(s=>s.id==='crease').b[0]===75,'坐标修改可撤销');
 await button('选区 (1)').click();await number('目标角绝对值',181);check(await page.getByRole('spinbutton',{name:'目标角绝对值',exact:true}).getAttribute('aria-invalid')==='true','超范围折角被拒绝');
 check((await stored()).segments.find(s=>s.id==='crease').angle===0,'无效属性不污染作品');
 await button('剪贴板').click();await button('复制选中').click();await number('偏移 X',50);await number('偏移 Y',25);await button('偏移粘贴').click();
 doc=await stored();const pasted=doc.segments.find(s=>s.id.startsWith('paste-'));check(pasted?.assignment==='V'&&pasted.angle===0,'剪贴板保留类型和零角');eq(pasted.a,[75,75],'偏移粘贴世界坐标正确');
 await button('撤销').click();check((await stored()).segments.length===5,'粘贴可整组撤销');await button('重做').click();eq(await stored(),doc,'粘贴重做完整恢复');
 await fixture();await tool('circle');await click([100,100]);await click([125,100]);doc=await stored();check(doc.objects.length===1&&doc.objects[0].radius===25,'实际绘制辅助圆');
 await tool('circleedit');await click([125,100]);await number('圆半径',30);check((await stored()).objects[0].radius===30,'圆编辑半径立即保存');
 await button('删除此圆').click();check((await stored()).objects.length===0,'删除辅助圆');await button('撤销').click();check((await stored()).objects[0].radius===30,'圆删除一次撤销');
 await tool('text');await click([25,150]);await page.getByRole('textbox',{name:'注释内容',exact:true}).fill('中文注释\n第二行 <>&');
 check((await stored()).objects.filter(o=>o.kind==='text').length===0,'文字草稿不写入工程');await button('应用文字').click();
 doc=await stored();check(doc.objects.some(o=>o.kind==='text'&&o.text==='中文注释\n第二行 <>&'),'多行中文文字完整应用');
 await click([100,150]);await page.getByRole('textbox',{name:'注释内容',exact:true}).fill('应取消');await page.keyboard.press('Escape');eq(await stored(),doc,'文字输入框内 Esc 取消草稿');
 await tool('mark');await click([150,100]);await click([175,125]);doc=await stored();check(doc.objects.filter(o=>o.kind==='mark').length===1,'独立标记可绘制');await button('撤销').click();check((await stored()).objects.filter(o=>o.kind==='mark').length===0,'标记可撤销');
 await button('底图').click();await page.getByLabel('加载底图文件',{exact:true}).evaluate(async el=>{const canvas=document.createElement('canvas');canvas.width=4;canvas.height=2;const ctx=canvas.getContext('2d');ctx.fillStyle='#28aacc';ctx.fillRect(0,0,4,2);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const dt=new DataTransfer();dt.items.add(new File([blob],'验收底图.png',{type:'image/png'}));el.files=dt.files;el.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.getByRole('checkbox',{name:'显示底图',exact:true}).waitFor();await number('底图不透明度',45);await page.getByRole('checkbox',{name:'底图随画布移动与缩放',exact:true}).uncheck();
 doc=await stored();check(doc.background?.opacity===.45&&!!doc.background.viewport,'底图保留不透明度和屏幕固定状态');
 await button('底图').click();await button('移除底图').click();check(!(await stored()).background,'底图可以移除');await button('撤销').click();eq((await stored()).background,doc.background,'底图撤销完整恢复原图与位置');
 // Cutting with protected edges must put only the removed geometry on the clipboard.
 await fixture();await page.getByRole('checkbox',{name:'保护边界',exact:true}).uncheck();await button('全选').click();await page.getByRole('checkbox',{name:'保护边界',exact:true}).check();
 await button('剪贴板').click();await button('剪切选中').click();check((await stored()).segments.length===4,'剪切保留受保护边界');
 await button('剪贴板').click();await number('偏移 X',0);await number('偏移 Y',25);await button('偏移粘贴').click();doc=await stored();check(doc.segments.filter(s=>s.assignment==='B').length===4&&doc.segments.length===5,'受保护边界不应偷偷进入剪切剪贴板');
 await page.screenshot({path:'output/playwright/editing-completion.png'});return {passed:results.length,results};
}
