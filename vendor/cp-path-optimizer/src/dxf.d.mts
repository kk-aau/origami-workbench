export interface DXFWriterPath {
  layer: string;
  color?: number;
  trueColor?: number | null;
  points: [number, number][];
  closed?: boolean;
}
export function writeDxf(paths: DXFWriterPath[], options?: {format?: 'LWPOLYLINE' | 'LINE'; units?: number}): string;
export function parseDxf(text: string, options?: {includeLayers?: string[]; excludeLayers?: string[]; includeHidden?: boolean}): {
  segments: {id: string; sourceEntity: string; layer: string; color: number; trueColor: number | null; linetype: string; a: [number, number]; b: [number, number]}[];
  layers: {name: string; color: number; trueColor: number | null; hidden: boolean; linetype: string}[];
  units: number | null;
  version: string;
  warnings: string[];
};
