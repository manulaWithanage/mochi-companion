import React, { useEffect, useRef } from 'react';

interface LandingMascotCanvasProps {
  state: 'idle' | 'working' | 'resting' | 'coffee';
  size?: number;
  onMascotClick?: () => void;
}

export const LandingMascotCanvas: React.FC<LandingMascotCanvasProps> = ({
  state,
  size = 180,
  onMascotClick
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

      // 1. Ground Shadow
      ctx.beginPath();
      ctx.ellipse(0, 45, 42 + squishX * 10, 8, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fill();

      // 2. Mochi Body Base (Squishy rounded rect/blob)
      ctx.beginPath();
      const radius = 46;
      ctx.roundRect(-radius - squishX * 10, -radius, (radius * 2) + squishX * 20, radius * 2, 28);
      
      // Mochi Gradient Fill (Soft white/pinkish mochi dough)
      const bodyGrad = ctx.createLinearGradient(0, -radius, 0, radius);
      bodyGrad.addColorStop(0, '#ffffff');
      bodyGrad.addColorStop(1, '#fce7f3');
      ctx.fillStyle = bodyGrad;
      ctx.shadowColor = 'rgba(236, 72, 153, 0.25)';
      ctx.shadowBlur = 20;
      ctx.fill();

      ctx.lineWidth = 3;
      ctx.strokeStyle = '#6b7280';
      ctx.stroke();

      // 3. Top Highlight Sheen
      ctx.beginPath();
      ctx.ellipse(-14, -20, 10, 5, -Math.PI / 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fill();

      // 4. Rosy Cheeks
      ctx.fillStyle = '#f472b6';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.ellipse(-26, 6, 8, 5, 0, 0, Math.PI * 2); // Left cheek
      ctx.ellipse(26, 6, 8, 5, 0, 0, Math.PI * 2);  // Right cheek
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // 5. State Specific Features (Eyes, Mouth, Accessories)
      if (state === 'resting') {
        // Closed Sleeping Eyes ^_^
        ctx.strokeStyle = '#4b5563';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        ctx.arc(-16, 2, 7, Math.PI, 0); // Left closed eye
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(16, 2, 7, Math.PI, 0);  // Right closed eye
        ctx.stroke();

        // Small smile
        ctx.beginPath();
        ctx.arc(0, 10, 4, 0, Math.PI);
        ctx.stroke();

        // Floating 'z Z' Sleeping Particle
        const zOffsetY = (tick % 60) * 0.4;
        const zAlpha = 1 - (zOffsetY / 24);
        ctx.fillStyle = `rgba(168, 85, 247, ${zAlpha > 0 ? zAlpha : 0})`;
        ctx.font = 'bold 16px Outfit, sans-serif';
        ctx.fillText('z Z', 24, -24 - zOffsetY);
      } 
      else if (state === 'working') {
        // Working Eyes (Focused) & Glasses 👓
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 3;

        // Glasses frames
        ctx.beginPath();
        ctx.arc(-16, 0, 10, 0, Math.PI * 2);
        ctx.arc(16, 0, 10, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fill();
        ctx.stroke();

        // Bridge
        ctx.beginPath();
        ctx.moveTo(-6, 0);
        ctx.lineTo(6, 0);
        ctx.stroke();

        // Mini Laptop underneath
        ctx.fillStyle = '#334155';
        ctx.fillRect(-28, 28, 56, 6);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(-24, 20, 48, 8); // Screen

        // Typing spark hands
        const handAnim = Math.sin(tick * 0.3) * 3;
        ctx.fillStyle = '#fce7f3';
        ctx.beginPath();
        ctx.arc(-12, 24 + handAnim, 5, 0, Math.PI * 2);
        ctx.arc(12, 24 - handAnim, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } 
      else if (state === 'coffee') {
        // Coffee sipping ^_^
        ctx.strokeStyle = '#4b5563';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(-14, 0, 6, Math.PI, 0);
        ctx.arc(14, 0, 6, Math.PI, 0);
        ctx.stroke();

        // Steamy Mug
        ctx.fillStyle = '#ec4899';
        ctx.fillRect(-8, 12, 16, 18);
        ctx.fillStyle = '#fbcfe8';
        ctx.fillRect(-6, 10, 12, 4);

        // Steam particle
        const steamY = (tick % 40) * 0.3;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 8 - steamY);
        ctx.lineTo(3, 2 - steamY);
        ctx.stroke();
      } 
      else { // Idle
        // Open Happy Eyes
        ctx.fillStyle = '#1e293b';
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
        ctx.strokeStyle = '#1e293b';
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
        userSelect: 'none'
      }}
      onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.9, 1.15)'; }}
      onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
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
