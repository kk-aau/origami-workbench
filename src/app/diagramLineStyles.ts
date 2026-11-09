import {DIAGRAM_ANNOTATION_LIMITS,DIAGRAM_LINE_APPEARANCE_FIELDS,isDiagramCPExistingLine,isDiagramLineAppearanceFields,isDiagramStrokePattern,type DiagramLineAnnotation,type DiagramLineAppearanceField,type DiagramLineStyle,type DiagramStrokePattern} from './diagramAnnotations';
import {preferenceStorage} from './preferenceStorage';

export type {DiagramStrokePattern,DiagramLineAppearanceField} from './diagramAnnotations';
export interface DiagramLineAppearance {color:string;width:number;strokePattern:DiagramStrokePattern}
export type DiagramLineDefaults=Record<DiagramLineStyle,DiagramLineAppearance&{globalFields?:DiagramLineAppearanceField[]}>;
export const DIAGRAM_LINE_DEFAULTS_KEY='zhezhi.diagram-line-defaults.v1';
export const DIAGRAM_LINE_STYLES:readonly DiagramLineStyle[]=['valley','mountain','crease','auxiliary','boundary'];
export const DIAGRAM_STROKE_PATTERN_LABELS:Record<DiagramStrokePattern,string>={solid:'实线',dashed:'虚线','dash-dot':'点划线',dotted:'点线'};

export function defaultDiagramStrokePattern(style:DiagramLineStyle):DiagramStrokePattern {
  switch(style){case 'valley':return 'dashed';case 'mountain':return 'dash-dot';case 'auxiliary':return 'dotted';case 'crease':case 'boundary':return 'solid';default:throw new Error('未知的折图线型。');}
}
/** Every call returns independent entries so editing one category cannot change another. */
export function defaultDiagramLineDefaults():DiagramLineDefaults {
  return Object.fromEntries(DIAGRAM_LINE_STYLES.map(style=>[style,{color:'#293d35',width:style==='crease'?.35:.7,strokePattern:defaultDiagramStrokePattern(style)}])) as DiagramLineDefaults;
}
export function diagramLineAppearance(line:Pick<DiagramLineAnnotation,'style'|'color'|'width'|'strokePattern'>):DiagramLineAppearance {
  return {color:line.color,width:line.width,strokePattern:line.strokePattern??defaultDiagramStrokePattern(line.style)};
}
type AppearanceLine=Pick<DiagramLineAnnotation,'style'|'color'|'width'|'strokePattern'|'appearanceOverrides'>;
function appearancePatchFields(patch:Partial<DiagramLineAppearance>):DiagramLineAppearanceField[] {
  if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(field=>!DIAGRAM_LINE_APPEARANCE_FIELDS.includes(field as DiagramLineAppearanceField)))throw new Error('绘图线外观修改字段无效。');
  if(Object.hasOwn(patch,'color')&&(typeof patch.color!=='string'||!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(patch.color))||
     Object.hasOwn(patch,'width')&&(typeof patch.width!=='number'||!Number.isFinite(patch.width)||patch.width<DIAGRAM_ANNOTATION_LIMITS.minimumWidth||patch.width>DIAGRAM_ANNOTATION_LIMITS.width)||
     Object.hasOwn(patch,'strokePattern')&&!isDiagramStrokePattern(patch.strokePattern))throw new Error('绘图线颜色、粗细或线型无效。');
  return DIAGRAM_LINE_APPEARANCE_FIELDS.filter(field=>Object.hasOwn(patch,field));
}
/** Category controls affect presentation globally without rewriting a project
 * or its physical CP. Only explicitly edited fields become authoritative. */
export function changeGlobalDiagramLineStyle(defaults:DiagramLineDefaults,style:DiagramLineStyle,patch:Partial<DiagramLineAppearance>):DiagramLineDefaults {
  if(!DIAGRAM_LINE_STYLES.includes(style))throw new Error('未知的折图线条类别。');
  const fields=appearancePatchFields(patch);if(!fields.length)return defaults;
  const active=new Set([...(defaults[style].globalFields??[]),...fields]);
  return {...defaults,[style]:{...defaults[style],...patch,globalFields:DIAGRAM_LINE_APPEARANCE_FIELDS.filter(field=>active.has(field))}};
}
/** Preserve the original object and legacy omitted patterns when no active
 * category field changes its paint. Explicit per-line fields take priority. */
export function applyDiagramLineAppearance<T extends AppearanceLine>(line:T,palette:DiagramLineDefaults):T {
  const appearance=palette[line.style];let result=line;
  for(const field of appearance.globalFields??[]){
    if(line.appearanceOverrides?.includes(field)||line[field]===appearance[field])continue;
    if(result===line)result={...line};
    Object.assign(result,{[field]:appearance[field]});
  }
  return result;
}
export function resolveDiagramLineAppearance(line:AppearanceLine,palette:DiagramLineDefaults):DiagramLineAppearance {
  return diagramLineAppearance(applyDiagramLineAppearance(line,palette));
}
export function overrideDiagramLineAppearance<T extends AppearanceLine>(line:T,patch:Partial<DiagramLineAppearance>):T {
  const fields=appearancePatchFields(patch);if(!fields.length)return line;
  const active=new Set([...(line.appearanceOverrides??[]),...fields]);
  return {...line,...patch,appearanceOverrides:DIAGRAM_LINE_APPEARANCE_FIELDS.filter(field=>active.has(field))};
}
export function resetDiagramLineAppearance<T extends AppearanceLine>(line:T,palette:DiagramLineDefaults):T {
  const {appearanceOverrides:_overrides,...saved}=line,appearance=palette[line.style];
  return {...saved,color:appearance.color,width:appearance.width,strokePattern:appearance.strokePattern} as T;
}
/** A category change carries defaults to the new category. Authored exceptions
 * remain attached to the line; generated old-crease paint is not an exception. */
