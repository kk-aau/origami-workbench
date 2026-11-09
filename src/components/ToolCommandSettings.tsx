import {useMemo,useRef,useState} from 'react';
import {DIAGRAM_COMMANDS} from '../app/diagramCommands';
import {TOOL_COMMANDS,normalizeToolCommand,type ToolCommand} from '../app/toolCommands';
import {applyToolCommandAliases,findToolCommandAliasConflicts,parseToolCommandAliases,readToolCommandPreferences,saveToolCommandPreferences,type ToolCommandPreferences,type ToolCommandScope} from '../app/toolCommandPreferences';
import {readToolCommandInput,saveToolCommandInput} from '../app/toolCommandInput';
import './ToolCommandSettings.css';

export interface ToolCommandSettingsProps {initialScope?:ToolCommandScope;onClose:()=>void}
const CATALOGS:Record<ToolCommandScope,readonly ToolCommand<string>[]>={crease:TOOL_COMMANDS,diagram:DIAGRAM_COMMANDS};
const SCOPE_NAMES:Record<ToolCommandScope,string>={crease:'折痕编辑',diagram:'折序绘图'};
interface CommandDraft {primary:string;aliases:string[];pending:string;adding:boolean}
type Drafts=Record<ToolCommandScope,Record<string,CommandDraft>>;
function mapScopes<T>(value:(scope:ToolCommandScope)=>T):Record<ToolCommandScope,T> {return {crease:value('crease'),diagram:value('diagram')};}
const sameAliases=(first:readonly string[],second:readonly string[])=>first.length===second.length&&first.every((alias,index)=>normalizeToolCommand(alias)===normalizeToolCommand(second[index]));
function commandDraft(command:ToolCommand<string>):CommandDraft {
  const primary=command.primary===null?'':command.primary??command.aliases[0]??'';
  return {primary,aliases:command.aliases.filter(alias=>normalizeToolCommand(alias)!==normalizeToolCommand(primary)),pending:'',adding:false};
}
function draftAliases(draft:CommandDraft):string[] {
  return [...new Set([normalizeToolCommand(draft.primary),...draft.aliases,...parseToolCommandAliases(draft.pending)].filter(Boolean))];
}
function initialDrafts():Drafts {
  const preferences=readToolCommandPreferences();
  return mapScopes(scope=>Object.fromEntries(applyToolCommandAliases(CATALOGS[scope],scope,preferences).map(command=>[command.tool,commandDraft(command)])));
}

