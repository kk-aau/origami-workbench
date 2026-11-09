async page => {
  const checks = [], errors = [], consoleErrors = [];
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  const onError = error => errors.push(error.message);
  const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
  page.on('pageerror', onError); page.on('console', onConsole);
  const origin = await page.evaluate(() => location.origin);
  const source = {
    vertices_coords: [[0, 0], [100, 0], [200, 0], [200, 100], [100, 100], [0, 100]],
    edges_vertices: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 4]],
    edges_assignment: ['B', 'B', 'B', 'B', 'B', 'B', 'M'],
    edges_foldAngle: [0, 0, 0, 0, 0, 0, -90], faces_vertices: [[0, 1, 4, 5], [1, 2, 3, 4]],
  };
  const send = data => page.evaluate(data => window.postMessage(data, location.origin), data);
  const state = () => page.locator('#simulation').evaluate(node => ({ ...node.dataset }));
  const setup = async backend => {
    await page.goto(`${origin}/simulator/index.html${backend === 'cpu' ? '?backend=cpu' : ''}`);
    await page.waitForFunction(() => document.querySelector('#simulation')?.dataset.status === 'ready');
    await send({ type: 'zhezhi-sim-load', fold: source, revision: `teardown-${backend}` });
    await page.waitForFunction(backend => document.querySelector('#simulation')?.dataset.backend === backend, backend);
    await send({ type: 'zhezhi-sim-reset' });
    await page.waitForFunction(() => document.querySelector('#simulation').dataset.status === 'paused');
    await send({ type: 'zhezhi-sim-camera', preset: 'front' });
    await page.getByRole('button', { name: '顶点塑形', exact: true }).click();
    return page.evaluate(async source => {
      const { prepareSimulationDocument } = await import('/src/engine/simmodel.ts');
      const { cameraUniforms, projectVertices, centroid, boundingRadius } = await import('/vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera.ts');
      const { prepared } = prepareSimulationDocument(source), points = prepared.positions;
      const canvas = document.querySelector('#simulation'), rect = canvas.getBoundingClientRect(), center = centroid(points);
      const camera = cameraUniforms({ yaw: 0, pitch: 0, zoom: .88 }, center, boundingRadius(points, center), canvas.width, canvas.height);
      const screen = projectVertices(points, camera).screen;
      return { x: rect.x + screen[0] / canvas.width * rect.width, y: rect.y + screen[1] / canvas.height * rect.height };
    }, source);
  };
  const interact = async (point, mode) => {
    await page.mouse.move(point.x, point.y);
    await page.waitForFunction(() => !document.querySelector('#vertex-marker').hidden);
    if (mode === 'active') {
      await page.mouse.down(); await page.mouse.move(point.x + 12, point.y - 7, { steps: 4 });
      await page.waitForTimeout(35);
    }
  };
  try {
    await page.setViewportSize({ width: 1100, height: 760 });
    for (const backend of ['webgl2', 'cpu']) {
      for (const mode of ['hover', 'active']) {
        const point = await setup(backend); await interact(point, mode);
        check((await state()).hovered !== undefined && (mode !== 'active' || (await state()).grabbed !== undefined), `${backend} ${mode}离开前存在真实顶点交互`);
        const beforeErrors = errors.length, beforeConsole = consoleErrors.length;
        const after = await page.evaluate(() => {
          window.dispatchEvent(new PageTransitionEvent('pagehide'));
          const hidden = Object.getOwnPropertyDescriptor(document, 'hidden');
          Object.defineProperty(document, 'hidden', { configurable: true, value: true });
          document.dispatchEvent(new Event('visibilitychange'));
          window.dispatchEvent(new Event('blur'));
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
          window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }));
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
          window.dispatchEvent(new Event('resize'));
          // Browsers can dispatch overlapping lifecycle notifications. Disposal
          // must be idempotent, and no marker may read destroyed GPU textures.
          window.dispatchEvent(new PageTransitionEvent('pagehide'));
          if (hidden) Object.defineProperty(document, 'hidden', hidden); else delete document.hidden;
          const canvas = document.querySelector('#simulation');
          return { grabbed: canvas.dataset.grabbed, hovered: canvas.dataset.hovered, markerHidden: document.querySelector('#vertex-marker').hidden };
        });
        await page.mouse.up(); await page.mouse.move(point.x + 20, point.y + 10); await page.waitForTimeout(100);
        check(after.grabbed === undefined && after.hovered === undefined && after.markerHidden, `${backend} ${mode}pagehide清除约束与标记`);
        check(errors.length === beforeErrors && consoleErrors.length === beforeConsole, `${backend} ${mode}释放后visibilitychange/blur/Shift/Esc/resize与再次pagehide均无已销毁资源访问`);
      }
      const point = await setup(backend); await interact(point, 'active');
      const before = errors.length, beforeConsole = consoleErrors.length;
      await page.goto('about:blank'); await page.mouse.up(); await page.waitForTimeout(150);
      check(errors.length === before && consoleErrors.length === beforeConsole, `${backend} 实际导航离开正在拖动的页面不产生异常`);
      await setup(backend);
      check((await state()).backend === backend && (await state()).status === 'paused', `${backend} 导航返回后可重新建立并暂停新求解器`);
    }
    check(errors.length === 0 && consoleErrors.length === 0, '销毁回归无页面错误及控制台错误');
    return { passed: checks.length, checks, errors, consoleErrors };
  } finally {
    await page.mouse.up().catch(() => {});
    page.off('pageerror', onError); page.off('console', onConsole);
  }
}
