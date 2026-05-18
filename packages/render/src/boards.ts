import type { Point } from "./types.ts";

export type SquareGridCell = {
  row: number;
  col: number;
};

export type SquareGridOptions = {
  x: number;
  y: number;
  rows: number;
  cols: number;
  cellSize: number;
};

export type HexCell = {
  x: number;
  y: number;
  z: number;
};

export type HexOrientation = "pointy" | "flat";

export type HexGridOptions = {
  origin: Point;
  size: number;
  radius: number;
  orientation?: HexOrientation;
};

export type BoardHelper<TCell> = {
  cells(): TCell[];
  cellToWorld(cell: TCell): Point;
  cellCenter(cell: TCell): Point;
  worldToCell(point: Point): TCell | null;
  findOnCell<TItem>(
    cell: TCell,
    items: Iterable<TItem>,
    locator: (item: TItem) => Point,
  ): TItem | null;
};

export function squareGrid(options: SquareGridOptions): BoardHelper<SquareGridCell> {
  const { x, y, rows, cols, cellSize } = options;

  const cells = (): SquareGridCell[] => {
    const result: SquareGridCell[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        result.push({ row, col });
      }
    }
    return result;
  };

  const cellToWorld = (cell: SquareGridCell): Point => ({
    x: x + cell.col * cellSize,
    y: y + cell.row * cellSize,
  });

  const cellCenter = (cell: SquareGridCell): Point => ({
    x: x + cell.col * cellSize + cellSize / 2,
    y: y + cell.row * cellSize + cellSize / 2,
  });

  const worldToCell = (point: Point): SquareGridCell | null => {
    const col = Math.floor((point.x - x) / cellSize);
    const row = Math.floor((point.y - y) / cellSize);
    if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
    return { row, col };
  };

  const findOnCell = <TItem>(
    cell: SquareGridCell,
    items: Iterable<TItem>,
    locator: (item: TItem) => Point,
  ): TItem | null => {
    for (const item of items) {
      const c = worldToCell(locator(item));
      if (c && c.row === cell.row && c.col === cell.col) return item;
    }
    return null;
  };

  return { cells, cellToWorld, cellCenter, worldToCell, findOnCell };
}

// Cube coordinates keep cell identity orientation-agnostic: equality is a plain
// three-component comparison regardless of pointy/flat layout, which is the
// only thing that affects pixel conversion.
export function hexGrid(options: HexGridOptions): BoardHelper<HexCell> {
  const { origin, size, radius } = options;
  const orientation: HexOrientation = options.orientation ?? "pointy";

  const SQRT3 = Math.sqrt(3);

  // Normalize -0 to 0 so cell equality and equality-based assertions don't trip
  // on signed-zero artifacts from `-x - y` style arithmetic.
  const nz = (n: number): number => (n === 0 ? 0 : n);

  const cells = (): HexCell[] => {
    const result: HexCell[] = [];
    for (let x = -radius; x <= radius; x++) {
      const yMin = Math.max(-radius, -x - radius);
      const yMax = Math.min(radius, -x + radius);
      for (let y = yMin; y <= yMax; y++) {
        result.push({ x: nz(x), y: nz(y), z: nz(-x - y) });
      }
    }
    return result;
  };

  const cellCenter = (cell: HexCell): Point => {
    if (orientation === "pointy") {
      return {
        x: origin.x + size * (SQRT3 * cell.x + (SQRT3 / 2) * cell.z),
        y: origin.y + size * ((3 / 2) * cell.z),
      };
    }
    return {
      x: origin.x + size * ((3 / 2) * cell.x),
      y: origin.y + size * ((SQRT3 / 2) * cell.x + SQRT3 * cell.z),
    };
  };

  const cellToWorld = (cell: HexCell): Point => {
    const center = cellCenter(cell);
    const halfWidth = orientation === "pointy" ? (SQRT3 * size) / 2 : size;
    const halfHeight = orientation === "pointy" ? size : (SQRT3 * size) / 2;
    return { x: center.x - halfWidth, y: center.y - halfHeight };
  };

  const cubeRound = (fx: number, fy: number, fz: number): HexCell => {
    let rx = Math.round(fx);
    let ry = Math.round(fy);
    let rz = Math.round(fz);
    const dx = Math.abs(rx - fx);
    const dy = Math.abs(ry - fy);
    const dz = Math.abs(rz - fz);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    return { x: nz(rx), y: nz(ry), z: nz(rz) };
  };

  const hexDistanceFromOrigin = (cell: HexCell): number =>
    (Math.abs(cell.x) + Math.abs(cell.y) + Math.abs(cell.z)) / 2;

  const worldToCell = (point: Point): HexCell | null => {
    const px = point.x - origin.x;
    const py = point.y - origin.y;
    let fx: number;
    let fz: number;
    if (orientation === "pointy") {
      fx = ((SQRT3 / 3) * px - (1 / 3) * py) / size;
      fz = ((2 / 3) * py) / size;
    } else {
      fx = ((2 / 3) * px) / size;
      fz = (-(1 / 3) * px + (SQRT3 / 3) * py) / size;
    }
    const fy = -fx - fz;
    const cell = cubeRound(fx, fy, fz);
    if (hexDistanceFromOrigin(cell) > radius) return null;
    return cell;
  };

  const findOnCell = <TItem>(
    cell: HexCell,
    items: Iterable<TItem>,
    locator: (item: TItem) => Point,
  ): TItem | null => {
    for (const item of items) {
      const c = worldToCell(locator(item));
      if (c && c.x === cell.x && c.y === cell.y && c.z === cell.z) return item;
    }
    return null;
  };

  return { cells, cellToWorld, cellCenter, worldToCell, findOnCell };
}
