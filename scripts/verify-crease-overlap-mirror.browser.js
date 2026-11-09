async page=>{
  const checks=[],check=(value,message)=>{if(!value)throw Error(message);checks.push(message);};
  const canvas=page.locator('.crease-canvas');
  const point=async(x,y)=>{
    const box=await canvas.boundingBox(),view=(await canvas.getAttribute('viewBox')).split(' ').map(Number);
    return [box.x+(x-view[0])*box.width/view[2],box.y+(y-view[1])*box.height/view[3]];
  };
  const draw=async(a,b)=>{await page.mouse.click(...await point(...a));await page.mouse.click(...await point(...b));};
  await page.getByRole('button',{name:'线段',exact:true}).first().click();
  await page.getByRole('button',{name:'谷折',exact:true}).first().click();
  await draw([25,125],[75,125]);
  await page.getByRole('button',{name:'山折',exact:true}).first().click();
  await draw([0,125],[100,125]);
  const overlap=await canvas.locator('[data-segment] line').evaluateAll(lines=>lines.filter(line=>Math.abs(Number(line.getAttribute('y1'))-125)<.001&&Math.abs(Number(line.getAttribute('y2'))-125)<.001).map(line=>({start:Number(line.getAttribute('x1')),end:Number(line.getAttribute('x2')),color:line.getAttribute('stroke')})));
  check(overlap.length>=4&&overlap.every(line=>line.color==='#b23d42'),'长山线覆盖短谷线且无谷线残留');
  await page.getByLabel('吸附',{exact:true}).uncheck();
  await draw([30,50],[50,70]);
  await page.getByRole('button',{name:'谷折',exact:true}).first().click();
  await draw([170.4,40],[170.4,60]);
  await page.getByRole('button',{name:'镜像线段',exact:true}).first().click();
  await page.mouse.click(...await point(40,60));
  await page.mouse.click(...await point(100,95));
  await page.getByRole('button',{name:'确认镜像',exact:true}).click();
  const joined=await canvas.locator('[data-segment] line').evaluateAll(lines=>lines.filter(line=>Number(line.getAttribute('x1'))>160&&Number(line.getAttribute('x1'))<175&&Number(line.getAttribute('y1'))>35&&Number(line.getAttribute('y1'))<65).map(line=>({a:[Number(line.getAttribute('x1')),Number(line.getAttribute('y1'))],b:[Number(line.getAttribute('x2')),Number(line.getAttribute('y2'))],color:line.getAttribute('stroke')})));
  const mountain=joined.find(line=>line.color==='#b23d42'),valleys=joined.filter(line=>line.color==='#315ebe');
  check(!!mountain&&valleys.length===2,'镜像线加入真实交点并切分目标线');
  check(valleys.some(line=>Math.hypot(line.a[0]-mountain.a[0],line.a[1]-mountain.a[1])<1e-5),'镜像端点与目标折痕共用精确交点');
  return {passed:checks.length,checks};
}
