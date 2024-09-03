/* eslint-disable @typescript-eslint/no-explicit-any */
import { CameraControls } from "@react-three/drei";
import {
  ArcCurve,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshPhongMaterial,
  Points,
  PointsMaterial,
  Vector3,
} from "three";
import { Position } from "geojson";
import world from "@/assets/world.json";
import { useEffect, useMemo, useRef } from "react";
import { _3Dto2D, lon2xyz, minMax, radianAOB, threePointCenter } from "./utils";
import Delaunator from "delaunator";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useFrame } from "@react-three/fiber";
import { initData } from "@/data/flyLineData";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import gsap from "gsap";

const config = {
  R: 120,
};

const animationConfig = {
  duration: 8,
  delay: 0,
  repeat: -1,
};

/* {
  "from": {
      "lon": 142.8123,
      "lat": -58.9813,
      "style": {
          "color": "yellow"
      }
  },
  "to": {
      "lon": 157.0064,
      "lat": 10.7816,
      "style": {
          "color": "yellow"
      }
  },
  "style": {
      "pathStyle": {
          "color": "yellow"
      },
      "flyLineStyle": {
          "color": "yellow"
      }
  }
} */

const currentStyle = {
  areaColor: "#2e3564",
  lineColor: "#797eff",
  opacity: 1,
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

  const features = useMemo(() => {
    return world.features;
  }, []);

  const geometryArr = useRef<BufferGeometry[]>([]);

  useEffect(() => {
    const countryShapes = create();
    earthGroupRef.current!.add(...countryShapes);
    const linesGroup = createLines();
    earthGroupRef.current!.add(...linesGroup);
  }, [features]);

  const create = () => {
    const arr: Group[] = [];
    features.forEach((item) => {
      geometryArr.current = [];
      const countryGroup = new Group();
      countryGroup.name = `countryGroup-${item.properties?.name}`;
      // //如果一个国家是单个轮廓
      let countryCoordinates: Position[][][] = [];
      if (item.geometry.type === "Polygon") {
        countryCoordinates.push(item.geometry.coordinates as Position[][]);
      } else if (item.geometry.type === "MultiPolygon") {
        countryCoordinates = item.geometry.coordinates as Position[][][];
      }

      const { lineArr } = create3d(countryCoordinates);
      countryGroup.add(...lineArr);

      const mesh = mergeGeometry();
      countryGroup.add(mesh);
      mesh.name = item.properties?.name;
      mesh.userData = {
        ...item.properties,
        type: "country",
        backupColor: currentStyle.areaColor,
        opacity: currentStyle.opacity,
      };
      arr.push(countryGroup);
    });
    return arr;
  };

  const create3d = (countryCoordinates: Position[][][]) => {
    const lineArr: LineLoop[] = [];
    countryCoordinates.forEach((subItem: Position[][]) => {
      if (!subItem[0]) return;
      const { linePoints3d, allPoints3d, usefulIndexArr } = gridPoint(
        subItem[0]
      );
      const shapeGeometry = createShapeGeometry(usefulIndexArr, allPoints3d);
      geometryArr.current.push(shapeGeometry);
      const lineMesh = createLineMesh(linePoints3d);
      lineArr.push(lineMesh);
    });
    return {
      lineArr,
    };
  };

  const gridPoint = (polygon: Position[]) => {
    //边界线的点位合集 和平面图形的点位合集
    const allPoints3d: number[] = [],
      linePoints3d: number[] = [],
      allPoints2d: number[] = [],
      linePoints2d: number[] = [];
    const lonArr: number[] = []; //polygon的所有经度坐标
    const latArr: number[] = []; //polygon的所有纬度坐标
    polygon.forEach((item: Position) => {
      lonArr.push(item[0]);
      latArr.push(item[1]);
      // + 0.1 to avoid z-fighting
      const coord_line = lon2xyz(config.R + 0.1, item[0], item[1]);
      const coord_point3d = lon2xyz(config.R, item[0], item[1]);
      linePoints3d.push(coord_line.x, coord_line.y, coord_line.z);
      linePoints2d.push(...item, 0);
      allPoints3d.push(coord_point3d.x, coord_point3d.y, coord_point3d.z);
      allPoints2d.push(...item, 0);
    });
    // minMax()计算polygon所有经纬度返回的极大值、极小值
    const [lonMin, lonMax] = minMax(lonArr);
    const [latMin, latMax] = minMax(latArr);
    // 经纬度极小值和极大值构成一个矩形范围，可以包裹多边形polygon，在矩形范围内生成等间距顶点
    //  设置均匀填充点的间距
    const span: number = 2;
    const row: number = Math.ceil((lonMax - lonMin) / span);
    const col: number = Math.ceil((latMax - latMin) / span);
    const rectPointsArr = []; //polygon对应的矩形轮廓内生成均匀间隔的矩形网格数据rectPointsArr
    for (let i = 0; i < row + 1; i++) {
      for (let j = 0; j < col + 1; j++) {
        //两层for循环在矩形范围内批量生成等间距的网格顶点数据
        rectPointsArr.push([lonMin + i * span, latMin + j * span]);
      }
    }
    //除去边界线外的矩阵点位 只保留边界线内的矩阵点位（不包含边界线）
    const polygonPointsArr: Position[] = [];
    rectPointsArr.forEach((coord: number[]) => {
      //coord:点经纬度坐标
      if (pointInPolygon(coord, polygon)) {
        //判断点coord是否位于多边形中 位于多边形之中的点放在一起
        polygonPointsArr.push(coord);
        //把符合条件的点位 放到集合里
        const point3D = lon2xyz(config.R as number, coord[0], coord[1]);
        const { x, y, z } = point3D;
        allPoints3d.push(x, y, z);
        allPoints2d.push(coord[0], coord[1], 0);
      }
    });
    //渲染国家边界线
    const geographyPoints = [...polygon, ...polygonPointsArr];
    const usefulIndexArr = trianglePlan(geographyPoints, polygon);
    return {
      linePoints3d,
      allPoints3d,
      linePoints2d,
      usefulIndexArr,
      allPoints2d,
    };
  };

  const createShapeGeometry = (usefulIndexArr: number[], points: number[]) => {
    const geometry = new BufferGeometry(); //创建一个几何体
    // 设置几何体顶点索引
    geometry.index = new BufferAttribute(new Uint16Array(usefulIndexArr), 1);
    // 设置几何体顶点位置坐标
    geometry.attributes.position = new BufferAttribute(
      new Float32Array(points),
      3
    );

    return geometry;
  };

  const createLineMesh = (points: number[]) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(points), 3)
    );
    const lineMaterial = new LineBasicMaterial({
      color: "#797eff",
    });
    return new LineLoop(geometry, lineMaterial);
  };

  const pointInPolygon = (point: number[], polygon: Position[]) => {
    const x = point[0],
      y = point[1];
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0],
        yi = polygon[i][1];
      const xj = polygon[j][0],
        yj = polygon[j][1];
      const intersect =
        yi > y != yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };
  const trianglePlan = (polygonPointsArr: Position[], polygon: Position[]) => {
    // 德劳内三角剖分
    //.from(pointsArr).triangles：平面上一系列点集三角剖分，并获取三角形索引值
    const indexArr = Delaunator.from(polygonPointsArr).triangles;
    /**三角剖分获得的三角形索引indexArr需要进行二次处理，删除多边形polygon轮廓外面的三角形对应索引 */
    const usefulIndexArr = []; //二次处理后三角形索引，也就是保留多边形polygon内部三角形对应的索引
    // 删除多边形polygon外面三角形，判断方法非常简单，判断一个三角形的质心是否在多边形轮廓内部
    for (let i = 0; i < indexArr.length; i += 3) {
      // 三角形三个顶点坐标p1, p2, p3
      const p1 = polygonPointsArr[indexArr[i]];
      const p2 = polygonPointsArr[indexArr[i + 1]];
      const p3 = polygonPointsArr[indexArr[i + 2]];
      // 三角形重心坐标计算
      const gravityCenter = [
        (p1[0] + p2[0] + p3[0]) / 3,
        (p1[1] + p2[1] + p3[1]) / 3,
      ];
      if (pointInPolygon(gravityCenter, polygon)) {
        //pointInPolygon()函数判断三角形的重心是在多边形polygon内
        // 保留复合条件三角形对应的索引：indexArr[i], indexArr[i+1],indexArr[i+2]
        usefulIndexArr.push(indexArr[i], indexArr[i + 1], indexArr[i + 2]); //这种情况需要设置three.js材质背面可见THREE.BackSide才能看到球面国家Mesh
      }
    }
    return usefulIndexArr;
  };

  const mergeGeometry = () => {
    let aggGeometry: BufferGeometry | undefined = undefined;

    //多轮廓
    if (geometryArr.current.length > 1) {
      aggGeometry = mergeGeometries(geometryArr.current);
    } else {
      aggGeometry = geometryArr.current[0];
    }
    aggGeometry.computeVertexNormals(); //如果使用受光照影响材质，需要计算生成法线
    // MeshLambertMaterial  MeshBasicMaterial
    const material = new MeshPhongMaterial({
      color: currentStyle.areaColor,
      side: BackSide,
      // transparent: true,
      opacity: currentStyle.opacity,
    });
    return new Mesh(aggGeometry, material);
  };

  const stopRef = useRef(false);
  const toggleMove = () => {
    stopRef.current = !stopRef.current;
  };

  useFrame((_, delta) => {
    if (!stopRef.current)
      earthGroupRef.current!.rotateOnAxis(rotationAxis, 0.01 * delta);
  });

  const createLines = () => {
    const meshList: Group[] = [];

    initData.forEach((item) => {
      const { from, to } = item;
      //生成一个id 规则是优先取id 否则from和to的经纬度字符串拼接
      let id: string;
      if (from.id && to.id) {
        id = `${from.id}-${to.id}`;
      } else {
        id = `${from.lon}${from.lat}-${to.lon}${to.lat}`;
      }
      //if (this._store.flyLineMap[id]) return;
      const group = new Group();
      /* const scatter = new Scatter(this._store); */

      const from_position = lon2xyz(config.R, from.lon, from.lat);
      const to_position = lon2xyz(config.R, to.lon, to.lat);
      /* group.add(scatter.create(from), scatter.create(to)); */
      const flyLine = FlyLine3d(
        new Vector3(from_position.x, from_position.y, from_position.z),
        new Vector3(to_position.x, to_position.y, to_position.z),
        item
      );
      group.add(flyLine);

      group.name = id;
      group.userData.figureType = "flyLine";
      meshList.push(group);
    });
    return meshList;
  };

  const FlyLine3d = (src: Vector3, dist: Vector3, item: any) => {
    //创建线
    const { quaternion, startPoint3D, endPoint3D } = _3Dto2D(src, dist);
    const flyLineMesh = createMesh([startPoint3D, endPoint3D], item);
    flyLineMesh.quaternion.multiply(quaternion);
    return flyLineMesh;
  };

  const createMesh = (positionInfo: [Vector3, Vector3], itemData: any) => {
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

    //TODO convert it to gsap
    /*  setTween(
      { z: 0 },
      { z: endDeg - startDeg },
      (params) => {
        tadpolePointsMesh.rotation.z = params.z;
      },
      {
        ...flyLineStyle,
        data: itemData,
      }
    ); */

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
    /*  if (this._currentConfig.pathStyle.show !== false) {
     
    } */
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
