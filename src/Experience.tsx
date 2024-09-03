/* eslint-disable @typescript-eslint/no-explicit-any */
import { CameraControls } from "@react-three/drei";
import {
  ArcCurve,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Points,
  PointsMaterial,
  Vector3,
} from "three";

import { useEffect, useRef } from "react";
import { _3Dto2D, lon2xyz, radianAOB, threePointCenter } from "./utils";
import { useFrame } from "@react-three/fiber";
import { initData } from "@/data/flyLineData";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import gsap from "gsap";
import CountryShapes from "./CountryShapes";

const config = {
  R: 120,
};

const animationConfig = {
  duration: 8,
  delay: 0,
  repeat: -1,
};

const pathStyle = {
  color: "#cd79ff",
  size: 10,
};

const flyLineStyle = {
  color: "#cd79ff",
  duration: 5000,
  size: 3,
};

const rotationAxis = new Vector3(0, 1, 0);

const Experience = () => {
  const earthGroupRef = useRef<Group>(null);

  useEffect(() => {
    const linesGroup = createFlyLine3d();
    earthGroupRef.current!.add(...linesGroup);
  }, []);

  const stopRef = useRef(false);
  const toggleMove = () => {
    stopRef.current = !stopRef.current;
  };

  useFrame((_, delta) => {
    if (!stopRef.current)
      earthGroupRef.current!.rotateOnAxis(rotationAxis, 0.01 * delta);
  });

  const createFlyLine3d = () => {
    const meshList: Group[] = [];

    initData.forEach((item) => {
      const { from, to } = item;
      /*Generate an ID that follows this rule: use the ID if it’s available; otherwise, 
        concatenate the latitude and longitude strings of the "from" and "to" locations.*/
      let id: string;
      if (from.id && to.id) {
        id = `${from.id}-${to.id}`;
      } else {
        id = `${from.lon}${from.lat}-${to.lon}${to.lat}`;
      }
      const group = new Group();
      /* const scatter = new Scatter(this._store); */

      const from_position = lon2xyz(config.R, from.lon, from.lat);
      const to_position = lon2xyz(config.R, to.lon, to.lat);
      /* group.add(scatter.create(from), scatter.create(to)); */
      const flyLine = FlyLine3d(
        new Vector3(from_position.x, from_position.y, from_position.z),
        new Vector3(to_position.x, to_position.y, to_position.z)
      );
      group.add(flyLine);

      group.name = id;
      group.userData.figureType = "flyLine";
      meshList.push(group);
    });
    return meshList;
  };

  const FlyLine3d = (src: Vector3, dist: Vector3) => {
    //创建线
    const { quaternion, startPoint3D, endPoint3D } = _3Dto2D(src, dist);
    const flyLineMesh = createMesh([startPoint3D, endPoint3D]);
    flyLineMesh.quaternion.multiply(quaternion);
    return flyLineMesh;
  };

  const createMesh = (positionInfo: [Vector3, Vector3]) => {
    const group = new Group();
    const [sourcePoint, targetPoint] = positionInfo;

    //算出两点之间的中点向量
    const middleV3 = new Vector3()
      .addVectors(sourcePoint, targetPoint)
      .clone()
      .multiplyScalar(0.5);
    //然后计算方向向量
    const dir = middleV3.clone().normalize();
    const s = radianAOB(sourcePoint, targetPoint, new Vector3(0, 0, 0));
    const middlePos = dir.multiplyScalar(config.R + s * config.R * 0.2);
    //寻找三个圆心的坐标
    const centerPosition = threePointCenter(
      sourcePoint,
      targetPoint,
      middlePos
    );
    //求得半径
    const R = middlePos.clone().sub(centerPosition).length();
    const c = radianAOB(sourcePoint, new Vector3(0, -1, 0), centerPosition);
    const startDeg = -Math.PI / 2 + c; //飞线圆弧开始角度
    const endDeg = Math.PI - startDeg; //飞线圆弧结束角度
    const pathLine = createPathLine(centerPosition, R, startDeg, endDeg);
    const flyAngle = (endDeg - startDeg) / 7; //飞线圆弧的弧度和轨迹线弧度相关 也可以解释为飞线的长度

    const tadpolePointsMesh = createShader(R, startDeg, startDeg + flyAngle);
    //和创建好的路径圆 圆心坐标保持一致
    tadpolePointsMesh.position.y = centerPosition.y;
    tadpolePointsMesh.name = "tadpolePointsMesh";

    const params = { z: 0 };
    gsap.to(params, {
      z: endDeg - startDeg,
      duration: animationConfig.duration,
      delay: 0,
      repeat: animationConfig.repeat,
      onUpdate: () => {
        tadpolePointsMesh.rotation.z = params.z;
      },
    });

    group.add(tadpolePointsMesh);
    group.add(pathLine);
    group.name = "flyLine";
    return group;
  };

  const createPathLine = (
    middlePos: Vector3,
    r: number,
    startDeg: number,
    endDeg: number
  ) => {
    const curve = new ArcCurve(
      middlePos.x,
      middlePos.y, // ax, aY
      r, // xRadius, yRadius
      startDeg,
      endDeg, // aStartAngle, aEndAngle
      false // aClockwise
    );
    const points = curve.getSpacedPoints(200);
    const geometry = new LineGeometry();
    geometry.setPositions(points.map((item) => [item.x, item.y, 0]).flat());
    const material = new LineMaterial({
      color: new Color(pathStyle.color).getHex(),
      linewidth: pathStyle.size / 10,
      vertexColors: false,
      dashed: false,
      alphaToCoverage: false,
    });
    const pathLine = new Line2(geometry, material);
    pathLine.name = "pathLine";
    //addUserDataToMesh(pathLine, this._currentData);
    return pathLine;
  };

  const createShader = (r: number, startAngle: number, endAngle: number) => {
    const points = new ArcCurve(
      0,
      0, // ax, aY
      r, // xRadius, yRadius
      startAngle,
      endAngle, // aStartAngle, aEndAngle
      false // aClockwise
    ).getSpacedPoints(200);
    // Create the final object to add to the scene
    const geometry = new BufferGeometry();
    const newPoints = points; //获取更多的点数
    const percentArr = []; //attributes.percent的数据
    for (let i = 0; i < newPoints.length; i++) {
      percentArr.push(i / newPoints.length);
    }
    const colorArr = [];
    const color1 = new Color(pathStyle.color); //尾拖线颜色
    const color2 = new Color(flyLineStyle.color); //飞线蝌蚪头颜色
    for (let i = 0; i < newPoints.length; i++) {
      const color = color1.lerp(color2, i / newPoints.length);
      colorArr.push(color.r, color.g, color.b);
    }
    geometry.setFromPoints(newPoints);
    geometry.attributes.percent = new BufferAttribute(
      new Float32Array(percentArr),
      1
    );
    geometry.attributes.color = new BufferAttribute(
      new Float32Array(colorArr),
      3
    );
    const material = new PointsMaterial({
      vertexColors: true, //使用顶点颜色渲染
      size: flyLineStyle.size || 3.0, //点大小
    });
    const tadpolePointsMesh = new Points(geometry, material);
    material.onBeforeCompile = function (shader) {
      // 顶点着色器中声明一个attribute变量:百分比
      shader.vertexShader = shader.vertexShader.replace(
        "void main() {",
        [
          "attribute float percent;", //顶点大小百分比变量，控制点渲染大小
          "void main() {",
        ].join("\n") // .join()把数组元素合成字符串
      );
      // 调整点渲染大小计算方式
      shader.vertexShader = shader.vertexShader.replace(
        "gl_PointSize = size;",
        ["gl_PointSize = percent * size;"].join("\n") // .join()把数组元素合成字符串
      );
    };
    tadpolePointsMesh.name = "tadpolePointsMesh";
    return tadpolePointsMesh;
  };

  return (
    <>
      <CameraControls></CameraControls>
      <group name="mapGroup" ref={earthGroupRef} onDoubleClick={toggleMove}>
        <mesh name="earthMesh">
          <sphereGeometry args={[config.R - 1, 39, 39]}></sphereGeometry>
          <meshPhongMaterial color={0x13162c}></meshPhongMaterial>
        </mesh>
        <CountryShapes></CountryShapes>
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
