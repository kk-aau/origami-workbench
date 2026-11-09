async page => {
  const checks = [], errors = [], layouts = [];
  const check = (condition, label) => { if (!condition) throw Error(label); checks.push(label); };
  const canvas = page.locator('#workspace .crease-canvas');
  const command = page.getByLabel('工具命令', { exact: true });
  const bar = page.locator('.tool-command-bar');
  const button = name => page.getByRole('button', { name, exact: true });
  const activeTool = () => canvas.evaluate(element => Array.from(element.classList).find(value => value.startsWith('tool-'))?.slice(5));
  const waitTool = tool => page.waitForFunction(expected => document.querySelector('#workspace .crease-canvas')?.classList.contains(`tool-${expected}`), tool);
  const canvasFocused = () => canvas.evaluate(element => document.activeElement === element);
  const openInputSettings = async () => {
    await page.locator('.header-actions').getByText('设置', { exact: true }).click();
    await page.getByRole('tab', { name: '命令编辑', exact: true }).click();
    const form = page.locator('[data-storage-settings] .tool-command-settings');
    await form.waitFor(); return form;
  };
  const directEnabled = async () => {
    const form = await openInputSettings();
    const enabled = await form.getByRole('checkbox', { name: '画布直接键入命令', exact: true }).isChecked();
    await form.getByRole('button', { name: '取消', exact: true }).click();
    return enabled;
  };
  const setDirectEnabled = async enabled => {
    const form = await openInputSettings();
    await form.getByRole('checkbox', { name: '画布直接键入命令', exact: true }).setChecked(enabled);
    await form.getByRole('button', { name: '保存并应用', exact: true }).click();
    await page.locator('[data-storage-settings]').waitFor({ state: 'hidden' });
  };
  const segmentCount = () => canvas.locator('[data-segment]').count();
  const waitSegments = count => page.waitForFunction(expected => document.querySelector('#workspace .crease-canvas')?.querySelectorAll('[data-segment]').length === expected, count);
  const seedSelected = async () => await canvas.locator('[data-segment="command-seed"] > circle').count() === 2;
  const execute = async (text, tool, label = text) => {
    const before = await activeTool();
    await command.fill(text);
    check(await activeTool() === before, `${label}: 输入完整命令前不切换当前工具`);
    await command.press('Enter'); await waitTool(tool);
    check(await activeTool() === tool, `${label}: Enter 启用 ${tool} 工具`);
    check(await command.inputValue() === '', `${label}: 执行后清空命令输入`);
    check(await canvasFocused(), `${label}: 执行后焦点回到画布`);
  };
  const upload = async document => page.getByLabel('折痕工程文件', { exact: true }).evaluate((input, text) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([text], 'tool-command-browser.zhezhi.json', { type: 'application/json' }));
    input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  }, JSON.stringify(document));
  const paperPoint = point => canvas.evaluate((element, coordinate) => {
    const view = element.viewBox.baseVal, box = element.getBoundingClientRect();
    return { x: box.left + (coordinate[0] - view.x) / view.width * box.width,
      y: box.top + (coordinate[1] - view.y) / view.height * box.height };
  }, point);
  const layoutState = () => page.evaluate(() => {
    const root = document.scrollingElement, workspace = document.querySelector('#workspace');
    const bar = document.querySelector('.tool-command-bar'), canvas = workspace?.querySelector('.crease-canvas');
    const box = element => { const rect = element.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height }; };
    return { viewport: { width: innerWidth, height: innerHeight }, pageWidth: root.scrollWidth, pageHeight: root.scrollHeight,
      bar: { ...box(bar), clientWidth: bar.clientWidth, clientHeight: bar.clientHeight, scrollWidth: bar.scrollWidth, scrollHeight: bar.scrollHeight },
      canvas: box(canvas), workspace: { clientWidth: workspace.clientWidth, clientHeight: workspace.clientHeight, scrollWidth: workspace.scrollWidth, scrollHeight: workspace.scrollHeight } };
  });
  const pageError = error => errors.push(error.message);
  page.on('pageerror', pageError);
  // The caller opens an isolated production-test page. Do not navigate an
  // existing application and trigger its unsaved-work beforeunload prompt.
  await page.evaluate(() => { window.__toolCommandOriginalConfirm = window.confirm; window.confirm = () => true; });
  const segment = (id, a, b, assignment = 'B', angle = 0) => ({ id, a, b, assignment, angle });
  const source = { format: 'zhezhi-workbench', version: 2, schemaVersion: 2, name: `工具命令回归-${Date.now()}`,
    paper: { width: 100, height: 100 }, segments: [
      segment('command-top', [0, 0], [100, 0]), segment('command-right', [100, 0], [100, 100]),
      segment('command-bottom', [100, 100], [0, 100]), segment('command-left', [0, 100], [0, 0]),
      segment('command-seed', [10, 90], [90, 90], 'M', -180),
    ] };
  try {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.getByLabel('工程名称', { exact: true }).waitFor();
    // Bootstrap may present the initial storage confirmation or recovery bar.
    await page.waitForTimeout(250);
    for (const name of ['设置并开始使用', '关闭窗口', '保留当前工程']) {
      const candidate = button(name);
      if (await candidate.count() && await candidate.isVisible()) await candidate.click();
    }
    await canvas.waitFor(); await command.waitFor();
    check(await directEnabled(), '首次使用默认开启直接键入命令');
    check(!(await command.isDisabled()), '折痕编辑中的命令输入可用');
    await upload(source);
    await page.waitForFunction(name => document.querySelector('[aria-label="工程名称"]')?.value === name, source.name);
    await waitSegments(5);
    check(await segmentCount() === 5, '实际载入四条纸边与一条山折测试图');

    const firstTool = await activeTool();
    await canvas.focus(); await page.keyboard.type('co');
    check(await command.inputValue() === 'co', '从画布直接键入 co 自动进入命令输入');
    check(await activeTool() === firstTool, 'co 输入后仍保持原工具，等待 Enter');
    await command.press('Enter'); await waitTool('copyselection');
    check(await command.inputValue() === '' && await canvasFocused(), 'co 确认后启用复制、清空文字并返回画布焦点');
    await execute('L', 'line'); await execute('LINE', 'line'); await execute('C', 'circle');
    await execute('CO', 'copyselection'); await execute('M', 'moveselection'); await execute('MI', 'mirrorselection');
    await execute('PL', 'parallel'); await execute('PER', 'perpendicular'); await execute('RE', 'rabbitear'); await execute('H','pan');
    await execute('镜像选区', 'mirrorselection', '中文完整工具名');
    await execute('cOpY', 'copyselection', '混合大小写别名');
    await execute('　ｃｏ　', 'copyselection', 'NFKC 全角字母与空格');
    await execute('兔耳构造', 'rabbitear', '中文兔耳构造');

    const boundaryProtection=page.getByLabel('保护边界',{exact:true});
    if(!(await boundaryProtection.isChecked()))await boundaryProtection.check();
    await execute('SELECT', 'select'); await canvas.focus(); await page.keyboard.press('Control+a');
    check(await seedSelected(), 'Ctrl+A 实际选中测试山折');
    check(await canvas.locator('[data-assignment="B"] > circle').count()===0, '全选遵守纸边保护，仅选一条山折');
    await command.fill('co'); await command.press('Escape');
    check(await command.inputValue() === '' && await canvasFocused(), '命令输入内 Esc 取消文字并返回画布');
    check(await seedSelected(), '命令输入内 Esc 保留已有选区');
    await execute('CO', 'copyselection', '保留选区的 CO');
    check(await seedSelected(), '执行复制命令保留实际选区');
    const beforeUnknown = await activeTool();
    await command.fill('NOT-A-TOOL'); await command.press('Enter');
    check(await activeTool() === beforeUnknown, '未知命令不切换工具');
    check(await command.getAttribute('aria-invalid') === 'true' && await bar.getByRole('alert').isVisible(), '未知命令显示可访问的错误状态');
    check((await bar.getByRole('alert').textContent()).includes('未找到命令'), '未知命令显示具体错误文字');
    check(await seedSelected(), '未知命令不清空实际选区');
    await command.press('Escape');
    check(await bar.getByRole('alert').count() === 0 && await command.inputValue() === '', 'Esc 清除未知命令反馈');

    const imeTool = await activeTool();
    await command.fill('C');
    await command.evaluate(input => input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'C' })));
    await command.press('Enter');
    check(await activeTool() === imeTool && await command.inputValue() === 'C', '输入法组字过程的 Enter 不执行工具命令');
    await command.evaluate(input => input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'C' })));
    await command.press('Enter'); await waitTool('circle');
    check(await command.inputValue() === '' && await canvasFocused(), '输入法组字结束后 Enter 正常执行圆工具');
    await command.fill('L');
    await command.evaluate(input => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true, cancelable: true })));
    check(await activeTool() === 'circle' && await command.inputValue() === 'L', '原生 isComposing Enter 不执行命令');
    await command.press('Enter'); await waitTool('line');

    await canvas.focus(); await page.keyboard.press('Control+Shift+a');
    const snap = page.getByLabel('吸附', { exact: true }), snapping = await snap.isChecked();
    if (snapping) await snap.uncheck();
    const start = await paperPoint([30, 30]), end = await paperPoint([70, 70]);
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 5 }); await page.mouse.up();
    await waitSegments(6);
    check(await segmentCount() === 6, 'L 命令启用的线段工具实际新增一条折痕');
    const added = await canvas.locator('[data-segment]').evaluateAll(groups => groups.filter(group => !group.dataset.segment.startsWith('command-')).map(group => {
      const line = group.querySelector('[data-crease-stroke]');
      return [Number(line.getAttribute('x1')), Number(line.getAttribute('y1')), Number(line.getAttribute('x2')), Number(line.getAttribute('y2'))];
    }));
    check(added.length === 1 && added[0].every((value, i) => Math.abs(value - [30, 30, 70, 70][i]) < 0.2), '新增折痕真实毫米坐标对应 [30,30] 至 [70,70]');
    await canvas.focus(); await page.keyboard.press('Control+z'); await waitSegments(5);
    check(await segmentCount() === 5, 'Ctrl+Z 撤销命令工具绘制的折痕');
    await page.keyboard.press('Control+Shift+z'); await waitSegments(6);
    check(await segmentCount() === 6, 'Ctrl+Shift+Z 重做恢复实际折痕');
    if (snapping) await snap.check();

    await execute('CO', 'copyselection', '输入隔离基准');
    const name = page.getByLabel('工程名称', { exact: true });
    await name.focus(); await name.press('End'); await page.keyboard.type('coL');
    check((await name.inputValue()).endsWith('coL'), '工程名称内字母进入工程名称');
    check(await activeTool() === 'copyselection' && await command.inputValue() === '', '工程名称输入不被 CAD 命令捕获');
    await name.fill(source.name);
    const grid = page.getByLabel('网格等分', { exact: true }), oldGrid = await grid.inputValue();
    await grid.focus(); await grid.press('l');
    check(await activeTool() === 'copyselection' && await command.inputValue() === '', '数值框中的字母不被 CAD 命令捕获');
    check(await grid.evaluate(input => document.activeElement === input), '数值框输入保持自身焦点');
    await grid.fill(oldGrid); await grid.press('Tab');
    await button('帮助与版本').click();
    const help = page.getByRole('dialog', { name: '帮助与版本', exact: true }); await help.waitFor();
    await help.getByRole('button', { name: '关闭窗口', exact: true }).focus(); await page.keyboard.type('l');
    check(await activeTool() === 'copyselection' && await command.inputValue() === '' && await command.isDisabled(), '帮助模态内键入字母不激活画布命令');
    await help.getByRole('button', { name: '关闭窗口', exact: true }).click();
    await button('工具目录').click();
    const library = page.locator('dialog.tool-library'); await library.waitFor();
    const search = library.getByLabel('搜索全部工具', { exact: true });
    await search.fill(''); await search.focus(); await page.keyboard.type('coL');
    check(await search.inputValue() === 'coL', '工具目录搜索接受自身输入');
    check(await activeTool() === 'copyselection' && await command.inputValue() === '' && await command.isDisabled(), '工具目录输入不被 CAD 命令捕获');
    await library.getByRole('button', { name: '关闭工具目录', exact: true }).focus(); await page.keyboard.type('l');
    check(await activeTool() === 'copyselection' && await command.inputValue() === '', '工具目录按钮焦点下的字母不会切换画布工具');
    await library.getByRole('button', { name: '关闭工具目录', exact: true }).click();

    await execute('C', 'circle', '关闭直接键入前基准'); await setDirectEnabled(false);
    check(!(await directEnabled()), '设置中的直接键入开关可关闭画布命令');
    await canvas.focus(); await page.keyboard.type('l'); await waitTool('line');
    check(await activeTool() === 'line' && await command.inputValue() === '', '关闭直接键入后画布 L 即时启用线段，不产生命令文字');
    await execute('C', 'circle', '关闭直接键入后命令框仍可用');
    await setDirectEnabled(true); check(await directEnabled(), '设置中的开关可以重新启用直接键入');
    await canvas.focus(); await page.keyboard.type('l');
    check(await activeTool() === 'circle' && await command.inputValue() === 'l', '重新开启后 L 等待 Enter，不即时切换');
    await command.press('Enter'); await waitTool('line');
    check(await command.inputValue() === '' && await canvasFocused(), '重新开启后的 L 确认正确执行并回到画布');

    for (const viewport of [{ width: 1200, height: 800 }, { width: 1000, height: 720 }]) {
      await page.setViewportSize(viewport); await page.waitForTimeout(80);
      const layout = await layoutState(); layouts.push(layout);
      const label = `${viewport.width}×${viewport.height}`;
      check(layout.pageWidth <= viewport.width + 1 && layout.pageHeight <= viewport.height + 1, `${label}: 页面无横向或纵向滚动`);
      check(layout.bar.scrollWidth <= layout.bar.clientWidth + 1 && layout.bar.scrollHeight <= layout.bar.clientHeight + 1,
        `${label}: 命令栏无内部滚动`);
      check(layout.bar.left >= 0 && layout.bar.right <= viewport.width + 1 && layout.bar.top >= 0 && layout.bar.bottom <= viewport.height + 1,
        `${label}: 命令栏完整位于可见画面`);
      check(layout.canvas.width > 150 && layout.canvas.height > 150 && layout.canvas.top >= 0 && layout.canvas.bottom <= viewport.height + 1,
        `${label}: 编辑画布仍保有实际可操作空间`);
      await page.screenshot({ path: `output/playwright/tool-command-${label}.png` });
      await canvas.focus(); await page.keyboard.type('co');
      check(await activeTool() === 'line' && await command.inputValue() === 'co', `${label}: 小尺寸画布直接输入仍等待确认`);
      await page.screenshot({ path: `output/playwright/tool-command-${label}-pending.png` });
      await command.press('Escape');
    }
    check(errors.length === 0, '完整工具命令流程没有页面运行异常');
    return { passed: checks.length, checks, layouts, errors };
  } catch (error) {
    throw Error(`${error.message}; 已通过 ${checks.length} 项；最近检查=${JSON.stringify(checks.slice(-4))}`);
  } finally {
    page.off('pageerror', pageError);
    await command.evaluate(input => input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }))).catch(() => {});
    await page.evaluate(() => {
      if (window.__toolCommandOriginalConfirm) { window.confirm = window.__toolCommandOriginalConfirm; delete window.__toolCommandOriginalConfirm; }
    }).catch(() => {});
  }
}
