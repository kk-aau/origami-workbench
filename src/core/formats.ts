import { XMLParser, XMLValidator } from 'fast-xml-parser';
import {importORI,exportORI} from './ori';
import {importORH,exportORH} from './orh';
import {cpPaperCoordinates,segmentPaperSize} from './exchangeCoordinates';
import { buildFold } from './geometry';
import {hasMaterialTopology,inspectMaterialTopology} from './materialTopology';
import {importMaterialFold,exportMaterialFold} from './materialFormat';
import {importFoldInterchange,exportFoldInterchange} from './foldInterchange';
import { PROJECT_VERSION, upgradeProject } from './project';
import {serializeProject} from './projectData.mjs';
import { defaultAngle, validateDoc, type Assignment, type Doc, type DocumentFormat, type ExportResult, type ImportResult, type Point, type Segment } from './types';

// CP 4 is treated as the workbench's non-folding auxiliary line by design.
// Accept old workbench CP 0 files, but always write auxiliary CP lines as 4.
// ORIPA OPX has its own numbering and must keep auxiliary type 0.
const cpAssignment: Record<string, Assignment> = { '0': 'A', '1': 'B', '2': 'M', '3': 'V', '4': 'A' };
const assignmentCp: Partial<Record<Assignment, number>> = { A: 4, B: 1, M: 2, V: 3 };
const opxAssignment: Record<string, Assignment> = { '0': 'A', '1': 'B', '2': 'M', '3': 'V' };
const assignmentOpx: Partial<Record<Assignment, number>> = { A: 0, B: 1, M: 2, V: 3 };
const finite = (v: unknown, context: string): number => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN; if (!Number.isFinite(n)) throw new Error(`${context}不是有效数值。`); return n; };
function makeDoc(name: string, segments: Segment[], metadata?: Record<string, unknown>): Doc {
  const doc: Doc = { name, paper: segmentPaperSize(segments), segments, ...(metadata ? { metadata } : {}) };
  validateDoc(doc); return doc;
}
export function importDocument(text: string, format: DocumentFormat, name = '导入作品'): ImportResult {
  text = text.replace(/^\uFEFF/, '');
  if (format === 'ori') return importORI(text,name);
  if (format === 'orh') return importORH(text,name);
  if (format === 'cp') return importCP(text, name);
  if (format === 'opx') return importOPX(text, name);
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('JSON 格式无效，请检查文件是否完整。'); }
  return importParsedDocument(data, format, name);
}

/** Import JSON or FOLD data that the caller has already parsed. */
export function importParsedDocument(data: unknown, format: 'json' | 'fold', name = '导入作品'): ImportResult {
  if (format === 'json') {
    const record = data as Record<string, unknown>;
    if (record?.format !== undefined && record.format !== 'zhezhi-workbench') throw new Error('这不是折纸工坊工程文件。');
    if (record?.version !== undefined && record.version !== 1 && record.version !== PROJECT_VERSION) throw new Error('工程版本不受支持，不能保证无损读取。');
    if (record?.version !== undefined && record.schemaVersion !== undefined && record.version !== record.schemaVersion) throw new Error('工程版本字段不一致，未读取。');
    validateDoc(data);
    const native = data as Doc;
    const extras = Object.fromEntries(Object.entries(record).filter(([k]) => !['format', 'version', 'schemaVersion', 'objects', 'background', 'flatFold', 'name', 'paper', 'segments', 'metadata'].includes(k)));
    const doc = upgradeProject({ name: native.name, paper: native.paper, segments: native.segments, objects: native.objects, ...(native.flatFold!==undefined?{flatFold:native.flatFold}:{}), ...(native.background?{background:native.background}:{}), ...(native.metadata ? { metadata: native.metadata } : {}) });
    if (Object.keys(extras).length) doc.metadata = { ...doc.metadata, nativeExtras: extras };
    return { doc, warnings: Object.keys(extras).length ? ['工程中未解释的扩展字段已保存在 metadata.nativeExtras。'] : [] };
  }
  return importFold(data, name);
}

/** Scan line boundaries without retaining an array of every source record. */
function* cpLines(text:string):Generator<string>{
  const newline=/\r\n|[\r\n]/g;let start=0,match:RegExpExecArray|null;
  while((match=newline.exec(text))!==null){yield text.slice(start,match.index);start=newline.lastIndex;}
  yield text.slice(start);
}

