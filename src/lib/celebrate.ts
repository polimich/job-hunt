/** Small celebrations for good news in the pipeline. Skipped when the system asks for reduced motion. */
import confetti from 'canvas-confetti';
import type { Status } from '../../shared/types';

const COLORS = ['#f06a4a', '#f6d365', '#7fb7f0', '#b79cf0', '#6fd3a8', '#f7a982'];

export function celebrate(status: Status): void {
  const base = { colors: COLORS, disableForReducedMotion: true, zIndex: 100, ticks: 220 };
  if (status === 'interview') {
    void confetti({ ...base, particleCount: 50, spread: 60, startVelocity: 32, origin: { y: 0.7 }, scalar: 0.8 });
  } else if (status === 'offer') {
    void confetti({ ...base, particleCount: 120, spread: 90, origin: { y: 0.65 } });
  } else if (status === 'accepted') {
    const side = (x: number, angle: number) => confetti({ ...base, particleCount: 90, angle, spread: 70, startVelocity: 55, origin: { x, y: 0.75 } });
    void side(0, 60);
    void side(1, 120);
    setTimeout(() => void confetti({ ...base, particleCount: 160, spread: 120, origin: { y: 0.55 }, scalar: 1.1 }), 300);
  }
}
