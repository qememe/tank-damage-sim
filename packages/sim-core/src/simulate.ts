import type {
  ArmorZone,
  CrewDamageResult,
  CrewMember,
  FragmentPath,
  ModuleDamageResult,
  ModuleDefinition,
  ShellDefinition,
  SimulationEvent,
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

export interface SimulationDebugReport {
  outcome: SimulationOutcome;
  hitZoneId: string | null;
  impactAngleDeg: number | null;
  effectiveArmorMm: number | null;
  shellPenetrationMm: number;
  ricochet: boolean;
  reason: string;
  normalizedDirection: Vec3;
  notes: string[];
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
  damage: number;
  id: string;
  kind: "crew" | "module";
  point: Vec3;
}

const CREW_BOX_SIZE: Vec3 = {
  x: 0.6,
  y: 1,
  z: 0.6,
};
const FRAGMENT_LENGTH_METERS = 4;
const INTERNAL_SHELL_TRAVEL_METERS = 4;
const INTERNAL_START_OFFSET_METERS = 0.05;
const RICOCHET_ANGLE_DEGREES = 70;
const FRAGMENT_DIRECTION_TEMPLATES: Vec3[] = [
  { x: 0, y: 0, z: 0 },
  { x: 0.8, y: 0, z: 0 },
  { x: -0.8, y: 0, z: 0 },
  { x: 0, y: 0.8, z: 0 },
  { x: 0, y: -0.8, z: 0 },
  { x: 0.5, y: 0.5, z: 0 },
];

export function runSimulation(
  request: SimulationRunRequest,
): SimulationRunResponse {
  const { scenario, shell, tank } = request;
  const direction = normalizeVec3(scenario.direction);
  const armorHit = findFirstArmorHit(tank, scenario.origin, direction);

  if (armorHit === null) {
    return createMissResponse(scenario, shell, direction);
  }

  const hitZoneNormal = normalizeVec3(armorHit.zone.normal);
  const cosine = clamp(
    Math.abs(dotVec3(direction, hitZoneNormal)),
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
  const hitTimeSeconds = roundNumber(
    armorHit.distance / Math.max(shell.velocityMps, 1),
    6,
  );

  const commonSummary = {
    effectiveArmorMm,
    hitZoneId: armorHit.zone.id,
    penetrationMm: shell.penetrationMm,
    ricochet: false,
  };
  const commonDebug = {
    effectiveArmorMm,
    hitZoneId: armorHit.zone.id,
    impactAngleDeg,
    normalizedDirection: direction,
    ricochet: false,
    shellPenetrationMm: shell.penetrationMm,
  };
  const hitEvent: SimulationEvent = {
    t: hitTimeSeconds,
    type: "armor_hit",
    position: armorHit.point,
    targetId: armorHit.zone.id,
    note: `Hit armor zone ${armorHit.zone.name}.`,
  };

  if (scenario.simulation.allowRicochet && impactAngleDeg >= RICOCHET_ANGLE_DEGREES) {
    const ricochetDirection = reflectVec3(direction, hitZoneNormal);
    const ricochetEnd = roundVec3(
      addVec3(armorHit.point, scaleVec3(ricochetDirection, 3)),
    );
    const reason = `Impact angle ${impactAngleDeg} deg reached the ricochet threshold ${RICOCHET_ANGLE_DEGREES} deg.`;

    return {
      result: {
        version: scenario.version,
        seed: scenario.seed,
        summary: {
          outcome: "ricochet",
          ...commonSummary,
          ricochet: true,
        },
        events: [
          hitEvent,
          {
            t: roundNumber(hitTimeSeconds + 0.001, 6),
            type: "ricochet",
            position: armorHit.point,
            targetId: armorHit.zone.id,
            note: reason,
          },
        ],
        shellPath: [roundVec3(scenario.origin), armorHit.point, ricochetEnd],
        fragments: [],
        damagedModules: [],
        crew: [],
      },
      debugReport: {
        ...commonDebug,
        outcome: "ricochet",
        ricochet: true,
        reason,
        notes: [
          `First armor hit: ${armorHit.zone.id}.`,
          `Shell penetration: ${shell.penetrationMm} mm.`,
          "Simulation stopped after the ricochet decision.",
        ],
      },
    };
  }

  if (shell.penetrationMm < effectiveArmorMm) {
    const reason = `Shell penetration ${shell.penetrationMm} mm was below effective armor ${effectiveArmorMm} mm.`;

    return {
      result: {
        version: scenario.version,
        seed: scenario.seed,
        summary: {
          outcome: "no_penetration",
          ...commonSummary,
        },
        events: [
          hitEvent,
          {
            t: roundNumber(hitTimeSeconds + 0.001, 6),
            type: "no_penetration",
            position: armorHit.point,
            targetId: armorHit.zone.id,
            note: reason,
          },
        ],
        shellPath: [roundVec3(scenario.origin), armorHit.point],
        fragments: [],
        damagedModules: [],
        crew: [],
      },
      debugReport: {
        ...commonDebug,
        outcome: "no_penetration",
        reason,
        notes: [
          `First armor hit: ${armorHit.zone.id}.`,
          `Impact angle: ${impactAngleDeg} deg.`,
          "Simulation stopped because the armor defeated the shell.",
        ],
      },
    };
  }

  return createPenetrationResponse({
    armorHit,
    direction,
    effectiveArmorMm,
    hitEvent,
    hitTimeSeconds,
    impactAngleDeg,
    scenario,
    shell,
    tank,
  });
}

function createMissResponse(
  scenario: ScenarioInput,
  shell: ShellDefinition,
  direction: Vec3,
): SimulationRunResponse {
  const missEnd = roundVec3(
    addVec3(scenario.origin, scaleVec3(direction, scenario.distanceMeters)),
  );

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
      events: [
        {
          t: 0,
          type: "miss",
          note: "The ray did not intersect any armor zone.",
        },
      ],
      shellPath: [roundVec3(scenario.origin), missEnd],
      fragments: [],
      damagedModules: [],
      crew: [],
    },
    debugReport: {
      outcome: "miss",
      hitZoneId: null,
      impactAngleDeg: null,
      effectiveArmorMm: null,
      shellPenetrationMm: shell.penetrationMm,
      ricochet: false,
      reason: "No armor zone AABB was intersected by the incoming ray.",
      normalizedDirection: direction,
      notes: [
        "Armor zone intersection search returned no hit.",
        "No ricochet or penetration checks were applied.",
      ],
    },
  };
}

