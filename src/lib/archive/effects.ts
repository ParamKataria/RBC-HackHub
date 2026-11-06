import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import type {
  CameraFaderController,
  CollectionKey,
  PortalConfig,
  PortalEnergyController,
  PortalLightsController,
  PortalPreviewController,
  RoomConfigMetrics,
  RoomLimitConfig,
  RoomPortalTheme,
  StationPictureShaderController,
} from "@/src/types";

/**
 * SOURCE OF TRUTH KEYWORDS: PORTAL_CONFIGS, FloorReflectorShader, createPortalEnergyField, BCCNS rotunda, Warm plaster
 * WHAT: Custom Three.js shaders, planar floor reflectors, portal wash fields, camera faders, and timeline math for the BCCNS digital archive.
 * WHY: Preserves the inertial rotunda, colored arches, damped scroll, and gallery dolly while modernizing the palette to BCCNS ink, warm paper, copper ochre, Centre red, banner green, and gold.
 * WHERE: src/lib/archive/geometry.ts and src/components/archive/bccns-archive-experience.tsx.
 */

export const PORTAL_CONFIGS: PortalConfig[] = [
  {
    id: 0,
    portalNode: "portal_1",
    glowNode: "portal_1_glow",
    previewNode: "portal_preview_slavery_and_halifax",
    textNode: "portal_text_slavery_and_halifax",
    slug: "slavery-and-the-founding-of-halifax",
    collectionKey: "slavery_and_halifax",
    title: "Slavery and the founding of Halifax",
    subtitle: "African Nova Scotians in the Age of Slavery and Abolition",
    years: "1749 – 1834",
    angleDeg: 0,
    washHex: "#7f2626",
    hoverHex: "#a85c1a",
    color: 0x7f2626,
    hoverColor: 0xa85c1a,
  },
  {
    id: 1,
    portalNode: "portal_2",
    glowNode: "portal_2_glow",
    previewNode: "portal_preview_black_loyalists",
    textNode: "portal_text_black_loyalists",
    slug: "black-loyalists",
    collectionKey: "black_loyalists",
    title: "Black Loyalists",
    subtitle: "Birchtown · Shelburne · Preston · Annapolis Royal",
    years: "1783 – 1792",
    angleDeg: 300,
    washHex: "#a85c1a",
    hoverHex: "#a67224",
    color: 0xa85c1a,
    hoverColor: 0xa67224,
  },
  {
    id: 2,
    portalNode: "portal_3",
    glowNode: "portal_3_glow",
    previewNode: "portal_preview_the_maroons",
    textNode: "portal_text_the_maroons",
    slug: "the-maroons",
    collectionKey: "the_maroons",
    title: "The Maroons",
    subtitle: "Trelawny Town Maroons in Preston and Halifax",
    years: "1796 – 1800",
    angleDeg: 240,
    washHex: "#3a552e",
    hoverHex: "#a67224",
    color: 0x3a552e,
    hoverColor: 0xa67224,
  },
  {
    id: 3,
    portalNode: "portal_4",
    glowNode: "portal_4_glow",
    previewNode: "portal_preview_the_refugees",
    textNode: "portal_text_the_refugees",
    slug: "the-refugees",
    collectionKey: "the_refugees",
    title: "The Refugees",
    subtitle: "Preston · Cherry Brook · Hammonds Plains · Beechville",
    years: "1813 – 1854",
    angleDeg: 180,
    washHex: "#a67224",
    hoverHex: "#a85c1a",
    color: 0xa67224,
    hoverColor: 0xa85c1a,
  },
  {
    id: 4,
    portalNode: "portal_5",
    glowNode: "portal_5_glow",
    previewNode: "portal_preview_caribbean_migrants",
    textNode: "portal_text_caribbean_migrants",
    slug: "caribbean-migrants",
    collectionKey: "caribbean_migrants",
    title: "Caribbean migrants",
    subtitle: "Whitney Pier · Sydney · Glace Bay · Halifax",
    years: "1899 – 1939",
    angleDeg: 120,
    washHex: "#a85c1a",
    hoverHex: "#7f2626",
    color: 0xa85c1a,
    hoverColor: 0x7f2626,
  },
  {
    id: 5,
    portalNode: "portal_6",
    glowNode: "portal_6_glow",
    previewNode: "portal_preview_construction_battalion",
    textNode: "portal_text_construction_battalion",
    slug: "no-2-construction-battalion",
    collectionKey: "construction_battalion",
    title: "No. 2 Construction Battalion",
    subtitle: "Pictou · Truro · Canadian Expeditionary Force",
    years: "1916 – 1920",
    angleDeg: 60,
    washHex: "#3a552e",
    hoverHex: "#a85c1a",
    color: 0x3a552e,
    hoverColor: 0xa85c1a,
  },
];

