async page=>{
  const checks=[];
  const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
  const button=name=>page.getByRole('button',{name,exact:true});
  await page.setViewportSize({width:1000,height:720});
  await page.goto('http://127.0.0.1:8817');
  if(await button('保留当前工程').count())await button('保留当前工程').click();
  await button('保存工程').click();
  await page.locator('.save-dot.saved').waitFor();
  await button('镶嵌设计').click();
  await button('05 原始—对偶').click();
  await button('载入 2×2 保存例 · In[3354]').waitFor();

  const responsePromise=page.waitForResponse(response=>response.url().endsWith('/api/tessellate')&&
    response.request().postDataJSON()?.faceupFace===3);
  await button('载入 2×2 保存例 · In[3354]').click();
  const response=await responsePromise,params=response.request().postDataJSON(),body=await response.json();
  check(response.status()===200,'保存例从真实构造接口返回 200');
  check(params.family==='primal-dual'&&params.motherParams?.family==='custom'&&
    params.motherParams.vertices.length===9&&params.motherParams.faces.length===4,
    '按钮提交九顶点、四方格自定义母结构');
  check(params.paper===undefined&&params.pruneBoundary===undefined&&params.dualEdgeFlips===undefined&&
    params.visibleTopFace===undefined&&params.dualTargets===undefined,
    '按钮清除默认纸张及上一个候选的附加约束');
  check(params.parameterization==='gamma-alpha'&&params.gamma===2&&params.pleatAngle===20&&
    params.twistDirection==='ccw'&&params.postRotation==='primal'&&params.faceupFace===3,
    '按钮提交 γ=2、α=20°、CCW、原始面定向、FaceupFace=3');
  check(body.stats.edges===24&&['geometry','local','lff'].every(key=>body.stats.checks[key]?.status==='passed'),
    '真实 24 边图通过几何、局部和 LFF 检查');
  await page.locator('.tess-checks span').filter({hasText:'层序已解 · 唯一'}).waitFor({timeout:30000});
  await page.locator('.tess-preview-status').filter({hasText:'层序已解 · 唯一'}).waitFor();
  check(await button('采用折痕副本 →').isEnabled(),'唯一层序在界面可见，候选可采用');
  check(await button('FaceupFace · 正 F3').count()===1,'界面显示 FaceupFace 正 F3');
  if(await button('保留当前工程').count())await button('保留当前工程').click();
  if(await button('关闭操作提示').count())await button('关闭操作提示').click();
  await page.screenshot({path:'output/playwright/p39-in3354-saved-ui-20260928.png'});

  await button('采用折痕副本 →').click();
  await page.getByLabel('工程名称').fill('P39 In3354 保存例验收');
  await button('保存工程').click();
  await page.locator('.save-dot.saved').waitFor();
  await page.reload();
  if(await button('保留当前工程').count())await button('保留当前工程').click();
  await button('工程库').click();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('.project-list button').filter({hasText:'P39 In3354 保存例验收'}).first().click();
  await page.waitForFunction(()=>document.querySelector('input[aria-label="工程名称"]')?.value==='P39 In3354 保存例验收');
  await button('镶嵌设计').click();
  await button('读取工程参数').click();
  await button('FaceupFace · 正 F3').waitFor();
  check(await page.getByLabel('褶角 α',{exact:true}).inputValue()==='20'&&
    await page.getByLabel('比例 γ',{exact:true}).inputValue()==='2',
    '工程读回后恢复 γ=2、α=20° 与 FaceupFace 正 F3');
  await button('编辑母结构参数').click();
  const mother=JSON.parse(await page.getByLabel('原始对偶母结构 JSON').inputValue());
  check(JSON.stringify(mother)===JSON.stringify(params.motherParams),
    '工程读回后恢复同一九顶点、四方格母结构');
  await button('关闭镶嵌窗口').click();
  await button('原始对偶参数设置').click();
  check(await page.getByLabel('图样定向').inputValue()==='primal'&&
    await page.getByLabel('原始对偶参数方式').inputValue()==='gamma-alpha',
    '工程读回后恢复原始面定向及 γ／α 参数方式');
  await button('关闭镶嵌窗口').click();
  await page.locator('.tess-checks span').filter({hasText:'层序已解 · 唯一'}).waitFor({timeout:30000});
  check(await button('采用折痕副本 →').isEnabled(),'参数读回后仍是可采用的唯一层序');
  return {passed:checks.length,checks};
}
