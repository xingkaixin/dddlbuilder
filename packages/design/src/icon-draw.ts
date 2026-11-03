// Hand-drawn primitives on the 24 grid. Every edge bows a little and closed shapes overshoot
// their start, but the wobble is a fixed pattern so the same call always draws the same path.

type Point = readonly [x: number, y: number];

const BOWS = [0.015, -0.012, 0.018, -0.01] as const;

const n = (value: number) => Math.round(value * 100) / 100;

function bowTo([x1, y1]: Point, [x2, y2]: Point, bow: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;

  return `C${n(x1 + dx / 3 - dy * bow)} ${n(y1 + dy / 3 + dx * bow)} ${n(x1 + (dx * 2) / 3 - dy * bow)} ${n(y1 + (dy * 2) / 3 + dx * bow)} ${n(x2)} ${n(y2)}`;
}

function corner([x1, y1]: Point, [cx, cy]: Point, [x2, y2]: Point): string {
  const k = 0.55;

  return `C${n(x1 + (cx - x1) * k)} ${n(y1 + (cy - y1) * k)} ${n(x2 + (cx - x2) * k)} ${n(y2 + (cy - y2) * k)} ${n(x2)} ${n(y2)}`;
}

export function line(x1: number, y1: number, x2: number, y2: number, bow = 0.02): string {
  return `M${n(x1)} ${n(y1)}${bowTo([x1, y1], [x2, y2], bow)}`;
}

export function poly(points: readonly Point[], closed = false): string {
  const [first, second] = points;

  if (!first || !second) return '';

  let path = `M${n(first[0])} ${n(first[1])}`;
  const stops = closed ? [...points.slice(1), first] : points.slice(1);
  let from = first;

  stops.forEach((to, index) => {
    path += bowTo(from, to, BOWS[index % BOWS.length] ?? 0);
    from = to;
  });

  if (closed) {
    const over: Point = [
      first[0] + (second[0] - first[0]) * 0.08,
      first[1] + (second[1] - first[1]) * 0.08,
    ];
    path += bowTo(first, over, 0);
  }

  return path;
}

export function rect(x: number, y: number, w: number, h: number, r = 1.8): string {
  const right = x + w;
  const bottom = y + h;

  return (
    `M${n(x + r)} ${n(y)}` +
    bowTo([x + r, y], [right - r, y], BOWS[0]) +
    corner([right - r, y], [right, y], [right, y + r]) +
    bowTo([right, y + r], [right, bottom - r], BOWS[1]) +
    corner([right, bottom - r], [right, bottom], [right - r, bottom]) +
    bowTo([right - r, bottom], [x + r, bottom], BOWS[2]) +
    corner([x + r, bottom], [x, bottom], [x, bottom - r]) +
    bowTo([x, bottom - r], [x, y + r], BOWS[3]) +
    corner([x, y + r], [x, y], [x + r, y]) +
    bowTo([x + r, y], [x + r + Math.min(1.2, w * 0.1), y - 0.1], 0)
  );
}

export function ring(cx: number, cy: number, r: number): string {
  const k = 0.5523;
  const [a, b, c, d] = [r, r * 1.012, r * 0.99, r * 1.006];
  const top: Point = [cx, cy - a];

  const path = [
    `M${n(top[0])} ${n(top[1])}`,
    `C${n(cx + k * a)} ${n(cy - a)} ${n(cx + b)} ${n(cy - k * b)} ${n(cx + b)} ${n(cy)}`,
    `C${n(cx + b)} ${n(cy + k * c)} ${n(cx + k * c)} ${n(cy + c)} ${n(cx)} ${n(cy + c)}`,
    `C${n(cx - k * c)} ${n(cy + c)} ${n(cx - d)} ${n(cy + k * d)} ${n(cx - d)} ${n(cy)}`,
    `C${n(cx - d)} ${n(cy - k * d)} ${n(cx - k * a)} ${n(cy - a)} ${n(cx)} ${n(cy - a)}`,
  ].join('');

  return path + bowTo(top, [cx + r * 0.3, cy - r * 0.97], 0);
}

export function disc(cx: number, cy: number, r: number): string {
  return `M${n(cx)} ${n(cy - r)}a${n(r)} ${n(r)} 0 1 1 0 ${n(r * 2)}a${n(r)} ${n(r)} 0 1 1 0 ${n(-r * 2)}z`;
}

export function box(x: number, y: number, w: number, h: number, r = 1.8): string {
  return `M${n(x + r)} ${n(y)}h${n(w - r * 2)}a${r} ${r} 0 0 1 ${r} ${r}v${n(h - r * 2)}a${r} ${r} 0 0 1 ${-r} ${r}h${n(-(w - r * 2))}a${r} ${r} 0 0 1 ${-r} ${-r}v${n(-(h - r * 2))}a${r} ${r} 0 0 1 ${r} ${-r}z`;
}

export function sparkle(cx: number, cy: number, r: number): string {
  const q = r * 0.16;

  return `M${n(cx)} ${n(cy - r)}Q${n(cx + q)} ${n(cy - q)} ${n(cx + r)} ${n(cy)}Q${n(cx + q)} ${n(cy + q)} ${n(cx)} ${n(cy + r)}Q${n(cx - q)} ${n(cy + q)} ${n(cx - r)} ${n(cy)}Q${n(cx - q)} ${n(cy - q)} ${n(cx)} ${n(cy - r)}z`;
}

export function gear(cx: number, cy: number, outer: number, inner: number, teeth: number): string {
  const points: Point[] = [];
  const step = (Math.PI * 2) / teeth;

  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;

    for (const [offset, radius] of [
      [-0.5, inner],
      [-0.24, outer],
      [0.24, outer],
      [0.5, inner],
    ] as const) {
      const angle = a + offset * step * 0.9;
      points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
    }
  }

  return poly(points, true);
}
