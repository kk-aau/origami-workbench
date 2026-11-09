async page => {
  const checks = [], errors = [], results = [];
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  const origin = await page.evaluate(() => location.origin);
  const simple = {
    vertices_coords: [[0, 0], [100, 0], [200, 0], [200, 100], [100, 100], [0, 100]],
    edges_vertices: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 4]],
    edges_assignment: ['B', 'B', 'B', 'B', 'B', 'B', 'M'],
    edges_foldAngle: [0, 0, 0, 0, 0, 0, -90],
    faces_vertices: [[0, 1, 4, 5], [1, 2, 3, 4]],
  };
  const send = message => page.evaluate(message => window.postMessage(message, location.origin), message);
  const state = () => page.locator('#simulation').evaluate(node => ({ ...node.dataset }));
  const paused = () => page.waitForFunction(() => document.querySelector('#simulation').dataset.status === 'paused');
  const delta = (a, b) => Math.max(0, ...a.map((value, index) => Math.abs(value - b[index])));
  const vertex = (positions, index) => positions.slice(index * 3, index * 3 + 3);
  const distance = (a, b) => Math.hypot(...a.map((value, axis) => value - b[axis]));
  let revision = '';
  const capture = () => page.evaluate(revision => new Promise((resolve, reject) => {
    const requestId = 'local-sculpt-' + crypto.randomUUID();
    const timer = setTimeout(() => { window.removeEventListener('message', listener); reject(Error('姿态捕获超时')); }, 10000);
    const listener = event => {
      if (event.data?.type !== 'zhezhi-sim-pose' || event.data.requestId !== requestId) return;
      clearTimeout(timer); window.removeEventListener('message', listener);
      event.data.error ? reject(Error(event.data.error)) : resolve(event.data.pose);
    };
    window.addEventListener('message', listener);
    window.postMessage({ type: 'zhezhi-sim-capture-pose', revision, requestId }, location.origin);
  }), revision);
  // FOLD export is deliberately used while dragging: capturePose ends the gesture.
  const livePositions = async () => {
    const count = await page.evaluate(() => window.__localSculptExports.length);
    await send({ type: 'zhezhi-sim-export-fold' });
    await page.waitForFunction(count => window.__localSculptExports.length > count, count);
    return page.evaluate(async () => {
      const fold = JSON.parse(await window.__localSculptExports.at(-1));
      return fold.vertices_coords.flatMap(([x, y, z]) => [x, z, -y]);
    });
  };
  const visiblePoints = pose => page.evaluate(async pose => {
    const [{ prepareSimulationDocument }, { OrigamiModel }, cameraModule, { pickSimulationVertex }] = await Promise.all([
      import('/src/engine/simmodel.ts'),
      import('/vendor/simulator/oristudio/packages/origami-simulator/src/model.ts'),
      import('/vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera.ts'),
      import('/src/engine/simInteraction.ts'),
    ]);
    const { prepared } = prepareSimulationDocument(pose.source), model = new OrigamiModel(prepared);
    const canvas = document.querySelector('#simulation'), rect = canvas.getBoundingClientRect();
    const center = cameraModule.centroid(model.originalPositions);
    const camera = cameraModule.cameraUniforms(pose.view, center, cameraModule.boundingRadius(model.originalPositions, center), canvas.width, canvas.height);
    const positions = new Float32Array(pose.solver.positions), screen = cameraModule.projectVertices(positions, camera).screen;
    return Array.from({ length: positions.length / 3 }, (_, index) => {
      const x = screen[index * 2], y = screen[index * 2 + 1];
      const pick = pickSimulationVertex(positions, camera, x, y, 14 * canvas.width / rect.width, prepared.indices);
      return { index, x: rect.x + x / canvas.width * rect.width, y: rect.y + y / canvas.height * rect.height, visible: pick?.index === index };
    }).filter(point => point.visible && point.x > rect.x + 125 && point.x < rect.right - 25 && point.y > rect.y + 110 && point.y < rect.bottom - 60);
  }, pose);
  const supportIndices = (source, positions, index, pins) => page.evaluate(async ({ source, positions, index, pins }) => {
    const [{ prepareSimulationDocument }, { simulationSculptSupports }] = await Promise.all([
      import('/src/engine/simmodel.ts'), import('/src/engine/simSculpt.ts'),
    ]);
    return simulationSculptSupports(prepareSimulationDocument(source).prepared, positions, index, pins)?.map(pin => pin.index) ?? [];
  }, { source, positions, index, pins });
  const mode = async name => {
    const control = page.getByRole('button', { name, exact: true });
    if (await control.getAttribute('aria-pressed') !== 'true') await control.click();
  };
  const begin = async (pose, point, dx, dy, label) => {
    await page.mouse.move(point.x, point.y); await page.mouse.down();
    check((await state()).grabbed === String(point.index), `${label} 命中可见顶点 ${point.index}`);
    await page.mouse.move(point.x + dx, point.y + dy, { steps: 5 });
    await page.waitForTimeout(100);
    check((await state()).grabbed === String(point.index), `${label} 持续拖动不切换顶点`);
    const first = await livePositions();
    const supports = await supportIndices(pose.source, first, point.index, pose.solver.pins);
    check(supports.length + pose.solver.pins.length >= 3 && !supports.includes(point.index), `${label} 具有远处纸面支撑`);
    check(Number((await state()).pinned) === pose.solver.pins.length, `${label} 临时支撑不增加用户固定点数量`);
    // Move again while still holding the pointer. A stationary remote sheet must
    // remain fixed even as the picked vertex follows the second pointer motion.
    await page.mouse.move(point.x + dx * 1.4, point.y + dy * 1.4, { steps: 4 });
    await page.waitForTimeout(200);
    const during = await livePositions();
    const supportError = Math.max(0, ...supports.map(index => delta(vertex(first, index), vertex(during, index))));
    const movement = distance(vertex(first, point.index), vertex(during, point.index));
    check(supportError < 2e-6, `${label} 拖动期间远端支撑不移动（${supportError.toExponential(2)}）`);
    check(movement > 1e-4, `${label} 支撑保持原位时被拖顶点仍继续移动（${movement.toExponential(2)}）`);
    await page.mouse.up(); await paused();
    const after = await capture();
    const releaseJump = delta(vertex(during, point.index), vertex(after.solver.positions, point.index));
    check(releaseJump < 2e-6, `${label} 松手不居中、不跳回原位置（${releaseJump.toExponential(2)}）`);
    check(after.solver.pins.length === pose.solver.pins.length, `${label} 保存姿态不含临时支撑`);
    check(after.progress === pose.progress && JSON.stringify(after.source) === JSON.stringify(pose.source), `${label} 塑形不改折叠目标或原始折痕`);
    check(JSON.stringify(after.settings) === JSON.stringify(pose.settings), `${label} 松手恢复原材料设置`);
    return { after, supports, supportError, movement, releaseJump, index: point.index };
  };
  try {
    await page.setViewportSize({ width: 1100, height: 760 });
    for (const backend of ['webgl2', 'cpu']) for (const fixture of ['two-faces', 'ring']) {
      const label = `${backend}/${fixture}`; revision = `local-sculpt-${label}`;
      await page.goto(`${origin}/simulator/index.html${backend === 'cpu' ? '?backend=cpu' : ''}`);
      await page.waitForFunction(() => document.querySelector('#simulation')?.dataset.status === 'ready');
      await page.evaluate(() => {
        window.__localSculptExports = [];
        const create = URL.createObjectURL.bind(URL);
        URL.createObjectURL = blob => { window.__localSculptExports.push(blob.text()); return create(blob); };
        document.addEventListener('click', event => { if (event.target instanceof HTMLAnchorElement && event.target.download) event.preventDefault(); }, true);
      });
      const source = fixture === 'two-faces' ? simple : await page.evaluate(async () => {
        const response = await fetch('/tests/fixtures/simulation-self-contact-default-ring.fold.json');
        if (!response.ok) throw Error(`环状 fixture HTTP ${response.status}`);
        return response.json();
      });
      await send({ type: 'zhezhi-sim-load', fold: source, revision });
      await page.waitForFunction(backend => document.querySelector('#simulation')?.dataset.backend === backend, backend);
      await send({ type: 'zhezhi-sim-reset' }); await paused();
      await send({ type: 'zhezhi-sim-camera', preset: 'isometric' });
      await send({ type: 'zhezhi-sim-progress', value: fixture === 'ring' ? .2 : .55 });
      await page.waitForFunction(() => Number(document.querySelector('#simulation').dataset.steps) >= 300);
      await send({ type: 'zhezhi-sim-pause' }); await paused();
      await send({ type: 'zhezhi-sim-solver-settings', settings: { timeStepScale: .05, damping: .5, maxStepsPerFrame: 8 } });
      await send({ type: 'zhezhi-sim-pause' }); await paused();
      await mode('顶点塑形');
      const before = await capture(), candidates = await visiblePoints(before);
      check(candidates.length >= 2, `${label} 实际折叠网格包含可抓取顶点`);
      check(before.progress > 0 && before.solver.pins.length === 0, `${label} 从非零折叠目标且无用户固定点开始`);
      if (fixture === 'ring') check(before.solver.positions.length / 3 >= 72, `${label} 使用完整环状镶嵌网格`);
      // Start a nearby, different target immediately before the gesture. Merely
      // resuming an already converged pose lets the CPU finish before pointerdown.
      // Keep a small frame cap so both real backends are still actively solving.
      before.progress = Math.round((before.progress + .05) * 100) / 100;
      await send({ type: 'zhezhi-sim-progress', value: before.progress });
      check((await state()).status === 'running', `${label} 塑形前正在求解折叠目标`);
      const first = await begin(before, candidates[0], 12, -9, `${label}/第一次`);
      const held = await state(); await page.waitForTimeout(2200);
      const idle = await capture(), idleError = delta(first.after.solver.positions, idle.solver.positions);
      check((await state()).status === 'paused' && (await state()).steps === held.steps && idleError === 0, `${label} 松手 2.2 秒后姿态完全保留且步数不增加`);
      check(Number((await state()).maxVelocity) === 0, `${label} 松手清除全网速度`);
      const nextPoints = await visiblePoints(idle);
      const secondPoint = nextPoints.find(point => point.index === first.index) ?? nextPoints[0];
      check(!!secondPoint, `${label} 塑形后的当前位置仍可继续拾取`);
      const second = await begin(idle, secondPoint, -8, 6, `${label}/第二次`);
      check(delta(first.after.solver.positions, second.after.solver.positions) > 1e-4, `${label} 第二次塑形基于现状产生新形状`);
      await page.keyboard.press('Control+z');
      check(delta((await capture()).solver.positions, first.after.solver.positions) < 1e-6, `${label} 撤销第二次塑形恢复第一次结果`);
      await page.keyboard.press('Control+Shift+z');
      check(delta((await capture()).solver.positions, second.after.solver.positions) < 1e-6, `${label} 重做恢复第二次结果`);
      const pinPoints = await visiblePoints(second.after);
      const pinPoint = pinPoints.filter(point => point.index !== second.index).sort((a, b) => distance(vertex(second.after.solver.positions, b.index), vertex(second.after.solver.positions, second.index)) - distance(vertex(second.after.solver.positions, a.index), vertex(second.after.solver.positions, second.index)))[0];
      check(!!pinPoint, `${label} 存在可固定的另一顶点`);
      await mode('固定点'); await page.mouse.click(pinPoint.x, pinPoint.y);
      const pinned = await capture();
      check(pinned.solver.pins.length === 1 && pinned.solver.pins[0].index === pinPoint.index, `${label} 用户固定点正确登记`);
      await mode('顶点塑形');
      const unpinnedPoints = (await visiblePoints(pinned)).filter(point => point.index !== pinPoint.index);
      const thirdPoint = unpinnedPoints.find(point => point.index === second.index) ?? unpinnedPoints[0];
      const third = await begin(pinned, thirdPoint, 6, -4, `${label}/带固定点`);
      const pinError = delta(vertex(third.after.solver.positions, pinPoint.index), pinned.solver.pins[0].position);
      check(pinError < 1e-6 && third.after.solver.pins.length === 1, `${label} 塑形后仅保留真实用户固定点且位置不变`);
      await send({ type: 'zhezhi-sim-load', fold: source, revision, pose: third.after }); await paused();
      const restored = await capture();
      check(delta(restored.solver.positions, third.after.solver.positions) < 1e-6 && restored.solver.pins.length === 1, `${label} 保存姿态重新载入保持形状且不带临时支撑`);
      await send({ type: 'zhezhi-sim-solver-settings', settings: { damping: .55 } });
      await page.waitForTimeout(200);
      const adjusted = await capture();
      check((await state()).status === 'paused' && adjusted.settings.damping === .55 && delta(adjusted.solver.positions, restored.solver.positions) === 0, `${label} 暂停后调节阻尼保持塑形结果，不启动旧目标求解`);
      results.push({ backend, fixture, vertices: before.solver.positions.length / 3, grabbed: first.index, supportCount: first.supports.length, supportError: Math.max(first.supportError, second.supportError, third.supportError), releaseJump: Math.max(first.releaseJump, second.releaseJump, third.releaseJump), idleError, pinError });
    }
    check(errors.length === 0, '局部塑形全流程无页面异常');
    return { passed: checks.length, checks, results, errors };
  } catch (error) {
    throw Error(`${error.message}; 已通过 ${checks.length} 项; 状态=${JSON.stringify(await state().catch(() => ({})))}`);
  } finally {
    await page.mouse.up().catch(() => {}); page.off('pageerror', onError);
  }
}
