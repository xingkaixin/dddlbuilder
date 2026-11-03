import { box, disc, gear, line, poly, rect, ring, sparkle } from './icon-draw';

export type IconTier = 'control' | 'status' | 'action' | 'feature';

export type IconTone = 'blue' | 'success' | 'warning' | 'danger' | 'ai';

// `g` names a hover group; icons.css moves each group when an interactive ancestor is hovered.
// Grouped ink never gets an echo, because the echo's offset would be replaced by the hover
// transform.
export type IconPart =
  | { kind: 'ink'; d: string; echo?: boolean; dash?: boolean; g?: string }
  | { kind: 'wash'; d: string; g?: string }
  | { kind: 'dot'; cx: number; cy: number; r: number; g?: string };

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

const TRASH_BODY =
  'M6 7.4c.3 4.1.6 8.2.9 12.2.1.8.6 1.3 1.4 1.3h7.4c.8 0 1.3-.5 1.4-1.3.3-4 .6-8.1.9-12.2';
const TRASH_LID =
  'M4.3 6.6c5.2-.3 10.3-.3 15.5.1M9.4 6.4c0-1 .1-1.9.2-2.7 1.5-.1 3-.1 4.6 0 .1.8.1 1.6.1 2.6';
const TRAY =
  'M4.2 14.6c0 1.6 0 3.2.1 4.7 0 .8.5 1.3 1.3 1.3 4.3.1 8.6.1 12.9 0 .8 0 1.3-.5 1.3-1.3.1-1.5.1-3.1.1-4.7';
const LENS =
  'M10.9 4.6c3.3.1 5.9 2.8 5.8 6.1-.1 3.3-2.8 5.9-6.1 5.8-3.3-.1-5.9-2.8-5.8-6.1.1-3.2 2.7-5.8 5.9-5.8.6 0 1.1.1 1.6.2M15.2 15.3c1.2 1.2 2.4 2.5 3.7 3.8';
const BUBBLE =
  'M12 4.2c4.6 0 8.2 3.2 8.2 7.4s-3.6 7.4-8.2 7.4c-1.2 0-2.3-.2-3.3-.6L4.4 19.8l1.3-3.6C4.5 14.9 3.8 13.3 3.8 11.6c0-4.2 3.6-7.4 8.2-7.4z';
const FOLDER_BACK =
  'M3.6 11.5c0-1.4 0-2.9.1-4.3 0-1.2.6-1.9 1.8-1.9 1.5 0 3.1 0 4.6.1.6 0 1 .3 1.3.8l.8 1.3c.3.5.7.7 1.3.7 1.8 0 3.7 0 5.5.1.9 0 1.4.5 1.4 1.4v1.8';
const SHIELD =
  'M12 3.6c2.3 1.5 4.8 2.3 7.6 2.4.1 6.6-2.4 11.2-7.6 14.4C6.8 17.2 4.3 12.6 4.4 6c2.8-.1 5.3-.9 7.6-2.4z';
const BULB =
  'M9.4 16.4c0-1.4-.4-2.3-1.4-3.4-1.1-1.2-1.8-2.6-1.8-4.3 0-3.2 2.6-5.6 5.8-5.6s5.8 2.4 5.8 5.6c0 1.7-.7 3.1-1.8 4.3-1 1.1-1.4 2-1.4 3.4z';
const BOOK =
  'M12 6.6c-2.2-1.6-4.9-2.3-8.2-2.2v13.4c3.3-.1 6 .6 8.2 2.2 2.2-1.6 4.9-2.3 8.2-2.2V4.4c-3.3-.1-6 .6-8.2 2.2z';
const EYE =
  'M2.8 12c2.4-4.4 5.6-6.6 9.2-6.6s6.8 2.2 9.2 6.6c-2.4 4.4-5.6 6.6-9.2 6.6S5.2 16.4 2.8 12z';
const DB_TOP =
  'M4.8 6.3c0-1.5 3.2-2.7 7.3-2.7 4 0 7.1 1.2 7.1 2.6 0 1.6-3.2 2.8-7.2 2.8-4 0-7.2-1.2-7.2-2.7';
const DB_SIDES =
  'M4.8 6.4c-.1 3.8-.1 7.6 0 11.3 0 1.5 3.2 2.7 7.2 2.7s7.2-1.2 7.2-2.7c.1-3.7.1-7.5 0-11.3M4.8 12c.2 1.5 3.3 2.6 7.2 2.6s7-1.1 7.2-2.6';
const STAR = poly(
  [
    [12, 4],
    [14.12, 9.69],
    [20.18, 9.94],
    [15.42, 13.71],
    [17.05, 19.56],
    [12, 16.2],
    [6.95, 19.56],
    [8.58, 13.71],
    [3.82, 9.94],
    [9.88, 9.69],
  ],
  true,
);

type Quad = [[number, number], [number, number], [number, number], [number, number]];

export const FOLDER_CLOSED: Quad = [
  [3.6, 10.4],
  [20.4, 10.5],
  [20.3, 19.7],
  [3.7, 19.6],
];
export const FOLDER_OPEN: Quad = [
  [6.4, 11.6],
  [22.3, 11.7],
  [19.8, 19.7],
  [3.7, 19.6],
];

export function folderFront(quad: Quad): string {
  return poly(quad, true);
}

function page(x: number, y: number, w: number, h: number): IconPart[] {
  return [
    { kind: 'wash', d: box(x, y, w, h, 1.2) },
    {
      kind: 'ink',
      echo: true,
      d: poly(
        [
          [x, y],
          [x + w - 4.2, y],
          [x + w, y + 4.2],
          [x + w, y + h],
          [x, y + h],
        ],
        true,
      ),
    },
    {
      kind: 'ink',
      d: poly([
        [x + w - 4.3, y + 0.2],
        [x + w - 4.3, y + 4.3],
        [x + w - 0.2, y + 4.3],
      ]),
    },
  ];
}

