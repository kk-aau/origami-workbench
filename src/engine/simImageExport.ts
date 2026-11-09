import type {RenderSettings} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/webgl/meshRenderer';

/** Preserve the viewport's apparent line weight and dash spacing at higher resolution. */
export function scaleSimulationImageSettings(settings:RenderSettings,scale:number):RenderSettings {
  if(!Number.isFinite(scale)||scale<=0||scale>8)throw new Error('图像线条缩放倍数无效。');
  const dash=(pattern:readonly number[]|null)=>pattern?.map(run=>run*scale)??null;
  return {...settings,creaseWidthPx:settings.creaseWidthPx*scale,
    ...(settings.creaseDash?{creaseDash:{border:dash(settings.creaseDash.border),mountain:dash(settings.creaseDash.mountain),valley:dash(settings.creaseDash.valley)}}:{}),
  };
}

/** Bound allocation before either backend creates a screenshot framebuffer. */
export function simulationImageDimensions(width:number,height:number,scale:number):{width:number;height:number} {
  if(![1,2,4].includes(scale))throw new Error('PNG 分辨率倍数无效，请选择 1×、2×或 4×。');
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1)throw new Error('当前模拟画布尺寸无效，无法导出 PNG。');
  width*=scale;height*=scale;
  if(width>8192||height>8192||width*height>16_000_000)throw new Error('PNG 尺寸过大，请降低分辨率倍数或缩小窗口后重试。');
  return {width,height};
}

/** Recover coverage without colour-keying: a white sheet may match the background. */
export function simulationImageFromBackgrounds(black:Uint8Array|Uint8ClampedArray,white:Uint8Array|Uint8ClampedArray,background?:readonly [number,number,number]):Uint8ClampedArray {
  if(!black.length||black.length%4!==0||black.length!==white.length)throw new Error('当前模拟图像像素无效，请重试。');
  const output=new Uint8ClampedArray(black.length);
  let visible=false;
  for(let pixel=0;pixel<black.length;pixel+=4){
    const difference=(white[pixel]-black[pixel]+white[pixel+1]-black[pixel+1]+white[pixel+2]-black[pixel+2])/3;
    const alpha=Math.max(0,Math.min(1,1-difference/255));
    visible ||= alpha>1/255;
    for(let channel=0;channel<3;channel++)output[pixel+channel]=background
      ?black[pixel+channel]+background[channel]*255*(1-alpha)
      :alpha>0?black[pixel+channel]/alpha:0;
    output[pixel+3]=background?255:Math.round(alpha*255);
  }
  if(!visible)throw new Error('当前视图没有可截取的纸面或折线，请调整视角或显示选项后重试。');
  return output;
}

/** WebGL readPixels starts at the bottom; Canvas ImageData starts at the top. */
export function flipSimulationImageRows(pixels:Uint8Array,width:number,height:number):Uint8ClampedArray {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||pixels.length!==width*height*4)throw new Error('显卡读取的图像尺寸无效，无法导出 PNG。');
  const result=new Uint8ClampedArray(pixels.length),stride=width*4;
  for(let row=0;row<height;row++)result.set(pixels.subarray((height-1-row)*stride,(height-row)*stride),row*stride);
  return result;
}
