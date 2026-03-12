import type { SimulationEvent, SimulationHitContext, SimulationSummary } from "@tank-sim/shared";
import React from "react";
import type { InspectionDamageEntry, InspectionSurfaceDamageEntry } from "../viewer/inspectionUtils";
import { formatEventType } from "../viewer/inspectionUtils";

interface ControlPanelProps {
  summary: SimulationSummary | null;
  hitContext: SimulationHitContext | null;
  loadedResultName: string | null;
  loadedTankName: string | null;
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
  toggleArmor: boolean;
  toggleModules: boolean;
  toggleCrew: boolean;
  toggleShell: boolean;
  toggleFragments: boolean;
  onToggleArmor: () => void;
  onToggleModules: () => void;
  onToggleCrew: () => void;
  onToggleShell: () => void;
  onToggleFragments: () => void;
}

const SPEED_OPTIONS = [0.25, 0.5, 1, 2];

const formatTime = (value: number) => `${value.toFixed(3)} s`;

const formatAngle = (value: number | null | undefined) => (typeof value === "number" ? `${value.toFixed(1)}°` : "—");

const formatFuseStatus = (value: SimulationHitContext["fuseStatus"] | null | undefined) => {
  if (!value || value === "not_applicable") {
    return "—";
  }
  return value;
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

function ControlPanel({
  summary,
  hitContext,
  loadedResultName,
  loadedTankName,
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
  toggleArmor,
  toggleModules,
  toggleCrew,
  toggleShell,
  toggleFragments,
  onToggleArmor,
  onToggleModules,
  onToggleCrew,
  onToggleShell,
  onToggleFragments
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

  return (
    <aside className="control-panel">
      <div className="panel-section">
        <h2>Inputs</h2>
        <p className="small-text">Load both a result JSON and a matching tank JSON for full labels and damage overlays.</p>
        <div className="file-status-grid">
          <div>
            <p className="file-status-label">Result</p>
            <p className="file-status-value">{loadedResultName ?? "Not loaded"}</p>
          </div>
          <div>
            <p className="file-status-label">Tank</p>
            <p className="file-status-value">{loadedTankName ?? "Not loaded"}</p>
          </div>
        </div>
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
            Load sample result
          </button>
          <button type="button" onClick={onLoadSampleTank}>
            Load sample tank
          </button>
        </div>
        {error && <p className="error-message">{error}</p>}
      </div>

      <div className="panel-section">
        <h2>Playback</h2>
        <div className="control-row">
          <button type="button" onClick={onPlayPause} className={isPlaying ? "active" : ""}>
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button type="button" onClick={onReset}>
            Reset
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
      </div>

      <div className="panel-section">
        <h2>Summary</h2>
        <div className="summary-grid">
          <p className="summary-key">Shell type</p>
          <p className="summary-data">{hitContext?.shellType?.toUpperCase() ?? "—"}</p>
          <p className="summary-key">Outcome</p>
          <p className="summary-data">{summary?.outcome ?? "—"}</p>
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
