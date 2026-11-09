import {XMLParser, XMLValidator} from 'fast-xml-parser';
import {getDrawingBounds, type Bounds} from '../app/paper';
import {analyzeCPPaths,cpPathMetrics,cpProcessingLineRuns,checkCPPathLimits,cpPathTurnCount,type CPPathOptimization} from './cpPathOptimizer';
import {DXF_LAYERS, exportDXF} from './dxf';
import {writeDxf} from '../../vendor/cp-path-optimizer/src/dxf.mjs';
import {validateDoc, type Assignment, type Doc, type ExportResult, type Point, type Segment} from './types';

export type CPProcessingExportFormat = 'svg' | 'dxf' | 'dxf-lines' | 'dxf-r12-polyline';
export interface CPProcessingReadbackReport {
  verified: true;
  format: CPProcessingExportFormat;
  units: 'mm';
  coordinateConvention: 'x,y' | 'x,-y';
  pathCount: number;
  representation: 'svg-path' | 'dxf-lwpolyline' | 'dxf-line' | 'dxf-polyline';
  entityCount: number;
  plannedPathCount: number;
  maxPlannedTurns: number;
  continuousPathsPreserved: boolean;
  processedEdgeCount: number;
  downLength: number;
  travelLength: number;
  bounds: Bounds;
  sourcePasses: Record<string, number>;
  /** FNV-1a of independently parsed ordered geometry and provenance, not a security signature. */
  checksum: string;
  geometryCoverage: 'exact';
  physicalImportVerified: false;
  machineTrialVerified: false;
  motion: {penDownTurns:number;reversedSourceEdges:number;closedPaths:number};
}

type OptimizedPath = CPPathOptimization['paths'][number];
type ProcessingGroup = CPPathOptimization['groups'][number];
interface ParsedPath {
  id: string;
  groupId: string;
  settingsKey: string;
  points: Point[];
  sourceSegmentIds: string[];
  assignments: Assignment[];
}
interface Expected {
  options: CPPathOptimization['options'];
  independent: boolean;
  groups: Map<string, ProcessingGroup>;
  sources: Map<string, Segment>;
  paths: Map<string, OptimizedPath>;
  passes: Map<string, number>;
  sourceGroups: Map<string, string>;
  bounds: Bounds;
}
function fail(detail: string): never { throw new Error(`加工导出核验失败：${detail}`); }
const samePoint = (a: Point, b: Point): boolean => a[0] === b[0] && a[1] === b[1];
const validPoint = (value: unknown): value is Point => Array.isArray(value) && value.length === 2 && value.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1_000_000);
const numberText = (n: number): string => String(Object.is(n, -0) ? 0 : n);
const escapeXML = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const jsonAttribute = (value: unknown): string => escapeXML(JSON.stringify(value));
const sameJSON = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const svgColors: Record<Assignment, string> = {M: '#dd3333', V: '#2255dd', B: '#222222', A: '#00a0a0', U: '#777777', F: '#33aa55'};

/** Rebuild the selected source set from explicit settings before trusting the optimized plan. */
function expectedFor(doc: Doc, plan: CPPathOptimization): Expected {
  validateDoc(doc);
  if (!plan || !plan.options || !Array.isArray(plan.paths) || !Array.isArray(plan.groups)) fail('加工计划缺少完整设置、路径或分组。');
  const analysis = analyzeCPPaths(doc, plan.options);
  if (!sameJSON(plan.options, analysis.options)) fail('加工计划设置不完整或未经归一化。');
  if (analysis.overlaps.length && plan.options.overlapPolicy !== 'retain') fail('检测到重复或重叠线，必须先明确选择保留加工次数。');
  if (!sameJSON(plan.groups, analysis.groups)) fail('分组与已选择的加工设置不一致。');
  const groups = new Map(plan.groups.map(group => [group.id, group]));
  if (groups.size !== plan.groups.length) fail('加工分组标识重复。');
  const sources = new Map(analysis.included.map(segment => [segment.id, segment]));
  const passes = new Map<string, number>();
  for (const group of analysis.groups) for (const id of group.sourceSegmentIds) passes.set(id, group.passes);
  if (sources.size !== passes.size || [...sources.keys()].some(id => !passes.has(id))) fail('源线段与加工分组覆盖不一致。');
  const paths = new Map(plan.paths.map(path => [path.id, path]));
  if (paths.size !== plan.paths.length || plan.paths.some(path => typeof path.id !== 'string' || !path.id || path.id.length > 256)) fail('加工路径标识缺失、重复或过长。');
  const sourceGroups = new Map(analysis.groups.flatMap(group => group.sourceSegmentIds.map(id => [id, group.id] as const)));
  const expected = {groups, sources, paths, passes, sourceGroups,options:analysis.options, independent:plan.options.pathMode==='independent', bounds: getDrawingBounds(doc)};
  checkPaths(plan.paths, expected);
  const baseline: OptimizedPath[] = [];
  for (const group of analysis.groups) for (const id of group.sourceSegmentIds) {
    const source = sources.get(id)!;
    for (let pass = 0; pass < group.passes; pass++) baseline.push({id: `original_${baseline.length + 1}`, groupId: group.id, settingsKey: group.settingsKey, points: [source.a, source.b], sourceSegmentIds: [id], assignments: [source.assignment]});
  }
  if (!sameJSON(plan.before, cpPathMetrics(baseline, analysis.options.origin)) || !sameJSON(plan.after, cpPathMetrics(plan.paths, analysis.options.origin))) fail('优化前后路径统计与真实源线或路径不一致。');
  return expected;
}