export function importCP(text: string, name = '导入折痕图'): ImportResult {
  const segments: Segment[] = [], warnings: string[] = ['CP 文件没有单位信息，本次按毫米读取；可在导入后核对纸张尺寸。'];
  let i=-1;
  for(const line of cpLines(text)){
    i++;
    const clean = line.trim(); if (!clean || clean.startsWith('#')) continue;
    const fields = clean.split(/\s+/);
    if (fields.length !== 5 || !Object.hasOwn(cpAssignment,fields[0])) throw new Error(`CP 第 ${i + 1} 行格式无效，应为“线型 x1 y1 x2 y2”，支持类型 1/2/3/4（边界／山折／谷折／辅助），兼容旧辅助类型 0。`);
    const n = fields.slice(1).map(v => finite(v, `第 ${i + 1} 行坐标`));
    const assignment = cpAssignment[fields[0]];
    segments.push({ id: `cp-${i + 1}`, a: [n[0], n[1]], b: [n[2], n[3]], assignment, angle: defaultAngle(assignment) });
  }
  if (!segments.length) throw new Error('CP 文件不包含线段。');
  if (segments.some(s=>s.assignment==='A')) warnings.push('CP 类型 4（兼容旧类型 0）已按辅助线读取，不参与折叠计算；再次导出 CP 时统一写为 4。');
  return { doc: makeDoc(name, segments, { sourceFormat: 'cp' }), warnings };
}

