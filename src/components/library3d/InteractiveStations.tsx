import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { AppTheme } from '@/hooks/useTheme';
import { isSkyBattlefieldBossRoom } from './bossRoomLayout3d';
import type {
  FloorWorldLayout3D,
  PlayerMotionState,
  WorldStation3D,
  WorldStationKind,
} from './worldTypes';

export interface InteractiveStationsProps {
  floor: FloorWorldLayout3D;
  theme: AppTheme;
  playerMotionRef: MutableRefObject<PlayerMotionState>;
  bossDoorUnlocked: boolean;
  activeStationId: string | null;
  paused: boolean;
  prefersReducedMotion: boolean;
  isDraggingRef: MutableRefObject<boolean>;
  onInteractStation: (station: WorldStation3D) => void;
}

interface StationRingPalette {
  color: string;
  radius: number;
  baseOpacity: number;
}

function getStationRingPalette(
  kind: WorldStationKind,
  theme: AppTheme,
  bossDoorUnlocked: boolean,
): StationRingPalette {
  const isLight = theme === 'light';
  switch (kind) {
    case 'reading_table':
      return { color: isLight ? '#059669' : '#34d399', radius: 1.55, baseOpacity: isLight ? 0.34 : 0.26 };
    case 'librarian_desk':
      return { color: isLight ? '#d97706' : '#fbbf24', radius: 1.55, baseOpacity: isLight ? 0.34 : 0.26 };
    case 'weather_shrine':
      return { color: isLight ? '#9333ea' : '#c084fc', radius: 1.25, baseOpacity: isLight ? 0.36 : 0.28 };
    case 'portal_up':
      return { color: isLight ? '#0284c7' : '#38bdf8', radius: 2.05, baseOpacity: isLight ? 0.38 : 0.32 };
    case 'portal_down':
      return { color: isLight ? '#0284c7' : '#38bdf8', radius: 1.75, baseOpacity: isLight ? 0.34 : 0.28 };
    case 'boss_door':
      return bossDoorUnlocked
        ? { color: isLight ? '#0d9488' : '#2dd4bf', radius: 2.15, baseOpacity: isLight ? 0.42 : 0.35 }
        : { color: isLight ? '#d97706' : '#f59e0b', radius: 2.15, baseOpacity: isLight ? 0.36 : 0.28 };
    case 'boss_exit':
      return { color: '#38bdf8', radius: 1.85, baseOpacity: 0.34 };
  }
}

/**
 * Draws a crisp white-on-alpha fantasy arcane rune circle (`256×256`, 0 CDN) shared by
 * all interactive stations and tinted per station role.
 */
function createMagicRuneTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const cx = size * 0.5;
    const cy = size * 0.5;
    ctx.clearRect(0, 0, size, size);

    // Soft inner radial aura
    const grad = ctx.createRadialGradient(cx, cy, size * 0.08, cx, cy, size * 0.48);
    grad.addColorStop(0, 'rgba(255,255,255,0.22)');
    grad.addColorStop(0.68, 'rgba(255,255,255,0.08)');
    grad.addColorStop(0.92, 'rgba(255,255,255,0.34)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
    ctx.fill();

    // Outer & inner concentric arcane rings
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.44, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.68)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.37, 0, Math.PI * 2);
    ctx.stroke();

    // Dashed arcane tick ring + 8 cardinal diamond runes
    ctx.save();
    ctx.translate(cx, cy);
    for (let i = 0; i < 24; i += 1) {
      const a = (i / 24) * Math.PI * 2;
      const isMajor = i % 3 === 0;
      ctx.save();
      ctx.rotate(a);
      if (isMajor) {
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        ctx.moveTo(0, -size * 0.435);
        ctx.lineTo(4.5, -size * 0.405);
        ctx.lineTo(0, -size * 0.375);
        ctx.lineTo(-4.5, -size * 0.405);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.58)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(0, -size * 0.425);
        ctx.lineTo(0, -size * 0.388);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Subtle 8-point inscribed star lines
    ctx.strokeStyle = 'rgba(255,255,255,0.34)';
    ctx.lineWidth = 1.4;
    for (let s = 0; s < 2; s += 1) {
      ctx.beginPath();
      for (let v = 0; v <= 4; v += 1) {
        const a = (v / 4) * Math.PI * 2 + (s * Math.PI) / 4;
        const r = size * 0.345;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (v === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Vertical soft fade texture for the subtle proximity light veil rising when Kirito enters `[E]` range. */
function createAuraVeilTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 128, 0, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.92)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

interface StationRuntimeNodes {
  disc: THREE.Mesh | null;
  halo: THREE.Mesh | null;
  veil: THREE.Mesh | null;
  glow: number;
}

/**
 * Renders soft 3D arcane magic circles beneath every interactive world station
 * (`Bàn đọc`, `Bục Thủ thư`, `Trụ Thời tiết`, `Cổng tầng`, `Cửa Phòng Boss`, `Cửa rời Phòng Boss`).
 * Rings smoothly brighten, accelerate their rotation, and lift a delicate aura veil
 * whenever Kirito walks into `[E]` interaction range, and support direct click triggering.
 */
export function InteractiveStations({
  floor,
  theme,
  playerMotionRef,
  bossDoorUnlocked,
  activeStationId,
  paused,
  prefersReducedMotion,
  isDraggingRef,
  onInteractStation,
}: InteractiveStationsProps) {
  const isLight =
    theme === 'light' && (!floor.isBossRoom || isSkyBattlefieldBossRoom(floor.biomeId));
  const shared = useMemo(() => {
    const runeTexture = createMagicRuneTexture();
    const veilTexture = createAuraVeilTexture();
    const discGeo = new THREE.PlaneGeometry(2, 2);
    const haloGeo = new THREE.RingGeometry(0.92, 1.03, 40);
    const veilGeo = new THREE.CylinderGeometry(0.84, 0.9, 0.56, 32, 1, true);
    return { runeTexture, veilTexture, discGeo, haloGeo, veilGeo };
  }, []);

  useEffect(() => {
    return () => {
      shared.runeTexture.dispose();
      shared.veilTexture.dispose();
      shared.discGeo.dispose();
      shared.haloGeo.dispose();
      shared.veilGeo.dispose();
      if (typeof document !== 'undefined') {
        document.body.style.cursor = 'auto';
      }
    };
  }, [shared]);

  const stationEntries = useMemo(() => {
    const blending = isLight ? THREE.NormalBlending : THREE.AdditiveBlending;
    return floor.stations.map((station) => {
      const palette = getStationRingPalette(station.kind, theme, bossDoorUnlocked);
      const discMat = new THREE.MeshBasicMaterial({
        color: palette.color,
        map: shared.runeTexture,
        transparent: true,
        opacity: palette.baseOpacity,
        blending,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        side: THREE.DoubleSide,
      });
      const haloMat = new THREE.MeshBasicMaterial({
        color: palette.color,
        transparent: true,
        opacity: palette.baseOpacity * 0.85,
        blending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const veilMat = new THREE.MeshBasicMaterial({
        color: palette.color,
        map: shared.veilTexture,
        transparent: true,
        opacity: 0,
        blending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      // Slight elevation clearance so elevated summit stone slabs (Y=2.41) never clip the circle
      const groundLift = station.position[1] > 1.0 ? 0.055 : 0.032;
      return { station, palette, discMat, haloMat, veilMat, groundLift };
    });
  }, [floor.stations, theme, bossDoorUnlocked, isLight, shared]);

  useEffect(() => {
    return () => {
      for (let i = 0; i < stationEntries.length; i += 1) {
        stationEntries[i].discMat.dispose();
        stationEntries[i].haloMat.dispose();
        stationEntries[i].veilMat.dispose();
      }
    };
  }, [stationEntries]);

  const nodesRef = useRef<Map<string, StationRuntimeNodes>>(new Map());

  useFrame((state, delta) => {
    if (paused) return;
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    const [px, py, pz] = playerMotionRef.current.position;
    const lerpAlpha = prefersReducedMotion ? 1 : Math.min(1, dt * 7.5);

    for (let i = 0; i < stationEntries.length; i += 1) {
      const entry = stationEntries[i];
      const nodes = nodesRef.current.get(entry.station.id);
      if (!nodes) continue;

      const [sx, sy, sz] = entry.station.position;
      const dist = Math.hypot(sx - px, sy - py, sz - pz);
      const inRange = dist <= entry.station.interactRadius || entry.station.id === activeStationId;
      const targetGlow = inRange ? 1 : dist <= entry.station.interactRadius * 1.9 ? 0.3 : 0;
      nodes.glow += (targetGlow - nodes.glow) * lerpAlpha;
      const g = nodes.glow;

      const pulse = prefersReducedMotion ? 0 : Math.sin(t * 2.6 + i * 1.1);
      const radius = entry.palette.radius;

      if (nodes.disc) {
        if (!prefersReducedMotion) {
          nodes.disc.rotation.z += dt * (0.16 + g * 0.52);
        }
        const s = radius * (1 + g * 0.07 + pulse * (0.012 + g * 0.025));
        nodes.disc.scale.set(s, s, 1);
        entry.discMat.opacity = Math.min(0.95, entry.palette.baseOpacity + g * 0.48 + pulse * 0.04);
      }

      if (nodes.halo) {
        const hs = radius * (1.02 + g * 0.1 + pulse * (0.02 + g * 0.035));
        nodes.halo.scale.set(hs, hs, 1);
        entry.haloMat.opacity = Math.min(0.92, entry.palette.baseOpacity * 0.72 + g * 0.56);
      }

      if (nodes.veil) {
        const showVeil = g > 0.03;
        nodes.veil.visible = showVeil;
        if (showVeil) {
          const vs = radius * (0.94 + g * 0.06);
          const vy = 0.72 + g * 0.52 + pulse * 0.06;
          nodes.veil.scale.set(vs, vy, vs);
          nodes.veil.position.y = entry.groundLift + vy * 0.28;
          entry.veilMat.opacity = g * (isLight ? 0.24 : 0.34);
        }
      }
    }
  });

  if (stationEntries.length === 0) return null;

  const setNode = (id: string, key: 'disc' | 'halo' | 'veil', mesh: THREE.Mesh | null) => {
    let slot = nodesRef.current.get(id);
    if (!slot) {
      if (!mesh) return;
      slot = { disc: null, halo: null, veil: null, glow: 0 };
      nodesRef.current.set(id, slot);
    }
    slot[key] = mesh;
    if (!slot.disc && !slot.halo && !slot.veil) {
      nodesRef.current.delete(id);
    }
  };

  return (
    <group name={`interactive-stations-floor-${floor.floorNumber}`}>
      {stationEntries.map(({ station, palette, discMat, haloMat, veilMat, groundLift }) => (
        <group key={station.id} position={station.position}>
          <mesh
            ref={(m) => setNode(station.id, 'disc', m)}
            position={[0, groundLift, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[palette.radius, palette.radius, 1]}
            geometry={shared.discGeo}
            material={discMat}
            renderOrder={2}
            onClick={(event: ThreeEvent<MouseEvent>) => {
              if (paused || isDraggingRef.current) return;
              event.stopPropagation();
              onInteractStation(station);
            }}
            onPointerOver={(event: ThreeEvent<PointerEvent>) => {
              if (paused) return;
              event.stopPropagation();
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              document.body.style.cursor = 'auto';
            }}
          />

          <mesh
            ref={(m) => setNode(station.id, 'halo', m)}
            position={[0, groundLift + 0.004, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[palette.radius * 1.02, palette.radius * 1.02, 1]}
            geometry={shared.haloGeo}
            material={haloMat}
            renderOrder={2}
          />

          <mesh
            ref={(m) => setNode(station.id, 'veil', m)}
            visible={false}
            position={[0, groundLift + 0.28, 0]}
            geometry={shared.veilGeo}
            material={veilMat}
            renderOrder={3}
          />
        </group>
      ))}
    </group>
  );
}
