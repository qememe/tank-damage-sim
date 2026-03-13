import type {
  ArmorZone,
  CrewDamageResult,
  CrewMember,
  DebugDamageEntry,
  DebugFragmentEntry,
  DebugFragmentGenerationSummary,
  DebugSurfaceDamageEntry,
  FragmentPath,
  FuseStatus,
  ModuleDamageResult,
  ModuleDefinition,
  ShellDefinition,
  ShellType,
  SimulationDebugReport,
  SurfaceDamage,
  SurfaceDamageKind,
  SimulationEvent,
  SimulationHitContext,
  SimulationOutcome,
  SimulationResult,
  ScenarioInput,
  TankDefinition,
  Vec3,
} from "@tank-sim/shared";
import {
  addVec3,
  clamp,
  degreesFromRadians,
  dotVec3,
  intersectRayWithOrientedBox,
  rotateVec3,
  normalizeVec3,
  reflectVec3,
  roundNumber,
  roundVec3,
  scaleVec3,
} from "./math.js";

export interface SimulationRunRequest {
  scenario: ScenarioInput;
  shell: ShellDefinition;
  tank: TankDefinition;
}

export interface SimulationRunResponse {
  result: SimulationResult;
  debugReport: SimulationDebugReport;
}

interface ArmorHit {
  distance: number;
  point: Vec3;
  zone: ArmorZone;
}

interface InternalTargetHit {
  distance: number;
  id: string;
  kind: "crew" | "module";
  label: string;
  point: Vec3;
}

interface ImpactAnalysis {
  armorHit: ArmorHit;
  direction: Vec3;
  effectiveArmorMm: number;
  hitEvent: SimulationEvent;
  hitTimeSeconds: number;
  impactAngleDeg: number;
  normalImpactResistanceMm: number;
  resolvedPenetrationMm: number;
  shellStart: Vec3;
  zoneNormal: Vec3;
}

interface DamageAccumulator {
  damage: number;
  label: string;
  notes: string[];
}

interface DamageResolution {
  crew: CrewDamageResult[];
  damageLog: DebugDamageEntry[];
  damagedModules: ModuleDamageResult[];
  events: SimulationEvent[];
  fragmentGeneration: DebugFragmentGenerationSummary;
  fragmentLog: DebugFragmentEntry[];
  fragments: FragmentPath[];
}

type FragmentType = NonNullable<FragmentPath["fragmentType"]>;

interface FragmentModel {
  fragmentGeneration: DebugFragmentGenerationSummary;
  specs: FragmentSpec[];
}

interface FragmentSpec {
  branch: ShellType;
  continuationEnergyFactor: number;
  continuationReachFactor: number;
  direction: Vec3;
  energy: number;
  fragmentType: FragmentType;
  id: string;
  maxInteractions: number;
  note: string;
  reach: number;
  spread: number;
}

interface SurfaceDamageEmission {
  markers: SurfaceDamage[];
  debugEntries: DebugSurfaceDamageEntry[];
}

interface SurfaceDamageSpec {
  id: string;
  kind: SurfaceDamageKind;
  position: Vec3;
  normal: Vec3;
  radius: number;
  depth?: number;
  relatedArmorZoneId?: string;
  note?: string;
  sizeHeuristic: string;
  reason: string;
}

const CREW_BOX_SIZE: Vec3 = {
  x: 0.6,
  y: 1,
  z: 0.6,
};
const INTERNAL_SHELL_TRAVEL_METERS = 4;
const INTERNAL_START_OFFSET_METERS = 0.05;
const HE_DAMAGE_ORIGIN_OFFSET_METERS = 0.08;
const RICOCHET_ANGLE_DEGREES = 70;
const FRAGMENT_CONTINUATION_OFFSET_METERS = 0.04;
const AP_CORE_DIRECTION_TEMPLATES: Vec3[] = [
  { x: 0, y: 0, z: 0 },
  { x: 0.06, y: 0.02, z: 0 },
  { x: -0.05, y: -0.025, z: 0 },
  { x: 0.025, y: -0.05, z: 0 },
];
const AP_SPALL_DIRECTION_TEMPLATES: Vec3[] = [
  { x: 0.36, y: 0.08, z: 0 },
  { x: -0.34, y: 0.12, z: 0 },
  { x: 0.18, y: 0.32, z: 0 },
  { x: -0.18, y: -0.3, z: 0 },
  { x: 0.26, y: -0.18, z: 0 },
  { x: -0.24, y: 0.22, z: 0 },
];
const HE_BLAST_DIRECTION_TEMPLATES: Vec3[] = [
  { x: 0, y: 0, z: 0 },
  { x: 0.55, y: 0.08, z: 0 },
  { x: -0.52, y: -0.06, z: 0 },
  { x: 0.12, y: 0.48, z: 0 },
  { x: -0.1, y: -0.44, z: 0 },
  { x: 0.42, y: 0.34, z: 0 },
  { x: -0.4, y: 0.32, z: 0 },
  { x: 0.32, y: -0.4, z: 0 },
];
const HE_SPALL_DIRECTION_TEMPLATES: Vec3[] = [
  { x: 0.22, y: 0.12, z: 0 },
  { x: -0.2, y: 0.14, z: 0 },
  { x: 0.14, y: -0.22, z: 0 },
  { x: -0.16, y: -0.18, z: 0 },
];

function getResolvedPenetrationMm(
  shell: ShellDefinition,
  scenarioDistanceMeters: number,
): number {
  const penetrationLoss = (shell.penetrationLossPer100m ?? 0) * (scenarioDistanceMeters / 100);
  return roundNumber(Math.max(0, shell.penetrationMm - penetrationLoss), 3);
}

function getPenetrationNote(
  shell: ShellDefinition,
  scenarioDistanceMeters: number,
  resolvedPenetrationMm: number,
): string | null {
  if (!shell.penetrationLossPer100m) {
    return null;
  }

  return `Range-adjusted AP penetration: ${resolvedPenetrationMm} mm at ${scenarioDistanceMeters} m from a base ${shell.penetrationMm} mm with ${shell.penetrationLossPer100m} mm loss per 100 m.`;
}

function getCrewHitboxSize(crewMember: CrewMember): Vec3 {
  return crewMember.size ?? CREW_BOX_SIZE;
}

export function runSimulation(
  request: SimulationRunRequest,
): SimulationRunResponse {
  const { scenario, shell, tank } = request;
  const direction = normalizeVec3(scenario.direction);
  const armorHit = findFirstArmorHit(tank, scenario.origin, direction);

  if (armorHit === null) {
    return createMissResponse(scenario, shell, direction);
  }

  const impact = analyzeImpact(armorHit, direction, scenario, shell);

  if (shell.type === "HE") {
    return createHeResponse({
      impact,
      scenario,
      shell,
      tank,
    });
  }

  return createApResponse({
    impact,
    scenario,
    shell,
    tank,
  });
}

function analyzeImpact(
  armorHit: ArmorHit,
  direction: Vec3,
  scenario: ScenarioInput,
  shell: ShellDefinition,
): ImpactAnalysis {
  const zoneNormal = getArmorZoneNormal(armorHit.zone);
  const cosine = clamp(
    Math.abs(dotVec3(direction, zoneNormal)),
    0.001,
    1,
  );
  const impactAngleDeg = roundNumber(
    degreesFromRadians(Math.acos(cosine)),
    3,
  );
  const effectiveArmorMm = roundNumber(
    armorHit.zone.thicknessMm / cosine,
    3,
  );
  const normalImpactResistanceMm = roundNumber(
    armorHit.zone.thicknessMm * cosine,
    3,
  );
  const resolvedPenetrationMm = getResolvedPenetrationMm(
    shell,
    scenario.distanceMeters,
  );
  const hitTimeSeconds = roundNumber(
    armorHit.distance / Math.max(shell.velocityMps, 1),
    6,
  );

  return {
    armorHit,
    direction,
    effectiveArmorMm,
    hitEvent: {
      t: hitTimeSeconds,
      type: "armor_hit",
      position: armorHit.point,
      targetId: armorHit.zone.id,
      note: `Hit armor zone ${armorHit.zone.name}.`,
    },
    hitTimeSeconds,
    impactAngleDeg,
    normalImpactResistanceMm,
    resolvedPenetrationMm,
    shellStart: roundVec3(scenario.origin),
    zoneNormal,
  };
}