/** Every real L / VERTEX edge must be an entire original source edge, with no tolerance snapping. */
function checkPaths(paths: ParsedPath[], expected: Expected): Map<string, number> {
  if (paths.length !== expected.paths.size) fail('连续加工路径数量不一致。');
  const visits = new Map<string, number>();
  const seenPaths = new Set<string>();
  const orderedIds = [...expected.paths.keys()];
  for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
    const path = paths[pathIndex];
    if (!path || seenPaths.has(path.id)) fail('加工路径标识重复。');
    if (path.id !== orderedIds[pathIndex]) fail('加工路径顺序被修改，空走距离会改变。');
    seenPaths.add(path.id);
    const planned = expected.paths.get(path.id), group = expected.groups.get(path.groupId);
    if (!planned || !group || planned.groupId !== path.groupId || group.settingsKey !== path.settingsKey || planned.settingsKey !== path.settingsKey) fail('路径被移入其他加工设置分组。');
    if (!Array.isArray(path.points) || path.points.length < 2 || !path.points.every(validPoint)) fail('路径坐标无效。');
    try{checkCPPathLimits(path.points,expected.options);}catch(error){fail(error instanceof Error?error.message:String(error));}
    if (!Array.isArray(path.sourceSegmentIds) || !Array.isArray(path.assignments) || path.sourceSegmentIds.length !== path.points.length - 1 || path.assignments.length !== path.sourceSegmentIds.length) fail('路径加工边与来源数量不一致。');
    if (!sameJSON(path.sourceSegmentIds, planned.sourceSegmentIds) || !sameJSON(path.assignments, planned.assignments)) fail('路径来源或线型被修改。');
    if (!sameJSON(path.points, planned.points)) fail('加工路径位置、方向或点顺序被修改。');
    for (let i = 0; i < path.sourceSegmentIds.length; i++) {
      const id = path.sourceSegmentIds[i], source = expected.sources.get(id), a = path.points[i], b = path.points[i + 1];
      if (!source || expected.sourceGroups.get(id) !== group.id || source.assignment !== path.assignments[i]) fail('加工边来源或加工设置不一致。');
      if (samePoint(a, b) || !((samePoint(a, source.a) && samePoint(b, source.b)) || (samePoint(a, source.b) && samePoint(b, source.a)))) fail(`线段 ${id} 的位置、尺度或覆盖已改变，或新增了跨空白加工。`);
      if (path.points.length!==2 && expected.independent) fail('逐边模式出现连续合并路径。');
      if (expected.independent && (!samePoint(a,source.a)||!samePoint(b,source.b))) fail('逐边模式改变了原线段方向。');
      visits.set(id, (visits.get(id) ?? 0) + 1);
    }
  }
  if (visits.size !== expected.passes.size || [...expected.passes].some(([id, count]) => visits.get(id) !== count)) fail('线段遗漏、多加工或加工次数不一致。');
  return visits;
}

