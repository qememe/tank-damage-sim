import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { SimulationResult, TankDefinition } from "@tank-sim/shared";
import ControlPanel from "./components/ControlPanel";
import SimulationScene from "./viewer/SimulationScene";
import sampleResultData from "./sample/sample-result.json";
import sampleTankData from "./sample/sample-tank.json";
import { getMaxEventTime } from "./loaders/timeUtils";
import { usePlayback } from "./hooks/usePlayback";

const sampleResult = sampleResultData as SimulationResult;
const sampleTank = sampleTankData as TankDefinition;

type VisibilityState = {
  armor: boolean;
  modules: boolean;
  crew: boolean;
  shell: boolean;
  fragments: boolean;
};

const defaultVisibility: VisibilityState = {
  armor: true,
  modules: true,
  crew: true,
  shell: true,
  fragments: true
};

function App(): React.JSX.Element {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [tank, setTank] = useState<TankDefinition | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [visibility, setVisibility] = useState(defaultVisibility);
  const [error, setError] = useState<string | null>(null);

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
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [readJsonFile]
  );

  const handleLoadSampleResult = () => {
    setError(null);
    setResult(sampleResult);
  };

  const handleLoadSampleTank = () => {
    setTank(sampleTank);
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

  return (
    <div className="app-shell">
      <div className="viewer-column">
        <SimulationScene
          result={result}
          tank={tank}
          currentTime={currentTime}
          maxTime={maxTime}
          showArmor={visibility.armor}
          showModules={visibility.modules}
          showCrew={visibility.crew}
          showShellPath={visibility.shell}
          showFragments={visibility.fragments}
        />
      </div>
      <ControlPanel
        summary={result?.summary ?? null}
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
        onToggleArmor={() => toggleVisibility("armor")}
        onToggleModules={() => toggleVisibility("modules")}
        onToggleCrew={() => toggleVisibility("crew")}
        onToggleShell={() => toggleVisibility("shell")}
        onToggleFragments={() => toggleVisibility("fragments")}
      />
    </div>
  );
}

export default App;
