import React, { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import type {
  ArmorZone,
  CrewMember,
  ExternalShape,
  ModuleDefinition,
  SurfaceDamage,
  SimulationEvent,
  SimulationResult,
  TankDefinition,
  Vec3
} from "@tank-sim/shared";
import { ArrowHelper, CanvasTexture, DoubleSide, Material, Quaternion, SRGBColorSpace, Vector3 } from "three";
import ViewerOrbitControls from "./OrbitControls";
import {
  formatEventType,
  formatTokenLabel,
  getDamageOriginPoint,
  getImpactPoint,
  getNearestEventIndex
} from "./inspectionUtils";
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
  showExternalHull: boolean;
  showArmor: boolean;
  showModules: boolean;
  showCrew: boolean;
  showShellPath: boolean;
  showFragments: boolean;
  showSurfaceDamage: boolean;
  xrayMode: boolean;
}

const moduleColorMap: Record<string, string> = {
  engine: "#ffd166",
  ammo_rack: "#c084fc"
};

const sceneColors = {
  external: "#6b745b",
  armor: "#38bdf8",
  armorHit: "#fb923c",
  module: "#c084fc",
  moduleDamaged: "#f97316",
  crew: "#5eead4",
  crewDamaged: "#ef4444",
  shell: "#ffb347",
  fragment: "#f472b6",
  impact: "#fde047",
  origin: "#34d399",
  event: "#93c5fd"
} as const;

const surfaceDamageColors: Record<SurfaceDamage["kind"], { fill: string; accent: string }> = {
  impact_mark: { fill: "#f59e0b", accent: "#fef3c7" },
  penetration_hole: { fill: "#111827", accent: "#f97316" },
  spall_exit: { fill: "#dbeafe", accent: "#7dd3fc" },
  detonation_scorch: { fill: "#4b5563", accent: "#fb923c" },
  dent: { fill: "#94a3b8", accent: "#e2e8f0" },
  ricochet_scar: { fill: "#67e8f9", accent: "#0f172a" }
};

const externalGroupColorMap: Record<string, string> = {
  hull: "#657053",
  turret: "#758063",
  gun: "#50565a",
  track_guard: "#4f5a43",
  detail: "#82876e"
};

type VisibleFragment = {
  id: string;
  positions: Float32Array;
};

const fallbackCrewSize: Vec3 = {
  x: 0.32,
  y: 0.6,
  z: 0.32
};

interface LabelSpriteProps {
  text: string;
  position: Vec3;
  backgroundColor: string;
  textColor?: string;
}

interface PointMarkerProps {
  position: Vec3;
  color: string;
  geometry: "sphere" | "octahedron";
  label: string;
  labelOffsetY?: number;
}

const toTuple = (value: Vec3) => [value.x, value.y, value.z] as const;

const withOffset = (value: Vec3, x = 0, y = 0, z = 0): Vec3 => ({
  x: value.x + x,
  y: value.y + y,
  z: value.z + z
});

const withNormalOffset = (value: Vec3, normal: Vec3, distance = 0.02): Vec3 => ({
  x: value.x + (normal.x * distance),
  y: value.y + (normal.y * distance),
  z: value.z + (normal.z * distance)
});

const toRadians = (value: number) => (value * Math.PI) / 180;

const getRotationTuple = (
  rotationDeg?: Vec3,
  baseRotation: [number, number, number] = [0, 0, 0]
): [number, number, number] => [
  baseRotation[0] + toRadians(rotationDeg?.x ?? 0),
  baseRotation[1] + toRadians(rotationDeg?.y ?? 0),
  baseRotation[2] + toRadians(rotationDeg?.z ?? 0)
];

const getExternalShapeColor = (shape: ExternalShape) =>
  shape.color ?? (shape.group ? externalGroupColorMap[shape.group] : undefined) ?? sceneColors.external;

const getCrewSize = (member: CrewMember): Vec3 => member.size ?? fallbackCrewSize;

const rotateVec3 = (value: Vec3, rotationDeg?: Vec3): Vec3 => {
  if (!rotationDeg) {
    return value;
  }

  const xRadians = toRadians(rotationDeg.x);
  const yRadians = toRadians(rotationDeg.y);
  const zRadians = toRadians(rotationDeg.z);
  const afterX = {
    x: value.x,
    y: (value.y * Math.cos(xRadians)) - (value.z * Math.sin(xRadians)),
    z: (value.y * Math.sin(xRadians)) + (value.z * Math.cos(xRadians))
  };
  const afterY = {
    x: (afterX.x * Math.cos(yRadians)) + (afterX.z * Math.sin(yRadians)),
    y: afterX.y,
    z: (-afterX.x * Math.sin(yRadians)) + (afterX.z * Math.cos(yRadians))
  };

  return {
    x: (afterY.x * Math.cos(zRadians)) - (afterY.y * Math.sin(zRadians)),
    y: (afterY.x * Math.sin(zRadians)) + (afterY.y * Math.cos(zRadians)),
    z: afterY.z
  };
};

