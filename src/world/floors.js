import * as THREE from 'three';

/**
 * A polished terrazzo floor with large tiles: light grey stone flecked with darker and lighter chips, thin grout lines, and a slightly
 * different tone on every tile. One texture covers 2 x 2 tiles of 1.5 m, so repeat it (size / 3) times across a floor.
 */
export function terrazzoTexture() {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  let seed = 4;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    const l = 196 + ((rnd() * 14) | 0), x0 = tx * S / 2, y0 = ty * S / 2;
    x.fillStyle = `rgb(${l},${l + 3},${l + 6})`; x.fillRect(x0, y0, S / 2, S / 2);
    for (let i = 0; i < 2600; i++) {
      const v = rnd(), px = x0 + rnd() * S / 2, py = y0 + rnd() * S / 2, r = 1 + rnd() * 3.2;
      x.fillStyle = v < 0.5 ? `rgba(120,126,134,${0.16 + rnd() * 0.3})` : v < 0.8 ? `rgba(245,247,250,${0.25 + rnd() * 0.4})` : `rgba(170,150,130,${0.12 + rnd() * 0.2})`;
      x.beginPath(); x.ellipse(px, py, r, r * (0.6 + rnd() * 0.5), rnd() * 3, 0, 6.3); x.fill();
    }
    const g = x.createLinearGradient(x0, y0, x0 + S / 2, y0 + S / 2); g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.07)'); x.fillStyle = g; x.fillRect(x0, y0, S / 2, S / 2);
  }
  x.fillStyle = 'rgba(70,76,84,0.55)';
  for (const p of [0, S / 2]) { x.fillRect(p - 2, 0, 4, S); x.fillRect(0, p - 2, S, 4); }
  x.fillRect(S - 4, 0, 4, S); x.fillRect(0, S - 4, S, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
