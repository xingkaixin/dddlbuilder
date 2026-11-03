export type IconTier = 'control' | 'status' | 'action' | 'feature';

export type IconTone = 'blue' | 'success' | 'warning' | 'danger';

export type IconPart =
  | { kind: 'ink'; d: string; echo?: boolean }
  | { kind: 'wash'; d: string }
  | { kind: 'dot'; cx: number; cy: number; r: number };

export interface IconDef {
  tier: IconTier;
  tone?: IconTone;
  rotate?: number;
  parts: readonly IconPart[];
}

export interface IconElement {
  key: string;
  tag: 'path' | 'circle';
  className: string;
  d?: string;
  cx?: number;
  cy?: number;
  r?: number;
  strokeWidth?: number;
  transform?: string;
}

const RING =
  'M12.4 3.4c4.7.1 8.3 3.9 8.2 8.7-.1 4.7-3.9 8.4-8.7 8.3-4.7-.1-8.4-4-8.3-8.7.1-4.6 3.8-8.3 8.4-8.4.9 0 1.6.1 2.2.3';
const RING_WASH = 'M12 3.9a8.1 8.1 0 1 1 0 16.2a8.1 8.1 0 1 1 0-16.2z';

const CHEVRON: IconPart[] = [
  { kind: 'ink', d: 'M9.3 5.7c1.9 1.8 3.9 3.9 6 6.2-2 2.2-4 4.3-5.9 6.4' },
];
const ARROW: IconPart[] = [
  {
    kind: 'ink',
    d: 'M4.6 12.1c4.8-.2 9.6-.2 14.3 0M13.2 6.6c1.9 1.8 3.8 3.6 5.7 5.5-1.9 1.9-3.8 3.7-5.7 5.6',
  },
];
const SKIP: IconPart[] = [
  {
    kind: 'ink',
    d: 'M5.6 6c3.2 1.9 6.3 3.9 9.2 6-2.9 2.1-6 4.1-9.2 6-.2-4-.2-8 0-12M18.3 5.7c.1 4.2.1 8.4 0 12.6',
  },
];

