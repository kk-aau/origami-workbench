import {type EquilateralEllipseSource} from '../app/equilateralEllipse';
import './TubeEllipseSourceEditor.css';

export default function TubeEllipseSourceEditor({source,onChange}:{source:EquilateralEllipseSource;onChange:(source:EquilateralEllipseSource)=>void}){
  const field=(label:string,value:number,min:number,max:number,step:number,change:(n:number)=>void)=><label>
    <span>{label}</span><input aria-label={label} type="number" value={value} min={min} max={max} step={step}
      onChange={e=>{const n=Number(e.target.value);if(e.target.value.trim()&&Number.isFinite(n))change(n);}}/>
  </label>;
  return <section className="tube-ellipse-editor" aria-label="等弦椭圆来源">
    <div className="tube-ellipse-fields">
      {field('椭圆点数',source.count,3,48,1,count=>onChange({...source,count}))}
      {field('半轴 a',source.semiAxes[0],.001,1000,.01,a=>onChange({...source,semiAxes:[a,source.semiAxes[1]]}))}
      {field('半轴 b',source.semiAxes[1],.001,1000,.01,b=>onChange({...source,semiAxes:[source.semiAxes[0],b]}))}
      {field('起相位 φ',source.phaseDeg,-360,360,1,phaseDeg=>onChange({...source,phaseDeg}))}
      {field('椭圆旋转 θ',source.rotationDeg,-360,360,1,rotationDeg=>onChange({...source,rotationDeg}))}
    </div>
    <p className="note">起相位决定椭圆上的首点，旋转角转动整圈。3–48 点，两轴比 ≤4；未闭合的参数不能采用。</p>
  </section>;
}