export const ROOM_PORTAL_THEME: Record<CollectionKey, RoomPortalTheme> = {
  slavery_and_halifax: {
    prevCollection: "hall",
    nextCollection: "black_loyalists",
    portal1Color: "#a85c1a",
    portal1Hover: "#a67224",
    portal2Color: "#7f2626",
    portal2Hover: "#a85c1a",
    fogColor: 0xe9ddcf,
    bgColor: 0xe9ddcf,
  },
  black_loyalists: {
    prevCollection: "slavery_and_halifax",
    nextCollection: "the_maroons",
    portal1Color: "#3a552e",
    portal1Hover: "#a67224",
    portal2Color: "#7f2626",
    portal2Hover: "#a85c1a",
    fogColor: 0xe9ddcf,
    bgColor: 0xe9ddcf,
  },
  the_maroons: {
    prevCollection: "black_loyalists",
    nextCollection: "the_refugees",
    portal1Color: "#a67224",
    portal1Hover: "#a85c1a",
    portal2Color: "#a85c1a",
    portal2Hover: "#a67224",
    fogColor: 0xe9ddcf,
    bgColor: 0xe9ddcf,
  },
  the_refugees: {
    prevCollection: "the_maroons",
    nextCollection: "caribbean_migrants",
    portal1Color: "#a85c1a",
    portal1Hover: "#7f2626",
    portal2Color: "#3a552e",
    portal2Hover: "#a67224",
    fogColor: 0xe9ddcf,
    bgColor: 0xe9ddcf,
  },
  caribbean_migrants: {
    prevCollection: "the_refugees",
    nextCollection: "construction_battalion",
    portal1Color: "#3a552e",
    portal1Hover: "#a85c1a",
    portal2Color: "#a67224",
    portal2Hover: "#a85c1a",
    fogColor: 0xe9ddcf,
    bgColor: 0xe9ddcf,
  },
  construction_battalion: {
    prevCollection: "caribbean_migrants",
    nextCollection: "hall",
    portal1Color: "#a85c1a",
    portal1Hover: "#7f2626",
    portal2Color: "#a85c1a",
    portal2Hover: "#a67224",
    fogColor: 0xe9ddcf,
    bgColor: 0xe9ddcf,
  },
};

/**
 * SOURCE OF TRUTH KEYWORDS: computeRoomLimitsForStationCount, computeRoomConfig, RoomLimitConfig, gallery dolly
 * WHAT: Computes the X-axis camera dolly bounds and exact station viewing percentages for a gallery hallway.
 * WHY: Synchronizes the 3D station picture frames on the hallway walls 1:1 with the timeline slider markers across all 6 routes.
 * WHERE: bccns-archive-experience.tsx and geometry.ts.
 */
export function computeRoomLimitsForStationCount(stationCount: number): RoomLimitConfig {
  const minX = -50.1;
  const effectiveCount = Math.max(2, stationCount);
  const span = Math.max(25.2, (effectiveCount - 1) * 7.2 + 5.6);
  const maxX = +(minX + span).toFixed(1);
  return { min: [minX, 1.8, 0], max: [maxX, 1.8, 0], portalDist: maxX - 12 };
}

export function computeRoomConfig(
  pictureXPositions: number[],
  minX: number,
  maxX: number,
): RoomConfigMetrics {
  const pathLength = Math.max(1, maxX - minX);
  const picturesDistanceFromStart = pictureXPositions.map((picX) => {
    // Camera is at viewNode.x - 2 looking down +X; optimal viewing distance is ~3.2 units before picX
    const optimalViewX = THREE.MathUtils.clamp(
      picX - 3.2,
      minX + pathLength * 0.04,
      maxX - pathLength * 0.06,
    );
    return THREE.MathUtils.clamp((optimalViewX - minX) / pathLength, 0.04, 0.94);
  });

  const picturesDistanceFromPrev = picturesDistanceFromStart.map((d, idx) =>
    idx === 0 ? d : d - picturesDistanceFromStart[idx - 1],
  );

  return {
    pathLength,
    picturesPosition: pictureXPositions,
    cameraStartPosition: minX,
    picturesDistanceFromStart,
    picturesDistanceFromPrev,
    firstPicDistance: picturesDistanceFromStart[0] ?? 0.08,
    secondPicDistance: picturesDistanceFromPrev[1] ?? 0.14,
  };
}

