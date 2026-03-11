import type { Vec3 } from "./math";

export interface ArmorZone {
  id: string;
  name: string;
  thicknessMm: number;
  material: string;
  position: Vec3;
  size: Vec3;
  normal: Vec3;
}

export interface ModuleDefinition {
  id: string;
  type: string;
  position: Vec3;
  size: Vec3;
  hp: number;
}

export interface CrewMember {
  id: string;
  role: string;
  position: Vec3;
  hp: number;
}

export interface TankDefinition {
  id: string;
  name: string;
  description?: string;
  armorZones: ArmorZone[];
  modules: ModuleDefinition[];
  crew: CrewMember[];
}
