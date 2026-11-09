async (page)=>{
 const results=[],check=(ok,message)=>{if(!ok)throw Error(message);results.push(message);};
 await page.setViewportSize({width:1440,height:1000});
 const keep=page.getByRole('button',{name:'保留当前工程',exact:true});if(await keep.count())await keep.click();
 const svg=page.locator('svg.crease-canvas'),scope=page.getByRole('combobox',{name:'网格范围',exact:true});
 const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const click=async(p,button='left')=>{const q=await svg.evaluate((el,p)=>{const q=new DOMPoint(...p).matrixTransform(el.getScreenCTM());return[q.x,q.y];},p);await page.mouse.click(...q,{button});await settle();};
 const cancel=async()=>{await page.keyboard.press('Escape');await settle();};
 const tool=async id=>{await cancel();await page.locator('button[data-tool='+id+']').click();await settle();};
 const origin=()=>page.locator('[data-foldable-origin]').count();
 const points=()=>page.locator('[data-construction-point]').count();
 const save=async()=>{await page.getByRole('button',{name:'保存工程',exact:true}).click();await page.locator('.save-dot.saved').waitFor();};
 const s=(id,a,b,assignment='B',angle=0)=>({id,a,b,assignment,angle});
 const boundary=[s('top',[0,0],[200,0]),s('right',[200,0],[200,200]),s('bottom',[200,200],[0,200]),s('left',[0,200],[0,0])];
 let serial=0;
 async function divisions(n){const input=page.getByRole('spinbutton',{name:'网格等分',exact:true});await input.fill(String(n));await input.press('Enter');await settle();}
 async function fixture(extra=[]){
  await cancel();await save();const name='交互核验-'+Date.now()+'-'+ ++serial;
  const doc={format:'zhezhi-workbench',version:2,schemaVersion:2,name,paper:{width:200,height:200},segments:[...boundary,...extra],objects:[]};
  await page.getByLabel('折痕工程文件',{exact:true}).evaluate((input,doc)=>{const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(doc)],'interaction.json',{type:'application/json'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));},doc);
  await page.waitForFunction(name=>document.querySelector('input[aria-label="工程名称"]').value===name,name);
  await scope.selectOption('paper');await divisions(8);await page.getByRole('button',{name:'适合画布',exact:true}).click();await settle();
  await page.locator('.dock-line-presets').getByRole('button',{name:'山折',exact:true}).click();
 }
 await fixture();await tool('foldableinput');await click([-25,100]);check(await origin()===0,'纸内网格不接受纸外补线起点');
 await click([75,100]);check(await origin()===1,'错误后直接改选可见网格起点');
 await click([-25,100]);check(await page.locator('[data-foldable-pending]').count()===0,'纸外网格不能成为补线暂定终点');
 await click([100,100]);check(await page.locator('[data-foldable-pending]').count()===1,'保留起点后重选合法终点');
 await click([100,100]);check(await origin()===0,'确认后清空当前构造');await click([75,125]);check(await origin()===1,'同一工具可以立即开始下一条');
 await cancel();await scope.selectOption('canvas');await click([-25,100]);check(await origin()===1,'全画布模式接受纸外可见网格');
 await cancel();await scope.selectOption('off');await click([75,125]);check(await origin()===0,'关闭网格不接受空白网格起点');
 await click([0,0]);check(await origin()===1,'关闭网格仍接受已有顶点');
 await cancel();await scope.selectOption('paper');await divisions(128);
 for(let i=0;i<3;i++)await page.getByRole('button',{name:'缩小画布',exact:true}).click();
 await click([75,125]);check(await origin()===0,'缩小到隐藏网格后不接受虚拟网格点');
 await page.screenshot({path:'output/playwright/interaction-hidden-grid-fixed.png'});

 for(const id of ['alternatecollinear','eraseoverlap']){
  await fixture();await tool(id);await click([-25,100]);check(await points()===0,id+'拒绝纸外不可见起点');
  await scope.selectOption('canvas');await click([-25,100]);check(await points()===1,id+'允许全画布可见起点');
  await cancel();await scope.selectOption('off');await click([75,125]);check(await points()===0,id+'关闭网格拒绝空白点');
  await scope.selectOption('paper');await divisions(128);for(let i=0;i<3;i++)await page.getByRole('button',{name:'缩小画布',exact:true}).click();
  await click([75,125]);check(await points()===0,id+'不拾取缩放隐藏网格');
 }
 const hole=[s('h1',[75,75],[125,75]),s('h2',[125,75],[125,125]),s('h3',[125,125],[75,125]),s('h4',[75,125],[75,75])];
 await fixture(hole);
 for(const id of ['foldableinput','alternatecollinear','eraseoverlap']){
  await tool(id);await scope.selectOption('paper');await click([100,100]);check(await origin()===0&&await points()===0,id+'不接受孔洞中的纸内网格');
  await scope.selectOption('canvas');await click([100,100]);check((id==='foldableinput'?await origin():await points())===1,id+'接受全画布模式孔洞中的可见网格');
 }
 await tool('restrictedline');await scope.selectOption('canvas');await click([-25,100]);check(await points()===0,'受限线仍保持纸内网格约束');
 await click([100,100]);check(await points()===0,'受限线不接受孔洞网格');

 const rays=[0,10,185].map((a,i)=>s('ray'+i,[100,100],[100+50*Math.cos(a*Math.PI/180),100+50*Math.sin(a*Math.PI/180)],'V',72));
 await fixture(rays);await tool('foldableinput');await click([100,100]);check(await page.locator('[data-foldable-suggestion]').count()===3,'显示三个近邻补线候选');
 await click([120,100]);check(await page.locator('[data-foldable-pending]').count()===0,'等距候选不擅自选第一条');
 check((await page.locator('.canvas-pane').innerText()).includes('多个补线方向'),'歧义提示使用方向编号');
 await page.getByRole('button',{name:'方向建议 1',exact:true}).click();check(await page.getByRole('button',{name:'方向建议 1',exact:true}).getAttribute('aria-pressed')==='true','编号选择有明确选中状态');
 await page.getByRole('button',{name:'方向建议 3',exact:true}).click();check(await page.getByRole('button',{name:'方向建议 3',exact:true}).getAttribute('aria-pressed')==='true'&&await page.getByRole('button',{name:'方向建议 1',exact:true}).getAttribute('aria-pressed')==='false','编号可重选且旧状态清除');
 await click([100,125]);check(await page.getByRole('button',{name:'方向建议 3',exact:true}).getAttribute('aria-pressed')==='false','自由重选终点后清除方向选中状态');
 const before=await page.locator('[data-segment]').count();await cancel();check(await origin()===0&&(await page.locator('[data-segment]').count())===before,'候选按钮获得焦点后 Esc 仍可取消');
 await tool('foldabledraw');await click([100,100]);await click([120,100]);check(await page.locator('[data-foldable-pending]').count()===0,'自由补线同样拒绝等距候选');
 await page.getByRole('button',{name:'方向建议 1',exact:true}).click();check(await page.locator('[data-foldable-pending]').getAttribute('data-foldable-type')==='M','方向重选后自动山谷仍按已有三谷推断');
 await page.getByRole('button',{name:'确认暂定线段',exact:true}).click();await settle();check(await origin()===0&&(await page.locator('[data-segment]').count())>before,'错误重选后可正常确认生成');
 await page.getByRole('button',{name:'撤销',exact:true}).click();await settle();check((await page.locator('[data-segment]').count())===before,'候选补线一次撤销');
 await tool('localflat');await click([100,100]);await click([120,100]);
 check(await page.locator('[data-local-flat-candidate][data-chosen=true]').count()===0,'局部补线同样拒绝视觉等距候选');
 await page.getByRole('button',{name:/^补线候选 1 /}).click();check(await page.locator('[data-local-flat-candidate][data-chosen=true]').count()===1,'局部补线歧义后可通过编号重选');
 await cancel();await save();return{passed:results.length,results};
}
