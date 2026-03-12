import type { Vec3 } from "./math.js";

export interface SimulationParameters {
  allowRicochet: boolean;
  allowFuseFailure: boolean;
  randomness: number;
  fragmentCountMultiplier: number;
}

export interface ScenarioInput {
  version: string;
  seed: number;
  tankId: string;
  shellId: string;
  distanceMeters: number;
  origin: Vec3;
  direction: Vec3;
  simulation: SimulationParameters;
}
