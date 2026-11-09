import type {Theme} from '../app/theme';

export default function ThemeSettings({value,onChange}:{value:Theme;onChange:(value:Theme)=>void}){
  return <section aria-label="主题设置"><h3>界面主题</h3><label className="checkbox"><input type="checkbox" checked={value==='dark'} onChange={e=>onChange(e.target.checked?'dark':'light')}/>深色主题</label><p className="note">只改变工作台界面颜色，不改变纸张、折痕类型、网格或导出文件。设置保存在本机，重启后恢复。</p></section>;
}
