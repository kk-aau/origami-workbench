import type { OrigamiModel } from '../model.js';
import type { FoldAssignment, FoldProfile, SimulatorDiagnostics, SimulatorOptions } from '../types.js';

// Assignment letter -> edge colour code the mesh renderer expects
// (0=B, 1=M, 2=V, 3=F). Unassigned/other creases fall through to the border
// colour, matching the canvas-2D renderer.
/**
 * Textures the shared force shader samples, in the unit order both integrators
 * bind and pass them. Verlet appends `u_lastLastPosition` after these.
 */
const FORCE_SHADER_SAMPLERS = [
  'u_lastPosition',
  'u_lastVelocity',
  'u_originalPosition',
  'u_externalForces',
  'u_mass',
  'u_meta',
  'u_beamMeta',
  'u_creaseMeta',
  'u_nodeCreaseMeta',
  'u_normals',
  'u_theta',
  'u_creaseGeo',
  'u_meta2',
  'u_nodeFaceMeta',
  'u_nominalTriangles',
] as const;

import {solverPoseModelSignature,validateSolverPoseSnapshot,type SolverBackend,type SolverPoseSnapshot} from '../solverBackend.js';
import { GlCore } from './glCore.js';
import {
  NORMAL_CALC,
  THETA_CALC,
  CREASE_GEO_CALC,
  VELOCITY_CALC,
  POSITION_CALC,
  POSITION_CALC_VERLET,
  VELOCITY_CALC_VERLET,
} from './passes.js';
import {
  MeshRenderer,
  meshTopologyFor,
  type MeshTopology,
  type RenderSettings,
  type MeshPositionFrame,
} from './meshRenderer.js';
import type { CameraUniforms } from './camera.js';
import {
  packModel,
  packBeamMeta,
  packCreaseMeta,
  timeStepFor,
  type PackedModel,
  type SolverMaterial,
} from './packing.js';

/**
 * The GPU solver: a direct WebGL2 port of upstream's dynamic solver. All state
 * lives in float textures and every step is five fragment-shader passes over
 * them; the CPU only touches positions on readback.
 *
 * It is a {@link SolverBackend}, so it drops into the same worker as
 * ReferenceSolver and is selected by the backend ladder. Correctness is defined
 * by parity against ReferenceSolver and the upstream oracle -- see the browser
 * parity tests -- not by anything asserted here.
 *
 * Supports both integrators. Euler and Verlet share the force shader and differ
 * only in how they apply it; Verlet additionally keeps a second step of position
 * history (`u_lastLastPosition`).
 */
export class WebglSolver implements SolverBackend {
  readonly id = 'webgl2';
  private readonly gl: GlCore;
  private readonly packed: PackedModel;
  private readonly nodeCount: number;
  private material: SolverMaterial;
  private foldPercent: number;
  private dt: number;
  private currentStep = 0;
  private maxStrain = 0;
  private meanStrain = 0;
  private integrationType: 'euler' | 'verlet';

  private readonly positionScratch: Float32Array;
  private readonly diagnostics: SimulatorDiagnostics;
  private readonly originalPositions: Float32Array;
  private readonly vertexConstraintData: Float32Array;
  private vertexConstraintCount = 0;
  private readonly poseModelSignature: string;
  private readonly edgeRestLengths: Float32Array;
  private readonly topology: MeshTopology;
  private meshRenderer: MeshRenderer | null = null;
  private surfaceRenderer:MeshRenderer|null=null;
  private surfaceTopology:MeshTopology|null=null;
  private surfaceFrame:MeshPositionFrame|null=null;
  private surfacePositions=new Float32Array();
  private surfaceStrain=new Float32Array();

  static isSupported(canvas: HTMLCanvasElement | OffscreenCanvas): boolean {
    const probe = GlCore.create(canvas);
    if (!probe) return false;
    probe.dispose();
    return true;
  }

  /** True once this solver's GL context has gone away; every result is stale. */
  get contextLost(): boolean {
    return this.gl.contextLost;
  }

  /**
   * What the default framebuffer *actually* is, which is not always what the
   * canvas was set to.
   *
   * A browser silently clamps the drawing buffer when it cannot back the size
   * asked for — observed at 5760 for a canvas set to 16384, with no error and
   * `isContextLost()` still false. Rendering past that point draws outside the
   * buffer and reads back nothing, so anything sizing a viewport or a readback
   * has to ask here rather than trusting `canvas.width`.
   */
  get drawingBufferSize(): { width: number; height: number } {
    return {
      width: this.gl.gl.drawingBufferWidth,
      height: this.gl.gl.drawingBufferHeight,
    };
  }

