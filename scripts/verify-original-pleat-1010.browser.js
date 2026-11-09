async page=>{
const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
await page.evaluate(()=>window.confirm=()=>true);await page.setViewportSize({width:1280,height:800});
await page.getByRole('button',{name:/^\d+ 单元扭转$/}).click();
await page.getByLabel('临界角与山谷赋型分析',{exact:true}).click();
await page.getByLabel('原TestPleat完整图形',{exact:true}).click();
const d=page.getByRole('dialog',{name:'原TestPleat · 两端点四图元',exact:true});
const fill=async(label,value)=>{const field=d.getByLabel(label,{exact:true});await field.fill(String(value));await field.blur();};
for(const [name,points,angle]of [['right-angle',[[0,0],[1,0]],90],['degenerate',[[0,0],[1,0]],0],['translated',[[2,-3],[-.5,4]],36]]){
 for(let i=0;i<2;i++){await fill(`${i?'qb':'qa'} X`,points[i][0]);await fill(`${i?'qb':'qa'} Y`,points[i][1]);}await fill('原α °',angle);
 const received=page.waitForResponse(r=>r.url().endsWith('/api/tessellation/test-pleat')&&r.ok());
 await d.getByRole('button',{name:'构造原TestPleat图',exact:true}).click();const r=await(await received).json();await d.getByRole('status').waitFor();
 check(r.data.graphics.length===4,name+'实际API四图元');check(JSON.stringify(r.query.points)===JSON.stringify(points)&&r.query.angleDeg===angle,name+'实际端点和角不变');
 check(await d.locator('svg polygon').count()===1&&await d.locator('svg polyline').count()===3,name+'图形完整显示');
 const download=page.waitForEvent('download');await d.getByRole('button',{name:'导出完整原图 JSON',exact:true}).click();await(await download).saveAs(`output/original-function-browser-1010/pleat-${name}.json`);
}
await d.getByRole('button',{name:'拖动原输入端点',exact:true}).click();check(await page.getByRole('dialog',{name:'原TestPleat端点',exact:true}).count()===1,'原端点可视化编辑入口可用');
await page.getByRole('dialog',{name:'原TestPleat端点',exact:true}).getByRole('button',{name:'关闭镶嵌窗口',exact:true}).click();
await fill('qa X',0);await fill('qa Y',0);await fill('qb X',0);await fill('qb Y',0);
await d.getByRole('button',{name:'构造原TestPleat图',exact:true}).click();check(await d.getByRole('alert').count()===1,'重合端点归一化明确拒绝');check(await d.locator('svg').count()===0,'改源后旧图撤回');
await page.setViewportSize({width:390,height:720});check(await d.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'390褶带图无横向溢出');await page.screenshot({path:'output/original-function-browser-1010/pleat-390.png'});
await d.getByRole('button',{name:'关闭镶嵌窗口',exact:true}).click();check(await d.count()===0,'关闭褶带返回扭转分析');check(errors.length===0,'零页面异常');return{passed:checks.length,checks,errors};
}
