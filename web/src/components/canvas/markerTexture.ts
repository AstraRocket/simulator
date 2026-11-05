import { must } from '../../services/app/must';
import * as THREE from 'three';

export function markerTexture(color: string, light: string): THREE.CanvasTexture {
  const s = 128;
  const cvs = document.createElement('canvas');
  cvs.width = s;
  cvs.height = s;
  const ctx = must(cvs.getContext('2d'), 'canvas 2D context');
  const cx = s / 2,
    cy = s / 2,
    r = s / 2 - 6;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = light;
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, (i * Math.PI) / 2, (i * Math.PI) / 2 + Math.PI / 2);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? color : light;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = color;
  ctx.stroke();
  const tex = new THREE.CanvasTexture(cvs);
  tex.anisotropy = 4;
  return tex;
}
