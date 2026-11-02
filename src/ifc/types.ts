// Data passed from the IFC worker to the app: element facts and quantities, and triangle meshes in world coordinates (Y up).

export interface IfcLayer {
  name: string;
  t: number; // thickness (m)
}

export interface IfcQty {
  count: number;
  volume: number; // m3
  area: number; // m2, main face (one side)
  length: number; // m, along the main axis
  weight: number | null; // kg, only when the IFC file states it
}

export interface IfcElem {
  id: number; // express ID
  gid: string; // GlobalId
  cls: string; // IfcWall, IfcSlab … (IFC4 spelling, StandardCase folded in)
  ptype: string; // PredefinedType
  name: string;
  typeName: string;
  material: string;
  layers: IfcLayer[];
  storey: string;
  parentCls: string; // class of the aggregate it belongs to (curtain wall, stair …)
  external: boolean | null;
  loadBearing: boolean | null;
  q: IfcQty;
  qFrom: { volume: 'ifc' | 'geometry'; area: 'ifc' | 'geometry'; length: 'ifc' | 'geometry' };
}

export interface MeshData {
  id: number;
  pos: Float32Array; // xyz
  nrm: Float32Array; // xyz
  idx: Uint32Array;
  color: [number, number, number, number];
}

export interface IfcModelInfo {
  schema: string;
  project: string;
  site: string;
  building: string;
  storeys: string[];
  lengthUnit: string;
}

export type WorkerIn = { type: 'open'; buffer: ArrayBuffer };
export type WorkerOut =
  | { type: 'progress'; done: number; total: number; phase: string }
  | { type: 'meshes'; meshes: MeshData[] }
  | { type: 'done'; elements: IfcElem[]; info: IfcModelInfo }
  | { type: 'error'; message: string };
