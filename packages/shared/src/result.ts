import type { Vec3 } from "./math";

export type SimulationOutcome =
  | "penetration"
  | "no_penetration"
  | "ricochet"
  | "miss";

export interface SimulationSummary {
  outcome: SimulationOutcome;
  hitZoneId: string | null;
  effectiveArmorMm: number | null;
  penetrationMm: number;
  ricochet: boolean;
}

export interface SimulationEvent {
  t: number;
  type: string;
  position?: Vec3;
  targetId?: string;
  damage?: number;
  note?: string;
}

export interface FragmentPath {
  id: string;
  points: Vec3[];
}

export interface ModuleDamageResult {
  moduleId: string;
  damage: number;
  remainingHp: number;
  destroyed: boolean;
}

export interface CrewDamageResult {
  crewId: string;
  damage: number;
  remainingHp: number;
  incapacitated: boolean;
}

export interface SimulationResult {
  version: string;
  seed: number;
  summary: SimulationSummary;
  events: SimulationEvent[];
  shellPath: Vec3[];
  fragments: FragmentPath[];
  damagedModules: ModuleDamageResult[];
  crew: CrewDamageResult[];
}
