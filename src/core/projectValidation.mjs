import {validateBackground} from './backgroundData.mjs';
import {validateFlatFoldSettings} from './flatFoldSettings.mjs';
import {MAX_DRAWING_OBJECTS} from './capacity.mjs';

/** Validate imported and in-memory documents at the same trust boundary. */
export function validateDoc(value) {
  const d = value;
  if (!d || typeof d !== 'object' || typeof d.name !== 'string' || !d.paper || !Array.isArray(d.segments)) throw new Error('工程格式无效：缺少名称、纸张或线段。');
  if (d.schemaVersion !== undefined && d.schemaVersion !== 1 && d.schemaVersion !== 2) throw new Error('工程版本不受支持，不能保证无损读取。');
  if (![d.paper.width, d.paper.height].every(n => Number.isFinite(n) && n > 0 && n <= 1_000_000)) throw new Error('纸张宽高必须是 0 到 1,000,000 之间的有限毫米值。');
  const ids = new Set();
  for (const s of d.segments) {
    if (!s || typeof s.id !== 'string' || !s.id || ids.has(s.id)) throw new Error('线段标识缺失或重复。');
    ids.add(s.id);
    if (s.displayColor !== undefined && (typeof s.displayColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(s.displayColor))) throw new Error(`线段 ${s.id} 的显示颜色必须为六位十六进制色值。`);
    if (![s.a, s.b].every(p => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && Math.abs(n) <= 1_000_000))) throw new Error(`线段 ${s.id} 的坐标无效或超出范围。`);
    if (!['M', 'V', 'B', 'U', 'A', 'F'].includes(s.assignment)) throw new Error(`线段 ${s.id} 的山谷类型无效。`);
    if (s.angle !== null && (!Number.isFinite(s.angle) || Math.abs(s.angle) > 180)) throw new Error(`线段 ${s.id} 的目标角度必须在 -180° 到 180° 之间。`);
    if ((s.assignment === 'M' && s.angle !== null && s.angle > 0) || (s.assignment === 'V' && s.angle !== null && s.angle < 0)) throw new Error(`线段 ${s.id} 的山谷类型与目标角度符号冲突。`);
    if (['A', 'B', 'F'].includes(s.assignment) && s.angle !== null && s.angle !== 0) throw new Error(`边界、辅助线和展开线不能设置非零折角（${s.id}）。`);
  }
  if (d.background !== undefined)validateBackground(d.background);
  if (d.flatFold !== undefined)validateFlatFoldSettings(d.flatFold);
  if (d.objects !== undefined) {
    if (!Array.isArray(d.objects) || d.objects.length > MAX_DRAWING_OBJECTS) throw new Error(`辅助对象必须是数组，且不超过 ${MAX_DRAWING_OBJECTS} 个。`);
    const point = (p) => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && Math.abs(n) <= 1_000_000);
    const positive = (n) => Number.isFinite(n) && n > 0 && n <= 1_000_000;
    for (const o of d.objects) {
      if (!o || typeof o.id !== 'string' || !o.id || ids.has(o.id)) throw new Error('对象标识缺失或与其他对象、线段重复。');
      ids.add(o.id);
      if (typeof o.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(o.color)) throw new Error(`对象 ${o.id} 颜色必须为六位十六进制色值。`);
      if (o.kind === 'circle') {
        if (!point(o.center) || !positive(o.radius)) throw new Error(`圆 ${o.id} 的圆心或半径无效。`);
      } else if (o.kind === 'text') {
        if (!point(o.position) || !positive(o.fontSize) || typeof o.text !== 'string' || o.text.length > 10000) throw new Error(`文字 ${o.id} 的位置、字号或内容无效。`);
      } else if (o.kind === 'mark') {
        if (!point(o.a) || !point(o.b)) throw new Error(`标记 ${o.id} 的坐标无效。`);
      } else throw new Error('工程包含未支持的对象类型，未丢弃或覆盖原工程。');
    }
  }
}
