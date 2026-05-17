import type { Drawable, Point, Scene, SceneItem, Size, StackItem, Visual } from "./types.ts";

// 80° in math coords keeps stacks visibly leaning to upper-right while staying
// clear of every neighbor-cell direction on square / flat-top hex / pointy-top
// hex grids (closest forbidden direction is 60°, 20° away).
const DEFAULT_PILE_ANGLE_RAD = (80 * Math.PI) / 180;

// Cylinder visuals echo draw.ts: cap ellipse radius `ry = min(w*0.18, h*0.45)`,
// and stacking pieces by `height - 2*ry` lands each piece's bottom rim exactly
// on the next piece's cap. For non-cylinder visuals there is no rim to align,
// so fall back to a generic fraction of height.
function defaultStackStep(size: Size, visual: Visual): number {
  if (visual.type === "cylinder") {
    const ry = Math.min(size.width * 0.18, size.height * 0.45);
    return size.height - 2 * ry;
  }
  return Math.max(4, size.height * 0.2);
}

function defaultStackOffset(item: StackItem<unknown>): Point {
  const step = defaultStackStep(item.size, item.visual);
  return {
    x: step / Math.tan(DEFAULT_PILE_ANGLE_RAD),
    y: -step,
  };
}

// Render order: entities first in declaration order (board background, free
// floating cards, ...), then stacks sorted by anchor y so back-row piles draw
// before front-row piles. With tilted piles this is required — a back pile's
// top piece otherwise covers an unrelated cell that is closer to the viewer.
function sortSceneItems<TMeta>(items: SceneItem<TMeta>[]): SceneItem<TMeta>[] {
  return [...items].sort((a, b) => {
    if (a.type === "stack" && b.type === "stack") return a.y - b.y;
    if (a.type === "stack") return 1;
    if (b.type === "stack") return -1;
    return 0;
  });
}

export function flattenScene<TMeta>(scene: Scene<TMeta>): Drawable<TMeta>[] {
  const drawables: Drawable<TMeta>[] = [];
  let order = 0;

  for (const item of sortSceneItems(scene.items)) {
    if (item.type === "entity") {
      drawables.push({
        id: item.id,
        x: item.x,
        y: item.y,
        size: item.size,
        visual: item.visual,
        ...(item.hitArea !== undefined && { hitArea: item.hitArea }),
        ...(item.draggable !== undefined && { draggable: item.draggable }),
        ...(item.meta !== undefined && { meta: item.meta }),
        order: order++,
      });
      continue;
    }

    const first = item.items[0];
    const offset = item.layout?.offset ?? (first ? defaultStackOffset(first) : { x: 0, y: 0 });
    const dragMode = item.dragMode ?? "none";
    const stackDraggable = dragMode !== "none";
    item.items.forEach((stackItem, index) => {
      drawables.push({
        id: stackItem.id,
        stackId: item.id,
        stackIndex: index,
        stackDragMode: dragMode,
        stackOffset: offset,
        x: item.x + offset.x * index,
        y: item.y + offset.y * index,
        size: stackItem.size,
        visual: stackItem.visual,
        ...(item.meta !== undefined && { stackMeta: item.meta }),
        ...(stackItem.hitArea !== undefined && { hitArea: stackItem.hitArea }),
        ...(stackDraggable && { draggable: true as const }),
        ...(stackItem.meta !== undefined && { meta: stackItem.meta }),
        order: order++,
      });
    });
  }

  return drawables;
}
