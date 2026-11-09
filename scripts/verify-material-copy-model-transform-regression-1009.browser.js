async page=>{
 const recipes=[
  {
    "name": "move",
    "source": "source",
    "recipe": {
      "kind": "material-transform",
      "components": [
        0
      ],
      "operation": {
        "kind": "move",
        "a": 20,
        "b": 10
      }
    }
  },
  {
    "name": "rotate",
    "source": "source",
    "recipe": {
      "kind": "material-transform",
      "components": [
        0
      ],
      "operation": {
        "kind": "rotate",
        "a": 30
      }
    }
  },
  {
    "name": "scale",
    "source": "source",
    "recipe": {
      "kind": "material-transform",
      "components": [
        0
      ],
      "operation": {
        "kind": "scale",
        "a": 1.25
      }
    }
  },
  {
    "name": "mirrorX",
    "source": "source",
    "recipe": {
      "kind": "material-transform",
      "components": [
        0
      ],
      "operation": {
        "kind": "mirrorX",
        "a": 0
      }
    }
  },
  {
    "name": "mirrorY",
    "source": "source",
    "recipe": {
      "kind": "material-transform",
      "components": [
        0
      ],
      "operation": {
        "kind": "mirrorY",
        "a": 0
      }
    }
  },
  {
    "name": "original",
    "source": "original",
    "recipe": {
      "kind": "material-transform",
      "components": [
        0,
        1,
        2,
        3
      ],
      "operation": {
        "kind": "rotate",
        "a": 25
      }
    }
  }
];const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};await page.evaluate(()=>{window.confirm=()=>true;});await page.setViewportSize({width:1280,height:800});const button=name=>['撤销','重做'].includes(name)?page.getByRole('complementary',{name:'绘图工具',exact:true}).getByRole('button',{name,exact:true}):page.getByRole('button',{name,exact:true}),closeProps=async()=>{if(await button('关闭工具设置').count())await button('关闭工具设置').click();};
 const load=async name=>{await closeProps();await button('折痕编辑').click();await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`output/playwright/material-copy-model-transform-regression-${name}-initial-1009.zhezhi.json`);await page.waitForFunction(n=>document.querySelector('[aria-label="工程名称"]')?.value===n,`参数变换-${name}`);},open=async title=>{await closeProps();await button('绘图工具').click();await page.getByRole('button',{name:/^(纸张属性|选区 \(\d+\))$/}).click();await button(title).click();return page.getByRole('dialog',{name:title,exact:true});},field=async(c,label,n)=>{await c.getByLabel(label,{exact:true}).fill(String(n));await c.getByLabel(label,{exact:true}).press('Enter');};
 const calculate=async(c,label)=>{await c.getByRole('button',{name:'预览材料变换',exact:true}).click();check(await c.getByRole('alert').count()===0,label+' CP/FF预览通过');check(await c.getByRole('button',{name:'应用材料变换',exact:true}).isEnabled(),label+' 完整结果可采用');};
 const download=async name=>{await closeProps();for(const format of ['json','fold','dxf']){await button('导出作品').click();const d=page.getByRole('dialog',{name:'导出作品',exact:true});await d.getByRole('combobox').first().selectOption(format);const saving=page.waitForEvent('download');await d.getByRole('button',{name:'导出文件',exact:true}).click();await(await saving).saveAs(`output/playwright/material-copy-model-transform-regression-${name}-1009.${format==='json'?'zhezhi.json':format}`);await button('关闭窗口').click();}};
 for(const {name,source,recipe:r}of recipes){await load(source);let c=await open('材料参数变换');check(await c.getByLabel('变换保存参数',{exact:true}).isChecked(),name+' 默认保存参数');await c.getByLabel('材料变换方式',{exact:true}).selectOption(r.operation.kind);if(r.operation.kind==='move'){await field(c,'变换偏移 X',r.operation.a);await field(c,'变换偏移 Y',r.operation.b);}else if(r.operation.kind==='rotate')await field(c,'变换旋转角',r.operation.a);else if(r.operation.kind==='scale')await field(c,'变换比例',r.operation.a);await calculate(c,name);await c.getByRole('button',{name:'FF预览',exact:true}).click();check(await c.getByRole('button',{name:'FF预览',exact:true}).getAttribute('aria-pressed')==='true',name+' 实际FF可查看');await c.getByRole('button',{name:'应用材料变换',exact:true}).click();await download(name+'-saved');const manager=await open('参数构造组');check(await manager.getByRole('alert').count()===0,name+' 模型独立重算通过');await manager.getByLabel('编辑参数组 2',{exact:true}).click();c=page.getByRole('dialog',{name:'材料参数变换',exact:true});check(await c.getByLabel('材料变换方式',{exact:true}).inputValue()===r.operation.kind,name+' 变换配方回填');await c.getByRole('button',{name:'取消',exact:true}).click();await button('关闭镶嵌窗口').click();}
 await load('two');let manager=await open('参数构造组');await manager.getByLabel('编辑参数组 2',{exact:true}).click();let c=page.getByRole('dialog',{name:'材料参数变换',exact:true});await field(c,'变换偏移 X',30);await field(c,'变换偏移 Y',20);await calculate(c,'前移动后旋转');await c.getByRole('button',{name:'取消',exact:true}).click();await button('关闭镶嵌窗口').click();await download('cancel');manager=await open('参数构造组');await manager.getByLabel('编辑参数组 2',{exact:true}).click();c=page.getByRole('dialog',{name:'材料参数变换',exact:true});await field(c,'变换偏移 X',30);await field(c,'变换偏移 Y',20);await calculate(c,'顺序重算');await c.getByRole('button',{name:'应用材料变换',exact:true}).click();await download('two-changed');await button('撤销').click();await download('undo');await button('重做').click();await download('redo');check(true,'变换一次撤销重做');
 for(const ext of ['zhezhi.json','fold']){await page.getByLabel('折痕工程文件',{exact:true}).setInputFiles(`output/playwright/material-copy-model-transform-regression-two-changed-1009.${ext}`);manager=await open('参数构造组');await manager.getByLabel('编辑参数组 3',{exact:true}).click();c=page.getByRole('dialog',{name:'材料参数变换',exact:true});await field(c,'变换旋转角',45);await calculate(c,ext+'重开修改');await c.getByRole('button',{name:'应用材料变换',exact:true}).click();await download(ext==='fold'?'fold-reedited':'json-reedited');}
 manager=await open('参数构造组');await manager.getByLabel('预览删除参数组 3',{exact:true}).click();check(await manager.getByRole('button',{name:'应用删除',exact:true}).isEnabled(),'删除后旋转先预览原移动材料');await manager.getByRole('button',{name:'应用删除',exact:true}).click();await download('removed');
 await load('ray');manager=await open('参数构造组');await manager.getByLabel('编辑参数组 2',{exact:true}).click();c=page.getByRole('dialog',{name:'材料参数变换',exact:true});await field(c,'变换偏移 X',30);await field(c,'变换偏移 Y',20);await calculate(c,'变换后射线来源跟随');await c.getByRole('button',{name:'应用材料变换',exact:true}).click();await download('ray-changed');manager=await open('参数构造组');await manager.getByLabel('预览删除参数组 2',{exact:true}).click();check(await manager.getByRole('alert').count()===1&&await manager.getByRole('button',{name:'应用删除',exact:true}).isDisabled(),'删除被射线依赖的变换拒绝');await button('关闭镶嵌窗口').click();await download('failure-cancel');
 await load('cut');manager=await open('参数构造组');await manager.getByLabel('编辑参数组 3',{exact:true}).click();c=page.getByRole('dialog',{name:'材料参数变换',exact:true});check(await c.getByLabel('变换部件 1',{exact:true}).isChecked()&&!await c.getByLabel('变换部件 2',{exact:true}).isChecked(),'切开后仅选原指定部件');await field(c,'变换偏移 X',35);await field(c,'变换偏移 Y',15);await calculate(c,'单切片变换');await page.screenshot({path:'output/playwright/material-copy-model-transform-regression-cut-edit-1009.png'});await c.getByRole('button',{name:'应用材料变换',exact:true}).click();await download('cut-changed');
 manager=await open('参数构造组');await manager.getByLabel('编辑参数组 3',{exact:true}).click();c=page.getByRole('dialog',{name:'材料参数变换',exact:true});for(const width of [1000,800,390]){await page.setViewportSize({width,height:720});check(await c.evaluate(e=>e.scrollHeight<=e.clientHeight+1&&e.scrollWidth<=e.clientWidth+1),`${width} 参数变换无窗口滚动`);}await page.screenshot({path:'output/playwright/material-copy-model-transform-regression-390-1009.png'});await c.getByRole('button',{name:'取消',exact:true}).click();await button('关闭镶嵌窗口').click();await page.setViewportSize({width:1280,height:800});check(errors.length===0,'零页面异常');return {passed:checks.length,checks,errors};
}