function createMissResponse(
  scenario: ScenarioInput,
  shell: ShellDefinition,
  direction: Vec3,
): SimulationRunResponse {
  const resolvedPenetrationMm = getResolvedPenetrationMm(
    shell,
    scenario.distanceMeters,
  );
  const penetrationNote = getPenetrationNote(
    shell,
    scenario.distanceMeters,
    resolvedPenetrationMm,
  );
  const missEnd = roundVec3(
    addVec3(scenario.origin, scaleVec3(direction, scenario.distanceMeters)),
  );
  const hitContext = createHitContext({
    damageOriginPoint: null,
    fuseStatus: "not_applicable",
    impact: null,
    shellType: shell.type,
  });

  return {
    result: {
      version: scenario.version,
      seed: scenario.seed,
      summary: {
        outcome: "miss",
        hitZoneId: null,
        effectiveArmorMm: null,
        penetrationMm: resolvedPenetrationMm,
        ricochet: false,
      },
      hitContext,
      events: [
        {
          t: 0,
          type: "miss",
          note: "The ray did not intersect any armor zone.",
        },
      ],
      shellPath: [roundVec3(scenario.origin), missEnd],
      fragments: [],
      surfaceDamage: [],
      damagedModules: [],
      crew: [],
    },
    debugReport: {
      outcome: "miss",
      branch: shell.type,
      shellType: shell.type,
      hitZoneId: null,
      hitZoneName: null,
      impactPoint: null,
      impactNormal: null,
      impactAngleDeg: null,
      effectiveArmorMm: null,
      normalImpactResistanceMm: null,
      shellPenetrationMm: resolvedPenetrationMm,
      fuseSensitivityMm: shell.fuseSensitivity ?? null,
      explosiveMassKg: shell.explosiveMassKg ?? null,
      fuseStatus: "not_applicable",
      ricochet: false,
      damageOriginPoint: null,
      reason: "No authored armor volume was intersected by the incoming ray.",
      normalizedDirection: direction,
      notes: [
        `Shell type: ${shell.type}.`,
        `Branch chosen: ${shell.type}.`,
        ...(penetrationNote ? [penetrationNote] : []),
        "Armor zone intersection search returned no hit.",
        "No ricochet, penetration, or fuse checks were applied.",
      ],
      fragmentGeneration: null,
      fragmentLog: [],
      damageLog: [],
      surfaceDamageLog: [],
    },
  };
}

function createSurfaceDamageEmission(
  sourceBranch: ShellType,
  linkedHitZoneId: string | null,
  specs: SurfaceDamageSpec[],
): SurfaceDamageEmission {
  return {
    markers: specs.map((spec) => createSurfaceDamageMarker(spec)),
    debugEntries: specs.map((spec) => ({
      id: spec.id,
      kind: spec.kind,
      sourceBranch,
      linkedHitZoneId,
      radius: roundNumber(spec.radius, 3),
      depth: spec.depth === undefined ? null : roundNumber(spec.depth, 3),
      sizeHeuristic: spec.sizeHeuristic,
      reason: spec.reason,
      note: spec.note ?? null,
    })),
  };
}

function createSurfaceDamageMarker(spec: SurfaceDamageSpec): SurfaceDamage {
  return {
    id: spec.id,
    kind: spec.kind,
    position: roundVec3(spec.position),
    normal: roundVec3(normalizeVec3(spec.normal)),
    radius: roundNumber(spec.radius, 3),
    ...(spec.depth === undefined ? {} : { depth: roundNumber(spec.depth, 3) }),
    ...(spec.relatedArmorZoneId === undefined
      ? {}
      : { relatedArmorZoneId: spec.relatedArmorZoneId }),
    ...(spec.note === undefined ? {} : { note: spec.note }),
  } as SurfaceDamage;
}

function invertNormal(normal: Vec3): Vec3 {
  return roundVec3(scaleVec3(normal, -1));
}

function createApRicochetSurfaceDamage(
  impact: ImpactAnalysis,
  shell: ShellDefinition,
): SurfaceDamageEmission {
  const radius = roundNumber(
    0.16 + (shell.caliberMm * 0.0008)
    + (Math.max(impact.impactAngleDeg - RICOCHET_ANGLE_DEGREES, 0) * 0.0025),
    3,
  );

  return createSurfaceDamageEmission(shell.type, impact.armorHit.zone.id, [
    {
      id: "ap_ricochet_scar_1",
      kind: "ricochet_scar",
      position: impact.armorHit.point,
      normal: impact.zoneNormal,
      radius,
      depth: 0.008,
      relatedArmorZoneId: impact.armorHit.zone.id,
      note: "AP ricochet scar on the outer armor face.",
      sizeHeuristic: `radius from ${shell.caliberMm} mm caliber plus ricochet angle ${impact.impactAngleDeg} deg; depth fixed as a shallow scar`,
      reason: "AP struck above the ricochet threshold, so the viewer shows a grazing scar instead of a breach.",
    },
  ]);
}

function createApNoPenetrationSurfaceDamage(
  impact: ImpactAnalysis,
  shell: ShellDefinition,
): SurfaceDamageEmission {
  const penetrationRatio = impact.resolvedPenetrationMm / Math.max(impact.effectiveArmorMm, 1);
  const radius = roundNumber(
    0.11 + (shell.caliberMm * 0.00065) + (penetrationRatio * 0.04),
    3,
  );
  const depth = roundNumber(
    clamp(0.01 + ((1 - penetrationRatio) * 0.02), 0.01, 0.03),
    3,
  );

  return createSurfaceDamageEmission(shell.type, impact.armorHit.zone.id, [
    {
      id: "ap_dent_1",
      kind: "dent",
      position: impact.armorHit.point,
      normal: impact.zoneNormal,
      radius,
      depth,
      relatedArmorZoneId: impact.armorHit.zone.id,
      note: "AP left a non-penetrating dent on the armor face.",
      sizeHeuristic: `radius from ${shell.caliberMm} mm caliber and penetration ratio ${roundNumber(penetrationRatio, 3)}; depth grows as the shot falls short of effective armor`,
      reason: "AP failed to perforate, so the prototype records a localized dent instead of a hole.",
    },
  ]);
}