export const ICONS = {
  chevronRight: { tier: 'control', parts: CHEVRON },
  chevronDown: { tier: 'control', rotate: 90, parts: CHEVRON },
  chevronLeft: { tier: 'control', rotate: 180, parts: CHEVRON },
  chevronUp: { tier: 'control', rotate: 270, parts: CHEVRON },
  arrowRight: { tier: 'control', parts: ARROW },
  arrowLeft: { tier: 'control', rotate: 180, parts: ARROW },
  close: {
    tier: 'control',
    parts: [
      { kind: 'ink', d: 'M6.4 6.2c3.8 3.7 7.6 7.6 11.3 11.7M17.8 6.3c-3.8 3.6-7.6 7.5-11.5 11.5' },
    ],
  },
  check: {
    tier: 'control',
    parts: [{ kind: 'ink', d: 'M5 12.8c1.5 1.4 3 2.9 4.5 4.6 2.8-3.9 5.8-7.6 9-11.2' }],
  },
  plus: {
    tier: 'control',
    parts: [{ kind: 'ink', d: 'M12.1 5.2c.1 4.6.1 9.1-.1 13.7M5.3 12.1c4.5-.2 9-.2 13.5 0' }],
  },
  minus: { tier: 'control', parts: [{ kind: 'ink', d: 'M5.3 12.1c4.5-.2 9-.2 13.5 0' }] },
  more: {
    tier: 'control',
    parts: [
      { kind: 'dot', cx: 5.8, cy: 12.2, r: 1.55 },
      { kind: 'dot', cx: 12, cy: 11.9, r: 1.55 },
      { kind: 'dot', cx: 18.2, cy: 12.1, r: 1.55 },
    ],
  },
  dragHandle: {
    tier: 'control',
    parts: [
      { kind: 'dot', cx: 9.2, cy: 6.2, r: 1.4 },
      { kind: 'dot', cx: 14.8, cy: 6, r: 1.4 },
      { kind: 'dot', cx: 9, cy: 12.1, r: 1.4 },
      { kind: 'dot', cx: 14.9, cy: 12, r: 1.4 },
      { kind: 'dot', cx: 9.1, cy: 17.9, r: 1.4 },
      { kind: 'dot', cx: 14.8, cy: 18.1, r: 1.4 },
    ],
  },
  search: {
    tier: 'control',
    parts: [
      {
        kind: 'ink',
        d: 'M10.9 4.6c3.3.1 5.9 2.8 5.8 6.1-.1 3.3-2.8 5.9-6.1 5.8-3.3-.1-5.9-2.8-5.8-6.1.1-3.2 2.7-5.8 5.9-5.8.6 0 1.1.1 1.6.2M15.2 15.3c1.2 1.2 2.4 2.5 3.7 3.8',
      },
    ],
  },
  radioDot: { tier: 'control', parts: [{ kind: 'dot', cx: 12, cy: 12, r: 7.5 }] },
  play: {
    tier: 'control',
    parts: [
      {
        kind: 'ink',
        d: 'M7.6 5.2c3.9 2.1 7.6 4.4 11.1 6.8-3.5 2.4-7.2 4.7-11.1 6.9-.2-4.6-.2-9.1 0-13.7',
      },
    ],
  },
  pause: {
    tier: 'control',
    parts: [{ kind: 'ink', d: 'M8.6 5.6c.1 4.3.1 8.6 0 12.9M15.4 5.5c.1 4.3.1 8.6-.1 12.9' }],
  },
  skipForward: { tier: 'control', parts: SKIP },
  skipBack: { tier: 'control', rotate: 180, parts: SKIP },
  loading: {
    tier: 'status',
    parts: [
      {
        kind: 'ink',
        d: 'M12.2 4c4.4.1 7.9 3.7 7.8 8.1-.1 4.4-3.7 7.9-8.1 7.8-4.4-.1-7.9-3.6-7.9-8 0-2.2.9-4.1 2.3-5.5',
      },
    ],
  },
  warning: {
    tier: 'status',
    tone: 'warning',
    parts: [
      { kind: 'wash', d: 'M12 4.6 4.3 19.1h15.4z' },
      {
        kind: 'ink',
        echo: true,
        d: 'M12.1 3.8c-2.9 5.3-5.8 10.6-8.6 15.9 5.7.3 11.4.3 17.1.1-2.8-5.4-5.6-10.7-8.7-16.3',
      },
      { kind: 'ink', d: 'M12.1 9.2c0 1.8 0 3.6-.1 5.3' },
      { kind: 'dot', cx: 12, cy: 17.1, r: 1.05 },
    ],
  },
  error: {
    tier: 'status',
    tone: 'danger',
    parts: [
      { kind: 'wash', d: RING_WASH },
      { kind: 'ink', echo: true, d: RING },
      { kind: 'ink', d: 'M12.1 7.6c0 1.9 0 3.8-.1 5.6' },
      { kind: 'dot', cx: 12, cy: 16.3, r: 1.05 },
    ],
  },
  info: {
    tier: 'status',
    tone: 'blue',
    parts: [
      { kind: 'wash', d: RING_WASH },
      { kind: 'ink', echo: true, d: RING },
      { kind: 'dot', cx: 12, cy: 7.9, r: 1.05 },
      { kind: 'ink', d: 'M12 11c.1 1.9.1 3.8 0 5.7' },
    ],
  },
  success: {
    tier: 'status',
    tone: 'success',
    parts: [
      { kind: 'wash', d: RING_WASH },
      { kind: 'ink', echo: true, d: RING },
      { kind: 'ink', d: 'M8.3 12.3c1 .9 2 1.9 2.9 3 1.6-2.3 3.3-4.4 5.1-6.4' },
    ],
  },
  offline: {
    tier: 'status',
    parts: [
      {
        kind: 'ink',
        d: 'M3.4 9.6c5-4.6 12.2-4.6 17.2 0M6.8 13.2c3-2.6 7.4-2.6 10.4 0M5 4.4c4.7 5 9.4 10 14 15',
      },
      { kind: 'dot', cx: 12, cy: 17.6, r: 1.35 },
    ],
  },
} satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;

function strokePx(size: number): number {
  if (size <= 12) return 1.25;
  if (size <= 14) return 1.35;
  if (size <= 16) return 1.5;
  if (size <= 20) return 1.65;
  if (size <= 24) return 1.8;

  return 2;
}

function showsWash(tier: IconTier, size: number): boolean {
  if (tier === 'status' || tier === 'feature') return size >= 16;
  if (tier === 'action') return size >= 20;

  return false;
}

export function iconElements(def: IconDef, size: number): IconElement[] {
  const stroke = Math.round(((strokePx(size) * 24) / size) * 100) / 100;
  const turn = def.rotate ? `rotate(${def.rotate} 12 12)` : '';
  const elements: IconElement[] = [];
  const echoes: IconElement[] = [];

  def.parts.forEach((part, index) => {
    const key = String(index);

    if (part.kind === 'wash') {
      if (showsWash(def.tier, size)) {
        elements.push({
          key,
          tag: 'path',
          className: 'lm-ic-wash',
          d: part.d,
          transform: `${turn} translate(0.9 0.9)`.trim(),
        });
      }

      return;
    }

    if (part.kind === 'dot') {
      elements.push({
        key,
        tag: 'circle',
        className: 'lm-ic-dot',
        cx: part.cx,
        cy: part.cy,
        r: part.r,
        transform: turn || undefined,
      });

      return;
    }

    elements.push({
      key,
      tag: 'path',
      className: 'lm-ic-ink',
      d: part.d,
      strokeWidth: stroke,
      transform: turn || undefined,
    });

    if (part.echo && size >= 20) {
      echoes.push({
        key: `${key}e`,
        tag: 'path',
        className: 'lm-ic-ink lm-ic-echo',
        d: part.d,
        strokeWidth: stroke / 2,
        transform: `${turn} translate(0.55 -0.45) rotate(0.8 12 12)`.trim(),
      });
    }
  });

  return [...elements, ...echoes];
}
