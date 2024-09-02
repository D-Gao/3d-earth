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
