// ─── CONFIGURATION & HELPERS ───────────────────────────────
export const NS = 12;
export const MODELS = [
  "Toyota Camry", "Honda Civic", "Hyundai i20", "Maruti Swift",
  "Tata Nexon", "Mahindra XUV", "Kia Seltos", "VW Polo", "BMW 3 Series"
];

export const colors = [
  0x4499ff, 0xff8844, 0x44dd66, 0xdd55ff, 0xffdd00, 0xff3355,
  0x44eeee, 0xffa044, 0x66bbff, 0xff77bb, 0x88ee44, 0xee9944
];

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, m, M) => Math.max(m, Math.min(M, v));
export const ease = t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

export const slotPos = i => ({
  x: i < NS / 2 ? -4.0 : 4.0,
  z: (i % (NS / 2)) * 2.0 + 0.5
});

export const isLeftSide = i => i < NS / 2;

export const carRotation = (i, dir) => {
  if (dir === 'parked') return isLeftSide(i) ? Math.PI : 0;
  return 0;
};