function createApPenetrationSurfaceDamage(
  impact: ImpactAnalysis,
  shell: ShellDefinition,
  damage: DamageResolution,
  damageOriginPoint: Vec3,
): SurfaceDamageEmission {
  const penetrationMarginMm = Math.max(0, impact.resolvedPenetrationMm - impact.effectiveArmorMm);
  const entranceRadius = roundNumber(
    0.09 + (shell.caliberMm * 0.00055) + (penetrationMarginMm * 0.00035),
    3,
  );
  const holeRadius = roundNumber(
    0.028 + (shell.caliberMm * 0.00026) + (penetrationMarginMm * 0.00018),
    3,
  );
  const holeDepth = roundNumber(
    clamp(0.03 + (penetrationMarginMm * 0.00045), 0.03, 0.065),
    3,
  );
  const spallRadius = roundNumber(
    holeRadius + 0.02 + Math.min(damage.damageLog.length, 3) * 0.01,
    3,
  );
  const specs: SurfaceDamageSpec[] = [
    {
      id: "ap_impact_mark_1",
      kind: "impact_mark",
      position: impact.armorHit.point,
      normal: impact.zoneNormal,
      radius: entranceRadius,
      relatedArmorZoneId: impact.armorHit.zone.id,
      note: "AP impact mark around the perforation point.",
      sizeHeuristic: `radius from ${shell.caliberMm} mm caliber and penetration margin ${roundNumber(penetrationMarginMm, 3)} mm`,
      reason: "AP penetration leaves an exterior impact ring around the entrance point.",
    },
    {
      id: "ap_penetration_hole_1",
      kind: "penetration_hole",
      position: impact.armorHit.point,
      normal: impact.zoneNormal,
      radius: holeRadius,
      depth: holeDepth,
      relatedArmorZoneId: impact.armorHit.zone.id,
      note: "AP entrance hole through the armor plate.",
      sizeHeuristic: `radius and depth from ${shell.caliberMm} mm caliber plus penetration margin ${roundNumber(penetrationMarginMm, 3)} mm`,
      reason: "AP overmatched the effective armor, so the prototype exposes a clear breach marker.",
    },
  ];

  if (penetrationMarginMm >= 20 || damage.damageLog.length > 0) {
    specs.push({
      id: "ap_spall_exit_1",
      kind: "spall_exit",
      position: damageOriginPoint,
      normal: invertNormal(impact.zoneNormal),
      radius: spallRadius,
      depth: 0.018,
      relatedArmorZoneId: impact.armorHit.zone.id,
      note: "AP interior spall cone marker.",
      sizeHeuristic: `radius from the penetration hole plus ${damage.damageLog.length} recorded internal damage hits`,
      reason: "The viewer gets an interior spall marker when the AP perforation plausibly throws fragments into the compartment.",
    });
  }

  return createSurfaceDamageEmission(shell.type, impact.armorHit.zone.id, specs);
}

function createHeFuseFailureSurfaceDamage(
  impact: ImpactAnalysis,
  shell: ShellDefinition,
): SurfaceDamageEmission {
  const glancingImpact = impact.impactAngleDeg >= 55;
  const kind: SurfaceDamageKind = glancingImpact ? "dent" : "impact_mark";
  const radius = roundNumber(
    (glancingImpact ? 0.14 : 0.12)
    + (shell.caliberMm * 0.0007)
    + ((shell.explosiveMassKg ?? 0) * 0.035),
    3,
  );
  const depth = glancingImpact ? 0.01 : 0.006;

  return createSurfaceDamageEmission(shell.type, impact.armorHit.zone.id, [
    {
      id: "he_fuse_failure_1",
      kind,
      position: impact.armorHit.point,
      normal: impact.zoneNormal,
      radius,
      depth,
      relatedArmorZoneId: impact.armorHit.zone.id,
      note: glancingImpact
        ? "HE fuse failure left a shallow dent."
        : "HE fuse failure left an impact mark without detonation.",
      sizeHeuristic: `radius from ${shell.caliberMm} mm caliber and explosive mass ${shell.explosiveMassKg ?? 0} kg; glancing impacts switch to dent visuals`,
      reason: glancingImpact
        ? "The HE shell struck at a glancing angle and failed to function, so the prototype shows a shallow dent."
        : "The HE shell hit but did not detonate, so the prototype keeps only a surface mark.",
    },
  ]);
}

function createHeDetonationSurfaceDamage(
  impact: ImpactAnalysis,
  shell: ShellDefinition,
  damageOriginPoint: Vec3,
): SurfaceDamageEmission {
  const scorchRadius = roundNumber(
    0.18 + (shell.caliberMm * 0.00075) + ((shell.explosiveMassKg ?? 0) * 0.18),
    3,
  );
  const vulnerabilityRatio = impact.resolvedPenetrationMm / Math.max(impact.armorHit.zone.thicknessMm, 1);
  const shallowBreach = impact.armorHit.zone.thicknessMm <= (impact.resolvedPenetrationMm * 1.8);
  const specs: SurfaceDamageSpec[] = [
    {
      id: "he_detonation_scorch_1",
      kind: "detonation_scorch",
      position: impact.armorHit.point,
      normal: impact.zoneNormal,
      radius: scorchRadius,
      relatedArmorZoneId: impact.armorHit.zone.id,
      note: "HE detonation scorch on the outer armor face.",
      sizeHeuristic: `radius from ${shell.caliberMm} mm caliber and explosive mass ${shell.explosiveMassKg ?? 0} kg`,
      reason: "A functioning HE round leaves a visible scorch / blast signature on the impact face.",
    },
  ];

  if (shallowBreach) {
    specs.push({
      id: "he_shallow_breach_1",
      kind: "penetration_hole",
      position: damageOriginPoint,
      normal: invertNormal(impact.zoneNormal),
      radius: roundNumber(0.032 + (shell.caliberMm * 0.00022) + (vulnerabilityRatio * 0.012), 3),
      depth: roundNumber(clamp(0.015 + (vulnerabilityRatio * 0.008), 0.015, 0.03), 3),
      relatedArmorZoneId: impact.armorHit.zone.id,
      note: "Prototype shallow HE breach marker on a vulnerable plate.",
      sizeHeuristic: `interior breach radius from vulnerability ratio ${roundNumber(vulnerabilityRatio, 3)} against zone thickness ${impact.armorHit.zone.thicknessMm} mm`,
      reason: "The hit zone is thin enough relative to the HE shell's authored penetration to justify a shallow breach marker.",
    });
  }

  return createSurfaceDamageEmission(shell.type, impact.armorHit.zone.id, specs);
}

