/* eslint-disable @typescript-eslint/no-explicit-any */
import { Position } from "geojson";
import { Quaternion, Vector3 } from "three";

export const config = {
  R: 120,
};

export interface Coordinates3D {
  x: number;
  y: number;
  z: number;
}

export const lon2xyz = (
  R: number,
  longitude: number,
  latitude: number,
  offset: number = 1
): Coordinates3D => {
  let lon = (longitude * Math.PI) / 180; //转弧度值
  const lat = (latitude * Math.PI) / 180; //转弧度值
  lon = -lon; // three.js坐标系z坐标轴对应经度-90度，而不是90度
  // 经纬度坐标转球面坐标计算公式
  const x = R * offset * Math.cos(lat) * Math.cos(lon);
  const y = R * offset * Math.sin(lat);
  const z = R * offset * Math.cos(lat) * Math.sin(lon);
  // 返回球面坐标
  return {
    x,
    y,
    z,
  };
};

export const compareNum = (num1: number, num2: number) => {
  if (num1 < num2) {
    return -1;
  } else if (num1 > num2) {
    return 1;
  } else {
    return 0;
  }
};

export const minMax = (arr: number[]) => {
  // 数组元素排序
  arr.sort(compareNum);
  // 通过向两侧取整，把经纬度的方位稍微扩大
  return [Math.floor(arr[0]), Math.ceil(arr[arr.length - 1])];
};

export const _3Dto2D = (start: Vector3, end: Vector3) => {
  //球心坐标
  const origin = new Vector3(0, 0, 0); //球心坐标
  const startDir = start.clone().sub(origin); //飞线起点与球心构成方向向量
  const endDir = end.clone().sub(origin); //飞线结束点与球心构成方向向量
  // startDir和endDir构成一个三角形，.cross()叉乘计算该三角形法线normal
  const normal = new Vector3().crossVectors(startDir, endDir).normalize();
  const xoy_quaternion = new Quaternion().setFromUnitVectors(
    normal,
    new Vector3(0, 0, 1)
  );
  const start_xoy = start.clone().applyQuaternion(xoy_quaternion);
  const end_xoy = end.clone().applyQuaternion(xoy_quaternion);

  const middle_xoy = new Vector3()
    .addVectors(start_xoy, end_xoy)
    .multiplyScalar(0.5)
    .normalize();
  const xoy_quaternion_middle = new Quaternion().setFromUnitVectors(
    middle_xoy,
    new Vector3(0, 1, 0)
  );
  const start_xoy_middle = start_xoy
    .clone()
    .applyQuaternion(xoy_quaternion_middle);
  const end_xoy_middle = end_xoy.clone().applyQuaternion(xoy_quaternion_middle);

  const quaternionInverse = xoy_quaternion
    .clone()
    .invert()
    .multiply(xoy_quaternion_middle.clone().invert());
  return {
    // 返回两次旋转四元数的逆四元数
    quaternion: quaternionInverse,
    // 范围两次旋转后在XOY平面上关于y轴对称的圆弧起点和结束点坐标
    startPoint3D: start_xoy_middle,
    endPoint3D: end_xoy_middle,
  };
};
export const radianAOB = (A: Vector3, B: Vector3, O: Vector3) => {
  // dir1、dir2：球面上两个点和球心构成的方向向量
  const dir1 = A.clone().sub(O).normalize();
  const dir2 = B.clone().sub(O).normalize();
  //点乘.dot()计算夹角余弦值
  const cosAngle = dir1.clone().dot(dir2);
  return Math.acos(cosAngle); //余弦值转夹角弧度值,通过余弦值可以计算夹角范围是0~180度
};

//Find the circumcenter (the center of the circumcircle) of three points
export const threePointCenter = (p1: Vector3, p2: Vector3, p3: Vector3) => {
  const L1 = p1.lengthSq();
  const L2 = p2.lengthSq();
  const L3 = p3.lengthSq();
  const x1 = p1.x,
    y1 = p1.y,
    x2 = p2.x,
    y2 = p2.y,
    x3 = p3.x,
    y3 = p3.y;
  const S = x1 * y2 + x2 * y3 + x3 * y1 - x1 * y3 - x2 * y1 - x3 * y2;
  const x = (L2 * y3 + L1 * y2 + L3 * y1 - L2 * y1 - L3 * y2 - L1 * y3) / S / 2;
  const y = (L3 * x2 + L2 * x1 + L1 * x3 - L1 * x2 - L2 * x3 - L3 * x1) / S / 2;
  return new Vector3(x, y, 0);
};

/**
 *
 * @param point
 * @param polygon
 * @returns
 * check if the point is inside the polygon or not
 */
export const pointInPolygon = (point: number[], polygon: Position[]) => {
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
