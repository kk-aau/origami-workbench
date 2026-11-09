async page=>{
const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
await page.evaluate(()=>window.confirm=()=>true);await page.setViewportSize({width:1280,height:800});
const closing=page.getByRole('button',{name:'关闭镶嵌窗口',exact:true});for(let i=0;i<3&&await closing.count();i++)await closing.last().click();
await page.getByRole('button',{name:'镶嵌设计',exact:true}).click();await page.getByRole('button',{name:/^\d+ 单元扭转$/}).click();
await page.getByLabel('边数',{exact:true}).fill('5');await page.getByRole('button',{name:/^编辑扭转轮廓/}).click();
const polygon=page.getByRole('dialog',{name:'编辑扭转轮廓',exact:true}),points=[[0,0],[.5,-.25],[.9,-.1],[.75,.25],[.25,.35]];
for(let i=0;i<5;i++){const select=polygon.getByLabel('选中点',{exact:true});await select.focus();await select.selectOption({value:String(i)});for(let j=0;j<2;j++){const field=polygon.getByLabel(j?'点 Y':'点 X',{exact:true});await field.fill(String(points[i][j]));await field.press('Enter');}}
await polygon.getByRole('button',{name:'保存几何修改',exact:true}).click();await page.getByLabel('临界角与山谷赋型分析',{exact:true}).click();
const analysis=page.getByRole('dialog',{name:'扭转临界角与山谷赋型',exact:true});
check(await analysis.getByTestId('twist-three-cycle').innerText()==='42.876° ～ 140.602°','原五点等比例输入True角域');
await analysis.getByLabel('多边形CheckHalfPlane',{exact:true}).uncheck();check(await analysis.getByTestId('twist-three-cycle').innerText()==='30.896° ～ 145.553°','原五点False分支改变实际角域');
check(await analysis.getByLabel('原TestPleat完整图形',{exact:true}).count()===1,'新增分支保留褶带入口');
await analysis.getByLabel('原三边临界角查询',{exact:true}).click();const d=page.getByRole('dialog',{name:'原三边临界角 · CheckHalfPlane',exact:true});
await d.getByRole('button',{name:'填入False原式反例',exact:true}).click();
const edges=[[[0,-1],[0,3]],[[-3,0],[0,-3]],[[-3,2],[0,2]]];
const calculate=async()=>{const waiting=page.waitForResponse(r=>r.url().endsWith('/api/tessellation/three-cycle-critical')&&r.ok());await d.getByRole('button',{name:'计算原三边角域',exact:true}).click();const r=await(await waiting).json();await d.getByRole('status').waitFor();return r;};
const save=async name=>{const pending=page.waitForEvent('download');await d.getByRole('button',{name:'导出完整原数值 JSON',exact:true}).click();await(await pending).saveAs(`output/original-function-browser-1010/halfplane-${name}.json`);};
for(const [flag,name,expected]of [[false,'false',[39.8055710922652,101.30993247402021]],[true,'true',[90,270]]]){
 await d.getByLabel('原三边CheckHalfPlane',{exact:true}).setChecked(flag);const r=await calculate();
 check(r.query.checkHalfPlane===flag&&JSON.stringify(r.query.edges)===JSON.stringify(edges),name+'实际原参数完整');check(r.data.anglesDeg.every((v,i)=>Math.abs(v-expected[i])<1e-8),name+'实际角域和原代数值');check(await d.locator('svg line').count()===3,name+'三条有向原边完整显示');await save(name);
}
await d.getByRole('button',{name:'拖动三边端点',exact:true}).click();const edit=page.getByRole('dialog',{name:'原三条有向边端点',exact:true});
check(await edit.locator('svg text').count()>6,'三边编辑刻度和点编号可见');check(await edit.getByRole('checkbox',{name:/吸附/}).isChecked()===false,'端点默认不吸附');
const actualSvg=edit.getByLabel('原三条有向边端点画布',{exact:true}),before=await actualSvg.getAttribute('viewBox'),bb=await actualSvg.boundingBox();await page.mouse.move(bb.x+bb.width*.5,bb.y+bb.height*.5);await page.mouse.wheel(0,-300);
await page.waitForTimeout(150);check((await actualSvg.getAttribute('viewBox'))!==before,'三边画布滚轮改变视野');
const endpoint=await edit.locator('circle[data-point="0"]').boundingBox();await page.mouse.move(endpoint.x+endpoint.width/2,endpoint.y+endpoint.height/2);await page.mouse.down();await page.mouse.move(endpoint.x+endpoint.width/2+15,endpoint.y+endpoint.height/2-8,{steps:3});await page.mouse.up();
const coordinate=edit.getByLabel('原X',{exact:true});await coordinate.fill('-.25');await coordinate.blur();check(Number(await coordinate.inputValue())===-.25,'精确原坐标可输入');
await edit.getByRole('button',{name:'保存几何修改',exact:true}).click();check(await d.locator('svg').count()===0,'端点修改撤回旧角域');
await d.getByLabel('原三边CheckHalfPlane',{exact:true}).uncheck();const changed=await calculate();check(changed.query.edges[0][0][0]===-.25,'原坐标修改实际送入构造');check(changed.query.edges[0][0][1]!==-1,'真实拖动修改对应原端点');
check(JSON.stringify(changed.query.edges.slice(1))===JSON.stringify(edges.slice(1)),'拖动不改变其他原边');await save('edited');
await d.getByText('精确端点 JSON',{exact:true}).click();await d.getByLabel('原三边端点JSON',{exact:true}).fill(JSON.stringify([[[0,0],[0,0]],[[1,1],[1,1]],[[2,2],[2,2]]]));const singular=await calculate();
check(singular.data.status==='numeric-evaluation-incomplete','奇异原False明确求值不完整');check(singular.data.anglesDeg.every(v=>v===null),'不虚构奇异原角度');check(singular.data.noMathematicalInfeasibilityClaim===true,'不把未完成数值当作数学无解');await save('singular');
await d.getByLabel('原三边端点JSON',{exact:true}).fill('[]');await d.getByRole('button',{name:'计算原三边角域',exact:true}).click();check(await d.getByRole('alert').count()===1,'异常原边明确拒绝');check(await d.locator('svg').count()===0,'拒绝后不显示旧构形');
await page.setViewportSize({width:390,height:720});check(await d.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'390三边查询无横向溢出');await page.screenshot({path:'output/original-function-browser-1010/halfplane-390.png'});await d.getByRole('button',{name:'关闭镶嵌窗口',exact:true}).click();
check(await analysis.getByLabel('多边形CheckHalfPlane',{exact:true}).isChecked()===false,'子工具返回保持主分析选项');check(errors.length===0,'零页面异常');return{passed:checks.length,checks,errors};
}
