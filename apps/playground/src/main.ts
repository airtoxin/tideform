import "./style.css";
import {
  createRenderer,
  type HitResult,
  type Renderer,
  type Scene,
  type SceneItem,
} from "@tideform/render";
import { hexGrid, type HexCell, squareGrid, type SquareGridCell } from "@tideform/render/boards";

type Meta =
  | { type: "card"; cardId: string }
  | { type: "piece"; pieceId: string }
  | { type: "stack"; stackId: string };

type Position = { x: number; y: number };

type Card = {
  id: string;
  x: number;
  y: number;
};

type Deck = {
  id: "deck";
  x: number;
  y: number;
  cards: { id: string }[];
};

type StackPiece = { id: string; color: string };

type Board = "square" | "hex";

type Pile = {
  id: string;
  board: Board;
  x: number;
  y: number;
  pieces: StackPiece[];
};

const PIECE_WIDTH = 56;
const PIECE_HEIGHT = 40;

const deck: Deck = {
  id: "deck",
  x: 80,
  y: 100,
  cards: [{ id: "deck-1" }, { id: "deck-2" }, { id: "deck-3" }, { id: "deck-4" }],
};

const cards: Card[] = [
  { id: "card-A", x: 360, y: 80 },
  { id: "card-B", x: 460, y: 80 },
  { id: "card-C", x: 560, y: 80 },
];

const GRID_CELL_SIZE = 56;
const grid = squareGrid({ x: 320, y: 210, rows: 2, cols: 8, cellSize: GRID_CELL_SIZE });

const HEX_SIZE = 40;
const HEX_RADIUS = 2;
const HEX_ORIGIN = { x: 400, y: 580 };
const hex = hexGrid({
  origin: HEX_ORIGIN,
  size: HEX_SIZE,
  radius: HEX_RADIUS,
  orientation: "pointy",
});

function hexCellTopLeftFor(piece: { width: number; height: number }, cell: HexCell): Position {
  const center = hex.cellCenter(cell);
  return { x: center.x - piece.width / 2, y: center.y - piece.height / 2 };
}

const piles: Pile[] = [
  {
    id: "pile-tower",
    board: "square",
    x: 200,
    y: 320,
    pieces: [
      { id: "stk-p1", color: "#1f1f1f" },
      { id: "stk-p2", color: "#fafafa" },
      { id: "stk-p3", color: "#1f1f1f" },
      { id: "stk-p4", color: "#fafafa" },
    ],
  },
  { id: "pile-A", board: "square", x: 380, y: 380, pieces: [{ id: "p-A", color: "#1f1f1f" }] },
  { id: "pile-B", board: "square", x: 460, y: 380, pieces: [{ id: "p-B", color: "#fafafa" }] },
  { id: "pile-C", board: "square", x: 540, y: 380, pieces: [{ id: "p-C", color: "#1f1f1f" }] },
  { id: "pile-D", board: "square", x: 620, y: 380, pieces: [{ id: "p-D", color: "#fafafa" }] },
];

// Seed a few hex piles so the cube-coords layout is visible without dragging.
const hexSeed: { cell: HexCell; pieces: StackPiece[] }[] = [
  {
    cell: { x: 0, y: 0, z: 0 },
    pieces: [
      { id: "hx-1a", color: "#1f1f1f" },
      { id: "hx-1b", color: "#fafafa" },
      { id: "hx-1c", color: "#1f1f1f" },
    ],
  },
  { cell: { x: 1, y: -1, z: 0 }, pieces: [{ id: "hx-2", color: "#fafafa" }] },
  { cell: { x: -1, y: 0, z: 1 }, pieces: [{ id: "hx-3", color: "#1f1f1f" }] },
];

for (const seed of hexSeed) {
  const topLeft = hexCellTopLeftFor({ width: PIECE_WIDTH, height: PIECE_HEIGHT }, seed.cell);
  piles.push({
    id: `hpile-${seed.cell.x}-${seed.cell.y}-${seed.cell.z}`,
    board: "hex",
    x: topLeft.x,
    y: topLeft.y,
    pieces: seed.pieces,
  });
}

let newPileCounter = 0;
function newPileId(): string {
  newPileCounter += 1;
  return `pile-${newPileCounter}`;
}

function findCard(id: string): Card | undefined {
  return cards.find((card) => card.id === id);
}

function moveCardToTop(id: string): void {
  const index = cards.findIndex((card) => card.id === id);
  if (index < 0) return;
  const [card] = cards.splice(index, 1);
  if (card) cards.push(card);
}

function findPile(id: string): Pile | undefined {
  return piles.find((pile) => pile.id === id);
}

function removeEmptyPiles(): void {
  for (let i = piles.length - 1; i >= 0; i--) {
    const pile = piles[i];
    if (pile && pile.pieces.length === 0) piles.splice(i, 1);
  }
}

