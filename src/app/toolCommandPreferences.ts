import {useEffect,useMemo,useState} from 'react';
import {preferenceStorage} from './preferenceStorage';
import {normalizeToolCommand,type ToolCommand} from './toolCommands';

export type ToolCommandScope='crease'|'diagram';
export type ToolCommandAliases=Readonly<Record<string,readonly string[]>>;
export type ToolCommandPrimaryOverrides=Partial<Record<ToolCommandScope,Readonly<Record<string,string|null>>>>;
export interface ToolCommandPreferences {crease:ToolCommandAliases;diagram:ToolCommandAliases;primary?:ToolCommandPrimaryOverrides}
export interface ToolCommandAliasConflict<T extends string=string> {alias:string;first:ToolCommand<T>;second:ToolCommand<T>}
export const TOOL_COMMAND_PREFERENCES_KEY='zhezhi.tool-command-aliases.v1';
export const TOOL_COMMAND_PREFERENCES_EVENT='zhezhi-tool-command-aliases-changed';

export function defaultToolCommandPreferences():ToolCommandPreferences {return {crease:{},diagram:{}};}

/** Command aliases are individual tokens; spaces and commas separate alternatives. */
export function parseToolCommandAliases(input:string):string[] {
  return [...new Set(input.normalize('NFKC').split(/[\s,、;]+/u).map(normalizeToolCommand).filter(Boolean))];
}

function normalizeAliases(value:unknown):string[] {
  if(!Array.isArray(value)||!value.every(alias=>typeof alias==='string'&&normalizeToolCommand(alias)&&!/[\s,、;]/u.test(alias.normalize('NFKC').trim())))throw new Error('命令设置格式无效。');
  return [...new Set(value.map(alias=>normalizeToolCommand(alias as string)))];
}
function normalizeScope(value:unknown):ToolCommandAliases {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('命令设置格式无效。');
  return Object.fromEntries(Object.entries(value).map(([tool,aliases])=>{
    if(!tool.trim())throw new Error('功能标识无效。');
    return [tool,normalizeAliases(aliases)];
  }));
}
function normalizePrimary(value:unknown,scopes:ToolCommandPreferences,strict:boolean):ToolCommandPrimaryOverrides|undefined {
  if(value===undefined)return;
  const invalid=()=>{if(strict)throw new Error('简称设置无效；简称须为该功能已有的单个命令。');};
  if(!value||typeof value!=='object'||Array.isArray(value)){invalid();return;}
  const primary=value as Record<string,unknown>,groups:Array<[ToolCommandScope,Record<string,string|null>]> = [];
  for(const scope of ['crease','diagram'] as const){
    const group=primary[scope];if(group===undefined)continue;
    if(!group||typeof group!=='object'||Array.isArray(group)){invalid();continue;}
    const entries:Array<[string,string|null]>=[];
    for(const [tool,raw] of Object.entries(group)){
      try {
        if(!tool.trim())throw new Error('功能标识无效。');
        const shortcut=raw===null?null:normalizeAliases([raw])[0];
        if(shortcut!==null&&Object.hasOwn(scopes[scope],tool)&&!scopes[scope][tool].includes(shortcut))throw new Error('简称不在该功能命令中。');
        entries.push([tool,shortcut]);
      }catch{invalid();}
    }
    if(entries.length)groups.push([scope,Object.fromEntries(entries)]);
  }
  return groups.length?Object.fromEntries(groups):undefined;
}
function validatePreferences(value:unknown,primaryValue?:unknown,strictPrimary=true):ToolCommandPreferences {
  if(!value||typeof value!=='object')throw new Error('命令设置格式无效。');
  const settings=value as Record<string,unknown>;
  const scopes={crease:normalizeScope(settings.crease),diagram:normalizeScope(settings.diagram)},primary=normalizePrimary(primaryValue,scopes,strictPrimary);
  return primary?{...scopes,primary}:scopes;
}