function table(x: number, y: number, w: number, h: number, dash = false): IconPart[] {
  const head = y + Math.min(4.7, h * 0.32);
  const column = x + w * 0.35;

  return [
    { kind: 'wash', d: box(x, y, w, head - y, 1.6) },
    { kind: 'ink', echo: !dash, dash, d: rect(x, y, w, h) },
    { kind: 'ink', d: line(x + 0.2, head, x + w - 0.2, head, 0.01) },
    { kind: 'ink', d: line(column, head + 0.1, column, y + h - 0.2, 0.01) },
  ];
}

function pencil(points: [number, number][], ferrule: [number, number, number, number]): IconPart[] {
  return [
    { kind: 'wash', g: 'nib', d: poly(points, true) },
    { kind: 'ink', g: 'nib', d: poly(points, true) },
    { kind: 'ink', g: 'nib', d: line(...ferrule) },
  ];
}

const PENCIL = pencil(
  [
    [15, 4.6],
    [19.4, 9],
    [9.4, 19],
    [4.4, 19.6],
    [5, 14.6],
  ],
  [13.2, 6.4, 17.6, 10.8],
);

const SUN_RAYS = [
  [12, 3.2, 12, 5.4],
  [18.2, 5.8, 16.7, 7.3],
  [20.8, 12, 18.6, 12],
  [18.2, 18.2, 16.7, 16.7],
  [12, 20.8, 12, 18.6],
  [5.8, 18.2, 7.3, 16.7],
  [3.2, 12, 5.4, 12],
  [5.8, 5.8, 7.3, 7.3],
] as const;

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
  arrowUp: { tier: 'control', rotate: 270, parts: ARROW },
  arrowDown: { tier: 'control', rotate: 90, parts: ARROW },
  modify: {
    tier: 'control',
    parts: [
      { kind: 'ink', d: 'M4.6 13.6c1.6-3 3.4-3.6 5.4-2.2s3.6 1.6 5.2.2c1.4-1.2 2.6-1.6 4.2-1.2' },
    ],
  },
  delete: {
    tier: 'action',
    tone: 'danger',
    parts: [
      { kind: 'wash', d: 'M6.4 7.6h11.2l-.9 12.8H7.3z' },
      { kind: 'ink', echo: true, d: TRASH_BODY },
      { kind: 'ink', d: 'M10.1 10.8c.1 2.2.2 4.4.2 6.6M13.9 10.8c-.1 2.2-.1 4.4-.2 6.6' },
      { kind: 'ink', g: 'lid', d: TRASH_LID },
    ],
  },
  deleteForever: {
    tier: 'action',
    tone: 'danger',
    parts: [
      { kind: 'wash', d: 'M6.4 7.6h11.2l-.9 12.8H7.3z' },
      { kind: 'ink', echo: true, d: TRASH_BODY },
      { kind: 'ink', d: line(9.7, 11.2, 14.3, 16.8) + line(14.3, 11.2, 9.7, 16.8) },
      { kind: 'ink', g: 'lid', d: TRASH_LID },
    ],
  },
  edit: { tier: 'action', parts: PENCIL },
  copy: {
    tier: 'action',
    parts: [
      {
        kind: 'ink',
        g: 'back',
        d: 'M8.1 15.4H6.6c-.7 0-1.2-.4-1.2-1.1-.1-3.2-.1-6.5 0-9.8 0-.7.4-1.1 1.1-1.1 2.8-.1 5.5-.1 8.3 0 .7 0 1.1.4 1.1 1.1v1.7',
      },
      { kind: 'wash', g: 'front', d: box(9.6, 8.6, 10.6, 12, 1.2) },
      {
        kind: 'ink',
        g: 'front',
        d: 'M10.8 8.6c2.8-.1 5.6-.1 8.3 0 .7 0 1.1.4 1.1 1.1.1 3.3.1 6.6 0 9.8 0 .7-.4 1.1-1.1 1.1-2.8.1-5.6.1-8.4 0-.7 0-1.1-.4-1.1-1.1-.1-3.2-.1-6.5 0-9.8 0-.7.5-1.1 1.2-1.1',
      },
    ],
  },
  download: {
    tier: 'action',
    parts: [
      {
        kind: 'ink',
        g: 'drop',
        d: 'M12 3.8c.1 3.4.1 6.9 0 10.4M7.9 10.4c1.4 1.4 2.8 2.8 4.1 4.3 1.4-1.5 2.8-2.9 4.2-4.3',
      },
      { kind: 'ink', echo: true, d: TRAY },
    ],
  },
  upload: {
    tier: 'action',
    parts: [
      {
        kind: 'ink',
        g: 'rise',
        d: 'M12 14.6c.1-3.4.1-6.9 0-10.4M7.9 8.3c1.4-1.4 2.8-2.9 4.1-4.4 1.4 1.5 2.8 2.9 4.2 4.4',
      },
      { kind: 'ink', echo: true, d: TRAY },
    ],
  },
  send: {
    tier: 'action',
    parts: [
      { kind: 'wash', g: 'fly', d: 'M19.6 4.4 4.6 10.6l6.2 2.6 2.7 6.2z' },
      {
        kind: 'ink',
        g: 'fly',
        d:
          poly(
            [
              [20.4, 3.6],
              [3.6, 10.6],
              [10.4, 13.6],
              [13.4, 20.4],
            ],
            true,
          ) + line(10.6, 13.4, 20.2, 3.8),
      },
    ],
  },
  save: {
    tier: 'action',
    parts: [
      { kind: 'wash', d: box(4, 4, 16, 16, 2) },
      { kind: 'ink', echo: true, d: rect(4, 4, 16, 16, 2) },
      {
        kind: 'ink',
        d:
          poly([
            [8, 4.2],
            [8, 8.6],
            [15.4, 8.6],
            [15.4, 4.2],
          ]) +
          poly([
            [7.6, 19.8],
            [7.6, 14.4],
            [16.4, 14.4],
            [16.4, 19.8],
          ]),
      },
    ],
  },
  refresh: {
    tier: 'action',
    parts: [
      {
        kind: 'ink',
        g: 'spin',
        d: 'M19.3 10.3A7.6 7.4 0 0 0 4.9 9.9M4.3 5.9l.5 4.1 4-.9M4.7 13.7A7.5 7.6 0 0 0 19.1 14.1M19.7 18.1l-.5-4.1-4 .9',
      },
    ],
  },
  undo: {
    tier: 'action',
    parts: [{ kind: 'ink', g: 'undo', d: 'M5.2 9.4A7.6 7.6 0 1 1 4.6 13.4M4.4 4.8l.8 4.6 4.6-.6' }],
  },
  signIn: {
    tier: 'action',
    parts: [
      {
        kind: 'ink',
        echo: true,
        d: 'M13.8 4.2h4.6c1 0 1.6.6 1.6 1.6v12.4c0 1-.6 1.6-1.6 1.6h-4.6',
      },
      {
        kind: 'ink',
        g: 'enter',
        d:
          line(3.8, 12, 14.2, 12) +
          poly([
            [10.6, 8.2],
            [14.4, 12],
            [10.6, 15.8],
          ]),
      },
    ],
  },
  signOut: {
    tier: 'action',
    parts: [
      {
        kind: 'ink',
        echo: true,
        d: 'M10.2 4.2H5.6c-1 0-1.6.6-1.6 1.6v12.4c0 1 .6 1.6 1.6 1.6h4.6',
      },
      {
        kind: 'ink',
        g: 'enter',
        d:
          line(9.8, 12, 20.2, 12) +
          poly([
            [16.6, 8.2],
            [20.4, 12],
            [16.6, 15.8],
          ]),
      },
    ],
  },
  mail: {
    tier: 'action',
    parts: [
      { kind: 'wash', d: box(3.6, 5.6, 16.8, 12.8, 2) },
      { kind: 'ink', echo: true, d: rect(3.6, 5.6, 16.8, 12.8, 2) },
      {
        kind: 'ink',
        g: 'flap',
        d: poly([
          [4.2, 6.6],
          [12, 12.6],
          [19.8, 6.6],
        ]),
      },
    ],
  },
  mailCheck: {
    tier: 'action',
    parts: [
      { kind: 'wash', d: box(3.6, 4.4, 15.2, 11.2, 2) },
      { kind: 'ink', echo: true, d: rect(3.6, 4.4, 15.2, 11.2, 2) },
      {
        kind: 'ink',
        d:
          poly([
            [4.2, 5.4],
            [11.2, 10.6],
            [18.2, 5.4],
          ]) + 'M14 18.2c.7.7 1.4 1.4 2 2.1 1.4-1.8 2.8-3.4 4.4-5',
      },
    ],
  },
  pin: {
    tier: 'action',
    parts: [
      { kind: 'wash', g: 'tilt', d: box(7, 9.6, 10, 4, 1) },
      {
        kind: 'ink',
        g: 'tilt',
        d:
          poly(
            [
              [9.4, 4],
              [14.6, 4],
              [15, 9.4],
              [18, 13.6],
              [6, 13.6],
              [9, 9.4],
            ],
            true,
          ) + line(12, 13.8, 12, 20.4),
      },
    ],
  },
  listPlus: {
    tier: 'action',
    parts: [
      {
        kind: 'ink',
        d:
          line(4, 6.6, 15, 6.6) +
          line(4, 11.6, 15, 11.6) +
          line(4, 16.6, 10.4, 16.6) +
          line(17.4, 13.4, 17.4, 19.8) +
          line(14.2, 16.6, 20.6, 16.6),
      },
    ],
  },
  folderPlus: {
    tier: 'action',
    parts: [
      { kind: 'ink', d: FOLDER_BACK },
      { kind: 'wash', d: box(3.6, 10.4, 16.8, 9.2, 1) },
      { kind: 'ink', echo: true, d: folderFront(FOLDER_CLOSED) },
      { kind: 'ink', d: line(12, 12.6, 12, 17.6) + line(9.5, 15.1, 14.5, 15.1) },
    ],
  },
  filePlus: {
    tier: 'action',
    parts: [
      ...page(5.6, 3.8, 12.8, 16.4),
      { kind: 'ink', d: line(12, 11.2, 12, 16.8) + line(9.2, 14, 14.8, 14) },
    ],
  },
  share: {
    tier: 'action',
    parts: [
      { kind: 'wash', d: disc(17.6, 5.8, 2.4) + disc(6.2, 12, 2.4) + disc(17.6, 18.2, 2.4) },
      {
        kind: 'ink',
        d:
          ring(17.6, 5.8, 2.6) +
          ring(6.2, 12, 2.6) +
          ring(17.6, 18.2, 2.6) +
          line(8.5, 10.8, 15.3, 7) +
          line(8.5, 13.2, 15.3, 17),
      },
    ],
  },
  zoomIn: {
    tier: 'action',
    parts: [{ kind: 'ink', d: LENS + line(10.7, 8.2, 10.7, 13) + line(8.3, 10.6, 13.1, 10.6) }],
  },
  zoomOut: { tier: 'action', parts: [{ kind: 'ink', d: LENS + line(8.3, 10.6, 13.1, 10.6) }] },
  fitView: {
    tier: 'action',
    parts: [
      {
        kind: 'ink',
        d: 'M4 9V5.6c0-1 .6-1.6 1.6-1.6H9M15 4h3.4c1 0 1.6.6 1.6 1.6V9M20 15v3.4c0 1-.6 1.6-1.6 1.6H15M9 20H5.6c-1 0-1.6-.6-1.6-1.6V15',
      },
    ],
  },
  calendar: {
    tier: 'action',
    parts: [
      { kind: 'wash', d: box(3.6, 5, 16.8, 4.8, 1.6) },
      { kind: 'ink', echo: true, d: rect(3.6, 5, 16.8, 15, 2) },
      {
        kind: 'ink',
        d: line(3.8, 9.8, 20.2, 9.8, 0.01) + line(8, 3.2, 8, 6.6) + line(16, 3.2, 16, 6.6),
      },
      { kind: 'dot', cx: 15.2, cy: 15.2, r: 1.4 },
    ],
  },
  sun: {
    tier: 'action',
    tone: 'warning',
    parts: [
      { kind: 'wash', d: disc(12, 12, 3.8) },
      { kind: 'ink', echo: true, d: ring(12, 12, 4) },
      {
        kind: 'ink',
        g: 'rays',
        d: SUN_RAYS.map(([x1, y1, x2, y2]) => line(x1, y1, x2, y2, 0)).join(''),
      },
    ],
  },
  moon: {
    tier: 'action',
    parts: [
      { kind: 'wash', d: 'M19.6 14.6A8 8 0 1 1 9.4 4.4a6.6 6.6 0 0 0 10.2 10.2z' },
      { kind: 'ink', echo: true, d: 'M19.6 14.6A8 8 0 1 1 9.4 4.4a6.6 6.6 0 0 0 10.2 10.2z' },
    ],
  },
  addCircle: {
    tier: 'action',
    tone: 'success',
    parts: [
      { kind: 'wash', d: RING_WASH },
      { kind: 'ink', echo: true, d: RING },
      { kind: 'ink', d: line(12, 8.4, 12, 15.6) + line(8.4, 12, 15.6, 12) },
    ],
  },
  ban: {
    tier: 'action',
    tone: 'danger',
    parts: [
      { kind: 'wash', d: RING_WASH },
      { kind: 'ink', echo: true, d: RING },
      { kind: 'ink', d: line(6.4, 6.5, 17.6, 17.6) },
    ],
  },
  eye: {
    tier: 'action',
    parts: [
      { kind: 'wash', d: 'M3.4 12c2.3-4 5.2-6 8.6-6s6.3 2 8.6 6c-2.3 4-5.2 6-8.6 6s-6.3-2-8.6-6z' },
      { kind: 'ink', echo: true, d: EYE },
      { kind: 'ink', d: ring(12, 12, 2.8) },
    ],
  },
  settings: {
    tier: 'action',
    parts: [
      { kind: 'wash', g: 'gear', d: disc(12, 12, 6.4) },
      { kind: 'ink', g: 'gear', d: gear(12, 12, 8.6, 6.4, 8) + ring(12, 12, 2.6) },
    ],
  },
  sliders: {
    tier: 'action',
    parts: [
      { kind: 'ink', d: line(4, 7, 20, 7) + line(4, 12, 20, 12) + line(4, 17, 20, 17) },
      { kind: 'dot', cx: 9, cy: 7, r: 2.1 },
      { kind: 'dot', cx: 15.4, cy: 12, r: 2.1 },
      { kind: 'dot', cx: 8, cy: 17, r: 2.1 },
    ],
  },
  columns: {
    tier: 'action',
    parts: [
      { kind: 'wash', d: box(3.6, 4, 5.6, 16, 1.6) },
      { kind: 'ink', echo: true, d: rect(3.6, 4, 16.8, 16) },
      { kind: 'ink', d: line(9.2, 4.2, 9.2, 19.8, 0.01) + line(14.8, 4.2, 14.8, 19.8, 0.01) },
    ],
  },
  layoutGrid: {
    tier: 'action',
    parts: [
      { kind: 'wash', d: box(3.8, 3.8, 7, 7, 1.6) },
      {
        kind: 'ink',
        d:
          rect(3.8, 3.8, 7, 7, 1.6) +
          rect(13.2, 3.8, 7, 7, 1.6) +
          rect(3.8, 13.2, 7, 7, 1.6) +
          rect(13.2, 13.2, 7, 7, 1.6),
      },
    ],
  },
  layoutColumns: {
    tier: 'action',
    parts: [
      { kind: 'wash', d: box(3.6, 4.4, 8.4, 15.2, 1.6) },
      { kind: 'ink', echo: true, d: rect(3.6, 4.4, 16.8, 15.2) },
      { kind: 'ink', d: line(12, 4.6, 12, 19.4, 0.01) },
    ],
  },
  layoutRows: {
    tier: 'action',
    parts: [
      { kind: 'wash', d: box(3.6, 4.4, 16.8, 7.6, 1.6) },
      { kind: 'ink', echo: true, d: rect(3.6, 4.4, 16.8, 15.2) },
      { kind: 'ink', d: line(3.8, 12, 20.2, 12, 0.01) },
    ],
  },
  alignLeft: {
    tier: 'action',
    parts: [
      {
        kind: 'ink',
        d:
          line(4, 5.4, 20, 5.4) +
          line(4, 10, 14.4, 10) +
          line(4, 14.6, 18, 14.6) +
          line(4, 19.2, 11.6, 19.2),
      },
    ],
  },
  alignJustify: {
    tier: 'action',
    parts: [
      {
        kind: 'ink',
        d:
          line(4, 5.4, 20, 5.4) +
          line(4, 10, 20, 10) +
          line(4, 14.6, 20, 14.6) +
          line(4, 19.2, 20, 19.2),
      },
    ],
  },
  code: {
    tier: 'action',
    parts: [
      {
        kind: 'ink',
        d:
          poly([
            [8.6, 7.2],
            [4, 12],
            [8.6, 16.8],
          ]) +
          poly([
            [15.4, 7.2],
            [20, 12],
            [15.4, 16.8],
          ]),
      },
    ],
  },
  language: {
    tier: 'action',
    parts: [
      {
        kind: 'ink',
        d:
          line(3.6, 6, 11.6, 6) +
          line(7.6, 4, 7.6, 6) +
          'M5.2 6c.6 3 2.4 5.6 5.4 7.2M10 6c-.8 3.4-2.8 6-5.8 7.6' +
          poly([
            [12.6, 20],
            [16.3, 11.4],
            [20, 20],
          ]) +
          line(13.9, 17.2, 18.7, 17.2),
      },
    ],
  },
  message: {
    tier: 'action',
    parts: [
      { kind: 'wash', d: BUBBLE },
      { kind: 'ink', echo: true, d: BUBBLE },
    ],
  },
  help: {
    tier: 'action',
    parts: [
      { kind: 'wash', d: RING_WASH },
      { kind: 'ink', echo: true, d: RING },
      { kind: 'ink', d: 'M9.4 9.6c.2-1.5 1.3-2.4 2.6-2.4 1.5 0 2.6 1 2.6 2.3 0 2-2.7 2.2-2.8 4.2' },
      { kind: 'dot', cx: 12, cy: 16.9, r: 1.05 },
    ],
  },
  table: { tier: 'feature', parts: table(3.6, 4.6, 16.8, 14.8) },
  tableBlueprint: { tier: 'feature', parts: table(3.6, 4.6, 16.8, 14.8, true) },
  viewTable: {
    tier: 'feature',
    parts: [
      { kind: 'wash', d: box(3.6, 4.6, 16.8, 4.7, 1.6) },
      { kind: 'ink', echo: true, d: rect(3.6, 4.6, 16.8, 14.8) },
      { kind: 'ink', d: line(3.8, 9.3, 20.2, 9.3, 0.01) },
      {
        kind: 'ink',
        d: 'M7.4 14.6c1.2-1.8 2.8-2.8 4.6-2.8s3.4 1 4.6 2.8c-1.2 1.8-2.8 2.8-4.6 2.8s-3.4-1-4.6-2.8z',
      },
      { kind: 'dot', cx: 12, cy: 14.6, r: 1.2 },
    ],
  },
  fieldTemplate: {
    tier: 'feature',
    parts: [
      { kind: 'wash', d: box(3.6, 7.4, 16.8, 9.2, 1.8) },
      { kind: 'ink', dash: true, d: rect(3.6, 7.4, 16.8, 9.2) },
      { kind: 'ink', d: line(7, 12, 13.6, 12) },
      { kind: 'dot', cx: 17, cy: 12, r: 1.2 },
    ],
  },
  mockData: {
    tier: 'feature',
    parts: [
      { kind: 'wash', d: box(4, 4, 16, 16, 3.2) },
      { kind: 'ink', echo: true, d: rect(4, 4, 16, 16, 3.2) },
      { kind: 'dot', cx: 8.2, cy: 8.2, r: 1.35 },
      { kind: 'dot', cx: 15.8, cy: 8.2, r: 1.35 },
      { kind: 'dot', cx: 12, cy: 12, r: 1.35 },
      { kind: 'dot', cx: 8.2, cy: 15.8, r: 1.35 },
      { kind: 'dot', cx: 15.8, cy: 15.8, r: 1.35 },
    ],
  },
  seedData: {
    tier: 'feature',
    parts: [
      { kind: 'wash', d: box(11.4, 12.8, 9.2, 2.8, 1.2) },
      {
        kind: 'ink',
        echo: true,
        d: rect(3.4, 3.8, 9.2, 7.4, 1.4) + rect(11.4, 12.8, 9.2, 7.4, 1.4),
      },
      {
        kind: 'ink',
        d:
          line(3.6, 6.6, 12.4, 6.6, 0.01) +
          line(11.6, 15.6, 20.4, 15.6, 0.01) +
          'M8 11.2v2.8c0 1 .6 1.6 1.6 1.6h1.8',
      },
    ],
  },
  dataImport: {
    tier: 'feature',
    parts: [
      ...table(8.8, 4.6, 11.6, 14.8),
      {
        kind: 'ink',
        g: 'enter',
        d:
          line(3.4, 14.4, 11.4, 14.4) +
          poly([
            [8.6, 11.6],
            [11.4, 14.4],
            [8.6, 17.2],
          ]),
      },
    ],
  },
  database: {
    tier: 'feature',
    parts: [
      { kind: 'wash', d: 'M4.8 6.3h14.4v11.4c0 1.5-3.2 2.7-7.2 2.7s-7.2-1.2-7.2-2.7z' },
      { kind: 'ink', echo: true, d: DB_TOP },
      { kind: 'ink', d: DB_SIDES },
    ],
  },
  replica: {
    tier: 'feature',
    parts: [
      {
        kind: 'ink',
        d: 'M4 8.2c0-1.5 2.6-2.6 6-2.6 2.2 0 4.1.5 5.1 1.2M4 8.2v8.4c0 1.2 1.6 2.1 4 2.5',
      },
      { kind: 'wash', d: 'M7.6 10.6h12.4V18c0 1.2-2.8 2.2-6.2 2.2s-6.2-1-6.2-2.2z' },
      {
        kind: 'ink',
        echo: true,
        d: 'M7.6 10.6c0-1.2 2.8-2.2 6.2-2.2s6.2 1 6.2 2.2-2.8 2.2-6.2 2.2-6.2-1-6.2-2.2z',
      },
      { kind: 'ink', d: 'M7.6 10.6v7.4c0 1.2 2.8 2.2 6.2 2.2s6.2-1 6.2-2.2v-7.4' },
    ],
  },
  shard: {
    tier: 'feature',
    parts: [
      { kind: 'wash', d: 'M12 12V3.8A8.2 8.2 0 0 1 20.2 12z' },
      { kind: 'ink', echo: true, d: RING },
      { kind: 'ink', d: line(12, 12, 12, 3.6, 0.01) + line(12, 12, 20.4, 12, 0.01) },
    ],
  },
  hardDrive: {
    tier: 'feature',
    parts: [
      { kind: 'wash', d: box(3.6, 12.4, 16.8, 7.6, 1.8) },
      { kind: 'ink', echo: true, d: rect(3.6, 12.4, 16.8, 7.6) },
      {
        kind: 'ink',
        d:
          poly([
            [4.4, 12.6],
            [7.4, 5.6],
            [16.6, 5.6],
            [19.6, 12.6],
          ]) + line(6.8, 16.2, 11.6, 16.2),
      },
      { kind: 'dot', cx: 16.6, cy: 16.2, r: 1.2 },
    ],
  },
  layers: {
    tier: 'feature',
    parts: [
      { kind: 'wash', d: 'M12 4.6 19.4 8.2 12 11.8 4.6 8.2z' },
      {
        kind: 'ink',
        echo: true,
        d: poly(
          [
            [12, 3.8],
            [20.2, 8],
            [12, 12.2],
            [3.8, 8],
          ],
          true,
        ),
      },
      {
        kind: 'ink',
        d:
          poly([
            [3.8, 12],
            [12, 16.2],
            [20.2, 12],
          ]) +
          poly([
            [3.8, 16],
            [12, 20.2],
            [20.2, 16],
          ]),
      },
    ],
  },
  workspace: {
    tier: 'feature',
    parts: [
      { kind: 'wash', d: box(3.6, 4, 16.8, 16, 1.8) },
      { kind: 'ink', echo: true, d: rect(3.6, 4, 16.8, 16) },
      { kind: 'ink', d: line(3.8, 12, 20.2, 12, 0.01) + line(10, 8, 14, 8) + line(10, 16, 14, 16) },
    ],
  },
  folder: {
    tier: 'feature',
    parts: [
      { kind: 'ink', d: FOLDER_BACK },
      { kind: 'wash', d: folderFront(FOLDER_CLOSED) },
      { kind: 'ink', d: folderFront(FOLDER_CLOSED) },
    ],
  },
  folderOpen: {
    tier: 'feature',
    parts: [
      { kind: 'ink', d: FOLDER_BACK },
      { kind: 'wash', d: folderFront(FOLDER_OPEN) },
      { kind: 'ink', d: folderFront(FOLDER_OPEN) },
    ],
  },
  draft: {
    tier: 'feature',
    tone: 'warning',
    parts: [
      ...page(4.4, 3.8, 11.6, 16.4),
      ...pencil(
        [
          [17.4, 10.6],
          [19.6, 12.8],
          [13.4, 19],
          [10.8, 19.4],
          [11.2, 16.8],
        ],
        [16.2, 11.8, 18.4, 14],
      ),
    ],
  },
  importFile: {
    tier: 'feature',
    parts: [
      ...page(8.4, 3.8, 11.6, 16.4),
      {
        kind: 'ink',
        g: 'enter',
        d:
          line(3.4, 13.4, 12.2, 13.4) +
          poly([
            [9.4, 10.4],
            [12.4, 13.4],
            [9.4, 16.4],
          ]),
      },
    ],
  },
  sparkles: {
    tier: 'feature',
    tone: 'ai',
    parts: [
      {
        kind: 'wash',
        g: 'star',
        d: 'M10.3 7.4c.7 3.3 2 4.6 5.3 5.4-3.3.8-4.6 2.1-5.3 5.4-.7-3.3-2-4.6-5.3-5.4 3.3-.8 4.6-2.1 5.3-5.4z',
      },
      {
        kind: 'ink',
        g: 'star',
        d: 'M10.5 6.8c.6 3.5 1.9 5.2 5.6 6 .3.1.3.4 0 .5-3.7.8-5 2.4-5.6 6-.1.3-.4.3-.5 0-.6-3.6-1.9-5.2-5.6-6-.3-.1-.3-.4 0-.5 3.7-.8 5-2.5 5.6-6 .1-.3.4-.3.5 0z',
      },
      {
        kind: 'ink',
        g: 'twinkle',
        d: 'M18 3.2c.3 1.3.8 1.9 2.1 2.2-1.3.3-1.8.9-2.1 2.2-.3-1.3-.8-1.9-2.1-2.2 1.3-.3 1.8-.9 2.1-2.2z',
      },
    ],
  },
  aiEdit: {
    tier: 'feature',
    tone: 'ai',
    parts: [
      ...pencil(
        [
          [12.8, 6.4],
          [16.6, 10.2],
          [8.4, 18.4],
          [4.2, 19],
          [4.8, 14.8],
        ],
        [11.2, 8, 15, 11.8],
      ),
      { kind: 'ink', g: 'twinkle', d: sparkle(18.4, 5.4, 2.6) },
    ],
  },
  aiComment: {
    tier: 'feature',
    tone: 'ai',
    parts: [
      { kind: 'wash', d: BUBBLE },
      { kind: 'ink', echo: true, d: BUBBLE },
      { kind: 'ink', g: 'twinkle', d: sparkle(12, 11.6, 3.6) },
    ],
  },
  aiIndex: {
    tier: 'feature',
    tone: 'ai',
    parts: [
      {
        kind: 'ink',
        d: line(4, 7.4, 12.4, 7.4) + line(4, 12, 14.4, 12) + line(4, 16.6, 11.4, 16.6),
      },
      { kind: 'wash', g: 'star', d: sparkle(17.4, 11.6, 3.4) },
      { kind: 'ink', g: 'star', d: sparkle(17.6, 11.4, 3.6) },
    ],
  },
  wand: {
    tier: 'feature',
    tone: 'ai',
    parts: [
      { kind: 'ink', d: line(4.2, 19.8, 14.6, 9.4) + line(12.4, 9.8, 14.2, 11.6) },
      { kind: 'ink', g: 'twinkle', d: sparkle(18, 6, 3) },
      { kind: 'ink', d: sparkle(9.4, 5.4, 1.8) + sparkle(18.6, 14.6, 1.6) },
    ],
  },
  bolt: {
    tier: 'feature',
    tone: 'warning',
    parts: [
      {
        kind: 'wash',
        d: poly(
          [
            [13.6, 3.4],
            [5.4, 13.4],
            [11.6, 13.4],
            [10.4, 20.6],
            [18.6, 10.4],
            [12.4, 10.4],
          ],
          true,
        ),
      },
      {
        kind: 'ink',
        echo: true,
        d: poly(
          [
            [13.6, 3.4],
            [5.4, 13.4],
            [11.6, 13.4],
            [10.4, 20.6],
            [18.6, 10.4],
            [12.4, 10.4],
          ],
          true,
        ),
      },
    ],
  },
  lightbulb: {
    tier: 'feature',
    tone: 'warning',
    parts: [
      { kind: 'wash', d: BULB },
      { kind: 'ink', echo: true, d: BULB },
      { kind: 'ink', d: line(9.6, 18.5, 14.4, 18.5) + line(10.6, 20.6, 13.4, 20.6) },
    ],
  },
  graduationCap: {
    tier: 'feature',
    tone: 'ai',
    parts: [
      { kind: 'wash', d: 'M12 5.4 19.6 9 12 12.6 4.4 9z' },
      {
        kind: 'ink',
        echo: true,
        d: poly(
          [
            [12, 4.6],
            [21, 9],
            [12, 13.4],
            [3, 9],
          ],
          true,
        ),
      },
      {
        kind: 'ink',
        d: 'M6.6 11v4.4c1.6 1.6 3.4 2.4 5.4 2.4s3.8-.8 5.4-2.4V11' + line(21, 9, 21, 14.4),
      },
    ],
  },
  key: {
    tier: 'feature',
    tone: 'warning',
    parts: [
      { kind: 'wash', d: disc(7.6, 15.8, 3.4) },
      { kind: 'ink', echo: true, d: ring(7.6, 15.8, 3.6) },
      {
        kind: 'ink',
        d: line(10.2, 13.2, 19.4, 4) + line(16.2, 7.2, 18.6, 9.6) + line(13.8, 9.6, 15.6, 11.4),
      },
    ],
  },
  index: {
    tier: 'feature',
    tone: 'success',
    parts: [
      { kind: 'wash', d: box(4, 3.8, 12.4, 16.4, 1.6) },
      { kind: 'ink', echo: true, d: rect(4, 3.8, 12.4, 16.4, 1.6) },
      {
        kind: 'ink',
        d:
          'M16.4 6.4h2.4c.7 0 1.2.5 1.2 1.2v2c0 .7-.5 1.2-1.2 1.2h-2.4M16.4 12.6h2.4c.7 0 1.2.5 1.2 1.2v2c0 .7-.5 1.2-1.2 1.2h-2.4' +
          line(7.2, 8.4, 13.2, 8.4) +
          line(7.2, 12, 13.2, 12) +
          line(7.2, 15.6, 11, 15.6),
      },
    ],
  },
  uniqueIndex: {
    tier: 'feature',
    parts: [
      { kind: 'wash', d: box(4, 3.8, 12.4, 16.4, 1.6) },
      { kind: 'ink', echo: true, d: rect(4, 3.8, 12.4, 16.4, 1.6) },
      {
        kind: 'ink',
        d: 'M16.4 6.4h2.4c.7 0 1.2.5 1.2 1.2v2c0 .7-.5 1.2-1.2 1.2h-2.4M8.6 9.2l2-1.6v8.8M8.4 16.4h4.4',
      },
    ],
  },
  fields: {
    tier: 'feature',
    parts: [
      { kind: 'dot', cx: 5, cy: 6.4, r: 1.2 },
      { kind: 'dot', cx: 5, cy: 12, r: 1.2 },
      { kind: 'dot', cx: 5, cy: 17.6, r: 1.2 },
      {
        kind: 'ink',
        d: line(8.6, 6.4, 20, 6.4) + line(8.6, 12, 18, 12) + line(8.6, 17.6, 19, 17.6),
      },
    ],
  },
  history: {
    tier: 'feature',
    parts: [
      { kind: 'ink', echo: true, d: 'M4.6 12.4A7.6 7.6 0 1 0 6.8 6.6' },
      { kind: 'ink', d: 'M3.6 8.4l1 4 4-.8' + line(12, 8, 12, 12.2) + line(12, 12.2, 14.8, 14) },
    ],
  },
  clock: {
    tier: 'feature',
    parts: [
      { kind: 'wash', d: RING_WASH },
      { kind: 'ink', echo: true, d: RING },
      { kind: 'ink', d: 'M12.1 7.4c0 1.5 0 3.1-.1 4.6 1.2.7 2.3 1.4 3.4 2.1' },
    ],
  },
  erDiagram: {
    tier: 'feature',
    parts: [
      { kind: 'wash', d: box(3.6, 4, 7.6, 5.6, 1.4) },
      { kind: 'ink', echo: true, d: rect(3.6, 4, 7.6, 5.6, 1.4) + rect(12.8, 14.4, 7.6, 5.6, 1.4) },
      { kind: 'ink', d: 'M11.2 6.8c3.2 0 5.4.2 5.4 3.4v4.2' },
    ],
  },
  compare: {
    tier: 'feature',
    parts: [
      { kind: 'wash', d: box(13.4, 11, 6.6, 2.8, 1) },
      {
        kind: 'ink',
        echo: true,
        d: rect(3.6, 4.6, 7.4, 14.8, 1.4) + rect(13, 4.6, 7.4, 14.8, 1.4),
      },
      {
        kind: 'ink',
        d: line(5.8, 9, 8.8, 9) + line(5.8, 12.4, 8.8, 12.4) + line(15.2, 8, 18.2, 8),
      },
    ],
  },
  book: {
    tier: 'feature',
    parts: [
      { kind: 'wash', d: BOOK },
      { kind: 'ink', echo: true, d: BOOK },
      { kind: 'ink', d: line(12, 6.8, 12, 19.6, 0.01) },
    ],
  },
  star: {
    tier: 'feature',
    tone: 'warning',
    parts: [
      { kind: 'wash', d: STAR },
      { kind: 'ink', echo: true, d: STAR },
    ],
  },
  barChart: {
    tier: 'feature',
    parts: [
      { kind: 'wash', d: box(10.1, 6.6, 3.8, 13.2, 1) },
      {
        kind: 'ink',
        d:
          rect(4.6, 11.4, 3.8, 8.4, 1) +
          rect(10.1, 6.6, 3.8, 13.2, 1) +
          rect(15.6, 9.4, 3.8, 10.4, 1),
      },
    ],
  },
  link: {
    tier: 'feature',
    parts: [
      {
        kind: 'ink',
        d:
          'M10 15.4H7.4a3.4 3.4 0 0 1 0-6.8H10M14 8.6h2.6a3.4 3.4 0 0 1 0 6.8H14' +
          line(8.6, 12, 15.4, 12),
      },
    ],
  },
  shieldCheck: {
    tier: 'feature',
    tone: 'success',
    parts: [
      { kind: 'wash', d: SHIELD },
      { kind: 'ink', echo: true, d: SHIELD },
      { kind: 'ink', d: 'M8.8 12.2c.8.8 1.6 1.6 2.3 2.5 1.4-1.8 2.8-3.5 4.3-5' },
    ],
  },
  network: {
    tier: 'feature',
    parts: [
      { kind: 'wash', d: disc(12, 12, 2.4) },
      {
        kind: 'ink',
        d:
          ring(12, 12, 2.6) +
          ring(5.4, 5.6, 2) +
          ring(18.6, 5.6, 2) +
          ring(12, 19, 1.9) +
          line(7, 7.1, 10.1, 10.2) +
          line(17, 7.1, 13.9, 10.2) +
          line(12, 14.6, 12, 17.1),
      },
    ],
  },
  listChecks: {
    tier: 'feature',
    parts: [
      {
        kind: 'ink',
        d:
          'M4 7.2l1.6 1.6 3-3.2M4 14l1.6 1.6 3-3.2' +
          line(11.6, 7, 20, 7) +
          line(11.6, 13.8, 20, 13.8) +
          line(11.6, 19.4, 20, 19.4),
      },
    ],
  },
  grid: {
    tier: 'feature',
    parts: [
      { kind: 'wash', d: box(3.6, 3.6, 5.6, 5.6, 1.4) },
      { kind: 'ink', echo: true, d: rect(3.6, 3.6, 16.8, 16.8) },
      {
        kind: 'ink',
        d:
          line(9.2, 3.8, 9.2, 20.2, 0.01) +
          line(14.8, 3.8, 14.8, 20.2, 0.01) +
          line(3.8, 9.2, 20.2, 9.2, 0.01) +
          line(3.8, 14.8, 20.2, 14.8, 0.01),
      },
    ],
  },
  query: {
    tier: 'feature',
    parts: [
      { kind: 'wash', d: disc(16.2, 16.2, 3.2) },
      { kind: 'ink', echo: true, d: rect(3.6, 3.6, 11.2, 11.2, 1.6) },
      {
        kind: 'ink',
        d: line(3.8, 7.4, 14.6, 7.4, 0.01) + ring(16.2, 16.2, 3.4) + line(18.6, 18.6, 20.6, 20.6),
      },
    ],
  },
  user: {
    tier: 'feature',
    parts: [
      { kind: 'wash', d: disc(12, 8.6, 3.6) },
      { kind: 'ink', echo: true, d: ring(12, 8.6, 3.8) },
      { kind: 'ink', d: 'M4.6 20c.8-3.6 3.7-5.8 7.4-5.8s6.6 2.2 7.4 5.8' },
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
  const transform = def.rotate ? `rotate(${def.rotate} 12 12)` : undefined;
  const elements: IconElement[] = [];
  const echoes: IconElement[] = [];

  def.parts.forEach((part, index) => {
    const key = String(index);
    const group = part.g ? ` lm-ic-g-${part.g}` : '';

    if (part.kind === 'wash') {
      if (showsWash(def.tier, size)) {
        elements.push({ key, tag: 'path', className: `lm-ic-wash${group}`, d: part.d, transform });
      }

      return;
    }

    if (part.kind === 'dot') {
      const { cx, cy, r } = part;
      elements.push({ key, tag: 'circle', className: `lm-ic-dot${group}`, cx, cy, r, transform });

      return;
    }

    const dash = part.dash ? ' lm-ic-dash' : '';
    elements.push({
      key,
      tag: 'path',
      className: `lm-ic-ink${dash}${group}`,
      d: part.d,
      strokeWidth: stroke,
      transform,
    });

    if (part.echo && !part.g && size >= 20) {
      echoes.push({
        key: `${key}e`,
        tag: 'path',
        className: `lm-ic-ink lm-ic-echo${dash}`,
        d: part.d,
        strokeWidth: stroke / 2,
        transform: `${transform ?? ''} translate(0.55 -0.45) rotate(0.8 12 12)`.trim(),
      });
    }
  });

  return [...elements, ...echoes];
}
