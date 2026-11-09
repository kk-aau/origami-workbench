async page => {
  const checks = [], errors = [], metrics = {};
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  const errorListener = error => errors.push(error.message); page.on('pageerror', errorListener);
  const origin = await page.evaluate(() => location.origin);
  const fold = {
    vertices_coords: [[0, 0], [100, 0], [200, 0], [200, 100], [100, 100], [0, 100]],
    edges_vertices: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 4]],
    edges_assignment: ['B', 'B', 'B', 'B', 'B', 'B', 'M'],
    edges_foldAngle: [0, 0, 0, 0, 0, 0, -90], faces_vertices: [[0, 1, 4, 5], [1, 2, 3, 4]],
  };
  const send = data => page.evaluate(data => window.postMessage(data, location.origin), data);
  const sendObserved = data => page.evaluate(data => new Promise(resolve => {
    const observed = event => {
      if (event.source !== window || event.data?.type !== data.type) return;
      window.removeEventListener('message', observed);
      resolve({ ...document.querySelector('#simulation').dataset });
    };
    window.addEventListener('message', observed); window.postMessage(data, location.origin);
  }), data);
  const state = () => page.locator('#simulation').evaluate(node => ({ ...node.dataset }));
  const readFold = async () => {
    const count = await page.evaluate(() => window.__grabTransitionBlobs.length);
    await send({ type: 'zhezhi-sim-export-fold' });
    await page.waitForFunction(count => window.__grabTransitionBlobs.length > count, count);
    return page.evaluate(async () => JSON.parse(await window.__grabTransitionBlobs.at(-1)));
  };
  const steps = fold => Number(/·\s*(\d+)\s*步/.exec(fold.frame_title)[1]);
  const distance = (a, b) => Math.hypot(...a.map((n, k) => n - b[k]));
  const reset = async () => {
    await send({ type: 'zhezhi-sim-reset' });
    await page.waitForFunction(() => document.querySelector('#simulation').dataset.status === 'paused');
    await send({ type: 'zhezhi-sim-camera', preset: 'front' });
    if ((await state()).interaction !== 'grab') await page.getByRole('button', { name: '顶点塑形', exact: true }).click();
  };
  const projected = async frame => {
    const current = await readFold();
    return page.evaluate(async ({ current, frame }) => {
      const { cameraUniforms, projectVertices, centroid, boundingRadius } = await import('/vendor/simulator/oristudio/packages/origami-simulator/src/webgl/camera.ts');
      const canvas = document.querySelector('#simulation'), rect = canvas.getBoundingClientRect();
      const points = new Float32Array(current.vertices_coords.flatMap(([x, y, z]) => [x, z, -y]));
      const initial = new Float32Array(frame.vertices_coords.flatMap(([x, y, z]) => [x, z, -y]));
      const center = centroid(initial), camera = cameraUniforms({ yaw: 0, pitch: 0, zoom: .88 }, center, boundingRadius(initial, center), canvas.width, canvas.height);
      const screen = projectVertices(points, camera).screen;
      return { x: rect.x + screen[0] / canvas.width * rect.width, y: rect.y + screen[1] / canvas.height * rect.height };
    }, { current, frame });
  };
  const begin = async frame => {
    const point = await projected(frame);
    await page.mouse.move(point.x, point.y); await page.mouse.down();
    const index = Number((await state()).grabbed);
    check(Number.isInteger(index), '命令切换前成功抓取实际顶点');
    await page.mouse.move(point.x + 15, point.y - 8, { steps: 4 });
    await page.waitForTimeout(30);
    return index;
  };
  try {
    for (const backend of ['webgl2', 'cpu']) {
      await page.setViewportSize({ width: 1100, height: 760 });
      await page.goto(`${origin}/simulator/index.html${backend === 'cpu' ? '?backend=cpu' : ''}`);
      await page.waitForFunction(() => document.querySelector('#simulation')?.dataset.status === 'ready');
      await page.evaluate(() => {
        window.__grabTransitionBlobs = [];
        const create = URL.createObjectURL.bind(URL);
        URL.createObjectURL = blob => { window.__grabTransitionBlobs.push(blob.text()); return create(blob); };
      });
      await send({ type: 'zhezhi-sim-load', fold, revision: `grab-transitions-${backend}` });
      await page.waitForFunction(backend => document.querySelector('#simulation').dataset.backend === backend, backend);
      await reset(); const frame = await readFold();
      for (const command of [
        { type: 'zhezhi-sim-resume' },
        { type: 'zhezhi-sim-progress', value: .55 },
        { type: 'zhezhi-sim-solver-settings', settings: { damping: .55 } },
      ]) {
        await reset(); await begin(frame);
        const commandState = await sendObserved(command);
        await page.waitForFunction(() => document.querySelector('#simulation').dataset.grabbed === undefined);
        const released = await readFold();
        check(commandState.grabbed === undefined && released.vertices_coords.flat().every(Number.isFinite), `${backend} ${command.type}先结束塑形约束并保留有效网格`);
        await page.waitForTimeout(180);
        if (command.type !== 'zhezhi-sim-solver-settings') await send({ type: 'zhezhi-sim-pause' });
        const later = await readFold();
        if (command.type === 'zhezhi-sim-solver-settings') {
          check(commandState.status === 'paused' && steps(later) === steps(released) && JSON.stringify(later.vertices_coords) === JSON.stringify(released.vertices_coords), `${backend} 拖动中调整参数结束塑形并暂停保留形状`);
        } else {
          check(commandState.status === 'running' && steps(later) > Number(commandState.steps), `${backend} ${command.type}保留新命令的继续求解意图`);
        }
        await page.mouse.up();
      }
      await reset(); const resizeIndex = await begin(frame), beforeResize = await readFold();
      await page.setViewportSize({ width: 1040, height: 720 });
      await page.waitForFunction(() => document.querySelector('#simulation').dataset.grabbed === undefined);
      const resized = await readFold();
      check(distance(resized.vertices_coords[resizeIndex], beforeResize.vertices_coords[resizeIndex]) < 2e-6 && (await state()).status === 'paused', `${backend} 视口resize释放顶点、保持当前位置并暂停`);
      await page.mouse.up(); await page.setViewportSize({ width: 1100, height: 760 });
      await reset(); const cameraIndex = await begin(frame), beforeCamera = await readFold();
      await send({ type: 'zhezhi-sim-camera', preset: 'isometric' });
      await page.waitForFunction(() => document.querySelector('#simulation').dataset.grabbed === undefined);
      check(distance((await readFold()).vertices_coords[cameraIndex], beforeCamera.vertices_coords[cameraIndex]) < 2e-6 && (await state()).status === 'paused', `${backend} 预设镜头切换释放顶点、保留位置并保持暂停`);
      await page.mouse.up(); await reset();
      // Start the run immediately before a real pointer gesture. A tiny timestep
      // keeps the small fixture running long enough to test release semantics.
      await send({ type: 'zhezhi-sim-solver-settings', settings: { timeStepScale: .05, damping: .5 } });
      await reset(); await send({ type: 'zhezhi-sim-progress', value: .9 });
      check((await state()).status === 'running', `${backend} 抓取前模型处于真实运行状态`);
      await begin(frame); await page.mouse.up();
      const released = await readFold();
      check((await state()).status === 'paused', `${backend} 运行中开始塑形，松手仍暂停保留结果`);
      await page.waitForTimeout(180);
      check(JSON.stringify((await readFold()).vertices_coords) === JSON.stringify(released.vertices_coords) && Number((await state()).steps) === steps(released), `${backend} 松手后不重新推进旧折叠目标`);
      await send({ type: 'zhezhi-sim-resume' }); await page.waitForTimeout(180); await send({ type: 'zhezhi-sim-pause' });
      check(steps(await readFold()) > steps(released), `${backend} 用户明确继续后才重新推进求解`);
    }
    const numerical = await page.evaluate(async () => {
      const ring = await (await fetch('/tests/fixtures/simulation-self-contact-default-ring.fold.json')).json();
      const base = '/vendor/simulator/oristudio/packages/origami-simulator/src/';
      const [{ prepareSimulationDocument }, { OrigamiModel }, { ReferenceSolver }, { WebglSolver }, { centroid }] = await Promise.all([
        import('/src/engine/simmodel.ts'), import(base + 'model.ts'), import(base + 'referenceSolver.ts'), import(base + 'webgl/webglSolver.ts'), import(base + 'webgl/camera.ts'),
      ]);
      const output = {};
      for (const backend of ['webgl2', 'cpu']) {
        const { prepared } = prepareSimulationDocument(ring), model = new OrigamiModel(prepared);
        const options = { foldPercent: 35, timeStepScale: .35, damping: .5 };
        const solver = backend === 'webgl2' ? new WebglSolver(document.createElement('canvas'), model, options) : new ReferenceSolver(model, options);
        const positions = new Float32Array(prepared.vertexCount * 3), read = () => { solver.readPositions(positions); return positions.slice(); };
        const difference = (a, b) => Math.hypot(...a.map((n, k) => n - b[k]));
        try {
          const center = centroid(read()); solver.step(1000);
          let current = read(); solver.setVertexConstraint(0, [current[0] + .03, current[1] + .02, current[2] - .015]); solver.step(120);
          solver.setVertexConstraint(0, null); current = read(); const beforeCenter = centroid(current), steps = solver.stepCount;
          solver.recenter(center); const after = read(), afterCenter = centroid(after), velocity = solver.maxVelocity();
          let shapeError = 0;
          for (let i = 0; i < after.length; i++) shapeError = Math.max(shapeError, Math.abs((current[i] - beforeCenter[i % 3]) - (after[i] - afterCenter[i % 3])));
          const retainedSteps = solver.stepCount, drift = [];
          for (let block = 0; block < 6; block++) { solver.step(500); drift.push(difference(centroid(read()), center)); }
          output[backend] = { vertices: prepared.vertexCount, faces: prepared.faceCount, centerError: difference(afterCenter, center), shapeError, velocity, steps, retainedSteps, drift, finite: Array.from(read()).every(Number.isFinite) };
        } finally { solver.dispose(); }
      }
      return output;
    });
    for (const [backend, result] of Object.entries(numerical)) {
      check(result.vertices >= 72 && result.faces > 65, `${backend} 环状镶嵌使用实际预处理完整网格`);
      check(result.centerError < 2e-6 && result.velocity === 0, `${backend} 环状网格后端 recenter API 重心归位且全网速度清零`);
      check(result.shapeError < 2e-6 && result.steps === result.retainedSteps, `${backend} 环状网格后端 recenter API 保留相对形状和步数`);
      check(result.finite && Math.max(...result.drift) < 3e-4, `${backend} 环状网格后端显式继续 3000 步无持续漂移（最大${Math.max(...result.drift).toExponential(2)}）`);
      metrics[backend] = result;
    }
    check(errors.length === 0, '转换与环状回归无未捕获页面错误');
    return { passed: checks.length, checks, ring: metrics, errors };
  } finally {
    await page.mouse.up().catch(() => {}); page.off('pageerror', errorListener);
  }
}