export function importFold(value: unknown, name = '导入 FOLD'): ImportResult {
  if (!value || typeof value !== 'object') throw new Error('FOLD 文件根节点必须是对象。');
  const raw = importFoldInterchange(value as Record<string, unknown>), warnings: string[] = [];
  const material=importMaterialFold(raw,name);if(material)return material;
  if (Array.isArray(raw.file_frames) && raw.file_frames.length) throw new Error('此文件包含多个 FOLD 帧。本版仅支持单帧二维折痕图；请先导出所需 creasePattern 帧。');
  if (raw.frame_parent !== undefined || raw.frame_inherit) throw new Error('不支持依赖父帧的 FOLD 文件，请先展开为完整单帧。');
  if (Array.isArray(raw.frame_classes) && raw.frame_classes.some(c => c === 'foldedForm' || c === 'foldedState')) throw new Error('这是折后形态，不是二维折痕图，不能作为绘图工程导入。');
  if (!Array.isArray(raw.vertices_coords) || !Array.isArray(raw.edges_vertices)) throw new Error('FOLD 缺少 vertices_coords 或 edges_vertices。');
  const units: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, inch: 25.4, pt: 25.4 / 72 };
  const unit = typeof raw.frame_unit === 'string' ? raw.frame_unit : 'unitless';
  if (unit !== 'unitless' && !units[unit]) throw new Error(`暂不支持 FOLD 单位 ${unit}，请转换为 mm。`);
  const scale = units[unit] ?? 1;
  if (unit === 'unitless') warnings.push('FOLD 未指定物理单位，本次按毫米读取，请核对尺寸。');
  else if (scale !== 1) warnings.push(`已将 ${unit} 坐标换算为毫米。`);
  let zeroZ = false;
  const coords: Point[] = raw.vertices_coords.map((p: unknown, i) => {
    if (!Array.isArray(p) || (p.length !== 2 && p.length !== 3)) throw new Error(`FOLD 顶点 ${i} 坐标维度无效。`);
    if (p.length === 3) { if (finite(p[2], 'Z 坐标') !== 0) throw new Error('不支持三维 FOLD 导入为折痕图；请提供二维展开帧。'); zeroZ = true; }
    return [finite(p[0], 'X 坐标') * scale, finite(p[1], 'Y 坐标') * scale];
  });
  if (zeroZ) warnings.push('所有 Z 坐标均为 0，已明确转换为二维坐标。');
  const assignments = raw.edges_assignment, angles = raw.edges_foldAngle;
  if (assignments !== undefined && (!Array.isArray(assignments) || assignments.length !== raw.edges_vertices.length)) throw new Error('FOLD 线型数组长度与边数不一致。');
  if (angles !== undefined && (!Array.isArray(angles) || angles.length !== raw.edges_vertices.length)) throw new Error('FOLD 折角数组长度与边数不一致。');
  if (!assignments) warnings.push('FOLD 未提供山谷类型：有折角时按符号恢复，其余标为未指派；未猜测边界。');
  const segments: Segment[] = raw.edges_vertices.map((edge: unknown, i) => {
    if (!Array.isArray(edge) || edge.length !== 2 || !edge.every(v => Number.isInteger(v) && v >= 0 && v < coords.length)) throw new Error(`FOLD 边 ${i} 的顶点索引无效。`);
    const inputAngle = Array.isArray(angles) && angles[i] !== null ? finite(angles[i], `边 ${i} 折角`) : null;
    const a = Array.isArray(assignments) ? String(assignments[i]).toUpperCase() : inputAngle === null ? 'U' : inputAngle < 0 ? 'M' : inputAngle > 0 ? 'V' : 'U';
    if (!['M', 'V', 'B', 'U', 'F'].includes(a)) throw new Error(`FOLD 线型 ${a} 暂不支持（例如切口不能当作普通折痕）。`);
    const assignment = a as Assignment;
    return { id: `fold-${i}`, a: [...coords[edge[0]]], b: [...coords[edge[1]]], assignment, angle: Array.isArray(angles) ? inputAngle : defaultAngle(assignment) };
  });
  const geometryFields = new Set(['vertices_coords', 'edges_vertices', 'edges_assignment', 'edges_foldAngle']);
  const ignoredTopology = Object.keys(raw).filter(k => !geometryFields.has(k) && /^(vertices_|edges_|faces_|faceOrders|edgeOrders)/.test(k));
  if (ignoredTopology.length) warnings.push(`原有拓扑/层序字段（${ignoredTopology.join('、')}）不作为计算依据，已保存在来源元数据；编辑后会重新构建。`);
  const known = new Set([...geometryFields, 'file_spec', 'file_creator', 'file_title', 'frame_title', 'frame_unit', 'frame_classes', 'frame_attributes', 'file_frames', 'zhezhi_auxiliary', 'zhezhi_paper', 'zhezhi_metadata']);
  const extras = Object.fromEntries(Object.entries(raw).filter(([k]) => !geometryFields.has(k) && !['zhezhi_metadata', 'zhezhi_auxiliary', 'zhezhi_paper'].includes(k)));
  const extraKeys = Object.keys(raw).filter(k => !known.has(k) && !ignoredTopology.includes(k));
  if (extraKeys.length) warnings.push(`未解释扩展字段 ${extraKeys.join('、')}，已保存在来源元数据中，不会用于折叠计算。`);
  const title = typeof raw.file_title === 'string' ? raw.file_title : typeof raw.frame_title === 'string' ? raw.frame_title : name;
  const ownMetadata = raw.zhezhi_metadata && typeof raw.zhezhi_metadata === 'object' && !Array.isArray(raw.zhezhi_metadata) ? structuredClone(raw.zhezhi_metadata as Record<string, unknown>) : {};
  const doc = makeDoc(title, segments, { ...ownMetadata, sourceFormat: 'fold', sourceFoldExtras: extras });
  if (Array.isArray(raw.zhezhi_auxiliary)) {
    const aux = raw.zhezhi_auxiliary as Segment[];
    if (aux.some(s => !s || s.assignment !== 'A')) throw new Error('FOLD 辅助线扩展无效。');
    const savedAuxiliaryHistory = !segments.length && Object.hasOwn(ownMetadata, 'materialCurveModel');
    for (const [i,s] of aux.entries()) doc.segments.push({ ...s, id: savedAuxiliaryHistory ? s.id : `aux-${i}`, a: [finite(s.a?.[0], '辅助线坐标') * scale, finite(s.a?.[1], '辅助线坐标') * scale], b: [finite(s.b?.[0], '辅助线坐标') * scale, finite(s.b?.[1], '辅助线坐标') * scale] });
    warnings.push('已读取折纸工坊辅助线扩展；其他 FOLD 软件可能忽略这些辅助线。');
  }
  if (raw.zhezhi_paper && typeof raw.zhezhi_paper === 'object') {
    const p = raw.zhezhi_paper as Record<string, unknown>; doc.paper = { width: finite(p.width, '纸宽') * scale, height: finite(p.height, '纸高') * scale };
  }
  validateDoc(doc); return { doc, warnings };
}