function createApResponse(args: {
  impact: ImpactAnalysis;
  scenario: ScenarioInput;
  shell: ShellDefinition;
  tank: TankDefinition;
}): SimulationRunResponse {
  const {
    impact,
    scenario,
    shell,
    tank,
  } = args;
  const penetrationNote = getPenetrationNote(
    shell,
    scenario.distanceMeters,
    impact.resolvedPenetrationMm,
  );
  const commonNotes = [
    `Shell type: ${shell.type}.`,
    "Branch chosen: AP penetration flow.",
    `Hit zone: ${impact.armorHit.zone.name}.`,
    `Impact angle: ${impact.impactAngleDeg} deg.`,
    `Effective armor: ${impact.effectiveArmorMm} mm.`,
    ...(penetrationNote ? [penetrationNote] : []),
  ];

  if (
    scenario.simulation.allowRicochet
    && impact.impactAngleDeg >= RICOCHET_ANGLE_DEGREES
  ) {
    const ricochetDirection = reflectVec3(impact.direction, impact.zoneNormal);
    const ricochetEnd = roundVec3(
      addVec3(impact.armorHit.point, scaleVec3(ricochetDirection, 3)),
    );
    const reason = `AP ricocheted because impact angle ${impact.impactAngleDeg} deg reached the ${RICOCHET_ANGLE_DEGREES} deg threshold.`;
    const surfaceDamage = createApRicochetSurfaceDamage(impact, shell);
    const hitContext = createHitContext({
      damageOriginPoint: null,
      fuseStatus: "not_applicable",
      impact,
      shellType: shell.type,
    });

    return {
      result: {
        version: scenario.version,
        seed: scenario.seed,
        summary: {
          outcome: "ricochet",
          hitZoneId: impact.armorHit.zone.id,
          effectiveArmorMm: impact.effectiveArmorMm,
          penetrationMm: impact.resolvedPenetrationMm,
          ricochet: true,
        },
        hitContext,
        events: [
          impact.hitEvent,
          {
            t: roundNumber(impact.hitTimeSeconds + 0.001, 6),
            type: "ricochet",
            position: impact.armorHit.point,
            targetId: impact.armorHit.zone.id,
            note: reason,
          },
        ],
        shellPath: [impact.shellStart, impact.armorHit.point, ricochetEnd],
        fragments: [],
        surfaceDamage: surfaceDamage.markers,
        damagedModules: [],
        crew: [],
      },
      debugReport: {
        outcome: "ricochet",
        branch: shell.type,
        shellType: shell.type,
        hitZoneId: impact.armorHit.zone.id,
        hitZoneName: impact.armorHit.zone.name,
        impactPoint: impact.armorHit.point,
        impactNormal: impact.zoneNormal,
        impactAngleDeg: impact.impactAngleDeg,
        effectiveArmorMm: impact.effectiveArmorMm,
        normalImpactResistanceMm: impact.normalImpactResistanceMm,
        shellPenetrationMm: impact.resolvedPenetrationMm,
        fuseSensitivityMm: null,
        explosiveMassKg: null,
        fuseStatus: "not_applicable",
        ricochet: true,
        damageOriginPoint: null,
        reason,
        normalizedDirection: impact.direction,
        notes: [
          ...commonNotes,
          "Outcome chosen: ricochet.",
          "Fuse logic is not used for AP.",
        ],
        fragmentGeneration: null,
        fragmentLog: [],
        damageLog: [],
        surfaceDamageLog: surfaceDamage.debugEntries,
      },
    };
  }

  if (impact.resolvedPenetrationMm < impact.effectiveArmorMm) {
    const reason = `AP penetration ${impact.resolvedPenetrationMm} mm was below effective armor ${impact.effectiveArmorMm} mm.`;
    const surfaceDamage = createApNoPenetrationSurfaceDamage(impact, shell);
    const hitContext = createHitContext({
      damageOriginPoint: null,
      fuseStatus: "not_applicable",
      impact,
      shellType: shell.type,
    });

    return {
      result: {
        version: scenario.version,
        seed: scenario.seed,
        summary: {
          outcome: "no_penetration",
          hitZoneId: impact.armorHit.zone.id,
          effectiveArmorMm: impact.effectiveArmorMm,
          penetrationMm: impact.resolvedPenetrationMm,
          ricochet: false,
        },
        hitContext,
        events: [
          impact.hitEvent,
          {
            t: roundNumber(impact.hitTimeSeconds + 0.001, 6),
            type: "no_penetration",
            position: impact.armorHit.point,
            targetId: impact.armorHit.zone.id,
            note: reason,
          },
        ],
        shellPath: [impact.shellStart, impact.armorHit.point],
        fragments: [],
        surfaceDamage: surfaceDamage.markers,
        damagedModules: [],
        crew: [],
      },
      debugReport: {
        outcome: "no_penetration",
        branch: shell.type,
        shellType: shell.type,
        hitZoneId: impact.armorHit.zone.id,
        hitZoneName: impact.armorHit.zone.name,
        impactPoint: impact.armorHit.point,
        impactNormal: impact.zoneNormal,
        impactAngleDeg: impact.impactAngleDeg,
        effectiveArmorMm: impact.effectiveArmorMm,
        normalImpactResistanceMm: impact.normalImpactResistanceMm,
        shellPenetrationMm: impact.resolvedPenetrationMm,
        fuseSensitivityMm: null,
        explosiveMassKg: null,
        fuseStatus: "not_applicable",
        ricochet: false,
        damageOriginPoint: null,
        reason,
        normalizedDirection: impact.direction,
        notes: [
          ...commonNotes,
          "Outcome chosen: no penetration.",
          "Armor defeated the AP shot before any internal fragment generation.",
        ],
        fragmentGeneration: null,
        fragmentLog: [],
        damageLog: [],
        surfaceDamageLog: surfaceDamage.debugEntries,
      },
    };
  }

  const damageOriginPoint = roundVec3(
    addVec3(
      impact.armorHit.point,
      scaleVec3(impact.direction, INTERNAL_START_OFFSET_METERS),
    ),
  );
  const fragmentModel = createApFragmentModel({
    fragmentCountMultiplier: scenario.simulation.fragmentCountMultiplier,
    penetrationMarginMm: impact.resolvedPenetrationMm - impact.effectiveArmorMm,
    randomness: scenario.simulation.randomness,
    seed: scenario.seed,
    travelDirection: impact.direction,
  });
  const damage = resolveFragmentDamage({
    damageOriginPoint,
    emptyEventType: "internal_damage_none",
    emptyNote: "AP penetration occurred but no fragment intersected crew or modules.",
    eventType: "internal_damage",
    eventTypeNotePrefix: "AP fragment",
    fragmentGeneration: fragmentModel.fragmentGeneration,
    fragmentSpecs: fragmentModel.specs,
    getDamage: (targetType, hitDistance, travelDistance, fragment, interactionIndex) => getApInternalDamage(
      shell,
      impact.effectiveArmorMm,
      impact.resolvedPenetrationMm,
      targetType,
      hitDistance,
      travelDistance,
      fragment,
      interactionIndex,
    ),
    allowRepeatedTargetHits: true,
    hitTimeSeconds: impact.hitTimeSeconds,
    tank,
  });
  const reason = `AP penetration ${impact.resolvedPenetrationMm} mm exceeded effective armor ${impact.effectiveArmorMm} mm.`;
  const hitContext = createHitContext({
    damageOriginPoint,
    fuseStatus: "not_applicable",
    impact,
    shellType: shell.type,
  });
  const surfaceDamage = createApPenetrationSurfaceDamage(
    impact,
    shell,
    damage,
    damageOriginPoint,
  );
  const shellExit = roundVec3(
    addVec3(
      impact.armorHit.point,
      scaleVec3(impact.direction, INTERNAL_SHELL_TRAVEL_METERS),
    ),
  );

  return {
    result: {
      version: scenario.version,
      seed: scenario.seed,
      summary: {
        outcome: "penetration",
        hitZoneId: impact.armorHit.zone.id,
        effectiveArmorMm: impact.effectiveArmorMm,
        penetrationMm: impact.resolvedPenetrationMm,
        ricochet: false,
      },
      hitContext,
      events: [
        impact.hitEvent,
        {
          t: roundNumber(impact.hitTimeSeconds + 0.001, 6),
          type: "penetration",
          position: impact.armorHit.point,
          targetId: impact.armorHit.zone.id,
          note: reason,
        },
        ...damage.events,
      ],
      shellPath: [impact.shellStart, impact.armorHit.point, shellExit],
      fragments: damage.fragments,
      surfaceDamage: surfaceDamage.markers,
      damagedModules: damage.damagedModules,
      crew: damage.crew,
    },
    debugReport: {
      outcome: "penetration",
      branch: shell.type,
      shellType: shell.type,
      hitZoneId: impact.armorHit.zone.id,
      hitZoneName: impact.armorHit.zone.name,
      impactPoint: impact.armorHit.point,
      impactNormal: impact.zoneNormal,
      impactAngleDeg: impact.impactAngleDeg,
      effectiveArmorMm: impact.effectiveArmorMm,
      normalImpactResistanceMm: impact.normalImpactResistanceMm,
      shellPenetrationMm: impact.resolvedPenetrationMm,
      fuseSensitivityMm: null,
      explosiveMassKg: null,
      fuseStatus: "not_applicable",
      ricochet: false,
      damageOriginPoint,
      reason,
      normalizedDirection: impact.direction,
      notes: [
        ...commonNotes,
        `Generated ${damage.fragments.length} AP fragments from the penetration point.`,
        `Spread heuristic: ${damage.fragmentGeneration.spreadHeuristic}`,
        `Energy heuristic: ${damage.fragmentGeneration.energyHeuristic}`,
        `Reach heuristic: ${damage.fragmentGeneration.reachHeuristic}`,
        `Continuation heuristic: ${damage.fragmentGeneration.continuationHeuristic}`,
        `Damaged modules: ${damage.damagedModules.length}. Damaged crew: ${damage.crew.length}.`,
      ],
      fragmentGeneration: damage.fragmentGeneration,
      fragmentLog: damage.fragmentLog,
      damageLog: damage.damageLog,
      surfaceDamageLog: surfaceDamage.debugEntries,
    },
  };
}

