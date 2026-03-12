import type { ShellType } from "./shell";
import type { Vec3 } from "./math";

export type SimulationOutcome =
  | "penetration"
  | "detonation"
  | "no_penetration"
  | "fuse_failure"
  | "ricochet"
  | "miss";

export type FuseStatus = "armed" | "failed" | "not_applicable";

export interface SimulationHitContext {
  branch: ShellType;
  shellType: ShellType;
  hitZoneName: string | null;
  impactPoint: Vec3 | null;
  impactNormal: Vec3 | null;
  impactAngleDeg: number | null;
  fuseStatus: FuseStatus;
  damageOriginPoint: Vec3 | null;
}

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

export type SurfaceDamageKind =
  | "impact_mark"
  | "penetration_hole"
  | "spall_exit"
  | "detonation_scorch"
  | "dent"
  | "ricochet_scar";

interface SurfaceDamageBase {
  id: string;
  kind: SurfaceDamageKind;
  position: Vec3;
  normal: Vec3;
  radius: number;
  depth?: number;
  relatedArmorZoneId?: string;
  note?: string;
}

export interface DamageDecalLikeMarker extends SurfaceDamageBase {
  kind: "impact_mark" | "detonation_scorch" | "dent" | "ricochet_scar";
}

export interface BreachVisual extends SurfaceDamageBase {
  kind: "penetration_hole" | "spall_exit";
}

export type SurfaceDamage = DamageDecalLikeMarker | BreachVisual;

export interface ModuleDamageResult {
  moduleId: string;
  label?: string;
  damage: number;
  remainingHp: number;
  destroyed: boolean;
  note?: string;
}

export interface CrewDamageResult {
  crewId: string;
  label?: string;
  damage: number;
  remainingHp: number;
  incapacitated: boolean;
  note?: string;
}

export interface SimulationResult {
  version: string;
  seed: number;
  summary: SimulationSummary;
  hitContext?: SimulationHitContext;
  events: SimulationEvent[];
  shellPath: Vec3[];
  fragments: FragmentPath[];
  surfaceDamage: SurfaceDamage[];
  damagedModules: ModuleDamageResult[];
  crew: CrewDamageResult[];
}
