export type ShellType = "AP" | "HE";

export interface ScenarioInput {
  scenarioId: string;
  attackerTankId: string;
  targetTankId: string;
  shellType: ShellType;
}

export interface SimulationEvent {
  type: string;
  timeMs: number;
  details: Record<string, unknown>;
}

export interface DebugReport {
  summary: string;
  notes: string[];
}

export interface SimulationResult {
  scenarioId: string;
  status: "not-implemented";
  events: SimulationEvent[];
  debug: DebugReport;
}
