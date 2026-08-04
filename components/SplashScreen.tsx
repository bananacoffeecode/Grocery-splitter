'use client';

import { useEffect, useState } from 'react';

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), 1650);
    const t2 = setTimeout(onDone, 2100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  return (
    <>
      <style>{`
        @keyframes gs-unroll {
          0%   { transform: scaleY(0); opacity: 0; }
          65%  { transform: scaleY(1.06); opacity: 1; }
          82%  { transform: scaleY(0.97); }
          100% { transform: scaleY(1);   opacity: 1; }
        }
        @keyframes gs-slide {
          from { opacity: 0; transform: translateX(-7px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes gs-check {
          0%   { transform: scale(0) rotate(-20deg); opacity: 0; }
          55%  { transform: scale(1.28) rotate(8deg); opacity: 1; }
          78%  { transform: scale(0.90) rotate(-4deg); }
          100% { transform: scale(1)   rotate(0deg); opacity: 1; }
        }
        @keyframes gs-fade-up {
          from { opacity: 0; transform: translateY(7px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '14px',
          backgroundColor: '#f2f1f7',
          transition: 'opacity 450ms ease',
          opacity: fading ? 0 : 1,
          zIndex: 50,
          pointerEvents: fading ? 'none' : 'auto',
        }}
      >
        {/* Receipt SVG — scales in from top like paper unrolling */}
        <svg
          width="112"
          height="158"
          viewBox="0 0 112 158"
          style={{
            display: 'block',
            transformOrigin: 'top center',
            animation: 'gs-unroll 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
            opacity: 0,
            overflow: 'visible',
          }}
        >
          <defs>
            <filter id="gs-shadow" x="-20%" y="-10%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="7" floodColor="#000" floodOpacity="0.09" />
            </filter>
          </defs>

          {/* Receipt body: rounded top, zigzag bottom */}
          <path
            d="
              M10,10 A10,10 0 0,1 20,0
              L92,0 A10,10 0 0,1 102,10
              L102,138
              L97,146 L92,138 L87,146 L82,138 L77,146
              L72,138 L67,146 L62,138 L57,146 L52,138
              L47,146 L42,138 L37,146 L32,138 L27,146
              L22,138 L17,146 L12,138 L10,138
              Z
            "
            fill="white"
            filter="url(#gs-shadow)"
          />

          {/* Store name placeholder lines */}
          <rect x="26" y="16" width="60" height="8"  rx="4"   fill="#f3f4f6" />
          <rect x="34" y="28" width="44" height="5"  rx="2.5" fill="#f9fafb" />

          {/* Separator */}
          <line x1="18" y1="41" x2="94" y2="41" stroke="#f3f4f6" strokeWidth="1" strokeDasharray="3 2" />

          {/* Item row 1 */}
          <g style={{ animation: 'gs-slide 0.26s ease forwards', animationDelay: '0.42s', opacity: 0 }}>
            <rect x="18" y="49" width="50" height="6" rx="3" fill="#f3f4f6" />
            <rect x="76" y="49" width="20" height="6" rx="3" fill="#e6e0ff" />
          </g>

          {/* Item row 2 */}
          <g style={{ animation: 'gs-slide 0.26s ease forwards', animationDelay: '0.59s', opacity: 0 }}>
            <rect x="18" y="63" width="42" height="6" rx="3" fill="#f3f4f6" />
            <rect x="76" y="63" width="20" height="6" rx="3" fill="#e6e0ff" />
          </g>

          {/* Item row 3 */}
          <g style={{ animation: 'gs-slide 0.26s ease forwards', animationDelay: '0.76s', opacity: 0 }}>
            <rect x="18" y="77" width="56" height="6" rx="3" fill="#f3f4f6" />
            <rect x="76" y="77" width="20" height="6" rx="3" fill="#e6e0ff" />
          </g>

          {/* Item row 4 */}
          <g style={{ animation: 'gs-slide 0.26s ease forwards', animationDelay: '0.93s', opacity: 0 }}>
            <rect x="18" y="91" width="34" height="6" rx="3" fill="#f3f4f6" />
            <rect x="76" y="91" width="20" height="6" rx="3" fill="#e6e0ff" />
          </g>

          {/* Total section */}
          <g style={{ animation: 'gs-slide 0.28s ease forwards', animationDelay: '1.08s', opacity: 0 }}>
            <line x1="18" y1="106" x2="96" y2="106" stroke="#e5e7eb" strokeWidth="1.5" />
            <rect x="18" y="114" width="26" height="8" rx="4" fill="#e5e7eb" />
            <rect x="62" y="114" width="30" height="8" rx="4" fill="#8b6cff" />
          </g>

          {/* Green checkmark — bounces in over the receipt center */}
          <g
            style={{
              transformOrigin: '56px 78px',
              animation: 'gs-check 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
              animationDelay: '1.22s',
              opacity: 0,
            }}
          >
            <circle cx="56" cy="78" r="24" fill="#8b6cff" />
            <polyline
              points="45,78 53,87 69,67"
              stroke="white"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </g>
        </svg>

        {/* App name */}
        <p
          style={{
            fontSize: '16px',
            fontWeight: 700,
            color: '#1c1b2e',
            letterSpacing: '-0.01em',
            margin: 0,
            animation: 'gs-fade-up 0.38s ease forwards',
            animationDelay: '0.28s',
            opacity: 0,
          }}
        >
          Tally
        </p>

        {/* Tagline */}
        <p
          style={{
            fontSize: '12px',
            color: '#9ca3af',
            margin: 0,
            animation: 'gs-fade-up 0.38s ease forwards',
            animationDelay: '0.46s',
            opacity: 0,
          }}
        >
          split bills, not friendships
        </p>
      </div>
    </>
  );
}
