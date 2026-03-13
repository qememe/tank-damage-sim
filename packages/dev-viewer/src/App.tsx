import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { SimulationDebugReport, SimulationResult, TankDefinition } from "@tank-sim/shared";
import ControlPanel from "./components/ControlPanel";
import {
  getFileNameFromPath,
  loadBundledFallback,
  loadBetaManifest,
  loadBetaScenario,
  type BetaContentManifest
} from "./content/betaContent";
import { usePlayback } from "./hooks/usePlayback";
import { getMaxEventTime } from "./loaders/timeUtils";
import SimulationScene from "./viewer/SimulationScene";
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

type ContentMode = "curated" | "manual" | "sample";

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
  const [debugReport, setDebugReport] = useState<SimulationDebugReport | null>(null);
  const [visibility, setVisibility] = useState(defaultVisibility);
  const [error, setError] = useState<string | null>(null);
  const [resultFileName, setResultFileName] = useState<string | null>(null);
  const [tankFileName, setTankFileName] = useState<string | null>(null);
  const [scenarioFileName, setScenarioFileName] = useState<string | null>(null);
  const [shellFileName, setShellFileName] = useState<string | null>(null);
  const [debugFileName, setDebugFileName] = useState<string | null>(null);
  const [betaManifest, setBetaManifest] = useState<BetaContentManifest | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [contentMode, setContentMode] = useState<ContentMode>("curated");
  const [loadingScenarioId, setLoadingScenarioId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

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

  const resetCuratedSelection = useCallback((mode: ContentMode) => {
    setSelectedScenarioId(null);
    setScenarioFileName(null);
    setShellFileName(null);
    setDebugFileName(null);
    setContentMode(mode);
  }, []);

  const loadBundledSamplePair = useCallback(
    async (clearError: boolean) => {
      if (clearError) {
        setError(null);
      }

      const bundled = await loadBundledFallback();
      setResult(bundled.result);
      setTank(bundled.tank);
      setDebugReport(bundled.debugReport);
      setResultFileName(bundled.resultFileName);
      setTankFileName(bundled.tankFileName);
      setScenarioFileName(bundled.scenarioFileName);
      setShellFileName(bundled.shellFileName);
      setDebugFileName(bundled.debugFileName);
      setSelectedScenarioId(null);
      setContentMode("sample");
    },
    []
  );

  const handleLoadCuratedScenario = useCallback(
    async (scenarioId: string, manifestOverride?: BetaContentManifest) => {
      const manifest = manifestOverride ?? betaManifest;

      if (!manifest) {
        return;
      }

      setError(null);
      setLoadingScenarioId(scenarioId);

      try {
        const loaded = await loadBetaScenario(manifest, scenarioId);
        const linkedTank = manifest.tanks.find((item) => item.id === loaded.scenario.tankId);
        const linkedShell = manifest.shells.find((item) => item.id === loaded.scenario.shellId);

        setResult(loaded.result);
        setTank(loaded.tank);
        setDebugReport(loaded.debugReport);
        setSelectedScenarioId(scenarioId);
        setContentMode("curated");
        setResultFileName(getFileNameFromPath(loaded.scenario.resultPath));
        setTankFileName(getFileNameFromPath(linkedTank?.path));
        setScenarioFileName(getFileNameFromPath(loaded.scenario.scenarioPath));
        setShellFileName(getFileNameFromPath(linkedShell?.path));
        setDebugFileName(getFileNameFromPath(loaded.scenario.debugPath));
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoadingScenarioId(null);
      }
    },
    [betaManifest]
  );

  useEffect(() => {
    let cancelled = false;

    const initializeBetaContent = async () => {
      try {
        const manifest = await loadBetaManifest();

        if (cancelled) {
          return;
        }

        setBetaManifest(manifest);
        await handleLoadCuratedScenario(manifest.defaultScenarioId, manifest);
      } catch (err) {
        if (cancelled) {
          return;
        }

        setError(`Failed to initialize curated beta content: ${(err as Error).message}. Showing bundled beta fallback.`);
        await loadBundledSamplePair(false);
      } finally {
        if (!cancelled) {
          setIsInitializing(false);
        }
      }
    };

    void initializeBetaContent();

    return () => {
      cancelled = true;
    };
  }, [handleLoadCuratedScenario, loadBundledSamplePair]);

  const handleResultFile = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const parsed = (await readJsonFile(file)) as SimulationResult;
        setResult(parsed);
        setDebugReport(null);
        setResultFileName(file.name);
        resetCuratedSelection("manual");
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [readJsonFile, resetCuratedSelection]
  );

  const handleTankFile = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const parsed = (await readJsonFile(file)) as TankDefinition;
        setTank(parsed);
        setDebugReport(null);
        setTankFileName(file.name);
        resetCuratedSelection("manual");
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [readJsonFile, resetCuratedSelection]
  );

  const handleLoadSampleResult = useCallback(() => {
    void loadBundledSamplePair(true);
  }, [loadBundledSamplePair]);

  const handleLoadSampleTank = useCallback(() => {
    void loadBundledSamplePair(true);
  }, [loadBundledSamplePair]);

  const handleResetToDefaultScenario = useCallback(() => {
    if (!betaManifest) {
      void loadBundledSamplePair(true);
      return;
    }

    void handleLoadCuratedScenario(betaManifest.defaultScenarioId);
  }, [betaManifest, handleLoadCuratedScenario, loadBundledSamplePair]);

  const handleSeek = (time: number) => {
    setIsPlaying(false);
    setCurrentTime(Math.min(time, maxTime));
  };

  const toggleVisibility = (key: keyof VisibilityState) => {
    setVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const scenarioMap = useMemo(() => {
    return new Map(betaManifest?.scenarios.map((scenario) => [scenario.id, scenario]) ?? []);
  }, [betaManifest]);

  const tankMap = useMemo(() => {
    return new Map(betaManifest?.tanks.map((entry) => [entry.id, entry]) ?? []);
  }, [betaManifest]);

  const shellMap = useMemo(() => {
    return new Map(betaManifest?.shells.map((entry) => [entry.id, entry]) ?? []);
  }, [betaManifest]);

  const activeScenario = selectedScenarioId ? scenarioMap.get(selectedScenarioId) ?? null : null;
  const activeTankEntry = activeScenario ? tankMap.get(activeScenario.tankId) ?? null : null;
  const activeShellEntry = activeScenario ? shellMap.get(activeScenario.shellId) ?? null : null;

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
  const shellTypeLabel = result?.hitContext?.shellType?.toUpperCase() ?? activeShellEntry?.type ?? "—";
  const fuseStatusLabel =
    result?.hitContext?.fuseStatus && result.hitContext.fuseStatus !== "not_applicable"
      ? result.hitContext.fuseStatus
      : "—";

  const viewerStatus = isInitializing
    ? {
        title: "Loading curated beta pack",
        text: "Fetching the manifest and the default showcase scenario."
      }
    : !result || !tank
      ? {
          title: "Viewer is waiting for content",
          text: "Load a curated scenario or the bundled beta fallback to populate the replay scene."
        }
      : null;

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
        {viewerStatus && (
          <div className="viewer-state-overlay">
            <p className="viewer-state-kicker">{viewerStatus.title}</p>
            <p className="viewer-state-text">{viewerStatus.text}</p>
          </div>
        )}
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
          {activeScenario && (
            <div className="viewer-hud-row">
              <span className="hud-pill">
                Scenario {activeScenario.name}
              </span>
            </div>
          )}
          <p className="viewer-hud-event">
            {currentEventLabel}
            {currentEvent?.targetId ? ` -> ${currentEvent.targetId}` : ""}
          </p>
        </div>
      </div>
      <ControlPanel
        betaManifest={betaManifest}
        selectedScenarioId={selectedScenarioId}
        activeScenario={activeScenario}
        activeTankEntry={activeTankEntry}
        activeShellEntry={activeShellEntry}
        contentMode={contentMode}
        loadingScenarioId={loadingScenarioId}
        defaultScenarioId={betaManifest?.defaultScenarioId ?? null}
        debugReport={debugReport}
        isInitializing={isInitializing}
        summary={result?.summary ?? null}
        hitContext={result?.hitContext ?? null}
        loadedScenarioName={scenarioFileName}
        loadedResultName={resultFileName}
        loadedTankName={tankFileName}
        loadedShellName={shellFileName}
        loadedDebugName={debugFileName}
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
        onLoadCuratedScenario={handleLoadCuratedScenario}
        onResetToDefaultScenario={handleResetToDefaultScenario}
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