export const FloorReflectorShader = {
  name: "ReflectorShader",
  uniforms: {
    color: { value: null as THREE.Color | null },
    tDiffuse: { value: null as THREE.Texture | null },
    textureMatrix: { value: null as THREE.Matrix4 | null },
    opacity: { value: 0.07 },
    blurAmount: { value: 0.0 },
    matteColor: { value: new THREE.Color(0xe9ddcf) },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;

    #include <common>
    #include <logdepthbuf_pars_vertex>

    void main() {
      vUv = textureMatrix * vec4( position, 1.0 );
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      #include <logdepthbuf_vertex>
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float opacity;
    uniform float blurAmount;
    uniform vec3 matteColor;
    varying vec4 vUv;

    #include <logdepthbuf_pars_fragment>

    void main() {
      #include <logdepthbuf_fragment>
      vec4 base = texture2DProj( tDiffuse, vUv );

      if ( blurAmount > 0.0 ) {
        vec4 blur = vec4(0.0);
        blur += texture2DProj( tDiffuse, vUv + vec4(blurAmount, 0.0, 0.0, 0.0) ) * 0.2;
        blur += texture2DProj( tDiffuse, vUv - vec4(blurAmount, 0.0, 0.0, 0.0) ) * 0.2;
        blur += texture2DProj( tDiffuse, vUv + vec4(0.0, blurAmount, 0.0, 0.0) ) * 0.2;
        blur += texture2DProj( tDiffuse, vUv - vec4(0.0, blurAmount, 0.0, 0.0) ) * 0.2;
        blur += base * 0.2;
        gl_FragColor = blur;
      } else {
        gl_FragColor = base;
      }

      gl_FragColor.rgb = mix( gl_FragColor.rgb, matteColor, 0.55 );
      gl_FragColor.a = opacity;
    }
  `,
};

export interface FloorReflectorOptions {
  width?: number;
  height?: number;
  opacity?: number;
  blur?: number;
  matteColor?: number;
}

/**
 * SOURCE OF TRUTH KEYWORDS: createFloorReflector, pale reflective floor, warm plaster
 * WHAT: Creates a planar floor reflector tinted to BCCNS warm paper (#F3EEE6).
 * WHY: Gives the colonnade and rotunda a pale reflective floor without harsh mirror glare.
 * WHERE: Hall and gallery floor setup.
 */
export function createFloorReflector(
  reflectorAnchor: THREE.Object3D,
  {
    width = 20,
    height = 20,
    opacity = 0.07,
    blur = 0,
    matteColor = 0xe9ddcf,
  }: FloorReflectorOptions = {},
): Reflector {
  const geom = new THREE.PlaneGeometry(width, height, 5, 5);
  geom.translate(0.5 * width, 0, 0);

  const shader = {
    ...FloorReflectorShader,
    uniforms: THREE.UniformsUtils.clone(FloorReflectorShader.uniforms),
  };

  const reflector = new Reflector(geom, {
    clipBias: 0.003,
    textureWidth: 512,
    textureHeight: 512,
    color: 0x8a8278,
    multisample: 0,
    shader,
  });

  const mat = reflector.material as THREE.ShaderMaterial;
  mat.transparent = true;
  mat.uniforms.opacity.value = opacity;
  mat.uniforms.blurAmount.value = blur;
  mat.uniforms.matteColor.value = new THREE.Color(matteColor);
  reflector.rotation.x = -Math.PI / 2;

  reflectorAnchor.add(reflector);
  return reflector;
}

/**
 * SOURCE OF TRUTH KEYWORDS: updateLeapfrogReflectors, reflector_01, reflector_02
 * WHAT: Leapfrogs two floor reflectors along the gallery walk as the visitor dollies forward or back.
 * WHY: Keeps floor reflections continuous across long archival corridors.
 * WHERE: Main animation loop in gallery mode.
 */
export function updateLeapfrogReflectors(
  viewX: number,
  reflector1: THREE.Object3D | null | undefined,
  reflector2: THREE.Object3D | null | undefined,
): void {
  if (!reflector1 || !reflector2) return;
  // Leapfrog reflector1 forward as the camera passes its position, then back when retreating
  if (viewX > reflector1.position.x - 1 && !reflector1.userData.moved) {
    reflector1.position.x += 52;
    reflector1.userData.moved = true;
  }
  if (viewX < reflector1.position.x - 53 && reflector1.userData.moved) {
    reflector1.position.x -= 52;
    reflector1.userData.moved = false;
  }
  // Same for reflector2
  if (viewX > reflector2.position.x - 1 && !reflector2.userData.moved) {
    reflector2.position.x += 52;
    reflector2.userData.moved = true;
  }
  if (viewX < reflector2.position.x - 53 && reflector2.userData.moved) {
    reflector2.position.x -= 52;
    reflector2.userData.moved = false;
  }
}

export interface PortalEnergyOptions {
  color?: number | string;
  hoverColor?: number | string;
  transparency?: number;
  width?: number;
  size?: number;
  noiseTexture?: THREE.Texture | null;
}

/**
 * SOURCE OF TRUTH KEYWORDS: createPortalEnergyField, arch wash, hover temperature, FBM shader
 * WHAT: Builds the arched portal light wash shader with 2-octave FBM noise that overlays archway images and shifts color temperature when hovered.
 * WHY: Each collection has one wash color from the BCCNS palette (#7f2626, #a85c1a, #3a552e, #a67224), overlaid on top of the archival scan inside the arch.
 * WHERE: Rotunda arches and end-of-gallery twin portals.
 */
export function createPortalEnergyField(
  portalAnchor: THREE.Object3D,
  {
    color = 0xa85c1a,
    hoverColor = 0xa67224,
    transparency = 0.42,
    width = 3.64,
    size = 5.56,
    noiseTexture = null,
  }: PortalEnergyOptions = {},
): PortalEnergyController {
  const height = size;
  const geom = new THREE.PlaneGeometry(width, height);
  // Translate by half height so bottom edge sits flush at y = 0.0 without clipping the floor
  geom.translate(0, height * 0.5, 0);

  if (noiseTexture) {
    noiseTexture.wrapS = THREE.RepeatWrapping;
    noiseTexture.wrapT = THREE.RepeatWrapping;
  }

  const baseCol = new THREE.Color(color);
  const hovCol = new THREE.Color(hoverColor);
  const currentCol = baseCol.clone();

  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uColor: { value: currentCol },
        uHover: { value: 0 },
        uTransparency: { value: transparency },
        uNoiseTexture: { value: noiseTexture },
        uUseNoise: { value: noiseTexture ? 1.0 : 0.0 },
      },
    ]),
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #ifdef USE_FOG
          vFogDepth = -mvPosition.z;
        #endif
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uHover;
      uniform float uTransparency;
      uniform sampler2D uNoiseTexture;
      uniform float uUseNoise;
      varying vec2 vUv;
      #include <fog_pars_fragment>

      #define PI 3.14159265359

      float sampleNoise(vec2 p) {
        if (uUseNoise > 0.5) {
          return texture2D(uNoiseTexture, p).r;
        }
        return 0.5 + 0.25 * sin(p.x * 18.0 + uTime) * cos(p.y * 18.0 - uTime);
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.55;
        for (int i = 0; i < 2; i++) {
          value += amplitude * sampleNoise(p);
          p *= 2.02;
          amplitude *= 0.5;
        }
        return value;
      }

      void main() {
        // Arch geometry in UV space:
        // x in [-1, 1], y in [0, 1]. Semicircle spring line at y = 0.675.
        float nx = (vUv.x - 0.5) * 2.0;
        float ny = vUv.y;
        float springY = 0.675;

        float distToEdge = 0.0;
        if (ny <= springY) {
          distToEdge = 1.0 - abs(nx);
        } else {
          vec2 archVec = vec2(nx, (ny - springY) / (1.0 - springY));
          distToEdge = 1.0 - length(archVec);
        }

        // Discard outside the arch opening so it never overflows the masonry frame
        if (distToEdge < 0.0) {
          discard;
        }

        // Polar FBM energy wash inside the arch (matching original digital-influence shader)
        vec2 circleCenter = vec2(0.5, springY);
        vec2 dCircle = vUv - circleCenter;
        dCircle.y /= (1.0 - springY);
        float len = length(dCircle);
        float angle = atan(dCircle.y, dCircle.x);
        float normAngle = (angle + PI) / (2.0 * PI);
        float mirroredAngle = 1.0 - abs(2.0 * normAngle - 1.0);

        float speed = 0.07 + 0.04 * uHover;
        vec2 polarUV = vec2(mirroredAngle * 0.65, len * 0.55 - uTime * speed);
        float nCircle = smoothstep(0.18, 0.85, fbm(polarUV));

        vec2 dRect = abs(vUv - vec2(0.5, springY * 0.5)) / vec2(0.5, springY * 0.5);
        float rectFactor = max(dRect.x, dRect.y);
        vec2 rectUV = vec2(vUv.x * 0.65, rectFactor * 0.55 - uTime * speed);
        float nRect = smoothstep(0.18, 0.85, fbm(rectUV));

        float fbmVal = mix(nRect, nCircle, smoothstep(springY - 0.08, springY + 0.08, ny));
        float rimGlow = smoothstep(0.56, 0.0, distToEdge);
        float bottomFade = smoothstep(0.0, 0.06, ny);

        // Blend warm paper with collection wash color so the archival scan behind the arch shines through
        vec3 warmPaper = vec3(0.914, 0.867, 0.812);
        vec3 washColor = mix(uColor, warmPaper, fbmVal * 0.35);
        float alpha = clamp((rimGlow * 0.72 + (1.0 - fbmVal) * 0.42 + 0.14 * uHover) * bottomFade, 0.0, 1.0);
        float finalAlpha = alpha * uTransparency;

        gl_FragColor = vec4(washColor, finalAlpha);
        #include <fog_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });

  const mesh = new THREE.Mesh(geom, material);
  mesh.position.set(0.06, 0, 0);
  mesh.rotation.set(0, -Math.PI / 2, 0);
  portalAnchor.add(mesh);

  let isHovered = false;
  return {
    mesh,
    material,
    setHovered(hovered: boolean) {
      isHovered = hovered;
    },
    update(dt: number, elapsed: number) {
      material.uniforms.uTime.value = elapsed;
      const target = isHovered ? hovCol : baseCol;
      currentCol.lerp(target, Math.min(1, 8 * dt));
      material.uniforms.uColor.value.copy(currentCol);
      material.uniforms.uHover.value = THREE.MathUtils.lerp(
        material.uniforms.uHover.value,
        isHovered ? 1.0 : 0.0,
        Math.min(1, 8 * dt),
      );
      material.uniforms.uTransparency.value = THREE.MathUtils.lerp(
        material.uniforms.uTransparency.value,
        isHovered ? Math.min(0.64, transparency + 0.16) : transparency,
        Math.min(1, 8 * dt),
      );
    },
  };
}

export interface PortalLightsOptions {
  color?: number | string;
  intensity?: number;
  distance?: number;
  decay?: number;
  positions?: [number, number, number][];
}

/**
 * SOURCE OF TRUTH KEYWORDS: createPortalPointLights, warm portal light, arch illumination
 * WHAT: Adds soft warm point lights inside each rotunda arch.
 * WHY: Casts a gentle warm wash onto the surrounding plaster archway.
 * WHERE: attachHallEffects.
 */
export function createPortalPointLights(
  glowNode: THREE.Object3D,
  {
    color = 0xa85c1a,
    intensity = 3.6,
    distance = 2.4,
    decay = 0.12,
    positions = [
      [0, 1.5, 0],
      [0, 4.2, 0],
    ],
  }: PortalLightsOptions = {},
): PortalLightsController {
  const lights = positions.map(([x, y, z]) => {
    const light = new THREE.PointLight(color, intensity, distance, decay);
    light.position.set(x, y, z);
    glowNode.add(light);
    return light;
  });

  return {
    lights,
    update(_dt: number, elapsed: number) {
      const pulse = 0.88 + 0.08 * Math.sin(1.4 * elapsed);
      for (const l of lights) {
        l.intensity = intensity * pulse;
      }
    },
  };
}

export interface PortalPreviewOptions {
  portalAngleDeg?: number;
  shiftMultiplier?: number;
  maxShift?: number;
  texture?: THREE.Texture | null;
}

/**
 * SOURCE OF TRUTH KEYWORDS: applyPortalPreviewShader, parallax arch scan, rotunda preview, wavy shader
 * WHAT: Applies subtle wavy vertex/UV distortion, parallax shift, and hover zoom/glow to archival scans recessed inside rotunda and hallway arches.
 * WHY: Matches the original digital-influence archway shader hover and wave effect while keeping the archival scan crisp.
 * WHERE: Rotunda portal preview meshes and end-of-hallway twin portal preview meshes.
 */
export function applyPortalPreviewShader(
  previewMesh: THREE.Mesh,
  {
    portalAngleDeg = 0,
    shiftMultiplier = 0.004,
    maxShift = 0.18,
    texture = null,
  }: PortalPreviewOptions = {},
): PortalPreviewController {
  const origMat = previewMesh.material as THREE.MeshBasicMaterial | undefined;
  const map = texture || origMat?.map || null;
  let isHovered = false;

  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTexture: { value: map },
        uTime: { value: 0 },
        uUvShift: { value: 0 },
        uHover: { value: 0 },
        uOpacity: { value: origMat?.opacity ?? 1.0 },
      },
    ]),
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uHover;
      #include <fog_pars_vertex>

      void main() {
        vUv = uv;
        vec3 pos = position;
        pos.x += sin(uv.y * 5.0 + uTime * 1.1) * (0.02 + 0.03 * uHover);
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #ifdef USE_FOG
          vFogDepth = -mvPosition.z;
        #endif
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTexture;
      uniform float uTime;
      uniform float uUvShift;
      uniform float uHover;
      uniform float uOpacity;
      varying vec2 vUv;
      #include <fog_pars_fragment>

      void main() {
        // Clip preview image to the exact semicircular arch silhouette (matching createPortalEnergyField)
        float nx = (vUv.x - 0.5) * 2.0;
        float ny = vUv.y;
        float springY = 0.675;
        float distToEdge = 0.0;
        if (ny <= springY) {
          distToEdge = 1.0 - abs(nx);
        } else {
          vec2 archVec = vec2(nx, (ny - springY) / (1.0 - springY));
          distToEdge = 1.0 - length(archVec);
        }
        if (distToEdge < 0.0) {
          discard;
        }

        float zoom = 1.0 - 0.04 * uHover;
        vec2 centered = (vUv - 0.5) * zoom;
        // Cover the tall arch with the square scan. Crop the sides instead of stretching the height.
        centered.x *= 3.64 / 5.56;
        vec2 fitted = centered + 0.5;
        float edgeFade = smoothstep(0.0, 0.22, distToEdge);
        vec2 shiftedUV = fitted;
        shiftedUV.x += uUvShift * edgeFade * 0.35;
        shiftedUV = clamp(shiftedUV, 0.0, 1.0);

        vec2 distortedUV = shiftedUV;
        float waveBoost = 1.0 + 0.6 * uHover;
        distortedUV.x += sin(vUv.y * 18.0 + uTime * 1.4) * 0.0012 * waveBoost * edgeFade;
        distortedUV.y += cos(vUv.x * 8.0 + uTime * 0.6) * 0.0016 * waveBoost * edgeFade;
        distortedUV = clamp(distortedUV, 0.0, 1.0);

        float rim = smoothstep(0.16, 0.0, distToEdge);
        vec2 blur = vec2(0.01, 0.008) * rim;
        vec4 texColor = (
          texture2D(uTexture, distortedUV) * 2.0
          + texture2D(uTexture, distortedUV + vec2(blur.x, 0.0))
          + texture2D(uTexture, distortedUV - vec2(blur.x, 0.0))
          + texture2D(uTexture, distortedUV + vec2(0.0, blur.y))
          + texture2D(uTexture, distortedUV - vec2(0.0, blur.y))
        ) / 6.0;
        // Subtle inner arch shadow + warm lighting boost on hover
        float innerVignette = smoothstep(0.0, 0.14, distToEdge);
        vec3 litColor = texColor.rgb * (0.94 + 0.12 * uHover) * (0.82 + 0.18 * innerVignette);
        gl_FragColor = vec4(litColor, texColor.a * uOpacity);
        #include <fog_fragment>
      }
    `,
    transparent: origMat?.transparent ?? false,
    side: THREE.DoubleSide,
    fog: true,
  });

  // merge() clones the canvas texture. Later scan uploads only bump the original texture version.
  if (map) {
    material.uniforms.uTexture.value = map;
  }

  previewMesh.material = material;

  return {
    mesh: previewMesh,
    material,
    setTexture(tex: THREE.Texture | null) {
      material.uniforms.uTexture.value = tex;
    },
    setHovered(hovered: boolean) {
      isHovered = hovered;
    },
    update(dt: number, elapsed: number, cameraDeg = 0) {
      material.uniforms.uTime.value = elapsed;
      const diff = ((((cameraDeg - portalAngleDeg) % 360) + 540) % 360) - 180;
      const shift = THREE.MathUtils.clamp(-diff * shiftMultiplier, -maxShift, maxShift);
      material.uniforms.uUvShift.value = shift;
      material.uniforms.uHover.value = THREE.MathUtils.lerp(
        material.uniforms.uHover.value,
        isHovered ? 1.0 : 0.0,
        Math.min(1, 8 * dt),
      );
    },
  };
}

