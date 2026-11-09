import {hasWeakMaterialRings} from '../core/materialWeak';
import type {FoldGraph} from '../core/types';
import { prepareFoldModel } from '../../vendor/simulator/oristudio/packages/origami-simulator/src/prepare';
import type { FoldDocument } from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import {simulationFaceRings,triangulateSimulationHoles} from './simHoles';
import {triangulateSimulationWeak,hasExplicitSimulationMesh} from './simWeak';
import {simulationFlatCreaseIncidence} from './simFlatCreaseIncidence';
import {isSimulationMeshQuality,refinePreparedSimulationMesh,SIMULATION_MESH_LEVELS,type SimulationMeshQuality} from './simFlexibleMesh';

/** Validate before entering third-party geometry code. Never mutate the editor document. */
export function prepareSimulationDocument(input: unknown,options:{mesh?:SimulationMeshQuality}={}) {
  const quality=options.mesh??'original';
  if(!isSimulationMeshQuality(quality))throw Error('纸面网格精细度无效。');
  if (!input || typeof input !== 'object') throw new Error('模拟输入不是有效的 FOLD 文档。');
  const source = input as FoldDocument;
  const materialGraph=source as unknown as FoldGraph;
  const vertices = source.vertices_coords;
  const edges = source.edges_vertices;
  const faces = source.faces_vertices;
  const explicit=hasExplicitSimulationMesh(source);
  if (!Array.isArray(vertices) || vertices.length < 3) throw new Error('至少需要三个顶点才能模拟。');
  if (vertices.length > 5000) throw new Error('本版交互模拟上限为 5,000 个顶点，请缩小镶嵌范围后重试。');
  if (!Array.isArray(edges) || !edges.length || edges.length > (explicit?45000:15000)) throw new Error('模拟需要有效折线；源折线不能超过15,000，已验证三角网格不能超过45,000。');
  if (!Array.isArray(faces) || !faces.length || faces.length > 10000) throw new Error('没有有效纸面。请先闭合边界、分割交点并生成纸面。');
  const indexOk = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < vertices.length;
  vertices.forEach((v, i) => {
    if (!Array.isArray(v) || (v.length !== 2 && v.length !== 3) || v.some(n => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1e9)) {
      throw new Error(`第 ${i + 1} 个顶点的坐标无效。`);
    }
  });
  edges.forEach((e, i) => {
    if (!Array.isArray(e) || e.length !== 2 || !e.every(indexOk) || e[0] === e[1]) throw new Error(`第 ${i + 1} 条折线的端点无效。`);
    const assignment = source.edges_assignment?.[i];
    if (assignment && !['B','M','V','F','U'].includes(assignment)) throw new Error(`第 ${i + 1} 条线包含本版模拟不支持的切割或连接类型。`);
    const angle = source.edges_foldAngle?.[i];
    if (angle !== null && angle !== undefined && (typeof angle !== 'number' || !Number.isFinite(angle) || Math.abs(angle) > 180)) throw new Error(`第 ${i + 1} 条折线的目标角必须在 −180° 至 180° 之间。`);
    // The upstream preparer defaults null with ??; reject unknown targets instead of silently folding 180°.
    if (angle === null && (assignment === 'M' || assignment === 'V')) throw new Error(`第 ${i + 1} 条山谷线的目标角未知，请设置目标角后再模拟。`);
  });
  // Non-adjacent coordinate aliases require explicit incidence too. Ordinary
  // zero-length input keeps its existing short-edge/cleanup diagnostic path.
  // Separate B banks may belong to different ordinary-looking faces while
  // sharing the same endpoint IDs. Endpoint lookup would lose one bank;
  // such meshes need the same explicit incidence path as weak face walks.
  const edgePairs=new Map<string,string|undefined>();
  const parallelBanks=edges.some(([a,b],e)=>{const stamp=a<b?`${a}:${b}`:`${b}:${a}`,kind=source.edges_assignment?.[e],seen=edgePairs.has(stamp),prior=edgePairs.get(stamp);edgePairs.set(stamp,kind);return seen&&(kind==='B'||prior==='B');});
  const weak=!explicit&&(parallelBanks||hasWeakMaterialRings(materialGraph,false)||hasWeakMaterialRings(materialGraph)&&!edges.some(([a,b])=>vertices[a].length===vertices[b].length&&vertices[a].every((v,k)=>v===vertices[b][k])));
  const edgeUse = new Map<string, number>();
  faces.forEach((f,i)=>{
    if (!Array.isArray(f) || f.length < 3 || f.length > 1000 || !f.every(indexOk) || !weak&&new Set(f).size !== f.length) throw new Error(`第 ${i + 1} 个纸面的顶点索引无效。`);
  });
  if(explicit){if(faces.some(f=>f.length!==3))throw Error('显式模拟网格必须由实际三角片组成。');triangulateSimulationWeak(source);}
  const weakFold=weak?triangulateSimulationWeak(simulationFlatCreaseIncidence(source)):null,rings=weak||explicit?null:simulationFaceRings(source);
  faces.forEach((f, i) => {
    (rings?.[i]??[f]).forEach(r=>r.forEach((a, j) => {
      const b = r[(j + 1) % r.length];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
      if (!weak&&!explicit&&edgeUse.get(key)! > 2) throw new Error('同一条边连接了三个以上纸面，暂不支持这种非流形模型。');
    }));
  });
  const extent = [0, 1, 2].map(axis => {
    const values = vertices.map(point => point[axis] ?? 0);
    return Math.max(...values) - Math.min(...values);
  });
  const minimumEdgeLength = Math.hypot(...extent) * 1e-6;
  edges.forEach(([a, b], i) => {
    const assignment = source.edges_assignment?.[i];
    if ((assignment !== 'M' && assignment !== 'V') || source.edges_foldAngle?.[i] === 0) return;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (!weak&&!explicit&&edgeUse.get(key) !== 2) {
      throw new Error(`第 ${i + 1} 条山谷折线没有连接两侧纸面，请检查该处边界、交点和面的顶点索引。`);
    }
    const start = vertices[a], end = vertices[b];
    const length = Math.hypot(...[0, 1, 2].map(axis => (start[axis] ?? 0) - (end[axis] ?? 0)));
    if (length < minimumEdgeLength || length === 0) {
      throw new Error(`第 ${i + 1} 条山谷折线过短或端点重合，会在模拟网格清理时消失。`);
    }
  });
  const fold = weakFold??(rings?triangulateSimulationHoles(source,rings):structuredClone(source));
  if (weak || rings) {
    // These freshly triangulated copies still know the exact original CP count.
    // Older v1 hole exports omitted it, so retain it before those faces are lost.
    const marker = fold.zhezhi_simulation_mesh as Record<string, unknown>;
    fold.zhezhi_simulation_mesh = {...marker, sourceFaceCount: faces.length};
  }
  // This port expects XZ as the paper plane; do the same lift for 3D FOLD coordinates.
  fold.vertices_coords = vertices.map(v => v.length === 3 ? [v[0], v[2], -v[1]] : [...v]);
  const preserve=weak||explicit,prepared = prepareFoldModel(fold, { triangulate: !preserve,preserveTopology:preserve });
  if((rings||preserve)&&(prepared.vertexCount!==vertices.length||prepared.faceCount!==fold.faces_vertices.length||prepared.edgeCount!==fold.edges_vertices.length||
    prepared.facesVertices.some((r,i)=>r.some((v,k)=>v!==fold.faces_vertices[i][k]))||
    prepared.edgesVertices.some((r,i)=>r.some((v,k)=>v!==fold.edges_vertices[i][k]))))
    throw new Error('带孔或弱边界模拟网格清理会改变实际边界或分片，未生成缺失结构的模拟。请检查过短边或退化纸面。');
  if(preserve){
    prepared.edgesFaces.forEach((fs,e)=>{if(fs.length!==(prepared.edgesAssignment[e]==='B'?1:2))throw Error('弱边界模拟网格的切口或铰接关联无效。');const [a,b]=prepared.edgesVertices[e];if(Math.hypot(...[0,1,2].map(k=>prepared.positions[a*3+k]-prepared.positions[b*3+k]))===0)throw Error('弱边界模拟坐标低于浮点精度，未合并源点。');});
    prepared.facesVertices.forEach(([a,b,c])=>{const u=[0,1,2].map(k=>prepared.positions[b*3+k]-prepared.positions[a*3+k]),v=[0,1,2].map(k=>prepared.positions[c*3+k]-prepared.positions[a*3+k]);if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])===0)throw Error('弱边界模拟三角片低于浮点精度，未填补或删除结构。');});
  }
  if (!prepared.faceCount) throw new Error('三角化后没有有效纸面，请检查重合顶点和退化折线。');
  if (prepared.faceCount > 15000) throw new Error('三角化后的纸面过多，请缩小模型后再模拟。');
  const drivenEdges = new Set(prepared.creaseParams.map(crease => crease.edge));
  prepared.edgesVertices.forEach((edge, i) => {
    const assignment = prepared.edgesAssignment[i];
    if ((assignment !== 'M' && assignment !== 'V') || prepared.edgesFoldAngle[i] === 0) return;
    if (prepared.edgesFaces[i]?.length !== 2 || !drivenEdges.has(i)) {
      const start = prepared.fold.vertices_coords[edge[0]];
      const end = prepared.fold.vertices_coords[edge[1]];
      const place = start && end
        ? `（${start[0].toPrecision(5)}, ${(-start[2]).toPrecision(5)}）至（${end[0].toPrecision(5)}, ${(-end[2]).toPrecision(5)}）`
        : '';
      throw new Error(`模拟网格中第 ${i + 1} 条山谷折线${place}未进入折叠求解，请检查该处退化纸面。`);
    }
  });
  const warnings: string[] = [];
  if (prepared.diagnostics.warnings.length) warnings.push('模拟网格已清理或重建部分几何；原折痕图未修改，请检查预览。');
  if (source.edges_assignment?.some(a => a === 'U')) warnings.push('未赋型折线没有驱动目标角，结果仅供观察。');
  if (!source.edges_foldAngle) warnings.push('输入未提供目标角，本次按山线 −180°、谷线 +180° 解释。');
  return { prepared:refinePreparedSimulationMesh(prepared,SIMULATION_MESH_LEVELS[quality]), warnings };
}
