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
      <path fill="${color}" stroke="#082f49" stroke-width="1.7" stroke-linejoin="round"
        d="M32 4c-3 0-5 5-5 10v10L7 36c-3 2-4 6 0 6l20-5v12l-7 6v4l12-3 12 3v-4l-7-6V37l20 5c4 0 3-4 0-6L37 24V14c0-5-2-10-5-10Z" />
      <path d="M29 14q3-3 6 0v5h-6Z" fill="#082f49" />
      <path d="M31 24v24" stroke="#ffffff" stroke-opacity="0.65" stroke-width="2" stroke-linecap="round" />
    </svg>
  `.trim();
}