export function exportCPProcessingSVG(doc: Doc, plan: CPPathOptimization): ExportResult {
  const expected = expectedFor(doc, plan), {x, y, width, height} = expected.bounds;
  // Preserve the optimizer's path order even when it interleaves settings groups.
  const runs: {group: ProcessingGroup; paths: OptimizedPath[]}[] = [];
  for (const path of plan.paths) {
    const previous = runs[runs.length - 1];
    if (previous?.group.id === path.groupId) previous.paths.push(path);
    else runs.push({group: expected.groups.get(path.groupId)!, paths: [path]});
  }
  const groups = runs.map(({group, paths: runPaths}) => {
    const paths = runPaths.map(path => {
      const d = path.points.map((point, i) => `${i ? 'L' : 'M'} ${numberText(point[0])} ${numberText(point[1])}`).join(' ');
      return `<path data-path-id="${escapeXML(path.id)}" data-source-segment-ids="${jsonAttribute(path.sourceSegmentIds)}" data-assignments="${jsonAttribute(path.assignments)}" d="${d}" fill="none" stroke="${svgColors[group.assignments[0]]}" stroke-width="0.1"/>`;
    }).join('');
    return `<g data-group-id="${escapeXML(group.id)}" data-settings-key="${escapeXML(group.settingsKey)}" data-assignments="${jsonAttribute(group.assignments)}" data-passes="${group.passes}">${paths}</g>`;
  }).join('');
  const text = `<svg xmlns="http://www.w3.org/2000/svg" width="${numberText(width)}mm" height="${numberText(height)}mm" viewBox="${[x, y, width, height].map(numberText).join(' ')}" data-cp-format="zhezhi-cp-processing-v1" data-units="mm">${groups}</svg>`;
  verifyCPProcessingExport(text, 'svg', doc, plan);
  return {text, warnings: exportWarnings(doc, 'SVG')};
}

function exportWarnings(doc: Doc, format: string): string[] {
  const warnings = [`${format} 保留原毫米坐标；加工设置为分组标签，每条输出路径仅表示实际连续中心线，不包含抬笔空走。`, '本次已自动回读核对几何和加工次数；刻字软件导入与机器试压未验证。'];
  if (doc.objects?.length) warnings.push(`未加工 ${doc.objects.length} 个圆、文字或独立标记对象。`);
  if (doc.background) warnings.push('参考底图不包含在加工路径中。');
  return warnings;
}

/** A processing group has a unique representative assignment, so ordinary layer
 * names preserve separate settings without adding opaque application metadata. */
function groupLayers(groups: ProcessingGroup[]): Map<string, {name: string; color: number}> {
  const layers = new Map(groups.map(group => [group.id, DXF_LAYERS[group.assignments[0]]]));
  if (new Set([...layers.values()].map(layer => layer.name)).size !== groups.length) fail('不同加工设置不能共用同一 DXF 图层。');
  return layers;
}

/** Reuse the supplied ZIP's complete R2000 skeleton. Provenance lives in the
 * JSON report: machining importers only see standard drawing entities. */
function modernDXF(plan: CPPathOptimization): string {
  const layers = groupLayers(plan.groups);
  return writeDxf(plan.paths.map(path => ({...layers.get(path.groupId)!, layer: layers.get(path.groupId)!.name, points: path.points.map(([x, y]): Point => [x, -y]), closed: false})), {format: 'LWPOLYLINE', units: 4});
}
export function exportCPProcessingDXF(doc: Doc, plan: CPPathOptimization): ExportResult {
  expectedFor(doc, plan);
  const text = modernDXF(plan);
  verifyCPProcessingExport(text, 'dxf', doc, plan);
  return {text, warnings: [...exportWarnings(doc, 'DXF'), 'DXF 使用标准 R2000 / AC1015 LWPOLYLINE 连续路径；坐标为 (x, -y)，一绘图单位等于一毫米。目标软件是否支持该版本仍须实际导入验证。']};
}

/** The known ordinary R12 LINE dialect is retained as a compatibility fallback.
 * LINEs preserve ordered edges, but cannot encode a pen-down continuous trail. */
