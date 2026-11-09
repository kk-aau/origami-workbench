import {validateDoc,type Doc} from '../core/types';
import {curveBandBoundary,curveDesignGeometry,parseCurveDesign,type CurveDesign} from './curveDesign';

/** Store the native continuous design as an ordinary project envelope, in millimeters. */
export function curveDesignDocument(input:CurveDesign):Doc{
  const design=parseCurveDesign(input),geometry=curveDesignGeometry(design),
    boundary=[...curveBandBoundary(geometry.left2D),...curveBandBoundary(geometry.right2D)],
    xs=boundary.map(point=>point[0]),ys=boundary.map(point=>point[1]),
    width=Math.max(...xs)-Math.min(...xs),height=Math.max(...ys)-Math.min(...ys);
  const document:Doc={schemaVersion:2,name:design.name,paper:{width,height},segments:[],objects:[],
    metadata:{curveDesign:structuredClone(design)}};
  validateDoc(document);
  return document;
}

/** Null means an ordinary project; recognized but broken native designs must fail visibly. */
export function curveDesignFromDocument(document:Doc):CurveDesign|null{
  const metadata=document?.metadata;
  if(!metadata||typeof metadata!=='object'||Array.isArray(metadata)||!Object.hasOwn(metadata,'curveDesign'))return null;
  validateDoc(document);
  if(document.segments.length)throw Error('曲面设计工程包含直线折痕，请分开保存曲面设计和折痕工程。');
  const design=parseCurveDesign(metadata.curveDesign);
  // The standard project rename field remains the authoritative visible name.
  if(design.name!==document.name)return parseCurveDesign({...design,name:document.name});
  return design;
}
