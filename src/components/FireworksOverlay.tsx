import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface FireworksOverlayProps {
  onComplete: () => void;
}

interface Star {
  id: number;
  left: string;
  top: string;
  size: number;
  duration: number;
  minOpacity: number;
}

type ParticleType = 'normal' | 'comet' | 'sparkle';

type ScheduleTimeout = (callback: () => void, delay: number) => number;

const COLOR_PALETTES: string[][] = [
  ['#ffd700', '#ff6b35', '#ff4444', '#ffaa00'],
  ['#00d4ff', '#7b68ee', '#da70d6', '#87ceeb'],
  ['#00ff88', '#32cd32', '#7fff00', '#adff2f'],
  ['#ff69b4', '#ffb6c1', '#ffffff', '#ffc0cb'],
  ['#ff8c00', '#ffa500', '#ffcc00', '#ff4500'],
  ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#8b00ff'],
];

function random(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function randomInt(min: number, max: number) {
  return Math.floor(random(min, max + 1));
}

function randomFromArray<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function hexToRgba(hex: string, alpha: number) {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function createStars(width: number, height: number): Star[] {
  const count = Math.max(30, Math.floor((width * height) / 8000));
  return Array.from({ length: count }, (_, id) => ({
    id,
    left: `${random(0, 100)}%`,
    top: `${random(0, 100)}%`,
    size: random(1, 3),
    duration: random(2, 5),
    minOpacity: random(0.2, 0.5),
  }));
}

class Particle {
  x: number;
  y: number;
  color: string;
  velocity: { x: number; y: number };
  type: ParticleType;
  alpha: number;
  decay: number;
  gravity: number;
  friction: number;
  size: number;
  trail: { x: number; y: number; alpha: number }[];
  maxTrail: number;
  sparkleTimer: number;

  constructor(
    x: number,
    y: number,
    color: string,
    velocity: { x: number; y: number },
    type: ParticleType = 'normal',
  ) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.velocity = velocity;
    this.type = type;
    this.alpha = 1;
    this.decay = random(0.012, 0.025);
    this.gravity = 0.06;
    this.friction = 0.98;
    this.size = random(2, 4);
    this.trail = [];
    this.maxTrail = type === 'comet' ? 15 : 8;
    this.sparkleTimer = 0;
  }

  update() {
    this.trail.push({ x: this.x, y: this.y, alpha: this.alpha });
    if (this.trail.length > this.maxTrail) {
      this.trail.shift();
    }

    this.velocity.x *= this.friction;
    this.velocity.y *= this.friction;
    this.velocity.y += this.gravity;

    this.x += this.velocity.x;
    this.y += this.velocity.y;
    this.alpha -= this.decay;

    if (this.type === 'sparkle') {
      this.sparkleTimer += 1;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.trail.length > 1) {
      for (let i = 0; i < this.trail.length; i += 1) {
        const point = this.trail[i];
        const progress = i / this.trail.length;
        const size = Math.max(0.5, this.size * progress * 0.6);

        ctx.beginPath();
        ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(this.color, point.alpha * progress * 0.5);
        ctx.fill();
      }
    }

    let displayAlpha = this.alpha;
    if (this.type === 'sparkle' && this.sparkleTimer % 4 < 2) {
      displayAlpha *= 0.4;
    }

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(this.color, displayAlpha);
    ctx.fill();

    if (this.alpha > 0.3) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * 2, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(this.color, displayAlpha * 0.3);
      ctx.fill();
    }
  }
}

class Firework {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  velocity: { x: number; y: number };
  trail: { x: number; y: number }[];
  maxTrail: number;
  color: string;
  palette: string[];
  type:
    | 'sphere'
    | 'chrysanthemum'
    | 'willow'
    | 'ring'
    | 'star'
    | 'heart'
    | 'double';
  arrived: boolean;
  onExplode: () => void;
  scheduleTimeout: ScheduleTimeout;

