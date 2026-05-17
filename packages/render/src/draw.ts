import type { Drawable, Visual } from "./types.ts";

export function drawDrawable<TMeta>(
  ctx: CanvasRenderingContext2D,
  drawable: Drawable<TMeta>,
): void {
  const { x, y, size, visual } = drawable;

  if (visual.type === "rect") {
    drawRect(ctx, x, y, size.width, size.height, visual);
    return;
  }

  if (visual.type === "circle") {
    drawCircle(ctx, x, y, size.width, size.height, visual);
    return;
  }

  if (visual.type === "cylinder") {
    drawCylinder(ctx, x, y, size.width, size.height, visual);
    return;
  }

  drawText(ctx, x, y, visual);
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  visual: Extract<Visual, { type: "rect" }>,
): void {
  const radius = visual.radius ?? 0;
  ctx.beginPath();
  if (radius > 0 && typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.rect(x, y, width, height);
  }
  if (visual.fill !== undefined) {
    ctx.fillStyle = visual.fill;
    ctx.fill();
  }
  if (visual.stroke !== undefined) {
    ctx.strokeStyle = visual.stroke;
    ctx.stroke();
  }
}

function drawCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  visual: Extract<Visual, { type: "circle" }>,
): void {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const radius = Math.min(width, height) / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  if (visual.fill !== undefined) {
    ctx.fillStyle = visual.fill;
    ctx.fill();
  }
  if (visual.stroke !== undefined) {
    ctx.strokeStyle = visual.stroke;
    ctx.stroke();
  }
}

function drawCylinder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  visual: Extract<Visual, { type: "cylinder" }>,
): void {
  const rx = width / 2;
  const ry = Math.min(width * 0.18, height * 0.45);
  const cx = x + rx;
  const topCy = y + ry;
  const bottomCy = y + height - ry;

  if (typeof ctx.ellipse !== "function") {
    drawCircle(ctx, x, y, width, height, {
      type: "circle",
      ...(visual.fill !== undefined && { fill: visual.fill }),
      ...(visual.stroke !== undefined && { stroke: visual.stroke }),
    });
    return;
  }

  const tracePath = (): void => {
    ctx.beginPath();
    ctx.moveTo(cx + rx, topCy);
    ctx.lineTo(cx + rx, bottomCy);
    ctx.ellipse(cx, bottomCy, rx, ry, 0, 0, Math.PI, false);
    ctx.lineTo(cx - rx, topCy);
    ctx.ellipse(cx, topCy, rx, ry, 0, Math.PI, 2 * Math.PI, false);
    ctx.closePath();
  };

  if (visual.fill !== undefined) {
    tracePath();
    ctx.save();
    ctx.fillStyle = visual.fill;
    ctx.filter = "brightness(0.82)";
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.ellipse(cx, topCy, rx, ry, 0, 0, 2 * Math.PI, false);
    ctx.fillStyle = visual.fill;
    ctx.fill();
  }

  if (visual.stroke !== undefined) {
    tracePath();
    ctx.strokeStyle = visual.stroke;
    ctx.stroke();
  }

  const capStroke = visual.capStroke ?? visual.stroke;
  if (capStroke !== undefined) {
    ctx.beginPath();
    ctx.ellipse(cx, topCy, rx, ry, 0, 0, Math.PI, false);
    ctx.strokeStyle = capStroke;
    ctx.stroke();
  }
}

function drawText(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  visual: Extract<Visual, { type: "text" }>,
): void {
  ctx.font = visual.font ?? "16px sans-serif";
  ctx.fillStyle = visual.fill ?? "#000";
  ctx.textBaseline = "top";
  ctx.fillText(visual.text, x, y);
}
