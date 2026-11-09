async page=>{
 const recipes=[
  {
    "name": "move-mirrorX",
    "source": "move",
    "kind": "mirrorX"
  },
  {
    "name": "move-mirrorY",
    "source": "move",
    "kind": "mirrorY"
  },
  {
    "name": "legacy-mirrorX",
    "source": "legacy",
    "kind": "mirrorX"
  },
  {
    "name": "shared-mirrorX",
    "source": "shared",
    "kind": "mirrorX"
  },
  {
    "name": "hole-mirrorY",
    "source": "hole",
    "kind": "mirrorY"
  },
  {
    "name": "weak-mirrorX",
    "source": "weak",
    "kind": "mirrorX"
  },
  {
    "name": "chain-mirrorX",
    "source": "chain",
    "kind": "mirrorX"
  },
  {
    "name": "legacy-chain-mirrorY",
    "source": "legacy-chain",
    "kind": "mirrorY"
  }
];const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};await page.evaluate(()=>{window.confirm=()=>true;});await page.setViewportSize({width:1280,height:800});const button=name=>['撤销','重做'].includes(name)?page.getByRole('complementary',{name:'绘图工具',exact:true}).getByRole('button',{name,exact:true}):page.getByRole('button',{name,exact:true}),closeProps=async()=>{if(await button('关闭工具设置').count())await button('关闭工具设置').click();};
 const load=async name=>{await closeProps();await button('折痕编辑').click();await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`output/playwright/material-location-copy-identity-regression-${name}-initial-1009.zhezhi.json`);await page.waitForFunction(n=>document.querySelector('[aria-label="工程名称"]')?.value===n,`原面身份-${name}`);},open=async()=>{await closeProps();await button('绘图工具').click();await page.getByRole('button',{name:/^(纸张属性|选区 \(\d+\))$/}).click();await button('参数构造组').click();return page.getByRole('dialog',{name:'参数构造组',exact:true});},field=async(c,label,n)=>{await c.getByLabel(label,{exact:true}).fill(String(n));await c.getByLabel(label,{exact:true}).press('Enter');};
 const download=async name=>{await closeProps();for(const format of ['json','fold','dxf']){await button('导出作品').click();const d=page.getByRole('dialog',{name:'导出作品',exact:true});await d.getByRole('combobox').first().selectOption(format);const saving=page.waitForEvent('download');await d.getByRole('button',{name:'导出文件',exact:true}).click();await(await saving).saveAs(`output/playwright/material-location-move-model-identity-regression-${name}-1009.${format==='json'?'zhezhi.json':format}`);await button('关闭窗口').click();}};
 const mirror=async(source,kind,save)=>{let manager=await open();check(await manager.getByRole('alert').count()===0,save+' 原模型有效');await manager.getByLabel(source==='shared'?'编辑参数组 2':'编辑参数组 1',{exact:true}).click();const c=page.getByRole('dialog',{name:'材料参数变换',exact:true});await c.getByLabel('材料变换方式',{exact:true}).selectOption(kind);await c.getByRole('button',{name:'预览材料变换',exact:true}).click();check(await c.getByRole('alert').count()===0,save+' 镜像后细分续接通过');check(await c.getByRole('button',{name:'应用材料变换',exact:true}).isEnabled(),save+' 可实际采用');await c.getByRole('button',{name:'应用材料变换',exact:true}).click();await download(save);manager=await open();check(await manager.getByRole('alert').count()===0,save+' 新模型独立重算通过');await manager.getByLabel(['shared','chain','legacy-chain'].includes(source)?'编辑参数组 3':'编辑参数组 2',{exact:true}).click();const insert=page.getByRole('dialog',{name:'编辑材料折痕',exact:true});check(await insert.getByLabel('细分材料面',{exact:true}).inputValue()===(source.includes('chain')?'1':'0'),save+' 后组仍为原面');await insert.getByRole('button',{name:'预览材料编辑',exact:true}).click();check(await insert.getByRole('alert').count()===0,save+' 后细分可重开');await insert.getByRole('button',{name:'取消',exact:true}).click();await button('关闭镶嵌窗口').click();};
 for(const {source,kind,name} of recipes){await load(source);await mirror(source,kind,name);}
 await load('legacy');let manager=await open();await manager.getByLabel('编辑参数组 1',{exact:true}).click();let c=page.getByRole('dialog',{name:'材料参数变换',exact:true});await c.getByLabel('材料变换方式',{exact:true}).selectOption('mirrorX');await c.getByRole('button',{name:'预览材料变换',exact:true}).click();check(await c.getByRole('alert').count()===0,'旧方向模型预览升级成功');await c.getByRole('button',{name:'取消',exact:true}).click();await button('关闭镶嵌窗口').click();await download('cancel');manager=await open();await manager.getByLabel('编辑参数组 1',{exact:true}).click();c=page.getByRole('dialog',{name:'材料参数变换',exact:true});await c.getByLabel('材料变换方式',{exact:true}).selectOption('mirrorX');await c.getByRole('button',{name:'预览材料变换',exact:true}).click();await c.getByRole('button',{name:'应用材料变换',exact:true}).click();await download('legacy-changed');await button('撤销').click();await download('undo');await button('重做').click();await download('redo');check(true,'旧模型升级一次撤销重做');
 for(const ext of ['zhezhi.json','fold']){await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`output/playwright/material-location-move-model-identity-regression-legacy-changed-1009.${ext}`);await mirror('legacy','mirrorY',ext==='fold'?'fold-reedited':'json-reedited');}
 manager=await open();await manager.getByLabel('预览删除参数组 1',{exact:true}).click();check(await manager.getByRole('alert').count()===1&&await manager.getByRole('button',{name:'应用删除',exact:true}).isDisabled(),'删除来源不转绑别的面');await button('关闭镶嵌窗口').click();await download('failure-cancel');
 await load('copy');manager=await open();await manager.getByLabel('编辑参数组 1',{exact:true}).click();c=page.getByRole('dialog',{name:'复制材料部件',exact:true});await c.getByLabel('逐份复制参数',{exact:true}).check();await c.getByLabel('副本 1 镜像',{exact:true}).selectOption('x');await c.getByLabel('副本 2 镜像',{exact:true}).selectOption('y');await field(c,'副本数量',3);await c.getByRole('button',{name:'预览材料复制',exact:true}).click();check(await c.getByRole('alert').count()===0,'逐份镜像加副本仍保后面身份');check(await c.getByRole('button',{name:'应用材料复制',exact:true}).isEnabled(),'复制镜像完整结果可采用');await c.getByRole('button',{name:'应用材料复制',exact:true}).click();await download('copy-changed');manager=await open();await manager.getByLabel('编辑参数组 2',{exact:true}).click();c=page.getByRole('dialog',{name:'编辑材料折痕',exact:true});check(await c.getByLabel('细分材料面',{exact:true}).inputValue()==='1','仍编辑第一副本的原面');await c.getByRole('button',{name:'预览材料编辑',exact:true}).click();check(await c.getByRole('alert').count()===0,'镜像后副本细分可重开');for(const width of [1000,800,390]){await page.setViewportSize({width,height:720});check(await c.evaluate(e=>e.scrollHeight<=e.clientHeight+1&&e.scrollWidth<=e.clientWidth+1),`${width} 镜像后编辑无窗口滚动`);}await page.screenshot({path:'output/playwright/material-location-move-model-identity-regression-copy-390-1009.png'});await c.getByRole('button',{name:'取消',exact:true}).click();await button('关闭镶嵌窗口').click();await page.setViewportSize({width:1280,height:800});check(errors.length===0,'零页面异常');return {passed:checks.length,checks,errors};
}
