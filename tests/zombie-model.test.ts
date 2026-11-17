import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { createZombie } from "../src/game/world/zombie";

test("all zombie variants have finite human-sized geometry and bounded draw counts", () => {
  const shapes: string[] = [];
  for (let index = 0; index < 4; index++) {
    const zombie = createZombie(index);
    zombie.update(0, false);
    const bounds = new T.Box3().setFromObject(zombie.group);
    const size = bounds.getSize(new T.Vector3());
    assert.ok(size.y > 1.5 && size.y < 2.5);
    assert.ok(size.x > 0.4 && size.x < 1.5);
    let meshes = 0;
    const geometries = new Set<T.BufferGeometry>();
    const materials = new Set<T.Material>();
    zombie.group.traverse((object) => {
      if (!(object instanceof T.Mesh)) return;
      meshes++;
      assert.ok(
        object.geometry.getAttribute("position").array.every(Number.isFinite),
      );
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        materials.add(material);
    });
    assert.ok(meshes > 10 && meshes <= 32);
    shapes.push(`${size.x.toFixed(2)}:${size.y.toFixed(2)}`);
    zombie.update(2, true);
    assert.ok(
      new T.Box3()
        .setFromObject(zombie.group)
        .getSize(new T.Vector3())
        .toArray()
        .every(Number.isFinite),
    );
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }
  assert.equal(new Set(shapes).size, 4);
});
