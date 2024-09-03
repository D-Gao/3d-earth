# 3D Earth

This project is inspired by the github project of [GlobeStream3D](https://github.com/hululuuuuu/GlobeStream3D), in particular the flyline feature. So the aims is to create a 3d earth with React Three Fiber to reproduce this interesting feature, also with possible optimizations.

GeoJson is used to generate earth map, you can find it in assets/world.json.

## Understanding the GeoJson Structure

In geographic data, especially when dealing with polygons and multi-polygons, the structure is designed to handle various complexities such as holes in polygons (like lakes within a country) and multiple disjointed parts (like islands).

- Position: This is typically a pair (or tuple) of coordinates [x, y] (or [longitude, latitude] in geographic terms).

- Position[]: This represents a list of positions, which in the context of a polygon, forms a single linear ring (a closed loop). This linear ring can represent the outer boundary of the polygon or a hole within the polygon.

- Position[][]: This represents an array of linear rings. The first array is the outer boundary, and the subsequent arrays (if any) represent holes within the polygon. This structure is used for a single polygon, which might have an outer boundary and zero or more inner boundaries (holes).

- Position[][][]: This represents a collection of polygons. This structure is used when you have a MultiPolygon geometry, which consists of multiple polygons, each potentially having holes. A country that is represented by multiple disjoint polygons (e.g., an archipelago) requires Position[][][] because each polygon might have its own set of rings (outer boundary and possible holes).

## Delaunator

[Delaunator](https://www.npmjs.com/package/delaunator) is an efficient way to do generate triangles given a array of positions.
In this project it need to be further processed in order to get rid of the triangles outside of the boundary.

Below are screenshots of 2 results one with just Delaunator on the left, and other one with both process on the right.

<table>
  <tr>
    <td  align="center"><img src="./src/assets/two.png" alt="only delaunator"  /><sub><b>only Delaunator</b></sub></td>
    <td  align="center"> <img src="./src/assets/one.png" alt="both processes" /><sub><b>both processes</b></sub></td>
  </tr>
</table>