  constructor(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
    onExplode: () => void,
    scheduleTimeout: ScheduleTimeout,
  ) {
    this.x = startX;
    this.y = startY;
    this.targetX = targetX;
    this.targetY = targetY;

    const angle = Math.atan2(targetY - startY, targetX - startX);
    const speed = random(12, 18);
    this.velocity = {
      x: Math.cos(angle) * speed,
      y: Math.sin(angle) * speed,
    };

    this.trail = [];
    this.maxTrail = 12;
    this.palette = randomFromArray(COLOR_PALETTES);
    this.color = randomFromArray(this.palette);
    this.type = randomFromArray([
      'sphere',
      'chrysanthemum',
      'willow',
      'ring',
      'star',
      'heart',
      'double',
    ]);
    this.arrived = false;
    this.onExplode = onExplode;
    this.scheduleTimeout = scheduleTimeout;
  }

  update(particles: Particle[]) {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > this.maxTrail) {
      this.trail.shift();
    }

    this.velocity.y += 0.15;
    this.x += this.velocity.x;
    this.y += this.velocity.y;

    const distance = Math.hypot(this.targetX - this.x, this.targetY - this.y);
    if (distance < 30 || this.velocity.y >= 0) {
      this.arrived = true;
      this.explode(particles);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (let i = 0; i < this.trail.length; i += 1) {
      const point = this.trail[i];
      const progress = i / this.trail.length;
      const size = Math.max(0.5, 3 * progress);

      ctx.beginPath();
      ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(this.color, progress * 0.8);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(this.x, this.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(this.color, 0.4);
    ctx.fill();
  }

  private explode(particles: Particle[]) {
    const particleCount = this.type === 'double' ? 150 : 100;

    switch (this.type) {
      case 'sphere':
        this.sphereExplosion(particleCount, particles);
        break;
      case 'chrysanthemum':
        this.chrysanthemumExplosion(particleCount, particles);
        break;
      case 'willow':
        this.willowExplosion(particleCount, particles);
        break;
      case 'ring':
        this.ringExplosion(particleCount, particles);
        break;
      case 'star':
        this.starExplosion(particleCount, particles);
        break;
      case 'heart':
        this.heartExplosion(particleCount, particles);
        break;
      case 'double':
        this.doubleExplosion(particleCount, particles);
        break;
      default:
        this.sphereExplosion(particleCount, particles);
        break;
    }

    this.onExplode();
  }

  private sphereExplosion(count: number, particles: Particle[]) {
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + random(-0.1, 0.1);
      const speed = random(2, 10);
      particles.push(
        new Particle(
          this.x,
          this.y,
          randomFromArray(this.palette),
          { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
          random(0, 1) > 0.7 ? 'sparkle' : 'normal',
        ),
      );
    }
  }

  private chrysanthemumExplosion(count: number, particles: Particle[]) {
    for (let i = 0; i < count; i += 1) {
      const angle = random(0, Math.PI * 2);
      const speed = random(3, 8);
      particles.push(
        new Particle(
          this.x,
          this.y,
          randomFromArray(this.palette),
          { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
          'comet',
        ),
      );
    }
  }

  private willowExplosion(count: number, particles: Particle[]) {
    for (let i = 0; i < count; i += 1) {
      const angle = random(-Math.PI * 0.8, -Math.PI * 0.2);
      const speed = random(2, 12);
      const particle = new Particle(
        this.x,
        this.y,
        randomFromArray(['#ffd700', '#ffaa00', '#ff8800']),
        { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        'comet',
      );
      particle.gravity = 0.12;
      particle.decay = random(0.008, 0.015);
      particles.push(particle);
    }
  }

  private ringExplosion(count: number, particles: Particle[]) {
    const rings = 3;
    for (let ringIndex = 0; ringIndex < rings; ringIndex += 1) {
      const ringCount = Math.floor(count / rings);
      const speed = 4 + ringIndex * 3;
      const color = this.palette[ringIndex % this.palette.length];

      for (let i = 0; i < ringCount; i += 1) {
        const angle = (Math.PI * 2 * i) / ringCount;
        particles.push(
          new Particle(this.x, this.y, color, {
            x: Math.cos(angle) * speed,
            y: Math.sin(angle) * speed,
          }),
        );
      }
    }
  }

  private starExplosion(count: number, particles: Particle[]) {
    const points = 5;
    const outerRadius = 10;
    const innerRadius = 4;

    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count;
      const pointIndex = Math.floor((angle / (Math.PI * 2)) * points * 2);
      const isOuter = pointIndex % 2 === 0;
      const speed = isOuter ? random(6, outerRadius) : random(2, innerRadius);

      particles.push(
        new Particle(
          this.x,
          this.y,
          randomFromArray(this.palette),
          { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
          'sparkle',
        ),
      );
    }
  }

  private heartExplosion(count: number, particles: Particle[]) {
    for (let i = 0; i < count; i += 1) {
      const t = (i / count) * Math.PI * 2;
      const heartX = 16 * Math.sin(t) ** 3;
      const heartY = -(
        13 * Math.cos(t) -
        5 * Math.cos(2 * t) -
        2 * Math.cos(3 * t) -
        Math.cos(4 * t)
      );

      const particle = new Particle(
        this.x,
        this.y,
        randomFromArray(['#ff1493', '#ff69b4', '#ff0000']),
        { x: heartX * 0.5, y: heartY * 0.5 },
      );
      particle.decay = random(0.01, 0.02);
      particles.push(particle);
    }
  }

  private doubleExplosion(count: number, particles: Particle[]) {
    for (let i = 0; i < count / 2; i += 1) {
      const angle = random(0, Math.PI * 2);
      const speed = random(6, 12);
      particles.push(
        new Particle(
          this.x,
          this.y,
          randomFromArray(this.palette),
          { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
          'comet',
        ),
      );
    }

    for (let i = 0; i < count / 2; i += 1) {
      const angle = random(0, Math.PI * 2);
      const offsetX = Math.cos(angle) * random(20, 50);
      const offsetY = Math.sin(angle) * random(20, 50);

      this.scheduleTimeout(
        () => {
          for (let j = 0; j < 10; j += 1) {
            const subAngle = random(0, Math.PI * 2);
            const subSpeed = random(1, 4);
            particles.push(
              new Particle(
                this.x + offsetX,
                this.y + offsetY,
                randomFromArray(this.palette),
                {
                  x: Math.cos(subAngle) * subSpeed,
                  y: Math.sin(subAngle) * subSpeed,
                },
                'sparkle',
              ),
            );
          }
        },
        random(100, 300),
      );
    }
  }
}

function Lantern({ right = false }: { right?: boolean }) {
  return (
    <div
      className={`cny-lantern ${right ? 'cny-lantern-right' : 'cny-lantern-left'}`}
    >
      <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
        <line x1="50" y1="0" x2="50" y2="15" stroke="#FFD700" strokeWidth="2" />
        <rect x="35" y="15" width="30" height="6" rx="2" fill="#FFD700" />
        <ellipse cx="50" cy="45" rx="35" ry="28" fill="#D32F2F" />
        <path d="M50 17 V 73" stroke="#B71C1C" strokeWidth="1" fill="none" />
        <path
          d="M35 19 Q 25 45 35 71"
          stroke="#B71C1C"
          strokeWidth="1"
          fill="none"
        />
        <path
          d="M65 19 Q 75 45 65 71"
          stroke="#B71C1C"
          strokeWidth="1"
          fill="none"
        />
        <rect x="35" y="70" width="30" height="6" rx="2" fill="#FFD700" />
        <path d="M50 76 V 85" stroke="#D32F2F" strokeWidth="3" />
        <path
          d="M50 85 Q 45 95 40 98"
          stroke="#D32F2F"
          strokeWidth="2"
          fill="none"
        />
        <path
          d="M50 85 Q 55 95 60 98"
          stroke="#D32F2F"
          strokeWidth="2"
          fill="none"
        />
        <path d="M50 85 V 100" stroke="#D32F2F" strokeWidth="2" fill="none" />
        <circle cx="50" cy="45" r="8" fill="#FFD700" opacity="0.8" />
        <text
          x="50"
          y="49"
          fontSize="10"
          textAnchor="middle"
          fill="#D32F2F"
          fontFamily="serif"
          fontWeight="700"
        >
          福
        </text>
      </svg>
    </div>
  );
}

export default function FireworksOverlay({
  onComplete,
}: FireworksOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stars, setStars] = useState<Star[]>([]);
  const [fireworkCount, setFireworkCount] = useState(0);
  const [showClose, setShowClose] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const cnyStyles = useMemo(
    () => `
      .cny-overlay {
        --bg-dark: #0a0a12;
        --bg-gradient: #0d0d1a;
        --gold: #ffd700;
        --text-primary: #f0e6d3;
        --text-muted: #8b7355;
      }

      .cny-overlay {
        position: fixed;
        inset: 0;
        z-index: 100;
        background: var(--bg-dark);
        overflow: hidden;
      }

      .cny-stars {
        position: absolute;
        inset: 0;
        z-index: 0;
        background: radial-gradient(ellipse at bottom, #1a1a2e 0%, var(--bg-dark) 100%);
      }

      .cny-star {
        position: absolute;
        background: #fff;
        border-radius: 9999px;
        animation: cny-twinkle var(--duration) ease-in-out infinite;
      }

      .cny-canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: 1;
      }

      .cny-content {
        position: absolute;
        inset: 0;
        z-index: 10;
        pointer-events: none;
      }

      .cny-greeting {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        animation: cny-float 4s ease-in-out infinite;
      }

      .cny-title {
        margin: 0;
        font-size: clamp(3rem, 10vw, 7rem);
        color: transparent;
        background: linear-gradient(135deg, #ffd700 0%, #ff6b6b 50%, #ffd700 100%);
        background-size: 200% 200%;
        -webkit-background-clip: text;
        background-clip: text;
        text-shadow: 0 0 60px rgba(255, 215, 0, 0.3);
        letter-spacing: 0.1em;
        animation: cny-shimmer 3s ease-in-out infinite;
        font-family: 'KaiTi', 'STKaiti', 'Songti SC', serif;
        font-weight: 700;
      }

      .cny-subtitle {
        margin-top: 0.85rem;
        font-size: clamp(1rem, 3vw, 1.5rem);
        color: var(--text-primary);
        opacity: 0.9;
        letter-spacing: 0.3em;
      }

      .cny-hint {
        position: absolute;
        bottom: 2rem;
        left: 50%;
        transform: translateX(-50%);
        color: var(--text-muted);
        font-size: 0.9rem;
        text-align: center;
        animation: cny-pulse 2s ease-in-out infinite;
      }

      .cny-counter {
        position: absolute;
        top: 1.2rem;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(20, 20, 35, 0.8);
        border: 1px solid rgba(255, 215, 0, 0.2);
        border-radius: 12px;
        color: var(--gold);
        font-size: 0.85rem;
        padding: 0.75rem 1.25rem;
        backdrop-filter: blur(10px);
        text-align: center;
      }

      .cny-lantern {
        position: absolute;
        z-index: 5;
        transform-origin: 50% 0%;
        animation: cny-sway-left 4.6s ease-in-out infinite;
        pointer-events: none;
        will-change: transform;
      }

      .cny-lantern-left {
        top: 5%;
        left: 5%;
        animation-delay: 0s;
      }

      .cny-lantern-right {
        top: 8%;
        right: 5%;
        animation: cny-sway-right 5.1s ease-in-out infinite;
      }

      .cny-lantern svg {
        width: clamp(40px, 8vw, 80px);
        height: auto;
        filter: drop-shadow(0 0 20px rgba(255, 100, 100, 0.6));
      }

      .cny-close {
        position: absolute;
        top: 1rem;
        right: 1rem;
        z-index: 20;
      }

      @keyframes cny-twinkle {
        0%, 100% { opacity: var(--min-opacity); transform: scale(1); }
        50% { opacity: 1; transform: scale(1.2); }
      }

      @keyframes cny-float {
        0%, 100% { transform: translate(-50%, -50%) translateY(0); }
        50% { transform: translate(-50%, -50%) translateY(-15px); }
      }

      @keyframes cny-shimmer {
        0%, 100% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
      }

      @keyframes cny-pulse {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 1; }
      }

      @keyframes cny-sway-left {
        0%, 100% { transform: rotate(-10deg) translateY(0); }
        50% { transform: rotate(8deg) translateY(-4px); }
      }

      @keyframes cny-sway-right {
        0%, 100% { transform: rotate(10deg) translateY(0); }
        50% { transform: rotate(-8deg) translateY(-4px); }
      }

      @media (max-width: 640px) {
        .cny-counter {
          top: 0.95rem;
          font-size: 0.75rem;
          padding: 0.6rem 0.85rem;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .cny-star,
        .cny-greeting,
        .cny-hint {
          animation: none !important;
        }

        .cny-title {
          animation: none !important;
          background-position: 0 50%;
        }
      }
    `,
    [],
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);

    return () => {
      mediaQuery.removeEventListener('change', updatePreference);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let animationId = 0;
    let destroyed = false;

    const timeoutIds: number[] = [];
    const fireworks: Firework[] = [];
    const particles: Particle[] = [];

    const scheduleTimeout: ScheduleTimeout = (callback, delay) => {
      const timeoutId = window.setTimeout(() => {
        if (destroyed) return;
        callback();
      }, delay);
      timeoutIds.push(timeoutId);
      return timeoutId;
    };

    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      setStars(createStars(width, height));
    };

    const launchAtPosition = (x: number, y: number) => {
      const startX = x + random(-50, 50);
      fireworks.push(
        new Firework(
          startX,
          height,
          x,
          y,
          () => {
            setFireworkCount((current) => current + 1);
          },
          scheduleTimeout,
        ),
      );
    };

    const autoLaunch = () => {
      if (destroyed) return;

      const launchCount = prefersReducedMotion ? 2 : randomInt(3, 4);
      const launchGap = prefersReducedMotion
        ? random(220, 360)
        : random(70, 130);
      for (let i = 0; i < launchCount; i += 1) {
        scheduleTimeout(() => {
          const startX = random(width * 0.1, width * 0.9);
          const targetX = startX + random(-100, 100);
          const targetY = prefersReducedMotion
            ? random(height * 0.18, height * 0.36)
            : random(height * 0.1, height * 0.4);
          fireworks.push(
            new Firework(
              startX,
              height,
              targetX,
              targetY,
              () => {
                setFireworkCount((current) => current + 1);
              },
              scheduleTimeout,
            ),
          );
        }, i * launchGap);
      }
    };

    const burstAtPosition = (x: number, y: number, particleCount: number) => {
      const palette = randomFromArray(COLOR_PALETTES);
      for (let i = 0; i < particleCount; i += 1) {
        const angle = random(0, Math.PI * 2);
        const speed = random(2.5, 9.5);
        particles.push(
          new Particle(
            x,
            y,
            randomFromArray(palette),
            { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
            random(0, 1) > 0.75 ? 'sparkle' : 'normal',
          ),
        );
      }
      setFireworkCount((current) => current + 1);
    };

    const launchOpeningShow = () => {
      if (destroyed) return;

      const burstSteps = [
        {
          x: 0.5,
          y: 0.3,
          delay: 60,
          count: prefersReducedMotion ? 45 : 120,
        },
        {
          x: 0.28,
          y: 0.35,
          delay: 180,
          count: prefersReducedMotion ? 35 : 90,
        },
        {
          x: 0.72,
          y: 0.35,
          delay: 260,
          count: prefersReducedMotion ? 35 : 90,
        },
      ];
      const rocketSteps = [
        { x: 0.18, y: 0.34, delay: 260 },
        { x: 0.82, y: 0.34, delay: 480 },
        { x: 0.5, y: 0.22, delay: 760 },
        { x: 0.32, y: 0.28, delay: 980 },
        { x: 0.68, y: 0.28, delay: 1180 },
        { x: 0.5, y: 0.36, delay: 1460 },
      ];

      for (const step of burstSteps) {
        scheduleTimeout(() => {
          burstAtPosition(width * step.x, height * step.y, step.count);
        }, step.delay);
      }

      for (const step of rocketSteps) {
        scheduleTimeout(() => {
          launchAtPosition(width * step.x, height * step.y);
        }, step.delay);
      }
    };

    const scheduleNextAutoLaunch = () => {
      if (destroyed) return;
      scheduleTimeout(
        () => {
          autoLaunch();
          scheduleNextAutoLaunch();
        },
        prefersReducedMotion ? random(2400, 3600) : random(650, 1100),
      );
    };

    const animate = () => {
      ctx.fillStyle = 'rgba(10, 10, 18, 0.15)';
      ctx.fillRect(0, 0, width, height);

      for (let i = fireworks.length - 1; i >= 0; i -= 1) {
        fireworks[i].update(particles);
        fireworks[i].draw(ctx);

        if (fireworks[i].arrived) {
          fireworks.splice(i, 1);
        }
      }

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        particles[i].update();
        particles[i].draw(ctx);

        if (particles[i].alpha <= 0) {
          particles.splice(i, 1);
        }
      }

      animationId = window.requestAnimationFrame(animate);
    };

    const handleCanvasClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      launchAtPosition(x, y);
    };

    const handleTouchStart = (event: TouchEvent) => {
      event.preventDefault();
      const touch = event.touches[0];
      if (!touch) return;
      const rect = canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      launchAtPosition(x, y);
    };

    resize();
    animate();
    setFireworkCount(0);
    setShowClose(false);

    launchOpeningShow();

    scheduleTimeout(autoLaunch, prefersReducedMotion ? 1500 : 900);
    scheduleNextAutoLaunch();

    scheduleTimeout(() => {
      setShowClose(true);
    }, 1200);

    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('resize', resize);

    return () => {
      destroyed = true;
      window.cancelAnimationFrame(animationId);
      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId);
      }
      canvas.removeEventListener('click', handleCanvasClick);
      canvas.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('resize', resize);
    };
  }, [prefersReducedMotion]);

  return (
    <div className="cny-overlay" role="dialog" aria-label="新春烟花">
      <style>{cnyStyles}</style>

      <div className="cny-stars" aria-hidden="true">
        {stars.map((star) => (
          <span
            key={star.id}
            className="cny-star"
            style={
              {
                width: `${star.size}px`,
                height: `${star.size}px`,
                left: star.left,
                top: star.top,
                '--duration': `${star.duration}s`,
                '--min-opacity': `${star.minOpacity}`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <canvas ref={canvasRef} className="cny-canvas" />

      <Lantern />
      <Lantern right />

      <div className="cny-content" aria-hidden="true">
        <div className="cny-greeting">
          <h1 className="cny-title">新春快乐</h1>
          <p className="cny-subtitle">万事如意 阖家幸福</p>
        </div>

        <div className="cny-counter">
          <span>{fireworkCount}</span> 朵烟花绽放
        </div>

        <div className="cny-hint">点击屏幕任意位置发射烟花</div>
      </div>

      {showClose && (
        <Button
          variant="outline"
          size="sm"
          className="cny-close border-amber-200/60 bg-red-600/70 text-amber-50 shadow-lg shadow-red-900/30 backdrop-blur-sm hover:border-amber-100 hover:bg-red-500/90 hover:text-amber-50"
          onClick={onComplete}
        >
          <X className="w-4 h-4 mr-2" />
          关闭烟花
        </Button>
      )}
    </div>
  );
}
