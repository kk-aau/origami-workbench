import {TOOL_NAMES,type Tool} from './tools';

export interface ToolCommand<T extends string=Tool> {
  tool:T;
  name:string;
  aliases:readonly string[];
  /** Undefined preserves the legacy first-alias shortcut; null explicitly has none. */
  primary?:string|null;
}

/** Commands select existing tools only; keyboard bindings remain independent. */
const aliases={
  line:['L','LINE'],
  select:['V','SELECT'],
  circle:['C','CIRCLE','圆'],
  erase:['E','ERASE','橡皮擦'],
  moveselection:['M','MOVE','移动所选','移动'],
  copyselection:['CO','CP','COPY','复制所选','复制'],
  mirrorselection:['MI','MIRROR'],
  trim:['TR','TRIM','截断'],
  extend:['EX','EXTEND','延长'],
  offsetparallel:['O','OFFSET','平行偏移'],
  measure:['DI','DIST','DISTANCE'],
  parallel:['PL','PARALLEL','平行'],
  perpendicular:['PER','PERP'],
  polygon:['POL','POLYGON'],
  rabbitear:['RE','RABBITEAR','兔耳'],
  pan:['P','PAN','H'],
  bisect:['BI'],
  bisectlines:['BL'],
  midperp:['MP'],
  lengthen:['LE'],
  divide:['DIV','等分'],
  ratio:['RA'],
  drawdivide:['DD'],
  drawratio:['DR'],
  addvertex:['AV'],
  mergevertex:['MG'],
  mergecrossvertex:['MC'],
  circleradius:['CR'],
  circle3:['CT','C3'],
  circleedit:['CE'],
  circleseparate:['CS'],
  circleconcentric:['CN'],
  circleequal:['CQ'],
  circlepair:['CA'],
  tangentpoint:['TP'],
  tangentcircles:['TC'],
  circledifference:['CD'],
  circleinvert:['CI'],
  lineinvert:['LI'],
  mirrorline:['ML'],
  reflection:['RF'],
  reflectionlines:['RFL'],
  transverse:['TF'],
  continuous:['CF'],
  fishbone:['FB'],
  axiom5:['AX5','A5','AF'],
  axiom7:['AX7','A7','AS'],
  localflat:['LF'],
  foldableinput:['FI'],
  foldabledraw:['FD'],
  angledrag:['AD'],
  angledirection:['AG'],
  angleconverge:['ANC'],
  angleproject:['AP'],
  alternatecollinear:['AC'],
  alternatecross:['AX'],
  cycletype:['CY'],
  replacetype:['RT'],
  deletetype:['DT'],
  regionalswap:['RS'],
  makemountain:['MM'],
  makevalley:['MV'],
  makeedge:['MB'],
  makeaux:['MA'],
  eraseedge:['EB'],
  eraseaux:['EA'],
  eraseoverlap:['EO'],
  erasecross:['EC'],
  unselect:['U','撤选'],
  selectpolygon:['SP'],
  unselectpolygon:['UP'],
  selectlasso:['SL'],
  unselectlasso:['UL'],
  selectcross:['SX'],
  unselectcross:['UX'],
  movefour:['MF','M4'],
  copyfour:['CFO','C4'],
  rotatecopyselection:['ROTATECOPY','RCOPY','旋转复制','旋转复制选区'],
  measurel1:['DL1','L1','MLA'],
  measurel2:['DL2','L2','MLB'],
  measurea1:['DA1','A1','AA'],
  measurea2:['DA2','A2','AB'],
  measurea3:['DA3','A3','AZ'],
  mark:['MK'],
  erasemark:['EM'],
  regioncheck:['RC'],
  customcolor:['CC'],
  voronoi:['VO'],
  text:['T'],
  operationframe:['OF'],
  advancetype:['AT'],
  backgroundposition:['BP'],
  restrictedline:['RL'],
  restrictedcircle:['RCI'],
} satisfies Record<Tool,readonly string[]>;

/** NFKC also converts full-width Latin letters, digits and spaces. */
export function normalizeToolCommand(input:string):string {
  return input.normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
}

export const TOOL_COMMANDS:readonly ToolCommand[]=Object.entries(aliases).map(([tool,commandAliases])=>({
  tool:tool as Tool,name:TOOL_NAMES[tool as Tool],aliases:commandAliases,
}));

function indexToolCommands<T extends string>(commands:readonly ToolCommand<T>[]):Map<string,ToolCommand<T>> {
  const index=new Map<string,ToolCommand<T>>();
  for(const command of commands)for(const token of [command.tool,command.name,...command.aliases]){
    const key=normalizeToolCommand(token),previous=index.get(key);
    if(previous&&previous.tool!==command.tool)throw new Error(`工具命令重复：${token}`);
    index.set(key,command);
  }
  return index;
}
const commandsByInput=indexToolCommands(TOOL_COMMANDS);

/** Prefix suggestions never activate a tool until an exact command is entered. */
export function resolveToolCommand(input:string):ToolCommand|null;
export function resolveToolCommand<T extends string>(input:string,commands:readonly ToolCommand<T>[]):ToolCommand<T>|null;
export function resolveToolCommand(input:string,commands:readonly ToolCommand<string>[]=TOOL_COMMANDS):ToolCommand<string>|null {
  const index=commands===TOOL_COMMANDS?commandsByInput:indexToolCommands(commands);
  return index.get(normalizeToolCommand(input))??null;
}

export function searchToolCommands(input:string,limit?:number):ToolCommand[];
export function searchToolCommands<T extends string>(input:string,limit:number|undefined,commands:readonly ToolCommand<T>[]):ToolCommand<T>[];
export function searchToolCommands(input:string,limit=6,commands:readonly ToolCommand<string>[]=TOOL_COMMANDS):ToolCommand<string>[] {
  if(!Number.isFinite(limit)||limit<=0)return [];
  const count=Math.min(commands.length,Math.floor(limit)),query=normalizeToolCommand(input);
  if(!query)return commands.slice(0,count);
  const exact=resolveToolCommand(query,commands);
  return commands.map((command,index)=>{
    const rank=command===exact?0
      :command.aliases.some(alias=>normalizeToolCommand(alias).startsWith(query))?1
      :normalizeToolCommand(command.tool).startsWith(query)?2
      :normalizeToolCommand(command.name).includes(query)?3:-1;
    return {command,index,rank};
  }).filter(item=>item.rank>=0).sort((a,b)=>a.rank-b.rank||a.index-b.index).slice(0,count).map(item=>item.command);
}
