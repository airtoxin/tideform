import { afterEach, beforeEach, expect, test } from "vite-plus/test";
import { createRenderer } from "../src/render.ts";
import type { DragSnapContext, HitResult, Point } from "../src/types.ts";

type MockCtxCall = { method: string; args: unknown[] };

type MockContext = {
  calls: MockCtxCall[];
  save: (...args: unknown[]) => void;
  restore: (...args: unknown[]) => void;
  setTransform: (...args: unknown[]) => void;
  clearRect: (...args: unknown[]) => void;
  scale: (...args: unknown[]) => void;
  beginPath: (...args: unknown[]) => void;
  rect: (...args: unknown[]) => void;
  roundRect: (...args: unknown[]) => void;
  arc: (...args: unknown[]) => void;
  fill: (...args: unknown[]) => void;
  stroke: (...args: unknown[]) => void;
  fillText: (...args: unknown[]) => void;
  fillStyle: string;
  strokeStyle: string;
  font: string;
  textBaseline: CanvasTextBaseline;
};

function createMockContext(): MockContext {
  const calls: MockCtxCall[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]): void => {
      calls.push({ method, args });
    };
  return {
    calls,
    save: record("save"),
    restore: record("restore"),
    setTransform: record("setTransform"),
    clearRect: record("clearRect"),
    scale: record("scale"),
    beginPath: record("beginPath"),
    rect: record("rect"),
    roundRect: record("roundRect"),
    arc: record("arc"),
    fill: record("fill"),
    stroke: record("stroke"),
    fillText: record("fillText"),
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textBaseline: "alphabetic",
  };
}

type CanvasHandlers = Map<string, Set<(event: PointerEvent) => void>>;

type MockCanvasHarness = {
  canvas: HTMLCanvasElement;
  ctx: MockContext;
  fire: (type: string, event: Partial<PointerEvent>) => void;
  pointerCaptured: number[];
  pointerReleased: number[];
};

function createMockCanvas(): MockCanvasHarness {
  const ctx = createMockContext();
  const handlers: CanvasHandlers = new Map();
  const pointerCaptured: number[] = [];
  const pointerReleased: number[] = [];

  const obj = {
    width: 800,
    height: 600,
    style: { width: "", height: "" } as Record<string, string>,
    getContext(type: string): MockContext | null {
      return type === "2d" ? ctx : null;
    },
    addEventListener(type: string, handler: (event: PointerEvent) => void): void {
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(handler);
    },
    removeEventListener(type: string, handler: (event: PointerEvent) => void): void {
      handlers.get(type)?.delete(handler);
    },
    getBoundingClientRect(): DOMRect {
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: obj.width,
        bottom: obj.height,
        width: obj.width,
        height: obj.height,
        toJSON: () => ({}),
      } as DOMRect;
    },
    setPointerCapture(id: number): void {
      pointerCaptured.push(id);
    },
    releasePointerCapture(id: number): void {
      pointerReleased.push(id);
    },
  };

  const fire = (type: string, event: Partial<PointerEvent>): void => {
    const set = handlers.get(type);
    if (!set) return;
    for (const handler of set) handler(event as PointerEvent);
  };

  return {
    canvas: obj as unknown as HTMLCanvasElement,
    ctx,
    fire,
    pointerCaptured,
    pointerReleased,
  };
}

let rafQueue: ((time: number) => void)[] = [];
let originalRaf: typeof globalThis.requestAnimationFrame | undefined;

beforeEach(() => {
  rafQueue = [];
  originalRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = ((cb: (time: number) => void) => {
    rafQueue.push(cb);
    return rafQueue.length;
  }) as typeof requestAnimationFrame;
});

afterEach(() => {
  if (originalRaf !== undefined) {
    globalThis.requestAnimationFrame = originalRaf;
  }
});

function flushRaf(): void {
  const queue = rafQueue;
  rafQueue = [];
  for (const cb of queue) cb(0);
}

test("setScene defers rendering until next animation frame", () => {
  const { canvas, ctx } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  renderer.setScene({
    items: [
      {
        type: "entity",
        id: "a",
        x: 0,
        y: 0,
        size: { width: 50, height: 50 },
        visual: { type: "rect", fill: "#fff" },
      },
    ],
  });

  expect(ctx.calls.find((c) => c.method === "rect")).toBeUndefined();
  flushRaf();
  expect(ctx.calls.find((c) => c.method === "rect")).toBeDefined();
});

test("multiple setScene calls coalesce into a single rAF", () => {
  const { canvas } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  renderer.setScene({ items: [] });
  renderer.setScene({ items: [] });
  renderer.setScene({ items: [] });
  expect(rafQueue).toHaveLength(1);
  flushRaf();

  renderer.setScene({ items: [] });
  expect(rafQueue).toHaveLength(1);
});

test("render scales context by pixelRatio", () => {
  const { canvas, ctx } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 2 });

  renderer.setScene({ items: [] });
  flushRaf();

  const scaleCall = ctx.calls.find((c) => c.method === "scale");
  expect(scaleCall?.args).toEqual([2, 2]);
});