function createHeResponse(args: {
  impact: ImpactAnalysis;
  scenario: ScenarioInput;
  shell: ShellDefinition;
  tank: TankDefinition;
}): SimulationRunResponse {
  const {
    impact,
    scenario,
    shell,
    tank,
  } = args;
  const fuseStatus = evaluateHeFuseStatus(scenario, shell, impact);
  const penetrationNote = getPenetrationNote(
    shell,
    scenario.distanceMeters,
    impact.resolvedPenetrationMm,
  );
  const commonNotes = [
    `Shell type: ${shell.type}.`,
    "Branch chosen: HE blast flow.",
    `Hit zone: ${impact.armorHit.zone.name}.`,
    `Impact angle: ${impact.impactAngleDeg} deg.`,
    `Effective armor: ${impact.effectiveArmorMm} mm.`,
    `Projected armor resistance for the fuse check: ${impact.normalImpactResistanceMm} mm.`,
    ...(penetrationNote ? [penetrationNote] : []),
  ];

  if (fuseStatus.status === "failed") {
    const reason = `HE fuse failed: ${fuseStatus.reason}`;
    const surfaceDamage = createHeFuseFailureSurfaceDamage(impact, shell);
    const hitContext = createHitContext({
      damageOriginPoint: null,
      fuseStatus: "failed",
      impact,
      shellType: shell.type,
    });

    return {
      result: {
        version: scenario.version,
        seed: scenario.seed,
        summary: {
          outcome: "fuse_failure",
          hitZoneId: impact.armorHit.zone.id,
          effectiveArmorMm: impact.effectiveArmorMm,
          penetrationMm: impact.resolvedPenetrationMm,
          ricochet: false,
        },
        hitContext,
        events: [
          impact.hitEvent,
          {
            t: roundNumber(impact.hitTimeSeconds + 0.001, 6),
            type: "he_fuse_failed",
            position: impact.armorHit.point,
            targetId: impact.armorHit.zone.id,
            note: reason,
          },
        ],
        shellPath: [impact.shellStart, impact.armorHit.point],
        fragments: [],
        surfaceDamage: surfaceDamage.markers,
        damagedModules: [],
        crew: [],
      },
      debugReport: {
        outcome: "fuse_failure",
        branch: shell.type,
        shellType: shell.type,
        hitZoneId: impact.armorHit.zone.id,
        hitZoneName: impact.armorHit.zone.name,
        impactPoint: impact.armorHit.point,
        impactNormal: impact.zoneNormal,
        impactAngleDeg: impact.impactAngleDeg,
        effectiveArmorMm: impact.effectiveArmorMm,
        normalImpactResistanceMm: impact.normalImpactResistanceMm,
        shellPenetrationMm: impact.resolvedPenetrationMm,
        fuseSensitivityMm: shell.fuseSensitivity ?? null,
        explosiveMassKg: shell.explosiveMassKg ?? null,
        fuseStatus: "failed",
        ricochet: false,
        damageOriginPoint: null,
        reason,
        normalizedDirection: impact.direction,
        notes: [
          ...commonNotes,
          `Fuse status: failed. ${fuseStatus.reason}`,
          "Outcome chosen: fuse failure.",
          "No HE fragment or spall rays were generated.",
        ],
        fragmentGeneration: null,
        fragmentLog: [],
        damageLog: [],
        surfaceDamageLog: surfaceDamage.debugEntries,
      },
    };
  }

  const damageOriginPoint = roundVec3(
    addVec3(
      impact.armorHit.point,
      scaleVec3(impact.direction, HE_DAMAGE_ORIGIN_OFFSET_METERS),
    ),
  );
  const fragmentModel = createHeFragmentModel({
    explosiveMassKg: shell.explosiveMassKg ?? 0,
    fragmentCountMultiplier: scenario.simulation.fragmentCountMultiplier,
    randomness: scenario.simulation.randomness,
    seed: scenario.seed,
    travelDirection: impact.direction,
  });
  const damage = resolveFragmentDamage({
    damageOriginPoint,
    emptyEventType: "he_fragment_damage_none",
    emptyNote: "HE detonated but no fragment ray reached crew or modules.",
    eventType: "he_fragment_damage",
    eventTypeNotePrefix: "HE fragment",
    fragmentGeneration: fragmentModel.fragmentGeneration,
    fragmentSpecs: fragmentModel.specs,
    getDamage: (targetType, hitDistance, travelDistance, fragment, interactionIndex) => getHeInternalDamage(
      shell,
      targetType,
      hitDistance,
      travelDistance,
      fragment,
      interactionIndex,
    ),
    allowRepeatedTargetHits: false,
    hitTimeSeconds: impact.hitTimeSeconds,
    tank,
  });
  const reason = `HE fuse armed and detonated because ${fuseStatus.reason}`;
  const hitContext = createHitContext({
    damageOriginPoint,
    fuseStatus: "armed",
    impact,
    shellType: shell.type,
  });
  const surfaceDamage = createHeDetonationSurfaceDamage(
    impact,
    shell,
    damageOriginPoint,
  );

  return {
    result: {
      version: scenario.version,
      seed: scenario.seed,
      summary: {
        outcome: "detonation",
        hitZoneId: impact.armorHit.zone.id,
        effectiveArmorMm: impact.effectiveArmorMm,
        penetrationMm: impact.resolvedPenetrationMm,
        ricochet: false,
      },
      hitContext,
      events: [
        impact.hitEvent,
        {
          t: roundNumber(impact.hitTimeSeconds + 0.001, 6),
          type: "he_detonation",
          position: damageOriginPoint,
          targetId: impact.armorHit.zone.id,
          note: reason,
        },
        ...damage.events,
      ],
      shellPath: [impact.shellStart, impact.armorHit.point, damageOriginPoint],
      fragments: damage.fragments,
      surfaceDamage: surfaceDamage.markers,
      damagedModules: damage.damagedModules,
      crew: damage.crew,
    },
    debugReport: {
      outcome: "detonation",
      branch: shell.type,
      shellType: shell.type,
      hitZoneId: impact.armorHit.zone.id,
      hitZoneName: impact.armorHit.zone.name,
      impactPoint: impact.armorHit.point,
      impactNormal: impact.zoneNormal,
      impactAngleDeg: impact.impactAngleDeg,
      effectiveArmorMm: impact.effectiveArmorMm,
      normalImpactResistanceMm: impact.normalImpactResistanceMm,
      shellPenetrationMm: impact.resolvedPenetrationMm,
      fuseSensitivityMm: shell.fuseSensitivity ?? null,
      explosiveMassKg: shell.explosiveMassKg ?? null,
      fuseStatus: "armed",
      ricochet: false,
      damageOriginPoint,
      reason,
      normalizedDirection: impact.direction,
      notes: [
        ...commonNotes,
        `Fuse status: armed. ${fuseStatus.reason}`,
        `Generated ${damage.fragments.length} HE fragments from a shallow blast origin.`,
        `Spread heuristic: ${damage.fragmentGeneration.spreadHeuristic}`,
        `Energy heuristic: ${damage.fragmentGeneration.energyHeuristic}`,
        `Reach heuristic: ${damage.fragmentGeneration.reachHeuristic}`,
        `Continuation heuristic: ${damage.fragmentGeneration.continuationHeuristic}`,
        `Damaged modules: ${damage.damagedModules.length}. Damaged crew: ${damage.crew.length}.`,
      ],
      fragmentGeneration: damage.fragmentGeneration,
      fragmentLog: damage.fragmentLog,
      damageLog: damage.damageLog,
      surfaceDamageLog: surfaceDamage.debugEntries,
    },
  };
}

function createHitContext(args: {
  damageOriginPoint: Vec3 | null;
  fuseStatus: FuseStatus;
  impact: ImpactAnalysis | null;
  shellType: ShellType;
}): SimulationHitContext {
  const { damageOriginPoint, fuseStatus, impact, shellType } = args;

  return {
    branch: shellType,
    shellType,
    hitZoneName: impact?.armorHit.zone.name ?? null,
    impactPoint: impact?.armorHit.point ?? null,
    impactNormal: impact?.zoneNormal ?? null,
    impactAngleDeg: impact?.impactAngleDeg ?? null,
    fuseStatus,
    damageOriginPoint,
  };
}

