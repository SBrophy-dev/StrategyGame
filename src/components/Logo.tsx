/**
 * Logo — Enhanced heraldic shield emblem for "Realms of Iron".
 *
 * Inline SVG: An upgraded pointed medieval shield with ornate crown, 
 * detailed crossed swords behind, decorative elements, and the game title.
 * Designed for the title screen with improved visual impact.
 */
import type { CSSProperties } from 'react';

interface LogoProps {
  /** Render width in px. Height is auto. Default 320. */
  width?: number;
  /** Whether to show the title text below the emblem. Default true. */
  showTitle?: boolean;
  /** Optional className on the wrapper */
  className?: string;
  /** Optional inline style on the wrapper */
  style?: CSSProperties;
}

export default function Logo({ width = 320, showTitle = true, className, style }: LogoProps) {
  // The SVG is designed on a 300×360 viewBox.
  // The shield sits in the top portion, title text at the bottom.
  const height = showTitle ? (width * 360) / 300 : (width * 280) / 300;

  return (
    <div
      className={className}
      style={{ display: 'inline-block', lineHeight: 0, ...style }}
    >
      <svg
        viewBox="0 0 300 360"
        width={width}
        height={height}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Realms of Iron logo"
      >
         <defs>
           {/* Enhanced shield body gradient — richer steel blue with highlights */}
           <linearGradient id="shield-fill" x1="0" y1="0" x2="0" y2="1">
             <stop offset="0%" stopColor="#4a5a7b" />
             <stop offset="30%" stopColor="#2e3a52" />
             <stop offset="70%" stopColor="#182438" />
             <stop offset="100%" stopColor="#0a121e" />
           </linearGradient>

           {/* Enhanced shield highlight gradient with more complexity */}
           <linearGradient id="shield-highlight" x1="0" y1="0" x2="1" y2="1">
             <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
             <stop offset="30%" stopColor="rgba(255,255,255,0.08)" />
             <stop offset="70%" stopColor="rgba(255,255,255,0.02)" />
             <stop offset="100%" stopColor="rgba(255,255,255,0)" />
           </linearGradient>
           
           {/* Shield outer rim gradient */}
           <linearGradient id="shield-rim" x1="0" y1="0" x2="0" y2="1">
             <stop offset="0%" stopColor="#8a7040" />
             <stop offset="50%" stopColor="#6a5030" />
             <stop offset="100%" stopColor="#4a3020" />
           </linearGradient>

           {/* Enhanced Crown / gold gradient with more brilliance */}
           <linearGradient id="gold-fill" x1="0" y1="0" x2="0" y2="1">
             <stop offset="0%" stopColor="#fff8b2"/>
             <stop offset="30%" stopColor="#ffe07a"/>
             <stop offset="50%" stopColor="#ffc845"/>
             <stop offset="70%" stopColor="#e8a820"/>
             <stop offset="100%" stopColor="#d4982a"/>
           </linearGradient>

           {/* Enhanced Sword steel gradient with better contrast */}
           <linearGradient id="sword-fill" x1="0" y1="0" x2="1" y2="1">
             <stop offset="0%" stopColor="#e0e8f0"/>
             <stop offset="30%" stopColor="#c0c8d8"/>
             <stop offset="70%" stopColor="#8a94a8"/>
             <stop offset="100%" stopColor="#6a7488"/>
           </linearGradient>
           
           {/* Sword highlight gradient */}
           <linearGradient id="sword-highlight" x1="0" y1="0" x2="1" y2="1">
             <stop offset="0%" stopColor="rgba(255,255,255,0.1)"/>
             <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
           </linearGradient>
           
           {/* Outer glow filter - more pronounced */}
           <filter id="logo-glow" x="-25%" y="-25%" width="150%" height="150%">
             <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
             <feColorMatrix
               in="blur"
               type="matrix"
               values="0 0 0 0 0.4  0 0 0 0 0.6  0 0 0 0 0.9  0 0 0 0.5 0"
               result="glow"
             />
             <feMerge>
               <feMergeNode in="glow" />
               <feMergeNode in="SourceGraphic" />
             </feMerge>
           </filter>
           
           {/* Inner shadow for depth */}
           <filter id="logo-inner-shadow" x="-20%" y="-20%" width="140%" height="140%">
             <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.3" />
           </filter>
           
           {/* Additional decorative elements */}
           <filter id="logo-shine" x="-50%" y="-50%" width="200%" height="200%">
             <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
             <feColorMatrix in="blur" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 2 0" result="whiteblur" />
             <feComponentTransfer>
               <feFuncA type="linear" slope="0" intercept="0.15" />
             </feComponentTransfer>
           </filter>
         </defs>

        {/* ════════ CROSSED SWORDS (behind shield) ════════ */}
        <g opacity="0.7">
          {/* Left sword — hilt up-left, blade down-right */}
          <g transform="translate(150, 140) rotate(-40)">
            <rect x="-2" y="-50" width="4" height="80" rx="1" fill="url(#sword-fill)" />
            {/* Crossguard */}
            <rect x="-10" y="-52" width="20" height="4" rx="1" fill="#a0a8b8" />
            {/* Pommel */}
            <circle cx="0" cy="-54" r="3" fill="#a0a8b8" />
          </g>
          {/* Right sword — hilt up-right, blade down-left */}
          <g transform="translate(150, 140) rotate(40)">
            <rect x="-2" y="-50" width="4" height="80" rx="1" fill="url(#sword-fill)" />
            <rect x="-10" y="-52" width="20" height="4" rx="1" fill="#a0a8b8" />
            <circle cx="0" cy="-54" r="3" fill="#a0a8b8" />
          </g>
        </g>

        {/* ════════ SHIELD BODY ════════ */}
        {/* Shield shape: pointed bottom, flat top with curves */}
        <g filter="url(#logo-glow)">
          {/* Shield border / rim */}
          <path
            d={`
              M 60 40
              Q 60 28, 72 26
              L 228 26
              Q 240 28, 240 40
              L 240 180
              Q 240 220, 190 260
              Q 170 276, 150 284
              Q 130 276, 110 260
              Q 60 220, 60 180
              Z
            `}
            fill="#c8a040"
            stroke="#a88030"
            strokeWidth="1"
          />
          {/* Shield main fill */}
          <path
            d={`
              M 66 42
              Q 66 32, 76 30
              L 224 30
              Q 234 32, 234 42
              L 234 178
              Q 234 216, 186 254
              Q 168 270, 150 278
              Q 132 270, 114 254
              Q 66 216, 66 178
              Z
            `}
            fill="url(#shield-fill)"
          />
          {/* Shield inner highlight */}
          <path
            d={`
              M 66 42
              Q 66 32, 76 30
              L 224 30
              Q 234 32, 234 42
              L 234 178
              Q 234 216, 186 254
              Q 168 270, 150 278
              Q 132 270, 114 254
              Q 66 216, 66 178
              Z
            `}
            fill="url(#shield-highlight)"
          />

          {/* Vertical center stripe */}
          <rect x="146" y="34" width="8" height="240" rx="2" fill="rgba(255,200,69,0.15)" />
          {/* Horizontal divider */}
          <rect x="70" y="150" width="160" height="4" rx="1" fill="rgba(255,200,69,0.12)" />

          {/* Small gem/nub at center cross */}
          <circle cx="150" cy="152" r="5" fill="#ffc845" opacity="0.6" />
          <circle cx="150" cy="152" r="3" fill="#ffe07a" opacity="0.8" />
        </g>

        {/* ════════ CROWN (atop shield) ════════ */}
        <g transform="translate(150, 50)" filter="url(#logo-glow)">
          <g transform="translate(-18, -14) scale(1.5)">
            {/* Crown body */}
            <path
              d={`
                M 11.56 3.27 a .5 .5 0 0 1 .88 0
                L 15.39 8.87 a 1 1 0 0 0 1.52 .29
                L 21.18 5.5 a .5 .5 0 0 1 .80 .52
                l -2.83 10.25 a 1 1 0 0 1 -.96 .73
                H 5.81 a 1 1 0 0 1 -.96 -.73
                L 2.02 6.02 a .5 .5 0 0 1 .80 -.52
                l 4.28 3.66 a 1 1 0 0 0 1.52 -.29
                z
              `}
              fill="url(#gold-fill)"
              stroke="#c89820"
              strokeWidth="0.5"
            />
            {/* Crown base line */}
            <line x1="5" y1="21" x2="19" y2="21" stroke="#c89820" strokeWidth="1" />
            {/* Gems on crown points */}
            <circle cx="8" cy="11" r="1.2" fill="#e84055" />
            <circle cx="12" cy="7" r="1.4" fill="#3d7fd4" />
            <circle cx="16" cy="11" r="1.2" fill="#38b854" />
          </g>
        </g>

        {/* ════════ TITLE TEXT ════════ */}
        {showTitle && (
          <g>
            {/* "REALMS" */}
            <text
              x="150"
              y="310"
              textAnchor="middle"
              fontFamily="'Segoe UI', system-ui, sans-serif"
              fontSize="34"
              fontWeight="800"
              letterSpacing="10"
              fill="#f4f5f8"
            >
              REALMS
            </text>
            {/* Decorative line */}
            <line x1="70" y1="320" x2="230" y2="320" stroke="#ffc845" strokeWidth="1" opacity="0.4" />
            {/* "OF IRON" */}
            <text
              x="150"
              y="346"
              textAnchor="middle"
              fontFamily="'Segoe UI', system-ui, sans-serif"
              fontSize="18"
              fontWeight="500"
              letterSpacing="14"
              fill="#8a90a4"
            >
              OF IRON
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
