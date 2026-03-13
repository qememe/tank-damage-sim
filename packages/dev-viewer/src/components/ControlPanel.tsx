import type {
  SimulationDebugReport,
  SimulationEvent,
  SimulationHitContext,
  SimulationSummary
} from "@tank-sim/shared";
import React from "react";
import type {
  BetaContentManifest,
  BetaManifestScenario,
  BetaManifestShell,
  BetaManifestTank
} from "../content/betaContent";
import type { InspectionDamageEntry, InspectionSurfaceDamageEntry } from "../viewer/inspectionUtils";
import { formatEventType } from "../viewer/inspectionUtils";

interface ControlPanelProps {
  betaManifest: BetaContentManifest | null;
  selectedScenarioId: string | null;
  activeScenario: BetaManifestScenario | null;
  activeTankEntry: BetaManifestTank | null;
  activeShellEntry: BetaManifestShell | null;
  contentMode: "curated" | "manual" | "sample";
  loadingScenarioId: string | null;
  defaultScenarioId: string | null;
  debugReport: SimulationDebugReport | null;
  isInitializing: boolean;
  summary: SimulationSummary | null;
  hitContext: SimulationHitContext | null;
  loadedScenarioName: string | null;
  loadedResultName: string | null;
  loadedTankName: string | null;
  loadedShellName: string | null;
  loadedDebugName: string | null;
  hitZoneLabel: string | null;
  damagedModules: InspectionDamageEntry[];
  damagedCrew: InspectionDamageEntry[];
  surfaceDamageEntries: InspectionSurfaceDamageEntry[];
  surfaceDamageKinds: string[];
  primarySurfaceDamage: InspectionSurfaceDamageEntry | null;
  events: SimulationEvent[];
  currentEventIndex: number;
  eventCount: number;
  fragmentCount: number;
  moduleCount: number;
  crewCount: number;
  currentTime: number;
  maxTime: number;
  isPlaying: boolean;
  speed: number;
  error: string | null;
  onPlayPause: () => void;
  onReset: () => void;
  onSeek: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onResultFileChange: (file: File) => void;
  onTankFileChange: (file: File) => void;
  onLoadSampleResult: () => void;
  onLoadSampleTank: () => void;
  onLoadCuratedScenario: (scenarioId: string) => void;
  onResetToDefaultScenario: () => void;
  toggleArmor: boolean;
  toggleModules: boolean;
  toggleCrew: boolean;
  toggleShell: boolean;
  toggleFragments: boolean;
  toggleExternalHull: boolean;
  toggleSurfaceDamage: boolean;
  xrayMode: boolean;
  onToggleArmor: () => void;
  onToggleModules: () => void;
  onToggleCrew: () => void;
  onToggleShell: () => void;
  onToggleFragments: () => void;
  onToggleExternalHull: () => void;
  onToggleSurfaceDamage: () => void;
  onToggleXrayMode: () => void;
}

const SPEED_OPTIONS = [0.25, 0.5, 1, 2];
const CONTENT_MODE_LABELS = {
  curated: "Curated beta pack",
  manual: "Manual dev load",
  sample: "Bundled beta fallback"
} as const;

const formatTime = (value: number) => `${value.toFixed(3)} s`;
const formatMm = (value: number | null | undefined) => (typeof value === "number" ? `${value.toFixed(3)} mm` : "—");

const formatAngle = (value: number | null | undefined) => (typeof value === "number" ? `${value.toFixed(1)}°` : "—");

const formatFuseStatus = (value: SimulationHitContext["fuseStatus"] | null | undefined) => {
  if (!value || value === "not_applicable") {
    return "—";
  }
  return value;
};

const formatOutcomeLabel = (value: string | null | undefined) => {
  if (!value) {
    return "—";
  }

  return value.replaceAll("_", " ");
};

const renderDamageList = (items: InspectionDamageEntry[], emptyText: string) => {
  if (!items.length) {
    return <p className="small-text">{emptyText}</p>;
  }

  return (
    <ul className="status-list">
      {items.map((item) => (
        <li key={item.id}>
          <span>{item.label}</span>
          <span>{item.state}</span>
        </li>
      ))}
    </ul>
  );
};