const offsetByLocalRotation = (position: Vec3, localOffset: Vec3, rotationDeg?: Vec3): Vec3 => {
  const rotatedOffset = rotateVec3(localOffset, rotationDeg);
  return withOffset(position, rotatedOffset.x, rotatedOffset.y, rotatedOffset.z);
};

const buildLabelTexture = (text: string, backgroundColor: string, textColor: string) => {
  const fontSize = 34;
  const paddingX = 24;
  const paddingY = 14;
  const deviceScale = 2;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    const fallback = new CanvasTexture(canvas);
    fallback.colorSpace = SRGBColorSpace;
    return fallback;
  }

  context.font = `600 ${fontSize}px sans-serif`;
  const textWidth = Math.ceil(context.measureText(text).width);
  const width = textWidth + paddingX * 2;
  const height = fontSize + paddingY * 2;
  canvas.width = width * deviceScale;
  canvas.height = height * deviceScale;

  context.scale(deviceScale, deviceScale);
  context.font = `600 ${fontSize}px sans-serif`;
  context.textBaseline = "middle";

  const radius = 10;
  context.fillStyle = backgroundColor;
  context.beginPath();
  context.moveTo(radius, 0);
  context.lineTo(width - radius, 0);
  context.quadraticCurveTo(width, 0, width, radius);
  context.lineTo(width, height - radius);
  context.quadraticCurveTo(width, height, width - radius, height);
  context.lineTo(radius, height);
  context.quadraticCurveTo(0, height, 0, height - radius);
  context.lineTo(0, radius);
  context.quadraticCurveTo(0, 0, radius, 0);
  context.closePath();
  context.fill();

  context.strokeStyle = "rgba(255, 255, 255, 0.22)";
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = textColor;
  context.fillText(text, paddingX, height / 2 + 1);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

function LabelSprite({
  text,
  position,
  backgroundColor,
  textColor = "#f8fafc"
}: LabelSpriteProps): React.JSX.Element {
  const texture = useMemo(() => buildLabelTexture(text, backgroundColor, textColor), [text, backgroundColor, textColor]);

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  const width = Math.max(1.25, text.length * 0.11);

  return (
    <sprite position={toTuple(position)} scale={[width, 0.42, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} depthTest={false} />
    </sprite>
  );
}

function PointMarker({
  position,
  color,
  geometry,
  label,
  labelOffsetY = 0.42
}: PointMarkerProps): React.JSX.Element {
  return (
    <group>
      <mesh position={toTuple(position)}>
        {geometry === "sphere" ? <sphereGeometry args={[0.12, 18, 18]} /> : <octahedronGeometry args={[0.16, 0]} />}
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.15} />
      </mesh>
      <LabelSprite
        text={label}
        position={withOffset(position, 0, labelOffsetY, 0)}
        backgroundColor="rgba(8, 15, 27, 0.92)"
      />
    </group>
  );
}

function ImpactNormalArrow({ origin, normal }: { origin: Vec3; normal: Vec3 }): React.JSX.Element {
  const arrow = useMemo(() => {
    const direction = new Vector3(normal.x, normal.y, normal.z);
    if (direction.lengthSq() === 0) {
      direction.set(0, 1, 0);
    } else {
      direction.normalize();
    }
    const start = new Vector3(origin.x, origin.y, origin.z);
    return new ArrowHelper(direction, start, 0.95, sceneColors.impact, 0.22, 0.12);
  }, [origin, normal]);

  useEffect(() => {
    return () => {
      arrow.line.geometry.dispose();
      (arrow.line.material as Material).dispose();
      arrow.cone.geometry.dispose();
      (arrow.cone.material as Material).dispose();
    };
  }, [arrow]);

  return <primitive object={arrow} />;
}

