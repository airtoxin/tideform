import { expect, test } from "vite-plus/test";
import { hexGrid, squareGrid } from "../src/boards.ts";

test("cells enumerates rows × cols in row-major order", () => {
  const grid = squareGrid({ x: 0, y: 0, rows: 2, cols: 3, cellSize: 10 });
  expect(grid.cells()).toEqual([
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 0, col: 2 },
    { row: 1, col: 0 },
    { row: 1, col: 1 },
    { row: 1, col: 2 },
  ]);
});

test("cellToWorld returns the top-left corner offset by the grid origin", () => {
  const grid = squareGrid({ x: 40, y: 50, rows: 4, cols: 4, cellSize: 32 });
  expect(grid.cellToWorld({ row: 0, col: 0 })).toEqual({ x: 40, y: 50 });
  expect(grid.cellToWorld({ row: 1, col: 2 })).toEqual({ x: 104, y: 82 });
});

test("cellCenter returns the cell midpoint", () => {
  const grid = squareGrid({ x: 0, y: 0, rows: 2, cols: 2, cellSize: 64 });
  expect(grid.cellCenter({ row: 0, col: 0 })).toEqual({ x: 32, y: 32 });
  expect(grid.cellCenter({ row: 1, col: 1 })).toEqual({ x: 96, y: 96 });
});

test("worldToCell maps a point to the cell that contains it", () => {
  const grid = squareGrid({ x: 10, y: 20, rows: 4, cols: 4, cellSize: 50 });
  expect(grid.worldToCell({ x: 10, y: 20 })).toEqual({ row: 0, col: 0 });
  expect(grid.worldToCell({ x: 59, y: 69 })).toEqual({ row: 0, col: 0 });
  expect(grid.worldToCell({ x: 60, y: 70 })).toEqual({ row: 1, col: 1 });
  expect(grid.worldToCell({ x: 159, y: 169 })).toEqual({ row: 2, col: 2 });
});

test("worldToCell returns null when the point is outside the grid", () => {
  const grid = squareGrid({ x: 0, y: 0, rows: 2, cols: 2, cellSize: 50 });
  expect(grid.worldToCell({ x: -1, y: 10 })).toBeNull();
  expect(grid.worldToCell({ x: 10, y: -1 })).toBeNull();
  expect(grid.worldToCell({ x: 100, y: 10 })).toBeNull();
  expect(grid.worldToCell({ x: 10, y: 100 })).toBeNull();
});

test("worldToCell roundtrips with cellToWorld and cellCenter", () => {
  const grid = squareGrid({ x: 25, y: 25, rows: 3, cols: 3, cellSize: 40 });
  for (const cell of grid.cells()) {
    expect(grid.worldToCell(grid.cellCenter(cell))).toEqual(cell);
    expect(grid.worldToCell(grid.cellToWorld(cell))).toEqual(cell);
  }
});

test("squareGrid.findOnCell returns the first item whose locator falls on the cell", () => {
  const grid = squareGrid({ x: 0, y: 0, rows: 3, cols: 3, cellSize: 50 });
  const items = [
    { id: "a", x: 10, y: 10 }, // (0,0)
    { id: "b", x: 60, y: 10 }, // (0,1)
    { id: "c", x: 60, y: 60 }, // (1,1)
    { id: "d", x: 70, y: 70 }, // (1,1) - same cell as c
  ];
  const locator = (item: { x: number; y: number }) => ({ x: item.x, y: item.y });
  expect(grid.findOnCell({ row: 1, col: 1 }, items, locator)).toEqual(items[2]);
  expect(grid.findOnCell({ row: 0, col: 0 }, items, locator)).toEqual(items[0]);
});

test("squareGrid.findOnCell returns null when no item maps to the cell", () => {
  const grid = squareGrid({ x: 0, y: 0, rows: 3, cols: 3, cellSize: 50 });
  const items = [{ x: 10, y: 10 }];
  expect(grid.findOnCell({ row: 2, col: 2 }, items, (i) => i)).toBeNull();
});

test("squareGrid.findOnCell skips items whose locator is outside the grid", () => {
  const grid = squareGrid({ x: 0, y: 0, rows: 2, cols: 2, cellSize: 50 });
  const items = [
    { x: -100, y: -100 },
    { x: 25, y: 25 },
  ];
  expect(grid.findOnCell({ row: 0, col: 0 }, items, (i) => i)).toEqual(items[1]);
});

