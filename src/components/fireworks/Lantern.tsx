export function Lantern({ right = false }: { right?: boolean }) {
  return (
    <div
      className={`cny-lantern ${right ? 'cny-lantern-right' : 'cny-lantern-left'}`}
    >
      <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
        <line x1="50" y1="0" x2="50" y2="15" stroke="#FFD700" strokeWidth="2" />
        <rect x="35" y="15" width="30" height="6" rx="2" fill="#FFD700" />
        <ellipse cx="50" cy="45" rx="35" ry="28" fill="#D32F2F" />
        <path d="M50 17 V 73" stroke="#B71C1C" strokeWidth="1" fill="none" />
        <path
          d="M35 19 Q 25 45 35 71"
          stroke="#B71C1C"
          strokeWidth="1"
          fill="none"
        />
        <path
          d="M65 19 Q 75 45 65 71"
          stroke="#B71C1C"
          strokeWidth="1"
          fill="none"
        />
        <rect x="35" y="70" width="30" height="6" rx="2" fill="#FFD700" />
        <path d="M50 76 V 85" stroke="#D32F2F" strokeWidth="3" />
        <path
          d="M50 85 Q 45 95 40 98"
          stroke="#D32F2F"
          strokeWidth="2"
          fill="none"
        />
        <path
          d="M50 85 Q 55 95 60 98"
          stroke="#D32F2F"
          strokeWidth="2"
          fill="none"
        />
        <path d="M50 85 V 100" stroke="#D32F2F" strokeWidth="2" fill="none" />
        <circle cx="50" cy="45" r="8" fill="#FFD700" opacity="0.8" />
        <text
          x="50"
          y="49"
          fontSize="10"
          textAnchor="middle"
          fill="#D32F2F"
          fontFamily="serif"
          fontWeight="700"
        >
          福
        </text>
      </svg>
    </div>
  );
}