function lineDXF(doc: Doc, plan: CPPathOptimization): string {
  const shell = exportDXF({name: doc.name, paper: doc.paper, segments: []}).text;
  const layers = groupLayers(plan.groups), out: string[] = [];
  const pair = (code: number, value: string | number): void => {out.push(String(code), typeof value === 'number' ? numberText(value) : value);};
  for (const {path,firstEdge,endEdge} of cpProcessingLineRuns(plan)) {
    const layer = layers.get(path.groupId)!;
      const a = path.points[firstEdge], b = path.points[endEdge];
      pair(0, 'LINE'); pair(8, layer.name); pair(6, 'CONTINUOUS'); pair(62, layer.color);
      pair(10, a[0]); pair(20, -a[1]); pair(30, 0); pair(11, b[0]); pair(21, -b[1]); pair(31, 0);
  }
  const start = '0\r\nSECTION\r\n2\r\nENTITIES\r\n';
  if (!shell.includes(start + '0\r\nENDSEC')) fail('普通 DXF 的空实体节结构不可复用。');
  return shell.replace(start, start + (out.length ? out.join('\r\n') + '\r\n' : ''));
}
export function exportCPProcessingDXFLines(doc: Doc, plan: CPPathOptimization): ExportResult {
  expectedFor(doc, plan);
  const text = lineDXF(doc, plan);
  verifyCPProcessingExport(text, 'dxf-lines', doc, plan);
  return {text, warnings: [...exportWarnings(doc, 'DXF'), '沿用普通导出的 R12 / AC1009 LINE 格式；共线相连的源边可合成一个 LINE。规划路径与转弯上限不等于设备抬笔指令，下游软件可能重排或重新拼接。按一单位等于一毫米导入。']};
}

/** Traditional 2D R12 sequences, with absolute vertices and default +Z OCS.
 * Open flag 0 is deliberate: a real closed trail retains its explicit final
 * source edge and repeated first vertex, never an implicit closing connector. */
function r12PolylineDXF(doc: Doc, plan: CPPathOptimization): string {
  const shell = exportDXF({name: doc.name, paper: doc.paper, segments: []}).text;
  const layers = groupLayers(plan.groups), out: string[] = [];
  const pair = (code: number, value: string | number): void => {out.push(String(code), typeof value === 'number' ? numberText(value) : value);};
  for (const path of plan.paths) {
    const layer = layers.get(path.groupId)!;
    pair(0, 'POLYLINE'); pair(8, layer.name); pair(6, 'CONTINUOUS'); pair(62, layer.color); pair(66, 1);
    pair(10, 0); pair(20, 0); pair(30, 0); pair(70, 0);
    for (const [x, y] of path.points) {
      pair(0, 'VERTEX'); pair(8, layer.name); pair(10, x); pair(20, -y); pair(30, 0); pair(70, 0);
    }
    pair(0, 'SEQEND'); pair(8, layer.name);
  }
  const start = '0\r\nSECTION\r\n2\r\nENTITIES\r\n';
  if (!shell.includes(start + '0\r\nENDSEC')) fail('普通 DXF 的空实体节结构不可复用。');
  return shell.replace(start, start + (out.length ? out.join('\r\n') + '\r\n' : ''));
}
export function exportCPProcessingDXFR12Polyline(doc: Doc, plan: CPPathOptimization): ExportResult {
  expectedFor(doc, plan);
  const text = r12PolylineDXF(doc, plan);
  verifyCPProcessingExport(text, 'dxf-r12-polyline', doc, plan);
  return {text, warnings: [...exportWarnings(doc, 'DXF'), 'DXF 使用传统 R12 / AC1009 POLYLINE—VERTEX—SEQEND 连续中心线，保留绝对 (x, -y) 毫米位置；零基点和标高，默认 +Z 法向。闭环以原边及显式首尾重复表示，不添加隐式闭边。文件不含抬笔、落笔或设备命令；实际软件导入与机器试压尚未验证。']};
}

type XMLItem = Record<string, unknown>;
function attributes(item: XMLItem, allowed: string[]): Record<string, string> {
  const value = item[':@'];
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('XML 元素缺少属性。');
  const attrs = value as Record<string, unknown>;
  if (Object.keys(attrs).some(key => !allowed.includes(key)) || allowed.some(key => !Object.hasOwn(attrs, key)) || Object.values(attrs).some(v => typeof v !== 'string')) fail('SVG 包含不受支持的属性或缺少必要属性。');
  return attrs as Record<string, string>;
}
function children(item: XMLItem, tag: string): XMLItem[] {
  if (Object.keys(item).some(key => key !== tag && key !== ':@') || !Array.isArray(item[tag])) fail(`SVG 包含不受支持的 ${tag} 元素。`);
  return (item[tag] as XMLItem[]).filter(child => {
    if (Object.keys(child).length === 1 && typeof child['#text'] === 'string' && !(child['#text'] as string).trim()) return false;
    return true;
  });
}
function parseJSON(value: string, label: string): unknown {
  try { return JSON.parse(value); } catch { return fail(`${label} 元数据格式无效。`); }
}
const numberPattern = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?';
function parseNumber(value: string): number {
  if (!(new RegExp(`^${numberPattern}$`)).test(value) || !Number.isFinite(Number(value))) fail('坐标或尺寸不是有限数值。');
  return Number(value);
}
function parsePathData(d: string): Point[] {
  // Explicit M/L for every point: a second M, implicit commands, curves and Z are rejected.
  const tokens = d.trim().split(/\s+/);
  if (tokens.length < 6 || tokens.length % 3 !== 0) fail('SVG 路径不是完整的连续 M/L 线段。');
  const points: Point[] = [];
  for (let i = 0; i < tokens.length; i += 3) {
    if (tokens[i] !== (i ? 'L' : 'M')) fail('SVG 路径包含曲线、额外起笔或闭合隐式加工。');
    points.push([parseNumber(tokens[i + 1]), parseNumber(tokens[i + 2])]);
  }
  return points;
}

