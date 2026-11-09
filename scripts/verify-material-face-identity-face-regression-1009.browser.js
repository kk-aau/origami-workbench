async page=>{
 const recipes=[
  {
    "name": "flat",
    "source": "base",
    "recipe": {
      "kind": "material-face-insert",
      "face": 0,
      "from": {
        "edgeId": "material-edge-0",
        "fraction": 0.5
      },
      "to": {
        "edgeId": "material-edge-2",
        "fraction": 0.5
      },
      "assignment": "F",
      "fixedPart": 0,
      "cpOnly": false
    }
  },
  {
    "name": "mountain",
    "source": "base",
    "recipe": {
      "kind": "material-face-insert",
      "face": 0,
      "from": {
        "edgeId": "material-edge-0",
        "fraction": 0.5
      },
      "to": {
        "edgeId": "material-edge-2",
        "fraction": 0.5
      },
      "assignment": "M",
      "fixedPart": 1,
      "cpOnly": false
    }
  },
  {
    "name": "hole",
    "source": "hole",
    "recipe": {
      "kind": "material-face-insert",
      "face": 0,
      "from": {
        "edgeId": "material-edge-3",
        "fraction": 0.7
      },
      "to": {
        "edgeId": "material-edge-1",
        "fraction": 0.3
      },
      "assignment": "F",
      "fixedPart": 0,
      "cpOnly": false
    }
  },
  {
    "name": "weak",
    "source": "weak",
    "recipe": {
      "kind": "material-face-insert",
      "face": 0,
      "from": {
        "edgeId": "curve-group-1::part-0",
        "fraction": 0.4
      },
      "to": {
        "edgeId": "material-edge-1",
        "fraction": 0.3
      },
      "assignment": "F",
      "fixedPart": 0,
      "cpOnly": false
    }
  },
  {
    "name": "original",
    "source": "original",
    "recipe": {
      "kind": "material-face-insert",
      "face": 2,
      "from": {
        "edgeId": "curve-group-1::crease-0",
        "fraction": 0
      },
      "to": {
        "edgeId": "material-edge-12",
        "fraction": 0
      },
      "assignment": "F",
      "fixedPart": 0,
      "cpOnly": false
    }
  },
  {
    "name": "merge",
    "source": "two",
    "recipe": {
      "kind": "material-face-remove",
      "segmentIds": [
        "curve-group-1::crease-0",
        "curve-group-2::part-0",
        "curve-group-2::crease-0"
      ]
    }
  },
  {
    "name": "merge-base",
    "source": "merge-base",
    "recipe": {
      "kind": "material-face-remove",
      "segmentIds": [
        "material-face-crease"
      ]
    }
  }
];const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};await page.evaluate(()=>{window.confirm=()=>true;});await page.setViewportSize({width:1280,height:800});const button=name=>['撤销','重做'].includes(name)?page.getByRole('complementary',{name:'绘图工具',exact:true}).getByRole('button',{name,exact:true}):page.getByRole('button',{name,exact:true}),closeProps=async()=>{if(await button('关闭工具设置').count())await button('关闭工具设置').click();};
 const load=async name=>{await closeProps();await button('折痕编辑').click();await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`output/playwright/material-face-identity-face-regression-${name}-initial-1009.zhezhi.json`);await page.waitForFunction(n=>document.querySelector('[aria-label="工程名称"]')?.value===n,`参数面编辑-${name}`);},open=async title=>{await closeProps();await button('绘图工具').click();await page.getByRole('button',{name:/^(纸张属性|选区 \(\d+\))$/}).click();await button(title).click();return page.getByRole('dialog',{name:title,exact:true});},field=async(c,label,n)=>{await c.getByLabel(label,{exact:true}).fill(String(n));await c.getByLabel(label,{exact:true}).press('Enter');};
 const configure=async(c,r)=>{if(r.kind==='material-face-insert'){await c.getByLabel('细分材料面',{exact:true}).selectOption(String(r.face));for(const [i,p] of [r.from,r.to].entries()){await c.getByLabel(`${i?'终点':'起点'}材料边`,{exact:true}).selectOption(p.edgeId);await field(c,`${i?'终点':'起点'}沿边比例`,p.fraction*100);}await c.getByLabel('细分折痕线型',{exact:true}).selectOption(r.assignment);await c.getByLabel('细分固定面侧',{exact:true}).selectOption(String(r.fixedPart));if(r.cpOnly)await c.getByLabel('材料直线仅CP',{exact:true}).check();else await c.getByLabel('材料直线仅CP',{exact:true}).uncheck();}else{await c.getByRole('button',{name:'删除折痕 / 合并面',exact:true}).click();for(const row of await c.getByLabel('删除材料折痕列表',{exact:true}).locator('tbody tr').all()){const id=(await row.locator('td').nth(1).innerText()).trim();await row.getByRole('checkbox').setChecked(r.segmentIds.includes(id));}}};
 const calculate=async(c,label)=>{await c.getByRole('button',{name:'预览材料编辑',exact:true}).click();check(await c.getByRole('alert').count()===0,label+' CP/FF预览通过');check(await c.getByRole('button',{name:'应用材料编辑',exact:true}).isEnabled(),label+' 实际材料可采用');};
 const download=async name=>{await closeProps();for(const format of ['json','fold','dxf']){await button('导出作品').click();const d=page.getByRole('dialog',{name:'导出作品',exact:true});await d.getByRole('combobox').first().selectOption(format);const saving=page.waitForEvent('download');await d.getByRole('button',{name:'导出文件',exact:true}).click();await(await saving).saveAs(`output/playwright/material-face-identity-face-regression-${name}-1009.${format==='json'?'zhezhi.json':format}`);await button('关闭窗口').click();}};
 for(const {name,source,recipe:r} of recipes){await load(source);let c=await open('编辑材料折痕');await configure(c,r);check(await c.getByLabel(r.kind==='material-face-insert'?'细分保存参数':'合并保存参数',{exact:true}).isChecked(),name+' 默认保存参数');await calculate(c,name);await c.getByRole('button',{name:'应用材料编辑',exact:true}).click();await download(name+'-saved');const manager=await open('参数构造组');check(await manager.getByRole('alert').count()===0,name+' 模型独立重放通过');const rows=await manager.getByLabel(/^编辑参数组 \d+$/).count();await manager.getByLabel(`编辑参数组 ${rows}`,{exact:true}).click();c=page.getByRole('dialog',{name:'编辑材料折痕',exact:true});check(await c.getByRole('button',{name:r.kind==='material-face-insert'?'添加折痕 / 细分面':'删除折痕 / 合并面',exact:true}).getAttribute('aria-pressed')==='true',name+' 原操作回填');await calculate(c,name+'重开');await c.getByRole('button',{name:'取消',exact:true}).click();await button('关闭镶嵌窗口').click();}
 await load('two');let manager=await open('参数构造组');await manager.getByLabel('编辑参数组 1',{exact:true}).click();let c=page.getByRole('dialog',{name:'编辑材料折痕',exact:true});await field(c,'起点沿边比例',60);await field(c,'终点沿边比例',40);await calculate(c,'后细分跟随前折痕');await c.getByRole('button',{name:'取消',exact:true}).click();await button('关闭镶嵌窗口').click();await download('cancel');manager=await open('参数构造组');await manager.getByLabel('编辑参数组 1',{exact:true}).click();c=page.getByRole('dialog',{name:'编辑材料折痕',exact:true});await field(c,'起点沿边比例',60);await field(c,'终点沿边比例',40);await calculate(c,'前组改变实际重算');await c.getByRole('button',{name:'应用材料编辑',exact:true}).click();await download('two-changed');await button('撤销').click();await download('undo');await button('重做').click();await download('redo');check(true,'细分一次撤销重做');
 for(const ext of ['zhezhi.json','fold']){await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`output/playwright/material-face-identity-face-regression-two-changed-1009.${ext}`);manager=await open('参数构造组');await manager.getByLabel('编辑参数组 2',{exact:true}).click();c=page.getByRole('dialog',{name:'编辑材料折痕',exact:true});await field(c,'起点沿边比例',65);await field(c,'终点沿边比例',65);await calculate(c,ext+'后细分重开');await c.getByRole('button',{name:'应用材料编辑',exact:true}).click();await download(ext==='fold'?'fold-reedited':'json-reedited');}
 manager=await open('参数构造组');await manager.getByLabel('预览删除参数组 1',{exact:true}).click();check(await manager.getByRole('alert').count()===1&&await manager.getByRole('button',{name:'应用删除',exact:true}).isDisabled(),'删除被细分依赖来源拒绝');await button('关闭镶嵌窗口').click();await download('failure-cancel');manager=await open('参数构造组');await manager.getByLabel('预览删除参数组 2',{exact:true}).click();check(await manager.getByRole('button',{name:'应用删除',exact:true}).isEnabled(),'后细分可预览删除');await manager.getByRole('button',{name:'应用删除',exact:true}).click();await download('insert-removed');
 await load('removed');manager=await open('参数构造组');await manager.getByLabel('编辑参数组 1',{exact:true}).click();c=page.getByRole('dialog',{name:'编辑材料折痕',exact:true});await field(c,'起点沿边比例',60);await field(c,'终点沿边比例',40);await calculate(c,'合并跟随后代完整内边');await c.getByRole('button',{name:'应用材料编辑',exact:true}).click();await download('merge-changed');manager=await open('参数构造组');await manager.getByLabel('预览删除参数组 3',{exact:true}).click();check(await manager.getByRole('button',{name:'应用删除',exact:true}).isEnabled(),'删除合并恢复原真实内边');await manager.getByRole('button',{name:'应用删除',exact:true}).click();await download('merge-removed');
 await load('two');c=await open('编辑材料折痕');await c.getByRole('button',{name:'删除折痕 / 合并面',exact:true}).click();await c.getByLabel('合并保存参数',{exact:true}).uncheck();const rows=await c.getByLabel('删除材料折痕列表',{exact:true}).locator('tbody tr').all();await rows.at(-1).getByRole('checkbox').check();await calculate(c,'关闭参数保普通合并');await c.getByRole('button',{name:'应用材料编辑',exact:true}).click();await download('unrecorded');
 await load('cross-network');manager=await open('参数构造组');check(await manager.getByRole('alert').count()===0,'跨原部件合并来源可重放');await manager.getByLabel('编辑参数组 3',{exact:true}).click();c=page.getByRole('dialog',{name:'材料闭合线网',exact:true});await field(c,'线网固定点 X',155);await c.getByRole('button',{name:'预览线网',exact:true}).click();check(await c.getByRole('alert').count()===0,'跨来源合并后线网可编辑');check(await c.getByRole('button',{name:'应用线网',exact:true}).isEnabled(),'跨来源线网可采用');await c.getByRole('button',{name:'应用线网',exact:true}).click();await download('cross-network-changed');manager=await open('参数构造组');await manager.getByLabel('预览删除参数组 2',{exact:true}).click();check(await manager.getByRole('button',{name:'应用删除',exact:true}).isEnabled(),'删除跨来源合并仍可重算线网');await manager.getByRole('button',{name:'应用删除',exact:true}).click();await download('cross-merge-removed');
 for(const source of ['inserted','removed']){await load(source);manager=await open('参数构造组');await manager.getByLabel(source==='inserted'?'编辑参数组 1':'编辑参数组 3',{exact:true}).click();c=page.getByRole('dialog',{name:'编辑材料折痕',exact:true});for(const width of [1000,800,390]){await page.setViewportSize({width,height:720});check(await c.evaluate(e=>e.scrollHeight<=e.clientHeight+1&&e.scrollWidth<=e.clientWidth+1),`${width} ${source} 编辑无窗口滚动`);await calculate(c,`${width} ${source} 布局预览`);check(await c.evaluate(e=>e.scrollHeight<=e.clientHeight+1&&e.scrollWidth<=e.clientWidth+1),`${width} ${source} 预览后无窗口滚动`);}await page.screenshot({path:`output/playwright/material-face-identity-face-regression-${source}-390-1009.png`});await c.getByRole('button',{name:'取消',exact:true}).click();await button('关闭镶嵌窗口').click();await page.setViewportSize({width:1280,height:800});}check(errors.length===0,'零页面异常');return {passed:checks.length,checks,errors};
}