export function changeDiagramLineCategory<T extends DiagramLineAnnotation>(line:T,style:DiagramLineStyle,palette:DiagramLineDefaults):T {
  if(line.style===style)return {...line};
  const original=defaultDiagramLineDefaults()[line.style],previous=palette[line.style],next=palette[style],result={...line,style};
  const generated=isDiagramCPExistingLine(line)&&line.style==='crease';
  for(const field of ['color','width'] as const){
    if(line.appearanceOverrides?.includes(field))continue;
    const value=line[field],equal=(other:string|number)=>typeof value==='string'&&typeof other==='string'?value.toLowerCase()===other.toLowerCase():value===other;
    if(equal(original[field])||equal(previous[field])||generated&&equal(field==='color'?'#8d9b92':.45))Object.assign(result,{[field]:next[field]});
  }
  if(!line.appearanceOverrides?.includes('strokePattern')&&(line.strokePattern===undefined||line.strokePattern===original.strokePattern||line.strokePattern===previous.strokePattern))result.strokePattern=next.strokePattern;
  return result;
}
export function validateDiagramLineDefaults(value:unknown):DiagramLineDefaults {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('绘图线默认样式格式无效。');
  const settings=value as Record<string,unknown>,result=defaultDiagramLineDefaults();
  if(Object.keys(settings).some(key=>!DIAGRAM_LINE_STYLES.includes(key as DiagramLineStyle)))throw new Error('绘图线默认样式包含未知线条类别。');
  for(const style of DIAGRAM_LINE_STYLES){
    const entry=settings[style];
    if(!entry||typeof entry!=='object'||Array.isArray(entry))throw new Error('绘图线默认样式缺少线条类别。');
    const v=entry as Record<string,unknown>;
    if(!['color','width','strokePattern'].every(field=>Object.hasOwn(v,field))||Object.keys(v).some(field=>!['color','width','strokePattern','globalFields'].includes(field))||
       Object.hasOwn(v,'globalFields')&&!isDiagramLineAppearanceFields(v.globalFields))throw new Error('绘图线全局样式字段无效。');
    if(typeof v.color!=='string'||!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.color)||
       typeof v.width!=='number'||!Number.isFinite(v.width)||v.width<DIAGRAM_ANNOTATION_LIMITS.minimumWidth||v.width>DIAGRAM_ANNOTATION_LIMITS.width||!isDiagramStrokePattern(v.strokePattern))throw new Error('绘图线默认颜色、粗细或线型无效。');
    const fields=v.globalFields as DiagramLineAppearanceField[]|undefined;
    result[style]={color:v.color,width:v.width,strokePattern:v.strokePattern,...(fields?.length?{globalFields:[...fields]}:{})};
  }
  return result;
}
export function readDiagramLineDefaults(storage:Pick<Storage,'getItem'>=preferenceStorage):DiagramLineDefaults {
  try{
    const raw=storage.getItem(DIAGRAM_LINE_DEFAULTS_KEY);if(!raw)return defaultDiagramLineDefaults();
    const saved=JSON.parse(raw);if(saved?.version!==1)return defaultDiagramLineDefaults();
    const result=validateDiagramLineDefaults(saved.settings),original=defaultDiagramLineDefaults();
    for(const style of DIAGRAM_LINE_STYLES)if(!Object.hasOwn(saved.settings[style],'globalFields')){
      const fields=DIAGRAM_LINE_APPEARANCE_FIELDS.filter(field=>result[style][field]!==original[style][field]);
      if(fields.length)result[style].globalFields=fields;
    }
    return result;
  }catch{return defaultDiagramLineDefaults();}
}
export function saveDiagramLineDefaults(value:DiagramLineDefaults,storage:Pick<Storage,'setItem'>=preferenceStorage):void {
  const valid=validateDiagramLineDefaults(value),settings=Object.fromEntries(DIAGRAM_LINE_STYLES.map(style=>[style,{...valid[style],globalFields:[...(valid[style].globalFields??[])]}]));
  storage.setItem(DIAGRAM_LINE_DEFAULTS_KEY,JSON.stringify({version:1,settings}));
}
/** SVG world units match the pen width; legacy drawings retain their original dash spacing. */
export function diagramLineDasharray(style:DiagramLineStyle,width:number,strokePattern?:DiagramStrokePattern):string|undefined {
  const pattern=strokePattern??defaultDiagramStrokePattern(style),n=(value:number)=>String(value);
  const dash=pattern==='dashed'?[7,4]:pattern==='dash-dot'?[9,3,1,3]:pattern==='dotted'?[1,4]:null;
  return dash?.map(value=>n(value*width)).join(' ');
}
