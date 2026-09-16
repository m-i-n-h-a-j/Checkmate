const COLORS = ['#ffc94a', '#22f0ff', '#ff2e88', '#ece6ff'];

/** Pixel confetti from an element's center. Skipped when the player prefers reduced motion. */
export function burst(origin: Element | null | undefined, count = 28): void {
  if (!origin || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  const rect = origin.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  for (let i = 0; i < count; i++) {
    const bit = document.createElement('span');
    const size = 4 + Math.round(Math.random() * 5);
    Object.assign(bit.style, {
      position: 'fixed',
      left: `${x}px`,
      top: `${y}px`,
      width: `${size}px`,
      height: `${size}px`,
      background: COLORS[i % COLORS.length],
      boxShadow: `0 0 8px ${COLORS[i % COLORS.length]}`,
      pointerEvents: 'none',
      zIndex: '90',
    });
    document.body.append(bit);

    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const distance = 70 + Math.random() * 120;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const remove = () => bit.remove();
    bit
      .animate(
        [
          { transform: 'translate(-50%, -50%)', opacity: 1 },
          {
            transform: `translate(${dx}px, ${dy}px) rotate(${Math.random() * 360}deg)`,
            opacity: 1,
            offset: 0.7,
          },
          { transform: `translate(${dx}px, ${dy + 50}px)`, opacity: 0 },
        ],
        { duration: 800 + Math.random() * 500, easing: 'cubic-bezier(.15,.8,.25,1)' },
      )
      .finished.then(remove, remove);
  }
}
