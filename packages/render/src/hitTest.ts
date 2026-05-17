import type { Drawable, HitResult, Point } from "./types.ts";

export function pointInDrawable<TMeta>(drawable: Drawable<TMeta>, point: Point): boolean {
  const { x, y, size } = drawable;
  const hitType = drawable.hitArea?.type ?? "rect";

  if (hitType === "circle") {
    const cx = x + size.width / 2;
    const cy = y + size.height / 2;
    const r = Math.min(size.width, size.height) / 2;
    const dx = point.x - cx;
    const dy = point.y - cy;
    return dx * dx + dy * dy <= r * r;
  }

  return point.x >= x && point.x <= x + size.width && point.y >= y && point.y <= y + size.height;
}

export function hitTestDrawables<TMeta>(
  drawables: Drawable<TMeta>[],
  point: Point,
  exclude?: (drawable: Drawable<TMeta>) => boolean,
): Drawable<TMeta> | null {
  for (let i = drawables.length - 1; i >= 0; i--) {
    const drawable = drawables[i] as Drawable<TMeta>;
    if (exclude !== undefined && exclude(drawable)) continue;
    if (pointInDrawable(drawable, point)) return drawable;
  }
  return null;
}

export function toHitResult<TMeta>(drawable: Drawable<TMeta> | null): HitResult<TMeta> | null {
  if (!drawable) return null;
  if (drawable.stackId === undefined) {
    return {
      type: "entity",
      id: drawable.id,
      ...(drawable.meta !== undefined && { meta: drawable.meta }),
    };
  }
  if (drawable.stackDragMode === "stack") {
    return {
      type: "stack",
      id: drawable.stackId,
      ...(drawable.stackMeta !== undefined && { meta: drawable.stackMeta }),
    };
  }
  return {
    type: "stackItem",
    id: drawable.id,
    ...(drawable.meta !== undefined && { meta: drawable.meta }),
    stackId: drawable.stackId,
    ...(drawable.stackMeta !== undefined && { stackMeta: drawable.stackMeta }),
    index: drawable.stackIndex ?? 0,
  };
}

export function toDragTarget<TMeta>(
  drawable: Drawable<TMeta> | null,
  drawables: Drawable<TMeta>[],
): HitResult<TMeta> | null {
  if (!drawable) return null;
  if (drawable.stackDragMode === "slice-from-item" && drawable.stackId !== undefined) {
    const fromIndex = drawable.stackIndex ?? 0;
    const sliceItems = drawables
      .filter((d) => d.stackId === drawable.stackId && (d.stackIndex ?? -1) >= fromIndex)
      .sort((a, b) => (a.stackIndex ?? 0) - (b.stackIndex ?? 0))
      .map((d) => ({
        id: d.id,
        ...(d.meta !== undefined && { meta: d.meta }),
        index: d.stackIndex ?? 0,
      }));
    return {
      type: "stackSlice",
      stackId: drawable.stackId,
      ...(drawable.stackMeta !== undefined && { stackMeta: drawable.stackMeta }),
      fromIndex,
      items: sliceItems,
    };
  }
  return toHitResult(drawable);
}

export function isInDragGroup<TMeta>(drawable: Drawable<TMeta>, target: HitResult<TMeta>): boolean {
  switch (target.type) {
    case "entity":
      return drawable.id === target.id;
    case "stack":
      return drawable.stackId === target.id;
    case "stackItem":
      return drawable.id === target.id;
    case "stackSlice":
      if (drawable.stackId === target.stackId && (drawable.stackIndex ?? -1) >= target.fromIndex)
        return true;
      return target.items.some((item) => item.id === drawable.id);
  }
}