function createPenetrationResponse(args: {
  armorHit: ArmorHit;
  direction: Vec3;
  effectiveArmorMm: number;
  hitEvent: SimulationEvent;
  hitTimeSeconds: number;
  impactAngleDeg: number;
  scenario: ScenarioInput;
  shell: ShellDefinition;
  tank: TankDefinition;
}): SimulationRunResponse {
  const {
    armorHit,
    direction,
    effectiveArmorMm,
    hitEvent,
    hitTimeSeconds,
    impactAngleDeg,
    scenario,
    shell,
    tank,
  } = args;

  const shellStart = roundVec3(scenario.origin);
  const shellExit = roundVec3(
    addVec3(armorHit.point, scaleVec3(direction, INTERNAL_SHELL_TRAVEL_METERS)),
  );
  const fragmentStart = roundVec3(
    addVec3(armorHit.point, scaleVec3(direction, INTERNAL_START_OFFSET_METERS)),
  );
  const fragmentCount = getFragmentCount(
    scenario.simulation.fragmentCountMultiplier,
    shell.penetrationMm - effectiveArmorMm,
  );
  const rng = createDeterministicRng(scenario.seed);
  const damageByModule = new Map<string, number>();
  const damageByCrew = new Map<string, number>();
  const fragments: FragmentPath[] = [];
  const internalEvents: SimulationEvent[] = [];

  for (let index = 0; index < fragmentCount; index += 1) {
    const fragmentDirection = createFragmentDirection(
      direction,
      index,
      scenario.simulation.randomness,
      rng,
    );
    const fragmentEnd = roundVec3(
      addVec3(fragmentStart, scaleVec3(fragmentDirection, FRAGMENT_LENGTH_METERS)),
    );
    const fragmentId = `fragment_${index + 1}`;

    fragments.push({
      id: fragmentId,
      points: [fragmentStart, fragmentEnd],
    });

    const internalHit = findFirstInternalHit(
      tank,
      fragmentStart,
      fragmentDirection,
      FRAGMENT_LENGTH_METERS,
      shell,
      effectiveArmorMm,
    );

    if (internalHit === null) {
      continue;
    }

    if (internalHit.kind === "module") {
      damageByModule.set(
        internalHit.id,
        (damageByModule.get(internalHit.id) ?? 0) + internalHit.damage,
      );
    } else {
      damageByCrew.set(
        internalHit.id,
        (damageByCrew.get(internalHit.id) ?? 0) + internalHit.damage,
      );
    }

    internalEvents.push({
      t: roundNumber(hitTimeSeconds + 0.01 + (index * 0.01), 6),
      type: "internal_damage",
      position: internalHit.point,
      targetId: internalHit.id,
      damage: internalHit.damage,
      note: `${fragmentId} hit ${internalHit.kind} ${internalHit.id}.`,
    });
  }

  if (internalEvents.length === 0) {
    internalEvents.push({
      t: roundNumber(hitTimeSeconds + 0.01, 6),
      type: "internal_damage_none",
      note: "Penetration occurred but no fragment intersected crew or modules.",
    });
  }

  const damagedModules = buildModuleDamageResults(tank.modules, damageByModule);
  const crew = buildCrewDamageResults(tank.crew, damageByCrew);
  const reason = `Shell penetration ${shell.penetrationMm} mm exceeded effective armor ${effectiveArmorMm} mm.`;

  return {
    result: {
      version: scenario.version,
      seed: scenario.seed,
      summary: {
        outcome: "penetration",
        hitZoneId: armorHit.zone.id,
        effectiveArmorMm,
        penetrationMm: shell.penetrationMm,
        ricochet: false,
      },
      events: [
        hitEvent,
        {
          t: roundNumber(hitTimeSeconds + 0.001, 6),
          type: "penetration",
          position: armorHit.point,
          targetId: armorHit.zone.id,
          note: reason,
        },
        ...internalEvents,
      ],
      shellPath: [shellStart, armorHit.point, shellExit],
      fragments,
      damagedModules,
      crew,
    },
    debugReport: {
      outcome: "penetration",
      hitZoneId: armorHit.zone.id,
      impactAngleDeg,
      effectiveArmorMm,
      shellPenetrationMm: shell.penetrationMm,
      ricochet: false,
      reason,
      normalizedDirection: direction,
      notes: [
        `First armor hit: ${armorHit.zone.id}.`,
        `Generated ${fragmentCount} fragment rays.`,
        `Damaged modules: ${damagedModules.length}. Damaged crew: ${crew.length}.`,
      ],
    },
  };
}

