import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { SimulationResult, TankDefinition } from "@tank-sim/shared";
import ControlPanel from "./components/ControlPanel";
import SimulationScene from "./viewer/SimulationScene";
import sampleResultData from "./sample/sample-result.json";
import sampleTankData from "./sample/sample-tank.json";
import { getMaxEventTime } from "./loaders/timeUtils";
import { usePlayback } from "./hooks/usePlayback";
import {
  formatEventType,
  getDamagedCrew,
  getDamagedModules,
  getHitZoneLabel,
  getNearestEventIndex,
  getPrimarySurfaceDamage,
  getSurfaceDamageEntries,
  getSurfaceDamageKinds
} from "./viewer/inspectionUtils";

const sampleResult = sampleResultData as SimulationResult;
const sampleTank = sampleTankData as TankDefinition;
const sampleResultFileName = "sample-result.json";
const sampleTankFileName = "sample-tank.json";

type VisibilityState = {
  externalHull: boolean;
  armor: boolean;
  modules: boolean;
  crew: boolean;
  shell: boolean;
  fragments: boolean;
  surfaceDamage: boolean;
  xrayMode: boolean;
};

const defaultVisibility: VisibilityState = {
  externalHull: true,
  armor: true,
  modules: true,
  crew: true,
  shell: true,
  fragments: true,
  surfaceDamage: true,
  xrayMode: false
};