const getEventLine = (event: SimulationEvent): string => {
  const base = formatEventType(event.type);
  if (!event.targetId) {
    return base;
  }
  return `${base} -> ${event.targetId}`;
};

const summarizeFragmentTypes = (debugReport: SimulationDebugReport | null): string[] => {
  if (!debugReport?.fragmentLog.length) {
    return [];
  }

  const counts = new Map<string, { count: number; hits: number }>();

  for (const fragment of debugReport.fragmentLog) {
    const current = counts.get(fragment.fragmentType) ?? { count: 0, hits: 0 };
    current.count += 1;
    current.hits += fragment.hitCount;
    counts.set(fragment.fragmentType, current);
  }

  return [...counts.entries()].map(([type, info]) => `${type}: ${info.count} / ${info.hits} hits`);
};

const summarizeDamageTargets = (debugReport: SimulationDebugReport | null): string[] => {
  if (!debugReport?.damageLog.length) {
    return [];
  }

  const totals = new Map<string, { damage: number; hits: number; kind: string; label: string }>();

  for (const entry of debugReport.damageLog) {
    const key = `${entry.kind}:${entry.targetId}`;
    const current = totals.get(key) ?? {
      damage: 0,
      hits: 0,
      kind: entry.kind,
      label: entry.targetLabel
    };
    current.damage += entry.damage;
    current.hits += 1;
    totals.set(key, current);
  }

  return [...totals.values()]
    .sort((left, right) => right.damage - left.damage)
    .map((entry) => `${entry.kind} ${entry.label}: ${entry.damage} total over ${entry.hits} hit(s)`);
};

