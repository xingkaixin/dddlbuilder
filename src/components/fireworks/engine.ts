export interface Star {
  id: number;
  left: string;
  top: string;
  size: number;
  duration: number;
  minOpacity: number;
}

type ParticleType = 'normal' | 'comet' | 'sparkle';

export type ScheduleTimeout = (callback: () => void, delay: number) => number;

export const COLOR_PALETTES: string[][] = [
  ['#ffd700', '#ff6b35', '#ff4444', '#ffaa00'],
  ['#00d4ff', '#7b68ee', '#da70d6', '#87ceeb'],
  ['#00ff88', '#32cd32', '#7fff00', '#adff2f'],
  ['#ff69b4', '#ffb6c1', '#ffffff', '#ffc0cb'],
  ['#ff8c00', '#ffa500', '#ffcc00', '#ff4500'],
  ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#8b00ff'],
];

export function random(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export function randomInt(min: number, max: number) {
  return Math.floor(random(min, max + 1));
}

export function randomFromArray<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function hexToRgba(hex: string, alpha: number) {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function createStars(width: number, height: number): Star[] {
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

export class Particle {
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

export class Firework {
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
