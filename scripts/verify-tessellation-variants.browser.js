async page=>{
 const results=[],check=(ok,msg)=>{if(!ok)throw Error(msg);results.push(msg);},button=name=>page.getByRole('button',{name,exact:true});
 await button('镶嵌设计').click();
 const generate=async()=>{const pending=page.waitForResponse(r=>r.url().endsWith('/api/tessellate'));await button('生成预览').click();const response=await pending,value=await response.json();if(!response.ok())throw Error(JSON.stringify(value));await page.waitForFunction(()=>document.querySelector('.context-toolbar .outline')?.textContent==='生成预览');check(await button('采用折痕副本 →').isEnabled(),'候选通过 '+JSON.stringify(value.stats.parameters));return value;};
 await button('04 混合平铺').click();
 for(const tiling of ['pgg','2uniform','equilateral-pentagon']){await page.getByLabel('顶点构型',{exact:true}).selectOption(tiling);await generate();}
 await button('05 非周期').click();
 for(const kind of ['delaunay','penrose','goldberg']){await page.getByLabel('母结构类型',{exact:true}).selectOption(kind);await generate();}
 await button('08 铺石镶嵌').click();
 for(const tiling of ['triangle','hexagon']){await page.getByLabel('铺石类型',{exact:true}).selectOption(tiling);await generate();}
 await button('01 单元扭转').click();await page.getByRole('button',{name:/编辑扭转轮廓/}).click();await page.getByLabel('点 X',{exact:true}).fill('.9');await page.getByLabel('点 X',{exact:true}).press('Enter');await button('保存几何修改').click();const polygon=await generate();check(polygon.stats.parameters.polygon[0][0]===.9,'自定义凸多边形参与扭转');
 await button('05 非周期').click();await generate();await button('编辑种子点').click();
 const coordinate=async(x,y)=>page.locator('.tess-mesh-editor').evaluate((svg,[x,y])=>{const p=new DOMPoint(x,y).matrixTransform(svg.getScreenCTM());return {x:p.x,y:p.y};},[x,y]);
 const first=await page.locator('[data-point="0"]').boundingBox();await page.mouse.move(first.x+first.width/2,first.y+first.height/2);await page.mouse.down();const moved=await coordinate(.19,.18);await page.mouse.move(moved.x,moved.y,{steps:6});await page.mouse.up();
 check(Math.abs(Number(await page.getByLabel('点 X',{exact:true}).inputValue())-.19)<.001,'指针拖动更新种子坐标');
 const extra=await coordinate(.47,.46);await page.mouse.click(extra.x,extra.y);check(await page.locator('.tess-mesh-editor circle').count()===10,'单击空白新增种子');
 await page.locator('[data-point="9"]').click({button:'right'});check(await page.locator('.tess-mesh-editor circle').count()===9,'右击删除种子');
 await button('保存几何修改').click();const edited=await generate();check(Math.abs(edited.stats.parameters.points[0][0]-.19)<.001,'指针修改进入真实计算');
 return {passed:results.length,results};
}