function ControlPanel({
  betaManifest,
  selectedScenarioId,
  activeScenario,
  activeTankEntry,
  activeShellEntry,
  contentMode,
  loadingScenarioId,
  defaultScenarioId,
  debugReport,
  isInitializing,
  summary,
  hitContext,
  loadedScenarioName,
  loadedResultName,
  loadedTankName,
  loadedShellName,
  loadedDebugName,
  hitZoneLabel,
  damagedModules,
  damagedCrew,
  surfaceDamageEntries,
  surfaceDamageKinds,
  primarySurfaceDamage,
  events,
  currentEventIndex,
  eventCount,
  fragmentCount,
  moduleCount,
  crewCount,
  currentTime,
  maxTime,
  isPlaying,
  speed,
  error,
  onPlayPause,
  onReset,
  onSeek,
  onSpeedChange,
  onResultFileChange,
  onTankFileChange,
  onLoadSampleResult,
  onLoadSampleTank,
  onLoadCuratedScenario,
  onResetToDefaultScenario,
  toggleArmor,
  toggleModules,
  toggleCrew,
  toggleShell,
  toggleFragments,
  toggleExternalHull,
  toggleSurfaceDamage,
  xrayMode,
  onToggleArmor,
  onToggleModules,
  onToggleCrew,
  onToggleShell,
  onToggleFragments,
  onToggleExternalHull,
  onToggleSurfaceDamage,
  onToggleXrayMode
}: ControlPanelProps): React.JSX.Element {
  const handleFileInput = (
    event: React.ChangeEvent<HTMLInputElement>,
    picker: (file: File) => void
  ): void => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    picker(file);
    event.target.value = "";
  };

  const sliderMax = Math.max(maxTime, 0.001);
  const currentEvent = currentEventIndex >= 0 ? events[currentEventIndex] ?? null : null;
  const featuredScenarios = betaManifest?.scenarios.filter((scenario) => scenario.featured) ?? [];
  const fragmentTypeSummary = summarizeFragmentTypes(debugReport);
  const damageTargetSummary = summarizeDamageTargets(debugReport);
  const surfaceDamageSummary = debugReport?.surfaceDamageLog ?? [];

  return (
    <aside className="control-panel">
      <div className="panel-section hero-section">
        <div className="hero-copy">
          <p className="eyebrow">Beta Browser</p>
          <h1>{betaManifest?.title ?? "Tank Damage Simulator"}</h1>
          <p className="hero-text">
            {betaManifest?.subtitle ??
              "Curated local replay pack for the current prototype damage scenarios."}
          </p>
        </div>
        <div className="mode-pill-row">
          <span className="mode-pill active">{CONTENT_MODE_LABELS[contentMode]}</span>
          {activeScenario?.featured && <span className="mode-pill">Featured case</span>}
          {activeScenario?.comparisonLabel && <span className="mode-pill">Comparison ready</span>}
        </div>
        <div className="help-grid">
          <div>
            <p className="subsection-label">What this is</p>
            <p className="small-text">
              A local beta-style launcher for curated Tank Damage Simulator replays. Pick a showcase case and the
              viewer will pair the authored tank with its matching result automatically.
            </p>
          </div>
          <div>
            <p className="subsection-label">X-ray mode</p>
            <p className="small-text">
              X-ray fades the outer shell so armor, crew, modules, shell traces, and fragment paths stay readable
              through the hull.
            </p>
          </div>
          <div>
            <p className="subsection-label">Playback</p>
            <p className="small-text">
              Use Play, Reset replay, the scrubber, and speed buttons to step through the event log and inspect where
              damage starts and propagates.
            </p>
          </div>
          <div>
            <p className="subsection-label">Dev fallback</p>
            <p className="small-text">
              Manual result and tank JSON loading remains available below for custom debug work. Reset to default
              scenario jumps back to the curated beta baseline at any time.
            </p>
          </div>
        </div>
        <div className="control-row top-actions-row">
          <button type="button" onClick={onResetToDefaultScenario} disabled={!defaultScenarioId && contentMode !== "sample"}>
            Reset to default scenario
          </button>
        </div>
      </div>

      <div className="panel-section">
        <div className="section-header">
          <div>
            <h2>Curated Scenarios</h2>
            <p className="small-text">One click loads the matching result, tank, and debug context from the beta content pack.</p>
          </div>
          {activeScenario && (
            <span className="scenario-header-tag">
              Live: {activeScenario.name}
            </span>
          )}
        </div>
        {betaManifest ? (
          <div className="scenario-category-list">
            <section className="scenario-category featured-scenarios">
              <div className="scenario-category-header">
                <div>
                  <h3>Best Showcase</h3>
                  <p className="small-text">Fast access to the strongest curated beta demos for review, capture, and reset-to-known-good checks.</p>
                </div>
                <span className="category-count">{featuredScenarios.length}</span>
              </div>
              {featuredScenarios.length ? (
                <div className="featured-button-row">
                  {featuredScenarios.map((scenario) => {
                    const isLoading = loadingScenarioId === scenario.id;
                    const isActive = selectedScenarioId === scenario.id;

                    return (
                      <button
                        key={`featured-${scenario.id}`}
                        type="button"
                        className={`featured-scenario-button${isActive ? " active" : ""}`}
                        onClick={() => onLoadCuratedScenario(scenario.id)}
                      >
                        <span>{scenario.name}</span>
                        <span>{isLoading ? "Loading..." : `${scenario.distanceMeters} m`}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="small-text">No featured curated scenarios are marked yet.</p>
              )}
            </section>
            {betaManifest.categories.map((category) => (
              <section key={category.id} className="scenario-category">
                <div className="scenario-category-header">
                  <div>
                    <h3>{category.label}</h3>
                    <p className="small-text">{category.description}</p>
                  </div>
                  <span className="category-count">{category.scenarioIds.length}</span>
                </div>
                <div className="scenario-card-list">
                  {category.scenarioIds.map((scenarioId) => {
                    const scenario = betaManifest.scenarios.find((item) => item.id === scenarioId);

                    if (!scenario) {
                      return null;
                    }

                    const tankLabel =
                      betaManifest.tanks.find((item) => item.id === scenario.tankId)?.name ?? scenario.tankId;
                    const shellLabel =
                      betaManifest.shells.find((item) => item.id === scenario.shellId)?.name ?? scenario.shellId;
                    const isLoading = loadingScenarioId === scenario.id;
                    const isActive = selectedScenarioId === scenario.id;

                    return (
                      <button
                        key={`${category.id}-${scenario.id}`}
                        type="button"
                        className={`scenario-card${isActive ? " active" : ""}`}
                        onClick={() => onLoadCuratedScenario(scenario.id)}
                      >
                        <span className="scenario-card-topline">
                          <span className="scenario-card-title">{scenario.name}</span>
                          <span className="scenario-card-outcome">{formatOutcomeLabel(scenario.expectedOutcome)}</span>
                        </span>
                        <span className="scenario-card-meta">{tankLabel} · {shellLabel} · {scenario.distanceMeters} m</span>
                        <span className="scenario-card-description">{scenario.description}</span>
                        {scenario.comparisonLabel && (
                          <span className="scenario-card-note">{scenario.comparisonLabel}</span>
                        )}
                        <span className="scenario-card-footer">
                          {isLoading ? "Loading scenario..." : isActive ? "Loaded now" : "Load scenario"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : isInitializing ? (
          <div className="state-box">
            <p className="subsection-label">Loading curated pack</p>
            <p className="small-text">Reading the beta manifest and the default showcase replay.</p>
          </div>
        ) : (
          <div className="state-box">
            <p className="subsection-label">Curated pack unavailable</p>
            <p className="small-text">The launcher could not read the curated beta manifest. Use the bundled beta fallback or manual JSON loading below.</p>
          </div>
        )}
      </div>

      <div className="panel-section">
        <h2>Content Pack</h2>
        <p className="small-text">Curated tanks and shell families included in the local beta browser.</p>
        <div className="content-browser-grid">
          <div>
            <p className="subsection-label">Tanks</p>
            <div className="content-card-list">
              {betaManifest?.tanks.map((tankEntry) => (
                <article
                  key={tankEntry.id}
                  className={`content-card${activeTankEntry?.id === tankEntry.id ? " active" : ""}`}
                >
                  <p className="content-card-title">{tankEntry.name}</p>
                  <p className="small-text">{tankEntry.description}</p>
                </article>
              )) ?? <p className="small-text">No curated tanks loaded.</p>}
            </div>
          </div>
          <div>
            <p className="subsection-label">Shells</p>
            <div className="content-card-list">
              {betaManifest?.shells.map((shellEntry) => (
                <article
                  key={shellEntry.id}
                  className={`content-card${activeShellEntry?.id === shellEntry.id ? " active" : ""}`}
                >
                  <p className="content-card-title">{shellEntry.name}</p>
                  <p className="content-card-meta-line">{shellEntry.type} · {shellEntry.caliberMm} mm</p>
                  <p className="small-text">{shellEntry.description}</p>
                </article>
              )) ?? <p className="small-text">No curated shells loaded.</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="panel-section">
        <h2>Session</h2>
        <div className="file-status-grid session-grid">
          <div>
            <p className="file-status-label">Source</p>
            <p className="file-status-value">{CONTENT_MODE_LABELS[contentMode]}</p>
          </div>
          <div>
            <p className="file-status-label">Scenario</p>
            <p className="file-status-value">{activeScenario?.name ?? loadedScenarioName ?? "Custom / none"}</p>
          </div>
          <div>
            <p className="file-status-label">Target tank</p>
            <p className="file-status-value">{activeTankEntry?.name ?? loadedTankName ?? "Custom / none"}</p>
          </div>
          <div>
            <p className="file-status-label">Shell</p>
            <p className="file-status-value">{activeShellEntry?.name ?? loadedShellName ?? "Custom / none"}</p>
          </div>
          <div>
            <p className="file-status-label">Result JSON</p>
            <p className="file-status-value">{loadedResultName ?? "Not loaded"}</p>
          </div>
          <div>
            <p className="file-status-label">Tank JSON</p>
            <p className="file-status-value">{loadedTankName ?? "Not loaded"}</p>
          </div>
          <div>
            <p className="file-status-label">Scenario JSON</p>
            <p className="file-status-value">{loadedScenarioName ?? "Curated metadata only"}</p>
          </div>
          <div>
            <p className="file-status-label">Debug JSON</p>
            <p className="file-status-value">{loadedDebugName ?? "Not linked"}</p>
          </div>
        </div>
        {activeScenario && (
          <p className="small-text">
            Expected outcome: {formatOutcomeLabel(activeScenario.expectedOutcome)}. Current replay should load the
            authored result and matching tank automatically.
          </p>
        )}
      </div>

      <div className="panel-section">
        <h2>Manual Dev Loading</h2>
        <p className="small-text">
          Fallback path for ad hoc debug work. Load a custom result JSON and a matching tank JSON manually, or snap
          back to the bundled beta fallback pair.
        </p>
        <div className="control-row">
          <label className="file-input">
            <span>Result JSON</span>
            <input
              type="file"
              accept=".json"
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => handleFileInput(event, onResultFileChange)}
            />
          </label>
        </div>
        <div className="control-row">
          <label className="file-input">
            <span>Tank JSON</span>
            <input
              type="file"
              accept=".json"
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => handleFileInput(event, onTankFileChange)}
            />
          </label>
        </div>
        <div className="control-row">
          <button type="button" onClick={onLoadSampleResult}>
            Load bundled beta result
          </button>
          <button type="button" onClick={onLoadSampleTank}>
            Load bundled beta tank
          </button>
        </div>
        {error && (
          <div className="state-box error">
            <p className="subsection-label">Load error</p>
            <p className="small-text">{error}</p>
          </div>
        )}
      </div>

      <div className="panel-section">
        <h2>Playback</h2>
        <div className="control-row">
          <button type="button" onClick={onPlayPause} className={isPlaying ? "active" : ""}>
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button type="button" onClick={onReset}>
            Reset replay
          </button>
        </div>
        <input
          className="range-slider"
          type="range"
          min={0}
          max={sliderMax}
          step={0.001}
          value={Math.min(currentTime, sliderMax)}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => onSeek(Number(event.target.value))}
        />
        <p className="summary-value">
          {formatTime(Math.min(currentTime, sliderMax))} / {formatTime(sliderMax)}
        </p>
        <p className="small-text">
          Current event: {currentEvent ? `${getEventLine(currentEvent)} @ ${formatTime(currentEvent.t)}` : "—"}
        </p>
        <div className="control-row">
          {SPEED_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={speed === option ? "active" : ""}
              onClick={() => onSpeedChange(option)}
            >
              {option}x
            </button>
          ))}
        </div>
      </div>

      <div className="panel-section">
        <h2>Visibility</h2>
        <label>
          <input type="checkbox" checked={toggleExternalHull} onChange={onToggleExternalHull} />
          External hull
        </label>
        <label>
          <input type="checkbox" checked={toggleArmor} onChange={onToggleArmor} />
          Armor
        </label>
        <label>
          <input type="checkbox" checked={toggleModules} onChange={onToggleModules} />
          Modules
        </label>
        <label>
          <input type="checkbox" checked={toggleCrew} onChange={onToggleCrew} />
          Crew
        </label>
        <label>
          <input type="checkbox" checked={toggleShell} onChange={onToggleShell} />
          Shell path
        </label>
        <label>
          <input type="checkbox" checked={toggleFragments} onChange={onToggleFragments} />
          Fragment paths
        </label>
        <label>
          <input type="checkbox" checked={toggleSurfaceDamage} onChange={onToggleSurfaceDamage} />
          Surface damage
        </label>
        <label>
          <input type="checkbox" checked={xrayMode} onChange={onToggleXrayMode} />
          X-ray mode
        </label>
      </div>

      <div className="panel-section">
        <h2>Summary</h2>
        <div className="summary-grid">
          <p className="summary-key">Shell type</p>
          <p className="summary-data">{hitContext?.shellType?.toUpperCase() ?? activeShellEntry?.type ?? "—"}</p>
          <p className="summary-key">Outcome</p>
          <p className="summary-data">{summary?.outcome ?? activeScenario?.expectedOutcome ?? "—"}</p>
          <p className="summary-key">Hit zone</p>
          <p className="summary-data">{hitZoneLabel ?? "—"}</p>
          <p className="summary-key">Impact angle</p>
          <p className="summary-data">{formatAngle(hitContext?.impactAngleDeg)}</p>
          <p className="summary-key">Fuse status</p>
          <p className="summary-data">{formatFuseStatus(hitContext?.fuseStatus)}</p>
          <p className="summary-key">Events</p>
          <p className="summary-data">{eventCount}</p>
          <p className="summary-key">Fragments</p>
          <p className="summary-data">{fragmentCount}</p>
          <p className="summary-key">Authored modules</p>
          <p className="summary-data">{moduleCount}</p>
          <p className="summary-key">Authored crew</p>
          <p className="summary-data">{crewCount}</p>
        </div>
        <p className="subsection-label">Damaged modules</p>
        {renderDamageList(damagedModules, "No module damage recorded.")}
        <p className="subsection-label">Damaged crew</p>
        {renderDamageList(damagedCrew, "No crew damage recorded.")}
      </div>

      <div className="panel-section">
        <h2>Debug Inspector</h2>
        {debugReport ? (
          <div className="inspector-stack">
            <details className="inspector-group" open>
              <summary>Hit context</summary>
              <div className="summary-grid compact">
                <p className="summary-key">Zone</p>
                <p className="summary-data">{debugReport.hitZoneName ?? "—"}</p>
                <p className="summary-key">Outcome</p>
                <p className="summary-data">{formatOutcomeLabel(debugReport.outcome)}</p>
                <p className="summary-key">Impact angle</p>
                <p className="summary-data">{formatAngle(debugReport.impactAngleDeg)}</p>
                <p className="summary-key">Effective armor</p>
                <p className="summary-data">{formatMm(debugReport.effectiveArmorMm)}</p>
                <p className="summary-key">Shot penetration</p>
                <p className="summary-data">{formatMm(debugReport.shellPenetrationMm)}</p>
              </div>
              <p className="small-text">{debugReport.reason}</p>
            </details>

            <details className="inspector-group">
              <summary>Fuse status</summary>
              <div className="summary-grid compact">
                <p className="summary-key">Fuse</p>
                <p className="summary-data">{formatFuseStatus(debugReport.fuseStatus)}</p>
                <p className="summary-key">Sensitivity</p>
                <p className="summary-data">{formatMm(debugReport.fuseSensitivityMm)}</p>
                <p className="summary-key">Projected resistance</p>
                <p className="summary-data">{formatMm(debugReport.normalImpactResistanceMm)}</p>
                <p className="summary-key">Explosive mass</p>
                <p className="summary-data">{debugReport.explosiveMassKg ? `${debugReport.explosiveMassKg.toFixed(3)} kg` : "—"}</p>
              </div>
              <p className="small-text">
                {debugReport.notes.find((note) => note.startsWith("Fuse status:")) ?? "Fuse logic is not applicable for this replay."}
              </p>
            </details>

            <details className="inspector-group">
              <summary>Damage summary</summary>
              <div className="summary-grid compact">
                <p className="summary-key">Damage events</p>
                <p className="summary-data">{debugReport.damageLog.length}</p>
                <p className="summary-key">Modules hit</p>
                <p className="summary-data">{damagedModules.length}</p>
                <p className="summary-key">Crew hit</p>
                <p className="summary-data">{damagedCrew.length}</p>
                <p className="summary-key">Ricochet</p>
                <p className="summary-data">{debugReport.ricochet ? "yes" : "no"}</p>
              </div>
              {damageTargetSummary.length ? (
                <ul className="status-list compact">
                  {damageTargetSummary.map((item) => (
                    <li key={item}>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small-text">No debug damage log was recorded for this replay.</p>
              )}
            </details>

            <details className="inspector-group">
              <summary>Fragment generation</summary>
              {debugReport.fragmentGeneration ? (
                <>
                  <div className="summary-grid compact">
                    <p className="summary-key">Branch</p>
                    <p className="summary-data">{debugReport.fragmentGeneration.branch}</p>
                    <p className="summary-key">Fragments</p>
                    <p className="summary-data">{debugReport.fragmentGeneration.fragmentCount}</p>
                    <p className="summary-key">Logged rays</p>
                    <p className="summary-data">{debugReport.fragmentLog.length}</p>
                    <p className="summary-key">Type mix</p>
                    <p className="summary-data">{fragmentTypeSummary.length ? fragmentTypeSummary.join(", ") : "—"}</p>
                  </div>
                  <p className="small-text">{debugReport.fragmentGeneration.note}</p>
                  <p className="small-text">{debugReport.fragmentGeneration.spreadHeuristic}</p>
                </>
              ) : (
                <p className="small-text">No fragment generation was recorded for this replay.</p>
              )}
            </details>

            <details className="inspector-group">
              <summary>Surface damage summary</summary>
              <div className="summary-grid compact">
                <p className="summary-key">Markers</p>
                <p className="summary-data">{surfaceDamageSummary.length}</p>
                <p className="summary-key">Kinds</p>
                <p className="summary-data">{surfaceDamageKinds.length ? surfaceDamageKinds.join(", ") : "—"}</p>
              </div>
              {surfaceDamageSummary.length ? (
                <ul className="status-list compact">
                  {surfaceDamageSummary.map((entry) => (
                    <li key={entry.id}>
                      <span>{formatEventType(entry.kind)}</span>
                      <span>{entry.linkedHitZoneId ?? "no zone"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small-text">No debug surface-damage markers were recorded.</p>
              )}
            </details>
          </div>
        ) : (
          <div className="state-box">
            <p className="subsection-label">Debug JSON not loaded</p>
            <p className="small-text">Curated scenarios and the bundled beta fallback include debug summaries. Manual file loading currently shows result-only inspection.</p>
          </div>
        )}
      </div>

      <div className="panel-section">
        <h2>Surface Damage</h2>
        <div className="summary-grid">
          <p className="summary-key">Markers</p>
          <p className="summary-data">{surfaceDamageEntries.length}</p>
          <p className="summary-key">Kinds</p>
          <p className="summary-data">{surfaceDamageKinds.length ? surfaceDamageKinds.join(", ") : "—"}</p>
          <p className="summary-key">Focus marker</p>
          <p className="summary-data">
            {primarySurfaceDamage ? `${primarySurfaceDamage.kind} (${primarySurfaceDamage.id})` : "—"}
          </p>
          <p className="summary-key">Focus radius</p>
          <p className="summary-data">{primarySurfaceDamage?.radius ?? "—"}</p>
        </div>
        {primarySurfaceDamage?.zoneId && (
          <p className="small-text">Linked zone: {primarySurfaceDamage.zoneId}</p>
        )}
        {primarySurfaceDamage?.note && (
          <p className="small-text">{primarySurfaceDamage.note}</p>
        )}
      </div>

      <div className="panel-section">
        <h2>Legend</h2>
        <ul className="legend-list">
          <li><span className="legend-swatch legend-armor" />Armor</li>
          <li><span className="legend-swatch legend-module" />Module</li>
          <li><span className="legend-swatch legend-crew" />Crew</li>
          <li><span className="legend-swatch legend-module-damaged" />Damaged module</li>
          <li><span className="legend-swatch legend-crew-damaged" />Damaged crew</li>
          <li><span className="legend-swatch legend-shell" />Shell path</li>
          <li><span className="legend-swatch legend-fragment" />Fragment paths</li>
          <li><span className="legend-swatch legend-impact" />Impact point</li>
          <li><span className="legend-swatch legend-origin" />Damage origin point</li>
          <li><span className="legend-swatch legend-impact-mark" />Impact mark</li>
          <li><span className="legend-swatch legend-penetration-hole" />Penetration hole</li>
          <li><span className="legend-swatch legend-ricochet-scar" />Ricochet scar</li>
          <li><span className="legend-swatch legend-detonation-scorch" />HE scorch</li>
          <li><span className="legend-swatch legend-dent" />Dent</li>
        </ul>
      </div>

      <div className="panel-section panel-section-grow">
        <h2>Event Timeline</h2>
        {events.length ? (
          <ul className="event-list">
            {events.map((event, index) => (
              <li key={`${event.type}-${event.t}-${index}`} className={index === currentEventIndex ? "active" : ""}>
                <span className="event-time">{formatTime(event.t)}</span>
                <span className="event-label">{getEventLine(event)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small-text">No events in the loaded result.</p>
        )}
      </div>
    </aside>
  );
}

export default ControlPanel;