function parseSVG(text: string, expected: Expected): ParsedPath[] {
  if (/<!|<\?/i.test(text) || XMLValidator.validate(text) !== true) fail('SVG XML 格式无效，或包含不允许的声明。');
  const data = new XMLParser({preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '', parseAttributeValue: false, parseTagValue: false, processEntities: true, trimValues: false}).parse(text) as XMLItem[];
  if (data.length !== 1 || !data[0].svg) fail('SVG 必须只有一个根元素。');
  const root = data[0], attrs = attributes(root, ['xmlns', 'width', 'height', 'viewBox', 'data-cp-format', 'data-units']);
  if (attrs.xmlns !== 'http://www.w3.org/2000/svg' || attrs['data-cp-format'] !== 'zhezhi-cp-processing-v1' || attrs['data-units'] !== 'mm') fail('SVG 格式或单位被修改。');
  const viewBox = attrs.viewBox.trim().split(/\s+/).map(parseNumber), bounds = expected.bounds;
  if (!sameJSON(viewBox, [bounds.x, bounds.y, bounds.width, bounds.height]) || attrs.width !== `${numberText(bounds.width)}mm` || attrs.height !== `${numberText(bounds.height)}mm`) fail('SVG 画布尺度、毫米单位或坐标位置被修改。');
  const paths: ParsedPath[] = [], seen = new Set<string>();
  for (const item of children(root, 'svg')) {
    const groupAttrs = attributes(item, ['data-group-id', 'data-settings-key', 'data-assignments', 'data-passes']), group = expected.groups.get(groupAttrs['data-group-id']);
    if (!group || groupAttrs['data-settings-key'] !== group.settingsKey || !sameJSON(parseJSON(groupAttrs['data-assignments'], '分组线型'), group.assignments) || groupAttrs['data-passes'] !== String(group.passes)) fail('SVG 加工分组或次数被修改。');
    seen.add(group.id);
    for (const child of children(item, 'g')) {
      const pathAttrs = attributes(child, ['data-path-id', 'data-source-segment-ids', 'data-assignments', 'd', 'fill', 'stroke', 'stroke-width']);
      if (children(child, 'path').length || pathAttrs.fill !== 'none' || pathAttrs.stroke !== svgColors[group.assignments[0]] || pathAttrs['stroke-width'] !== '0.1') fail('SVG 路径出现填充、额外内容或非中心线样式。');
      paths.push({id: pathAttrs['data-path-id'], groupId: group.id, settingsKey: group.settingsKey, points: parsePathData(pathAttrs.d), sourceSegmentIds: parseJSON(pathAttrs['data-source-segment-ids'], '来源') as string[], assignments: parseJSON(pathAttrs['data-assignments'], '线型') as Assignment[]});
    }
  }
  if (seen.size !== expected.groups.size) fail('SVG 加工分组缺失。');
  return paths;
}