test("hexGrid.cells produces 3*radius*(radius+1)+1 cells obeying x+y+z=0", () => {
  const grid = hexGrid({ origin: { x: 0, y: 0 }, size: 20, radius: 2 });
  const cells = grid.cells();
  expect(cells.length).toBe(3 * 2 * (2 + 1) + 1);
  for (const cell of cells) {
    expect(cell.x + cell.y + cell.z).toBe(0);
  }
  expect(cells).toContainEqual({ x: 0, y: 0, z: 0 });
  expect(cells).toContainEqual({ x: 2, y: -2, z: 0 });
  expect(cells).toContainEqual({ x: -2, y: 0, z: 2 });
});

test("hexGrid (pointy) cellCenter at the origin cell equals the grid origin", () => {
  const grid = hexGrid({
    origin: { x: 100, y: 200 },
    size: 30,
    radius: 1,
    orientation: "pointy",
  });
  expect(grid.cellCenter({ x: 0, y: 0, z: 0 })).toEqual({ x: 100, y: 200 });
});

test("hexGrid (flat) cellCenter at the origin cell equals the grid origin", () => {
  const grid = hexGrid({
    origin: { x: 100, y: 200 },
    size: 30,
    radius: 1,
    orientation: "flat",
  });
  expect(grid.cellCenter({ x: 0, y: 0, z: 0 })).toEqual({ x: 100, y: 200 });
});

test("hexGrid.cellToWorld returns the bounding-box top-left of the cell", () => {
  const pointy = hexGrid({
    origin: { x: 0, y: 0 },
    size: 10,
    radius: 1,
    orientation: "pointy",
  });
  const pointyCenter = pointy.cellCenter({ x: 0, y: 0, z: 0 });
  const pointyTopLeft = pointy.cellToWorld({ x: 0, y: 0, z: 0 });
  expect(pointyTopLeft.x).toBeCloseTo(pointyCenter.x - (Math.sqrt(3) * 10) / 2);
  expect(pointyTopLeft.y).toBeCloseTo(pointyCenter.y - 10);

  const flat = hexGrid({
    origin: { x: 0, y: 0 },
    size: 10,
    radius: 1,
    orientation: "flat",
  });
  const flatCenter = flat.cellCenter({ x: 0, y: 0, z: 0 });
  const flatTopLeft = flat.cellToWorld({ x: 0, y: 0, z: 0 });
  expect(flatTopLeft.x).toBeCloseTo(flatCenter.x - 10);
  expect(flatTopLeft.y).toBeCloseTo(flatCenter.y - (Math.sqrt(3) * 10) / 2);
});

test("hexGrid (pointy) worldToCell roundtrips with cellCenter", () => {
  const grid = hexGrid({
    origin: { x: 250, y: 250 },
    size: 24,
    radius: 3,
    orientation: "pointy",
  });
  for (const cell of grid.cells()) {
    expect(grid.worldToCell(grid.cellCenter(cell))).toEqual(cell);
  }
});

test("hexGrid (flat) worldToCell roundtrips with cellCenter", () => {
  const grid = hexGrid({
    origin: { x: 250, y: 250 },
    size: 24,
    radius: 3,
    orientation: "flat",
  });
  for (const cell of grid.cells()) {
    expect(grid.worldToCell(grid.cellCenter(cell))).toEqual(cell);
  }
});

test("hexGrid.worldToCell returns null when the point is outside the radius", () => {
  const grid = hexGrid({ origin: { x: 0, y: 0 }, size: 10, radius: 1 });
  expect(grid.worldToCell({ x: 1000, y: 0 })).toBeNull();
  expect(grid.worldToCell({ x: 0, y: 1000 })).toBeNull();
});

test("hexGrid.findOnCell finds an item whose locator lands on the cell", () => {
  const grid = hexGrid({
    origin: { x: 200, y: 200 },
    size: 30,
    radius: 2,
    orientation: "pointy",
  });
  const target: { x: number; y: number; z: number } = { x: 1, y: -1, z: 0 };
  const targetCenter = grid.cellCenter(target);
  const items = [
    { id: "off", x: 1000, y: 1000 },
    { id: "near", x: targetCenter.x + 3, y: targetCenter.y - 2 },
  ];
  const result = grid.findOnCell(target, items, (i) => ({ x: i.x, y: i.y }));
  expect(result?.id).toBe("near");
});

test("hexGrid.findOnCell returns null when no item lands on the cell", () => {
  const grid = hexGrid({ origin: { x: 0, y: 0 }, size: 30, radius: 2 });
  const items = [{ x: 1000, y: 1000 }];
  expect(grid.findOnCell({ x: 0, y: 0, z: 0 }, items, (i) => i)).toBeNull();
});
