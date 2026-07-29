import React, { useEffect, useRef } from 'react';

interface LandingMascotCanvasProps {
  state: 'idle' | 'working' | 'resting' | 'coffee';
  size?: number;
  onMascotClick?: () => void;
}

export const LandingMascotCanvas: React.FC<LandingMascotCanvasProps> = ({
  state,
  size = 180,
  onMascotClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let tick = 0;

    const render = () => {
      tick++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Floating bobbing math
      const floatOffsetY = Math.sin(tick * 0.05) * (state === 'resting' ? 2 : 4);
      const squishX = Math.cos(tick * 0.05) * 0.02;

      ctx.save();
      ctx.translate(centerX, centerY + floatOffsetY);

      // 1. Ground Shadow (Soft & Subtle)
      ctx.beginPath();
      ctx.ellipse(0, 45, 40 + squishX * 10, 6, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.fill();

      // 2. Mochi Body Base (Soft rounded dumpling shape)
      ctx.beginPath();
      ctx.ellipse(0, 0, 46 + squishX * 10, 40, 0, 0, Math.PI * 2);

      // Mochi Gradient Fill (Soft warm white to subtle indigo cream)
      const bodyGrad = ctx.createLinearGradient(0, -40, 0, 40);
      bodyGrad.addColorStop(0, '#ffffff');
      bodyGrad.addColorStop(1, '#f1f5f9');
      ctx.fillStyle = bodyGrad;
      ctx.shadowColor = 'rgba(99, 102, 241, 0.2)';
      ctx.shadowBlur = 20;
      ctx.fill();

      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#475569';
      ctx.stroke();

      // 3. Top Highlight Sheen
      ctx.beginPath();
      ctx.ellipse(-14, -20, 10, 5, -Math.PI / 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fill();

      // 4. Soft Peach/Warm Amber Rosy Cheeks (NO PINK)
      ctx.fillStyle = '#fb923c';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.ellipse(-26, 6, 7.5, 4.5, 0, 0, Math.PI * 2); // Left cheek
      ctx.ellipse(26, 6, 7.5, 4.5, 0, 0, Math.PI * 2); // Right cheek
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // 5. State Specific Features
      if (state === 'resting') {
        // Closed Sleeping Eyes ^_^
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.arc(-16, 2, 7, Math.PI, 0); // Left closed eye
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(16, 2, 7, Math.PI, 0); // Right closed eye
        ctx.stroke();

        // Small smile
        ctx.beginPath();
        ctx.arc(0, 10, 4, 0, Math.PI);
        ctx.stroke();

        // Floating 'z Z' Sleeping Particle (Electric Purple)
        const zOffsetY = (tick % 60) * 0.4;
        const zAlpha = 1 - zOffsetY / 24;
        ctx.fillStyle = `rgba(168, 85, 247, ${zAlpha > 0 ? zAlpha : 0})`;
        ctx.font = 'bold 16px Outfit, sans-serif';
        ctx.fillText('z Z', 24, -24 - zOffsetY);
      } else if (state === 'working') {
        // CLEAN WORKING EYES (Determined & Cute ^_^)
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';

        // Cute determined eyes
        ctx.beginPath();
        ctx.arc(-16, -2, 6, 0.2, Math.PI - 0.2);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(16, -2, 6, 0.2, Math.PI - 0.2);
        ctx.stroke();

        // Cute smile
        ctx.beginPath();
        ctx.arc(0, 8, 4, 0, Math.PI);
        ctx.stroke();

        // SLEEK MINI LAPTOP & DESK UNDERNEATH (Clean & Cute)
        const tapOffsetY = Math.sin(tick * 0.2) * 2;

        // Desk surface
        ctx.fillStyle = '#334155';
        ctx.roundRect(-36, 26, 72, 6, 3);
        ctx.fill();

        // Laptop base
        ctx.fillStyle = '#64748b';
        ctx.roundRect(-24, 22, 48, 5, 2);
        ctx.fill();

        // Laptop Screen Lid (Glowing Blue Screen)
        ctx.fillStyle = '#0284c7';
        ctx.roundRect(-20, 8, 40, 14, 3);
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Code lines on laptop screen
        ctx.fillStyle = '#e0f2fe';
        ctx.fillRect(-16, 12, 14, 2);
        ctx.fillRect(-16, 16, 22, 2);

        // Cute little typing paws
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.arc(-10, 20 + tapOffsetY, 4.5, 0, Math.PI * 2);
        ctx.arc(10, 20 - tapOffsetY, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (state === 'coffee') {
        // Happy Savoring Eyes ( ^_^ )
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.arc(-16, -3, 6, Math.PI, 0); // Left closed happy eye
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(16, -3, 6, Math.PI, 0); // Right closed happy eye
        ctx.stroke();

        // Cute Contented Smile
        ctx.beginPath();
        ctx.arc(0, 7, 4.5, 0, Math.PI);
        ctx.stroke();

        // Cozy Ceramic Coffee Mug (Positioned neatly below mouth)
        ctx.fillStyle = '#4f46e5';
        ctx.roundRect(-11, 20, 22, 18, 5);
        ctx.fill();
        ctx.strokeStyle = '#312e81';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Mug Golden Rim Accent
        ctx.fillStyle = '#fbbf24';
        ctx.roundRect(-9, 18, 18, 4, 2);
        ctx.fill();

        // Mug Handle
        ctx.strokeStyle = '#4f46e5';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(13, 28, 5, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();

        // Cute Little Paws Holding Mug
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.arc(-12, 26, 4.5, 0, Math.PI * 2);
        ctx.arc(12, 26, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Animated Rising Steam Waves (♨️)
        const steam1Y = (tick * 0.8) % 30;
        const steam2Y = (tick * 0.8 + 15) % 30;
        const alpha1 = Math.max(0, 1 - steam1Y / 28);
        const alpha2 = Math.max(0, 1 - steam2Y / 28);

        ctx.lineWidth = 2;
        ctx.lineCap = 'round';

        // Steam wave 1
        ctx.strokeStyle = `rgba(99, 102, 241, ${alpha1 * 0.7})`;
        ctx.beginPath();
        ctx.moveTo(-4, 15 - steam1Y);
        ctx.bezierCurveTo(-7, 10 - steam1Y, -1, 5 - steam1Y, -4, 0 - steam1Y);
        ctx.stroke();

        // Steam wave 2
        ctx.strokeStyle = `rgba(99, 102, 241, ${alpha2 * 0.7})`;
        ctx.beginPath();
        ctx.moveTo(4, 15 - steam2Y);
        ctx.bezierCurveTo(7, 10 - steam2Y, 1, 5 - steam2Y, 4, 0 - steam2Y);
        ctx.stroke();
      } else {
        // Idle
        // Open Happy Eyes
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-16, 0, 4, 0, Math.PI * 2);
        ctx.arc(16, 0, 4, 0, Math.PI * 2);
        ctx.fill();

        // Eye shine highlights
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-14, -2, 1.5, 0, Math.PI * 2);
        ctx.arc(18, -2, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Happy mouth
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 6, 5, 0, Math.PI);
        ctx.stroke();
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationFrameId);
  }, [state]);

  return (
    <div
      onClick={onMascotClick}
      style={{
        cursor: 'pointer',
        display: 'inline-block',
        transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
        userSelect: 'none',
      }}
      onMouseDown={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'scale(0.9, 1.15)';
      }}
      onMouseUp={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
      }}
      title="Click Mochi to interact!"
    >
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        style={{ width: `${size}px`, height: `${size}px`, display: 'block' }}
      />
    </div>
  );
};
