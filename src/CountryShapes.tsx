import { FC, useEffect, useMemo, useRef } from "react";
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
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import world from "@/assets/world.json";
import { Position } from "geojson";
import Delaunator from "delaunator";
import { config, lon2xyz, minMax, pointInPolygon } from "./utils";

const currentStyle = {
  areaColor: "#2e3564",
  lineColor: "#797eff",
  opacity: 1,
};

const CountryShapes: FC = () => {
  /*create a geometry array to store the current country's polygons
    if it is lenght 1 then the country is a single polygon otherwise
    multipolygon thus need merge all the polygons into one single mesh 
    for better performance
  */
  const geometryArr = useRef<BufferGeometry[]>([]);

  const countrieShapeRef = useRef<Group>(null);

  const features = useMemo(() => {
    return world.features;
  }, []);

  const create = () => {
    const arr: Group[] = [];

    //each feature represent a country info
    features.forEach((item) => {
      /*initialize the geometry array for the current country
        in case of multipolygon we need to merge all the polygons
      */
      geometryArr.current = [];
      const countryGroup = new Group();
      countryGroup.name = `countryGroup-${item.properties?.name}`;
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

  /**
   * If it is length one polygon country with no isaland out side of it
   * @param countryCoordinates
   *
   * @returns
   * Array of line meshes which oulines the countries's polygons
   * each line loop corrisponds to a polygon
   */
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

  /**
   *
   * @param polygon
   * receive the  most outer polygon
   *
   * @returns
   * linePoints3d: coordinates of the most outer boundary
   * allPoints3d: coordinates(in form of 3d position) of the entire polygon
   * usefulIndexArr: array of index to design the mesh's geometry based on the allPoints3d
   */

  const gridPoint = (polygon: Position[]) => {
    //boundary points collection + plane's inner points collection
    const allPoints3d: number[] = [],
      linePoints3d: number[] = [];

    const lonArr: number[] = []; //polygon's all longitude coordinates
    const latArr: number[] = []; //polygon's all latitude coordinates
    polygon.forEach((item: Position) => {
      lonArr.push(item[0]);
      latArr.push(item[1]);
      // + 0.1 to avoid z-fighting
      const coord_line = lon2xyz(config.R + 0.1, item[0], item[1]);
      const coord_point3d = lon2xyz(config.R, item[0], item[1]);
      linePoints3d.push(coord_line.x, coord_line.y, coord_line.z);
      allPoints3d.push(coord_point3d.x, coord_point3d.y, coord_point3d.z);
    });
    // calculate the minimum and maximum latitude and longitude values from a collection of points
    const [lonMin, lonMax] = minMax(lonArr);
    const [latMin, latMax] = minMax(latArr);

    // The minimum and maximum latitude and longitude values create a rectangular area that can enclose the polygon.
    // Inside this rectangle, generate evenly spaced points.
    // Set the spacing for these evenly distributed points.
    const span: number = 2;
    const row: number = Math.ceil((lonMax - lonMin) / span);
    const col: number = Math.ceil((latMax - latMin) / span);

    // Within the rectangular outline that corresponds to the polygon, generate a uniformly spaced rectangular grid of points (rectPointsArr).
    const rectPointsArr = [];
    for (let i = 0; i < row + 1; i++) {
      for (let j = 0; j < col + 1; j++) {
        // Use two nested for loops to generate a grid of evenly spaced points within the rectangular area.
        rectPointsArr.push([lonMin + i * span, latMin + j * span]);
      }
    }
    // Exclude the grid points on the boundary line, keeping only the grid points inside the boundary (not including the boundary line).
    const polygonPointsArr: Position[] = [];
    rectPointsArr.forEach((coord: number[]) => {
      if (pointInPolygon(coord, polygon)) {
        //if the coordinates is inside the polygon then include it
        polygonPointsArr.push(coord);
        const point3D = lon2xyz(config.R as number, coord[0], coord[1]);
        const { x, y, z } = point3D;
        allPoints3d.push(x, y, z);
      }
    });

    const geographyPoints = [...polygon, ...polygonPointsArr];
    const usefulIndexArr = trianglePlan(geographyPoints, polygon);
    return {
      linePoints3d,
      allPoints3d,
      usefulIndexArr,
    };
  };

  const createShapeGeometry = (usefulIndexArr: number[], points: number[]) => {
    const geometry = new BufferGeometry();
    geometry.index = new BufferAttribute(new Uint16Array(usefulIndexArr), 1);
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

  const trianglePlan = (polygonPointsArr: Position[], polygon: Position[]) => {
    // Delaunay triangulation
    // .from(pointsArr).triangles: Perform triangulation on a set of points on a plane and obtain the triangle indices.
    const indexArr = Delaunator.from(polygonPointsArr).triangles;

    /*The triangle indices obtained from triangulation (indexArr) need to be further processed to 
    remove the indices of triangles that are outside the polygon's boundary. */
    const usefulIndexArr = [];
    // Remove triangles outside the polygon by using a very simple method: check if the centroid of a triangle is inside the polygon's boundary.
    for (let i = 0; i < indexArr.length; i += 3) {
      // p1, p2, p3 of each triangle's vertices
      const p1 = polygonPointsArr[indexArr[i]];
      const p2 = polygonPointsArr[indexArr[i + 1]];
      const p3 = polygonPointsArr[indexArr[i + 2]];
      // calculate the centroid
      const gravityCenter = [
        (p1[0] + p2[0] + p3[0]) / 3,
        (p1[1] + p2[1] + p3[1]) / 3,
      ];
      if (pointInPolygon(gravityCenter, polygon)) {
        usefulIndexArr.push(indexArr[i], indexArr[i + 1], indexArr[i + 2]);
      }
    }
    return usefulIndexArr;
  };

  const mergeGeometry = () => {
    let aggGeometry: BufferGeometry | undefined = undefined;

    // multipoligon
    if (geometryArr.current.length > 1) {
      aggGeometry = mergeGeometries(geometryArr.current);
    } else {
      aggGeometry = geometryArr.current[0];
    }
    // If using materials affected by lighting, you need to calculate and generate normals.
    aggGeometry.computeVertexNormals();
    const material = new MeshPhongMaterial({
      color: currentStyle.areaColor,
      side: BackSide,
      // transparent: true,
      opacity: currentStyle.opacity,
    });
    return new Mesh(aggGeometry, material);
  };

  useEffect(() => {
    const countryShapes = create();
    countrieShapeRef.current!.add(...countryShapes);
  }, []);

  return <group ref={countrieShapeRef}></group>;
};

export default CountryShapes;