function buildCrewDamageResults(
  crewMembers: CrewMember[],
  damageByCrew: Map<string, number>,
): CrewDamageResult[] {
  const results: CrewDamageResult[] = [];

  for (const crewMember of crewMembers) {
    const totalDamage = damageByCrew.get(crewMember.id);

    if (totalDamage === undefined) {
      continue;
    }

    const remainingHp = Math.max(0, crewMember.hp - totalDamage);

    results.push({
      crewId: crewMember.id,
      damage: totalDamage,
      remainingHp,
      incapacitated: remainingHp === 0,
    });
  }

  return results;
}

function buildModuleDamageResults(
  modules: ModuleDefinition[],
  damageByModule: Map<string, number>,
): ModuleDamageResult[] {
  const results: ModuleDamageResult[] = [];

  for (const module of modules) {
    const totalDamage = damageByModule.get(module.id);

    if (totalDamage === undefined) {
      continue;
    }

    const remainingHp = Math.max(0, module.hp - totalDamage);

    results.push({
      moduleId: module.id,
      damage: totalDamage,
      remainingHp,
      destroyed: remainingHp === 0,
    });
  }

  return results;
}

function createDeterministicRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;

  return () => {
    state = ((state * 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createFragmentDirection(
  direction: Vec3,
  index: number,
  randomness: number,
  rng: () => number,
): Vec3 {
  const fallbackTemplate =
    FRAGMENT_DIRECTION_TEMPLATES[FRAGMENT_DIRECTION_TEMPLATES.length - 1];

  if (fallbackTemplate === undefined) {
    throw new Error("Fragment direction templates are not configured.");
  }

  const template = FRAGMENT_DIRECTION_TEMPLATES[index] ?? fallbackTemplate;
  const spreadScale = 0.12 + (Math.max(0, randomness) * 0.08);
  const jitterScale = Math.max(0, randomness) * 0.05;

  return normalizeVec3({
    x: direction.x + ((template.x * spreadScale) + ((rng() - 0.5) * jitterScale)),
    y: direction.y + ((template.y * spreadScale) + ((rng() - 0.5) * jitterScale)),
    z: direction.z + ((template.z * spreadScale) + ((rng() - 0.5) * jitterScale)),
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
  shell: ShellDefinition,
  effectiveArmorMm: number,
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
      kind: "module",
      id: module.id,
      point: hit.point,
      damage: getInternalDamage(shell, effectiveArmorMm, "module"),
    };
  }

  for (const crewMember of tank.crew) {
    const hit = intersectRayWithAabb(
      origin,
      direction,
      toAabb(crewMember.position, CREW_BOX_SIZE),
      maxDistance,
    );

    if (hit === null || hit.distance >= closestDistance) {
      continue;
    }

    closestDistance = hit.distance;
    closestHit = {
      kind: "crew",
      id: crewMember.id,
      point: hit.point,
      damage: getInternalDamage(shell, effectiveArmorMm, "crew"),
    };
  }

  return closestHit;
}

function getFragmentCount(
  fragmentCountMultiplier: number,
  penetrationMarginMm: number,
): number {
  const baselineCount = Math.max(1, Math.round(3 * fragmentCountMultiplier));
  const marginBonus = penetrationMarginMm >= 25 ? 1 : 0;

  return clamp(baselineCount + marginBonus, 1, 6);
}

function getInternalDamage(
  shell: ShellDefinition,
  effectiveArmorMm: number,
  targetType: "crew" | "module",
): number {
  const baseDamage = 30 + Math.round(shell.caliberMm * 0.45);
  const surplusBonus = Math.max(
    0,
    Math.round((shell.penetrationMm - effectiveArmorMm) * 0.15),
  );
  const totalDamage = baseDamage + surplusBonus + (targetType === "crew" ? 15 : 0);

  return Math.max(1, totalDamage);
}
