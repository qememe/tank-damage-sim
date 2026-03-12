import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import {
  DataValidationError,
  validateScenarioInput,
  validateShellDefinition,
  validateTankDefinition,
} from "@tank-sim/shared";
import type {
  ShellDefinition,
  SimulationResult,
  ScenarioInput,
  TankDefinition,
} from "@tank-sim/shared";
import type {
  SimulationDebugReport,
  SimulationRunRequest,
  SimulationRunResponse,
} from "./simulate.js";
import { runSimulation } from "./simulate.js";

export interface DataDirectories {
  dataRoot: string;
  resultsDir: string;
  scenariosDir: string;
  shellsDir: string;
  tanksDir: string;
}

export interface SimulationFileRunOptions {
  dataRoot: string;
  debugPath?: string;
  resultPath: string;
  scenarioPath: string;
}

export interface SimulationFileRunResult extends SimulationRunResponse {
  debugPath: string;
  resultPath: string;
}

export function createDataDirectories(dataRoot: string): DataDirectories {
  return {
    dataRoot,
    tanksDir: resolve(dataRoot, "tanks"),
    shellsDir: resolve(dataRoot, "shells"),
    scenariosDir: resolve(dataRoot, "scenarios"),
    resultsDir: resolve(dataRoot, "results"),
  };
}

export function createDefaultDataRoot(baseDirectory: string): string {
  return resolve(baseDirectory, "../../data");
}

export function createDefaultDebugPath(resultPath: string): string {
  const fileName = basename(resultPath);
  const extension = extname(fileName);
  const stem = extension === "" ? fileName : basename(fileName, extension);

  return resolve(dirname(resultPath), `${stem}.debug.json`);
}

export async function loadScenarioInput(
  scenarioPath: string,
): Promise<ScenarioInput> {
  return readValidatedJsonFile(scenarioPath, "scenario");
}

export async function loadShellDefinition(
  shellId: string,
  shellsDirectory: string,
): Promise<ShellDefinition> {
  return loadDefinitionById<ShellDefinition>(shellsDirectory, shellId, "shell");
}

export async function loadTankDefinition(
  tankId: string,
  tanksDirectory: string,
): Promise<TankDefinition> {
  return loadDefinitionById<TankDefinition>(tanksDirectory, tankId, "tank");
}

export async function loadSimulationRequest(
  scenarioPath: string,
  dataDirectories: DataDirectories,
): Promise<SimulationRunRequest> {
  const scenario = await loadScenarioInput(scenarioPath);
  const tank = await loadTankDefinition(scenario.tankId, dataDirectories.tanksDir);
  const shell = await loadShellDefinition(
    scenario.shellId,
    dataDirectories.shellsDir,
  );

  return {
    scenario,
    tank,
    shell,
  };
}

export async function runSimulationFromFiles(
  options: SimulationFileRunOptions,
): Promise<SimulationFileRunResult> {
  const directories = createDataDirectories(options.dataRoot);
  const request = await loadSimulationRequest(options.scenarioPath, directories);
  const response = runSimulation(request);
  const debugPath = options.debugPath ?? createDefaultDebugPath(options.resultPath);

  await writeSimulationResult(options.resultPath, response.result);
  await writeSimulationDebugReport(debugPath, response.debugReport);

  return {
    ...response,
    resultPath: options.resultPath,
    debugPath,
  };
}

export async function writeSimulationDebugReport(
  debugPath: string,
  debugReport: SimulationDebugReport,
): Promise<void> {
  await writeJsonFile(debugPath, debugReport);
}

export async function writeSimulationResult(
  resultPath: string,
  result: SimulationResult,
): Promise<void> {
  await writeJsonFile(resultPath, result);
}

async function loadDefinitionById<T extends { id: string }>(
  directory: string,
  definitionId: string,
  label: "shell" | "tank",
): Promise<T> {
  const entries = await readdir(directory);

  for (const entry of entries) {
    if (extname(entry) !== ".json") {
      continue;
    }

    const definition = await readValidatedJsonFile<T>(resolve(directory, entry), label);

    if (definition.id === definitionId) {
      return definition;
    }
  }

  throw new Error(`Could not find ${label} with id "${definitionId}" in ${directory}.`);
}

async function readValidatedJsonFile<T>(
  filePath: string,
  entityType: "scenario" | "shell" | "tank",
): Promise<T> {
  const fileContents = await readFile(filePath, "utf8");
  const rawJson = parseJsonFile(fileContents, filePath, entityType);

  if (entityType === "scenario") {
    return validateScenarioInput(rawJson, filePath) as T;
  }

  if (entityType === "shell") {
    return validateShellDefinition(rawJson, filePath) as T;
  }

  return validateTankDefinition(rawJson, filePath) as T;
}

function parseJsonFile(
  fileContents: string,
  filePath: string,
  entityType: "scenario" | "shell" | "tank",
): unknown {
  try {
    return JSON.parse(fileContents) as unknown;
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown JSON parse failure";
    throw new DataValidationError(entityType, filePath, "<root>", `contains invalid JSON (${reason})`);
  }
}

async function writeJsonFile(filePath: string, value: SimulationDebugReport | SimulationResult): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