function SurfaceDamageMarker({ damage }: { damage: SurfaceDamage }): React.JSX.Element {
  const colors = surfaceDamageColors[damage.kind];
  const liftedPosition = useMemo(() => withNormalOffset(damage.position, damage.normal, 0.018), [damage.normal, damage.position]);
  const quaternion = useMemo(() => {
    const normal = new Vector3(damage.normal.x, damage.normal.y, damage.normal.z);
    if (normal.lengthSq() === 0) {
      normal.set(0, 0, 1);
    } else {
      normal.normalize();
    }

    const orientation = new Quaternion();
    orientation.setFromUnitVectors(new Vector3(0, 0, 1), normal);
    return orientation;
  }, [damage.normal]);
  const quaternionTuple: [number, number, number, number] = [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
  const holeRadius = Math.max(damage.radius * 0.45, 0.018);

  if (damage.kind === "ricochet_scar") {
    return (
      <group position={toTuple(liftedPosition)} quaternion={quaternionTuple}>
        <mesh rotation={[0, 0, Math.PI / 5]}>
          <planeGeometry args={[damage.radius * 2.1, Math.max(damage.radius * 0.38, 0.03)]} />
          <meshBasicMaterial
            color={colors.fill}
            transparent
            opacity={0.9}
            side={DoubleSide}
            depthWrite={false}
            depthTest={false}
          />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 5]}>
          <planeGeometry args={[damage.radius * 1.55, Math.max(damage.radius * 0.12, 0.018)]} />
          <meshBasicMaterial
            color={colors.accent}
            transparent
            opacity={0.9}
            side={DoubleSide}
            depthWrite={false}
            depthTest={false}
          />
        </mesh>
      </group>
    );
  }

  return (
    <group position={toTuple(liftedPosition)} quaternion={quaternionTuple}>
      {(damage.kind === "impact_mark" || damage.kind === "detonation_scorch" || damage.kind === "dent") && (
        <>
          <mesh>
            <circleGeometry args={[damage.radius, 28]} />
            <meshBasicMaterial
              color={colors.fill}
              transparent
              opacity={damage.kind === "detonation_scorch" ? 0.48 : 0.36}
              side={DoubleSide}
              depthWrite={false}
              depthTest={false}
            />
          </mesh>
          <mesh>
            <ringGeometry args={[damage.radius * 0.74, damage.radius, 32]} />
            <meshBasicMaterial
              color={colors.accent}
              transparent
              opacity={0.95}
              side={DoubleSide}
              depthWrite={false}
              depthTest={false}
            />
          </mesh>
        </>
      )}
      {(damage.kind === "penetration_hole" || damage.kind === "spall_exit") && (
        <>
          <mesh>
            <ringGeometry args={[holeRadius, damage.radius, 30]} />
            <meshBasicMaterial
              color={colors.accent}
              transparent
              opacity={0.96}
              side={DoubleSide}
              depthWrite={false}
              depthTest={false}
            />
          </mesh>
          <mesh position={[0, 0, 0.001]}>
            <circleGeometry args={[holeRadius, 22]} />
            <meshBasicMaterial
              color={colors.fill}
              transparent
              opacity={0.98}
              side={DoubleSide}
              depthWrite={false}
              depthTest={false}
            />
          </mesh>
        </>
      )}
    </group>
  );
}

function ExternalShapeMesh({
  shape,
  xrayMode
}: {
  shape: ExternalShape;
  xrayMode: boolean;
}): React.JSX.Element {
  const color = getExternalShapeColor(shape);
  const rotation = getRotationTuple(shape.rotationDeg, shape.kind === "cylinder" ? [Math.PI / 2, 0, 0] : [0, 0, 0]);
  const opacity = xrayMode ? 0.24 : 0.92;

  const materialProps = {
    color,
    transparent: true,
    opacity,
    roughness: 0.92,
    metalness: 0.08,
    emissive: color,
    emissiveIntensity: xrayMode ? 0.1 : 0.04,
    depthWrite: !xrayMode
  } as const;

  return (
    <group position={toTuple(shape.position)} rotation={rotation}>
      <mesh renderOrder={xrayMode ? 1 : 0}>
        {shape.kind === "box" ? (
          <boxGeometry args={[shape.size.x, shape.size.y, shape.size.z]} />
        ) : (
          <cylinderGeometry args={[shape.radius, shape.radius, shape.length, shape.radialSegments ?? 12]} />
        )}
        <meshStandardMaterial {...materialProps} />
      </mesh>
    </group>
  );
}

