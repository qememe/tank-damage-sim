import type { SimulationEvent, SimulationResult, Vec3 } from "@tank-sim/shared";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const distance = (a: Vec3, b: Vec3) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

export const getMaxEventTime = (result: SimulationResult | null): number => {
  if (!result?.events?.length) {
    return 0.1;
  }
  const maxT = result.events.reduce((max, event) => {
    if (typeof event.t === "number") {
      return Math.max(max, event.t);
    }
    return max;
  }, 0);
  return Math.max(maxT, 0.1);
};

export const mapFragmentAppearanceTimes = (events: SimulationEvent[]): Record<string, number> => {
  const map: Record<string, number> = {};
  const fragmentRegex = /(fragment_[0-9a-zA-Z_-]+)/i;
  events.forEach((event) => {
    if (!event.note) {
      return;
    }
    const match = event.note.match(fragmentRegex);
    if (!match) {
      return;
    }
    const fragmentId = match[1];
    if (!fragmentId) {
      return;
    }
    const eventTime = typeof event.t === "number" ? event.t : 0;
    const previousTime = map[fragmentId];
    if (previousTime === undefined || eventTime < previousTime) {
      map[fragmentId] = eventTime;
    }
  });
  return map;
};

export const getPartialPathPoints = (points: Vec3[], ratio: number): Vec3[] => {
  const firstPoint = points[0];
  if (!firstPoint) {
    return [];
  }
  if (points.length < 2) {
    return [firstPoint];
  }

  const secondPoint = points[1];
  if (!secondPoint) {
    return [firstPoint];
  }

  const normalizedRatio = clamp(ratio, 0, 1);
  if (normalizedRatio === 0) {
    return [firstPoint, secondPoint];
  }
  const totalLength = points.reduce((acc, point, index) => {
    if (index === 0) {
      return 0;
    }
    const previousPoint = points[index - 1];
    if (!previousPoint) {
      return acc;
    }
    return acc + distance(previousPoint, point);
  }, 0);
  if (totalLength === 0) {
    return [firstPoint];
  }
  const targetLength = normalizedRatio * totalLength;
  const partial: Vec3[] = [firstPoint];
  let accumulated = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const next = points[i];
    if (!prev || !next) {
      continue;
    }
    const segmentLength = distance(prev, next);
    if (accumulated + segmentLength >= targetLength) {
      const remaining = targetLength - accumulated;
      const ratioOnSegment = segmentLength === 0 ? 0 : remaining / segmentLength;
      partial.push({
        x: prev.x + (next.x - prev.x) * ratioOnSegment,
        y: prev.y + (next.y - prev.y) * ratioOnSegment,
        z: prev.z + (next.z - prev.z) * ratioOnSegment
      });
      return partial;
    }
    partial.push(next);
    accumulated += segmentLength;
  }
  return points.slice();
};

export const buildLinePositions = (points: Vec3[]): Float32Array => {
  const buffer = new Float32Array(points.length * 3);
  points.forEach((point, index) => {
    const offset = index * 3;
    buffer[offset] = point.x;
    buffer[offset + 1] = point.y;
    buffer[offset + 2] = point.z;
  });
  return buffer;
};
