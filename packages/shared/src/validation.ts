import type { Vec3 } from "./math.js";
import type { ScenarioInput, SimulationParameters } from "./scenario.js";
import type { ShellDefinition, ShellType } from "./shell.js";
import type {
  ArmorZone,
  CrewHitboxShapeKind,
  CrewMember,
  ExternalBoxShape,
  ExternalCylinderShape,
  ExternalShape,
  ExternalShapeKind,
  ModuleDefinition,
  TankDefinition,
} from "./tank.js";

export type ValidationEntityType = "scenario" | "shell" | "tank";

interface ValidationContext {
  entityType: ValidationEntityType;
  filePath: string;
}

type JsonObject = Record<string, unknown>;

interface NumberOptions {
  integer?: boolean;
  max?: number;
  min?: number;
}

const CREW_HITBOX_SHAPE_KINDS: CrewHitboxShapeKind[] = ["box"];
const EXTERNAL_SHAPE_KINDS: ExternalShapeKind[] = ["box", "cylinder"];
const SHELL_TYPES: ShellType[] = ["AP", "HE"];

export class DataValidationError extends Error {
  readonly entityType: ValidationEntityType;
  readonly field: string;
  readonly filePath: string;
  readonly reason: string;

  constructor(
    entityType: ValidationEntityType,
    filePath: string,
    field: string,
    reason: string,
  ) {
    super(`Invalid ${entityType} JSON at ${filePath}: ${field} ${reason}.`);
    this.name = "DataValidationError";
    this.entityType = entityType;
    this.filePath = filePath;
    this.field = field;
    this.reason = reason;
  }
}

export function validateScenarioInput(
  value: unknown,
  filePath: string,
): ScenarioInput {
  const context = createContext("scenario", filePath);
  const root = expectObject(value, context, "<root>");

  return {
    version: expectString(root.version, context, "version"),
    seed: expectNumber(root.seed, context, "seed", { integer: true }),
    tankId: expectString(root.tankId, context, "tankId"),
    shellId: expectString(root.shellId, context, "shellId"),
    distanceMeters: expectNumber(root.distanceMeters, context, "distanceMeters", {
      min: 0,
    }),
    origin: expectVec3(root.origin, context, "origin"),
    direction: expectVec3(root.direction, context, "direction", {
      requireNonZero: true,
    }),
    simulation: parseSimulationParameters(root.simulation, context, "simulation"),
  };
}

export function validateShellDefinition(
  value: unknown,
  filePath: string,
): ShellDefinition {
  const context = createContext("shell", filePath);
  const root = expectObject(value, context, "<root>");

  const type = expectEnum(root.type, context, "type", SHELL_TYPES);
  const shell: ShellDefinition = {
    id: expectString(root.id, context, "id"),
    name: expectString(root.name, context, "name"),
    type,
    caliberMm: expectNumber(root.caliberMm, context, "caliberMm", { min: 0.001 }),
    velocityMps: expectNumber(root.velocityMps, context, "velocityMps", { min: 0 }),
    penetrationMm: expectNumber(root.penetrationMm, context, "penetrationMm", {
      min: 0,
    }),
  };

  const fuseSensitivity = expectOptionalNumber(
    root.fuseSensitivity,
    context,
    "fuseSensitivity",
    { min: 0.001 },
  );

  if (fuseSensitivity !== undefined) {
    shell.fuseSensitivity = fuseSensitivity;
  }

  const explosiveMassKg = expectOptionalNumber(
    root.explosiveMassKg,
    context,
    "explosiveMassKg",
    { min: 0 },
  );

  if (explosiveMassKg !== undefined) {
    shell.explosiveMassKg = explosiveMassKg;
  }

  return shell;
}

export function validateTankDefinition(
  value: unknown,
  filePath: string,
): TankDefinition {
  const context = createContext("tank", filePath);
  const root = expectObject(value, context, "<root>");
  const armorZones = expectArray(root.armorZones, context, "armorZones").map((item, index) =>
    parseArmorZone(item, context, `armorZones[${index}]`)
  );
  const modules = expectArray(root.modules, context, "modules").map((item, index) =>
    parseModuleDefinition(item, context, `modules[${index}]`)
  );
  const crew = expectArray(root.crew, context, "crew").map((item, index) =>
    parseCrewMember(item, context, `crew[${index}]`)
  );
  const externalShapes = parseOptionalExternalShapes(
    root.externalShapes,
    context,
    "externalShapes",
  );

  assertUniqueIds(armorZones, context, "armorZones");
  assertUniqueIds(modules, context, "modules");
  assertUniqueIds(crew, context, "crew");

  if (externalShapes !== undefined) {
    assertUniqueIds(externalShapes, context, "externalShapes");
  }

  return {
    id: expectString(root.id, context, "id"),
    name: expectString(root.name, context, "name"),
    ...(root.description === undefined
      ? {}
      : { description: expectString(root.description, context, "description") }),
    armorZones,
    modules,
    crew,
    ...(externalShapes === undefined ? {} : { externalShapes }),
  };
}

