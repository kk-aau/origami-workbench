async page => {
  const checks = [], errors = [], results = {};
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  const errorListener = error => errors.push(error.message);
  page.on('pageerror', errorListener);
  const source = {
    vertices_coords: [[0, 0], [100, 0], [200, 0], [200, 100], [100, 100], [0, 100]],
    edges_vertices: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 4]],
    edges_assignment: ['B', 'B', 'B', 'B', 'B', 'B', 'M'],
    edges_foldAngle: [0, 0, 0, 0, 0, 0, -90],
    faces_vertices: [[0, 1, 4, 5], [1, 2, 3, 4]],
  };
  const canvas = () => page.locator('#simulation');
  const state = () => canvas().evaluate(node => ({ ...node.dataset }));
  const send = message => page.evaluate(message => window.postMessage(message, location.origin), message);
  const distance = (a, b) => Math.hypot(...a.map((value, axis) => value - b[axis]));
  const readFold = async () => {
    const before = await page.evaluate(() => window.__grabStabilityBlobs.length);
    await send({ type: 'zhezhi-sim-export-fold' });
    await page.waitForFunction(before => window.__grabStabilityBlobs.length > before, before);
    return page.evaluate(async () => JSON.parse(await window.__grabStabilityBlobs.at(-1)));
  };
  const projections = async (fold, frame) => page.evaluate(async ({ fold, frame }) => {
    const { cameraUniforms, projectVertices, centroid, boundingRadius } = await import('/vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera.ts');
    const canvas = document.querySelector('#simulation'), rect = canvas.getBoundingClientRect();
    const points = new Float32Array(fold.vertices_coords.flatMap(([x, y, z]) => [x, z, -y]));
    const initial = new Float32Array(frame.vertices_coords.flatMap(([x, y, z]) => [x, z, -y]));
    const origin = centroid(initial), radius = boundingRadius(initial, origin);
    const camera = cameraUniforms({ yaw: Number(canvas.dataset.yaw), pitch: Number(canvas.dataset.pitch), zoom: .88 }, origin, radius, canvas.width, canvas.height);
    const screen = projectVertices(points, camera).screen;
    return fold.vertices_coords.map((_, index) => ({ index, x: rect.x + screen[2 * index] / canvas.width * rect.width, y: rect.y + screen[2 * index + 1] / canvas.height * rect.height }));
  }, { fold, frame });
  const waitPaused = () => page.waitForFunction(() => document.querySelector('#simulation').dataset.status === 'paused');
  const reset = async () => {
    await send({ type: 'zhezhi-sim-reset' }); await waitPaused();
    await send({ type: 'zhezhi-sim-camera', preset: 'front' });
    await page.waitForFunction(() => document.querySelector('#simulation').dataset.view === 'front');
  };
  const beginDrag = async (frame, dx = 22, dy = -12) => {
    const fold = await readFold(), points = await projections(fold, frame);
    const point = points[0];
    await page.mouse.move(point.x, point.y); await page.mouse.down();
    const active = await state();
    check(active.grabbed !== undefined, '顶点命中后进入抓取状态');
    await page.mouse.move(point.x + dx, point.y + dy, { steps: 6 });
    await page.waitForTimeout(90);
    return { index: Number(active.grabbed), fold, point };
  };
  try {
    await page.setViewportSize({ width: 1100, height: 760 });
    const origin = await page.evaluate(() => location.origin);
    for (const backend of ['webgl2', 'cpu']) {
      await page.goto(`${origin}/simulator/index.html${backend === 'cpu' ? '?backend=cpu' : ''}`);
      await page.waitForFunction(() => document.querySelector('#simulation')?.dataset.status === 'ready');
      await page.evaluate(() => {
        window.__grabStabilityBlobs = [];
        const create = URL.createObjectURL.bind(URL);
        URL.createObjectURL = blob => { window.__grabStabilityBlobs.push(blob.text()); return create(blob); };
        document.addEventListener('click', event => { if (event.target instanceof HTMLAnchorElement && event.target.download) event.preventDefault(); }, true);
      });
      await send({ type: 'zhezhi-sim-load', fold: source, revision: `grab-stability-${backend}` });
      await page.waitForFunction(backend => document.querySelector('#simulation')?.dataset.backend === backend, backend);
      await reset();
      check((await state()).backend === backend, `${backend} 使用指定真实求解后端`);
      const frame = await readFold();
      const point = (await projections(frame, frame))[0], start = await state();
      await page.mouse.move(point.x, point.y); await page.mouse.down();
      await page.mouse.move(point.x + 20, point.y - 10, { steps: 5 }); await page.mouse.up();
      check((await state()).grabbed === undefined, `${backend} 普通拖动不抓取顶点`);
      check(Math.abs(Number((await state()).yaw) - .14) < 1e-7, `${backend} 普通拖动按CSS距离旋转`);
      check(JSON.stringify((await readFold()).vertices_coords) === JSON.stringify(frame.vertices_coords) && (await state()).steps === start.steps, `${backend} 旋转不改变原始FOLD坐标或求解步数`);
      await reset();
      const miss = { x: 1040, y: 650 };
      await page.keyboard.down('Shift');
      await page.mouse.move(miss.x, miss.y); await page.mouse.down();
      await page.mouse.move(miss.x - 30, miss.y - 15, { steps: 4 }); await page.mouse.up();
      await page.keyboard.up('Shift');
      check(Number((await state()).yaw) === 0 && Number((await state()).pitch) === 0, `${backend} Shift未命中不误旋转`);
      await page.getByRole('button', { name: '顶点塑形', exact: true }).click();
      await page.mouse.move(miss.x, miss.y); await page.mouse.down();
      await page.mouse.move(miss.x - 30, miss.y - 15, { steps: 4 }); await page.mouse.up();
      check(Number((await state()).yaw) === 0 && Number((await state()).pitch) === 0, `${backend} 顶点塑形模式未命中不误旋转`);
      await page.mouse.move(point.x, point.y);
      await page.waitForFunction(() => !document.querySelector('#vertex-marker').hidden);
      check(await page.locator('#vertex-marker').getAttribute('data-state') === 'hover', `${backend} 悬停可见顶点显示命中标记`);
      const clickBefore = await readFold(), clickState = await state();
      await page.mouse.down();
      check(await page.locator('#vertex-marker').getAttribute('data-state') === 'grab', `${backend} 按住后显示抓取标记`);
      await page.waitForTimeout(150); await page.mouse.up();
      check((await state()).steps === clickState.steps && (await state()).status === 'paused' && JSON.stringify((await readFold()).vertices_coords) === JSON.stringify(clickBefore.vertices_coords), `${backend} 只点击顶点不启动求解或移动纸面`);
      const grabbed = await beginDrag(frame);
      await page.waitForTimeout(250);
      const during = await readFold();
      check(distance(during.vertices_coords[grabbed.index], grabbed.fold.vertices_coords[grabbed.index]) > .025, `${backend} 拖动修改实际网格顶点`);
      await page.mouse.up(); await waitPaused();
      const released = await readFold(), stopped = await state();
      const releaseJump = distance(released.vertices_coords[grabbed.index], during.vertices_coords[grabbed.index]);
      check(releaseJump < 2e-6, `${backend} 松手保留被拖顶点位置、不重新居中（误差${releaseJump.toExponential(2)}）`);
      check((await state()).grabbed === undefined && Number((await state()).maxVelocity) === 0, `${backend} 松手清除抓取状态和全网速度`);
      const localMotion = released.vertices_coords.map((point, index) => distance(point, frame.vertices_coords[index]));
      check(Math.max(...localMotion) > .005 && Math.max(...localMotion) - Math.min(...localMotion) > .005 && localMotion.filter(value => value < 2e-6).length >= 3, `${backend} 保留纸面局部形变，远处支撑没有跟随整张平移`);
      await page.waitForTimeout(700);
      check((await state()).steps === stopped.steps && JSON.stringify((await readFold()).vertices_coords) === JSON.stringify(released.vertices_coords), `${backend} 原暂停状态恢复，松手后无额外求解或漂移`);
      await page.screenshot({ path: `output/playwright/simulation-grab-stability-${backend}.png` });
      for (const method of ['pointercancel', 'lostpointercapture', 'blur', 'hidden', 'Escape', 'mode']) {
        await reset();
        if ((await state()).interaction !== 'grab') await page.getByRole('button', { name: '顶点塑形', exact: true }).click();
        const cancelledGrab = await beginDrag(frame, 14, -8), beforeCancel = await readFold();
        if (method === 'pointercancel' || method === 'lostpointercapture') await canvas().evaluate((node, type) => node.dispatchEvent(new PointerEvent(type, { pointerId: 1, bubbles: true })), method);
        else if (method === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        else if (method === 'hidden') await page.evaluate(() => {
          const descriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
          Object.defineProperty(document, 'hidden', { configurable: true, value: true });
          document.dispatchEvent(new Event('visibilitychange'));
          if (descriptor) Object.defineProperty(document, 'hidden', descriptor); else delete document.hidden;
        });
        else if (method === 'Escape') await page.keyboard.press('Escape');
        else await page.locator('#vertex-grab').evaluate(node => node.click());
        await page.mouse.up();
        const cancelled = await readFold();
        check((await state()).grabbed === undefined && distance(cancelled.vertices_coords[cancelledGrab.index], beforeCancel.vertices_coords[cancelledGrab.index]) < 2e-6, `${backend} ${method}释放约束并保留被拖顶点位置`);
        const cancelledSteps = (await state()).steps;
        await page.waitForTimeout(100);
        check((await state()).status === 'paused' && (await state()).steps === cancelledSteps, `${backend} ${method}恢复暂停且无残留拖动`);
      }
      results[backend] = { releaseJump, localMotion };
    }
    const numerical = await page.evaluate(async source => {
      const base = '/vendor/simulator/oristudio/packages/origami-simulator/src/';
      const [{ prepareFoldModel }, { OrigamiModel }, { ReferenceSolver }, { WebglSolver }, { centroid }] = await Promise.all([
        import(base + 'prepare.ts'), import(base + 'model.ts'), import(base + 'referenceSolver.ts'), import(base + 'webgl/webglSolver.ts'), import(base + 'webgl/camera.ts'),
      ]);
      const output = {};
      for (const backend of ['webgl2', 'cpu']) {
        const prepared = prepareFoldModel(source), model = new OrigamiModel(prepared);
        const solver = backend === 'webgl2' ? new WebglSolver(document.createElement('canvas'), model, { foldPercent: 45 }) : new ReferenceSolver(model, { foldPercent: 45 });
        const positions = new Float32Array(prepared.vertexCount * 3);
        const read = () => { solver.readPositions(positions); return positions.slice(); };
        const centerError = (a, b) => Math.hypot(...a.map((n, k) => n - b[k]));
        try {
          const origin = centroid(read());
          solver.step(1800);
          let before = read();
          solver.setVertexConstraint(0, [before[0] + .16, before[1] + .08, before[2] - .04]);
          solver.step(160);
          solver.setVertexConstraint(0, null);
          before = read(); const oldCenter = centroid(before), steps = solver.stepCount;
          solver.recenter(origin);
          const after = read(), actualCenter = centroid(after), velocity = solver.maxVelocity();
          let shapeError = 0;
          for (let i = 0; i < before.length; i++) shapeError = Math.max(shapeError, Math.abs((after[i] - actualCenter[i % 3]) - (before[i] - oldCenter[i % 3])));
          const recenterStepCount = solver.stepCount;
          const drift = [];
          for (let block = 0; block < 8; block++) { solver.step(1000); drift.push(centerError(centroid(read()), origin)); }
          output[backend] = { centerError: centerError(actualCenter, origin), velocity, shapeError, steps, recenterStepCount, drift, finite: Array.from(read()).every(Number.isFinite) };
        } finally { solver.dispose(); }
      }
      return output;
    }, source);
    for (const [backend, result] of Object.entries(numerical)) {
      check(result.centerError < 2e-6, `${backend} 后端recenter精确同步实际位置重心`);
      check(result.velocity === 0, `${backend} 后端recenter清零全部顶点速度`);
      check(result.shapeError < 2e-6 && result.steps === result.recenterStepCount, `${backend} 后端recenter保留相对形状与步数`);
      check(result.finite && Math.max(...result.drift) < 3e-4, `${backend} 释放后8000步无持续平移（最大${Math.max(...result.drift).toExponential(2)}）`);
    }
    check(errors.length === 0, '页面无未捕获脚本错误');
    return { passed: checks.length, checks, ui: results, numerical, errors };
  } finally {
    await page.keyboard.up('Shift').catch(() => {});
    await page.mouse.up().catch(() => {});
    page.off('pageerror', errorListener);
  }
}
