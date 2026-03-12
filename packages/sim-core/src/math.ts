import type { AABB, Vec3 } from "@tank-sim/shared";

export interface RayIntersection {
  distance: number;
  localNormal?: Vec3;
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

export function rotateVec3(vector: Vec3, rotationDeg?: Vec3): Vec3 {
  if (rotationDeg === undefined) {
    return { ...vector };
  }

  const xRadians = toRadians(rotationDeg.x);
  const yRadians = toRadians(rotationDeg.y);
  const zRadians = toRadians(rotationDeg.z);

  const rotatedAroundX = rotateAroundX(vector, xRadians);
  const rotatedAroundY = rotateAroundY(rotatedAroundX, yRadians);
  return rotateAroundZ(rotatedAroundY, zRadians);
}

export function inverseRotateVec3(vector: Vec3, rotationDeg?: Vec3): Vec3 {
  if (rotationDeg === undefined) {
    return { ...vector };
  }

  const zRadians = -toRadians(rotationDeg.z);
  const yRadians = -toRadians(rotationDeg.y);
  const xRadians = -toRadians(rotationDeg.x);

  const rotatedAroundZ = rotateAroundZ(vector, zRadians);
  const rotatedAroundY = rotateAroundY(rotatedAroundZ, yRadians);
  return rotateAroundX(rotatedAroundY, xRadians);
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

export function intersectRayWithOrientedBox(
  origin: Vec3,
  direction: Vec3,
  position: Vec3,
  size: Vec3,
  rotationDeg?: Vec3,
  maxDistance: number = Number.POSITIVE_INFINITY,
): RayIntersection | null {
  const halfExtents = {
    x: size.x / 2,
    y: size.y / 2,
    z: size.z / 2,
  };
  const localOrigin = inverseRotateVec3(subtractVec3(origin, position), rotationDeg);
  const localDirection = inverseRotateVec3(direction, rotationDeg);
  const localHit = intersectRayWithAabb(
    localOrigin,
    localDirection,
    {
      min: {
        x: -halfExtents.x,
        y: -halfExtents.y,
        z: -halfExtents.z,
      },
      max: {
        x: halfExtents.x,
        y: halfExtents.y,
        z: halfExtents.z,
      },
    },
    maxDistance,
  );

  if (localHit === null) {
    return null;
  }

  const localNormal = getLocalBoxFaceNormal(
    subtractVec3(localHit.point, localOrigin),
    localHit.point,
    halfExtents,
  );

  return {
    distance: localHit.distance,
    point: roundVec3(addVec3(position, rotateVec3(localHit.point, rotationDeg))),
    localNormal,
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

function getLocalBoxFaceNormal(
  localDirection: Vec3,
  localPoint: Vec3,
  halfExtents: Vec3,
): Vec3 {
  const axisDistances = [
    {
      axis: "x",
      distance: Math.abs(Math.abs(localPoint.x) - halfExtents.x),
      sign: localPoint.x >= 0 ? 1 : -1,
    },
    {
      axis: "y",
      distance: Math.abs(Math.abs(localPoint.y) - halfExtents.y),
      sign: localPoint.y >= 0 ? 1 : -1,
    },
    {
      axis: "z",
      distance: Math.abs(Math.abs(localPoint.z) - halfExtents.z),
      sign: localPoint.z >= 0 ? 1 : -1,
    },
  ] as const;
  const closestFace = axisDistances.reduce((closest, candidate) =>
    candidate.distance < closest.distance ? candidate : closest
  );

  if (closestFace.axis === "x") {
    return {
      x: closestFace.sign,
      y: 0,
      z: 0,
    };
  }

  if (closestFace.axis === "y") {
    return {
      x: 0,
      y: closestFace.sign,
      z: 0,
    };
  }

  if (Math.abs(localDirection.z) < EPSILON && axisDistances[2].distance > EPSILON) {
    return {
      x: 0,
      y: 0,
      z: 1,
    };
  }

  return {
    x: 0,
    y: 0,
    z: closestFace.sign,
  };
}

function rotateAroundX(vector: Vec3, radians: number): Vec3 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  return {
    x: vector.x,
    y: (vector.y * cosine) - (vector.z * sine),
    z: (vector.y * sine) + (vector.z * cosine),
  };
}

function rotateAroundY(vector: Vec3, radians: number): Vec3 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  return {
    x: (vector.x * cosine) + (vector.z * sine),
    y: vector.y,
    z: (-vector.x * sine) + (vector.z * cosine),
  };
}

function rotateAroundZ(vector: Vec3, radians: number): Vec3 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  return {
    x: (vector.x * cosine) - (vector.y * sine),
    y: (vector.x * sine) + (vector.y * cosine),
    z: vector.z,
  };
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}