function createContext(
  entityType: ValidationEntityType,
  filePath: string,
): ValidationContext {
  return {
    entityType,
    filePath,
  };
}

function parseSimulationParameters(
  value: unknown,
  context: ValidationContext,
  field: string,
): SimulationParameters {
  const root = expectObject(value, context, field);

  return {
    allowRicochet: expectBoolean(root.allowRicochet, context, `${field}.allowRicochet`),
    allowFuseFailure: expectBoolean(
      root.allowFuseFailure,
      context,
      `${field}.allowFuseFailure`,
    ),
    randomness: expectNumber(root.randomness, context, `${field}.randomness`, {
      min: 0,
      max: 1,
    }),
    fragmentCountMultiplier: expectNumber(
      root.fragmentCountMultiplier,
      context,
      `${field}.fragmentCountMultiplier`,
      { min: 0.001 },
    ),
  };
}

function parseArmorZone(
  value: unknown,
  context: ValidationContext,
  field: string,
): ArmorZone {
  const root = expectObject(value, context, field);
  const rotationDeg = parseOptionalVec3(root.rotationDeg, context, `${field}.rotationDeg`);

  return {
    id: expectString(root.id, context, `${field}.id`),
    name: expectString(root.name, context, `${field}.name`),
    thicknessMm: expectNumber(root.thicknessMm, context, `${field}.thicknessMm`, {
      min: 0.001,
    }),
    material: expectString(root.material, context, `${field}.material`),
    position: expectVec3(root.position, context, `${field}.position`),
    size: expectVec3(root.size, context, `${field}.size`, { requirePositive: true }),
    ...(rotationDeg === undefined ? {} : { rotationDeg }),
    normal: expectVec3(root.normal, context, `${field}.normal`, {
      requireNonZero: true,
    }),
  };
}

function parseModuleDefinition(
  value: unknown,
  context: ValidationContext,
  field: string,
): ModuleDefinition {
  const root = expectObject(value, context, field);
  const rotationDeg = parseOptionalVec3(root.rotationDeg, context, `${field}.rotationDeg`);

  return {
    id: expectString(root.id, context, `${field}.id`),
    type: expectString(root.type, context, `${field}.type`),
    position: expectVec3(root.position, context, `${field}.position`),
    size: expectVec3(root.size, context, `${field}.size`, { requirePositive: true }),
    ...(rotationDeg === undefined ? {} : { rotationDeg }),
    hp: expectNumber(root.hp, context, `${field}.hp`, { min: 0.001 }),
  };
}

function parseCrewMember(
  value: unknown,
  context: ValidationContext,
  field: string,
): CrewMember {
  const root = expectObject(value, context, field);
  const size = parseOptionalVec3(root.size, context, `${field}.size`, {
    requirePositive: true,
  });
  const rotationDeg = parseOptionalVec3(root.rotationDeg, context, `${field}.rotationDeg`);
  const shapeKind = expectOptionalEnum(
    root.shapeKind,
    context,
    `${field}.shapeKind`,
    CREW_HITBOX_SHAPE_KINDS,
  );

  if (shapeKind !== undefined && size === undefined) {
    throw createError(context, `${field}.size`, "is required when shapeKind is provided");
  }

  return {
    id: expectString(root.id, context, `${field}.id`),
    role: expectString(root.role, context, `${field}.role`),
    position: expectVec3(root.position, context, `${field}.position`),
    hp: expectNumber(root.hp, context, `${field}.hp`, { min: 0.001 }),
    ...(size === undefined ? {} : { size }),
    ...(shapeKind === undefined ? {} : { shapeKind }),
    ...(rotationDeg === undefined ? {} : { rotationDeg }),
  };
}

function parseOptionalExternalShapes(
  value: unknown,
  context: ValidationContext,
  field: string,
): ExternalShape[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectArray(value, context, field).map((item, index) =>
    parseExternalShape(item, context, `${field}[${index}]`)
  );
}

