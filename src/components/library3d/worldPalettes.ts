import type { AppTheme } from '@/hooks/useTheme';
import type { BiomeId } from './worldTypes';

export interface WorldBiomeVisualPalette {
  skyTop: string;
  skyHorizon: string;
  skyBottom: string;
  showStars: boolean;
  starDensity: number;
  sunColor: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  sunIntensity: number;
  sunPosition: [number, number, number];
  fillColor: string;
  fillIntensity: number;
  groundTint: string;
  plazaTint: string;
  accentStone: string;
  foliagePrimary: string;
  foliageSecondary: string;
  waterColor: string;
  portalGlow: string;
  lampGlow: string;
  lampEmissiveIntensity: number;
  particleColor: string;
}

export function getWorldBiomePalette(
  biomeId: BiomeId,
  theme: AppTheme,
  variant = 0,
): WorldBiomeVisualPalette {
  const isNight = theme === 'midnight';
  const isDusk = theme === 'dim';
  const autumnShift = variant % 2 === 1;

  if (biomeId === 'sakura_shrine') {
    if (isNight) {
      return {
        skyTop: '#080c1c', skyHorizon: '#1c2447', skyBottom: '#11162b',
        showStars: true, starDensity: 260, sunColor: '#dbeafe',
        fogColor: '#141a33', fogNear: 24, fogFar: 64,
        hemiSky: '#8fa8e6', hemiGround: '#241c30', hemiIntensity: 0.72,
        sunIntensity: 0.85, sunPosition: [14, 22, 12], fillColor: '#f472b6', fillIntensity: 0.35,
        groundTint: '#32483b', plazaTint: '#6c6a7a', accentStone: '#4b4d63',
        foliagePrimary: '#f48fb1', foliageSecondary: '#ce93d8',
        waterColor: '#1e3a5f', portalGlow: '#f472b6', lampGlow: '#ffd180', lampEmissiveIntensity: 1.7,
        particleColor: '#fbcfe8',
      };
    }
    if (isDusk) {
      return {
        skyTop: '#31255a', skyHorizon: '#e0896b', skyBottom: '#59334d',
        showStars: false, starDensity: 0, sunColor: '#ffd29d',
        fogColor: '#8d5d6b', fogNear: 26, fogFar: 68,
        hemiSky: '#f7b29c', hemiGround: '#4a353b', hemiIntensity: 0.92,
        sunIntensity: 1.25, sunPosition: [-16, 15, -12], fillColor: '#9ab6e8', fillIntensity: 0.45,
        groundTint: autumnShift ? '#8c7244' : '#5e7f52', plazaTint: '#b3a39a', accentStone: '#7d6e73',
        foliagePrimary: autumnShift ? '#e67e45' : '#f48fb1', foliageSecondary: '#fbcfe8',
        waterColor: '#527996', portalGlow: '#fb7185', lampGlow: '#ffb74d', lampEmissiveIntensity: 1.45,
        particleColor: autumnShift ? '#fdba74' : '#fbcfe8',
      };
    }
    return {
      skyTop: '#5ca9e6', skyHorizon: '#d9eefc', skyBottom: '#b8d9c8',
      showStars: false, starDensity: 0, sunColor: '#fff6d6',
      fogColor: '#d7eaf7', fogNear: 30, fogFar: 78,
      hemiSky: '#eef7ff', hemiGround: '#789267', hemiIntensity: 1.15,
      sunIntensity: 1.55, sunPosition: [16, 26, 14], fillColor: '#ffd6e7', fillIntensity: 0.42,
      groundTint: autumnShift ? '#9ca658' : '#7fb069', plazaTint: '#d8d0c3', accentStone: '#99928c',
      foliagePrimary: autumnShift ? '#f59e0b' : '#f9a8d4', foliageSecondary: '#fce7f3',
      waterColor: '#5db3d6', portalGlow: '#f472b6', lampGlow: '#ffe5a8', lampEmissiveIntensity: 0.5,
      particleColor: autumnShift ? '#fbbf24' : '#fbcfe8',
    };
  }

  if (biomeId === 'starfield_atrium') {
    if (isNight) {
      return {
        skyTop: '#060914', skyHorizon: '#16203a', skyBottom: '#0d1324',
        showStars: true, starDensity: 240, sunColor: '#cfe2ff',
        fogColor: '#11182c', fogNear: 24, fogFar: 62,
        hemiSky: '#7e9ed8', hemiGround: '#2e2620', hemiIntensity: 0.78,
        sunIntensity: 0.9, sunPosition: [10, 26, 10], fillColor: '#fbbf24', fillIntensity: 0.48,
        groundTint: '#786e66', plazaTint: '#8a8278', accentStone: '#4b556b',
        foliagePrimary: '#38bdf8', foliageSecondary: '#93c5fd',
        waterColor: '#1e3a5f', portalGlow: '#60a5fa', lampGlow: '#ffd580', lampEmissiveIntensity: 1.65,
        particleColor: '#fde68a',
      };
    }
    if (isDusk) {
      return {
        skyTop: '#263357', skyHorizon: '#d99a6c', skyBottom: '#3e3545',
        showStars: false, starDensity: 0, sunColor: '#ffe0a8',
        fogColor: '#6f5c63', fogNear: 26, fogFar: 66,
        hemiSky: '#f5cfa0', hemiGround: '#59483b', hemiIntensity: 0.96,
        sunIntensity: 1.35, sunPosition: [-14, 22, 10], fillColor: '#90b4e8', fillIntensity: 0.5,
        groundTint: '#c2b3a1', plazaTint: '#cfc2b0', accentStone: '#8c837c',
        foliagePrimary: '#f59e0b', foliageSecondary: '#fde68a',
        waterColor: '#4c7a9c', portalGlow: '#fbbf24', lampGlow: '#ffc46b', lampEmissiveIntensity: 1.3,
        particleColor: '#fef08a',
      };
    }
    return {
      skyTop: '#64a8df', skyHorizon: '#f2f0e6', skyBottom: '#dfd5c5',
      showStars: false, starDensity: 0, sunColor: '#fff9e6',
      fogColor: '#ede8dc', fogNear: 30, fogFar: 76,
      hemiSky: '#ffffff', hemiGround: '#b59d7d', hemiIntensity: 1.25,
      sunIntensity: 1.55, sunPosition: [12, 28, 12], fillColor: '#dbeafe', fillIntensity: 0.52,
      groundTint: '#e5ddd0', plazaTint: '#efe8db', accentStone: '#b6afa4',
      foliagePrimary: '#60a5fa', foliageSecondary: '#bfdbfe',
      waterColor: '#7dd3fc', portalGlow: '#38bdf8', lampGlow: '#ffebb3', lampEmissiveIntensity: 0.55,
      particleColor: '#fef3c7',
    };
  }

  if (biomeId === 'starlight_ruins') {
    const nightBoost = isNight ? 1.0 : isDusk ? 0.9 : 0.78;
    return {
      skyTop: isNight ? '#04050e' : isDusk ? '#121533' : '#1e2c59',
      skyHorizon: isNight ? '#1b1d45' : isDusk ? '#3c2e6b' : '#56649c',
      skyBottom: '#0b0e21',
      showStars: true,
      starDensity: isNight ? 360 : 220,
      sunColor: '#e0e7ff',
      fogColor: isNight ? '#10132b' : isDusk ? '#201f44' : '#354070',
      fogNear: 24,
      fogFar: 68,
      hemiSky: '#a5b4fc',
      hemiGround: '#241f3d',
      hemiIntensity: 0.78 * nightBoost + 0.22,
      sunIntensity: isNight ? 0.95 : 1.25,
      sunPosition: [12, 24, 14],
      fillColor: '#c084fc',
      fillIntensity: 0.55,
      groundTint: isNight ? '#444b6e' : '#636d91',
      plazaTint: isNight ? '#586085' : '#7c85ab',
      accentStone: '#4b5170',
      foliagePrimary: '#a78bfa',
      foliageSecondary: '#38bdf8',
      waterColor: '#162044',
      portalGlow: '#a855f7',
      lampGlow: '#7dd3fc',
      lampEmissiveIntensity: isNight ? 1.85 : 1.35,
      particleColor: '#93c5fd',
    };
  }

  // Default: `town_of_beginnings`
  if (isNight) {
    return {
      skyTop: '#070b18', skyHorizon: '#16223b', skyBottom: '#0e1320',
      showStars: true, starDensity: 250, sunColor: '#dbeafe',
      fogColor: '#12192b', fogNear: 24, fogFar: 64,
      hemiSky: '#7d9ed6', hemiGround: '#29221c', hemiIntensity: 0.72,
      sunIntensity: 0.85, sunPosition: [12, 22, 14], fillColor: '#ffb74d', fillIntensity: 0.42,
      groundTint: '#364d36', plazaTint: '#6c6862', accentStone: '#525663',
      foliagePrimary: autumnShift ? '#b45309' : '#2d5a3c', foliageSecondary: '#3f734e',
      waterColor: '#1e3a5f', portalGlow: '#38bdf8', lampGlow: '#ffca7a', lampEmissiveIntensity: 1.75,
      particleColor: '#fde68a',
    };
  }
  if (isDusk) {
    return {
      skyTop: '#29335c', skyHorizon: '#e5925d', skyBottom: '#57393b',
      showStars: false, starDensity: 0, sunColor: '#ffd08a',
      fogColor: '#8f6556', fogNear: 26, fogFar: 68,
      hemiSky: '#f7bc8d', hemiGround: '#4f3a29', hemiIntensity: 0.94,
      sunIntensity: 1.35, sunPosition: [-18, 14, 10], fillColor: '#8eb2e0', fillIntensity: 0.45,
      groundTint: '#627d47', plazaTint: '#b8a58e', accentStone: '#87786a',
      foliagePrimary: autumnShift ? '#d97706' : '#4a7c44', foliageSecondary: '#659652',
      waterColor: '#4e7f9e', portalGlow: '#38bdf8', lampGlow: '#ffba5c', lampEmissiveIntensity: 1.45,
      particleColor: '#fed7aa',
    };
  }
  return {
    skyTop: '#4c9be8', skyHorizon: '#cfe9fc', skyBottom: '#b8d9b0',
    showStars: false, starDensity: 0, sunColor: '#fff6d1',
    fogColor: '#d4e8f7', fogNear: 30, fogFar: 78,
    hemiSky: '#eef7ff', hemiGround: '#7a8a62', hemiIntensity: 1.18,
    sunIntensity: 1.6, sunPosition: [18, 28, 16], fillColor: '#dbeafe', fillIntensity: 0.45,
    groundTint: '#78a85a', plazaTint: '#d8cbb8', accentStone: '#a89f93',
    foliagePrimary: autumnShift ? '#ea8c2c' : '#4d8c46', foliageSecondary: '#73b05d',
    waterColor: '#56b2d6', portalGlow: '#38bdf8', lampGlow: '#ffe6a6', lampEmissiveIntensity: 0.45,
    particleColor: autumnShift ? '#fbbf24' : '#bef264',
  };
}
