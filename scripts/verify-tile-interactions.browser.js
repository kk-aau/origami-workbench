async page=>{
 const checks=[],check=(ok,s)=>{if(!ok)throw Error(s);checks.push(s);},button=name=>page.getByRole('button',{name,exact:true});
 const dialog=page.getByRole('dialog',{name:'拼块组合',exact:true});if(await dialog.count())await button('关闭镶嵌窗口').click();
 await button('镶嵌设计').click();await button('06 自定义').click();await button('恢复默认').click();await button('拼块组合').click();
 await button('复制拼块').click();await page.getByLabel('中心 X',{exact:true}).fill('2');await page.getByLabel('中心 X',{exact:true}).press('Enter');await page.getByLabel('中心 Y',{exact:true}).fill('2');await page.getByLabel('中心 Y',{exact:true}).press('Enter');await button('旋转拼块').click();await button('镜像拼块').click();
 check(Math.abs(Number(await page.getByLabel('中心 X',{exact:true}).inputValue())-2)<1e-8,'移动、旋转、镜像保留指定中心');
 await button('对接到边').click();const target=await page.locator('.tile-assembly-canvas line[data-tile="0"][data-edge="0"]').evaluate(e=>{const p=new DOMPoint((e.x1.baseVal.value+e.x2.baseVal.value)/2,(e.y1.baseVal.value+e.y2.baseVal.value)/2).matrixTransform(e.ownerSVGElement.getScreenCTM());return {x:p.x,y:p.y};});await page.mouse.click(target.x,target.y);
 await page.waitForFunction(()=>Math.abs(Number(document.querySelector('[aria-label="中心 Y"]').value)+.25)<1e-8);check(true,'点击目标边使两个拼块准确对接');
 const p=await page.locator('.tile-assembly-canvas polygon[data-tile="4"]').evaluate(e=>{const points=e.points,svg=e.ownerSVGElement,m=svg.getScreenCTM();let x=0,y=0;for(let i=0;i<points.length;i++){x+=points[i].x;y+=points[i].y;}const p=new DOMPoint(x/points.length,y/points.length).matrixTransform(m);return {x:p.x,y:p.y};});
 await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x-80,p.y-25,{steps:6});await page.mouse.up();await button('采用拼块组合').click();
 check(/共边/.test(await page.locator('.tile-assembly-status').innerText()),'实际拖动导致分离时拒绝采用');
 await button('撤销拼块修改').click();await page.waitForFunction(()=>Math.abs(Number(document.querySelector('[aria-label="中心 Y"]').value)+.25)<1e-8);check(true,'撤销拖动恢复对接位置');
 await page.getByLabel('选中拼块边',{exact:true}).selectOption({value:'2'});await page.getByLabel('新增拼块边数',{exact:true}).selectOption({value:'3'});await button('沿选边添加').click();
 check(await page.locator('.tile-assembly-canvas polygon').count()===6,'沿外边添加正三角拼块');
 await button('采用拼块组合').click();check(await page.getByRole('dialog',{name:'拼块组合',exact:true}).count()===0,'交互组合通过几何检查并采用');
 return {passed:checks.length,checks};
}
