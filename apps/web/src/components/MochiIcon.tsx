import React from 'react';

interface MochiIconProps {
  size?: number;
  glow?: boolean;
}

export const MochiIcon: React.FC<MochiIconProps> = ({ size = 32, glow = true }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        filter: glow ? 'drop-shadow(0 0 8px rgba(99, 102, 241, 0.5))' : 'none'
      }}
    >
      {/* Outer Glow / Aura */}
      <ellipse cx="50" cy="52" rx="44" ry="34" fill="rgba(99, 102, 241, 0.18)" />

      {/* Mochi Body (Wider, Chubby Squishy Rice Cake Shape) */}
      <path
        d="M 10,50 C 10,24 28,18 50,18 C 72,18 90,24 90,50 C 90,74 72,82 50,82 C 28,82 10,74 10,50 Z"
        fill="url(#mochiGradient)"
        stroke="#475569"
        strokeWidth="3.5"
      />

      {/* Top Highlight Sheen */}
      <ellipse cx="32" cy="30" rx="12" ry="5" transform="rotate(-15 32 30)" fill="white" opacity="0.85" />

      {/* Rosy Cheeks (Warm Amber/Peach) */}
      <ellipse cx="24" cy="54" rx="8" ry="4.5" fill="#fb923c" opacity="0.6" />
      <ellipse cx="76" cy="54" rx="8" ry="4.5" fill="#fb923c" opacity="0.6" />

      {/* Happy Curved Eyes ( ^_^ ) */}
      <path d="M 30,44 Q 38,37 44,44" stroke="#0f172a" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M 56,44 Q 62,37 70,44" stroke="#0f172a" strokeWidth="3.5" strokeLinecap="round" />

      {/* Happy Smile */}
      <path d="M 45,56 Q 50,61 55,56" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" fill="none" />

      {/* Gradient Definitions */}
      <defs>
        <linearGradient id="mochiGradient" x1="50" y1="18" x2="50" y2="82" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#F1F5F9" />
        </linearGradient>
      </defs>
    </svg>
  );
};