function resolveFragmentDamage(args: {
  damageOriginPoint: Vec3;
  emptyEventType: string;
  emptyNote: string;
  eventType: string;
  eventTypeNotePrefix: string;
  fragmentGeneration: DebugFragmentGenerationSummary;
  fragmentSpecs: FragmentSpec[];
  getDamage: (
    targetType: "crew" | "module",
    hitDistance: number,
    travelDistance: number,
    fragment: FragmentSpec,
    interactionIndex: number,
  ) => number;
  allowRepeatedTargetHits: boolean;
  hitTimeSeconds: number;
  tank: TankDefinition;
}): DamageResolution {
  const {
    damageOriginPoint,
    emptyEventType,
    emptyNote,
    eventType,
    eventTypeNotePrefix,
    fragmentGeneration,
    fragmentSpecs,
    getDamage,
    allowRepeatedTargetHits,
    hitTimeSeconds,
    tank,
  } = args;
  const damageByModule = new Map<string, DamageAccumulator>();
  const damageByCrew = new Map<string, DamageAccumulator>();
  const damagedTargetIds = new Set<string>();
  const fragments: FragmentPath[] = [];
  const events: SimulationEvent[] = [];
  const damageLog: DebugDamageEntry[] = [];
  const fragmentLog: DebugFragmentEntry[] = [];

  for (let index = 0; index < fragmentSpecs.length; index += 1) {
    const fragment = fragmentSpecs[index];

    if (fragment === undefined) {
      continue;
    }

    const fragmentPoints: Vec3[] = [damageOriginPoint];
    const fragmentHitTargets: string[] = [];
    const localIgnoredTargetIds = new Set<string>();
    let searchOrigin = damageOriginPoint;
    let remainingReach = fragment.reach;
    let currentEnergy = fragment.energy;
    let cumulativeTravelDistance = 0;
    let interactionIndex = 0;
    let stoppedReason = `No internal target intersected within ${roundNumber(fragment.reach, 3)} m of fragment reach.`;

    while (
      interactionIndex < fragment.maxInteractions
      && remainingReach > 0.08
      && currentEnergy > 0.08
    ) {
      const ignoredTargetIds = !allowRepeatedTargetHits
        ? mergeIgnoredTargetIds(localIgnoredTargetIds, damagedTargetIds)
        : localIgnoredTargetIds;
      const internalHit = findFirstInternalHit(
        tank,
        searchOrigin,
        fragment.direction,
        remainingReach,
        ignoredTargetIds,
      );

      if (internalHit === null) {
        stoppedReason = interactionIndex === 0
          ? `No internal target intersected within ${roundNumber(remainingReach, 3)} m of remaining reach.`
          : `Fragment spent its remaining ${roundNumber(remainingReach, 3)} m of reach after ${interactionIndex} interaction(s).`;
        break;
      }

      localIgnoredTargetIds.add(internalHit.id);
      fragmentHitTargets.push(`${internalHit.kind}:${internalHit.id}`);
      fragmentPoints.push(roundVec3(internalHit.point));
      cumulativeTravelDistance += internalHit.distance;

      const damage = getDamage(
        internalHit.kind,
        internalHit.distance,
        cumulativeTravelDistance,
        fragment,
        interactionIndex,
      );
      const note = `${eventTypeNotePrefix} ${fragment.id} (${fragment.fragmentType}, energy ${roundNumber(currentEnergy, 3)}, reach ${roundNumber(remainingReach, 3)} m) hit ${internalHit.kind} ${internalHit.id} at ${roundNumber(cumulativeTravelDistance, 3)} m because its ${fragment.fragmentType} path intersected the target hitbox before the fragment ran out of reach.`;
      addDamage(
        internalHit.kind === "module" ? damageByModule : damageByCrew,
        internalHit.id,
        internalHit.label,
        damage,
        note,
      );
      damageLog.push({
        cause: note,
        damage,
        fragmentBranch: fragment.branch,
        fragmentEnergy: roundNumber(currentEnergy, 3),
        fragmentId: fragment.id,
        fragmentReach: roundNumber(remainingReach, 3),
        fragmentType: fragment.fragmentType,
        interactionIndex,
        kind: internalHit.kind,
        point: internalHit.point,
        targetId: internalHit.id,
        targetLabel: internalHit.label,
        travelDistance: roundNumber(cumulativeTravelDistance, 3),
      });
      damagedTargetIds.add(internalHit.id);
      events.push({
        t: roundNumber(hitTimeSeconds + 0.01 + (index * 0.01) + (interactionIndex * 0.003), 6),
        type: eventType,
        position: internalHit.point,
        targetId: internalHit.id,
        damage,
        note,
      });

      remainingReach = Math.max(0, remainingReach - internalHit.distance);
      interactionIndex += 1;

      if (interactionIndex >= fragment.maxInteractions) {
        stoppedReason = `Fragment reached its configured interaction cap of ${fragment.maxInteractions}.`;
        break;
      }

      const continuedReach = remainingReach * fragment.continuationReachFactor;
      const continuedEnergy = currentEnergy * fragment.continuationEnergyFactor;

      if (continuedReach <= 0.12 || continuedEnergy <= 0.12) {
        stoppedReason = `Fragment lost too much energy after impact and could not continue (energy ${roundNumber(continuedEnergy, 3)}, reach ${roundNumber(continuedReach, 3)} m).`;
        break;
      }

      searchOrigin = addVec3(
        internalHit.point,
        scaleVec3(fragment.direction, FRAGMENT_CONTINUATION_OFFSET_METERS),
      );
      remainingReach = Math.max(0, continuedReach - FRAGMENT_CONTINUATION_OFFSET_METERS);
      currentEnergy = continuedEnergy;
    }

    const finalPoint = roundVec3(
      addVec3(
        fragmentPoints[fragmentPoints.length - 1] ?? damageOriginPoint,
        scaleVec3(fragment.direction, remainingReach),
      ),
    );

    if (
      fragmentPoints.length === 1
      || !areVec3Equal(fragmentPoints[fragmentPoints.length - 1] ?? damageOriginPoint, finalPoint)
    ) {
      fragmentPoints.push(finalPoint);
    }

    fragments.push({
      id: fragment.id,
      points: fragmentPoints,
      sourceBranch: fragment.branch,
      fragmentType: fragment.fragmentType,
      energy: roundNumber(fragment.energy, 3),
      reach: roundNumber(fragment.reach, 3),
    });
    fragmentLog.push({
      branch: fragment.branch,
      energy: roundNumber(fragment.energy, 3),
      fragmentType: fragment.fragmentType,
      hitCount: fragmentHitTargets.length,
      hitTargets: fragmentHitTargets,
      id: fragment.id,
      maxInteractions: fragment.maxInteractions,
      note: fragment.note,
      reach: roundNumber(fragment.reach, 3),
      spread: roundNumber(fragment.spread, 3),
      stoppedReason,
    });
  }

  if (events.length === 0) {
    events.push({
      t: roundNumber(hitTimeSeconds + 0.01, 6),
      type: emptyEventType,
      note: emptyNote,
    });
  }

  return {
    crew: buildCrewDamageResults(tank.crew, damageByCrew),
    damageLog,
    damagedModules: buildModuleDamageResults(tank.modules, damageByModule),
    events,
    fragmentGeneration,
    fragmentLog,
    fragments,
  };
}

function addDamage(
  damageMap: Map<string, DamageAccumulator>,
  targetId: string,
  label: string,
  damage: number,
  note: string,
): void {
  const existing = damageMap.get(targetId);

  if (existing === undefined) {
    damageMap.set(targetId, {
      damage,
      label,
      notes: [note],
    });
    return;
  }

  existing.damage += damage;
  if (!existing.notes.includes(note)) {
    existing.notes.push(note);
  }
}

