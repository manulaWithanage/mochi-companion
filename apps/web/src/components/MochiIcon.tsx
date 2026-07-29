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
        filter: glow ? 'drop-shadow(0 0 8px rgba(99, 102, 241, 0.5))' : 'none',
      }}
    >
      {/* Outer Glow / Aura */}
      <ellipse cx="50" cy="50" rx="42" ry="38" fill="rgba(99, 102, 241, 0.18)" />

      {/* Mochi Body (Perfectly Balanced Soft Rounded Dumpling Shape) */}
      <path
        d="M 15,50 C 15,22 30,16 50,16 C 70,16 85,22 85,50 C 85,76 70,84 50,84 C 30,84 15,76 15,50 Z"
        fill="url(#mochiGradient)"
        stroke="#475569"
        strokeWidth="3.5"
      />

      {/* Top Highlight Sheen */}
      <ellipse
        cx="34"
        cy="28"
        rx="10"
        ry="5"
        transform="rotate(-20 34 28)"
        fill="white"
        opacity="0.85"
      />

      {/* Rosy Cheeks (Warm Amber/Peach) */}
      <ellipse cx="27" cy="56" rx="7.5" ry="4.5" fill="#fb923c" opacity="0.6" />
      <ellipse cx="73" cy="56" rx="7.5" ry="4.5" fill="#fb923c" opacity="0.6" />

      {/* Happy Curved Eyes ( ^_^ ) */}
      <path d="M 32,46 Q 39,39 45,46" stroke="#0f172a" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M 55,46 Q 61,39 68,46" stroke="#0f172a" strokeWidth="3.5" strokeLinecap="round" />

      {/* Happy Smile */}
      <path
        d="M 45,58 Q 50,63 55,58"
        stroke="#0f172a"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />

      {/* Gradient Definitions */}
      <defs>
        <linearGradient
          id="mochiGradient"
          x1="50"
          y1="16"
          x2="50"
          y2="84"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#F1F5F9" />
        </linearGradient>
      </defs>
    </svg>
  );
};