interface XmlNode { tag: string; attrs: Record<string, string>; text: string; children: XmlNode[] }
function xmlNodes(entries: unknown[], depth = 0): XmlNode[] {
  if (depth > 40) throw new Error('OPX XML 嵌套过深。');
  return entries.flatMap(entry => {
    const row = entry as Record<string, unknown>;
    const tag = Object.keys(row).find(k => k !== ':@' && k !== '#text' && !k.startsWith('?'));
    if (!tag) return [];
    const body = Array.isArray(row[tag]) ? row[tag] as unknown[] : [];
    const attrs = Object.fromEntries(Object.entries((row[':@'] ?? {}) as Record<string, unknown>).map(([k, v]) => [k.replace(/^@_/, ''), String(v)]));
    const text = body.map(r => String((r as Record<string, unknown>)['#text'] ?? '')).join('');
    return [{ tag, attrs, text, children: xmlNodes(body, depth + 1) }];
  });
}
function walk(node: XmlNode): XmlNode[] { return [node, ...node.children.flatMap(walk)]; }
function xmlProperties(node: XmlNode): Map<string, XmlNode[]> {
  const props = new Map<string, XmlNode[]>();
  for (const child of node.children.filter(n => n.tag === 'void')) {
    if (child.attrs.property) props.set(child.attrs.property, child.children);
    else if (child.attrs.method === 'getField') {
      const field = child.children.find(n => n.tag === 'string')?.text;
      const setter = child.children.find(n => n.tag === 'void' && n.attrs.method === 'set');
      if (field && setter) props.set(field, setter.children.filter(n => !(n.tag === 'object' && n.attrs.idref)));
    }
  }
  return props;
}
export function importOPX(text: string, name = '导入 ORIPA'): ImportResult {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('为安全起见，不接受包含 DTD 或实体声明的 OPX。');
  const valid = XMLValidator.validate(text); if (valid !== true) throw new Error(`OPX XML 无效：${valid.err.msg}`);
  const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, parseTagValue: false, processEntities: true, trimValues: false });
  const roots = xmlNodes(parser.parse(text));
  const nodes = roots.flatMap(walk);
  const illegal = nodes.find(n => n.tag === 'object' && n.attrs.class && !['oripa.DataSet', 'oripa.OriLineProxy'].includes(n.attrs.class));
  if (illegal) throw new Error(`OPX 包含不受支持的对象 ${illegal.attrs.class}；本程序只读取几何数据，不执行 Java 对象。`);
  const root = nodes.find(n => n.tag === 'object' && n.attrs.class === 'oripa.DataSet');
  if (!root) throw new Error('OPX 缺少 oripa.DataSet 数据对象。');
  const props = xmlProperties(root), array = props.get('lines')?.find(n => n.tag === 'array');
  if (!array) throw new Error('OPX 缺少 lines 数组。');
  const lineNodes = walk(array).filter(n => n.tag === 'object' && n.attrs.class === 'oripa.OriLineProxy');
  if (array.attrs.length !== undefined && finite(array.attrs.length, 'OPX 数组长度') !== lineNodes.length) throw new Error('OPX 线段数组包含缺失项或不支持的引用对象，不能保证完整读取。');
  if (!lineNodes.length) throw new Error('OPX 没有可读取的线段。');
  const segments = lineNodes.map((node, i): Segment => {
    const p = xmlProperties(node);
    const number = (key: string) => finite(p.get(key)?.find(n => ['int', 'double', 'float', 'long'].includes(n.tag))?.text ?? '0', `OPX ${key}`);
    const assignment = opxAssignment[String(number('type'))]; if (!assignment) throw new Error(`OPX 线型 ${number('type')} 暂不支持。`);
    return { id: `opx-${i}`, a: [number('x0'), number('y0')], b: [number('x1'), number('y1')], assignment, angle: defaultAngle(assignment) };
  });
  const title = props.get('title')?.find(n => n.tag === 'string')?.text || name;
  const sourceProperties = Object.fromEntries([...props].filter(([k]) => k !== 'lines').map(([k, v]) => [k, v.map(n => n.text).join('')]));
  const warnings = ['OPX 未指定可靠物理单位，本次按毫米读取；请核对纸张尺寸。'];
  const other = [...props.keys()].filter(k => !['lines', 'title', 'paperSize', 'mainVersion', 'subVersion'].includes(k));
  if (other.length) warnings.push(`ORIPA 的 ${other.join('、')} 字段已保存在来源元数据，不解释为几何或折叠约束。`);
  return { doc: makeDoc(title, segments, { sourceFormat: 'opx', sourceProperties }), warnings };
}

