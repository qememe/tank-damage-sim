import type { SimulationDebugReport, SimulationResult, TankDefinition } from "@tank-sim/shared";

export interface BetaManifestTank {
  id: string;
  name: string;
  description: string;
  path: string;
}

export interface BetaManifestShell {
  id: string;
  name: string;
  type: "AP" | "HE";
  caliberMm: number;
  description: string;
  path: string;
}

export interface BetaManifestCategory {
  id: string;
  label: string;
  description: string;
  scenarioIds: string[];
}

export interface BetaManifestScenario {
  id: string;
  name: string;
  tankId: string;
  shellId: string;
  distanceMeters: number;
  expectedOutcome: string;
  description: string;
  scenarioPath: string;
  resultPath: string;
  debugPath?: string;
  featured?: boolean;
  comparisonLabel?: string;
}

export interface BetaContentManifest {
  version: string;
  title: string;
  subtitle: string;
  defaultScenarioId: string;
  tanks: BetaManifestTank[];
  shells: BetaManifestShell[];
  categories: BetaManifestCategory[];
  scenarios: BetaManifestScenario[];
}

export interface LoadedBetaScenario {
  scenario: BetaManifestScenario;
  tank: TankDefinition;
  result: SimulationResult;
  debugReport: SimulationDebugReport | null;
}

export interface LoadedBundledFallback {
  debugFileName: string;
  debugReport: SimulationDebugReport;
  result: SimulationResult;
  resultFileName: string;
  scenarioFileName: string;
  shellFileName: string;
  tank: TankDefinition;
  tankFileName: string;
}

const BUNDLED_FALLBACK = {
  debugFileName: "beta_a_ap75_frontal_penetration.result.debug.json",
  debugPath: "results/beta_a_ap75_frontal_penetration.result.debug.json",
  resultFileName: "beta_a_ap75_frontal_penetration.result.json",
  resultPath: "results/beta_a_ap75_frontal_penetration.result.json",
  scenarioFileName: "beta_a_ap75_frontal_penetration.json",
  shellFileName: "ap_75mm.json",
  tankFileName: "test_tank_a.json",
  tankPath: "tanks/test_tank_a.json"
} as const;

const getContentPath = (path: string): string => {
  if (!path.startsWith("/")) {
    return `/${path}`;
  }

  return path;
};

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(getContentPath(path));

  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status}`);
  }

  return (await response.json()) as T;
}

export function getFileNameFromPath(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }

  const segments = path.split("/");
  return segments[segments.length - 1] ?? null;
}

export async function loadBetaManifest(): Promise<BetaContentManifest> {
  return fetchJson<BetaContentManifest>("beta-content.manifest.json");
}

export async function loadBetaScenario(
  manifest: BetaContentManifest,
  scenarioId: string
): Promise<LoadedBetaScenario> {
  const scenario = manifest.scenarios.find((item) => item.id === scenarioId);

  if (!scenario) {
    throw new Error(`Unknown curated scenario "${scenarioId}"`);
  }

  const tank = manifest.tanks.find((item) => item.id === scenario.tankId);

  if (!tank) {
    throw new Error(`Scenario "${scenarioId}" points to missing tank "${scenario.tankId}"`);
  }

  const [tankData, resultData, debugReport] = await Promise.all([
    fetchJson<TankDefinition>(tank.path),
    fetchJson<SimulationResult>(scenario.resultPath),
    scenario.debugPath ? fetchJson<SimulationDebugReport>(scenario.debugPath) : Promise.resolve(null)
  ]);

  return {
    scenario,
    tank: tankData,
    result: resultData,
    debugReport
  };
}

export async function loadBundledFallback(): Promise<LoadedBundledFallback> {
  const [tank, result, debugReport] = await Promise.all([
    fetchJson<TankDefinition>(BUNDLED_FALLBACK.tankPath),
    fetchJson<SimulationResult>(BUNDLED_FALLBACK.resultPath),
    fetchJson<SimulationDebugReport>(BUNDLED_FALLBACK.debugPath)
  ]);

  return {
    debugFileName: BUNDLED_FALLBACK.debugFileName,
    debugReport,
    result,
    resultFileName: BUNDLED_FALLBACK.resultFileName,
    scenarioFileName: BUNDLED_FALLBACK.scenarioFileName,
    shellFileName: BUNDLED_FALLBACK.shellFileName,
    tank,
    tankFileName: BUNDLED_FALLBACK.tankFileName
  };
}
