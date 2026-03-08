function getColor(altitudeFeet: number): string {
  if (altitudeFeet < 10000) {
    return '#22c55e';
  }
  if (altitudeFeet < 30000) {
    return '#facc15';
  }
  return '#22d3ee';
}

export function getAircraftSvg(altitudeFeet: number, selected = false): string {
  const color = selected ? '#ffffff' : getColor(altitudeFeet);
  const glow = selected
    ? '<circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="4" />'
    : '';

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      ${glow}
      <path
        fill="${color}"
        d="M34.8 4.7c0-1.2-1-2.2-2.2-2.2s-2.2 1-2.2 2.2v13.9l-12 7.4-8.7-2.3c-1.1-.3-2.2.3-2.6 1.3s.1 2.2 1.1 2.8l8.8 5.3v8.6l-7.1 4.8c-.9.6-1.2 1.8-.7 2.8.5 1 1.6 1.4 2.7 1l5.1-2v8.8c0 2.6 2.1 4.7 4.7 4.7h5V42.5l4.4-1.5 4.4 1.5V62h5c2.6 0 4.7-2.1 4.7-4.7v-8.8l5.1 2c1 .4 2.2 0 2.7-1 .5-1 .2-2.2-.7-2.8L48.5 42v-8.6l8.8-5.3c1-.6 1.4-1.8 1.1-2.8-.4-1.1-1.5-1.6-2.6-1.3l-8.7 2.3-12-7.4V4.7Z"
      />
    </svg>
  `.trim();
}
