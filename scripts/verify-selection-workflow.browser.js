async page=>{
 const results=[],check=(ok,msg)=>{if(!ok)throw Error(msg);results.push(msg);};
 const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
 const eq=(a,b,msg)=>check(stable(a)===stable(b),msg);
 await page.setViewportSize({width:1440,height:1000});
 const keep=page.getByRole('button',{name:'保留当前工程',exact:true});if(await keep.count())await keep.click();
 const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const xy=p=>page.locator('svg.crease-canvas').evaluate((el,p)=>{const q=new DOMPoint(...p).matrixTransform(el.getScreenCTM());return[q.x,q.y];},p);
 const click=async p=>{await page.mouse.click(...await xy(p));await settle();};
 const tool=async id=>{await page.locator('button[data-tool='+id+']').click();await settle();};
 const save=async()=>{await page.getByRole('button',{name:'保存工程',exact:true}).click();await page.locator('.save-dot.saved').waitFor();};
 const stored=async()=>{await save();return page.evaluate(async()=>{const name=document.querySelector('[aria-label="工程名称"]').value;const {projects}=await(await fetch('/api/projects')).json();return(await(await fetch('/api/projects/'+projects.find(p=>p.name===name).id)).json()).doc;});};
 const s=(id,a,b,assignment='B',angle=0)=>({id,a,b,assignment,angle});
 const boundary=[s('top',[0,0],[200,0]),s('right',[200,0],[200,200]),s('bottom',[200,200],[0,200]),s('left',[0,200],[0,0])];
 const sources=[s('m-null',[25,25],[50,25],'M',null),s('v-zero',[25,50],[50,50],'V',0),s('m-angle',[25,75],[50,75],'M',-72)];
 const scope=page.getByRole('combobox',{name:'网格范围',exact:true});
 async function fixture(extra=[]){
  await page.keyboard.press('Escape');await save();const name='选区流程-'+Date.now();
  const doc={format:'zhezhi-workbench',version:2,schemaVersion:2,name,paper:{width:200,height:200},segments:[...boundary,...sources,...extra],objects:[]};
  await page.getByLabel('折痕工程文件',{exact:true}).evaluate((el,doc)=>{const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(doc)],'selection.json',{type:'application/json'}));el.files=dt.files;el.dispatchEvent(new Event('change',{bubbles:true}));},doc);
  await page.waitForFunction(name=>document.querySelector('[aria-label="工程名称"]').value===name,name);
  await scope.selectOption('paper');const n=page.getByRole('spinbutton',{name:'网格等分',exact:true});await n.fill('8');await n.press('Enter');
  await page.getByRole('checkbox',{name:/保护边界/}).check();
  await page.getByRole('button',{name:'适合画布',exact:true}).click();await tool('select');await page.getByRole('button',{name:'全选',exact:true}).click();await settle();
 }
 const geometry=ss=>ss.map(s=>[s.a,s.b].map(p=>p.map(n=>Math.round(n*1e6)/1e6).join(',')).sort().join(':')).sort();
 for(const id of ['copyselection','moveselection','copyfour','movefour','mirrorselection']){
  await fixture();await page.getByRole('checkbox',{name:'操作后保持选择',exact:true}).check();const before=await stored();await tool(id);
  if(id==='mirrorselection'){
   await click([100,0]);await click([100,200]);
   check(await page.locator('[data-mirror-preview=ready]').count()===3,'镜像显示三条待确认线');eq(await stored(),before,'镜像确认前不修改作品');
   await page.getByRole('button',{name:'确认镜像',exact:true}).click();
  }else{
   const points=id.endsWith('four')?[[0,0],[200,0],[0,200],[0,0]]:[[25,25],[100,25]];
   for(const p of points.slice(0,-1))await click(p);
   await page.mouse.move(...await xy(points.at(-1)));await settle();check(await page.locator('[data-transform-preview]').count()===3,id+'预览三条选中线');
   eq(await stored(),before,id+'预览不写入工程');await click(points.at(-1));
  }
  const after=await stored(),copies=after.segments.filter(s=>!before.segments.some(v=>v.id===s.id));
  check(copies.length===3,id+'提交三条结果线');
  eq(copies.map(s=>[s.assignment,s.angle]),sources.map(s=>[s.assignment,s.angle]),id+'保留山谷、零角、未知角和自定义角');
  const map=id==='mirrorselection'?p=>[200-p[0],p[1]]:id.endsWith('four')?p=>[p[1],200-p[0]]:p=>[p[0]+75,p[1]];
  eq(geometry(copies),geometry(sources.map(s=>({...s,a:map(s.a),b:map(s.b)}))),id+'结果坐标符合变换');
  check(after.segments.length===(id.startsWith('move')?7:10),id+'正确保留或移除原线');
  await page.getByRole('button',{name:'撤销',exact:true}).click();eq(await stored(),before,id+'整组撤销恢复完整文档');
  await page.getByRole('button',{name:'重做',exact:true}).click();eq(await stored(),after,id+'重做恢复完整文档');
 }
 await fixture();await tool('mirrorselection');await scope.selectOption('off');await click([100,100]);
 check(await page.locator('[data-mirror-source]').count()===0,'关闭网格后镜像不接受空白网格点');
 await scope.selectOption('canvas');await click([-25,100]);check(await page.locator('[data-mirror-source]').count()===3,'全画布网格允许纸外可见点定轴');
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'全选',exact:true}).click();await scope.selectOption('paper');
 const n=page.getByRole('spinbutton',{name:'网格等分',exact:true});await n.fill('128');await n.press('Enter');
 for(let i=0;i<3;i++)await page.getByRole('button',{name:'缩小画布',exact:true}).click();
 await click([100,100]);check(await page.locator('[data-mirror-source]').count()===0,'缩放隐藏网格后镜像不接受虚拟点');
 await click([0,0]);check(await page.locator('[data-mirror-source]').count()===3,'隐藏网格仍可用已有端点定轴');
 await page.keyboard.press('Escape');
 await fixture([s('h1',[75,75],[125,75]),s('h2',[125,75],[125,125]),s('h3',[125,125],[75,125]),s('h4',[75,125],[75,75])]);
 await tool('mirrorselection');await click([100,100]);check(await page.locator('[data-mirror-source]').count()===0,'纸内网格不接受孔洞中的镜像轴点');
 await scope.selectOption('canvas');await click([100,100]);check(await page.locator('[data-mirror-source]').count()===3,'全画布模式接受孔洞内可见镜像轴点');
 await page.keyboard.press('Escape');check(await page.locator('[data-mirror-source]').count()===0,'Esc 清除未提交镜像');
 await fixture([s('conflict',[100,25],[125,25],'V',180)]);await tool('select');
 await page.getByRole('button',{name:'全部撤选',exact:true}).click();await click([37.5,25]);const unchanged=await stored();
 await tool('moveselection');await click([25,25]);await click([100,25]);
 check((await page.locator('.canvas-pane').innerText()).includes('线型或折角不同'),'移动到异型重合线明确报错');eq(await stored(),unchanged,'冲突移动不移除原线且不产生半成品');
 await page.keyboard.press('Escape');await save();await page.screenshot({path:'output/playwright/selection-workflow-complete.png'});
 return {passed:results.length,results};
}
