import { resolve } from "node:path";
import {
  createDefaultDataRoot,
  runSimulationFromFiles,
} from "./io.js";

async function main(): Promise<void> {
  const [, , scenarioArg, resultArg, debugArg] = process.argv;

  if (scenarioArg === undefined || resultArg === undefined) {
    throw new Error(
      "Usage: npm --workspace @tank-sim/sim-core run simulate -- <scenario.json> <result.json> [debug.json]",
    );
  }

  const cwd = process.cwd();
  const scenarioPath = resolve(cwd, scenarioArg);
  const resultPath = resolve(cwd, resultArg);
  const debugPath = debugArg === undefined ? undefined : resolve(cwd, debugArg);
  const dataRoot = createDefaultDataRoot(cwd);
  const output = await runSimulationFromFiles({
    dataRoot,
    scenarioPath,
    resultPath,
    ...(debugPath === undefined ? {} : { debugPath }),
  });

  console.log(`Simulation result written to ${output.resultPath}`);
  console.log(`Simulation debug written to ${output.debugPath}`);
  console.log(`Final outcome: ${output.result.summary.outcome}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown simulation failure.";
  console.error(message);
  process.exitCode = 1;
});