function escapeXML(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
function numeric(n: number): string { return String(Number(n.toFixed(10))); }
export function exportDocument(doc: Doc, format: DocumentFormat, options:{cpCoordinates?:'paper'|'original'}={}): ExportResult {
  validateDoc(doc);
  const material=hasMaterialTopology(doc)?inspectMaterialTopology(doc):null;
  if(material&&!material.ok)throw new Error(material.reason);
  if (format === 'ori') return exportORI(doc);
  if (format === 'orh') return exportORH(doc);
  if (format === 'json') return { text: serializeProject(upgradeProject(doc),true), warnings: [] };
  const warnings: string[] = [];
  if (doc.segments.some(s => s.displayColor !== undefined && (format !== 'fold' || s.assignment !== 'A'))) warnings.push(`${format.toUpperCase()} 交换文件会丢失线段自定义显示颜色；请同时保存完整工程 JSON。`);
  if(doc.background)warnings.push(`${format.toUpperCase()} 交换文件不包含参考底图，请同时保存完整工程 JSON。`);
  if(doc.flatFold)warnings.push(format==='fold'&&material?'材料 FOLD 保留当前起始面索引，不包含选面历史；请同时保存完整工程 JSON。':`${format.toUpperCase()} 交换文件不包含起始面设置，请同时保存完整工程 JSON。`);
  if (doc.objects?.length) warnings.push(`${format.toUpperCase()} 交换文件不包含 ${doc.objects.length} 个圆、文字或独立标记对象；请同时保存完整工程 JSON。`);
  if (format === 'fold') {
    if(material){
      const output=exportMaterialFold(doc);
      return {text:JSON.stringify(exportFoldInterchange(output),null,2),warnings:[...warnings,'材料边与折后位置已独立保存；层序不会作为已验证结果导出。']};
    }
    const { graph, warnings: buildWarnings } = buildFold(doc);
    const output = { ...graph, zhezhi_paper: doc.paper, zhezhi_auxiliary: doc.segments.filter(s => s.assignment === 'A'), ...(doc.metadata ? { zhezhi_metadata: doc.metadata } : {}) };
    warnings.push(...buildWarnings);
    if (doc.segments.some(s => s.assignment === 'A')) warnings.push('辅助线写入 zhezhi:workbench 扩展；不识别此扩展的软件会忽略它们。');
    if (doc.metadata) warnings.push('来源扩展数据写入 zhezhi:workbench，不会作为有效拓扑或层序字段回写。');
    return { text: JSON.stringify(exportFoldInterchange(output),null,2), warnings };
  }
  const assignmentCode = format === 'cp' ? assignmentCp : assignmentOpx;
  const unsupported = doc.segments.find(s => assignmentCode[s.assignment] === undefined);
  if (unsupported) throw new Error(`${format.toUpperCase()} 不支持未指派（U）或展开线（F），请使用 FOLD 或完整工程 JSON，避免错误改变线型。`);
  warnings.push(`${format.toUpperCase()} 仅用于交换线段，不保存完整工程、历史、纸张单位或目标折角；请同时保存工程 JSON。`);
  if (format === 'cp') {
    const point=options.cpCoordinates==='original'?(p:Point)=>p:cpPaperCoordinates(doc);
    warnings.push(options.cpCoordinates==='original'?'CP 保留原始坐标；接收软件的参考网格可能需要手动调整。':'CP 已按纸边居中并等比缩放，最长边为 400（−200 到 200），适配原工具的默认网格。非正方形保持比例；CP 不保存网格设置或毫米尺寸。');
    return { text: doc.segments.map(s => `${assignmentCp[s.assignment]} ${[...point(s.a), ...point(s.b)].map(numeric).join(' ')}`).join('\n') + '\n', warnings };
  }
  const lines = doc.segments.map((s, i) => `   <void index="${i}"><object class="oripa.OriLineProxy">\n${Object.entries({ type: assignmentOpx[s.assignment], x0: s.a[0], y0: s.a[1], x1: s.b[0], y1: s.b[1] }).map(([k, v]) => `    <void property="${k}"><${k === 'type' ? 'int' : 'double'}>${numeric(v!)}</${k === 'type' ? 'int' : 'double'}></void>`).join('\n')}\n   </object></void>`).join('\n');
  // Native ORIPA XMLEncoder uses public fields for title/lines and bean setters for numeric metadata.
  const field = (key: string, body: string) => ` <void class="oripa.DataSet" method="getField"><string>${key}</string><void method="set"><object idref="DataSet0"/>${body}</void></void>`;
  return { text: `<?xml version="1.0" encoding="UTF-8"?>\n<java version="17" class="java.beans.XMLDecoder">\n<object class="oripa.DataSet" id="DataSet0">\n <void property="mainVersion"><int>1</int></void>\n <void property="subVersion"><int>1</int></void>\n${field('title', `<string>${escapeXML(doc.name)}</string>`)}\n <void property="paperSize"><double>${numeric(Math.max(doc.paper.width, doc.paper.height))}</double></void>\n${field('lines', `<array class="oripa.OriLineProxy" length="${doc.segments.length}">\n${lines}\n</array>`)}\n</object>\n</java>`, warnings };
}
