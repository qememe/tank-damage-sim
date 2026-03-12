import type {
  ArmorZone,
  CrewDamageResult,
  CrewMember,
  FragmentPath,
  FuseStatus,
  ModuleDamageResult,
  ModuleDefinition,
  ShellDefinition,
  ShellType,
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
  intersectRayWithAabb,
  normalizeVec3,
  reflectVec3,
  roundNumber,
  roundVec3,
  scaleVec3,
  toAabb,
} from "./math.js";

export interface SimulationRunRequest {
  scenario: ScenarioInput;
  shell: ShellDefinition;
  tank: TankDefinition;
}

interface DebugDamageEntry {
  cause: string;
  damage: number;
  kind: "crew" | "module";
  point: Vec3;
  targetId: string;
  targetLabel: string;
}

interface DebugSurfaceDamageEntry {
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
  damageLog: DebugDamageEntry[];
  surfaceDamageLog: DebugSurfaceDamageEntry[];
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
  fragments: FragmentPath[];
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
const FRAGMENT_LENGTH_METERS_AP = 4;
const FRAGMENT_LENGTH_METERS_HE = 2.6;
const INTERNAL_SHELL_TRAVEL_METERS = 4;
const INTERNAL_START_OFFSET_METERS = 0.05;
const HE_DAMAGE_ORIGIN_OFFSET_METERS = 0.08;
const RICOCHET_ANGLE_DEGREES = 70;
const AP_FRAGMENT_DIRECTION_TEMPLATES: Vec3[] = [
  { x: 0, y: 0, z: 0 },
  { x: 0.8, y: 0, z: 0 },
  { x: -0.8, y: 0, z: 0 },
  { x: 0, y: 0.8, z: 0 },
  { x: 0, y: -0.8, z: 0 },
  { x: 0.5, y: 0.5, z: 0 },
];
const HE_FRAGMENT_DIRECTION_TEMPLATES: Vec3[] = [
  { x: 0, y: 0, z: 0 },
  { x: 1.6, y: 0, z: 0 },
  { x: -1.6, y: 0, z: 0 },
  { x: 0, y: 1.2, z: 0 },
  { x: 0, y: -1.2, z: 0 },
  { x: 1.1, y: 0.8, z: 0 },
  { x: -1.1, y: 0.8, z: 0 },
  { x: 0.8, y: -1, z: 0 },
];

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
  const zoneNormal = normalizeVec3(armorHit.zone.normal);
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
    shellStart: roundVec3(scenario.origin),
    zoneNormal,
  };
}

