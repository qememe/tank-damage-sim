import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls as ThreeOrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useEffect, useRef } from "react";

export default function ViewerOrbitControls(): null {
  const { camera, gl } = useThree();
  const controls = useRef<ThreeOrbitControls | null>(null);

  useEffect(() => {
    controls.current = new ThreeOrbitControls(camera, gl.domElement);
    controls.current.enableDamping = true;
    controls.current.dampingFactor = 0.08;
    controls.current.minDistance = 3;
    controls.current.maxDistance = 25;
    controls.current.target.set(0, 1.2, 0);
    controls.current.update();
    return () => {
      controls.current?.dispose();
    };
  }, [camera, gl.domElement]);

  useFrame(() => {
    controls.current?.update();
  });

  return null;
}
