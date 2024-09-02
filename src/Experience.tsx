import { CameraControls } from "@react-three/drei";
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshPhongMaterial,
} from "three";
import { Position } from "geojson";
import world from "@/assets/world.json";
import { useEffect, useMemo, useRef } from "react";
import { lon2xyz, minMax } from "./utils";
import Delaunator from "delaunator";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const config = {
  R: 120,
};

const currentStyle = {
  areaColor: "#2e3564",
  lineColor: "#797eff",
  opacity: 1,
};

const Experience = () => {
  const earthGroupRef = useRef<Group>(null);

  const features = useMemo(() => {
    return world.features;
  }, []);

  const geometryArr = useRef<BufferGeometry[]>([]);

  useEffect(() => {
    console.log(features);
    const countryShapes = create();
    earthGroupRef.current!.add(...countryShapes);
  }, []);

  const create = () => {
    const arr: Group[] = [];
    // const features = store.hashMap
    features.forEach((item) => {
      /*  this.getCurrentStyle(item.properties?.name);
      if (this.currentStyle.show === false) return; */
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
    // 三角剖分
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

    console.log(geometryArr);
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

  return (
    <>
      <CameraControls></CameraControls>
      <group name="mapGroup" ref={earthGroupRef}>
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