export interface StationPictureShaderOptions {
  texture?: THREE.Texture | null;
  accentColor?: number | string;
}

/**
 * SOURCE OF TRUTH KEYWORDS: applyStationPictureShader, framed station hover shader, gallery picture wave
 * WHAT: Applies an interactive wavy/parallax/spotlight hover shader to each framed archival station image hanging on the gallery hallway wall.
 * WHY: Gives every hallway painting/scan the same responsive shader hover feel as the archway images while keeping text and document details legible.
 * WHERE: transitionToCollectionRoom in bccns-archive-experience.tsx.
 */
export function applyStationPictureShader(
  picMesh: THREE.Mesh,
  {
    texture = null,
    accentColor = 0xa85c1a,
  }: StationPictureShaderOptions = {},
): StationPictureShaderController {
  const origMat = picMesh.material as THREE.MeshBasicMaterial | undefined;
  const map = texture || origMat?.map || null;
  const accent = new THREE.Color(accentColor);
  let isHovered = false;

  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTexture: { value: map },
        uTime: { value: 0 },
        uHover: { value: 0 },
        uAccentColor: { value: accent },
      },
    ]),
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uHover;
      #include <fog_pars_vertex>

      void main() {
        vUv = uv;
        vec3 pos = position;
        // Subtle 3D canvas ripple when hovered
        float edgeMask = sin(uv.x * 3.14159) * sin(uv.y * 3.14159);
        pos.z += sin(uv.y * 6.0 + uTime * 2.1) * 0.032 * uHover * edgeMask;
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #ifdef USE_FOG
          vFogDepth = -mvPosition.z;
        #endif
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTexture;
      uniform float uTime;
      uniform float uHover;
      uniform vec3 uAccentColor;
      varying vec2 vUv;
      #include <fog_pars_fragment>

      void main() {
        float zoom = 1.0 - 0.048 * uHover;
        vec2 uv = (vUv - 0.5) * zoom + 0.5;

        // Gentle ambient wave that amplifies into a liquid ripple on hover
        float waveStrength = 0.22 + 1.45 * uHover;
        uv.x += sin(vUv.y * 26.0 + uTime * 2.2) * 0.0024 * waveStrength;
        uv.y += cos(vUv.x * 12.0 + uTime * 1.4) * 0.0028 * waveStrength;
        uv = clamp(uv, 0.004, 0.996);

        vec4 texColor = texture2D(uTexture, uv);

        // Warm gallery spotlight illumination + subtle copper-ochre border sheen on hover
        float borderDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
        float rimSheen = smoothstep(0.055, 0.0, borderDist) * uHover * 0.42;
        vec3 litColor = texColor.rgb * (0.98 + 0.08 * uHover) + uAccentColor * rimSheen;

        gl_FragColor = vec4(litColor, texColor.a);
        #include <fog_fragment>
      }
    `,
    transparent: false,
    side: THREE.DoubleSide,
    fog: true,
  });

  // merge() clones the canvas texture. Later scan uploads only bump the original texture version.
  if (map) {
    material.uniforms.uTexture.value = map;
  }

  picMesh.material = material;

  return {
    mesh: picMesh,
    material,
    setTexture(tex: THREE.Texture | null) {
      material.uniforms.uTexture.value = tex;
    },
    setHovered(hovered: boolean) {
      isHovered = hovered;
    },
    update(dt: number, elapsed: number) {
      material.uniforms.uTime.value = elapsed;
      material.uniforms.uHover.value = THREE.MathUtils.lerp(
        material.uniforms.uHover.value,
        isHovered ? 1.0 : 0.0,
        Math.min(1, 9 * dt),
      );
    },
  };
}

/**
 * SOURCE OF TRUTH KEYWORDS: updateResponsiveCameraZoom, updateRoomCameraProjection, 768px layout
 * WHAT: Adjusts camera zoom and field of view across desktop and <=768px viewports.
 * WHY: Both desktop and 768px-and-below layouts are first-class.
 * WHERE: Window resize and scene mount handlers.
 */
export function updateResponsiveCameraZoom(
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  {
    defaultZoom = 0.58,
    minZoom = 0.48,
    maxZoom = 0.76,
    minAspect = 0.65,
    maxAspect = 1.8,
  } = {},
): void {
  const aspect = width / Math.max(1, height);
  const zoom = aspect < minAspect ? minZoom : aspect > maxAspect ? maxZoom : defaultZoom;
  camera.aspect = aspect;
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
}

export function updateRoomCameraProjection(
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  baseFov = 53.7,
  {
    defaultZoom = 1.08,
    minZoom = 0.86,
    maxZoom = 1.1,
    minAspect = 0.9,
    maxAspect = 1.8,
  } = {},
): void {
  const aspect = width / Math.max(1, height);
  camera.aspect = aspect;
  camera.zoom = aspect < minAspect ? minZoom : aspect > maxAspect ? maxZoom : defaultZoom;
  camera.fov =
    aspect < 0.8 ? baseFov * (2.25 - aspect) : aspect > 1.8 ? baseFov - 4 : baseFov + 4;
  camera.updateProjectionMatrix();
}

/**
 * SOURCE OF TRUTH KEYWORDS: createCameraFaderPlane, warm paper fade, gallery transition
 * WHAT: Full-viewport camera fader plane using warm paper (#F3EEE6) instead of stark white.
 * WHY: Smooths arrival into a gallery corridor while preserving the warm daylight plaster tone.
 * WHERE: transitionToCollectionRoom.
 */
export function createCameraFaderPlane(
  viewNode: THREE.Object3D,
  initialAlpha = 1.0,
): CameraFaderController {
  let targetAlpha = initialAlpha;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uAlpha: { value: initialAlpha },
    },
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uAlpha;
      void main() {
        gl_FragColor = vec4(0.914, 0.867, 0.812, uAlpha);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.name = "faderPlane";
  mesh.renderOrder = 999;
  mesh.frustumCulled = false;
  viewNode.add(mesh);

  return {
    mesh,
    fadeTo(alpha: number) {
      targetAlpha = alpha;
      if (alpha > 0) mesh.visible = true;
    },
    setAlphaImmediate(alpha: number) {
      targetAlpha = alpha;
      material.uniforms.uAlpha.value = alpha;
      mesh.visible = alpha > 0;
    },
    update() {
      const uAlpha = material.uniforms.uAlpha;
      if (uAlpha.value === targetAlpha) return;
      uAlpha.value = THREE.MathUtils.lerp(uAlpha.value, targetAlpha, 0.08);
      if (Math.abs(targetAlpha - uAlpha.value) < 0.01) {
        uAlpha.value = targetAlpha;
        if (uAlpha.value === 0) mesh.visible = false;
      }
    },
  };
}

/**
 * SOURCE OF TRUTH KEYWORDS: getMarkerPercentage, isEventMarkerActive, gallery timeline scrubber
 * WHAT: Computes percentage positions along the bottom chronological walk bar for each archival station.
 * WHY: Synchronizes the 3D gallery camera position with the date markers along the walk.
 * WHERE: bccns-archive-experience.tsx.
 */
export function getMarkerPercentage(
  index: number,
  roomConfigOrTotal: RoomConfigMetrics | number | null | undefined,
): number {
  if (typeof roomConfigOrTotal === "number") {
    const total = Math.max(1, roomConfigOrTotal);
    const first = 8;
    const last = 92;
    return total > 1 ? first + (index / (total - 1)) * (last - first) : 50;
  }
  const roomConfig = roomConfigOrTotal;
  if (!roomConfig) return 0;
  if (
    Array.isArray(roomConfig.picturesDistanceFromStart) &&
    roomConfig.picturesDistanceFromStart[index] != null
  ) {
    return THREE.MathUtils.clamp(
      roomConfig.picturesDistanceFromStart[index] * 100,
      3,
      96,
    );
  }
  const first = (roomConfig.firstPicDistance || 0.08) * 100;
  const step = (roomConfig.secondPicDistance || 0.11) * 100;
  return first + index * step;
}

export function isEventMarkerActive(
  index: number,
  totalEvents: number,
  progressPct: number,
  roomConfig?: RoomConfigMetrics | null,
): boolean {
  const cfg = roomConfig || totalEvents;
  const markerPos = getMarkerPercentage(index, cfg);
  const prevPos = index > 0 ? getMarkerPercentage(index - 1, cfg) : 0;
  const nextPos = index < totalEvents - 1 ? getMarkerPercentage(index + 1, cfg) : 100;
  const lowerBound = markerPos - (markerPos - prevPos) * 0.45;
  const upperBound = markerPos + (nextPos - markerPos) * 0.45;
  return progressPct >= lowerBound && progressPct <= upperBound;
}
