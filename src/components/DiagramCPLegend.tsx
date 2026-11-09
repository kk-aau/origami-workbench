import './DiagramCPLegend.css';
const help='悬停或选择折痕查看角度与来源；目标角不代表当前已完成。';
export default function DiagramCPLegend({detail,compact=false}:{detail?:string;compact?:boolean}){
  return <div className={'diagram-cp-legend'+(compact?' is-compact':'')} title={compact?help:undefined}>
    <div aria-label="CP 实线图例"><span><i style={{color:'#b23d42'}}/>峰折</span><span><i style={{color:'#315ebe'}}/>谷折</span><span><i style={{color:'#2a3c34'}}/>边界</span><span><i style={{color:'#869085'}}/>已有折痕</span><span><i style={{color:'#60938d'}}/>辅助</span><span><i style={{color:'#997327'}}/>未定</span><span><i className="is-new"/>本步新增／修改</span></div>
    <p role="status" title={detail||help}>{detail||help}</p>
  </div>;
}
