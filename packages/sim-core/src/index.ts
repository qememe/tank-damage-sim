export interface SimulationRunRequest {
  scenario: unknown;
}

export interface SimulationRunResponse {
  result: unknown;
  debugReport: {
    summary: string;
    notes: string[];
  };
}

export function runSimulation(
  request: SimulationRunRequest,
): SimulationRunResponse {
  return {
    result: {
      status: "not-implemented",
      scenario: request.scenario
    },
    debugReport: {
      summary: "Simulation core scaffold placeholder.",
      notes: [
        "The JSON input/output pipeline is reserved for scenario and result files.",
        "Ballistics, armor, ricochet, penetration, and damage logic are not implemented yet."
      ]
    }
  };
}