interface DXFPair {code: number; value: string}
interface DXFRecord {type: string; pairs: DXFPair[]}
function one(record: DXFRecord, code: number): string {
  const pairs = record.pairs.filter(pair => pair.code === code);
  if (pairs.length !== 1) fail(`DXF ${record.type} 的组码 ${code} 缺失或重复。`);
  return pairs[0].value;
}
function codesOnly(record: DXFRecord, allowed: number[]): void {
  if (record.pairs.some(pair => !allowed.includes(pair.code))) fail(`DXF ${record.type} 包含额外实体属性或变形命令。`);
}
function dxfRecords(pairs: DXFPair[]): DXFRecord[] {
  const records: DXFRecord[] = [];
  for (const pair of pairs) {
    if (pair.code === 0) records.push({type: pair.value, pairs: []});
    else if (!records.length) fail('DXF 实体缺少起始组码。');
    else records[records.length - 1].pairs.push(pair);
  }
  return records;
}
interface DXFFile {sections: Map<string, DXFPair[]>; prefix: DXFPair[]}
function parseDXFFile(text: string): DXFFile {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  if (lines.length % 2 || lines.some(line => /[\r\0]/.test(line))) fail('DXF 组码行数无效。');
  const pairs: DXFPair[] = [];
  for (let i = 0; i < lines.length; i += 2) {
    if (!/^\s*\d+\s*$/.test(lines[i])) fail('DXF 组码无效。');
    pairs.push({code: Number(lines[i]), value: lines[i + 1]});
  }
  const sections = new Map<string, DXFPair[]>(), prefix: DXFPair[] = [];
  let index = 0;
  while (pairs[index]?.code === 999) prefix.push(pairs[index++]);
  while (index < pairs.length && !(pairs[index].code === 0 && pairs[index].value === 'EOF')) {
    if (pairs[index].code !== 0 || pairs[index].value !== 'SECTION' || pairs[index + 1]?.code !== 2) fail('DXF 节结构无效。');
    const name = pairs[index + 1].value;
    if (sections.has(name)) fail('DXF 出现重复的节。');
    index += 2;
    const section: DXFPair[] = [];
    while (index < pairs.length && !(pairs[index].code === 0 && pairs[index].value === 'ENDSEC')) section.push(pairs[index++]);
    if (index >= pairs.length) fail('DXF 节未结束。');
    sections.set(name, section); index++;
  }
  if (!sections.has('ENTITIES') || index !== pairs.length - 1 || pairs[index]?.code !== 0 || pairs[index].value !== 'EOF') fail('DXF 文件缺失实体节或结尾。');
  return {sections, prefix};
}
function checkDXFInfrastructure(actual: DXFFile, template: DXFFile): void {
  if (!sameJSON(actual.prefix, template.prefix) || !sameJSON([...actual.sections.keys()], [...template.sections.keys()])) fail('DXF 版本、节结构或前导声明被修改。');
  for (const [name, pairs] of template.sections) if (name !== 'ENTITIES' && !sameJSON(actual.sections.get(name), pairs)) fail('DXF 单位、范围、标准图层表或模型空间结构被修改。');
}
interface ParsedDXF {paths: ParsedPath[]; serializedPaths: ParsedPath[]}
function parseDXFR12Polyline(text: string, expected: Expected, doc: Doc, plan: CPPathOptimization): ParsedDXF {
  const file = parseDXFFile(text), template = parseDXFFile(r12PolylineDXF(doc, plan));
  checkDXFInfrastructure(file, template);
  const entities = dxfRecords(file.sections.get('ENTITIES')!), layers = groupLayers([...expected.groups.values()]);
  const paths: ParsedPath[] = [];
  let cursor = 0;
  for (const planned of expected.paths.values()) {
    const polyline = entities[cursor++], layer = layers.get(planned.groupId)!;
    if (!polyline || polyline.type !== 'POLYLINE') fail('R12 DXF 连续路径缺少 POLYLINE，或包含额外实体。');
    codesOnly(polyline, [8, 6, 62, 66, 10, 20, 30, 70]);
    if (one(polyline, 8) !== layer.name || one(polyline, 62) !== String(layer.color) || one(polyline, 6) !== 'CONTINUOUS') fail('R12 DXF 连续路径的加工图层或线型被修改。');
    if (one(polyline, 66) !== '1' || one(polyline, 10) !== '0' || one(polyline, 20) !== '0' || one(polyline, 30) !== '0' || one(polyline, 70) !== '0') fail('R12 DXF POLYLINE 基点、标高、跟随顶点标记或二维开放标记被修改。');
    const points: Point[] = [];
    while (entities[cursor]?.type === 'VERTEX') {
      const vertex = entities[cursor++];
      if (points.length >= planned.points.length) fail('R12 DXF 包含额外加工顶点。');
      codesOnly(vertex, [8, 10, 20, 30, 70]);
      if (one(vertex, 8) !== layer.name || one(vertex, 30) !== '0' || one(vertex, 70) !== '0') fail('R12 DXF VERTEX 图层、标高或二维标记被修改。');
      points.push([parseNumber(one(vertex, 10)), -parseNumber(one(vertex, 20))]);
    }
    if (points.length !== planned.points.length) fail('R12 DXF 完整路径顶点数量不一致。');
    const end = entities[cursor++];
    if (!end || end.type !== 'SEQEND') fail('R12 DXF 路径缺少完整 SEQEND。');
    codesOnly(end, [8]);
    if (one(end, 8) !== layer.name) fail('R12 DXF SEQEND 所属图层被修改。');
    paths.push({...planned, points});
  }
  if (cursor !== entities.length) fail('R12 DXF 包含额外路径、顶点、序列结束符或其他加工实体。');
  return {paths, serializedPaths: paths};
}
function parseDXF(text: string, expected: Expected, doc: Doc, plan: CPPathOptimization, linesOnly: boolean): ParsedDXF {
  const file = parseDXFFile(text), template = parseDXFFile(linesOnly ? lineDXF(doc, plan) : modernDXF(plan));
  checkDXFInfrastructure(file, template);
  const entities = dxfRecords(file.sections.get('ENTITIES')!), plannedPaths = [...expected.paths.values()], layers = groupLayers([...expected.groups.values()]);
  const paths: ParsedPath[] = [], serializedPaths: ParsedPath[] = [];
  if (!linesOnly) {
    if (entities.length !== plannedPaths.length) fail('DXF 连续路径数量不一致，存在遗漏或多加工实体。');
    const templateEntities = dxfRecords(template.sections.get('ENTITIES')!);
    for (let i = 0; i < entities.length; i++) {
      const record = entities[i], planned = plannedPaths[i], layer = layers.get(planned.groupId)!;
      if (record.type !== 'LWPOLYLINE') fail('DXF 出现非连续路径、曲线或新增加工实体。');
      codesOnly(record, [5, 330, 100, 8, 62, 90, 70, 10, 20]);
      if (one(record, 5) !== one(templateEntities[i], 5) || one(record, 330) !== '17' || !sameJSON(record.pairs.filter(p => p.code === 100).map(p => p.value), ['AcDbEntity', 'AcDbPolyline'])) fail('DXF 实体句柄、所属模型空间或子类标记无效。');
      if (one(record, 8) !== layer.name || one(record, 62) !== String(layer.color)) fail('DXF 路径被移入其他加工图层。');
      if (one(record, 70) !== '0') fail('DXF 路径出现闭合隐式加工边。');
      const vertices = record.pairs.filter(p => p.code === 10 || p.code === 20), points: Point[] = [];
      if (vertices.length < 4 || vertices.length % 2) fail('DXF 顶点坐标数量无效。');
      for (let k = 0; k < vertices.length; k += 2) {
        if (vertices[k].code !== 10 || vertices[k + 1].code !== 20) fail('DXF 顶点 XY 配对顺序无效。');
        points.push([parseNumber(vertices[k].value), -parseNumber(vertices[k + 1].value)]);
      }
      if (one(record, 90) !== String(points.length)) fail('DXF 顶点数量与组码 90 不一致。');
      // Provenance is reconstructed by plan order and settings layer. Parsed
      // coordinates must still equal each entire original edge in checkPaths.
      paths.push({...planned, points});
    }
    return {paths, serializedPaths: paths};
  }
  const runs=cpProcessingLineRuns(plan);
  if(entities.length!==runs.length)fail('DXF LINE 实体数量不一致，存在遗漏或多加工。');
  const byPath=new Map<string,typeof runs>();
  for(const run of runs){const list=byPath.get(run.path.id);if(list)list.push(run);else byPath.set(run.path.id,[run]);}
  let cursor=0;
  for(const planned of plannedPaths){
    const layer=layers.get(planned.groupId)!,points:Point[]=[];
    for(const {firstEdge,endEdge} of byPath.get(planned.id)!){
      const record=entities[cursor++];
      if(record.type!=='LINE')fail('DXF 出现非 LINE 或新增加工实体。');
      codesOnly(record,[8,6,62,10,20,30,11,21,31]);
      if(one(record,8)!==layer.name||one(record,62)!==String(layer.color))fail('DXF LINE 被移入其他加工图层。');
      if(one(record,6)!=='CONTINUOUS'||one(record,30)!=='0'||one(record,31)!=='0')fail('DXF LINE 出现虚线或三维变形。');
      const a:Point=[parseNumber(one(record,10)),-parseNumber(one(record,20))],b:Point=[parseNumber(one(record,11)),-parseNumber(one(record,21))];
      if(!samePoint(a,planned.points[firstEdge])||!samePoint(b,planned.points[endEdge]))fail('DXF LINE 位置、尺度或加工边顺序被修改。');
      if(!firstEdge)points.push(a);else if(!samePoint(points.at(-1)!,a))fail('DXF LINE 路径不相连。');
      // Interior source junctions are reconstructed only after the parsed endpoints
      // exactly match an existing monotone collinear chain (validated by the run builder).
      points.push(...planned.points.slice(firstEdge+1,endEdge),b);
      serializedPaths.push({...planned,id:planned.id+':edge'+firstEdge,points:[a,b],sourceSegmentIds:planned.sourceSegmentIds.slice(firstEdge,endEdge),assignments:planned.assignments.slice(firstEdge,endEdge)});
    }
    paths.push({...planned,points});
  }
  return {paths, serializedPaths};
}

