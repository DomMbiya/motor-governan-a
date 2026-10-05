/** Emblema: um selo com doze marcas, como as bordas de um carimbo cartorial. */
export function Emblem({ className = "h-7 w-7" }: { className?: string }) {
  const ticks = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#0E5563" />
      {ticks.map((deg) => (
        <line key={deg} x1="16" y1="3.2" x2="16" y2="5.4" stroke="#A9CDD2" strokeWidth="1.2" strokeLinecap="round" transform={`rotate(${deg} 16 16)`} />
      ))}
      <circle cx="16" cy="16" r="8.2" fill="none" stroke="#fff" strokeWidth="1.4" />
      <path d="M12.4 16.3l2.4 2.4 4.9-5.2" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
