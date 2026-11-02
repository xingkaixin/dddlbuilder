import { createRng, hashSeed, hatch, roughRect, type Rng } from './sketch-path';

const AMP = 1.1;

export interface InkOptions {
  id: string;
  seedText: string;
  width: number;
  height: number;
  radius?: number;
  wash?: boolean;
}

function grainFilter(id: string, seed: number): string {
  return `<filter id="g${id}" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="${seed % 997}" result="n" />
    <feDisplacementMap in="SourceGraphic" in2="n" scale="1.3" xChannelSelector="R" yChannelSelector="G" result="d" />
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1.8 0 0 0 -0.12" result="m" />
    <feComposite in="d" in2="m" operator="in" />
  </filter>`;
}

function washLayer(rng: Rng, width: number, height: number, radius: number, id: string): string {
  const inset = 2 + rng() * 1.5;
  const clipRadius = Math.max(0, Math.min(radius, (height - inset * 2) / 2));

  const lines = hatch(rng, width, height, { inset: 0, spacing: 3.2 })
    .map(
      (line) =>
        `<line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke-opacity="${line.opacity}" stroke-width="${line.width}" />`,
    )
    .join('');

  return `<clipPath id="c${id}">
      <rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${height - inset * 2}" rx="${clipRadius}" />
    </clipPath>
    <g class="lm-wash" clip-path="url(#c${id})">
      <g filter="url(#g${id})">
        <rect class="lm-wash-tint" width="${width}" height="${height}" />${lines}
      </g>
    </g>`;
}

export function inkMarkup({ id, seedText, width, height, radius = 6, wash }: InkOptions): string {
  const seed = hashSeed(seedText);
  const rng = createRng(seed);
  const washed = wash ? washLayer(rng, width, height, radius, id) : '';
  const main = roughRect(rng, width, height, { inset: 1.5, radius, amp: AMP, breaks: 0.25 });
  const echo = roughRect(rng, width, height, { inset: 1.5, radius, amp: AMP * 1.35, breaks: 0.45 });

  return `${grainFilter(id, seed)}${washed}
    <g filter="url(#g${id})">
      <path class="lm-s lm-s1" d="${main}" />
      <path class="lm-s lm-s2" d="${echo}" />
    </g>`;
}
