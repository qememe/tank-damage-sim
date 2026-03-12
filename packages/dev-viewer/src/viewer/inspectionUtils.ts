import type {
  CrewDamageResult,
  ModuleDamageResult,
  SurfaceDamage,
  SimulationEvent,
  SimulationResult,
  TankDefinition,
  Vec3
} from "@tank-sim/shared";

export interface InspectionDamageEntry {
  id: string;
  label: string;
  state: string;
  note: string | null;
}

export interface InspectionSurfaceDamageEntry {
  id: string;
  kind: string;
  zoneId: string | null;
  radius: string;
  note: string | null;
}

const titleCase = (value: string): string =>
  value.replace(/[_-]+/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());

export const formatTokenLabel = (value: string | null | undefined): string => {
  if (!value) {
    return "Unknown";
  }
  return titleCase(value.trim());
};

export const formatEventType = (value: string): string => titleCase(value);

export const formatSurfaceDamageKind = (value: SurfaceDamage["kind"]): string => titleCase(value);

const findZoneName = (result: SimulationResult | null, tank: TankDefinition | null): string | null => {
  if (result?.hitContext?.hitZoneName) {
    return result.hitContext.hitZoneName;
  }
  if (!result?.summary.hitZoneId || !tank?.armorZones?.length) {
    return null;
  }
  return tank.armorZones.find((zone) => zone.id === result.summary.hitZoneId)?.name ?? null;
};

export const getHitZoneLabel = (result: SimulationResult | null, tank: TankDefinition | null): string | null => {
  const zoneName = findZoneName(result, tank);
  if (!result?.summary.hitZoneId) {
    return zoneName;
  }
  if (!zoneName) {
    return formatTokenLabel(result.summary.hitZoneId);
  }
  return `${zoneName} (${result.summary.hitZoneId})`;
};

export const getImpactPoint = (result: SimulationResult | null): Vec3 | null => {
  if (result?.hitContext?.impactPoint) {
    return result.hitContext.impactPoint;
  }
  return result?.events.find((event) => event.type === "armor_hit" && event.position)?.position ?? null;
};

export const getDamageOriginPoint = (result: SimulationResult | null): Vec3 | null => {
  if (result?.hitContext?.damageOriginPoint) {
    return result.hitContext.damageOriginPoint;
  }
  return result?.fragments[0]?.points[0] ?? result?.events.find((event) => event.type === "internal_damage" && event.position)?.position ?? null;
};

const buildModuleEntry = (damage: ModuleDamageResult, tank: TankDefinition | null): InspectionDamageEntry => {
  const moduleDefinition = tank?.modules.find((module) => module.id === damage.moduleId);
  return {
    id: damage.moduleId,
    label: damage.label ?? formatTokenLabel(moduleDefinition?.id ?? damage.moduleId),
    state: damage.destroyed ? "destroyed" : `${Math.max(damage.remainingHp, 0)} hp left`,
    note: damage.note ?? null
  };
};

const buildCrewEntry = (damage: CrewDamageResult, tank: TankDefinition | null): InspectionDamageEntry => {
  const crewMember = tank?.crew.find((member) => member.id === damage.crewId);
  return {
    id: damage.crewId,
    label: damage.label ?? formatTokenLabel(crewMember?.role ?? damage.crewId),
    state: damage.incapacitated ? "incapacitated" : `${Math.max(damage.remainingHp, 0)} hp left`,
    note: damage.note ?? null
  };
};

export const getDamagedModules = (
  result: SimulationResult | null,
  tank: TankDefinition | null
): InspectionDamageEntry[] => (result?.damagedModules ?? []).map((damage) => buildModuleEntry(damage, tank));

export const getDamagedCrew = (
  result: SimulationResult | null,
  tank: TankDefinition | null
): InspectionDamageEntry[] => (result?.crew ?? []).map((damage) => buildCrewEntry(damage, tank));

const surfaceDamagePriority: Record<SurfaceDamage["kind"], number> = {
  penetration_hole: 0,
  spall_exit: 1,
  detonation_scorch: 2,
  ricochet_scar: 3,
  dent: 4,
  impact_mark: 5
};

const buildSurfaceDamageEntry = (damage: SurfaceDamage): InspectionSurfaceDamageEntry => ({
  id: damage.id,
  kind: formatSurfaceDamageKind(damage.kind),
  zoneId: damage.relatedArmorZoneId ?? null,
  radius: `${damage.radius.toFixed(3)} m`,
  note: damage.note ?? null
});

export const getSurfaceDamageEntries = (
  result: SimulationResult | null
): InspectionSurfaceDamageEntry[] => (result?.surfaceDamage ?? []).map((damage) => buildSurfaceDamageEntry(damage));

export const getSurfaceDamageKinds = (result: SimulationResult | null): string[] =>
  Array.from(new Set((result?.surfaceDamage ?? []).map((damage) => formatSurfaceDamageKind(damage.kind))));

export const getPrimarySurfaceDamage = (
  result: SimulationResult | null
): InspectionSurfaceDamageEntry | null => {
  const primary = [...(result?.surfaceDamage ?? [])].sort(
    (left, right) => surfaceDamagePriority[left.kind] - surfaceDamagePriority[right.kind]
  )[0];

  if (!primary) {
    return null;
  }

  return buildSurfaceDamageEntry(primary);
};

export const getNearestEventIndex = (events: SimulationEvent[], currentTime: number): number => {
  if (!events.length) {
    return -1;
  }

  const latestPastIndex = events.reduce((selectedIndex, event, index) => {
    if (event.t <= currentTime) {
      return index;
    }
    return selectedIndex;
  }, -1);

  if (latestPastIndex >= 0) {
    return latestPastIndex;
  }

  return 0;
};
