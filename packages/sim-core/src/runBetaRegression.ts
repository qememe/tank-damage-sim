import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runSimulationFromFiles } from "./io.js";

interface BetaManifestScenario {
  id: string;
  name: string;
  scenarioPath: string;
  resultPath: string;
  debugPath?: string;
}

interface BetaManifest {
  scenarios: BetaManifestScenario[];
}

function getRepositoryRoot(): string {
  return resolve(process.cwd(), "../..");
}

async function loadManifest(manifestPath: string): Promise<BetaManifest> {
  const raw = await readFile(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<BetaManifest>;

  if (!Array.isArray(parsed.scenarios)) {
    throw new Error(`Invalid beta manifest at ${manifestPath}: scenarios array is missing.`);
  }

  return {
    scenarios: parsed.scenarios.map((scenario) => {
      if (
        !scenario
        || typeof scenario.id !== "string"
        || typeof scenario.name !== "string"
        || typeof scenario.scenarioPath !== "string"
        || typeof scenario.resultPath !== "string"
      ) {
        throw new Error(`Invalid beta manifest at ${manifestPath}: scenario entry is malformed.`);
      }

      return {
        id: scenario.id,
        name: scenario.name,
        scenarioPath: scenario.scenarioPath,
        resultPath: scenario.resultPath,
        ...(typeof scenario.debugPath === "string" ? { debugPath: scenario.debugPath } : {}),
      };
    }),
  };
}

async function main(): Promise<void> {
  const repositoryRoot = getRepositoryRoot();
  const dataRoot = resolve(repositoryRoot, "data");
  const manifestPath = resolve(dataRoot, "beta-content.manifest.json");
  const manifest = await loadManifest(manifestPath);
  const failures: string[] = [];

  if (manifest.scenarios.length === 0) {
    throw new Error(`No curated beta scenarios found in ${manifestPath}.`);
  }

  console.log(`Refreshing ${manifest.scenarios.length} curated beta scenario(s) from ${manifestPath}`);

  for (const scenario of manifest.scenarios) {
    const scenarioPath = resolve(dataRoot, scenario.scenarioPath);
    const resultPath = resolve(dataRoot, scenario.resultPath);
    const debugPath = resolve(
      dataRoot,
      scenario.debugPath ?? scenario.resultPath.replace(/\.json$/, ".debug.json"),
    );

    try {
      const output = await runSimulationFromFiles({
        dataRoot,
        debugPath,
        resultPath,
        scenarioPath,
      });

      console.log(
        `OK ${scenario.id} -> ${output.result.summary.outcome} (${output.result.summary.penetrationMm} mm pen, ${output.result.summary.hitZoneId ?? "no zone"})`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown simulation failure.";
      failures.push(`${scenario.id} (${scenario.name}): ${message}`);
      console.error(`FAIL ${scenario.id}: ${message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Curated beta regression failed for ${failures.length} scenario(s):\n${failures.join("\n")}`,
    );
  }

  console.log("All curated beta scenarios refreshed successfully.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown beta regression failure.";
  console.error(message);
  process.exitCode = 1;
});
