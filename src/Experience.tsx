/* eslint-disable @typescript-eslint/no-explicit-any */
import { CameraControls } from "@react-three/drei";
import { Group, Vector3 } from "three";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import CountryShapes from "./CountryShapes";
import FlyLines from "./FlyLines";

const config = {
  R: 120,
};

const rotationAxis = new Vector3(0, 1, 0);

const Experience = () => {
  const earthGroupRef = useRef<Group>(null);
  const stopRef = useRef(false);
  const toggleMove = () => {
    stopRef.current = !stopRef.current;
  };
  useFrame((_, delta) => {
    if (!stopRef.current)
      earthGroupRef.current!.rotateOnAxis(rotationAxis, 0.1 * delta);
  });

  return (
    <>
      <CameraControls></CameraControls>
      <group name="mapGroup" ref={earthGroupRef} onDoubleClick={toggleMove}>
        <mesh name="earthMesh">
          <sphereGeometry args={[config.R - 1, 39, 39]}></sphereGeometry>
          <meshPhongMaterial color={0x13162c}></meshPhongMaterial>
        </mesh>
        <CountryShapes></CountryShapes>
        <FlyLines></FlyLines>
      </group>
      <directionalLight
        position={[2000, 2000, 3000]}
        intensity={1}
      ></directionalLight>
      <ambientLight></ambientLight>
    </>
  );
};

export default Experience;
