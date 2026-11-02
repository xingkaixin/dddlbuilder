export type Rng = () => number;

type PerimeterPoint = [x: number, y: number, normalX: number, normalY: number];

type Point = [x: number, y: number];

export interface RoughRectOptions {
  inset: number;
  radius: number;
  amp: number;
  step?: number;
  breaks?: number;
}

export interface HatchOptions {
  inset: number;
  spacing: number;
}

export interface HatchLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  opacity: number;
  width: number;
}

export function hashSeed(text: string): number {
  let hash = 2166136261;

  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  }

  return hash >>> 0;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0 || 1;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return state / 4294967296;
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function at<T>(items: readonly T[], index: number): T {
  // SAFETY: every caller indexes within bounds it has just computed from `items.length`.
  return items[index] as T;
}

function perimeter(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  step: number,
): PerimeterPoint[] {
  const rad = Math.max(0, Math.min(radius, width / 2, height / 2));
  const points: PerimeterPoint[] = [];

  function side(ax: number, ay: number, bx: number, by: number, nx: number, ny: number) {
    const count = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));

    for (let i = 0; i < count; i++) {
      const t = i / count;
      points.push([ax + (bx - ax) * t, ay + (by - ay) * t, nx, ny]);
    }
  }

  function corner(cx: number, cy: number, startAngle: number) {
    if (rad < 1) {
      const angle = startAngle + Math.PI / 4;
      points.push([
        cx + Math.cos(angle) * 0.7,
        cy + Math.sin(angle) * 0.7,
        Math.cos(angle),
        Math.sin(angle),
      ]);

      return;
    }

    const count = rad > 10 ? 4 : 2;

    for (let i = 0; i < count; i++) {
      const angle = startAngle + (Math.PI / 2) * (i / count);
      points.push([
        cx + Math.cos(angle) * rad,
        cy + Math.sin(angle) * rad,
        Math.cos(angle),
        Math.sin(angle),
      ]);
    }
  }

  side(x + rad, y, x + width - rad, y, 0, -1);
  corner(x + width - rad, y + rad, -Math.PI / 2);
  side(x + width, y + rad, x + width, y + height - rad, 1, 0);
  corner(x + width - rad, y + height - rad, 0);
  side(x + width - rad, y + height, x + rad, y + height, 0, 1);
  corner(x + rad, y + height - rad, Math.PI / 2);
  side(x, y + height - rad, x, y + rad, -1, 0);
  corner(x + rad, y + rad, Math.PI);

  return points;
}

function smooth(points: readonly Point[]): string {
  if (points.length < 2) return '';
  const first = at(points, 0);
  let path = `M${round1(first[0])} ${round1(first[1])}`;

  if (points.length === 2) {
    const second = at(points, 1);

    return `${path}L${round1(second[0])} ${round1(second[1])}`;
  }

  for (let i = 1; i < points.length - 1; i++) {
    const point = at(points, i);
    const next = at(points, i + 1);
    const midX = (point[0] + next[0]) / 2;
    const midY = (point[1] + next[1]) / 2;
    path += `Q${round1(point[0])} ${round1(point[1])} ${round1(midX)} ${round1(midY)}`;
  }

  const last = at(points, points.length - 1);

  return `${path}L${round1(last[0])} ${round1(last[1])}`;
}

export function roughRect(
  rng: Rng,
  width: number,
  height: number,
  options: RoughRectOptions,
): string {
  const { inset, radius, amp, step = 14, breaks = 0 } = options;
  const base = perimeter(inset, inset, width - inset * 2, height - inset * 2, radius, step);
  const count = base.length;
  const start = Math.floor(rng() * count);
  const overshoot = 2 + Math.floor(rng() * 2);

  let jitter = (rng() - 0.5) * amp;
  const points: Point[] = [];

  for (let i = 0; i <= count + overshoot; i++) {
    jitter = jitter * 0.55 + (rng() - 0.5) * 2 * amp * 0.45;
    const [x, y, nx, ny] = at(base, (start + i) % count);
    points.push([x + nx * jitter, y + ny * jitter]);
  }

  const last = at(points, points.length - 1);
  last[0] += (rng() - 0.5) * amp * 2;
  last[1] += (rng() - 0.5) * amp * 2;

  if (breaks && rng() < breaks && points.length > 8) {
    const gap = 3 + Math.floor(rng() * (points.length - 7));

    return smooth(points.slice(0, gap + 1)) + smooth(points.slice(gap + 1));
  }

  return smooth(points);
}

export function roughLine(
  rng: Rng,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  amp: number,
  breaks = 0,
): string {
  const overStart = (rng() - 0.3) * 3;
  const overEnd = (rng() - 0.3) * 3;
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const unitX = (x2 - x1) / length;
  const unitY = (y2 - y1) / length;
  const startX = x1 - unitX * overStart;
  const startY = y1 - unitY * overStart;
  const endX = x2 + unitX * overEnd;
  const endY = y2 + unitY * overEnd;

  const count = Math.max(2, Math.round((length + overStart + overEnd) / 18));
  const bow = (rng() - 0.5) * amp * 1.6;
  let jitter = 0;
  const points: Point[] = [];

  for (let i = 0; i <= count; i++) {
    const t = i / count;
    jitter = jitter * 0.5 + (rng() - 0.5) * amp;
    const offset = jitter + Math.sin(Math.PI * t) * bow;
    points.push([
      startX + (endX - startX) * t - unitY * offset,
      startY + (endY - startY) * t + unitX * offset,
    ]);
  }

  if (breaks && rng() < breaks && count > 5) {
    const gap = 2 + Math.floor(rng() * (count - 4));

    return smooth(points.slice(0, gap + 1)) + smooth(points.slice(gap + 1));
  }

  return smooth(points);
}

export function hatch(
  rng: Rng,
  width: number,
  height: number,
  { inset, spacing }: HatchOptions,
): HatchLine[] {
  const left = inset;
  const top = inset;
  const right = width - inset;
  const bottom = height - inset;
  const lines: HatchLine[] = [];

  for (
    let sum = left + top + spacing * rng();
    sum < right + bottom;
    sum += spacing * (0.7 + rng() * 0.6)
  ) {
    const ax = Math.max(left, sum - bottom);
    const ay = sum - ax;
    const bx = Math.min(right, sum - top);
    const by = sum - bx;

    if (bx - ax < 1.5) continue;

    const raggedStart = (rng() - 0.35) * 4;
    const raggedEnd = (rng() - 0.35) * 4;
    lines.push({
      x1: round1(ax - raggedStart * 0.707),
      y1: round1(ay + raggedStart * 0.707),
      x2: round1(bx + raggedEnd * 0.707),
      y2: round1(by - raggedEnd * 0.707),
      opacity: round1(0.4 + rng() * 0.6),
      width: round1(1 + rng() * 1.2),
    });
  }

  return lines;
}
