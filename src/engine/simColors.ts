import type {RenderSettings} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';

type PaperColorSettings=Pick<RenderSettings,'frontColor'|'backColor'>&Partial<Pick<RenderSettings,'borderColor'|'mountainColor'|'valleyColor'>>;
function rgb(value:unknown):[number,number,number]|null {
  return typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)
    ?[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)/255) as [number,number,number]
    :null;
}

/** The orbit camera reflects winding: visible paper front uses renderer backColor.
 * The optional drawing ink leaves ordinary 3D assignment colours untouched when omitted. */
export function simulationPaperColorSettings(front:unknown,back:unknown,line?:unknown):PaperColorSettings|null {
  const frontRGB=rgb(front),backRGB=rgb(back),lineRGB=line===undefined?undefined:rgb(line);
  if(!frontRGB||!backRGB||lineRGB===null)return null;
  return {backColor:frontRGB,frontColor:backRGB,...(lineRGB?{
    borderColor:[...lineRGB] as [number,number,number],
    mountainColor:[...lineRGB] as [number,number,number],
    valleyColor:[...lineRGB] as [number,number,number],
  }:{})};
}