test("resize updates buffer size, CSS size, and triggers redraw", () => {
  const { canvas } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 2 });

  renderer.resize(400, 300);
  expect(canvas.width).toBe(800);
  expect(canvas.height).toBe(600);
  expect(canvas.style.width).toBe("400px");
  expect(canvas.style.height).toBe("300px");
  expect(rafQueue).toHaveLength(1);
});

test("hitTest returns the topmost drawable as an entity result", () => {
  const { canvas } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  renderer.setScene({
    items: [
      {
        type: "entity",
        id: "back",
        x: 0,
        y: 0,
        size: { width: 100, height: 100 },
        visual: { type: "rect" },
      },
      {
        type: "entity",
        id: "front",
        x: 20,
        y: 20,
        size: { width: 30, height: 30 },
        visual: { type: "rect" },
      },
    ],
  });

  expect(renderer.hitTest({ x: 25, y: 25 })).toEqual({
    type: "entity",
    id: "front",
    meta: undefined,
  });
  expect(renderer.hitTest({ x: 5, y: 5 })).toEqual({
    type: "entity",
    id: "back",
    meta: undefined,
  });
  expect(renderer.hitTest({ x: 200, y: 200 })).toBeNull();
});

test("on returns a cleanup that detaches the handler", () => {
  const { canvas, fire } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  let calls = 0;
  const off = renderer.on("click", () => {
    calls++;
  });

  fire("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
  fire("pointerup", { pointerId: 1, clientX: 10, clientY: 10 });
  expect(calls).toBe(1);

  off();
  fire("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
  fire("pointerup", { pointerId: 1, clientX: 10, clientY: 10 });
  expect(calls).toBe(1);
});

test("click event reports the entity hit at pointerup", () => {
  type Meta = { kind: "card"; id: string };
  const { canvas, fire } = createMockCanvas();
  const renderer = createRenderer<Meta>({ canvas, pixelRatio: 1 });

  renderer.setScene({
    items: [
      {
        type: "entity",
        id: "card-1",
        x: 0,
        y: 0,
        size: { width: 80, height: 100 },
        visual: { type: "rect" },
        meta: { kind: "card", id: "card-1" },
      },
    ],
  });

  const received: (HitResult<Meta> | null)[] = [];
  renderer.on("click", (event) => {
    received.push(event.target);
  });

  fire("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
  fire("pointerup", { pointerId: 1, clientX: 10, clientY: 10 });

  expect(received).toEqual([
    {
      type: "entity",
      id: "card-1",
      meta: { kind: "card", id: "card-1" },
    },
  ]);
});

test("click event reports null target when pressed in empty space", () => {
  const { canvas, fire } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  const received: (HitResult | null)[] = [];
  renderer.on("click", (event) => {
    received.push(event.target);
  });

  fire("pointerdown", { pointerId: 1, clientX: 5, clientY: 5 });
  fire("pointerup", { pointerId: 1, clientX: 5, clientY: 5 });

  expect(received).toEqual([null]);
});

test("draggable item: dragStart fires once, then dragMove per move, then dragEnd", () => {
  const { canvas, fire } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  renderer.setScene({
    items: [
      {
        type: "entity",
        id: "drag",
        x: 0,
        y: 0,
        size: { width: 100, height: 100 },
        visual: { type: "rect" },
        draggable: true,
      },
    ],
  });

  const events: string[] = [];
  renderer.on("dragStart", () => events.push("dragStart"));
  renderer.on("dragMove", () => events.push("dragMove"));
  renderer.on("dragEnd", () => events.push("dragEnd"));
  renderer.on("click", () => events.push("click"));

  fire("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
  fire("pointermove", { pointerId: 1, clientX: 20, clientY: 15 });
  fire("pointermove", { pointerId: 1, clientX: 30, clientY: 25 });
  fire("pointerup", { pointerId: 1, clientX: 30, clientY: 25 });

  expect(events).toEqual(["dragStart", "dragMove", "dragMove", "dragEnd"]);
});

test("dragStart / dragMove / dragEnd report the dragged entity as target", () => {
  type Meta = { kind: "card"; id: string };
  const { canvas, fire } = createMockCanvas();
  const renderer = createRenderer<Meta>({ canvas, pixelRatio: 1 });

  renderer.setScene({
    items: [
      {
        type: "entity",
        id: "drag",
        x: 0,
        y: 0,
        size: { width: 100, height: 100 },
        visual: { type: "rect" },
        draggable: true,
        meta: { kind: "card", id: "drag" },
      },
    ],
  });

  const targets: HitResult<Meta>[] = [];
  renderer.on("dragStart", (event) => targets.push(event.target));
  renderer.on("dragMove", (event) => targets.push(event.target));
  renderer.on("dragEnd", (event) => targets.push(event.target));

  fire("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
  fire("pointermove", { pointerId: 1, clientX: 20, clientY: 20 });
  fire("pointerup", { pointerId: 1, clientX: 20, clientY: 20 });

  for (const target of targets) {
    expect(target).toEqual({
      type: "entity",
      id: "drag",
      meta: { kind: "card", id: "drag" },
    });
  }
  expect(targets).toHaveLength(3);
});

test("dragMove delta is per-step difference from previous world position", () => {
  const { canvas, fire } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  renderer.setScene({
    items: [
      {
        type: "entity",
        id: "drag",
        x: 0,
        y: 0,
        size: { width: 100, height: 100 },
        visual: { type: "rect" },
        draggable: true,
      },
    ],
  });

  const deltas: { x: number; y: number }[] = [];
  renderer.on("dragMove", (event) => {
    deltas.push(event.delta);
  });

  fire("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
  fire("pointermove", { pointerId: 1, clientX: 15, clientY: 12 });
  fire("pointermove", { pointerId: 1, clientX: 25, clientY: 22 });
  fire("pointerup", { pointerId: 1, clientX: 25, clientY: 22 });

  expect(deltas).toEqual([
    { x: 5, y: 2 },
    { x: 10, y: 10 },
  ]);
});

test("dragEnd dropTarget reflects the drawable hit at pointerup", () => {
  const { canvas, fire } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  renderer.setScene({
    items: [
      {
        type: "entity",
        id: "src",
        x: 0,
        y: 0,
        size: { width: 50, height: 50 },
        visual: { type: "rect" },
        draggable: true,
      },
      {
        type: "entity",
        id: "dst",
        x: 100,
        y: 100,
        size: { width: 50, height: 50 },
        visual: { type: "rect" },
      },
    ],
  });

  const dropTargets: (HitResult | null)[] = [];
  renderer.on("dragEnd", (event) => {
    dropTargets.push(event.dropTarget);
  });

  fire("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
  fire("pointermove", { pointerId: 1, clientX: 120, clientY: 120 });
  fire("pointerup", { pointerId: 1, clientX: 120, clientY: 120 });

  expect(dropTargets).toEqual([{ type: "entity", id: "dst", meta: undefined }]);
});

test("non-draggable hit emits click only, never drag events", () => {
  const { canvas, fire } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  renderer.setScene({
    items: [
      {
        type: "entity",
        id: "static",
        x: 0,
        y: 0,
        size: { width: 100, height: 100 },
        visual: { type: "rect" },
      },
    ],
  });

  const events: string[] = [];
  renderer.on("dragStart", () => events.push("dragStart"));
  renderer.on("dragMove", () => events.push("dragMove"));
  renderer.on("dragEnd", () => events.push("dragEnd"));
  renderer.on("click", () => events.push("click"));

  fire("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
  fire("pointermove", { pointerId: 1, clientX: 20, clientY: 20 });
  fire("pointerup", { pointerId: 1, clientX: 20, clientY: 20 });

  expect(events).toEqual(["click"]);
});

test("pointer capture is requested on pointerdown and released on pointerup", () => {
  const { canvas, fire, pointerCaptured, pointerReleased } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  renderer.setScene({ items: [] });
  fire("pointerdown", { pointerId: 7, clientX: 0, clientY: 0 });
  fire("pointerup", { pointerId: 7, clientX: 0, clientY: 0 });

  expect(pointerCaptured).toContain(7);
  expect(pointerReleased).toContain(7);
});

test("destroy detaches listeners and cancels future renders", () => {
  const { canvas, ctx, fire } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  let clicks = 0;
  renderer.on("click", () => {
    clicks++;
  });

  renderer.setScene({ items: [] });
  renderer.destroy();

  flushRaf();
  expect(ctx.calls.find((c) => c.method === "scale")).toBeUndefined();

  fire("pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
  fire("pointerup", { pointerId: 1, clientX: 0, clientY: 0 });
  expect(clicks).toBe(0);
});

const hoistScene = {
  items: [
    {
      type: "entity" as const,
      id: "dragged",
      x: 10,
      y: 10,
      size: { width: 50, height: 50 },
      visual: { type: "rect" as const },
      draggable: true,
    },
    {
      type: "entity" as const,
      id: "other",
      x: 200,
      y: 10,
      size: { width: 50, height: 50 },
      visual: { type: "rect" as const },
    },
  ],
};

test("dragging item is rendered last (on top) during drag", () => {
  const { canvas, ctx, fire } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  renderer.setScene(hoistScene);
  flushRaf();
  expect(ctx.calls.filter((c) => c.method === "rect").map((c) => c.args[0])).toEqual([10, 200]);

  ctx.calls.length = 0;
  fire("pointerdown", { pointerId: 1, clientX: 25, clientY: 25 });
  fire("pointermove", { pointerId: 1, clientX: 30, clientY: 30 });
  flushRaf();

  expect(ctx.calls.filter((c) => c.method === "rect").map((c) => c.args[0])).toEqual([200, 15]);
});

test("dragEnd restores normal render order", () => {
  const { canvas, ctx, fire } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  renderer.setScene(hoistScene);
  flushRaf();

  fire("pointerdown", { pointerId: 1, clientX: 25, clientY: 25 });
  fire("pointermove", { pointerId: 1, clientX: 30, clientY: 30 });
  flushRaf();
  fire("pointerup", { pointerId: 1, clientX: 30, clientY: 30 });

  ctx.calls.length = 0;
  flushRaf();

  expect(ctx.calls.filter((c) => c.method === "rect").map((c) => c.args[0])).toEqual([10, 200]);
});

test("pointercancel restores normal render order", () => {
  const { canvas, ctx, fire } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  renderer.setScene(hoistScene);
  flushRaf();

  fire("pointerdown", { pointerId: 1, clientX: 25, clientY: 25 });
  fire("pointermove", { pointerId: 1, clientX: 30, clientY: 30 });
  flushRaf();
  fire("pointercancel", { pointerId: 1, clientX: 30, clientY: 30 });

  ctx.calls.length = 0;
  flushRaf();

  expect(ctx.calls.filter((c) => c.method === "rect").map((c) => c.args[0])).toEqual([10, 200]);
});

test("dragStart reports the pointerdown position as world", () => {
  const { canvas, fire } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  renderer.setScene({
    items: [
      {
        type: "entity",
        id: "drag",
        x: 0,
        y: 0,
        size: { width: 100, height: 100 },
        visual: { type: "rect" },
        draggable: true,
      },
    ],
  });

  const starts: { world: { x: number; y: number }; screen: { x: number; y: number } }[] = [];
  renderer.on("dragStart", (event) => {
    starts.push({ world: event.world, screen: event.screen });
  });

  fire("pointerdown", { pointerId: 1, clientX: 12, clientY: 8 });
  fire("pointermove", { pointerId: 1, clientX: 25, clientY: 20 });
  fire("pointerup", { pointerId: 1, clientX: 25, clientY: 20 });

  expect(starts).toEqual([{ world: { x: 12, y: 8 }, screen: { x: 12, y: 8 } }]);
});

test("dragging item follows the pointer without setScene calls", () => {
  const { canvas, ctx, fire } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  renderer.setScene(hoistScene);
  flushRaf();

  fire("pointerdown", { pointerId: 1, clientX: 25, clientY: 25 });
  fire("pointermove", { pointerId: 1, clientX: 40, clientY: 35 });
  ctx.calls.length = 0;
  flushRaf();

  const positions = ctx.calls
    .filter((c) => c.method === "rect")
    .map((c) => ({ x: c.args[0], y: c.args[1] }));
  expect(positions).toEqual([
    { x: 200, y: 10 },
    { x: 25, y: 20 },
  ]);

  fire("pointermove", { pointerId: 1, clientX: 60, clientY: 50 });
  ctx.calls.length = 0;
  flushRaf();

  const positions2 = ctx.calls
    .filter((c) => c.method === "rect")
    .map((c) => ({ x: c.args[0], y: c.args[1] }));
  expect(positions2).toEqual([
    { x: 200, y: 10 },
    { x: 45, y: 35 },
  ]);
});

test("dragMode 'slice-from-item' hides the original slice while dragging", () => {
  const { canvas, ctx, fire } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  renderer.setScene({
    items: [
      {
        type: "stack",
        id: "tab",
        x: 0,
        y: 0,
        dragMode: "slice-from-item",
        layout: { type: "pile", offset: { x: 0, y: -120 } },
        items: [
          { id: "c0", size: { width: 80, height: 100 }, visual: { type: "rect" } },
          { id: "c1", size: { width: 80, height: 100 }, visual: { type: "rect" } },
          { id: "c2", size: { width: 80, height: 100 }, visual: { type: "rect" } },
        ],
      },
    ],
  });
  flushRaf();

  fire("pointerdown", { pointerId: 1, clientX: 40, clientY: -60 });
  fire("pointermove", { pointerId: 1, clientX: 60, clientY: -40 });
  ctx.calls.length = 0;
  flushRaf();

  const positions = ctx.calls
    .filter((c) => c.method === "rect")
    .map((c) => ({ x: c.args[0], y: c.args[1] }));
  expect(positions).toEqual([
    { x: 0, y: 0 },
    { x: 20, y: -100 },
    { x: 20, y: -220 },
  ]);
});

test("click without drag does not change render order", () => {
  const { canvas, ctx, fire } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  renderer.setScene(hoistScene);
  flushRaf();

  ctx.calls.length = 0;
  fire("pointerdown", { pointerId: 1, clientX: 25, clientY: 25 });
  fire("pointerup", { pointerId: 1, clientX: 25, clientY: 25 });
  flushRaf();

  expect(ctx.calls.filter((c) => c.method === "rect").map((c) => c.args[0])).toEqual([]);
});

test("hitTest accepts an excludeId option", () => {
  const { canvas } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  renderer.setScene({
    items: [
      {
        type: "entity",
        id: "back",
        x: 0,
        y: 0,
        size: { width: 100, height: 100 },
        visual: { type: "rect" },
      },
      {
        type: "entity",
        id: "front",
        x: 0,
        y: 0,
        size: { width: 100, height: 100 },
        visual: { type: "rect" },
      },
    ],
  });

  expect(renderer.hitTest({ x: 50, y: 50 })).toEqual({
    type: "entity",
    id: "front",
    meta: undefined,
  });
  expect(renderer.hitTest({ x: 50, y: 50 }, { excludeId: "front" })).toEqual({
    type: "entity",
    id: "back",
    meta: undefined,
  });
});

test("dragMode 'stack': events report the stack as target", () => {
  type Meta = { kind: "card"; cardId: string } | { kind: "deck"; deckId: string };
  const { canvas, fire } = createMockCanvas();
  const renderer = createRenderer<Meta>({ canvas, pixelRatio: 1 });

  renderer.setScene({
    items: [
      {
        type: "stack",
        id: "deck",
        x: 0,
        y: 0,
        dragMode: "stack",
        meta: { kind: "deck", deckId: "main" },
        items: [
          {
            id: "c1",
            size: { width: 80, height: 100 },
            visual: { type: "rect" },
            meta: { kind: "card", cardId: "c1" },
          },
          {
            id: "c2",
            size: { width: 80, height: 100 },
            visual: { type: "rect" },
            meta: { kind: "card", cardId: "c2" },
          },
        ],
      },
    ],
  });

  const targets: HitResult<Meta>[] = [];
  renderer.on("dragStart", (event) => targets.push(event.target));
  renderer.on("dragEnd", (event) => targets.push(event.target));

  fire("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
  fire("pointermove", { pointerId: 1, clientX: 20, clientY: 20 });
  fire("pointerup", { pointerId: 1, clientX: 20, clientY: 20 });

  expect(targets).toEqual([
    { type: "stack", id: "deck", meta: { kind: "deck", deckId: "main" } },
    { type: "stack", id: "deck", meta: { kind: "deck", deckId: "main" } },
  ]);
});

test("dragMode 'stack': hoists every drawable in the dragged stack", () => {
  const { canvas, ctx, fire } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  renderer.setScene({
    items: [
      {
        type: "stack",
        id: "deck",
        x: 0,
        y: 0,
        dragMode: "stack",
        layout: { type: "pile", offset: { x: 0, y: -4 } },
        items: [
          {
            id: "c1",
            size: { width: 80, height: 100 },
            visual: { type: "rect" },
          },
          {
            id: "c2",
            size: { width: 80, height: 100 },
            visual: { type: "rect" },
          },
        ],
      },
      {
        type: "entity",
        id: "other",
        x: 200,
        y: 0,
        size: { width: 50, height: 50 },
        visual: { type: "rect" },
      },
    ],
  });
  flushRaf();

  ctx.calls.length = 0;
  fire("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
  fire("pointermove", { pointerId: 1, clientX: 20, clientY: 20 });
  flushRaf();

  const ys = ctx.calls.filter((c) => c.method === "rect").map((c) => c.args[1]);
  expect(ys).toEqual([0, 10, 6]);
});

test("dragMode 'stack': dropTarget excludes every member of the dragged stack", () => {
  const { canvas, fire } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  renderer.setScene({
    items: [
      {
        type: "entity",
        id: "zone",
        x: 0,
        y: 0,
        size: { width: 200, height: 200 },
        visual: { type: "rect" },
      },
      {
        type: "stack",
        id: "deck",
        x: 50,
        y: 50,
        dragMode: "stack",
        items: [
          {
            id: "c1",
            size: { width: 80, height: 100 },
            visual: { type: "rect" },
          },
          {
            id: "c2",
            size: { width: 80, height: 100 },
            visual: { type: "rect" },
          },
        ],
      },
    ],
  });

  const dropTargets: (HitResult | null)[] = [];
  renderer.on("dragEnd", (event) => {
    dropTargets.push(event.dropTarget);
  });

  fire("pointerdown", { pointerId: 1, clientX: 70, clientY: 70 });
  fire("pointermove", { pointerId: 1, clientX: 80, clientY: 80 });
  fire("pointerup", { pointerId: 1, clientX: 80, clientY: 80 });

  expect(dropTargets[0]).toEqual({
    type: "entity",
    id: "zone",
    meta: undefined,
  });
});

test("dragMode 'item': events report a single stackItem target", () => {
  type Meta = { kind: "card"; cardId: string };
  const { canvas, fire } = createMockCanvas();
  const renderer = createRenderer<Meta>({ canvas, pixelRatio: 1 });

  renderer.setScene({
    items: [
      {
        type: "stack",
        id: "hand",
        x: 0,
        y: 0,
        dragMode: "item",
        layout: { type: "pile", offset: { x: 0, y: -120 } },
        items: [
          {
            id: "c0",
            size: { width: 80, height: 100 },
            visual: { type: "rect" },
            meta: { kind: "card", cardId: "c0" },
          },
          {
            id: "c1",
            size: { width: 80, height: 100 },
            visual: { type: "rect" },
            meta: { kind: "card", cardId: "c1" },
          },
          {
            id: "c2",
            size: { width: 80, height: 100 },
            visual: { type: "rect" },
            meta: { kind: "card", cardId: "c2" },
          },
        ],
      },
    ],
  });

  const targets: HitResult<Meta>[] = [];
  renderer.on("dragStart", (event) => targets.push(event.target));

  fire("pointerdown", { pointerId: 1, clientX: 40, clientY: -60 });
  fire("pointermove", { pointerId: 1, clientX: 50, clientY: -60 });

  expect(targets).toEqual([
    {
      type: "stackItem",
      id: "c1",
      meta: { kind: "card", cardId: "c1" },
      stackId: "hand",
      stackMeta: undefined,
      index: 1,
    },
  ]);
});

test("dragMode 'item': hoists only the hit item", () => {
  const { canvas, ctx, fire } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  renderer.setScene({
    items: [
      {
        type: "stack",
        id: "hand",
        x: 0,
        y: 0,
        dragMode: "item",
        layout: { type: "pile", offset: { x: 0, y: -120 } },
        items: [
          {
            id: "c0",
            size: { width: 80, height: 100 },
            visual: { type: "rect" },
          },
          {
            id: "c1",
            size: { width: 80, height: 100 },
            visual: { type: "rect" },
          },
          {
            id: "c2",
            size: { width: 80, height: 100 },
            visual: { type: "rect" },
          },
        ],
      },
    ],
  });
  flushRaf();

  ctx.calls.length = 0;
  fire("pointerdown", { pointerId: 1, clientX: 40, clientY: -60 });
  fire("pointermove", { pointerId: 1, clientX: 50, clientY: -60 });
  flushRaf();

  const ys = ctx.calls.filter((c) => c.method === "rect").map((c) => c.args[1]);
  expect(ys).toEqual([0, -240, -120]);
});

test("dragMode 'slice-from-item': target is a stackSlice from the hit index", () => {
  type Meta = { kind: "card"; cardId: string };
  const { canvas, fire } = createMockCanvas();
  const renderer = createRenderer<Meta>({ canvas, pixelRatio: 1 });

  renderer.setScene({
    items: [
      {
        type: "stack",
        id: "tab",
        x: 0,
        y: 0,
        dragMode: "slice-from-item",
        layout: { type: "pile", offset: { x: 0, y: -120 } },
        items: [
          {
            id: "c0",
            size: { width: 80, height: 100 },
            visual: { type: "rect" },
            meta: { kind: "card", cardId: "c0" },
          },
          {
            id: "c1",
            size: { width: 80, height: 100 },
            visual: { type: "rect" },
            meta: { kind: "card", cardId: "c1" },
          },
          {
            id: "c2",
            size: { width: 80, height: 100 },
            visual: { type: "rect" },
            meta: { kind: "card", cardId: "c2" },
          },
        ],
      },
    ],
  });

  const targets: HitResult<Meta>[] = [];
  renderer.on("dragStart", (event) => targets.push(event.target));

  fire("pointerdown", { pointerId: 1, clientX: 40, clientY: -60 });
  fire("pointermove", { pointerId: 1, clientX: 50, clientY: -60 });

  expect(targets).toEqual([
    {
      type: "stackSlice",
      stackId: "tab",
      stackMeta: undefined,
      fromIndex: 1,
      items: [
        { id: "c1", meta: { kind: "card", cardId: "c1" }, index: 1 },
        { id: "c2", meta: { kind: "card", cardId: "c2" }, index: 2 },
      ],
    },
  ]);
});

test("dragMode 'slice-from-item': hoists hit item and items above to the top", () => {
  const { canvas, ctx, fire } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  renderer.setScene({
    items: [
      {
        type: "stack",
        id: "tab",
        x: 0,
        y: 0,
        dragMode: "slice-from-item",
        layout: { type: "pile", offset: { x: 0, y: -120 } },
        items: [
          {
            id: "c0",
            size: { width: 80, height: 100 },
            visual: { type: "rect" },
          },
          {
            id: "c1",
            size: { width: 80, height: 100 },
            visual: { type: "rect" },
          },
          {
            id: "c2",
            size: { width: 80, height: 100 },
            visual: { type: "rect" },
          },
        ],
      },
      {
        type: "entity",
        id: "other",
        x: 300,
        y: 0,
        size: { width: 50, height: 50 },
        visual: { type: "rect" },
      },
    ],
  });
  flushRaf();

  ctx.calls.length = 0;
  fire("pointerdown", { pointerId: 1, clientX: 40, clientY: -60 });
  fire("pointermove", { pointerId: 1, clientX: 50, clientY: -60 });
  flushRaf();

  const ys = ctx.calls.filter((c) => c.method === "rect").map((c) => c.args[1]);
  expect(ys).toEqual([0, 0, -120, -240]);
});

const draggableScene = {
  items: [
    {
      type: "entity" as const,
      id: "drag",
      x: 0,
      y: 0,
      size: { width: 100, height: 100 },
      visual: { type: "rect" as const },
      draggable: true,
    },
  ],
};

test("snap.drag receives context with target, world, delta, startWorld and previousPreviewWorld", () => {
  const { canvas, fire } = createMockCanvas();
  const contexts: DragSnapContext[] = [];
  const renderer = createRenderer({
    canvas,
    pixelRatio: 1,
    snap: {
      drag: (context) => {
        contexts.push(context);
        return null;
      },
    },
  });

  renderer.setScene(draggableScene);

  fire("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
  fire("pointermove", { pointerId: 1, clientX: 25, clientY: 18 });
  fire("pointermove", { pointerId: 1, clientX: 40, clientY: 30 });
  fire("pointerup", { pointerId: 1, clientX: 40, clientY: 30 });

  expect(contexts).toHaveLength(3);
  expect(contexts[0]).toMatchObject({
    target: { type: "entity", id: "drag" },
    world: { x: 25, y: 18 },
    delta: { x: 15, y: 8 },
    startWorld: { x: 10, y: 10 },
    previousPreviewWorld: { x: 10, y: 10 },
  });
  expect(contexts[1]).toMatchObject({
    world: { x: 40, y: 30 },
    delta: { x: 15, y: 12 },
    startWorld: { x: 10, y: 10 },
    previousPreviewWorld: { x: 25, y: 18 },
  });
  expect(contexts[2]).toMatchObject({
    world: { x: 40, y: 30 },
    delta: { x: 0, y: 0 },
    startWorld: { x: 10, y: 10 },
    previousPreviewWorld: { x: 40, y: 30 },
  });
});

test("snap.drag returning a Point sets previewWorld on dragMove and dragEnd", () => {
  const { canvas, fire } = createMockCanvas();
  const renderer = createRenderer({
    canvas,
    pixelRatio: 1,
    snap: {
      drag: ({ world }) => ({
        x: Math.round(world.x / 50) * 50,
        y: Math.round(world.y / 50) * 50,
      }),
    },
  });
  renderer.setScene(draggableScene);

  const moves: { world: Point; preview: Point }[] = [];
  const ends: { world: Point; preview: Point }[] = [];
  renderer.on("dragMove", (event) => {
    moves.push({ world: event.world, preview: event.previewWorld });
  });
  renderer.on("dragEnd", (event) => {
    ends.push({ world: event.world, preview: event.previewWorld });
  });

  fire("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
  fire("pointermove", { pointerId: 1, clientX: 73, clientY: 22 });
  fire("pointermove", { pointerId: 1, clientX: 128, clientY: 88 });
  fire("pointerup", { pointerId: 1, clientX: 128, clientY: 88 });

  expect(moves).toEqual([
    { world: { x: 73, y: 22 }, preview: { x: 50, y: 0 } },
    { world: { x: 128, y: 88 }, preview: { x: 150, y: 100 } },
  ]);
  expect(ends).toEqual([{ world: { x: 128, y: 88 }, preview: { x: 150, y: 100 } }]);
});

test("snap.drag returning null leaves previewWorld equal to world", () => {
  const { canvas, fire } = createMockCanvas();
  const renderer = createRenderer({
    canvas,
    pixelRatio: 1,
    snap: { drag: () => null },
  });
  renderer.setScene(draggableScene);

  const previews: Point[] = [];
  renderer.on("dragMove", (event) => {
    previews.push(event.previewWorld);
  });

  fire("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
  fire("pointermove", { pointerId: 1, clientX: 23, clientY: 17 });
  fire("pointerup", { pointerId: 1, clientX: 23, clientY: 17 });

  expect(previews).toEqual([{ x: 23, y: 17 }]);
});

test("dragStart previewWorld matches startWorld", () => {
  const { canvas, fire } = createMockCanvas();
  const renderer = createRenderer({
    canvas,
    pixelRatio: 1,
    snap: { drag: () => ({ x: 999, y: 999 }) },
  });
  renderer.setScene(draggableScene);

  const starts: { world: Point; preview: Point }[] = [];
  renderer.on("dragStart", (event) => {
    starts.push({ world: event.world, preview: event.previewWorld });
  });

  fire("pointerdown", { pointerId: 1, clientX: 12, clientY: 8 });
  fire("pointermove", { pointerId: 1, clientX: 30, clientY: 30 });
  fire("pointerup", { pointerId: 1, clientX: 30, clientY: 30 });

  expect(starts).toEqual([{ world: { x: 12, y: 8 }, preview: { x: 12, y: 8 } }]);
});

test("snap.drag receives modifier keys from PointerEvent", () => {
  const { canvas, fire } = createMockCanvas();
  const contexts: DragSnapContext[] = [];
  const renderer = createRenderer({
    canvas,
    pixelRatio: 1,
    snap: {
      drag: (context) => {
        contexts.push(context);
        return null;
      },
    },
  });
  renderer.setScene(draggableScene);

  fire("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
  fire("pointermove", {
    pointerId: 1,
    clientX: 20,
    clientY: 20,
    shiftKey: true,
    altKey: true,
    ctrlKey: false,
    metaKey: false,
  } as Partial<PointerEvent>);
  fire("pointerup", {
    pointerId: 1,
    clientX: 20,
    clientY: 20,
    metaKey: true,
  } as Partial<PointerEvent>);

  expect(contexts[0]?.modifiers).toEqual({
    shift: true,
    alt: true,
    ctrl: false,
    meta: false,
  });
  expect(contexts[1]?.modifiers).toEqual({
    shift: false,
    alt: false,
    ctrl: false,
    meta: true,
  });
});

test("dragged entity renders at the snapped preview position", () => {
  const { canvas, ctx, fire } = createMockCanvas();
  const renderer = createRenderer({
    canvas,
    pixelRatio: 1,
    snap: {
      drag: ({ world }) => ({
        x: Math.round(world.x / 50) * 50,
        y: Math.round(world.y / 50) * 50,
      }),
    },
  });
  renderer.setScene(draggableScene);
  flushRaf();

  ctx.calls.length = 0;
  fire("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
  fire("pointermove", { pointerId: 1, clientX: 73, clientY: 22 });
  flushRaf();

  const positions = ctx.calls
    .filter((c) => c.method === "rect")
    .map((c) => ({ x: c.args[0], y: c.args[1] }));
  // entity (0,0) shifted by previewWorld(50,0) - startWorld(10,10) = (40,-10)
  expect(positions).toEqual([{ x: 40, y: -10 }]);
});

test("drag events include the target anchor and its snap-adjusted preview", () => {
  const { canvas, fire } = createMockCanvas();
  const renderer = createRenderer({
    canvas,
    pixelRatio: 1,
    snap: { drag: () => null },
  });

  renderer.setScene({
    items: [
      {
        type: "entity",
        id: "src",
        x: 40,
        y: 60,
        size: { width: 20, height: 20 },
        visual: { type: "rect" },
        draggable: true,
      },
    ],
  });

  const seen: { type: string; anchor: Point; previewAnchor: Point }[] = [];
  renderer.on("dragStart", (e) => {
    seen.push({ type: "dragStart", anchor: e.anchor, previewAnchor: e.previewAnchor });
  });
  renderer.on("dragMove", (e) => {
    seen.push({ type: "dragMove", anchor: e.anchor, previewAnchor: e.previewAnchor });
  });
  renderer.on("dragEnd", (e) => {
    seen.push({ type: "dragEnd", anchor: e.anchor, previewAnchor: e.previewAnchor });
  });

  fire("pointerdown", { pointerId: 1, clientX: 50, clientY: 70 });
  fire("pointermove", { pointerId: 1, clientX: 110, clientY: 130 });
  fire("pointerup", { pointerId: 1, clientX: 110, clientY: 130 });

  expect(seen).toEqual([
    { type: "dragStart", anchor: { x: 40, y: 60 }, previewAnchor: { x: 40, y: 60 } },
    { type: "dragMove", anchor: { x: 40, y: 60 }, previewAnchor: { x: 100, y: 120 } },
    { type: "dragEnd", anchor: { x: 40, y: 60 }, previewAnchor: { x: 100, y: 120 } },
  ]);
});

test("snap.drag returning { anchor } places the target anchor at that point", () => {
  const { canvas, fire } = createMockCanvas();
  const renderer = createRenderer({
    canvas,
    pixelRatio: 1,
    snap: {
      drag: () => ({ anchor: { x: 500, y: 400 } }),
    },
  });
  renderer.setScene({
    items: [
      {
        type: "entity",
        id: "src",
        x: 100,
        y: 80,
        size: { width: 20, height: 20 },
        visual: { type: "rect" },
        draggable: true,
      },
    ],
  });

  let captured: { previewWorld: Point; previewAnchor: Point } | null = null;
  renderer.on("dragMove", (event) => {
    captured = { previewWorld: event.previewWorld, previewAnchor: event.previewAnchor };
  });

  fire("pointerdown", { pointerId: 1, clientX: 110, clientY: 90 });
  fire("pointermove", { pointerId: 1, clientX: 200, clientY: 200 });

  // Cursor offset from anchor was (10, 10). With anchor snapped to (500, 400),
  // the cursor must be at (510, 410) for the offset to hold.
  expect(captured).toEqual({
    previewWorld: { x: 510, y: 410 },
    previewAnchor: { x: 500, y: 400 },
  });
});

test("stackNextAnchor returns the world point where the next piece would land", () => {
  const { canvas } = createMockCanvas();
  const renderer = createRenderer({ canvas, pixelRatio: 1 });

  renderer.setScene({
    items: [
      {
        type: "stack",
        id: "pile",
        x: 100,
        y: 300,
        layout: { type: "pile", offset: { x: 4, y: -10 } },
        items: [
          { id: "p0", size: { width: 20, height: 20 }, visual: { type: "rect" } },
          { id: "p1", size: { width: 20, height: 20 }, visual: { type: "rect" } },
          { id: "p2", size: { width: 20, height: 20 }, visual: { type: "rect" } },
        ],
      },
    ],
  });

  // p2 sits at (108, 280); the next slot is one offset above.
  expect(renderer.stackNextAnchor("pile")).toEqual({ x: 112, y: 270 });
  expect(renderer.stackNextAnchor("missing")).toBeNull();
});

test("dragEnd dropTarget hit-tests at the snapped preview position", () => {
  const { canvas, fire } = createMockCanvas();
  const renderer = createRenderer({
    canvas,
    pixelRatio: 1,
    snap: {
      // snap to (200, 200) so the drop test should hit the "dst" entity
      drag: () => ({ x: 220, y: 220 }),
    },
  });

  renderer.setScene({
    items: [
      {
        type: "entity",
        id: "src",
        x: 0,
        y: 0,
        size: { width: 50, height: 50 },
        visual: { type: "rect" },
        draggable: true,
      },
      {
        type: "entity",
        id: "dst",
        x: 200,
        y: 200,
        size: { width: 50, height: 50 },
        visual: { type: "rect" },
      },
    ],
  });

  const drops: (HitResult | null)[] = [];
  renderer.on("dragEnd", (event) => {
    drops.push(event.dropTarget);
  });

  // Pointer is in empty space; only the snap point overlaps "dst".
  fire("pointerdown", { pointerId: 1, clientX: 10, clientY: 10 });
  fire("pointermove", { pointerId: 1, clientX: 400, clientY: 400 });
  fire("pointerup", { pointerId: 1, clientX: 400, clientY: 400 });

  expect(drops).toEqual([{ type: "entity", id: "dst", meta: undefined }]);
});
