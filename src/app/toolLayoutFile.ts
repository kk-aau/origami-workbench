import {MAX_TOOL_LAYOUT_TEMPLATES,validateToolLayoutPreferences,type ToolLayoutPreferences,type ToolLayoutTemplate} from './toolLayoutPreferences';

const FORMAT='zhezhi-tool-layout';
const MAX_NAME=60,MAX_ID=128;

/** A dedicated envelope prevents importing an unrelated project or settings file. */
export function serializeToolLayoutFile(value:ToolLayoutPreferences):string {
  const preferences=validateToolLayoutPreferences(value,false);
  return JSON.stringify({format:FORMAT,version:1,preferences},null,2)+'\n';
}

export function parseToolLayoutFile(text:string):ToolLayoutPreferences {
  let value:unknown;
  try{value=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new Error('工具排版文件不是有效的 JSON，请重新选择导出的排版文件。');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('这不是工具排版文件。');
  const file=value as Record<string,unknown>;
  if(file.format!==FORMAT)throw new Error('这不是工具排版文件，请选择应用导出的工具排版 JSON。');
  if(file.version!==1)throw new Error('暂不支持此工具排版文件版本，请使用匹配的应用版本导入。');
  const raw=file.preferences as Record<string,unknown>|undefined;
  if(raw&&raw.columnSizingVersion!==undefined&&raw.columnSizingVersion!==1)throw new Error('暂不支持此工具排版列宽版本，请使用匹配的应用版本导入。');
  // Compatibility repairs only tool IDs: retired tools disappear, newly added
  // tools go to the pool. Bad structure and missing active templates are errors.
  const preferences=validateToolLayoutPreferences(raw);
  if(!preferences.templates.some(template=>template.id===raw?.activeId))throw new Error('排版文件的当前模板不存在，请重新导出后再试。');
  return preferences;
}

function importedName(name:string,index:number):string {
  const suffix=index===1?'（导入）':`（导入${index}）`;
  return [...name].slice(0,MAX_NAME-[...suffix].length).join('')+suffix;
}
function arrangement(template:ToolLayoutTemplate):string {
  return JSON.stringify({columns:template.columns,groups:template.groups,unassigned:template.unassigned});
}

/** Merge without replacing existing templates; all validation finishes before
 * the caller writes preferences. Repeated imports reuse identical templates. */
export function mergeToolLayoutPreferences(current:ToolLayoutPreferences,imported:ToolLayoutPreferences):ToolLayoutPreferences {
  const next=validateToolLayoutPreferences(current,false),source=validateToolLayoutPreferences(imported,false);
  const names=new Set(next.templates.map(template=>template.name)),ids=new Set(next.templates.map(template=>template.id));
  let activeId=next.activeId;
  for(const template of source.templates){
    const content=arrangement(template);
    const same=next.templates.find(existing=>existing.name===template.name&&arrangement(existing)===content)
      ??next.templates.find(existing=>arrangement(existing)===content&&Array.from({length:MAX_TOOL_LAYOUT_TEMPLATES},(_,index)=>importedName(template.name,index+1)).includes(existing.name));
    if(same){if(template.id===source.activeId)activeId=same.id;continue;}
    if(next.templates.length>=MAX_TOOL_LAYOUT_TEMPLATES)throw new Error(`导入后超过 ${MAX_TOOL_LAYOUT_TEMPLATES} 个工具模板，请先删除不需要的模板再导入；原排版未更改。`);
    let id=template.id,title=template.name;
    for(let index=1;ids.has(id);index++){
      const suffix=`-import-${index}`;
      id=template.id.slice(0,MAX_ID-suffix.length)+suffix;
    }
    for(let index=1;names.has(title);index++)title=importedName(template.name,index);
    next.templates.push({...template,id,name:title});ids.add(id);names.add(title);
    if(template.id===source.activeId)activeId=id;
  }
  return {...next,activeId};
}
