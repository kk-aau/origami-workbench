/** Strict CP DXF adapter. Straight, planar model-space geometry only. */
import { DXF_TEMPLATE } from './dxf-template.mjs';

export class CPError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'CPError'; this.code = code; this.details = details; }
}
const fail = (code, message, details) => { throw new CPError(code, message, details); };
const textValue = s => String(s).replace(/\\U\+([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
const asciiValue = s => String(s).replace(/[^\x00-\x7f]/g, c => '\\U+' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'));
export function readPairs(text) {
  if (typeof text !== 'string') fail('INPUT', 'DXF 输入必须是文本。');
  if (text.length > 32 * 1024 * 1024) fail('FILE_TOO_LARGE', 'DXF 超过 32 MB，请先只导出需要加工的折痕。');
  if (text.includes('\uFFFD')) fail('TEXT_ENCODING', 'DXF 包含文本解码替换字符；请按原码页正确解码后传入，不能在损坏图层名上优化。');
  if (text.includes('\0') || text.startsWith('AutoCAD Binary DXF')) fail('BINARY_DXF', '只支持 ASCII 文本 DXF，不支持二进制 DXF。');
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (lines.length % 2) fail('DXF_PAIRS', 'DXF 组码和值没有成对出现。');
  const pairs = [];
  for (let i = 0; i < lines.length; i += 2) {
    if (!/^\s*\d+\s*$/.test(lines[i])) fail('DXF_GROUP_CODE', `第 ${i + 1} 行不是有效组码。`);
    pairs.push({ code: Number(lines[i]), value: lines[i + 1] });
  }
  if (!pairs.some(p => p.code === 0 && p.value.trim() === 'EOF')) fail('DXF_EOF', 'DXF 缺少 EOF 结束标记。');
  return pairs;
}
function sections(pairs) {
  const out = new Map();
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].code === 0 && pairs[i].value.trim() === 'SECTION') {
      if (pairs[i + 1]?.code !== 2) fail('DXF_SECTION', 'SECTION 缺少名称。');
      let j = i + 2;
      while (j < pairs.length && !(pairs[j].code === 0 && pairs[j].value.trim() === 'ENDSEC')) j++;
      if (j === pairs.length) fail('DXF_SECTION', 'SECTION 缺少 ENDSEC。');
      const name = pairs[i + 1].value.trim();
      if (out.has(name)) fail('DXF_SECTION', `重复的 ${name} SECTION。`);
      out.set(name, { start: i + 2, end: j, pairs: pairs.slice(i + 2, j) });
      i = j;
    }
  }
  return out;
}
function records(pairs) {
  const out = []; let rec = null;
  for (const p of pairs) {
    if (p.code === 0) { rec = { type: p.value.trim(), pairs: [] }; out.push(rec); }
    else if (rec) rec.pairs.push(p);
  }
  return out;
}
const str = (r, c, d = '') => textValue(r.pairs.find(p => p.code === c)?.value.trim() ?? d);
function num(r, c, d = 0) {
  const raw = r.pairs.find(p => p.code === c)?.value;
  const n = raw === undefined ? d : Number(raw.trim());
  if (!Number.isFinite(n)) fail('DXF_NUMBER', `${r.type} 的组码 ${c} 数值无效。`);
  return n;
}
function headerValue(header, name) {
  const i = header.findIndex(p => p.code === 9 && p.value.trim() === name);
  return i < 0 ? undefined : header[i + 1]?.value.trim();
}
function assertPlanar(rec) {
  for (const c of [30, 31, 38, 39]) if (num(rec, c) !== 0) fail('NON_PLANAR', `${rec.type} 含非零 Z/标高/厚度，不能无损当作二维折痕。`);
  if (num(rec, 210) !== 0 || num(rec, 220) !== 0 || num(rec, 230, 1) !== 1)
    fail('EXTRUSION', '不支持非默认拉伸方向；请在设计工具中先转为 XY 平面。');
}
function point(rec, xCode, yCode) {
  const x = num(rec, xCode, NaN), y = num(rec, yCode, NaN);
  return [x, y];
}
/** @returns {{segments:Array, layers:Array, units:number|null, warnings:Array, version:string}} */
export function parseDxf(text, options = {}) {
  const pairs = readPairs(text), sec = sections(pairs);
  if (!sec.has('ENTITIES')) fail('NO_ENTITIES', 'DXF 没有 ENTITIES。');
  const layers = new Map();
  for (const r of records(sec.get('TABLES')?.pairs ?? [])) if (r.type === 'LAYER') {
    const name = str(r, 2), rawColor = num(r, 62, 7);
    layers.set(name, { name, color: Math.abs(rawColor), trueColor: r.pairs.some(p => p.code === 420) ? num(r, 420) : null,
      hidden: rawColor < 0 || Boolean(num(r, 70) & 1), linetype: str(r, 6, 'CONTINUOUS') });
  }
  const segments = [], warnings = [], unsupported = []; let hidden = 0, excluded = 0;
  const entities = records(sec.get('ENTITIES').pairs);
  const selected = options.includeLayers ? new Set(options.includeLayers) : null;
  const excludedLayers = new Set(options.excludeLayers ?? []);
  let entityIndex = 0;
  for (let i = 0; i < entities.length; i++) {
    const r = entities[i], sourceId = `entity_${entityIndex++}`;
    const layer = str(r, 8, '0'), layerInfo = layers.get(layer);
    if (!layers.has(layer)) layers.set(layer, { name: layer, color: 7, trueColor: null, hidden: false, linetype: 'CONTINUOUS' });
    let vertices = null;
    if (r.type === 'POLYLINE') {
      vertices = [];
      while (entities[i + 1]?.type === 'VERTEX') vertices.push(entities[++i]);
      if (entities[i + 1]?.type !== 'SEQEND') fail('POLYLINE_SEQEND', 'POLYLINE 缺少 SEQEND。');
      i++;
    }
    if (selected && !selected.has(layer) || excludedLayers.has(layer)) { excluded++; continue; }
    if (num(r, 67) !== 0 || str(r, 410, 'Model').toLowerCase() !== 'model') { excluded++; continue; }
    if (!options.includeHidden && (layerInfo?.hidden || num(r, 60) !== 0)) { hidden++; continue; }
    if (!['LINE', 'LWPOLYLINE', 'POLYLINE'].includes(r.type)) { unsupported.push({ type: r.type, layer }); continue; }
    assertPlanar(r);
    const aci = num(r, 62, 256);
    const color = aci === 256 ? (layerInfo?.color ?? 7) : aci;
    if (!Number.isInteger(color) || color < 0 || color > 256) fail('COLOR', 'DXF ACI 颜色无效。');
    const trueColor = r.pairs.some(p => p.code === 420) ? num(r, 420) : layerInfo?.trueColor ?? null;
    const rawType = str(r, 6, 'BYLAYER');
    const linetype = rawType.toUpperCase() === 'BYLAYER' ? layerInfo?.linetype ?? 'CONTINUOUS' : rawType;
    if (!['CONTINUOUS', 'BYBLOCK'].includes(linetype.toUpperCase()))
      fail('DASHED_STYLE', `图层 ${layer} 使用 ${linetype} 线型。加工版只接受实线中心线；请明确转换后再导出。`);
    const style = { layer, color, trueColor, linetype: 'CONTINUOUS' };
    const add = (a, b, j) => segments.push({ ...style, id: `${sourceId}:${j}`, sourceEntity: sourceId, a, b });
    if (r.type === 'LINE') { add(point(r, 10, 20), point(r, 11, 21), 0); continue; }
    const allowedFlags = r.type === 'LWPOLYLINE' ? 129 : 129;
    if (num(r, 70) & ~allowedFlags) fail('POLYLINE_TYPE', '不支持三维/网格/曲线拟合 POLYLINE。');
    for (const p of r.pairs) if ([40, 41, 42, 43].includes(p.code) && Number(p.value) !== 0)
      fail('CURVE_OR_WIDTH', '多段线含 bulge 圆弧或非零宽度，不能直接改为直线压痕。');
    const pts = [];
    if (r.type === 'LWPOLYLINE') {
      let v = null;
      for (const p of r.pairs) {
        if (p.code === 10) { if (v) pts.push(v); v = [Number(p.value), NaN]; }
        else if (p.code === 20 && v) v[1] = Number(p.value);
      }
      if (v) pts.push(v);
      if (num(r, 90, NaN) !== pts.length) fail('VERTEX_COUNT', 'LWPOLYLINE 顶点数与组码 90 不一致。');
    } else {
      for (const v of vertices) {
        assertPlanar(v);
        if (num(v, 70) !== 0) fail('VERTEX_TYPE', 'POLYLINE 顶点不是普通二维顶点。');
        for (const c of [40, 41, 42]) if (num(v, c) !== 0) fail('CURVE_OR_WIDTH', 'POLYLINE 含圆弧或非零宽度。');
        pts.push(point(v, 10, 20));
      }
    }
    if (pts.length < 2 || pts.some(p => !p.every(Number.isFinite))) fail('VERTICES', '多段线顶点不足或坐标无效。');
    for (let j = 1; j < pts.length; j++) add(pts[j - 1], pts[j], j - 1);
    if ((num(r, 70) & 1) && (pts[0][0] !== pts.at(-1)[0] || pts[0][1] !== pts.at(-1)[1])) add(pts.at(-1), pts[0], pts.length - 1);
  }
  if (unsupported.length) fail('UNSUPPORTED_ENTITIES', '存在不支持的图元，已停止，未静默漏掉它们。请先炸开块或明确排除非折痕图层。', { unsupported });
  if (hidden) warnings.push(`明确排除隐藏/冻结对象 ${hidden} 个。`);
  if (excluded) warnings.push(`按图层选择或模型空间范围排除对象 ${excluded} 个。`);
  const unitsRaw = headerValue(sec.get('HEADER')?.pairs ?? [], '$INSUNITS');
  const units = unitsRaw === undefined ? null : Number(unitsRaw);
  return { segments, layers: [...layers.values()], units, version: headerValue(sec.get('HEADER')?.pairs ?? [], '$ACADVER') ?? '', warnings };
}
const p = (code, value) => ({ code, value: String(value) });
function updateHeader(pairs, key, vals) {
  const sec = sections(pairs).get('HEADER');
  const i = pairs.findIndex((q, k) => k >= sec.start && k < sec.end && q.code === 9 && q.value.trim() === key);
  if (i < 0) pairs.splice(sec.end, 0, p(9, key), ...vals);
  else { let j = i + 1; while (j < sec.end && pairs[j].code !== 9) j++; pairs.splice(i + 1, j - i - 1, ...vals); }
}
function safeName(s) {
  s = String(s);
  if (!s || /[\r\n\0<>/\\":;?*|=]/.test(s) || s.length > 200) fail('LAYER_NAME', `不支持的输出图层名称：${s}`);
  return asciiValue(s);
}
/** R2000 LWPOLYLINE. Open trails remain open; never closes an arbitrary crease. */
export function writeDxf(paths, options = {}) {
  const format = options.format ?? 'LWPOLYLINE';
  if (!['LWPOLYLINE', 'LINE'].includes(format)) fail('FORMAT', '输出只支持 LWPOLYLINE 或 LINE。');
  const units = options.units ?? 0;
  if (!Number.isInteger(units) || units < 0 || units > 24) fail('UNITS', '无效的 DXF INSUNITS 单位代码。');
  let pairs = readPairs(DXF_TEMPLATE);
  let handle = 0x100;
  const next = () => (++handle).toString(16).toUpperCase();
  const layers = new Map([['0', { name: '0', color: 7 }]]);
  for (const path of paths) layers.set(path.layer, { name: path.layer, color: path.color ?? 7, trueColor: path.trueColor });
  const layerRecords = [];
  for (const [name, v] of layers) {
    layerRecords.push(p(0, 'LAYER'), p(5, next()), p(330, '1'), p(100, 'AcDbSymbolTableRecord'), p(100, 'AcDbLayerTableRecord'),
      p(2, safeName(name)), p(70, 0), p(62, v.color === 0 || v.color === 256 ? 7 : v.color), p(6, 'CONTINUOUS'));
    if (v.trueColor !== undefined && v.trueColor !== null) layerRecords.push(p(420, v.trueColor));
  }
  const tables = sections(pairs).get('TABLES');
  for (let i = tables.start; i < tables.end; i++) if (pairs[i].code === 0 && pairs[i].value.trim() === 'TABLE' && pairs[i + 1]?.value.trim() === 'LAYER') {
    let j = i + 2; while (!(pairs[j].code === 0 && pairs[j].value.trim() === 'ENDTAB')) j++;
    pairs = pairs.slice(0, i + 2).concat([p(5, '1'), p(330, '0'), p(100, 'AcDbSymbolTable'), p(70, layers.size)], layerRecords, pairs.slice(j));
    break;
  }
  const entityPairs = [], bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const path of paths) {
    if (path.points.length < 2) fail('EMPTY_PATH', '不能输出少于两个顶点的路径。');
    for (const [x, y] of path.points) { if (!Number.isFinite(x) || !Number.isFinite(y)) fail('COORDINATE', '输出坐标不是有限数。'); bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y); bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y); }
    const common = type => {
      const a = [p(0, type), p(5, next()), p(330, '17'), p(100, 'AcDbEntity'), p(8, safeName(path.layer)), p(62, path.color ?? 7)];
      if (path.trueColor != null) a.push(p(420, path.trueColor));
      return a;
    };
    if (format === 'LINE') {
      for (let k = 1; k < path.points.length; k++) {
        const a = path.points[k - 1], b = path.points[k];
        entityPairs.push(...common('LINE'), p(100, 'AcDbLine'), p(10, a[0]), p(20, a[1]), p(30, 0), p(11, b[0]), p(21, b[1]), p(31, 0));
      }
    } else {
      const pts = path.closed ? path.points.slice(0, -1) : path.points;
      entityPairs.push(...common('LWPOLYLINE'), p(100, 'AcDbPolyline'), p(90, pts.length), p(70, path.closed ? 1 : 0));
      for (const a of pts) entityPairs.push(p(10, a[0]), p(20, a[1]));
    }
  }
  const ent = sections(pairs).get('ENTITIES'); pairs = pairs.slice(0, ent.start).concat(entityPairs, pairs.slice(ent.end));
  updateHeader(pairs, '$ACADVER', [p(1, 'AC1015')]);
  updateHeader(pairs, '$INSUNITS', [p(70, units)]);
  updateHeader(pairs, '$HANDSEED', [p(5, (handle + 1).toString(16).toUpperCase())]);
  if (paths.length) {
    updateHeader(pairs, '$EXTMIN', [p(10, bounds[0]), p(20, bounds[1]), p(30, 0)]);
    updateHeader(pairs, '$EXTMAX', [p(10, bounds[2]), p(20, bounds[3]), p(30, 0)]);
  }
  return pairs.map(q => `${String(q.code).padStart(3, ' ')}\r\n${q.value}\r\n`).join('');
}