function App(): React.JSX.Element {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [tank, setTank] = useState<TankDefinition | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [visibility, setVisibility] = useState(defaultVisibility);
  const [error, setError] = useState<string | null>(null);
  const [resultFileName, setResultFileName] = useState<string | null>(null);
  const [tankFileName, setTankFileName] = useState<string | null>(null);

  const maxTime = useMemo(() => getMaxEventTime(result), [result]);
  const handlePlaybackFinish = useCallback(() => setIsPlaying(false), []);

  usePlayback({
    isPlaying,
    speed,
    maxTime,
    currentTime,
    setTime: setCurrentTime,
    onFinish: handlePlaybackFinish
  });

  useEffect(() => {
    setResult(sampleResult);
    setTank(sampleTank);
    setResultFileName(sampleResultFileName);
    setTankFileName(sampleTankFileName);
  }, []);

  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(false);
  }, [result, maxTime]);

  const readJsonFile = useCallback((file: File): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          resolve(parsed);
        } catch {
          reject(new Error("Invalid JSON"));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  }, []);

  const handleResultFile = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const parsed = (await readJsonFile(file)) as SimulationResult;
        setResult(parsed);
        setResultFileName(file.name);
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [readJsonFile]
  );

  const handleTankFile = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const parsed = (await readJsonFile(file)) as TankDefinition;
        setTank(parsed);
        setTankFileName(file.name);
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [readJsonFile]
  );

  const handleLoadSampleResult = () => {
    setError(null);
    setResult(sampleResult);
    setResultFileName(sampleResultFileName);
  };

  const handleLoadSampleTank = () => {
    setError(null);
    setTank(sampleTank);
    setTankFileName(sampleTankFileName);
  };

  const handleSeek = (time: number) => {
    setIsPlaying(false);
    setCurrentTime(Math.min(time, maxTime));
  };

  const toggleVisibility = (key: keyof VisibilityState) => {
    setVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const moduleCount = tank?.modules?.length ?? 0;
  const crewCount = tank?.crew?.length ?? 0;
  const fragmentCount = result?.fragments?.length ?? 0;
  const eventCount = result?.events?.length ?? 0;
  const hitZoneLabel = useMemo(() => getHitZoneLabel(result, tank), [result, tank]);
  const damagedModules = useMemo(() => getDamagedModules(result, tank), [result, tank]);
  const damagedCrew = useMemo(() => getDamagedCrew(result, tank), [result, tank]);
  const surfaceDamageEntries = useMemo(() => getSurfaceDamageEntries(result), [result]);
  const surfaceDamageKinds = useMemo(() => getSurfaceDamageKinds(result), [result]);
  const primarySurfaceDamage = useMemo(() => getPrimarySurfaceDamage(result), [result]);
  const currentEventIndex = useMemo(
    () => getNearestEventIndex(result?.events ?? [], currentTime),
    [result?.events, currentTime]
  );
  const currentEvent = currentEventIndex >= 0 ? result?.events[currentEventIndex] ?? null : null;
  const currentEventLabel = currentEvent ? formatEventType(currentEvent.type) : "No events";
  const shellTypeLabel = result?.hitContext?.shellType?.toUpperCase() ?? "—";
  const fuseStatusLabel =
    result?.hitContext?.fuseStatus && result.hitContext.fuseStatus !== "not_applicable"
      ? result.hitContext.fuseStatus
      : "—";

  return (
    <div className="app-shell">
      <div className="viewer-column">
        <SimulationScene
          result={result}
          tank={tank}
          currentTime={currentTime}
          maxTime={maxTime}
          showExternalHull={visibility.externalHull}
          showArmor={visibility.armor}
          showModules={visibility.modules}
          showCrew={visibility.crew}
          showShellPath={visibility.shell}
          showFragments={visibility.fragments}
          showSurfaceDamage={visibility.surfaceDamage}
          xrayMode={visibility.xrayMode}
        />
        <div className="viewer-hud">
          <p className="viewer-hud-title">Inspection</p>
          <div className="viewer-hud-row">
            <span className="hud-pill">Shell {shellTypeLabel}</span>
            <span className="hud-pill">Outcome {result?.summary.outcome ?? "—"}</span>
          </div>
          <div className="viewer-hud-row">
            <span className="hud-pill">Fuse {fuseStatusLabel}</span>
            <span className="hud-pill">Zone {hitZoneLabel ?? "—"}</span>
          </div>
          <p className="viewer-hud-event">
            {currentEventLabel}
            {currentEvent?.targetId ? ` -> ${currentEvent.targetId}` : ""}
          </p>
        </div>
      </div>
      <ControlPanel
        summary={result?.summary ?? null}
        hitContext={result?.hitContext ?? null}
        loadedResultName={resultFileName}
        loadedTankName={tankFileName}
        hitZoneLabel={hitZoneLabel}
        damagedModules={damagedModules}
        damagedCrew={damagedCrew}
        surfaceDamageEntries={surfaceDamageEntries}
        surfaceDamageKinds={surfaceDamageKinds}
        primarySurfaceDamage={primarySurfaceDamage}
        events={result?.events ?? []}
        currentEventIndex={currentEventIndex}
        eventCount={eventCount}
        fragmentCount={fragmentCount}
        moduleCount={moduleCount}
        crewCount={crewCount}
        currentTime={currentTime}
        maxTime={maxTime}
        isPlaying={isPlaying}
        speed={speed}
        error={error}
        onPlayPause={() => setIsPlaying((prev: boolean) => !prev)}
        onReset={() => handleSeek(0)}
        onSeek={handleSeek}
        onSpeedChange={(value: number) => setSpeed(value)}
        onResultFileChange={handleResultFile}
        onTankFileChange={handleTankFile}
        onLoadSampleResult={handleLoadSampleResult}
        onLoadSampleTank={handleLoadSampleTank}
        toggleArmor={visibility.armor}
        toggleModules={visibility.modules}
        toggleCrew={visibility.crew}
        toggleShell={visibility.shell}
        toggleFragments={visibility.fragments}
        toggleExternalHull={visibility.externalHull}
        toggleSurfaceDamage={visibility.surfaceDamage}
        xrayMode={visibility.xrayMode}
        onToggleArmor={() => toggleVisibility("armor")}
        onToggleModules={() => toggleVisibility("modules")}
        onToggleCrew={() => toggleVisibility("crew")}
        onToggleShell={() => toggleVisibility("shell")}
        onToggleFragments={() => toggleVisibility("fragments")}
        onToggleExternalHull={() => toggleVisibility("externalHull")}
        onToggleSurfaceDamage={() => toggleVisibility("surfaceDamage")}
        onToggleXrayMode={() => toggleVisibility("xrayMode")}
      />
    </div>
  );
}

export default App;