  /**
   * Notify when the context is lost. The session uses this to fail the run
   * rather than let a dead solver keep reporting a settled, motionless mesh.
   */
  onContextLost(handler: () => void): () => void {
    return this.gl.onContextLost(handler);
  }

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, model: OrigamiModel, options: SimulatorOptions = {}) {
    const gl = GlCore.create(canvas);
    if (!gl) throw new Error('WebGL2 is not available for the GPU solver');
    this.gl = gl;
    this.poseModelSignature=solverPoseModelSignature(model);
    this.nodeCount = model.prepared.vertexCount;
    this.diagnostics = { ...model.prepared.diagnostics, webglAvailable: true, usedCpuFallback: false };
    this.originalPositions = model.originalPositions;
    this.edgeRestLengths = new Float32Array(
      model.prepared.edgesVertices.map((_, index) => model.edgeRestLength(index))
    );
    this.material = {
      axialStiffness: options.axialStiffness ?? 20,
      creaseStiffness: options.creaseStiffness ?? 0.7,
      panelStiffness: options.panelStiffness ?? 0.7,
      faceStiffness: options.faceStiffness ?? 0.2,
      damping: options.damping ?? 0.45,
      timeStepScale: options.timeStepScale ?? 1,
    };
    this.integrationType = options.integrationType === 'verlet' ? 'verlet' : 'euler';
    this.foldPercent = clampPercent(options.foldPercent ?? 0);
    this.packed = packModel(model, this.material);
    // The external-force texture is already sampled by the force shader. Its
    // otherwise-unused alpha channel marks a hard vertex target in xyz, avoiding
    // a seventeenth sampler in the Verlet program on minimum WebGL2 hardware.
    this.vertexConstraintData = this.packed.externalForces.slice();
    // After `packed`, which owns the texture dimension the render topology
    // quotes.
    this.topology = meshTopologyFor(model.prepared, this.packed.dims.textureDim);
    this.dt = timeStepFor(this.packed, this.material);
    this.positionScratch = new Float32Array(this.packed.dims.textureDim * this.packed.dims.textureDim * 4);

    this.buildTextures();
    this.buildPrograms();
    this.uploadMaterial();
  }

  step(count: number): void {
    for (let i = 0; i < count; i += 1) this.solveStep();
    this.currentStep += count;
  }

  setFoldPercent(percent: number): void {
    this.foldPercent = clampPercent(percent);
    this.gl.setUniform('velocityCalc', 'u_creasePercent', this.foldPercent / 100, '1f');
    this.gl.setUniform('positionCalcVerlet', 'u_creasePercent', this.foldPercent / 100, '1f');
  }

  setFoldProfile(_profile: FoldProfile | null): void {
    // Fold profiles are handled by backend selection (they fall back to the
    // reference solver); the GPU path only sees the uniform-target model.
  }

  setMaterial(options: Partial<SimulatorOptions>): void {
    if (options.integrationType === 'verlet' && this.vertexConstraintCount) {
      throw new Error('Verlet 积分暂不支持顶点固定约束，请先释放约束。');
    }
    this.material = {
      axialStiffness: options.axialStiffness ?? this.material.axialStiffness,
      creaseStiffness: options.creaseStiffness ?? this.material.creaseStiffness,
      panelStiffness: options.panelStiffness ?? this.material.panelStiffness,
      faceStiffness: options.faceStiffness ?? this.material.faceStiffness,
      damping: options.damping ?? this.material.damping,
      timeStepScale: options.timeStepScale ?? this.material.timeStepScale,
    };
    if (options.integrationType !== undefined) {
      const next = options.integrationType === 'verlet' ? 'verlet' : 'euler';
      // Verlet integrates from two steps of history, so switching mid-solve would
      // read a stale lastLastPosition as if it were the previous step. Seeding it
      // from the current position starts the new integrator at rest instead.
      if (next !== this.integrationType && next === 'verlet') this.seedVerletHistory();
      this.integrationType = next;
    }
    if (options.foldPercent !== undefined) this.setFoldPercent(options.foldPercent);
    this.dt = timeStepFor(this.packed, this.material);
    this.uploadMaterial();
  }

  setVertexConstraint(index: number, absoluteTarget: readonly [number, number, number] | null): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.nodeCount) {
      throw new RangeError('顶点约束索引超出模拟网格范围。');
    }
    if (absoluteTarget !== null) {
      if (this.integrationType === 'verlet') {
        throw new Error('Verlet 积分暂不支持顶点固定约束，请切换 Euler。');
      }
      if (absoluteTarget.length !== 3 || absoluteTarget.some(value => !Number.isFinite(value))) {
        throw new Error('顶点约束目标必须是有限的三维坐标。');
      }
    }
    const offset = index * 4;
    const wasConstrained = this.vertexConstraintData[offset + 3] === 1;
    if (absoluteTarget === null) {
      this.vertexConstraintData.set(this.packed.externalForces.subarray(offset, offset + 4), offset);
      if (wasConstrained) this.vertexConstraintCount -= 1;
    } else {
      for (let axis = 0; axis < 3; axis += 1) {
        this.vertexConstraintData[offset + axis] = absoluteTarget[axis]! - (this.originalPositions[index * 3 + axis] ?? 0);
      }
      this.vertexConstraintData[offset + 3] = 1;
      if (!wasConstrained) this.vertexConstraintCount += 1;
    }
    this.gl.updateTexture('u_externalForces', this.vertexConstraintData);
  }

  /**
   * Make lastLastPosition equal lastPosition, i.e. zero implied Verlet velocity.
   * Costs a readback, but only runs when the integrator changes or a blow-up is
   * arrested -- never per step.
   */
  private seedVerletHistory(): void {
    this.gl.updateTexture('u_lastLastPosition', this.gl.readTexture('u_lastPosition'));
  }

  reset(): void {
    this.currentStep = 0;
    this.maxStrain = 0;
    this.meanStrain = 0;
    this.vertexConstraintCount = 0;
    this.vertexConstraintData.set(this.packed.externalForces);
    this.gl.updateTexture('u_externalForces', this.vertexConstraintData);
    const zeros = new Float32Array(this.packed.dims.textureDim * this.packed.dims.textureDim * 4);
    this.gl.updateTexture('u_position', zeros);
    this.gl.updateTexture('u_lastPosition', zeros);
    this.gl.updateTexture('u_lastLastPosition', zeros);
    this.gl.updateTexture('u_velocity', zeros);
    this.gl.updateTexture('u_lastVelocity', zeros);
    this.gl.updateTexture('u_theta', this.packed.thetaInit);
    this.gl.updateTexture('u_lastTheta', this.packed.thetaInit);
  }

  arrestDynamics(): void {
    // Zero only the velocity textures; positions and crease angles are kept, so
    // the fold state survives -- we are draining kinetic energy, not resetting.
    const zeros = new Float32Array(this.packed.dims.textureDim * this.packed.dims.textureDim * 4);
    this.gl.updateTexture('u_velocity', zeros);
    this.gl.updateTexture('u_lastVelocity', zeros);
    // Verlet carries its velocity implicitly, as the gap between the last two
    // positions -- zeroing the velocity texture alone would not slow it at all.
    if (this.integrationType === 'verlet') this.seedVerletHistory();
  }

  recenter(target: readonly [number, number, number]): void {
    if (target.length !== 3 || target.some(value => !Number.isFinite(value))) {
      throw new Error('模拟居中目标必须是有限的三维坐标。');
    }
    if (this.vertexConstraintCount) throw new Error('请先释放顶点约束，再居中模拟。');
    const translated = this.gl.readTexture('u_lastPosition');
    const center = [0, 0, 0];
    for (let vertex = 0; vertex < this.nodeCount; vertex += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        center[axis] += (this.originalPositions[vertex * 3 + axis]! + translated[vertex * 4 + axis]!) / this.nodeCount;
      }
    }
    for (let vertex = 0; vertex < this.nodeCount; vertex += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        const component = vertex * 4 + axis;
        translated[component] += target[axis]! - center[axis]!;
        if (!Number.isFinite(translated[component])) throw new Error('模拟居中后的坐标超出有效范围。');
      }
    }
    // Upload only a complete validated frame. Keep theta, targets and rest
    // positions intact, and seed every history so neither integrator recoils.
    this.gl.updateTexture('u_position', translated);
    this.gl.updateTexture('u_lastPosition', translated);
    this.gl.updateTexture('u_lastLastPosition', translated);
    this.arrestDynamics();
  }

  capturePose(): SolverPoseSnapshot {
    const raw=this.gl.readTexture('u_lastPosition'),positions=new Float32Array(this.nodeCount*3),displacements=new Float32Array(positions.length);
    for(let i=0;i<this.nodeCount;i++)for(let axis=0;axis<3;axis++){
      displacements[i*3+axis]=raw[i*4+axis]!;
      positions[i*3+axis]=this.originalPositions[i*3+axis]!+raw[i*4+axis]!;
    }
    const theta=this.gl.readTexture('u_lastTheta'),pins:SolverPoseSnapshot['pins']=[];
    for(let index=0;index<this.nodeCount;index++)if(this.vertexConstraintData[index*4+3]===1){
      pins.push({index,position:[0,1,2].map(axis=>Math.fround(this.originalPositions[index*3+axis]!+this.vertexConstraintData[index*4+axis]!)) as [number,number,number]});
    }
    const snapshot=validateSolverPoseSnapshot({version:1,modelSignature:this.poseModelSignature,positions:Array.from(positions),displacements:Array.from(displacements),
      creaseAngles:Array.from({length:this.packed.dims.creases},(_,i)=>theta[i*4]!),pins});
    if(!snapshot)throw new Error('当前模拟姿态或固定点坐标尚未稳定，无法保存。');
    return snapshot;
  }

  restorePose(value: unknown): void {
    const snapshot=validateSolverPoseSnapshot(value);
    if(!snapshot)throw new Error('模拟姿态文件包含无效的坐标、折角或固定点。');
    if(snapshot.modelSignature!==this.poseModelSignature||snapshot.positions.length!==this.nodeCount*3||snapshot.creaseAngles.length!==this.packed.dims.creases){
      throw new Error('保存的三维姿态与当前折痕模型不一致。');
    }
    if(snapshot.pins.length&&this.integrationType==='verlet')throw new Error('此姿态包含固定点，请切换 Euler 积分后恢复。');
    const position=new Float32Array(this.positionScratch.length),velocity=new Float32Array(position.length),theta=this.packed.thetaInit.slice(),constraints=this.packed.externalForces.slice();
    for(let i=0;i<this.nodeCount;i++)for(let axis=0;axis<3;axis++){
      position[i*4+axis]=snapshot.displacements[i*3+axis]!;
      if(Math.fround(this.originalPositions[i*3+axis]!+position[i*4+axis]!)!==Math.fround(snapshot.positions[i*3+axis]!)){
        throw new Error('模拟姿态坐标与原始纸面的位移不一致。');
      }
    }
    // A paused restored pose must still report its real axial strain. The
    // velocity alpha is a diagnostic, not momentum; only xyz should be zero.
    let maxStrain=0,totalStrain=0;
    for(let i=0;i<this.nodeCount;i++){
      const start=this.packed.meta[i*4]!,count=this.packed.meta[i*4+1]!;let total=0;
      for(let beam=start;beam<start+count;beam++){
        const other=this.packed.beamOtherNode[beam]!,length=Math.hypot(...[0,1,2].map(axis=>snapshot.positions[i*3+axis]!-snapshot.positions[other*3+axis]!));
        total+=Math.abs(length/this.packed.beamRestLength[beam]!-1);
      }
      const strain=Math.fround(count?total/count:0);
      if(!Number.isFinite(strain))throw new Error('模拟姿态的纸面应变超出有效范围。');
      position[i*4+3]=strain;velocity[i*4+3]=strain;
      maxStrain=Math.max(maxStrain,strain);totalStrain+=strain;
    }
    for(let i=0;i<snapshot.creaseAngles.length;i++){theta[i*4]=snapshot.creaseAngles[i]!;theta[i*4+1]=0;}
    for(const pin of snapshot.pins){
      for(let axis=0;axis<3;axis++){
        constraints[pin.index*4+axis]=pin.position[axis]!-this.originalPositions[pin.index*3+axis]!;
        if(!Number.isFinite(constraints[pin.index*4+axis]))throw new Error('固定点坐标超出有效范围。');
      }
      constraints[pin.index*4+3]=1;
    }
    // All validation and CPU preparation precede GPU writes. Context-loss
    // failures are fatal to the context, never a partially accepted JSON pose.
    for(const name of ['u_position','u_lastPosition','u_lastLastPosition'])this.gl.updateTexture(name,position);
    for(const name of ['u_velocity','u_lastVelocity'])this.gl.updateTexture(name,velocity);
    this.gl.updateTexture('u_theta',theta);this.gl.updateTexture('u_lastTheta',theta);
    this.gl.updateTexture('u_externalForces',constraints);
    this.vertexConstraintData.set(constraints);this.vertexConstraintCount=snapshot.pins.length;
    this.maxStrain=maxStrain;this.meanStrain=this.nodeCount?totalStrain/this.nodeCount:0;
  }

  readPositions(into: Float32Array): number {
    // The texture stores relative displacement; absolute = original + relative,
    // the same convention ReferenceSolver uses.
    const raw = this.gl.readTexture('u_lastPosition');
    const count = Math.min(into.length, this.nodeCount * 3);
    for (let i = 0; i < count / 3; i += 1) {
      into[i * 3] = (this.originalPositions[i * 3] ?? 0) + raw[i * 4]!;
      into[i * 3 + 1] = (this.originalPositions[i * 3 + 1] ?? 0) + raw[i * 4 + 1]!;
      into[i * 3 + 2] = (this.originalPositions[i * 3 + 2] ?? 0) + raw[i * 4 + 2]!;
    }
    return count;
  }

  readCreaseAngles(into: Float32Array): number {
    const theta=this.gl.readTexture('u_lastTheta'),count=Math.min(into.length,this.packed.dims.creases);
    for(let i=0;i<count;i++)into[i]=theta[i*4]!;
    return count;
  }

  readColors(into: Float32Array): number {
    // Strain colouring is a CPU convenience for the renderer; recompute it from
    // the current positions rather than adding a GPU pass for it.
    this.readPositions(this.positionScratch.subarray(0, this.nodeCount * 3));
    into.fill(0.75);
    return Math.min(into.length, this.nodeCount * 3);
  }

  readStrain(into: Float32Array): number {
    // The same channel the face shader samples for its strain colouring:
    // velocityCalc stores each node's mean axial strain in the velocity alpha.
    // Reading it back stalls the pipeline, which is why nothing on the
    // interactive path calls this -- an export click can afford it.
    const raw = this.gl.readTexture('u_lastVelocity');
    const count = Math.min(into.length, this.nodeCount);
    for (let i = 0; i < count; i += 1) {
      into[i] = raw[i * 4 + 3]!;
    }
    return count;
  }

  readDiagnostics(): SimulatorDiagnostics {
    return { ...this.diagnostics, maxNodalStrain: this.maxStrain, meanNodalStrain: this.meanStrain };
  }

  maxVelocity(): number {
    // The velocity texture's alpha channel holds each node's error term, which
    // velocityCalc computes as its mean axial (edge) strain -- so this one
    // readback yields max velocity plus maximum/mean strain (for diagnostics),
    // with no extra GPU stall when readDiagnostics is called again.
    const raw = this.gl.readTexture('u_lastVelocity');
    let max = 0;
    let maxStrain = 0;
    let totalStrain = 0;
    // A NaN never satisfies `>`, so comparing naively would silently swallow it
    // and report a blown-up model as velocity 0 -- i.e. *converged*, leaving the
    // simulation stopped on an invisible NaN mesh. Track it explicitly instead so
    // the caller can see the instability.
    let nonFinite = false;
    for (let i = 0; i < this.nodeCount; i += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = Math.abs(raw[i * 4 + axis]!);
        if (!Number.isFinite(value)) nonFinite = true;
        else if (value > max) max = value;
      }
      const strain = raw[i * 4 + 3]!;
      if (!Number.isFinite(strain)) nonFinite = true;
      else {
        totalStrain += strain;
        if (strain > maxStrain) maxStrain = strain;
      }
    }
    this.maxStrain = nonFinite ? Number.NaN : maxStrain;
    this.meanStrain = nonFinite ? Number.NaN : this.nodeCount ? totalStrain / this.nodeCount : 0;
    return nonFinite ? Number.NaN : max;
  }

  get stepCount(): number {
    return this.currentStep;
  }

  get vertexCount(): number {
    return this.nodeCount;
  }

  /**
   * Draw the mesh straight from the position texture into `target` (null = the
   * context's own canvas). Zero readback: the vertex shader `texelFetch`es the
   * live positions, so nothing crosses to the CPU. The renderer shares this
   * solver's GL context, so it must be called on the same thread the solver
   * runs on.
   */
  render(camera: CameraUniforms, settings: RenderSettings, target: WebGLFramebuffer | null = null, surface?:MeshPositionFrame): void {
    if(surface){this.renderSurface(camera,settings,target,surface);return;}
    this.meshRenderer ??= new MeshRenderer(this.gl, this.topology);
    this.meshRenderer.render(camera, settings, target);
  }

  private renderSurface(camera:CameraUniforms,settings:RenderSettings,target:WebGLFramebuffer|null,frame:MeshPositionFrame):void{
    const topology=frame.topology,dim=topology.textureDim;
    if(this.surfaceTopology?.faceIndices!==topology.faceIndices){
      this.surfaceRenderer?.dispose();this.surfaceTopology=topology;this.surfaceFrame=null;
      this.surfacePositions=new Float32Array(dim*dim*4);this.surfaceStrain=new Float32Array(dim*dim*4);
      for(const name of ['u_displayPosition','u_displayDisplacement','u_displayStrain'])this.gl.createTexture(name,{width:dim,height:dim,data:new Float32Array(dim*dim*4)});
      this.surfaceRenderer=new MeshRenderer(this.gl,topology,{position:'u_displayDisplacement',original:'u_displayPosition',velocity:'u_displayStrain'});
    }
    if(this.surfaceFrame!==frame){
      this.surfacePositions.fill(0);this.surfaceStrain.fill(0);
      for(let i=0;i<frame.positions.length/3;i++){
        this.surfacePositions.set(frame.positions.subarray(i*3,i*3+3),i*4);
        this.surfaceStrain[i*4+3]=frame.strain?.[i]??0;
      }
      this.gl.updateTexture('u_displayPosition',this.surfacePositions);this.gl.updateTexture('u_displayStrain',this.surfaceStrain);
      this.surfaceFrame=frame;
    }
    this.surfaceRenderer!.render(camera,settings,target);
  }

  /**
   * Render to an offscreen `width`×`height` RGBA8 buffer and read it back. For
   * headless use (tests, thumbnails) where there is no visible canvas — the
   * interactive path renders straight to the canvas via {@link render} with no
   * readback. Returns RGBA rows top-to-bottom.
   */
  renderToImage(camera: CameraUniforms, settings: RenderSettings, width: number, height: number, surface?:MeshPositionFrame): Uint8Array {
    const gl = this.gl.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('Offscreen render target is incomplete');
    }

    this.render({ ...camera, width, height }, settings, framebuffer,surface);

    const pixels = new Uint8Array(width * height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteRenderbuffer(depth);
    gl.deleteTexture(texture);
    return pixels;
  }

  dispose(): void {
    this.meshRenderer?.dispose();
    this.surfaceRenderer?.dispose();
    this.gl.dispose();
  }

  private solveStep(): void {
    const gl = this.gl;

    // normalCalc over faces
    gl.step('normalCalc', ['u_faceVertexIndices', 'u_lastPosition', 'u_originalPosition'], 'u_normals');
    // thetaCalc over creases (accumulator ping-pong)
    gl.step(
      'thetaCalc',
      ['u_normals', 'u_lastTheta', 'u_creaseVectors', 'u_lastPosition', 'u_originalPosition'],
      'u_theta'
    );
    // updateCreaseGeo over creases
    gl.step('updateCreaseGeo', ['u_lastPosition', 'u_originalPosition', 'u_creaseMeta2'], 'u_creaseGeo');
    if (this.integrationType === 'verlet') {
      // positionCalcVerlet integrates the force straight into position from two
      // steps of history; velocityCalcVerlet then derives velocity from how far it
      // moved. Same force shader as Euler, different final line.
      gl.step('positionCalcVerlet', [...FORCE_SHADER_SAMPLERS, 'u_lastLastPosition'], 'u_position');
      gl.step('velocityCalcVerlet', ['u_position', 'u_lastPosition', 'u_mass'], 'u_velocity');
      // Age the history: this step's "last" becomes "lastLast", and the swap below
      // makes the new position "last". Matches upstream's swap order.
      gl.swap('u_lastPosition', 'u_lastLastPosition');
    } else {
      gl.step('velocityCalc', [...FORCE_SHADER_SAMPLERS], 'u_velocity');
      gl.step('positionCalc', ['u_velocity', 'u_lastPosition', 'u_mass'], 'u_position');
    }

    gl.swap('u_theta', 'u_lastTheta');
    gl.swap('u_velocity', 'u_lastVelocity');
    gl.swap('u_position', 'u_lastPosition');
  }

  private buildTextures(): void {
    const gl = this.gl;
    const dims = this.packed.dims;
    const nodeSpec = { width: dims.textureDim, height: dims.textureDim };
    const creaseSpec = { width: dims.textureDimCreases, height: dims.textureDimCreases };
    const zeros = (size: number) => new Float32Array(size * size * 4);

    // Static
    gl.createTexture('u_originalPosition', { ...nodeSpec, data: this.packed.originalPosition });
    gl.createTexture('u_mass', { ...nodeSpec, data: this.packed.mass });
    gl.createTexture('u_externalForces', { ...nodeSpec, data: this.packed.externalForces });
    gl.createTexture('u_meta', { ...nodeSpec, data: this.packed.meta });
    gl.createTexture('u_meta2', { ...nodeSpec, data: this.packed.meta2 });
    gl.createTexture('u_nodeCreaseMeta', {
      width: dims.textureDimNodeCreases,
      height: dims.textureDimNodeCreases,
      data: this.packed.nodeCreaseMeta,
    });
    gl.createTexture('u_nodeFaceMeta', {
      width: dims.textureDimNodeFaces,
      height: dims.textureDimNodeFaces,
      data: this.packed.nodeFaceMeta,
    });
    gl.createTexture('u_faceVertexIndices', {
      width: dims.textureDimFaces,
      height: dims.textureDimFaces,
      data: this.packed.faceVertexIndices,
    });
    gl.createTexture('u_nominalTriangles', {
      width: dims.textureDimFaces,
      height: dims.textureDimFaces,
      data: this.packed.nominalTriangles,
    });
    gl.createTexture('u_creaseMeta2', { ...creaseSpec, data: this.packed.creaseMeta2 });
    gl.createTexture('u_creaseVectors', { ...creaseSpec, data: this.packed.creaseVectors });

    // Material-dependent (rebuilt on setMaterial)
    gl.createTexture('u_beamMeta', {
      width: dims.textureDimEdges,
      height: dims.textureDimEdges,
      data: packBeamMeta(this.packed, this.material),
    });
    gl.createTexture('u_creaseMeta', { ...creaseSpec, data: packCreaseMeta(this.packed, this.material) });

    // Ping-pong state
    gl.createTexture('u_position', { ...nodeSpec, data: zeros(dims.textureDim) });
    gl.createTexture('u_lastPosition', { ...nodeSpec, data: zeros(dims.textureDim) });
    // Verlet's second step of history. Allocated always; only the Verlet path reads it.
    gl.createTexture('u_lastLastPosition', { ...nodeSpec, data: zeros(dims.textureDim) });
    gl.createTexture('u_velocity', { ...nodeSpec, data: zeros(dims.textureDim) });
    gl.createTexture('u_lastVelocity', { ...nodeSpec, data: zeros(dims.textureDim) });
    gl.createTexture('u_normals', {
      width: dims.textureDimFaces,
      height: dims.textureDimFaces,
      data: zeros(dims.textureDimFaces),
    });
    gl.createTexture('u_creaseGeo', { ...creaseSpec, data: zeros(dims.textureDimCreases) });
    gl.createTexture('u_theta', { ...creaseSpec, data: this.packed.thetaInit });
    gl.createTexture('u_lastTheta', { ...creaseSpec, data: this.packed.thetaInit });
  }

  private buildPrograms(): void {
    const gl = this.gl;
    const dims = this.packed.dims;

    gl.createProgram('normalCalc', NORMAL_CALC);
    gl.createProgram('thetaCalc', THETA_CALC);
    gl.createProgram('updateCreaseGeo', CREASE_GEO_CALC);
    gl.createProgram('velocityCalc', VELOCITY_CALC);
    gl.createProgram('positionCalc', POSITION_CALC);
    gl.createProgram('positionCalcVerlet', POSITION_CALC_VERLET);
    gl.createProgram('velocityCalcVerlet', VELOCITY_CALC_VERLET);

    // Bind every sampler to a texture unit, matching the input order in `step`.
    const bind = (program: string, samplers: string[]) =>
      samplers.forEach((name, unit) => gl.setUniform(program, name, unit, '1i'));

    bind('normalCalc', ['u_faceVertexIndices', 'u_lastPosition', 'u_originalPosition']);
    gl.setUniform('normalCalc', 'u_textureDim', [dims.textureDim, dims.textureDim], '2f');
    gl.setUniform('normalCalc', 'u_textureDimFaces', [dims.textureDimFaces, dims.textureDimFaces], '2f');

    bind('thetaCalc', ['u_normals', 'u_lastTheta', 'u_creaseVectors', 'u_lastPosition', 'u_originalPosition']);
    gl.setUniform('thetaCalc', 'u_textureDim', [dims.textureDim, dims.textureDim], '2f');
    gl.setUniform('thetaCalc', 'u_textureDimFaces', [dims.textureDimFaces, dims.textureDimFaces], '2f');
    gl.setUniform('thetaCalc', 'u_textureDimCreases', [dims.textureDimCreases, dims.textureDimCreases], '2f');

    bind('updateCreaseGeo', ['u_lastPosition', 'u_originalPosition', 'u_creaseMeta2']);
    gl.setUniform('updateCreaseGeo', 'u_textureDim', [dims.textureDim, dims.textureDim], '2f');
    gl.setUniform('updateCreaseGeo', 'u_textureDimCreases', [dims.textureDimCreases, dims.textureDimCreases], '2f');

    // Euler's velocityCalc and Verlet's positionCalcVerlet share the force shader,
    // so they take the same inputs and dimension uniforms. Configure both from one
    // place; a program that drifted would compute a different force.
    for (const program of ['velocityCalc', 'positionCalcVerlet'] as const) {
      const samplers: string[] = [...FORCE_SHADER_SAMPLERS];
      // Verlet reads one extra texture; it must be the last unit so the shared
      // units line up with the step() input order below.
      if (program === 'positionCalcVerlet') samplers.push('u_lastLastPosition');
      bind(program, samplers);
      gl.setUniform(program, 'u_textureDim', [dims.textureDim, dims.textureDim], '2f');
      gl.setUniform(program, 'u_textureDimEdges', [dims.textureDimEdges, dims.textureDimEdges], '2f');
      gl.setUniform(program, 'u_textureDimFaces', [dims.textureDimFaces, dims.textureDimFaces], '2f');
      gl.setUniform(program, 'u_textureDimCreases', [dims.textureDimCreases, dims.textureDimCreases], '2f');
      gl.setUniform(
        program,
        'u_textureDimNodeCreases',
        [dims.textureDimNodeCreases, dims.textureDimNodeCreases],
        '2f'
      );
      gl.setUniform(
        program,
        'u_textureDimNodeFaces',
        [dims.textureDimNodeFaces, dims.textureDimNodeFaces],
        '2f'
      );
      gl.setUniform(program, 'u_calcFaceStrain', 0, '1i');
    }

    bind('velocityCalcVerlet', ['u_position', 'u_lastPosition', 'u_mass']);
    gl.setUniform('velocityCalcVerlet', 'u_textureDim', [dims.textureDim, dims.textureDim], '2f');

    bind('positionCalc', ['u_velocity', 'u_lastPosition', 'u_mass', 'u_externalForces']);
    gl.setUniform('positionCalc', 'u_textureDim', [dims.textureDim, dims.textureDim], '2f');
  }

  private uploadMaterial(): void {
    const gl = this.gl;
    gl.updateTexture('u_beamMeta', packBeamMeta(this.packed, this.material));
    gl.updateTexture('u_creaseMeta', packCreaseMeta(this.packed, this.material));
    for (const program of ['velocityCalc', 'positionCalcVerlet'] as const) {
      gl.setUniform(program, 'u_dt', this.dt, '1f');
      gl.setUniform(program, 'u_axialStiffness', this.material.axialStiffness, '1f');
      gl.setUniform(program, 'u_faceStiffness', this.material.faceStiffness, '1f');
      gl.setUniform(program, 'u_creasePercent', this.foldPercent / 100, '1f');
    }
    gl.setUniform('positionCalc', 'u_dt', this.dt, '1f');
    gl.setUniform('velocityCalcVerlet', 'u_dt', this.dt, '1f');
  }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(-100, value));
}
