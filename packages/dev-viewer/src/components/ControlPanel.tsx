import type { SimulationSummary } from "@tank-sim/shared";
import React from "react";

interface ControlPanelProps {
  summary: SimulationSummary | null;
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

function ControlPanel({
  summary,
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

  return (
    <aside className="control-panel">
      <div className="panel-section">
        <h2>Inputs</h2>
        <div className="control-row">
          <label>
            Result JSON
            <input
              type="file"
              accept=".json"
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => handleFileInput(event, onResultFileChange)}
            />
          </label>
        </div>
        <div className="control-row">
          <label>
            Tank JSON
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
        <p className="summary-value">Outcome: {summary?.outcome ?? "—"}</p>
        <p className="small-text">Hit zone: {summary?.hitZoneId ?? "—"}</p>
        <p className="small-text">Events: {eventCount}</p>
        <p className="small-text">Fragments: {fragmentCount}</p>
        <p className="small-text">Modules: {moduleCount}</p>
        <p className="small-text">Crew: {crewCount}</p>
      </div>
    </aside>
  );
}

export default ControlPanel;
