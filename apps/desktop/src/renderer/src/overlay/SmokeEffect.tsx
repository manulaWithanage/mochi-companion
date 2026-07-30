import { useEffect, useRef, type JSX } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  decay: number;
  color: string;
}

interface Sparkle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  spin: number;
  color: string;
}

interface SmokeEffectProps {
  active: boolean;
}

export function SmokeEffect({ active }: SmokeEffectProps): JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2 + 10;

    // Generate magician smoke clouds
    const particles: Particle[] = Array.from({ length: 18 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 1.8;
      return {
        x: centerX + (Math.random() - 0.5) * 20,
        y: centerY + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.5,
        radius: 8 + Math.random() * 12,
        maxRadius: 28 + Math.random() * 22,
        alpha: 0.75,
        decay: 0.015 + Math.random() * 0.015,
        color: Math.random() > 0.4 ? 'rgba(230, 215, 255,' : 'rgba(255, 235, 245,',
      };
    });

    // Generate magician sparkles ✨
    const sparkles: Sparkle[] = Array.from({ length: 14 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 2.5;
      return {
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.8,
        size: 3 + Math.random() * 5,
        alpha: 1,
        spin: (Math.random() - 0.5) * 0.2,
        color: Math.random() > 0.5 ? '#ffd700' : '#ff94e8',
      };
    });

    let animationId: number;
    const startTime = performance.now();

    const drawStar = (cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number, color: string, alpha: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      let rot = (Math.PI / 2) * 3;
      let x = cx;
      let y = cy;
      const step = Math.PI / spikes;

      ctx.moveTo(cx, cy - outerRadius);
      for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        ctx.lineTo(x, y);
        rot += step;

        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        ctx.lineTo(x, y);
        rot += step;
      }
      ctx.lineTo(cx, cy - outerRadius);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    };

    const render = (now: number) => {
      const elapsed = now - startTime;
      ctx.clearRect(0, 0, width, height);

      // Render magician smoke puff
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.radius = Math.min(p.maxRadius, p.radius + 0.8);
        p.alpha = Math.max(0, p.alpha - p.decay);

        if (p.alpha > 0) {
          const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
          gradient.addColorStop(0, `${p.color}${p.alpha})`);
          gradient.addColorStop(0.6, `${p.color}${p.alpha * 0.5})`);
          gradient.addColorStop(1, `${p.color}0)`);

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Render sparkles ✨
      for (const s of sparkles) {
        s.x += s.vx;
        s.y += s.vy;
        s.alpha = Math.max(0, s.alpha - 0.022);

        if (s.alpha > 0) {
          drawStar(s.x, s.y, 4, s.size, s.size / 2.5, s.color, s.alpha);
        }
      }

      if (elapsed < 1800) {
        animationId = requestAnimationFrame(render);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    };

    animationId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationId);
      if (ctx) ctx.clearRect(0, 0, width, height);
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      width={220}
      height={220}
      style={{
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 170,
        height: 170,
        pointerEvents: 'none',
        zIndex: 5,
      }}
    />
  );
}