function parseExternalShape(
  value: unknown,
  context: ValidationContext,
  field: string,
): ExternalShape {
  const root = expectObject(value, context, field);
  const kind = expectEnum(root.kind, context, `${field}.kind`, EXTERNAL_SHAPE_KINDS);
  const rotationDeg = parseOptionalVec3(root.rotationDeg, context, `${field}.rotationDeg`);
  const color = expectOptionalString(root.color, context, `${field}.color`);
  const group = expectOptionalString(root.group, context, `${field}.group`);
  const baseShape = {
    id: expectString(root.id, context, `${field}.id`),
    kind,
    position: expectVec3(root.position, context, `${field}.position`),
    ...(rotationDeg === undefined ? {} : { rotationDeg }),
    ...(color === undefined ? {} : { color }),
    ...(group === undefined ? {} : { group }),
  };

  if (kind === "box") {
    return {
      ...baseShape,
      kind,
      size: expectVec3(root.size, context, `${field}.size`, { requirePositive: true }),
    } satisfies ExternalBoxShape;
  }

  const radialSegments = expectOptionalNumber(
    root.radialSegments,
    context,
    `${field}.radialSegments`,
    { integer: true, min: 3 },
  );

  return {
    ...baseShape,
    kind,
    radius: expectNumber(root.radius, context, `${field}.radius`, { min: 0.001 }),
    length: expectNumber(root.length, context, `${field}.length`, { min: 0.001 }),
    ...(radialSegments === undefined ? {} : { radialSegments }),
  } satisfies ExternalCylinderShape;
}

function assertUniqueIds(
  values: Array<{ id: string }>,
  context: ValidationContext,
  field: string,
): void {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value.id)) {
      throw createError(context, field, `contains duplicate id "${value.id}"`);
    }

    seen.add(value.id);
  }
}

function expectObject(
  value: unknown,
  context: ValidationContext,
  field: string,
): JsonObject {
  if (!isObject(value)) {
    throw createError(context, field, "must be an object");
  }

  return value;
}

function expectArray(
  value: unknown,
  context: ValidationContext,
  field: string,
): unknown[] {
  if (!Array.isArray(value)) {
    throw createError(context, field, "must be an array");
  }

  return value;
}

function expectString(
  value: unknown,
  context: ValidationContext,
  field: string,
): string {
  if (typeof value !== "string") {
    throw createError(context, field, "must be a string");
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw createError(context, field, "must not be empty");
  }

  return trimmed;
}

function expectOptionalString(
  value: unknown,
  context: ValidationContext,
  field: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectString(value, context, field);
}

function expectBoolean(
  value: unknown,
  context: ValidationContext,
  field: string,
): boolean {
  if (typeof value !== "boolean") {
    throw createError(context, field, "must be a boolean");
  }

  return value;
}

function expectNumber(
  value: unknown,
  context: ValidationContext,
  field: string,
  options: NumberOptions = {},
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw createError(context, field, "must be a finite number");
  }

  if (options.integer === true && !Number.isInteger(value)) {
    throw createError(context, field, "must be an integer");
  }

  if (options.min !== undefined && value < options.min) {
    throw createError(context, field, `must be >= ${options.min}`);
  }

  if (options.max !== undefined && value > options.max) {
    throw createError(context, field, `must be <= ${options.max}`);
  }

  return value;
}

function expectOptionalNumber(
  value: unknown,
  context: ValidationContext,
  field: string,
  options: NumberOptions = {},
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectNumber(value, context, field, options);
}

function expectEnum<T extends string>(
  value: unknown,
  context: ValidationContext,
  field: string,
  values: readonly T[],
): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw createError(context, field, `must be one of: ${values.join(", ")}`);
  }

  return value as T;
}

function expectOptionalEnum<T extends string>(
  value: unknown,
  context: ValidationContext,
  field: string,
  values: readonly T[],
): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectEnum(value, context, field, values);
}

function expectVec3(
  value: unknown,
  context: ValidationContext,
  field: string,
  options: { requireNonZero?: boolean; requirePositive?: boolean } = {},
): Vec3 {
  const root = expectObject(value, context, field);
  const vec3: Vec3 = {
    x: expectNumber(root.x, context, `${field}.x`),
    y: expectNumber(root.y, context, `${field}.y`),
    z: expectNumber(root.z, context, `${field}.z`),
  };

  if (options.requirePositive === true) {
    for (const axis of ["x", "y", "z"] as const) {
      if (vec3[axis] <= 0) {
        throw createError(context, `${field}.${axis}`, "must be > 0");
      }
    }
  }

  if (options.requireNonZero === true && vec3.x === 0 && vec3.y === 0 && vec3.z === 0) {
    throw createError(context, field, "must not be the zero vector");
  }

  return vec3;
}

function parseOptionalVec3(
  value: unknown,
  context: ValidationContext,
  field: string,
  options: { requireNonZero?: boolean; requirePositive?: boolean } = {},
): Vec3 | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectVec3(value, context, field, options);
}

function createError(
  context: ValidationContext,
  field: string,
  reason: string,
): DataValidationError {
  return new DataValidationError(context.entityType, context.filePath, field, reason);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
