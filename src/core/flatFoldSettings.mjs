/** Shared validation for native projects and server recovery/save endpoints. */
export function validateFlatFoldSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !['startingFace','materialFace'].includes(key))) throw new Error('平折设置格式无效。');
  if(Object.hasOwn(value,'materialFace')&&(!Number.isInteger(value.materialFace)||value.materialFace<0||value.materialFace>=8192))throw new Error('材料起始面索引无效。');
  const face = value.startingFace;
  if (!Array.isArray(face) || face.length < 3 || face.length > 6000 ||
      !face.every(p => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && Math.abs(n) <= 1_000_000))) {
    throw new Error('起始面轮廓必须包含 3–6000 个有效二维顶点。');
  }
  if (new Set(face.map(p => JSON.stringify(p))).size !== face.length) throw new Error('起始面轮廓不能含重复顶点。');
}
