import type {DiagramPDFOptions} from './diagramPDFLayout';

export interface PDFMarginBand {
  showTitle?:boolean;
  showDesigner?:boolean;
  showAuthor?:boolean;
  showPageNumber?:boolean;
  text?:string;
  alignment:'left'|'center'|'right';
  /** Header top or footer bottom measured inwards from the paper edge. */
  offsetMm?:number;
}
export interface PDFPageFurnitureStyle {header:PDFMarginBand;footer:PDFMarginBand}
export interface PDFPageFurniture {
  differentOddEven:boolean;
  common:PDFPageFurnitureStyle;
  odd?:PDFPageFurnitureStyle;
  even?:PDFPageFurnitureStyle;
}

export function diagramPDFPageFurniture(options:DiagramPDFOptions):PDFPageFurniture {
  return options.pageFurniture??{differentOddEven:false,common:{
    header:{alignment:'left',showTitle:options.runningTitle!==false,showAuthor:options.runningAuthor,showDesigner:options.runningDesigner,text:options.runningText},
    footer:{alignment:'center',showPageNumber:options.pageNumbers},
  }};
}

/** PDF indices are zero-based; the first physical page, including a cover,
 * counts as odd. Missing side-specific settings inherit the shared style. */
export function diagramPDFPageStyle(options:DiagramPDFOptions,pageIndex:number):PDFPageFurnitureStyle {
  const settings=diagramPDFPageFurniture(options);
  return settings.differentOddEven?(pageIndex%2===0?settings.odd:settings.even)??settings.common:settings.common;
}

export function validateDiagramPDFFurniture(settings:PDFPageFurniture|undefined) {
  if(settings===undefined)return;
  if(!settings||typeof settings!=='object'||Array.isArray(settings)||typeof settings.differentOddEven!=='boolean'||!settings.common)throw Error('页眉与页脚设置无效。');
  for(const style of [settings.common,settings.odd,settings.even]){
    if(style===undefined)continue;
    if(!style||typeof style!=='object'||Array.isArray(style))throw Error('页眉与页脚样式无效。');
    for(const band of [style.header,style.footer]){
      if(!band||typeof band!=='object'||Array.isArray(band)||!['left','center','right'].includes(band.alignment))throw Error('页眉或页脚的对齐设置无效。');
      for(const field of ['showTitle','showDesigner','showAuthor','showPageNumber'] as const)
        if(band[field]!==undefined&&typeof band[field]!=='boolean')throw Error('页眉或页脚的显示选项无效。');
      if(band.text!==undefined&&(typeof band.text!=='string'||band.text.length>160))throw Error('页眉或页脚的自定义文字最多 160 字。');
      if(band.offsetMm!==undefined&&(!Number.isFinite(band.offsetMm)||band.offsetMm<0||band.offsetMm>40))throw Error('页眉或页脚距纸边应为 0 至 40 mm。');
    }
  }
}
