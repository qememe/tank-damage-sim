import type { ShellType } from "./shell.js";
import type { FuseStatus, SimulationOutcome, SurfaceDamageKind } from "./result.js";
import type { Vec3 } from "./math.js";

export interface DebugFragmentGenerationSummary {
  branch: ShellType;
  continuationHeuristic: string;
  energyHeuristic: string;
  fragmentCount: number;
  note: string;
  reachHeuristic: string;
  spreadHeuristic: string;
}

export interface DebugFragmentEntry {
  branch: ShellType;
  energy: number;
  fragmentType: "core" | "side" | "blast" | "spall";
  hitCount: number;
  hitTargets: string[];
  id: string;
  maxInteractions: number;
  note: string;
  reach: number;
  spread: number;
  stoppedReason: string;
}

export interface DebugDamageEntry {
  cause: string;
  damage: number;
  fragmentBranch: ShellType;
  fragmentEnergy: number;
  fragmentId: string;
  fragmentReach: number;
  fragmentType: "core" | "side" | "blast" | "spall";
  interactionIndex: number;
  kind: "crew" | "module";
  point: Vec3;
  targetId: string;
  targetLabel: string;
  travelDistance: number;
}

export interface DebugSurfaceDamageEntry {
  id: string;
  kind: SurfaceDamageKind;
  sourceBranch: ShellType;
  linkedHitZoneId: string | null;
  radius: number;
  depth: number | null;
  sizeHeuristic: string;
  reason: string;
  note: string | null;
}

export interface SimulationDebugReport {
  outcome: SimulationOutcome;
  branch: ShellType;
  shellType: ShellType;
  hitZoneId: string | null;
  hitZoneName: string | null;
  impactPoint: Vec3 | null;
  impactNormal: Vec3 | null;
  impactAngleDeg: number | null;
  effectiveArmorMm: number | null;
  normalImpactResistanceMm: number | null;
  shellPenetrationMm: number;
  fuseSensitivityMm: number | null;
  explosiveMassKg: number | null;
  fuseStatus: FuseStatus;
  ricochet: boolean;
  damageOriginPoint: Vec3 | null;
  reason: string;
  normalizedDirection: Vec3;
  notes: string[];
  fragmentGeneration: DebugFragmentGenerationSummary | null;
  fragmentLog: DebugFragmentEntry[];
  damageLog: DebugDamageEntry[];
  surfaceDamageLog: DebugSurfaceDamageEntry[];
}
