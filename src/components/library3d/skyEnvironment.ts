import * as THREE from 'three';
import type { AppTheme } from '@/hooks/useTheme';
import type { WorldBiomeVisualPalette } from './worldPalettes';

export interface ProceduralSkyEnvironment {
  texture: THREE.Texture;
  intensity: number;
  dispose: () => void;
}

/**
 * Synthesizes a zero-CDN equirectangular sky-sun-ground IBL environment map via
 * `THREE.PMREMGenerator` so wet cobblestones, European windows, metal trims,
 * and anime avatars catch natural sky/sun reflections without external HDRI files (`D-010`).
 */
export function createProceduralSkyEnvironment(
  gl: THREE.WebGLRenderer,
  palette: WorldBiomeVisualPalette,
  theme: AppTheme,
): ProceduralSkyEnvironment | null {
  if (typeof document === 'undefined') return null;

  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Sky zenith -> bright horizon -> soft ground bounce gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, palette.skyTop);
  grad.addColorStop(0.42, palette.skyHorizon);
  grad.addColorStop(0.52, theme === 'light' ? '#fff4dc' : palette.skyHorizon);
  grad.addColorStop(0.62, palette.hemiGround);
  grad.addColorStop(1.0, palette.skyBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Project directional sun/moon onto equirectangular coordinates for crisp specular highlights
  const [sx, sy, sz] = palette.sunPosition;
  const len = Math.hypot(sx, sy, sz) || 1;
  const nx = sx / len;
  const ny = sy / len;
  const nz = sz / len;
  const theta = Math.atan2(nx, nz); // [-PI, PI]
  const phi = Math.acos(Math.max(-1, Math.min(1, ny))); // [0, PI]
  const sunU = (theta / (Math.PI * 2) + 0.5) * w;
  const sunV = (phi / Math.PI) * h;

  const glowRadius = theme === 'midnight' ? 18 : 34;
  const sunGlow = ctx.createRadialGradient(sunU, sunV, 2, sunU, sunV, glowRadius);
  sunGlow.addColorStop(0, '#ffffff');
  sunGlow.addColorStop(0.35, palette.sunColor);
  sunGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sunGlow;
  ctx.fillRect(sunU - glowRadius, sunV - glowRadius, glowRadius * 2, glowRadius * 2);

  // Warm secondary street-lamp horizon bounce for Dusk / Night mood
  if (theme !== 'light') {
    const bounce = ctx.createLinearGradient(0, h * 0.45, 0, h * 0.72);
    bounce.addColorStop(0, 'rgba(255, 196, 110, 0)');
    bounce.addColorStop(0.5, theme === 'dim' ? 'rgba(255, 184, 110, 0.28)' : 'rgba(255, 198, 120, 0.2)');
    bounce.addColorStop(1, 'rgba(255, 196, 110, 0)');
    ctx.fillStyle = bounce;
    ctx.fillRect(0, h * 0.45, w, h * 0.27);
  }

  const equirect = new THREE.CanvasTexture(canvas);
  equirect.mapping = THREE.EquirectangularReflectionMapping;
  equirect.colorSpace = THREE.SRGBColorSpace;
  equirect.needsUpdate = true;

  const pmrem = new THREE.PMREMGenerator(gl);
  pmrem.compileEquirectangularShader();
  const renderTarget = pmrem.fromEquirectangular(equirect);
  equirect.dispose();
  pmrem.dispose();

  const intensity = theme === 'light' ? 0.88 : theme === 'dim' ? 0.65 : 0.42;
  return {
    texture: renderTarget.texture,
    intensity,
    dispose() {
      renderTarget.dispose();
    },
  };
}
