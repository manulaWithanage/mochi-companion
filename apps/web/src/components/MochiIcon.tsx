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
      <circle cx="50" cy="52" r="42" fill="rgba(99, 102, 241, 0.15)" />

      {/* Mochi Body (Squishy rounded shape - NO STICK!) */}
      <path
        d="M 18,50 C 18,25 32,15 50,15 C 68,15 82,25 82,50 C 82,75 68,85 50,85 C 32,85 18,75 18,50 Z"
        fill="url(#mochiGradient)"
        stroke="#475569"
        strokeWidth="3.5"
      />

      {/* Top Highlight Sheen */}
      <ellipse cx="36" cy="30" rx="10" ry="5" transform="rotate(-25 36 30)" fill="white" opacity="0.85" />

      {/* Rosy Cheeks (Warm Amber/Peach - No Pink) */}
      <ellipse cx="30" cy="56" rx="7" ry="4" fill="#fb923c" opacity="0.55" />
      <ellipse cx="70" cy="56" rx="7" ry="4" fill="#fb923c" opacity="0.55" />

      {/* Happy Curved Eyes (^_^ ) */}
      <path d="M 34,46 Q 40,40 46,46" stroke="#0f172a" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M 54,46 Q 60,40 66,46" stroke="#0f172a" strokeWidth="3.5" strokeLinecap="round" />

      {/* Happy Smile */}
      <path d="M 45,58 Q 50,63 55,58" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" fill="none" />

      {/* Gradient Definitions */}
      <defs>
        <linearGradient id="mochiGradient" x1="50" y1="15" x2="50" y2="85" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#F1F5F9" />
        </linearGradient>
      </defs>
    </svg>
  );
};