function createMissResponse(
  scenario: ScenarioInput,
  shell: ShellDefinition,
  direction: Vec3,
): SimulationRunResponse {
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
        penetrationMm: shell.penetrationMm,
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
      shellPenetrationMm: shell.penetrationMm,
      fuseSensitivityMm: shell.fuseSensitivity ?? null,
      explosiveMassKg: shell.explosiveMassKg ?? null,
      fuseStatus: "not_applicable",
      ricochet: false,
      damageOriginPoint: null,
      reason: "No armor zone AABB was intersected by the incoming ray.",
      normalizedDirection: direction,
      notes: [
        `Shell type: ${shell.type}.`,
        `Branch chosen: ${shell.type}.`,
        "Armor zone intersection search returned no hit.",
        "No ricochet, penetration, or fuse checks were applied.",
      ],
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
  const penetrationRatio = shell.penetrationMm / Math.max(impact.effectiveArmorMm, 1);
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
  const penetrationMarginMm = Math.max(0, shell.penetrationMm - impact.effectiveArmorMm);
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
  const vulnerabilityRatio = shell.penetrationMm / Math.max(impact.armorHit.zone.thicknessMm, 1);
  const shallowBreach = impact.armorHit.zone.thicknessMm <= (shell.penetrationMm * 1.8);
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
  const commonNotes = [
    `Shell type: ${shell.type}.`,
    "Branch chosen: AP penetration flow.",
    `Hit zone: ${impact.armorHit.zone.name}.`,
    `Impact angle: ${impact.impactAngleDeg} deg.`,
    `Effective armor: ${impact.effectiveArmorMm} mm.`,
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
          penetrationMm: shell.penetrationMm,
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
        shellPenetrationMm: shell.penetrationMm,
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
        damageLog: [],
        surfaceDamageLog: surfaceDamage.debugEntries,
      },
    };
  }

  if (shell.penetrationMm < impact.effectiveArmorMm) {
    const reason = `AP penetration ${shell.penetrationMm} mm was below effective armor ${impact.effectiveArmorMm} mm.`;
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
          penetrationMm: shell.penetrationMm,
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
        shellPenetrationMm: shell.penetrationMm,
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
  const damage = resolveFragmentDamage({
    damageOriginPoint,
    emptyEventType: "internal_damage_none",
    emptyNote: "AP penetration occurred but no fragment intersected crew or modules.",
    eventType: "internal_damage",
    eventTypeNotePrefix: "AP fragment",
    fragmentCount: getApFragmentCount(
      scenario.simulation.fragmentCountMultiplier,
      shell.penetrationMm - impact.effectiveArmorMm,
    ),
    fragmentLengthMeters: FRAGMENT_LENGTH_METERS_AP,
    fragmentTemplates: AP_FRAGMENT_DIRECTION_TEMPLATES,
    getDamage: (targetType, hitDistance) => getApInternalDamage(
      shell,
      impact.effectiveArmorMm,
      targetType,
      hitDistance,
    ),
    allowRepeatedTargetHits: true,
    hitTimeSeconds: impact.hitTimeSeconds,
    randomness: scenario.simulation.randomness,
    seed: scenario.seed,
    shell,
    tank,
    travelDirection: impact.direction,
  });
  const reason = `AP penetration ${shell.penetrationMm} mm exceeded effective armor ${impact.effectiveArmorMm} mm.`;
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
        penetrationMm: shell.penetrationMm,
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
      shellPenetrationMm: shell.penetrationMm,
      fuseSensitivityMm: null,
      explosiveMassKg: null,
      fuseStatus: "not_applicable",
      ricochet: false,
      damageOriginPoint,
      reason,
      normalizedDirection: impact.direction,
      notes: [
        ...commonNotes,
        `Generated ${damage.fragments.length} AP fragment rays from the penetration point.`,
        `Damaged modules: ${damage.damagedModules.length}. Damaged crew: ${damage.crew.length}.`,
      ],
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
  const commonNotes = [
    `Shell type: ${shell.type}.`,
    "Branch chosen: HE blast flow.",
    `Hit zone: ${impact.armorHit.zone.name}.`,
    `Impact angle: ${impact.impactAngleDeg} deg.`,
    `Effective armor: ${impact.effectiveArmorMm} mm.`,
    `Projected armor resistance for the fuse check: ${impact.normalImpactResistanceMm} mm.`,
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
          penetrationMm: shell.penetrationMm,
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
        shellPenetrationMm: shell.penetrationMm,
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
  const damage = resolveFragmentDamage({
    damageOriginPoint,
    emptyEventType: "he_fragment_damage_none",
    emptyNote: "HE detonated but no fragment ray reached crew or modules.",
    eventType: "he_fragment_damage",
    eventTypeNotePrefix: "HE fragment",
    fragmentCount: getHeFragmentCount(
      scenario.simulation.fragmentCountMultiplier,
      shell.explosiveMassKg ?? 0,
    ),
    fragmentLengthMeters: FRAGMENT_LENGTH_METERS_HE,
    fragmentTemplates: HE_FRAGMENT_DIRECTION_TEMPLATES,
    getDamage: (targetType, hitDistance) => getHeInternalDamage(
      shell,
      targetType,
      hitDistance,
    ),
    allowRepeatedTargetHits: false,
    hitTimeSeconds: impact.hitTimeSeconds,
    randomness: scenario.simulation.randomness,
    seed: scenario.seed,
    shell,
    tank,
    travelDirection: impact.direction,
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
        penetrationMm: shell.penetrationMm,
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
      shellPenetrationMm: shell.penetrationMm,
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
        `Generated ${damage.fragments.length} HE fragment rays from a shallow blast origin.`,
        `Damaged modules: ${damage.damagedModules.length}. Damaged crew: ${damage.crew.length}.`,
      ],
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
  fragmentCount: number;
  fragmentLengthMeters: number;
  fragmentTemplates: Vec3[];
  getDamage: (targetType: "crew" | "module", hitDistance: number) => number;
  allowRepeatedTargetHits: boolean;
  hitTimeSeconds: number;
  randomness: number;
  seed: number;
  shell: ShellDefinition;
  tank: TankDefinition;
  travelDirection: Vec3;
}): DamageResolution {
  const {
    damageOriginPoint,
    emptyEventType,
    emptyNote,
    eventType,
    eventTypeNotePrefix,
    fragmentCount,
    fragmentLengthMeters,
    fragmentTemplates,
    getDamage,
    allowRepeatedTargetHits,
    hitTimeSeconds,
    randomness,
    seed,
    shell,
    tank,
    travelDirection,
  } = args;
  const rng = createDeterministicRng(seed + shell.caliberMm);
  const damageByModule = new Map<string, DamageAccumulator>();
  const damageByCrew = new Map<string, DamageAccumulator>();
  const damagedTargetIds = new Set<string>();
  const fragments: FragmentPath[] = [];
  const events: SimulationEvent[] = [];
  const damageLog: DebugDamageEntry[] = [];

  for (let index = 0; index < fragmentCount; index += 1) {
    const fragmentId = `fragment_${index + 1}`;
    const fragmentDirection = createFragmentDirection(
      shell.type,
      index,
      randomness,
      rng,
      fragmentTemplates,
      travelDirection,
    );
    const fragmentEnd = roundVec3(
      addVec3(
        damageOriginPoint,
        scaleVec3(fragmentDirection, fragmentLengthMeters),
      ),
    );

    fragments.push({
      id: fragmentId,
      points: [damageOriginPoint, fragmentEnd],
    });

    const internalHit = findFirstInternalHit(
      tank,
      damageOriginPoint,
      fragmentDirection,
      fragmentLengthMeters,
    );

    if (internalHit === null) {
      continue;
    }

    if (!allowRepeatedTargetHits && damagedTargetIds.has(internalHit.id)) {
      continue;
    }

    const damage = getDamage(internalHit.kind, internalHit.distance);
    const note = `${eventTypeNotePrefix} ${fragmentId} hit ${internalHit.kind} ${internalHit.id}.`;
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
      kind: internalHit.kind,
      point: internalHit.point,
      targetId: internalHit.id,
      targetLabel: internalHit.label,
    });
    damagedTargetIds.add(internalHit.id);
    events.push({
      t: roundNumber(hitTimeSeconds + 0.01 + (index * 0.01), 6),
      type: eventType,
      position: internalHit.point,
      targetId: internalHit.id,
      damage,
      note,
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

function createFragmentDirection(
  shellType: ShellType,
  index: number,
  randomness: number,
  rng: () => number,
  templates: Vec3[],
  travelDirection: Vec3,
): Vec3 {
  const fallbackTemplate = templates[templates.length - 1];

  if (fallbackTemplate === undefined) {
    throw new Error("Fragment direction templates are not configured.");
  }

  const template = templates[index] ?? fallbackTemplate;
  const spreadScale = shellType === "HE"
    ? 0.28 + (Math.max(0, randomness) * 0.16)
    : 0.12 + (Math.max(0, randomness) * 0.08);
  const jitterScale = shellType === "HE"
    ? 0.12 + (Math.max(0, randomness) * 0.08)
    : Math.max(0, randomness) * 0.05;

  return normalizeVec3({
    x: travelDirection.x + ((template.x * spreadScale) + ((rng() - 0.5) * jitterScale)),
    y: travelDirection.y + ((template.y * spreadScale) + ((rng() - 0.5) * jitterScale)),
    z: travelDirection.z + ((template.z * spreadScale) + ((rng() - 0.5) * jitterScale)),
  });
}

function findFirstArmorHit(
  tank: TankDefinition,
  origin: Vec3,
  direction: Vec3,
): ArmorHit | null {
  let closestHit: ArmorHit | null = null;

  for (const zone of tank.armorZones) {
    const hit = intersectRayWithAabb(origin, direction, toAabb(zone.position, zone.size));

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
): InternalTargetHit | null {
  let closestHit: InternalTargetHit | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const module of tank.modules) {
    const hit = intersectRayWithAabb(
      origin,
      direction,
      toAabb(module.position, module.size),
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
    const hitboxSize = getCrewHitboxSize(crewMember);
    const hit = intersectRayWithAabb(
      origin,
      direction,
      toAabb(crewMember.position, hitboxSize),
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
  const baselineCount = Math.max(1, Math.round(3 * fragmentCountMultiplier));
  const marginBonus = penetrationMarginMm >= 25 ? 1 : 0;

  return clamp(baselineCount + marginBonus, 1, 6);
}

function getHeFragmentCount(
  fragmentCountMultiplier: number,
  explosiveMassKg: number,
): number {
  const baselineCount = Math.max(3, Math.round(4 * fragmentCountMultiplier));
  const explosiveBonus = explosiveMassKg >= 0.6 ? 2 : 1;

  return clamp(baselineCount + explosiveBonus, 3, 8);
}

function getApInternalDamage(
  shell: ShellDefinition,
  effectiveArmorMm: number,
  targetType: "crew" | "module",
  hitDistance: number,
): number {
  const baseDamage = 30 + Math.round(shell.caliberMm * 0.45);
  const surplusBonus = Math.max(
    0,
    Math.round((shell.penetrationMm - effectiveArmorMm) * 0.15),
  );
  const rangePenalty = Math.round(hitDistance * 6);
  const totalDamage = baseDamage + surplusBonus + (targetType === "crew" ? 15 : 0) - rangePenalty;

  return Math.max(1, totalDamage);
}

function getHeInternalDamage(
  shell: ShellDefinition,
  targetType: "crew" | "module",
  hitDistance: number,
): number {
  const explosiveMassKg = shell.explosiveMassKg ?? 0.1;
  const baseDamage = Math.round((explosiveMassKg * 125) + (shell.caliberMm * 0.3));
  const rangePenalty = Math.round(hitDistance * 18);
  const crewBonus = targetType === "crew" ? 12 : 0;
  const totalDamage = baseDamage + crewBonus - rangePenalty;

  return Math.max(1, totalDamage);
}
