// Original decorative instant-camera illustration for the default Booth welcome.
// Bundled artwork only: not Event Media, a Guest photo or a printer depiction.
export function WelcomeIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 320 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M36 170c-14-62 34-120 104-128 74-9 146 26 150 100 4 70-52 118-128 120-62 2-114-34-126-92Z"
        fill="#FFE1C9"
        opacity="0.7"
      />
      <ellipse cx="160" cy="262" rx="108" ry="12" fill="#E5D5C8" opacity="0.8" />
      <g stroke="#F7AD65" strokeWidth="7" strokeLinecap="round">
        <path d="M244 42l-6 20" />
        <path d="M270 58l-15 15" />
        <path d="M282 88l-20 6" />
      </g>
      <rect x="62" y="78" width="196" height="156" rx="30" fill="#FFF8EF" />
      <path d="M62 170h196v34c0 16.6-13.4 30-30 30H92c-16.6 0-30-13.4-30-30v-34Z" fill="#F7AD65" />
      <path d="M62 170h196v14H62z" fill="#E89552" opacity="0.6" />
      <rect x="62" y="78" width="196" height="156" rx="30" stroke="#E5D5C8" strokeWidth="3" />
      <rect x="82" y="96" width="30" height="26" rx="7" fill="#E5D5C8" />
      <rect x="206" y="96" width="32" height="28" rx="8" fill="#30251F" />
      <rect x="212" y="102" width="20" height="16" rx="4" fill="#746054" />
      <circle cx="160" cy="140" r="48" fill="#E5D5C8" />
      <circle cx="160" cy="140" r="40" fill="#594033" />
      <circle cx="160" cy="140" r="28" fill="#30251F" />
      <circle cx="160" cy="140" r="16" fill="#211C19" />
      <circle cx="150" cy="130" r="7" fill="#FFF8EF" opacity="0.75" />
      <circle cx="96" cy="152" r="11" fill="#B84A22" />
      <rect x="96" y="208" width="128" height="10" rx="5" fill="#30251F" />
      <g transform="rotate(4 160 248)">
        <rect x="112" y="212" width="96" height="68" rx="4" fill="#FFFFFF" />
        <rect x="120" y="218" width="80" height="44" rx="2" fill="#FFF1E5" />
        <rect x="112" y="212" width="96" height="68" rx="4" stroke="#E5D5C8" strokeWidth="2" />
      </g>
    </svg>
  );
}
