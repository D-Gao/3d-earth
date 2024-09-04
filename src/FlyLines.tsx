import { FC, useEffect, useRef } from "react";
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
import { flyLineData } from "./data/flyLineData";
import { _3Dto2D, config, lon2xyz, radianAOB, threePointCenter } from "./utils";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import gsap from "gsap";

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

const FlyLines: FC = () => {
  const linesGroupRef = useRef<Group>(null);

  const createFlyLine3d = () => {
    const meshList: Group[] = [];

    flyLineData.forEach((item) => {
      const { from, to } = item;
      /**
       * Generate an ID that follows this rule: use the ID if it’s available; otherwise,
       * concatenate the latitude and longitude strings of the "from" and "to" locations.
       */
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
      linesGroupRef.current!.add(group);
    });
    return meshList;
  };

  const FlyLine3d = (src: Vector3, dist: Vector3) => {
    const { quaternion, startPoint3D, endPoint3D } = _3Dto2D(src, dist);
    const flyLineMesh = createMesh([startPoint3D, endPoint3D]);
    flyLineMesh.quaternion.multiply(quaternion);
    return flyLineMesh;
  };

  /**
   *
   * @param positionInfo
   * @returns
   * return the line mesh with position z = 0,
   * since the operation is on 2d plane xoy
   * the middle point m and the vector om (where o is the origin of the sphere)
   * lies on the y axis
   */
  const createMesh = (positionInfo: [Vector3, Vector3]) => {
    /**
     * NOTE!
     * the start and end points and also the middle point lie on the xoy plane
     * so the z position in the vec3 in this fucntions are all zero
     **/

    const group = new Group();
    const [sourcePoint, targetPoint] = positionInfo;

    /**
     * compute the middle point of the two points
     * should be with m.x = m.y = 0
     **/
    const middleV3 = new Vector3()
      .addVectors(sourcePoint, targetPoint)
      .clone()
      .multiplyScalar(0.5);

    //direction of the middle point (from origin to that middle point)
    const dir = middleV3.clone().normalize();
    const s = radianAOB(sourcePoint, targetPoint, new Vector3(0, 0, 0));
    const middlePos = dir.multiplyScalar(config.R + s * config.R * 0.2);
    //find the circumcenter (the center of the circumcircle) of three points
    const centerPosition = threePointCenter(
      sourcePoint,
      targetPoint,
      middlePos
    );
    //radius of the circumcircle
    const R = middlePos.clone().sub(centerPosition).length();
    const c = radianAOB(sourcePoint, new Vector3(0, -1, 0), centerPosition);
    const startDeg = -Math.PI / 2 + c; //Flying line arc starting angle Math.PI / 2 equivalent of 90 degree
    const endDeg = Math.PI - startDeg; //Flying line arc ending angle
    const pathLine = createPathLine(centerPosition, R, startDeg, endDeg);
    const flyAngle = (endDeg - startDeg) / 7; //divide it by 7 is a design decision

    const tadpolePointsMesh = createShader(R, startDeg, startDeg + flyAngle);
    //Keep the center coordinates consistent with the created path circle
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
    const newPoints = points;
    const percentArr = []; //attributes.percent
    for (let i = 0; i < newPoints.length; i++) {
      percentArr.push(i / newPoints.length);
    }
    const colorArr = [];
    const color1 = new Color(pathStyle.color); //tadpole tail line color.
    const color2 = new Color(flyLineStyle.color); //tadpole head color
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
      vertexColors: true,
      size: flyLineStyle.size || 3.0,
    });
    const tadpolePointsMesh = new Points(geometry, material);
    material.onBeforeCompile = function (shader) {
      // add percent attribute in the vertex shader
      shader.vertexShader = shader.vertexShader.replace(
        "void main() {",
        [
          "attribute float percent;", //Vertex size percentage variable, controls the rendering size of control points.
          "void main() {",
        ].join("\n")
      );

      shader.vertexShader = shader.vertexShader.replace(
        "gl_PointSize = size;",
        ["gl_PointSize = percent * size;"].join("\n")
      );
    };
    tadpolePointsMesh.name = "tadpolePointsMesh";
    return tadpolePointsMesh;
  };

  useEffect(() => {
    createFlyLine3d();
  }, []);

  return <group ref={linesGroupRef}></group>;
};

export default FlyLines;
