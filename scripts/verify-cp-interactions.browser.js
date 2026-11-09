async page => {
  const checks=[],errors=[];
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  const onError=error=>errors.push(error.message);
  page.on('pageerror',onError);
  const origin=await page.evaluate(()=>location.origin);
  await page.goto(`${origin}/scripts/fixtures/cp-interactions.html`);
  const active=page.locator('#active-workspace'),other=page.locator('#other-workspace');
  const canvas=active.locator('svg.crease-canvas');
  const doc=()=>page.evaluate(()=>window.cpInteractionHarness.doc);
  const settle=()=>page.waitForTimeout(60);
  const point=(scope,x,y)=>scope.locator('svg.crease-canvas').evaluate((svg,[x,y])=>{
    const p=svg.createSVGPoint();p.x=x;p.y=y;const screen=p.matrixTransform(svg.getScreenCTM());return {x:screen.x,y:screen.y};
  },[x,y]);
  const click=async(x,y)=>{const p=await point(active,x,y);await page.mouse.click(p.x,p.y);};
  const selected=()=>active.locator('[data-selected-circle="circle"]').count();
  const selectedLines=()=>active.locator('[data-segment]:has(> circle)').count();
  const reset=async()=>{await page.evaluate(()=>window.cpInteractionHarness.reset());await active.getByRole('button',{name:'选择',exact:true}).click();await canvas.focus();await page.keyboard.press('Escape');await settle();};
  try{
    await canvas.waitFor({state:'visible'});await settle();
    await click(65,50);check(await selected()===1,'CP 主画布点击圆周显示选中高亮');
    await page.keyboard.press('Delete');check(!(await doc()).objects.length&&(await doc()).segments.length===2,'Delete 只删除所选圆并保留两条线');
    await reset();await canvas.focus();await page.keyboard.press('Control+a');
    check(await selected()===1&&await selectedLines()===2,'Ctrl+A 同时选中可见线段和圆');
    await page.keyboard.press('Control+Shift+a');check(!await selected()&&!await selectedLines(),'Ctrl+Shift+A 同时撤选两类对象');
    await active.getByRole('button',{name:'全选',exact:true}).click();check(await selected()===1&&await selectedLines()===2,'全选按钮与 Ctrl+A 的范围一致');
    await canvas.focus();await page.keyboard.press('Escape');check(!await selected()&&!await selectedLines(),'空闲 Esc 撤选线段和圆');

    await click(65,50);await page.keyboard.down('Shift');await click(50,20);await page.keyboard.up('Shift');
    check(await selected()===1&&await selectedLines()===1,'Shift 在圆和线段之间追加选区');
    await page.keyboard.press('Backspace');check((await doc()).segments.map(s=>s.id).join(',')==='aux'&&!(await doc()).objects.length,'混合选区用 Backspace 一起删除');

    await reset();await active.getByText('图层',{exact:true}).click();await active.getByRole('checkbox',{name:'辅助线',exact:true}).uncheck();
    await canvas.focus();await page.keyboard.press('Control+a');check(await selectedLines()===1&&!await selected(),'隐藏辅助层后全选只包含主折痕');
    await page.keyboard.press('Delete');check((await doc()).segments.map(s=>s.id).join(',')==='aux'&&(await doc()).objects.length===1,'删除主折痕保留隐藏辅助线和辅助圆');
    await reset();await active.getByRole('checkbox',{name:'辅助线',exact:true}).check();await active.getByRole('checkbox',{name:'主折痕',exact:true}).uncheck();
    await canvas.focus();await page.keyboard.press('Control+a');check(await selectedLines()===1&&await selected()===1,'隐藏主折痕后全选包含辅助线和圆');
    await page.keyboard.press('Delete');check((await doc()).segments.map(s=>s.id).join(',')==='main'&&!(await doc()).objects.length,'删除辅助对象保留隐藏主折痕');
    await active.getByRole('checkbox',{name:'主折痕',exact:true}).check();await reset();
    await click(65,50);await active.getByRole('checkbox',{name:'辅助线',exact:true}).uncheck();await canvas.focus();await page.keyboard.press('Delete');
    check((await doc()).objects.length===1,'已选圆随后隐藏，不被 Delete 误删');
    await active.getByRole('checkbox',{name:'辅助线',exact:true}).check();await active.getByText('图层',{exact:true}).click();await reset();

    let a=await point(active,30,30),b=await point(active,70,70);
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:4});await page.mouse.up();
    check(await selected()===1&&!await selectedLines(),'普通框选完整圆，不误选框外折痕');
    a=await point(active,65,50);b=await point(active,75,55);
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:4});await page.mouse.up();await settle();
    const moved=(await doc()).objects[0];check(Math.abs(moved.center[0]-60)<1e-5&&Math.abs(moved.center[1]-55)<1e-5,'选中圆可以拖动且保留正确几何');
    await reset();a=await point(active,30,30);b=await point(active,70,70);
    await page.mouse.move(a.x,a.y);await page.mouse.down({button:'right'});await page.mouse.move(b.x,b.y,{steps:4});await page.mouse.up({button:'right'});
    check(!(await doc()).objects.length&&(await doc()).segments.length===2,'右键框删完整圆并保留框外线段');

    await reset();await page.evaluate(()=>window.cpInteractionHarness.showOther(true));await settle();
    await other.getByRole('button',{name:'画折痕',exact:true}).click();a=await point(other,25,40);await page.mouse.click(a.x,a.y);
    check((await other.locator('.canvas-tag').textContent()).includes('已选 1 点'),'另一个工作区保留未完成构造');
    await page.evaluate(()=>window.cpInteractionHarness.showOther(false));await settle();await click(65,50);await page.keyboard.press('Escape');
    check(!await selected(),'隐藏工作区的构造不拦截当前工作区 Esc');
    await page.evaluate(()=>window.cpInteractionHarness.showOther(true));await settle();
    check((await other.locator('.canvas-tag').textContent()).includes('已选 1 点'),'当前工作区 Esc 不清除隐藏工作区的构造');
    await other.locator('svg.crease-canvas').focus();await page.keyboard.press('Escape');await page.evaluate(()=>window.cpInteractionHarness.showOther(false));await settle();

    await active.getByRole('button',{name:'画折痕',exact:true}).click();a=await point(active,20,40);b=await point(active,80,40);
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:4});
    await page.evaluate(()=>window.cpInteractionHarness.disable(true));await settle();await page.mouse.up();
    check((await doc()).segments.length===2,'编辑中切到只读会取消在途手势，不提交半完成线');
    await page.evaluate(()=>window.cpInteractionHarness.disable(false));await settle();
    check(errors.length===0,'浏览器组件交互无异常');
    await page.screenshot({path:'output/playwright/cp-interactions.png'});
    return {passed:checks.length,checks,errors};
  }finally{page.off('pageerror',onError);}
}