function buildCrewDamageResults(
  crewMembers: CrewMember[],
  damageByCrew: Map<string, DamageAccumulator>,
): CrewDamageResult[] {
  const results: CrewDamageResult[] = [];

  for (const crewMember of crewMembers) {
    const accumulated = damageByCrew.get(crewMember.id);

    if (accumulated === undefined) {
      continue;
    }

    const remainingHp = Math.max(0, crewMember.hp - accumulated.damage);

    results.push({
      crewId: crewMember.id,
      label: accumulated.label,
      damage: accumulated.damage,
      remainingHp,
      incapacitated: remainingHp === 0,
      note: accumulated.notes.join(" "),
    });
  }

  return results;
}

function buildModuleDamageResults(
  modules: ModuleDefinition[],
  damageByModule: Map<string, DamageAccumulator>,
): ModuleDamageResult[] {
  const results: ModuleDamageResult[] = [];

  for (const module of modules) {
    const accumulated = damageByModule.get(module.id);

    if (accumulated === undefined) {
      continue;
    }

    const remainingHp = Math.max(0, module.hp - accumulated.damage);

    results.push({
      moduleId: module.id,
      label: accumulated.label,
      damage: accumulated.damage,
      remainingHp,
      destroyed: remainingHp === 0,
      note: accumulated.notes.join(" "),
    });
  }

  return results;
}

function evaluateHeFuseStatus(
  scenario: ScenarioInput,
  shell: ShellDefinition,
  impact: ImpactAnalysis,
): { reason: string; status: FuseStatus } {
  if (!scenario.simulation.allowFuseFailure) {
    return {
      status: "armed",
      reason: "scenario disabled fuse failures",
    };
  }

  if (shell.fuseSensitivity === undefined) {
    return {
      status: "armed",
      reason: "no fuse sensitivity was authored, so the prototype assumes a functioning fuse",
    };
  }

  if (impact.normalImpactResistanceMm < shell.fuseSensitivity) {
    return {
      status: "failed",
      reason: `projected armor resistance ${impact.normalImpactResistanceMm} mm stayed below fuse sensitivity ${shell.fuseSensitivity} mm`,
    };
  }

  return {
    status: "armed",
    reason: `projected armor resistance ${impact.normalImpactResistanceMm} mm met fuse sensitivity ${shell.fuseSensitivity} mm`,
  };
}

function createDeterministicRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;

  return () => {
    state = ((state * 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomBetween(rng: () => number, min: number, max: number): number {
  return min + ((max - min) * rng());
}

function createFragmentDirection(
  directionBias: Vec3,
  spread: number,
  jitter: number,
  rng: () => number,
  templates: Vec3[],
  index: number,
  travelDirection: Vec3,
): Vec3 {
  const fallbackTemplate = templates[templates.length - 1];

  if (fallbackTemplate === undefined) {
    throw new Error("Fragment direction templates are not configured.");
  }

  const template = templates[index] ?? fallbackTemplate;

  return normalizeVec3({
    x: travelDirection.x + (directionBias.x * spread) + (template.x * spread) + randomBetween(rng, -jitter, jitter),
    y: travelDirection.y + (directionBias.y * spread) + (template.y * spread) + randomBetween(rng, -jitter, jitter),
    z: travelDirection.z + (directionBias.z * spread * 0.35) + (template.z * spread * 0.35) + randomBetween(rng, -(jitter * 0.2), jitter * 0.2),
  });
}

function createApFragmentModel(args: {
  fragmentCountMultiplier: number;
  penetrationMarginMm: number;
  randomness: number;
  seed: number;
  travelDirection: Vec3;
}): FragmentModel {
  const {
    fragmentCountMultiplier,
    penetrationMarginMm,
    randomness,
    seed,
    travelDirection,
  } = args;
  const fragmentCount = getApFragmentCount(fragmentCountMultiplier, penetrationMarginMm);
  const rng = createDeterministicRng(seed + 101);
  const normalizedMargin = clamp(penetrationMarginMm / 80, 0, 1.2);
  const coreCount = clamp(2 + (penetrationMarginMm >= 40 ? 1 : 0), 2, Math.max(2, fragmentCount - 1));
  const specs: FragmentSpec[] = [];

  for (let index = 0; index < fragmentCount; index += 1) {
    const isCore = index < coreCount;
    const fragmentType: FragmentType = isCore
      ? "core"
      : index % 2 === 0
        ? "spall"
        : "side";
    const spread = isCore
      ? randomBetween(rng, 0.025, 0.055) + (Math.max(0, randomness) * 0.05)
      : randomBetween(rng, 0.15, 0.28) + (Math.max(0, randomness) * 0.11);
    const jitter = isCore
      ? 0.008 + (Math.max(0, randomness) * 0.03)
      : 0.025 + (Math.max(0, randomness) * 0.055);
    const energy = isCore
      ? randomBetween(rng, 1.05, 1.35) + (normalizedMargin * 0.18)
      : randomBetween(rng, 0.42, 0.78) + (normalizedMargin * 0.08);
    const reach = isCore
      ? randomBetween(rng, 3.3, 4.4) + (normalizedMargin * 0.3)
      : randomBetween(rng, 1.35, 2.45) + (normalizedMargin * 0.15);
    const direction = createFragmentDirection(
      { x: 0, y: 0, z: 0 },
      spread,
      jitter,
      rng,
      isCore ? AP_CORE_DIRECTION_TEMPLATES : AP_SPALL_DIRECTION_TEMPLATES,
      isCore ? index : index - coreCount,
      travelDirection,
    );

    specs.push({
      id: `fragment_${index + 1}`,
      branch: "AP",
      continuationEnergyFactor: isCore ? 0.58 : 0,
      continuationReachFactor: isCore ? 0.52 : 0,
      direction,
      energy,
      fragmentType,
      maxInteractions: isCore ? 2 : 1,
      note: isCore
        ? "Forward-biased AP core fragment with higher retained energy."
        : "Secondary AP spall/side fragment with wider lateral spread and shorter reach.",
      reach,
      spread,
    });
  }

  return {
    fragmentGeneration: {
      branch: "AP",
      continuationHeuristic: "Core AP fragments may continue through one major interaction at reduced energy/reach; side and spall fragments stop after the first impact.",
      energyHeuristic: `Core fragments use higher energy from penetration margin ${roundNumber(penetrationMarginMm, 3)} mm; side/spall fragments are scaled down.`,
      fragmentCount,
      note: `Built ${coreCount} forward core fragments plus ${Math.max(0, fragmentCount - coreCount)} secondary AP spall/side fragments.`,
      reachHeuristic: "Core AP fragments travel deeper (roughly 3.3-4.7 m) while side/spall fragments fall off earlier (roughly 1.3-2.6 m).",
      spreadHeuristic: `AP keeps a narrow cone for core fragments and a wider lateral spread for secondary fragments; authored randomness ${roundNumber(randomness, 3)} widens both slightly.`,
    },
    specs,
  };
}

function createHeFragmentModel(args: {
  explosiveMassKg: number;
  fragmentCountMultiplier: number;
  randomness: number;
  seed: number;
  travelDirection: Vec3;
}): FragmentModel {
  const {
    explosiveMassKg,
    fragmentCountMultiplier,
    randomness,
    seed,
    travelDirection,
  } = args;
  const fragmentCount = getHeFragmentCount(fragmentCountMultiplier, explosiveMassKg);
  const rng = createDeterministicRng(seed + 211);
  const massScale = clamp(0.85 + (explosiveMassKg * 0.9), 0.85, 1.7);
  const blastCount = clamp(
    4 + Math.round(explosiveMassKg * 2.5),
    4,
    Math.max(4, fragmentCount - 1),
  );
  const specs: FragmentSpec[] = [];

  for (let index = 0; index < fragmentCount; index += 1) {
    const isBlast = index < blastCount;
    const fragmentType: FragmentType = isBlast ? "blast" : "spall";
    const spread = isBlast
      ? randomBetween(rng, 0.28, 0.5) + (Math.max(0, randomness) * 0.16)
      : randomBetween(rng, 0.16, 0.3) + (Math.max(0, randomness) * 0.1);
    const jitter = isBlast
      ? 0.045 + (Math.max(0, randomness) * 0.08)
      : 0.025 + (Math.max(0, randomness) * 0.05);
    const energy = isBlast
      ? randomBetween(rng, 0.42, 0.78) * massScale
      : randomBetween(rng, 0.5, 0.9) * (0.9 + (massScale * 0.35));
    const reach = isBlast
      ? randomBetween(rng, 0.9, 1.75) * massScale
      : randomBetween(rng, 1.1, 2.05) * Math.min(1.2, 0.85 + (massScale * 0.2));
    const direction = createFragmentDirection(
      isBlast ? { x: 0, y: 0, z: 0 } : { x: 0, y: 0, z: 0.05 },
      spread,
      jitter,
      rng,
      isBlast ? HE_BLAST_DIRECTION_TEMPLATES : HE_SPALL_DIRECTION_TEMPLATES,
      isBlast ? index : index - blastCount,
      travelDirection,
    );

    specs.push({
      id: `fragment_${index + 1}`,
      branch: "HE",
      continuationEnergyFactor: 0,
      continuationReachFactor: 0,
      direction,
      energy,
      fragmentType,
      maxInteractions: 1,
      note: isBlast
        ? "Short-range HE blast fragment with wide local spread."
        : "Localized HE spall fragment with slightly tighter focus than the blast cloud.",
      reach,
      spread,
    });
  }

  return {
    fragmentGeneration: {
      branch: "HE",
      continuationHeuristic: "HE fragments do not continue after a major interaction in the prototype; damage is front-loaded near the detonation point.",
      energyHeuristic: `Explosive mass ${roundNumber(explosiveMassKg, 3)} kg scales both fragment count and local fragment energy, with blast fragments weaker than AP core fragments.`,
      fragmentCount,
      note: `Built ${blastCount} short-range HE blast fragments plus ${Math.max(0, fragmentCount - blastCount)} shallow spall fragments.`,
      reachHeuristic: "HE fragments are intentionally short-lived (roughly 0.9-2.1 m) so damage clusters near the blast origin instead of traveling deep like AP spall.",
      spreadHeuristic: `HE uses a wider cone and higher local jitter than AP; authored randomness ${roundNumber(randomness, 3)} further opens the cone.`,
    },
    specs,
  };
}

function mergeIgnoredTargetIds(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): Set<string> {
  return new Set<string>([...left, ...right]);
}

function areVec3Equal(left: Vec3, right: Vec3): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function getArmorZoneNormal(zone: ArmorZone): Vec3 {
  return normalizeVec3(rotateVec3(zone.normal, zone.rotationDeg));
}

function findFirstArmorHit(
  tank: TankDefinition,
  origin: Vec3,
  direction: Vec3,
): ArmorHit | null {
  let closestHit: ArmorHit | null = null;

  for (const zone of tank.armorZones) {
    const hit = intersectRayWithOrientedBox(
      origin,
      direction,
      zone.position,
      zone.size,
      zone.rotationDeg,
    );

    if (hit === null) {
      continue;
    }

    if (closestHit === null || hit.distance < closestHit.distance) {
      closestHit = {
        zone,
        distance: hit.distance,
        point: hit.point,
      };
    }
  }

  return closestHit;
}

function findFirstInternalHit(
  tank: TankDefinition,
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
  ignoredTargetIds: ReadonlySet<string> = new Set<string>(),
): InternalTargetHit | null {
  let closestHit: InternalTargetHit | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const module of tank.modules) {
    if (ignoredTargetIds.has(module.id)) {
      continue;
    }

    const hit = intersectRayWithOrientedBox(
      origin,
      direction,
      module.position,
      module.size,
      module.rotationDeg,
      maxDistance,
    );

    if (hit === null || hit.distance >= closestDistance) {
      continue;
    }

    closestDistance = hit.distance;
    closestHit = {
      distance: hit.distance,
      kind: "module",
      id: module.id,
      label: module.type,
      point: hit.point,
    };
  }

  for (const crewMember of tank.crew) {
    if (ignoredTargetIds.has(crewMember.id)) {
      continue;
    }

    const hitboxSize = getCrewHitboxSize(crewMember);
    const hit = intersectRayWithOrientedBox(
      origin,
      direction,
      crewMember.position,
      hitboxSize,
      crewMember.rotationDeg,
      maxDistance,
    );

    if (hit === null || hit.distance >= closestDistance) {
      continue;
    }

    closestDistance = hit.distance;
    closestHit = {
      distance: hit.distance,
      kind: "crew",
      id: crewMember.id,
      label: crewMember.role,
      point: hit.point,
    };
  }

  return closestHit;
}

function getApFragmentCount(
  fragmentCountMultiplier: number,
  penetrationMarginMm: number,
): number {
  const baselineCount = Math.max(4, Math.round(5 * fragmentCountMultiplier));
  const marginBonus = penetrationMarginMm >= 25 ? 1 : 0;
  const overmatchBonus = penetrationMarginMm >= 55 ? 1 : 0;

  return clamp(baselineCount + marginBonus + overmatchBonus, 4, 8);
}

function getHeFragmentCount(
  fragmentCountMultiplier: number,
  explosiveMassKg: number,
): number {
  const baselineCount = Math.max(5, Math.round(6 * fragmentCountMultiplier));
  const explosiveBonus = explosiveMassKg >= 0.6 ? 2 : explosiveMassKg >= 0.25 ? 1 : 0;

  return clamp(baselineCount + explosiveBonus, 5, 12);
}

function getApInternalDamage(
  shell: ShellDefinition,
  effectiveArmorMm: number,
  resolvedPenetrationMm: number,
  targetType: "crew" | "module",
  hitDistance: number,
  travelDistance: number,
  fragment: FragmentSpec,
  interactionIndex: number,
): number {
  const baseDamage = 18 + Math.round(shell.caliberMm * 0.28);
  const surplusBonus = Math.max(
    0,
    Math.round((resolvedPenetrationMm - effectiveArmorMm) * 0.11),
  );
  const energyBonus = Math.round(fragment.energy * 22);
  const typeBonus = fragment.fragmentType === "core"
    ? 14
    : fragment.fragmentType === "spall"
      ? 7
      : 3;
  const rangePenalty = Math.round((hitDistance * 4) + (travelDistance * 5.5));
  const continuationPenalty = interactionIndex * 10;
  const totalDamage = baseDamage
    + surplusBonus
    + energyBonus
    + typeBonus
    + (targetType === "crew" ? 12 : 0)
    - rangePenalty
    - continuationPenalty;

  return Math.max(1, totalDamage);
}

function getHeInternalDamage(
  shell: ShellDefinition,
  targetType: "crew" | "module",
  hitDistance: number,
  travelDistance: number,
  fragment: FragmentSpec,
  interactionIndex: number,
): number {
  const explosiveMassKg = shell.explosiveMassKg ?? 0.1;
  const baseDamage = Math.round((explosiveMassKg * 62) + (shell.caliberMm * 0.16));
  const energyBonus = Math.round(fragment.energy * 18);
  const proximityBonus = fragment.fragmentType === "blast" ? 10 : 6;
  const rangePenalty = Math.round((hitDistance * 10) + (travelDistance * 16));
  const crewBonus = targetType === "crew" ? 9 : 0;
  const continuationPenalty = interactionIndex * 8;
  const totalDamage = baseDamage + energyBonus + proximityBonus + crewBonus - rangePenalty - continuationPenalty;

  return Math.max(1, totalDamage);
}
