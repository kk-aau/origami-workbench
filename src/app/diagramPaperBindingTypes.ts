import type {Point} from '../core/types';

/** A material frame for an arrow's tail. The tip may extend outside the paper.
 * Indexed rings distinguish coincident cut banks; no hash or face count alone
 * is accepted as evidence that a newly calculated face is the original one. */
export interface DiagramPaperBinding {
  face:number;
  material:[number,number,number][][];
  root:Point;
  tip:Point;
  handedness:1|-1;
}
export function validateDiagramPaperBinding(value:unknown):asserts value is DiagramPaperBinding {
  const v=value as DiagramPaperBinding;
  const point=(p:unknown):p is Point=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1_000_000);
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==5||!['face','material','root','tip','handedness'].every(key=>Object.hasOwn(v,key))||
    !Number.isSafeInteger(v.face)||v.face<0||!point(v.root)||!point(v.tip)||![-1,1].includes(v.handedness)||
    !Array.isArray(v.material)||!v.material.length||
    v.material.some(ring=>!Array.isArray(ring)||ring.length<3||ring.some(p=>!Array.isArray(p)||p.length!==3||!Number.isSafeInteger(p[0])||p[0]<0||!point(p.slice(1))))||
    Math.hypot(v.tip[0]-v.root[0],v.tip[1]-v.root[1])<1e-10)throw Error('箭头纸面绑定的材料坐标或纸面身份无效。');
}
