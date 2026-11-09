import {TESS_NAMES,type TessFamily} from '../app/tessellation';

type SpaceFamily = 'radial-pot'|'gore-paper'|'rectangular-pot'|'twisted-pot'|'flasher'|'paraboloidal-flasher'|'curved-circle-polyhedral'|'linked-first-band-polyhedral'|'discrete-curve-cp';
export type SpaceConstructionDialog = 'strain-tq-design-cp'|'rotational-pleats-cp'|'basic-paper-models-cp'|'saved-developable-paper-cp'|'fluted-multislice-cone-cp'|'generic-space-paper-cp'|'bistable-twist-tube-cp'|'flat-troublewit-strip-cp'|'linear-space-polyhedral-cp'|'general-spacer-miura-cp'|'semigeneral-miura-cp'|'conic-circle-cp'|'conic-noncircle-cp'|'planar-ruled-cp-4040'|'cone-four-plane-cp-4039'|'nonuniform-spiral-cp-3968'|'uniform-helix-cp-3951'|'spiral-refold-cp-3980'|'uniform-helix-general-cp-3951'|'nonuniform-helix-general-cp-3966'|'curved-linear-across'|'curved-nonuniform-helix-native'|'discrete-curve-source'|'huffman-circle-cp'|'huffman-parabola-cp'|'alt-mosely-cp-3556'|'ellipse-optical-cp-4034'|'across-descending-cp-3988';
type Entry = {value:string;label:string} & ({family:SpaceFamily;dialog?:never}|{dialog:SpaceConstructionDialog;family?:never});
const family = (value:SpaceFamily):Entry => ({value,label:TESS_NAMES[value],family:value});
const dialog = (value:SpaceConstructionDialog,label:string):Entry => ({value,label,dialog:value});

// Both the parameter view and the adopted surface view use these same options
// and routes. Dialog IDs never fall through to tessPreset's default family.
export const SPACE_CONSTRUCTION_GROUPS:readonly {label:string;entries:readonly Entry[]}[] = [
  {label:'壶体与旋转阵列',entries:['radial-pot','gore-paper','rectangular-pot','twisted-pot','flasher','paraboloidal-flasher'].map(value=>family(value as SpaceFamily)).concat(dialog('alt-mosely-cp-3556','交替 Mosely 壶体 CP'))},
  {label:'多面体与折线纸带',entries:[family('curved-circle-polyhedral'),family('linked-first-band-polyhedral'),family('discrete-curve-cp'),dialog('general-spacer-miura-cp','一般／嫁接 Miura CP'),dialog('linear-space-polyhedral-cp','折链／空间折线纸带 CP'),dialog('semigeneral-miura-cp','路径波纹／Tachi CP'),dialog('fluted-multislice-cone-cp','褶锥／多次切片 CP'),dialog('strain-tq-design-cp','原 TQ 约束变形 CP'),dialog('rotational-pleats-cp','原旋转褶纸带 CP'),dialog('basic-paper-models-cp','五种原单纸基础模型 CP'),dialog('bistable-twist-tube-cp','双稳态三角折管 CP'),dialog('flat-troublewit-strip-cp','平折路径纸带／Troublewit CP'),dialog('discrete-curve-source','折线纸带源参数')]},
  {label:'曲折纸域 CP',entries:[dialog('saved-developable-paper-cp','原圆锥／柱面 · 展开纸形'),dialog('generic-space-paper-cp','空间曲折 · 有限弦纸张 CP'),dialog('huffman-circle-cp','Huffman 圆曲折 CP'),dialog('huffman-parabola-cp','Huffman 共焦抛物线 CP'),dialog('ellipse-optical-cp-4034','原光学椭圆 CP · In[4034]'),dialog('across-descending-cp-3988','原下降折角反折 CP · In[3988]'),dialog('conic-circle-cp','原圆例二维纸域 · 仅 CP'),dialog('conic-noncircle-cp','原非圆截线 · 有限二维 CP'),dialog('planar-ruled-cp-4040','原直纹三面 CP · In[4040]'),dialog('cone-four-plane-cp-4039','原圆锥四带 CP · In[4039]'),dialog('curved-linear-across','跨右侧圆弧 · 二维 CP')]},
  {label:'螺旋纸域 CP',entries:[dialog('nonuniform-spiral-cp-3968','原非均匀螺旋内切 CP · In[3968]'),dialog('uniform-helix-cp-3951','原均匀螺旋 CP · In[3951]'),dialog('spiral-refold-cp-3980','原展开再折回 CP · In[3980]'),dialog('uniform-helix-general-cp-3951','原通用均匀螺旋 CP · In[3951]'),dialog('nonuniform-helix-general-cp-3966','原任意折角螺旋 CP · In[3966]')]},
  {label:'可调曲面',entries:[{value:'curve-design',label:'可调曲面 · 非均匀螺旋',dialog:'curved-nonuniform-helix-native'}]},
];

export default function SpaceConstructionMenu({value,onFamily,onDialog}:{value:string;onFamily:(family:TessFamily)=>void;onDialog:(dialog:SpaceConstructionDialog)=>void}){
  return <select aria-label="空间构造类型" value={value} onChange={event=>{
    const entry=SPACE_CONSTRUCTION_GROUPS.flatMap(group=>group.entries).find(item=>item.value===event.target.value);
    if(entry?.dialog)onDialog(entry.dialog);
    else if(entry?.family)onFamily(entry.family);
  }}>{SPACE_CONSTRUCTION_GROUPS.map(group=><optgroup key={group.label} label={group.label}>{group.entries.map(entry=><option key={entry.value} value={entry.value}>{entry.label}</option>)}</optgroup>)}</select>;
}
