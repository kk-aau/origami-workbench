async page=>{
 const recipes=[
  {
    "name": "source",
    "kind": "cut",
    "indices": [
      6
    ],
    "segmentIds": [
      "curve-group-1::crease-0"
    ]
  },
  {
    "name": "cut",
    "kind": "join",
    "pairs": [
      {
        "first": "curve-group-1::crease-0",
        "second": "curve-group-2::crease-0",
        "assignment": "F"
      }
    ]
  },
  {
    "name": "stale",
    "kind": "join",
    "pairs": [
      {
        "first": "curve-group-1::crease-0",
        "second": "curve-group-1::crease-0::cut-bank-1",
        "assignment": "F"
      }
    ]
  },
  {
    "name": "original",
    "kind": "cut",
    "indices": [
      11
    ],
    "segmentIds": [
      "material-edge-11"
    ]
  }
];const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};await page.evaluate(()=>{window.confirm=()=>true;});await page.setViewportSize({width:1280,height:800});
 const button=name=>['撤销','重做'].includes(name)?page.getByRole('complementary',{name:'绘图工具',exact:true}).getByRole('button',{name,exact:true}):page.getByRole('button',{name,exact:true}),closeProps=async()=>{if(await button('关闭工具设置').count())await button('关闭工具设置').click();},title=kind=>kind==='cut'?'切开材料折痕':'粘合材料边界',apply=kind=>kind==='cut'?'应用材料切口':'应用材料粘合',preview=kind=>kind==='cut'?'预览切口':'预览粘合';
 const load=async name=>{await closeProps();await button('折痕编辑').click();await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`output/playwright/material-transform-model-topology-regression-${name}-initial-1009.zhezhi.json`);await page.waitForFunction(n=>document.querySelector('[aria-label="工程名称"]')?.value===n,`参数切合-${name}`);};
 const open=async name=>{await closeProps();await button('绘图工具').click();await page.getByRole('button',{name:/^(纸张属性|选区 \(\d+\))$/}).click();await button(name).click();return page.getByRole('dialog',{name,exact:true});},field=async(c,label,n)=>{await c.getByLabel(label,{exact:true}).fill(String(n));await c.getByLabel(label,{exact:true}).press('Enter');};
 const download=async(name,formats=['json','fold','dxf'])=>{await closeProps();for(const format of formats){await button('导出作品').click();const d=page.getByRole('dialog',{name:'导出作品',exact:true});await d.getByRole('combobox').first().selectOption(format);const saving=page.waitForEvent('download');await d.getByRole('button',{name:'导出文件',exact:true}).click();await(await saving).saveAs(`output/playwright/material-transform-model-topology-regression-${name}-1009.${format==='json'?'zhezhi.json':format}`);await button('关闭窗口').click();}};
 const calculate=async(c,kind,label)=>{await c.getByRole('button',{name:preview(kind),exact:true}).click();check(await c.getByRole('alert').count()===0,label+' 预览通过');check(await c.getByRole('button',{name:apply(kind),exact:true}).isEnabled(),label+' 可采用完整材料');};
 for(const r of recipes){await load(r.name);let c=await open(title(r.kind));check(await c.getByLabel(r.kind==='cut'?'切开保存参数':'粘合保存参数',{exact:true}).isChecked(),r.name+' 默认保存参数');if(r.name==='stale')check((await c.locator('.note').innerText()).includes('旧配方保留归档'),'粘合新模型归档说明可见');if(r.kind==='cut'){for(const index of r.indices)await c.getByLabel(`切开内边 E${index+1}`,{exact:true}).check();}else{await c.getByLabel('粘合 1 第一侧',{exact:true}).selectOption(r.pairs[0].first);await c.getByLabel('粘合 1 第二侧',{exact:true}).selectOption(r.pairs[0].second);}await calculate(c,r.kind,r.name);await c.getByRole('button',{name:apply(r.kind),exact:true}).click();await download(r.name+'-saved');let manager=await open('参数构造组');check(await manager.getByRole('alert').count()===0,r.name+' 独立重放模型通过');const index=r.name==='source'?2:r.name==='cut'?3:1;await manager.getByLabel(`编辑参数组 ${index}`,{exact:true}).click();c=page.getByRole('dialog',{name:title(r.kind),exact:true});check((await c.innerText()).includes('修改此组并重算后续构造'),r.name+' 重开对应操作');await calculate(c,r.kind,r.name+'回填');await c.getByRole('button',{name:'取消',exact:true}).click();await button('关闭镶嵌窗口').click();}
 await load('joined');let manager=await open('参数构造组');check((await manager.locator('tbody').innerText()).includes('切开')&&(await manager.locator('tbody').innerText()).includes('粘合'),'切开粘合在混合表可见');await manager.getByLabel('编辑参数组 1',{exact:true}).click();let c=page.getByRole('dialog',{name:'编辑材料折痕',exact:true});await field(c,'起点沿边比例',60);await field(c,'终点沿边比例',40);await c.getByRole('button',{name:'预览材料编辑',exact:true}).click();check(await c.getByRole('button',{name:'应用材料编辑',exact:true}).isEnabled(),'修改前组同时重算切开与粘合');await c.getByRole('button',{name:'取消',exact:true}).click();await button('关闭镶嵌窗口').click();await download('cancel');manager=await open('参数构造组');await manager.getByLabel('编辑参数组 1',{exact:true}).click();c=page.getByRole('dialog',{name:'编辑材料折痕',exact:true});await field(c,'起点沿边比例',60);await field(c,'终点沿边比例',40);await c.getByRole('button',{name:'预览材料编辑',exact:true}).click();await c.getByRole('button',{name:'应用材料编辑',exact:true}).click();await download('joined-changed');await button('撤销').click();await download('undo');await button('重做').click();await download('redo');check(true,'切合重算一次撤销重做');
 for(const ext of ['zhezhi.json','fold']){await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`output/playwright/material-transform-model-topology-regression-joined-changed-1009.${ext}`);manager=await open('参数构造组');await manager.getByLabel('编辑参数组 3',{exact:true}).click();c=page.getByRole('dialog',{name:'粘合材料边界',exact:true});await c.getByLabel('粘合 1 连接线型',{exact:true}).selectOption('M');await calculate(c,'join',ext+'粘合改山折');await page.screenshot({path:`output/playwright/material-transform-model-topology-regression-${ext==='fold'?'fold':'json'}-join-edit-1009.png`});await c.getByRole('button',{name:'应用材料粘合',exact:true}).click();await download(ext==='fold'?'fold-reedited':'json-reedited');}
 manager=await open('参数构造组');await manager.getByLabel('预览删除参数组 2',{exact:true}).click();check(await manager.getByRole('alert').count()===1&&await manager.getByRole('button',{name:'应用删除',exact:true}).isDisabled(),'删除被粘合依赖的切开组整次拒绝');await button('关闭镶嵌窗口').click();await download('failure-cancel');manager=await open('参数构造组');await manager.getByLabel('预览删除参数组 3',{exact:true}).click();check(await manager.getByRole('button',{name:'应用删除',exact:true}).isEnabled(),'删除粘合先预览真实独立切口');await manager.getByRole('button',{name:'应用删除',exact:true}).click();await download('join-removed');manager=await open('参数构造组');await manager.getByLabel('预览删除参数组 2',{exact:true}).click();await manager.getByRole('button',{name:'应用删除',exact:true}).click();await download('cut-removed');
 await load('cut-ray');manager=await open('参数构造组');await manager.getByLabel('编辑参数组 1',{exact:true}).click();c=page.getByRole('dialog',{name:'编辑材料折痕',exact:true});await field(c,'起点沿边比例',60);await field(c,'终点沿边比例',40);await c.getByRole('button',{name:'预览材料编辑',exact:true}).click();check(await c.getByRole('button',{name:'应用材料编辑',exact:true}).isEnabled(),'第二切口侧射线随前组移动后可重算');await c.getByRole('button',{name:'应用材料编辑',exact:true}).click();await download('cut-ray-changed');
 for(const [name,index,kind] of [['cut',2,'cut'],['joined',3,'join']]){await load(name);manager=await open('参数构造组');await manager.getByLabel(`编辑参数组 ${index}`,{exact:true}).click();c=page.getByRole('dialog',{name:title(kind),exact:true});for(const width of [1000,800,390]){await page.setViewportSize({width,height:720});check(await c.evaluate(e=>e.scrollHeight<=e.clientHeight+1&&e.scrollWidth<=e.clientWidth+1),`${width} ${kind}编辑无窗口滚动`);}await page.screenshot({path:`output/playwright/material-transform-model-topology-regression-${kind}-390-1009.png`});await c.getByRole('button',{name:'取消',exact:true}).click();await button('关闭镶嵌窗口').click();}
 await load('eight');manager=await open('参数构造组');check(await manager.locator('tbody tr').count()===8,'八组切合操作完整可见');for(const width of [1000,800,390]){await page.setViewportSize({width,height:720});check(await manager.evaluate(e=>e.scrollHeight<=e.clientHeight+1&&e.scrollWidth<=e.clientWidth+1),`${width} 八组切合管理无窗口滚动`);}await button('关闭镶嵌窗口').click();await page.setViewportSize({width:1280,height:800});check(errors.length===0,'零页面异常');return {passed:checks.length,checks,errors};
}
