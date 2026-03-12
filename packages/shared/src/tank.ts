import type { Vec3 } from "./math.js";

export interface ArmorZone {
  id: string;
  name: string;
  thicknessMm: number;
  material: string;
  position: Vec3;
  size: Vec3;
  rotationDeg?: Vec3;
  normal: Vec3;
}

export interface ModuleDefinition {
  id: string;
  type: string;
  position: Vec3;
  size: Vec3;
  rotationDeg?: Vec3;
  hp: number;
}

export interface CrewMember {
  id: string;
  role: string;
  position: Vec3;
  size?: Vec3;
  shapeKind?: CrewHitboxShapeKind;
  rotationDeg?: Vec3;
  hp: number;
}

export type CrewHitboxShapeKind = "box";

export type ExternalShapeKind = "box" | "cylinder";

interface ExternalShapeBase {
  id: string;
  kind: ExternalShapeKind;
  position: Vec3;
  rotationDeg?: Vec3;
  color?: string;
  group?: string;
}

export interface ExternalBoxShape extends ExternalShapeBase {
  kind: "box";
  size: Vec3;
}

export interface ExternalCylinderShape extends ExternalShapeBase {
  kind: "cylinder";
  radius: number;
  length: number;
  radialSegments?: number;
}

export type ExternalShape = ExternalBoxShape | ExternalCylinderShape;

export interface TankDefinition {
  id: string;
  name: string;
  description?: string;
  armorZones: ArmorZone[];
  modules: ModuleDefinition[];
  crew: CrewMember[];
  externalShapes?: ExternalShape[];
}
