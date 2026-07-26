import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X } from '@/components/icons';
import {
  COLOR_PALETTES,
  Firework,
  Particle,
  createStars,
  random,
  randomFromArray,
  randomInt,
  type ScheduleTimeout,
  type Star,
} from './fireworks/engine';
import { Lantern } from './fireworks/Lantern';
import { cnyStyles } from './fireworks/styles';

interface FireworksOverlayProps {
  onComplete: () => void;
}

export default function FireworksOverlay({ onComplete }: FireworksOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stars, setStars] = useState<Star[]>([]);
  const [fireworkCount, setFireworkCount] = useState(0);
  const [showClose, setShowClose] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

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
      const launchGap = prefersReducedMotion ? random(220, 360) : random(70, 130);
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
