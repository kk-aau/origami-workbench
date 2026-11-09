async (page) => {
 const results=[],check=(ok,msg)=>{if(!ok)throw Error(msg);results.push(msg);};
 const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
 const equal=(a,b,msg)=>check(stable(a)===stable(b),msg);
 await page.setViewportSize({width:1440,height:1000});
 const initialClose=page.getByRole('button',{name:'关闭窗口',exact:true});if(await initialClose.count())await initialClose.click();
 const keep=page.getByRole('button',{name:'保留当前工程',exact:true});if(await keep.count())await keep.click();
 const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const save=async()=>{await page.getByRole('button',{name:'保存工程',exact:true}).click();await page.locator('.save-dot.saved').waitFor();};
 const snapshot=async()=>{await save();return page.evaluate(async()=>{const name=document.querySelector('[aria-label="工程名称"]').value;const {projects}=await(await fetch('/api/projects')).json();const p=projects.find(p=>p.name===name);return(await(await fetch('/api/projects/'+p.id)).json()).doc;});};
 const input=page.getByLabel('折痕工程文件',{exact:true});
 const importText=async text=>{await input.evaluate((el,text)=>{const dt=new DataTransfer();dt.items.add(new File([text],'workflow.zhezhi.json',{type:'application/json'}));el.files=dt.files;el.dispatchEvent(new Event('change',{bubbles:true}));},text);await settle();};
 const click=async p=>{const q=await page.locator('svg.crease-canvas').evaluate((el,p)=>{const q=new DOMPoint(...p).matrixTransform(el.getScreenCTM());return[q.x,q.y];},p);await page.mouse.click(...q);await settle();};
 await save();await page.getByRole('button',{name:'工程库',exact:true}).click();await page.getByRole('button',{name:/空白纸张/}).click();
 const name='完整流程验收-'+Date.now();await page.getByLabel('工程名称',{exact:true}).fill(name);
 await page.getByRole('button',{name:'适合画布',exact:true}).click();
 await page.locator('button[data-tool=rabbitear]').click();
 for(const p of [[25,25],[175,25],[25,175]])await click(p);
 await page.locator('.dock-line-presets').getByRole('button',{name:'谷折',exact:true}).click();
 await page.getByRole('button',{name:'确认兔耳构造',exact:true}).click();
 const constructed=await snapshot();check(constructed.segments.filter(s=>s.assignment==='V').length===3,'真实点击完成兔耳三条谷线');
 await page.getByRole('button',{name:'撤销',exact:true}).click();check(await page.locator('[data-segment]').count()===4,'构造一次撤销只剩纸张边界');
 await page.getByRole('button',{name:'重做',exact:true}).click();equal(await snapshot(),constructed,'重做完整恢复线段 ID、坐标和山谷');
 // Mixed angles and drawing objects exercise the full native document, including values absent from default constructions.
 const mixed=JSON.parse(JSON.stringify(constructed));mixed.segments.filter(s=>s.assignment==='V').forEach((s,i)=>{s.angle=[0,null,-72][i];if(i===2)s.assignment='M';});
 mixed.objects=[{id:'workflow-circle',kind:'circle',center:[150,150],radius:20,color:'#8052ad'},{id:'workflow-text',kind:'text',position:[100,180],text:'中文注释 <>&',fontSize:5,color:'#224466'},{id:'workflow-mark',kind:'mark',a:[140,140],b:[160,160],color:'#337755'}];
 mixed.metadata={workflow:{description:'山谷、零角、未知角、圆、文字、标记保留'}};
 await importText(JSON.stringify({format:'zhezhi-workbench',version:2,...mixed}));equal(await snapshot(),mixed,'混合折角、对象和元数据导入后完整保存');
 await page.getByLabel('工程名称',{exact:true}).fill(name+'-修改');
 await importText('{invalid');check((await page.locator('body').innerText()).includes('JSON 格式无效'),'损坏文件显示明确错误');
 check(await page.getByLabel('工程名称',{exact:true}).inputValue()===name+'-修改','导入失败保留当前未保存修改');
 await page.getByRole('button',{name:'撤销',exact:true}).click();equal(await snapshot(),mixed,'导入失败保留原有撤销历史');
 await page.getByRole('button',{name:'工程库',exact:true}).click();await page.getByRole('button',{name:/空白纸张/}).click();await save();
 await page.getByRole('button',{name:'工程库',exact:true}).click();await page.locator('.project-list button').filter({has:page.locator('strong',{hasText:name})}).first().click();
 equal(await snapshot(),mixed,'切换空白工程再从工程库打开，内容无损');check(await page.getByRole('button',{name:'撤销',exact:true}).isDisabled(),'跨工程不沿用上个工程的撤销历史');
 await page.getByRole('button',{name:'导出作品',exact:true}).click();await page.getByRole('combobox',{name:'输出格式',exact:true}).selectOption('json');
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'导出文件',exact:true}).click();const file=await downloaded;
 await file.saveAs('output/playwright/workflow-roundtrip.zhezhi.json');check(file.suggestedFilename().endsWith('.zhezhi.json'),'下载完整工程原生文件');
 const close=page.getByRole('button',{name:'关闭窗口',exact:true});if(await close.count())await close.click();
 await input.setInputFiles('output/playwright/workflow-roundtrip.zhezhi.json');await settle();equal(await snapshot(),mixed,'实际下载的工程文件重新打开无损');
 await page.reload();await page.getByRole('button',{name:'恢复工作',exact:true}).click();equal(await snapshot(),mixed,'刷新后恢复副本保留完整内容');
 await page.screenshot({path:'output/playwright/project-workflow-complete.png'});
 return {passed:results.length,results};
}