function getEntityPosition(target: HitResult<Meta>): Position | null {
  if (target.type === "entity") return findCard(target.id) ?? null;
  if (target.type === "stack" && target.id === deck.id) return deck;
  return null;
}

function describeTarget(target: HitResult<Meta> | null): string {
  if (target === null) return "—";
  switch (target.type) {
    case "entity":
    case "stack":
    case "stackItem":
      return `${target.type}:${target.id}`;
    case "stackSlice":
      return `stackSlice:${target.stackId}#${target.fromIndex}`;
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#board");
const log = document.querySelector<HTMLPreElement>("#log");
if (!canvas || !log) {
  throw new Error("Required DOM elements not found.");
}

function pileOnSquareCell(cell: SquareGridCell): Pile | null {
  const candidates = piles.filter((p) => p.board === "square" && p.pieces.length > 0);
  return grid.findOnCell(cell, candidates, (p) => ({
    x: p.x + PIECE_WIDTH / 2,
    y: p.y + PIECE_HEIGHT / 2,
  }));
}

function pileOnHexCell(cell: HexCell): Pile | null {
  const candidates = piles.filter((p) => p.board === "hex" && p.pieces.length > 0);
  return hex.findOnCell(cell, candidates, (p) => ({
    x: p.x + PIECE_WIDTH / 2,
    y: p.y + PIECE_HEIGHT / 2,
  }));
}

// Forward-declare so the snap.drag closure can call back into the instance —
// the resolver only runs after createRenderer has returned and assigned this.
let renderer: Renderer<Meta>;
renderer = createRenderer<Meta>({
  canvas,
  snap: {
    drag: ({ target, world, anchor }) => {
      if (target.type !== "stackSlice") return null;
      const source = findPile(target.stackId);
      if (!source) return null;

      if (source.board === "square") {
        const cell = grid.worldToCell(world);
        if (!cell) return null;
        const pile = pileOnSquareCell(cell);
        if (pile && pile.id === target.stackId) {
          // Cursor over the source cell — pin the slice to its original spot.
          return { anchor };
        }
        if (pile) {
          const next = renderer.stackNextAnchor(pile.id);
          if (next) return { anchor: next };
        }
        const cellTopLeft = grid.cellToWorld(cell);
        return {
          anchor: {
            x: cellTopLeft.x + (GRID_CELL_SIZE - PIECE_WIDTH) / 2,
            y: cellTopLeft.y + (GRID_CELL_SIZE - PIECE_HEIGHT) / 2,
          },
        };
      }

      const cell = hex.worldToCell(world);
      if (!cell) return null;
      const pile = pileOnHexCell(cell);
      if (pile && pile.id === target.stackId) {
        return { anchor };
      }
      if (pile) {
        const next = renderer.stackNextAnchor(pile.id);
        if (next) return { anchor: next };
      }
      return {
        anchor: hexCellTopLeftFor({ width: PIECE_WIDTH, height: PIECE_HEIGHT }, cell),
      };
    },
  },
});
renderer.resize(800, 760);

function pieceStrokes(color: string): { stroke: string; capStroke: string } {
  return {
    stroke: "#1f1f1f",
    capStroke: color === "#1f1f1f" ? "#8a8a8a" : "#1f1f1f",
  };
}

function pieceStackItem(piece: StackPiece): {
  id: string;
  size: { width: number; height: number };
  visual: {
    type: "cylinder";
    fill: string;
    stroke: string;
    capStroke: string;
  };
  hitArea: { type: "rect" };
  meta: Meta;
} {
  return {
    id: piece.id,
    size: { width: PIECE_WIDTH, height: PIECE_HEIGHT },
    visual: {
      type: "cylinder",
      fill: piece.color,
      ...pieceStrokes(piece.color),
    },
    hitArea: { type: "rect" },
    meta: { type: "piece", pieceId: piece.id },
  };
}

// Hex visuals aren't in the library yet — circles inscribed in each hex cell
// hint at the snap targets without claiming to be hexagons.
const HEX_INSCRIBED_DIAMETER = Math.round(HEX_SIZE * Math.sqrt(3));

function buildScene(): Scene<Meta> {
  const gridItems: SceneItem<Meta>[] = grid.cells().map((cell) => {
    const pos = grid.cellToWorld(cell);
    return {
      type: "entity",
      id: `grid-${cell.row}-${cell.col}`,
      x: pos.x,
      y: pos.y,
      size: { width: GRID_CELL_SIZE, height: GRID_CELL_SIZE },
      visual: {
        type: "rect",
        fill: (cell.row + cell.col) % 2 === 0 ? "#ede4ce" : "#dccfa9",
        stroke: "#bda878",
      },
    };
  });

  const hexCellItems: SceneItem<Meta>[] = hex.cells().map((cell) => {
    const center = hex.cellCenter(cell);
    return {
      type: "entity",
      id: `hex-${cell.x}-${cell.y}-${cell.z}`,
      x: center.x - HEX_INSCRIBED_DIAMETER / 2,
      y: center.y - HEX_INSCRIBED_DIAMETER / 2,
      size: { width: HEX_INSCRIBED_DIAMETER, height: HEX_INSCRIBED_DIAMETER },
      visual: {
        type: "circle",
        fill: (cell.x - cell.z) % 2 === 0 ? "#ede4ce" : "#dccfa9",
        stroke: "#bda878",
      },
    };
  });

  const items: SceneItem<Meta>[] = [
    ...gridItems,
    ...hexCellItems,
    {
      type: "stack",
      id: deck.id,
      x: deck.x,
      y: deck.y,
      layout: { type: "pile", offset: { x: 0, y: -4 } },
      dragMode: "stack",
      meta: { type: "stack", stackId: deck.id },
      items: deck.cards.map((card) => ({
        id: card.id,
        size: { width: 96, height: 132 },
        visual: { type: "rect", fill: "#fff", stroke: "#333", radius: 10 },
        meta: { type: "card", cardId: card.id },
      })),
    },
    ...cards.map((card) => ({
      type: "entity" as const,
      id: card.id,
      x: card.x,
      y: card.y,
      size: { width: 80, height: 112 },
      visual: {
        type: "rect" as const,
        fill: "#fdf6e3",
        stroke: "#586e75",
        radius: 8,
      },
      draggable: true,
      meta: { type: "card" as const, cardId: card.id },
    })),
  ];

  for (const pile of piles) {
    if (pile.pieces.length === 0) continue;
    items.push({
      type: "stack",
      id: pile.id,
      x: pile.x,
      y: pile.y,
      dragMode: "slice-from-item",
      meta: { type: "stack", stackId: pile.id },
      items: pile.pieces.map(pieceStackItem),
    });
  }

  return { items };
}

renderer.on("dragStart", (event) => {
  log.textContent = `dragStart  ${describeTarget(event.target)}`;
});

renderer.on("dragEnd", (event) => {
  log.textContent = `dragEnd    ${describeTarget(event.target)} → ${describeTarget(event.dropTarget)}`;

  if (event.target.type === "stackSlice") {
    const sourcePile = findPile(event.target.stackId);
    if (!sourcePile) return;
    const slicePieces = sourcePile.pieces.slice(event.target.fromIndex);
    sourcePile.pieces = sourcePile.pieces.slice(0, event.target.fromIndex);

    // The snap is cell-based, so the drop cell matches the snap cell. Look up
    // the pile on that cell directly — dropTarget hit-testing fails when the
    // snap lifts the preview above the destination's pieces.
    let targetPile: Pile | null = null;
    let dropAnchor: Position | null = null;
    if (sourcePile.board === "square") {
      const cellAtDrop = grid.worldToCell(event.world);
      if (cellAtDrop) {
        targetPile = pileOnSquareCell(cellAtDrop);
        if (!targetPile) {
          const topLeft = grid.cellToWorld(cellAtDrop);
          dropAnchor = {
            x: topLeft.x + (GRID_CELL_SIZE - PIECE_WIDTH) / 2,
            y: topLeft.y + (GRID_CELL_SIZE - PIECE_HEIGHT) / 2,
          };
        }
      }
    } else {
      const cellAtDrop = hex.worldToCell(event.world);
      if (cellAtDrop) {
        targetPile = pileOnHexCell(cellAtDrop);
        if (!targetPile) {
          dropAnchor = hexCellTopLeftFor({ width: PIECE_WIDTH, height: PIECE_HEIGHT }, cellAtDrop);
        }
      }
    }

    if (targetPile) {
      targetPile.pieces.push(...slicePieces);
    } else if (dropAnchor) {
      piles.push({
        id: newPileId(),
        board: sourcePile.board,
        x: dropAnchor.x,
        y: dropAnchor.y,
        pieces: slicePieces,
      });
    } else {
      // Dropped off the source's board — return the slice to where it came from.
      sourcePile.pieces.push(...slicePieces);
    }

    removeEmptyPiles();
    renderer.setScene(buildScene());
    return;
  }

  const position = getEntityPosition(event.target);
  if (position) {
    position.x = event.previewAnchor.x;
    position.y = event.previewAnchor.y;
  }

  if (event.target.type === "entity") {
    moveCardToTop(event.target.id);
  }

  renderer.setScene(buildScene());
});

renderer.on("click", (event) => {
  log.textContent = `click      ${describeTarget(event.target)}`;
});

renderer.setScene(buildScene());