function checksum(paths: ParsedPath[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(paths));
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

/** Parse serialized geometry independently, then compare exact coordinates and per-source visits. */
export function verifyCPProcessingExport(text: string, format: CPProcessingExportFormat, doc: Doc, plan: CPPathOptimization): CPProcessingReadbackReport {
  if (typeof text !== 'string' || !text || new TextEncoder().encode(text).length > 64 * 1024 * 1024) fail('输出内容为空或超过 64 MiB。');
  const expected = expectedFor(doc, plan);
  if (!['svg', 'dxf', 'dxf-lines', 'dxf-r12-polyline'].includes(format)) fail('加工导出格式不受支持。');
  const parsed = format === 'svg' ? undefined : format === 'dxf-r12-polyline' ? parseDXFR12Polyline(text, expected, doc, plan) : parseDXF(text, expected, doc, plan, format === 'dxf-lines');
  const paths = format === 'svg' ? parseSVG(text, expected) : parsed!.paths;
  const serializedPaths = parsed?.serializedPaths ?? paths;
  const visits = checkPaths(paths, expected);
  let downLength = 0, travelLength = 0, previous = plan.options.origin;
  for (const path of serializedPaths) {
    travelLength += Math.hypot(path.points[0][0] - previous[0], path.points[0][1] - previous[1]);
    for (let i = 0; i < path.points.length - 1; i++) downLength += Math.hypot(path.points[i + 1][0] - path.points[i][0], path.points[i + 1][1] - path.points[i][1]);
    previous = path.points[path.points.length - 1];
  }
  const sameLength=(a:number,b:number)=>Math.abs(a-b)<=16*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b))*Math.max(1,[...visits.values()].reduce((x,y)=>x+y,0));
  if (paths.length !== plan.after.pathCount || !sameLength(downLength,plan.after.drawLength) || !sameLength(travelLength,plan.after.travelDistance)) fail('序列化路径的真实长度或空走距离与优化统计不一致。');
  const motion={penDownTurns:0,reversedSourceEdges:0,closedPaths:0};
  for(const path of paths)for(let i=0;i<path.sourceSegmentIds.length;i++){
    const source=expected.sources.get(path.sourceSegmentIds[i])!;
    if(!samePoint(path.points[i],source.a))motion.reversedSourceEdges++;
  }
  for(const path of serializedPaths){
    if(path.points.length>2&&samePoint(path.points[0],path.points.at(-1)!))motion.closedPaths++;
    motion.penDownTurns+=cpPathTurnCount(path.points);
  }
  return {verified: true, format, units: 'mm', coordinateConvention: format === 'svg' ? 'x,y' : 'x,-y', pathCount: serializedPaths.length, representation: format === 'svg' ? 'svg-path' : format === 'dxf' ? 'dxf-lwpolyline' : format === 'dxf-r12-polyline' ? 'dxf-polyline' : 'dxf-line', entityCount: serializedPaths.length,plannedPathCount:paths.length,maxPlannedTurns:Math.max(0,...paths.map(p=>cpPathTurnCount(p.points))), continuousPathsPreserved: format !== 'dxf-lines', processedEdgeCount: [...visits.values()].reduce((a, b) => a + b, 0), downLength, travelLength, bounds: expected.bounds, sourcePasses: Object.fromEntries(visits), checksum: checksum(serializedPaths), geometryCoverage: 'exact', physicalImportVerified: false, machineTrialVerified: false,motion};
}
