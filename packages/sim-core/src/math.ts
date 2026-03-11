import type { AABB, Vec3 } from "@tank-sim/shared";

export interface RayIntersection {
  distance: number;
  point: Vec3;
}

const EPSILON = 0.000001;

export function addVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
  };
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

export function degreesFromRadians(value: number): number {
  return (value * 180) / Math.PI;
}

export function dotVec3(a: Vec3, b: Vec3): number {
  return (a.x * b.x) + (a.y * b.y) + (a.z * b.z);
}

export function intersectRayWithAabb(
  origin: Vec3,
  direction: Vec3,
  box: AABB,
  maxDistance: number = Number.POSITIVE_INFINITY,
): RayIntersection | null {
  let tMin = 0;
  let tMax = maxDistance;

  const axes: Array<keyof Vec3> = ["x", "y", "z"];

  for (const axis of axes) {
    const directionValue = direction[axis];
    const originValue = origin[axis];
    const minValue = box.min[axis];
    const maxValue = box.max[axis];

    if (Math.abs(directionValue) < EPSILON) {
      if (originValue < minValue || originValue > maxValue) {
        return null;
      }

      continue;
    }

    const nearDistance = (minValue - originValue) / directionValue;
    const farDistance = (maxValue - originValue) / directionValue;

    const axisNear = Math.min(nearDistance, farDistance);
    const axisFar = Math.max(nearDistance, farDistance);

    tMin = Math.max(tMin, axisNear);
    tMax = Math.min(tMax, axisFar);

    if (tMin > tMax) {
      return null;
    }
  }

  if (tMax < 0) {
    return null;
  }

  const distance = tMin >= 0 ? tMin : tMax;

  if (distance < 0 || distance > maxDistance) {
    return null;
  }

  return {
    distance,
    point: roundVec3(addVec3(origin, scaleVec3(direction, distance))),
  };
}

export function normalizeVec3(vector: Vec3): Vec3 {
  const length = Math.sqrt(dotVec3(vector, vector));

  if (length < EPSILON) {
    throw new Error("Scenario direction must be a non-zero vector.");
  }

  return roundVec3({
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  });
}

export function reflectVec3(direction: Vec3, normal: Vec3): Vec3 {
  const unitNormal = normalizeVec3(normal);
  const factor = 2 * dotVec3(direction, unitNormal);

  return normalizeVec3(subtractVec3(direction, scaleVec3(unitNormal, factor)));
}

export function roundNumber(value: number, digits: number = 3): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function roundVec3(vector: Vec3, digits: number = 3): Vec3 {
  return {
    x: roundNumber(vector.x, digits),
    y: roundNumber(vector.y, digits),
    z: roundNumber(vector.z, digits),
  };
}

export function scaleVec3(vector: Vec3, scalar: number): Vec3 {
  return {
    x: vector.x * scalar,
    y: vector.y * scalar,
    z: vector.z * scalar,
  };
}

export function subtractVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  };
}

export function toAabb(position: Vec3, size: Vec3): AABB {
  return {
    min: {
      x: position.x - (size.x / 2),
      y: position.y - (size.y / 2),
      z: position.z - (size.z / 2),
    },
    max: {
      x: position.x + (size.x / 2),
      y: position.y + (size.y / 2),
      z: position.z + (size.z / 2),
    },
  };
}