/** The parent settings dialog owns its modal, dismissal and keyboard focus. */
export default function ToolCommandSettings({initialScope='crease',onClose}:ToolCommandSettingsProps) {
  const composing=useRef(false);
  const aliasAddButtons=useRef(new Map<string,HTMLButtonElement>());
  const [scope,setScope]=useState<ToolCommandScope>(initialScope),[query,setQuery]=useState(''),[drafts,setDrafts]=useState<Drafts>(initialDrafts),[error,setError]=useState('');
  const [directInput,setDirectInput]=useState(readToolCommandInput);
  const catalogs=useMemo(()=>mapScopes(key=>CATALOGS[key].map(command=>({...command,aliases:draftAliases(drafts[key][command.tool])}))),[drafts]);
  const conflicts=useMemo(()=>(['crease','diagram'] as const).flatMap(key=>findToolCommandAliasConflicts(catalogs[key]).map(conflict=>({...conflict,scope:key}))),[catalogs]);
  const invalidPrimaries=(['crease','diagram'] as const).flatMap(key=>CATALOGS[key].filter(command=>/[\s,、;]/u.test(normalizeToolCommand(drafts[key][command.tool].primary))).map(command=>({scope:key,command})));
  const currentConflicts=new Set([...conflicts.filter(conflict=>conflict.scope===scope).flatMap(conflict=>[conflict.first.tool,conflict.second.tool]),...invalidPrimaries.filter(item=>item.scope===scope).map(item=>item.command.tool)]);
  const search=normalizeToolCommand(query),commands=CATALOGS[scope].filter(command=>!search||[command.name,command.tool,...command.aliases,...draftAliases(drafts[scope][command.tool])].some(token=>normalizeToolCommand(token).includes(search)));
  const changed=(['crease','diagram'] as const).reduce((count,key)=>count+CATALOGS[key].filter((command,index)=>!sameAliases(catalogs[key][index].aliases,command.aliases)||normalizeToolCommand(drafts[key][command.tool].primary)!==normalizeToolCommand(command.aliases[0]??'')).length,0);
  function edit(tool:string,patch:Partial<CommandDraft>) {setDrafts(previous=>({...previous,[scope]:{...previous[scope],[tool]:{...previous[scope][tool],...patch}}}));setError('');}
  function focusAliasAction(tool:string) {requestAnimationFrame(()=>{const target=aliasAddButtons.current.get(scope+':'+tool)??document.getElementById('command-primary-'+scope+'-'+tool);target?.focus({preventScroll:true});});}
  function addAliases(tool:string) {
    const draft=drafts[scope][tool],primary=normalizeToolCommand(draft.primary);
    edit(tool,{aliases:[...new Set([...draft.aliases,...parseToolCommandAliases(draft.pending)])].filter(alias=>alias!==primary),pending:'',adding:false});
    focusAliasAction(tool);
  }
  function restoreScope() {setDrafts(previous=>({...previous,[scope]:Object.fromEntries(CATALOGS[scope].map(command=>[command.tool,commandDraft(command)]))}));setError('');}
  function save() {
    if(conflicts.length||invalidPrimaries.length)return;
    const preferences:ToolCommandPreferences=mapScopes(key=>Object.fromEntries(catalogs[key].filter((command,index)=>!sameAliases(command.aliases,CATALOGS[key][index].aliases)).map(command=>[command.tool,command.aliases])));
    const primary=mapScopes(key=>Object.fromEntries(CATALOGS[key].filter(command=>!normalizeToolCommand(drafts[key][command.tool].primary)).map(command=>[command.tool,null])));
    if(Object.keys(primary.crease).length||Object.keys(primary.diagram).length)preferences.primary=primary;
    try {saveToolCommandPreferences(preferences);saveToolCommandInput(directInput);onClose();}catch(failure){setError(failure instanceof Error?failure.message:'命令保存失败，请重试。');}
  }
  return <form className="tool-command-settings" onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={event=>{if(composing.current||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229){if(event.key==='Enter')event.preventDefault();if(event.key==='Escape')event.stopPropagation();}}} onSubmit={event=>{event.preventDefault();if(!composing.current)save();}}>
    <label className="tool-command-input-mode"><input type="checkbox" checked={directInput} onChange={event=>setDirectInput(event.currentTarget.checked)} aria-label="画布直接键入命令" aria-describedby="tool-command-input-mode-description"/><span><strong>画布直接键入命令</strong><small id="tool-command-input-mode-description">两个工作区共用。关闭后恢复单字母工具快捷键，底部命令框仍可手动输入。</small></span></label>
    <p id="tool-command-settings-introduction" className="tool-command-settings-introduction">简称单独修改，全称和其他命令以标签管理。输入新命令后按 Enter 添加；功能名称始终可用。</p>
    <div className="tool-command-settings-toolbar"><div className="tool-command-settings-scopes" role="tablist" aria-label="命令所属工作区">{(['crease','diagram'] as const).map(key=><button key={key} type="button" role="tab" aria-selected={key===scope} aria-controls="tool-command-settings-list" className={key===scope?'is-active':''} onClick={()=>{setScope(key);setQuery('');}}>{SCOPE_NAMES[key]}<span>{CATALOGS[key].length}</span></button>)}</div><button type="button" className="tool-command-settings-restore" onClick={restoreScope}>恢复本工作区默认</button></div>
    <label className="tool-command-settings-search"><span>查找功能</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')event.preventDefault();}} placeholder="搜索功能名或命令…" aria-label="搜索功能名或命令"/></label>
    <div className="tool-command-settings-list" id="tool-command-settings-list" role="tabpanel" aria-label={SCOPE_NAMES[scope]+'命令编辑'}>
      <table><colgroup><col className="tool-command-settings-function-column"/><col className="tool-command-settings-primary-column"/><col className="tool-command-settings-alias-column"/><col className="tool-command-settings-action-column"/></colgroup><thead><tr><th scope="col">功能</th><th scope="col">简称</th><th scope="col">全称及其他命令</th><th scope="col"><span className="tool-command-settings-sr-only">操作</span></th></tr></thead><tbody>{commands.map(command=>{
        const draft=drafts[scope][command.tool],label=SCOPE_NAMES[scope]+'·'+command.name,fieldId='command-primary-'+scope+'-'+command.tool;
        return <tr key={command.tool} data-command-tool={command.tool} className={currentConflicts.has(command.tool)?'has-conflict':''}>
          <th scope="row"><label htmlFor={fieldId}><strong>{command.name}</strong></label></th>
          <td className="tool-command-primary-cell"><input id={fieldId} aria-label={label+'简称'} aria-invalid={currentConflicts.has(command.tool)||undefined} autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={64} value={draft.primary} onChange={event=>edit(command.tool,{primary:event.target.value})} onBlur={()=>edit(command.tool,{primary:normalizeToolCommand(draft.primary)})} placeholder="未设置"/>
            <small className="tool-command-primary-default">默认：{command.aliases[0]??'—'}</small></td>
          <td><div className="tool-command-alias-tags" role="group" aria-label={label+'全称及其他命令'}>
            {draft.aliases.map((alias,index)=><span className="tool-command-alias-tag" data-command-alias={alias} key={alias}><code title={alias}>{alias}</code><button type="button" aria-label={'删除'+label+'命令'+alias} title={'删除命令 '+alias} onClick={()=>{edit(command.tool,{aliases:draft.aliases.filter((_,i)=>i!==index)});focusAliasAction(command.tool);}}>×</button></span>)}
            {!draft.aliases.length&&!draft.adding&&<span className="tool-command-alias-empty">未设置</span>}
            {!draft.adding&&<button type="button" ref={element=>{const key=scope+':'+command.tool;if(element)aliasAddButtons.current.set(key,element);else aliasAddButtons.current.delete(key);}} className="tool-command-alias-add" aria-label={'为'+label+'添加命令'} onClick={()=>edit(command.tool,{adding:true})}>＋ 添加</button>}
          </div>{draft.adding&&<div className="tool-command-alias-entry"><input autoFocus aria-label={label+'新增命令'} autoComplete="off" spellCheck={false} value={draft.pending} onChange={event=>edit(command.tool,{pending:event.target.value})} placeholder="输入全称或其他命令" onKeyDown={event=>{
            if(composing.current||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;
            if(event.key==='Enter'){event.preventDefault();event.stopPropagation();addAliases(command.tool);}
            if(event.key==='Escape'){event.preventDefault();event.stopPropagation();edit(command.tool,{pending:'',adding:false});focusAliasAction(command.tool);}
          }}/><button type="button" className="tool-command-alias-confirm" disabled={!draft.pending.trim()} onClick={()=>addAliases(command.tool)}>添加</button><button type="button" className="tool-command-alias-cancel" aria-label={'取消为'+label+'添加命令'} onClick={()=>{edit(command.tool,{pending:'',adding:false});focusAliasAction(command.tool);}}>取消</button></div>}</td>
          <td><button type="button" aria-label={'恢复'+label+'默认命令'} title={'恢复默认：'+command.aliases.join(' / ')} onClick={()=>edit(command.tool,commandDraft(command))}>恢复</button></td>
        </tr>;
      })}</tbody></table>
      {!commands.length&&<p className="tool-command-settings-empty">没有找到匹配的功能。</p>}
    </div>
    <div className="tool-command-settings-feedback" aria-live="polite">{invalidPrimaries.length?<div role="alert" className="tool-command-settings-error">{invalidPrimaries.map(item=><p key={item.scope+item.command.tool}>{SCOPE_NAMES[item.scope]}·{item.command.name}：简称只填写一个命令，其他写法请添加为标签。</p>)}</div>:conflicts.length?<div role="alert" className="tool-command-settings-error">{conflicts.map(conflict=><p key={conflict.scope+':'+conflict.alias+':'+conflict.first.tool+':'+conflict.second.tool}>{SCOPE_NAMES[conflict.scope]}：命令“{conflict.alias}”同时用于“{conflict.first.name}”和“{conflict.second.name}”，请修改后再保存。</p>)}</div>:error?<p role="alert" className="tool-command-settings-error">{error}</p>:<p>{changed?changed+' 项功能使用自定义命令。':'所有功能均使用默认命令。'} 同一工作区的简称和其他命令不能重复。</p>}</div>
    <div className="tool-command-settings-footer"><span>同时保存输入方式与两个工作区的命令</span><button type="button" onClick={onClose}>取消</button><button type="submit" className="storage-settings-primary" disabled={conflicts.length>0||invalidPrimaries.length>0}>保存并应用</button></div>
  </form>;
}