export function readToolCommandPreferences(storage:Pick<Storage,'getItem'>=preferenceStorage):ToolCommandPreferences {
  try {
    const raw=storage.getItem(TOOL_COMMAND_PREFERENCES_KEY);
    if(!raw)return defaultToolCommandPreferences();
    const value=JSON.parse(raw);
    if(value?.version!==1)return defaultToolCommandPreferences();
    return validatePreferences(value.scopes,value.primary,false);
  }catch{return defaultToolCommandPreferences();}
}

/** Persist first: failed writes must neither publish settings nor close the editor. */
export function saveToolCommandPreferences(preferences:ToolCommandPreferences,storage:Pick<Storage,'setItem'>=preferenceStorage):void {
  const {primary,...scopes}=validatePreferences(preferences,preferences.primary);
  storage.setItem(TOOL_COMMAND_PREFERENCES_KEY,JSON.stringify({version:1,scopes,primary}));
  if(typeof window!=='undefined'&&typeof window.dispatchEvent==='function')window.dispatchEvent(new Event(TOOL_COMMAND_PREFERENCES_EVENT));
}

/** Stable Chinese names and internal IDs always reserve their input tokens. */
export function findToolCommandAliasConflicts<T extends string>(commands:readonly ToolCommand<T>[]):ToolCommandAliasConflict<T>[] {
  const owners=new Map<string,ToolCommand<T>>(),conflicts:ToolCommandAliasConflict<T>[]=[],seen=new Set<string>();
  function add(input:string,command:ToolCommand<T>) {
    const alias=normalizeToolCommand(input),first=owners.get(alias);
    if(first&&first.tool!==command.tool){
      const key=JSON.stringify([alias,...[first.tool,command.tool].sort()]);
      if(!seen.has(key)){conflicts.push({alias,first,second:command});seen.add(key);}
    }else owners.set(alias,command);
  }
  for(const command of commands)for(const token of [command.tool,command.name])add(token,command);
  for(const command of commands)for(const alias of command.aliases)add(alias,command);
  return conflicts;
}

export function applyToolCommandAliases<T extends string>(catalog:readonly ToolCommand<T>[],scope:ToolCommandScope,preferences:ToolCommandPreferences):readonly ToolCommand<T>[] {
  try {
    const overrides=preferences[scope];
    const commands=catalog.map(command=>{
      const effective=Object.hasOwn(overrides,command.tool)?{...command,aliases:normalizeAliases(overrides[command.tool])}:command;
      const group=preferences.primary?.[scope];
      if(!group||!Object.hasOwn(group,command.tool))return effective;
      const value=group[command.tool];
      if(value===null)return {...effective,primary:null};
      try {
        const primary=normalizeAliases([value])[0];
        if(effective.aliases.some(alias=>normalizeToolCommand(alias)===primary))return {...effective,primary};
      }catch{/* Invalid shortcut metadata does not discard otherwise valid aliases. */}
      return effective;
    });
    // Old or externally edited preferences must never make the command bar unusable.
    return findToolCommandAliasConflicts(commands).length?catalog:commands;
  }catch{return catalog;}
}

/** Both workspaces update immediately after a successful save, including other tabs. */
export function useToolCommands<T extends string>(scope:ToolCommandScope,catalog:readonly ToolCommand<T>[]):readonly ToolCommand<T>[] {
  const [preferences,setPreferences]=useState(readToolCommandPreferences);
  useEffect(()=>{
    const refresh=()=>setPreferences(readToolCommandPreferences());
    const storageChanged=(event:StorageEvent)=>{if(event.key===null||event.key===TOOL_COMMAND_PREFERENCES_KEY)refresh();};
    window.addEventListener(TOOL_COMMAND_PREFERENCES_EVENT,refresh);
    window.addEventListener('storage',storageChanged);
    return()=>{window.removeEventListener(TOOL_COMMAND_PREFERENCES_EVENT,refresh);window.removeEventListener('storage',storageChanged);};
  },[]);
  return useMemo(()=>applyToolCommandAliases(catalog,scope,preferences),[catalog,scope,preferences]);
}
