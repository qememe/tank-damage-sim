import React, { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import type {
  ArmorZone,
  CrewMember,
  ModuleDefinition,
  SimulationEvent,
  SimulationResult,
  TankDefinition,
  Vec3
} from "@tank-sim/shared";
import ViewerOrbitControls from "./OrbitControls";
import {
  buildLinePositions,
  getPartialPathPoints,
  mapFragmentAppearanceTimes
} from "../loaders/timeUtils";

interface SimulationSceneProps {
  result: SimulationResult | null;
  tank: TankDefinition | null;
  currentTime: number;
  maxTime: number;
  showArmor: boolean;
  showModules: boolean;
  showCrew: boolean;
  showShellPath: boolean;
  showFragments: boolean;
}

const moduleColorMap: Record<string, string> = {
  engine: "#ffd166",
  ammo_rack: "#f97316"
};

const crewColor = "#5eead4";
const armorColor = "#38bdf8";

type VisibleFragment = {
  id: string;
  positions: Float32Array;
};

const toTuple = (value: Vec3) => [value.x, value.y, value.z] as const;

function SimulationScene({
  result,
  tank,
  currentTime,
  maxTime,
  showArmor,
  showModules,
  showCrew,
  showShellPath,
  showFragments
}: SimulationSceneProps): React.JSX.Element {
  const timelineProgress = maxTime > 0 ? Math.min(currentTime / maxTime, 1) : 0;
  const shellPoints = useMemo(() => getPartialPathPoints(result?.shellPath ?? [], timelineProgress), [
    result?.shellPath,
    timelineProgress
  ]);
  const shellPositions = shellPoints.length >= 2 ? buildLinePositions(shellPoints) : null;
  const fragmentTimes = useMemo(() => mapFragmentAppearanceTimes(result?.events ?? []), [result?.events]);

  const visibleFragments = useMemo(() => {
    if (!result?.fragments?.length) {
      return [] as VisibleFragment[];
    }
    return result.fragments
      .map((fragment): VisibleFragment | null => {
        const appearTime = fragmentTimes[fragment.id] ?? 0;
        const duration = Math.max(maxTime - appearTime, 0.001);
        const progress = Math.max(0, Math.min(1, (currentTime - appearTime) / duration));
        if (progress <= 0) {
          return null;
        }
        const points = getPartialPathPoints(fragment.points, progress);
        if (points.length < 2) {
          return null;
        }
        return {
          id: fragment.id,
          positions: buildLinePositions(points)
        };
      })
      .filter((fragment): fragment is VisibleFragment => fragment !== null);
  }, [currentTime, fragmentTimes, maxTime, result?.fragments]);

  return (
    <Canvas camera={{ position: [5, 5, 10], fov: 50 }}>
      <color attach="background" args={["#02030a"]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[5, 10, 7]} intensity={0.8} />
      <gridHelper args={[20, 20, "#2b6cb0", "#0f172a"]} />
      <axesHelper args={[4]} />
      {showArmor &&
        tank?.armorZones.map((zone: ArmorZone) => (
          <mesh key={zone.id} position={toTuple(zone.position)}>
            <boxGeometry args={[zone.size.x, zone.size.y, zone.size.z]} />
            <meshStandardMaterial color={armorColor} transparent opacity={0.25} />
          </mesh>
        ))}
      {showModules &&
        tank?.modules.map((module: ModuleDefinition) => (
          <mesh key={module.id} position={toTuple(module.position)}>
            <boxGeometry args={[module.size.x, module.size.y, module.size.z]} />
            <meshStandardMaterial color={moduleColorMap[module.type] ?? "#c084fc"} opacity={0.9} />
          </mesh>
        ))}
      {showCrew &&
        tank?.crew.map((member: CrewMember) => (
          <mesh key={member.id} position={toTuple(member.position)}>
            <boxGeometry args={[0.32, 0.6, 0.32]} />
            <meshStandardMaterial color={crewColor} />
          </mesh>
        ))}
      {showShellPath && shellPositions && (
        <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={shellPositions.length / 3}
                array={shellPositions}
                itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#ffb347" />
        </line>
      )}
      {showFragments &&
        visibleFragments.map((fragment) => (
          <line key={fragment.id}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={fragment.positions.length / 3}
                array={fragment.positions}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#f472b6" linewidth={1} />
          </line>
        ))}
      {result?.events?.map((event: SimulationEvent, index: number) => {
        if (!event.position || typeof event.t !== "number" || currentTime < event.t) {
          return null;
        }
        return (
          <mesh key={`event-${index}`} position={toTuple(event.position)}>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshStandardMaterial color="#facc15" />
          </mesh>
        );
      })}
      <ViewerOrbitControls />
    </Canvas>
  );
}

export default SimulationScene;