function SimulationScene({
  result,
  tank,
  currentTime,
  maxTime,
  showExternalHull,
  showArmor,
  showModules,
  showCrew,
  showShellPath,
  showFragments,
  showSurfaceDamage,
  xrayMode
}: SimulationSceneProps): React.JSX.Element {
  const timelineProgress = maxTime > 0 ? Math.min(currentTime / maxTime, 1) : 0;
  const shellPoints = useMemo(() => getPartialPathPoints(result?.shellPath ?? [], timelineProgress), [
    result?.shellPath,
    timelineProgress
  ]);
  const shellPositions = shellPoints.length >= 2 ? buildLinePositions(shellPoints) : null;
  const fragmentTimes = useMemo(() => mapFragmentAppearanceTimes(result?.events ?? []), [result?.events]);
  const hitZoneId = result?.summary.hitZoneId ?? null;
  const moduleDamageMap = useMemo(
    () => new Map((result?.damagedModules ?? []).map((damage) => [damage.moduleId, damage])),
    [result?.damagedModules]
  );
  const crewDamageMap = useMemo(
    () => new Map((result?.crew ?? []).map((damage) => [damage.crewId, damage])),
    [result?.crew]
  );
  const currentEventIndex = useMemo(
    () => getNearestEventIndex(result?.events ?? [], currentTime),
    [result?.events, currentTime]
  );
  const impactPoint = useMemo(() => getImpactPoint(result), [result]);
  const damageOriginPoint = useMemo(() => getDamageOriginPoint(result), [result]);
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
  const shellHeadPoint = shellPoints[shellPoints.length - 1] ?? shellPoints[0] ?? null;
  const firstImpactTime = result?.events?.find((event) => event.type === "armor_hit")?.t ?? 0;
  const surfaceDamageVisible = currentTime >= firstImpactTime;
  const armorOpacity = xrayMode ? 0.32 : 0.18;
  const hitArmorOpacity = xrayMode ? 0.6 : 0.4;
  const moduleOpacity = xrayMode ? 0.92 : 0.68;
  const crewOpacity = xrayMode ? 0.96 : 0.76;

  const impactLabelParts = [
    "Impact",
    result?.hitContext?.shellType?.toUpperCase() ?? null,
    result?.hitContext?.fuseStatus && result.hitContext.fuseStatus !== "not_applicable"
      ? result.hitContext.fuseStatus
      : null
  ].filter((value): value is string => Boolean(value));

  return (
    <Canvas camera={{ position: [5, 5, 10], fov: 50 }}>
      <color attach="background" args={["#02030a"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 10, 7]} intensity={0.95} />
      <gridHelper args={[20, 20, "#274469", "#0f172a"]} />
      <axesHelper args={[4]} />
      {showExternalHull &&
        tank?.externalShapes?.map((shape: ExternalShape) => (
          <ExternalShapeMesh key={shape.id} shape={shape} xrayMode={xrayMode} />
        ))}
      {showArmor &&
        tank?.armorZones.map((zone: ArmorZone) => {
          const isHitZone = zone.id === hitZoneId;
          const rotation = getRotationTuple(zone.rotationDeg);
          const labelPosition = offsetByLocalRotation(
            zone.position,
            { x: 0, y: zone.size.y / 2 + 0.22, z: 0 },
            zone.rotationDeg
          );
          return (
            <group key={zone.id}>
              <group position={toTuple(zone.position)} rotation={rotation}>
                <mesh>
                  <boxGeometry args={[zone.size.x, zone.size.y, zone.size.z]} />
                  <meshStandardMaterial
                    color={isHitZone ? sceneColors.armorHit : sceneColors.armor}
                    transparent
                    opacity={isHitZone ? hitArmorOpacity : armorOpacity}
                    emissive={isHitZone ? sceneColors.armorHit : sceneColors.armor}
                    emissiveIntensity={isHitZone ? 0.42 : 0.08}
                  />
                </mesh>
                {isHitZone && (
                  <mesh scale={[1.03, 1.03, 1.03]}>
                    <boxGeometry args={[zone.size.x, zone.size.y, zone.size.z]} />
                    <meshBasicMaterial color={sceneColors.impact} wireframe />
                  </mesh>
                )}
              </group>
              <LabelSprite
                text={zone.name}
                position={labelPosition}
                backgroundColor={isHitZone ? "rgba(124, 45, 18, 0.92)" : "rgba(10, 34, 52, 0.9)"}
              />
            </group>
          );
        })}
      {showSurfaceDamage &&
        surfaceDamageVisible &&
        result?.surfaceDamage?.map((damage) => (
          <SurfaceDamageMarker key={damage.id} damage={damage} />
        ))}
      {showModules &&
        tank?.modules.map((module: ModuleDefinition) => {
          const damage = moduleDamageMap.get(module.id);
          const isDamaged = Boolean(damage);
          const color = isDamaged ? sceneColors.moduleDamaged : moduleColorMap[module.type] ?? sceneColors.module;
          const rotation = getRotationTuple(module.rotationDeg);
          const labelPosition = offsetByLocalRotation(
            module.position,
            { x: 0, y: module.size.y / 2 + 0.2, z: 0 },
            module.rotationDeg
          );
          return (
            <group key={module.id}>
              <group position={toTuple(module.position)} rotation={rotation}>
                <mesh>
                  <boxGeometry args={[module.size.x, module.size.y, module.size.z]} />
                  <meshStandardMaterial
                    color={color}
                    opacity={moduleOpacity}
                    transparent
                    emissive={isDamaged ? color : "#140b2d"}
                    emissiveIntensity={isDamaged ? 0.38 : 0.12}
                  />
                </mesh>
              </group>
              <LabelSprite
                text={formatTokenLabel(module.id)}
                position={labelPosition}
                backgroundColor={isDamaged ? "rgba(91, 41, 16, 0.92)" : "rgba(42, 24, 67, 0.9)"}
              />
            </group>
          );
        })}
      {showCrew &&
        tank?.crew.map((member: CrewMember) => {
          const damage = crewDamageMap.get(member.id);
          const isDamaged = Boolean(damage);
          const label = formatTokenLabel(member.role || member.id);
          const crewSize = getCrewSize(member);
          const rotation = getRotationTuple(member.rotationDeg);
          const labelPosition = offsetByLocalRotation(
            member.position,
            { x: 0, y: crewSize.y / 2 + 0.18, z: 0 },
            member.rotationDeg
          );
          return (
            <group key={member.id}>
              <group position={toTuple(member.position)} rotation={rotation}>
                <mesh>
                  <boxGeometry args={[crewSize.x, crewSize.y, crewSize.z]} />
                  <meshStandardMaterial
                    color={isDamaged ? sceneColors.crewDamaged : sceneColors.crew}
                    emissive={isDamaged ? sceneColors.crewDamaged : sceneColors.crew}
                    emissiveIntensity={isDamaged ? 0.46 : 0.12}
                    transparent
                    opacity={crewOpacity}
                  />
                </mesh>
              </group>
              <LabelSprite
                text={label}
                position={labelPosition}
                backgroundColor={isDamaged ? "rgba(89, 20, 24, 0.92)" : "rgba(11, 46, 44, 0.9)"}
              />
            </group>
          );
        })}
      {showShellPath && shellPositions && shellHeadPoint && (
        <>
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={shellPositions.length / 3}
                array={shellPositions}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color={sceneColors.shell} />
          </line>
          <mesh position={toTuple(shellHeadPoint)}>
            <sphereGeometry args={[0.07, 14, 14]} />
            <meshStandardMaterial color={sceneColors.shell} emissive={sceneColors.shell} emissiveIntensity={1} />
          </mesh>
        </>
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
            <lineBasicMaterial color={sceneColors.fragment} linewidth={1} />
          </line>
        ))}
      {impactPoint && (
        <PointMarker
          position={impactPoint}
          color={sceneColors.impact}
          geometry="sphere"
          label={impactLabelParts.join(" • ")}
          labelOffsetY={0.5}
        />
      )}
      {damageOriginPoint && (
        <PointMarker
          position={damageOriginPoint}
          color={sceneColors.origin}
          geometry="octahedron"
          label="Damage origin"
        />
      )}
      {impactPoint && result?.hitContext?.impactNormal && (
        <>
          <ImpactNormalArrow origin={impactPoint} normal={result.hitContext.impactNormal} />
          <LabelSprite
            text="Impact normal"
            position={withOffset(
              impactPoint,
              result.hitContext.impactNormal.x * 0.85,
              result.hitContext.impactNormal.y * 0.85 + 0.18,
              result.hitContext.impactNormal.z * 0.85
            )}
            backgroundColor="rgba(86, 71, 11, 0.9)"
          />
        </>
      )}
      {result?.events?.map((event: SimulationEvent, index: number) => {
        if (!event.position || typeof event.t !== "number" || currentTime < event.t) {
          return null;
        }
        const isActiveEvent = index === currentEventIndex;
        return (
          <group key={`event-${index}`}>
            <mesh position={toTuple(event.position)}>
              <sphereGeometry args={[isActiveEvent ? 0.1 : 0.065, 12, 12]} />
              <meshStandardMaterial
                color={isActiveEvent ? "#ffffff" : sceneColors.event}
                emissive={isActiveEvent ? "#ffffff" : sceneColors.event}
                emissiveIntensity={isActiveEvent ? 0.9 : 0.28}
              />
            </mesh>
            {isActiveEvent && (
              <LabelSprite
                text={formatEventType(event.type)}
                position={withOffset(event.position, 0, 0.28, 0)}
                backgroundColor="rgba(18, 31, 55, 0.9)"
              />
            )}
          </group>
        );
      })}
      <ViewerOrbitControls />
    </Canvas>
  );
}

export default SimulationScene;
