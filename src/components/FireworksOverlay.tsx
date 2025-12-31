import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface FireworksOverlayProps {
  onComplete: () => void;
}

// Particle class for fireworks and text
class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  color: string;
  size: number;
  targetX?: number;
  targetY?: number;
  isTextParticle: boolean;
  done: boolean = false;

  constructor(
    x: number,
    y: number,
    color: string,
    isTextParticle: boolean = false,
    targetX?: number,
    targetY?: number,
  ) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.isTextParticle = isTextParticle;
    this.targetX = targetX;
    this.targetY = targetY;
    this.size = isTextParticle ? 2 : Math.random() * 3 + 1;
    this.alpha = 1;

    if (isTextParticle) {
      // Start from random position for text particles
      this.x = Math.random() * window.innerWidth;
      this.y = window.innerHeight + Math.random() * 100;
      const tx = this.targetX ?? 0;
      const ty = this.targetY ?? 0;
      const angle = Math.atan2(ty - this.y, tx - this.x);
      const speed = Math.random() * 5 + 10; // Fast initial speed
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
    } else {
      // Normal firework explosion
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 6 + 2;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
    }
  }

  update() {
    if (
      this.isTextParticle &&
      this.targetX !== undefined &&
      this.targetY !== undefined
    ) {
      // Ease towards target
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;

      this.x += dx * 0.08;
      this.y += dy * 0.08;

      // Add slight shimmer
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        this.x = this.targetX;
        this.y = this.targetY;
      }
    } else {
      // Physics for normal fireworks
      this.x += this.vx;
      this.y += this.vy;
      this.vy += 0.1; // Gravity
      this.vx *= 0.96; // Air resistance
      this.vy *= 0.96;
      this.alpha -= 0.015;

      if (this.alpha <= 0) this.done = true;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Rocket class
class Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  exploded: boolean = false;

  constructor(x: number, targetY: number) {
    this.x = x;
    this.y = window.innerHeight;
    this.color = `hsl(${Math.random() * 360}, 100%, 50%)`;

    // Calculate velocity to reach approximate height
    // v^2 = u^2 + 2as -> u = sqrt(-2as) roughly
    // simpler approximation
    const speed =
      Math.sqrt(2 * 0.15 * (window.innerHeight - targetY)) + Math.random();
    this.vy = -speed;
    this.vx = (Math.random() - 0.5) * 4;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.15; // Gravity

    if (this.vy >= 0) {
      this.exploded = true;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
    ctx.fill();

    // Trail
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 3, this.y - this.vy * 3);
    ctx.strokeStyle = this.color;
    ctx.stroke();
  }
}

const FireworksOverlay: React.FC<FireworksOverlayProps> = ({ onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showSkip, setShowSkip] = useState(false);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const rockets: Rocket[] = [];
    const particles: Particle[] = [];
    let frameCount = 0;
    let phase = 'fireworks'; // 'fireworks' | 'text' | 'fadeout'
    const textFormed = false;
    let fadeOutAlpha = 0;

    const createTextParticles = () => {
      // Create off-screen canvas to get text pixels
      const tmpCanvas = document.createElement('canvas');
      const tmpCtx = tmpCanvas.getContext('2d', { willReadFrequently: true });
      if (!tmpCtx) return;

      tmpCanvas.width = window.innerWidth;
      tmpCanvas.height = window.innerHeight;

      const text = '新年快乐 2026';
      const fontSize = Math.min(window.innerWidth / 10, 100);
      tmpCtx.font = `bold ${fontSize}px sans-serif`;
      tmpCtx.fillStyle = 'white';
      tmpCtx.textAlign = 'center';
      tmpCtx.textBaseline = 'middle';
      tmpCtx.fillText(text, tmpCanvas.width / 2, tmpCanvas.height / 2);

      const imageData = tmpCtx.getImageData(
        0,
        0,
        tmpCanvas.width,
        tmpCanvas.height,
      );
      const data = imageData.data;

      // Sample pixels
      const step = 4; // Check every 4th pixel for performance
      for (let y = 0; y < tmpCanvas.height; y += step) {
        for (let x = 0; x < tmpCanvas.width; x += step) {
          const index = (y * tmpCanvas.width + x) * 4;
          if (data[index + 3] > 128) {
            const color = `hsl(${Math.random() * 60 + 330}, 100%, 60%)`; // Gold/Red hues
            particles.push(new Particle(0, 0, color, true, x, y));
          }
        }
      }
    };

    const animate = () => {
      frameCount++;

      // Clear with trail effect
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      if (phase === 'fireworks') {
        // Random fireworks
        if (frameCount % 40 === 0) {
          rockets.push(
            new Rocket(
              Math.random() * canvas.width * 0.8 + canvas.width * 0.1,
              Math.random() * canvas.height * 0.5 + canvas.height * 0.1,
            ),
          );
        }

        // Transition to text phase after some time
        if (frameCount > 250) {
          phase = 'text';
          createTextParticles();
        }
      }

      // Update rockets
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.update();
        r.draw(ctx);
        if (r.exploded) {
          // Explode
          for (let j = 0; j < 50; j++) {
            particles.push(new Particle(r.x, r.y, r.color));
          }
          rockets.splice(i, 1);
        }
      }

      // Update particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        p.draw(ctx);
        if (!p.isTextParticle && p.done) {
          particles.splice(i, 1);
        }
      }

      if (phase === 'text' && !textFormed) {
        // Check if roughly formed to start timer/fadeout
        if (frameCount > 600) {
          phase = 'fadeout';
        }
      }

      if (phase === 'fadeout') {
        fadeOutAlpha += 0.02;
        if (fadeOutAlpha >= 1) {
          onComplete();
          return;
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    // Show skip button after a short delay
    setTimeout(() => setShowSkip(true), 2000);

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm">
      <canvas ref={canvasRef} className="block" />
      {showSkip && (
        <Button
          variant="outline"
          size="sm"
          className="absolute top-4 right-4 bg-white/10 text-white hover:bg-white/20 border-white/20 backdrop-blur-sm"
          onClick={onComplete}
        >
          <X className="w-4 h-4 mr-2" />
          跳过动画
        </Button>
      )}
    </div>
  );
};

export default FireworksOverlay;
