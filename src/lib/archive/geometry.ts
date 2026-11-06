import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { computeRoomConfig, PORTAL_CONFIGS } from "@/src/lib/archive/effects";
import type {
  ArchiveCollection,
  ArchiveStation,
  CollectionKey,
  LoadedHallTextures,
  MuseumRoomBuildResult,
  PortalConfig,
  RoomLimitConfig,
  RoomPortalTheme,
} from "@/src/types";

/**
 * SOURCE OF TRUTH KEYWORDS: buildProceduralHallScene, buildMuseumRoomScene, renderArchivalDocumentCanvas, warm plaster colonnade
 * WHAT: Constructs the 6-portal warm-plaster BCCNS Rotunda and chronological gallery colonnades, rendering authentic archival scans and citations onto 3D canvases.
 * WHY: Ensures records keep their own paper, ink, newsprint, and map colors with a soft contact shadow, and gracefully displays title + citation if a remote scan fails or is absent.
 * WHERE: src/components/archive/bccns-archive-experience.tsx.
 */

function wrapCanvasLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) {
        break;
      }
    } else {
      current = test;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines;
}

/**
 * SOURCE OF TRUTH KEYWORDS: renderArchivalDocumentCanvas, archival scan, DublinCore station, fallback citation
 * WHAT: Renders an authentic parchment/newsprint/map archival sheet for a station or collection arch preview.
 * WHY: "Images that fail show the title and citation, not a broken frame. Paper, ink, newsprint, and maps keep their own color. Do not recolor a scan to match the palette."
 * WHERE: Station 3D planes, rotunda arch previews, and record panel fallback.
 */
export function renderArchivalDocumentCanvas(
  station: ArchiveStation,
  index: number,
  washHex = "#C4782A",
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 640;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Warm archival paper substrate (#F3EEE6 -> #EAE2D3 subtle gradient)
  const paperGrad = ctx.createLinearGradient(0, 0, 640, 640);
  paperGrad.addColorStop(0, "#F5F0E6");
  paperGrad.addColorStop(0.6, "#EFE8DA");
  paperGrad.addColorStop(1, "#E7DEC9");
  ctx.fillStyle = paperGrad;
  ctx.fillRect(0, 0, 640, 640);

  // Subtle paper fiber lines (newspaper / ledger / map grid texture based on dc_type)
  ctx.save();
  if (station.dc_type === "map") {
    ctx.strokeStyle = "rgba(22, 22, 22, 0.08)";
    ctx.lineWidth = 1;
    for (let x = 48; x < 600; x += 46) {
      ctx.beginPath();
      ctx.moveTo(x, 48);
      ctx.lineTo(x, 592);
      ctx.stroke();
    }
    for (let y = 48; y < 600; y += 46) {
      ctx.beginPath();
      ctx.moveTo(48, y);
      ctx.lineTo(592, y);
      ctx.stroke();
    }
    // Compass / meridian ring on map sheet
    ctx.strokeStyle = "rgba(196, 120, 42, 0.28)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(320, 290, 145, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeStyle = "rgba(22, 22, 22, 0.055)";
    ctx.lineWidth = 1;
    for (let y = 130; y < 540; y += 22) {
      ctx.beginPath();
      ctx.moveTo(56, y);
      ctx.lineTo(584, y);
      ctx.stroke();
    }
  }
  ctx.restore();

  // Hairline ink rule and copper ochre accent rule
  ctx.strokeStyle = "rgba(22, 22, 22, 0.24)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(28, 28, 584, 584);

  ctx.fillStyle = washHex;
  ctx.fillRect(56, 58, 72, 3);

  // Top metadata label: Type + Year in Gold (#C9892D) / Ink (#161616)
  ctx.fillStyle = "#161616";
  ctx.font = '600 15px "Inter", -apple-system, sans-serif';
  ctx.textAlign = "left";
  ctx.fillText(
    `${station.dc_type.toUpperCase()}  ·  ${station.display_year.toUpperCase()}`,
    56,
    92,
  );

  // Holding Institution
  ctx.fillStyle = "rgba(22, 22, 22, 0.68)";
  ctx.font = '500 14px "Inter", -apple-system, sans-serif';
  ctx.fillText(station.dc_publisher.toUpperCase(), 56, 118);

  // Record Title in high-contrast serif
  ctx.fillStyle = "#161616";
  ctx.font = '400 33px "Cormorant Garamond", Georgia, serif';
  const titleLines = wrapCanvasLines(
    ctx,
    station.dc_title || `Archival Record ${index + 1}`,
    520,
    4,
  );
  titleLines.forEach((line, idx) => {
    ctx.fillText(line, 56, 178 + idx * 40);
  });

  // Catalogue Description excerpt in ink
  const descTop = 186 + titleLines.length * 40;
  if (station.dc_description) {
    ctx.fillStyle = "rgba(22, 22, 22, 0.82)";
    ctx.font = '400 18px "Cormorant Garamond", Georgia, serif';
    const descLines = wrapCanvasLines(ctx, station.dc_description, 520, 5);
    descLines.forEach((line, idx) => {
      ctx.fillText(line, 56, descTop + idx * 26);
    });
  }

  // Place & Creator
  ctx.fillStyle = "#161616";
  ctx.font = '600 14px "Inter", -apple-system, sans-serif';
  const placeLine = station.dcterms_spatial
    ? `PLACE: ${station.dcterms_spatial.replace(/\|/g, " · ")}`
    : "PLACE: NOVA SCOTIA";
  ctx.fillText(placeLine.slice(0, 66), 56, 488);

  if (station.dc_creator) {
    ctx.fillStyle = "rgba(22, 22, 22, 0.75)";
    ctx.font = '500 13px "Inter", -apple-system, sans-serif';
    ctx.fillText(`CREATOR: ${station.dc_creator}`.slice(0, 68), 56, 512);
  }

  // Divider rule before archival citation
  ctx.strokeStyle = "rgba(22, 22, 22, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(56, 532);
  ctx.lineTo(584, 532);
  ctx.stroke();

  // Citation footer
  ctx.fillStyle = "rgba(22, 22, 22, 0.72)";
  ctx.font = '400 12.5px "Inter", -apple-system, sans-serif';
  const citeLines = wrapCanvasLines(ctx, `Citation: ${station.citation}`, 524, 2);
  citeLines.forEach((line, idx) => {
    ctx.fillText(line, 56, 556 + idx * 18);
  });

  return canvas;
}

/**
 * SOURCE OF TRUTH KEYWORDS: resolveArchivalMediaUrl, /api/image-proxy, CORS scan URL
 * WHAT: Routes external HTTP/HTTPS archival image URLs through the Next.js same-origin image proxy.
 * WHY: Allows WebGL CanvasTexture (which requires crossOrigin="anonymous") and modal <img> tags to load external holding institution scans without CORS failures.
 * WHERE: createStationScanTexture, createArchPreviewTexture, and BccnsArchiveExperience.
 */
export function resolveArchivalMediaUrl(mediaUrl: string | null | undefined): string | null {
  if (!mediaUrl) return null;
  const trimmed = mediaUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) return trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return `/api/image-proxy?url=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}

/**
 * SOURCE OF TRUTH KEYWORDS: createStationScanTexture, natural scan color, no recolor
 * WHAT: Creates a Three.js CanvasTexture for an archival station and overlays the original scan in its own natural color if media_url loads.
 * WHY: "Paper, ink, newsprint, and maps keep their own color. Do not recolor a scan to match the palette. Images that fail show the title and citation, not a broken frame."
 * WHERE: buildMuseumRoomScene and loadHallTextures.
 */
export function createStationScanTexture(
  station: ArchiveStation,
  index: number,
  washHex = "#C4782A",
): THREE.CanvasTexture {
  const canvas = renderArchivalDocumentCanvas(station, index, washHex);
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const proxiedUrl = resolveArchivalMediaUrl(station.media_url);
  if (!proxiedUrl) {
    console.warn(
      `[BccnsArchive] No media_url for station "${station.dc_title}" (${station.id}): scan texture will show text only`,
    );
  }
  if (proxiedUrl && ctx && typeof Image !== "undefined") {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // Warm paper mount (#F3EEE6) so the archival scan keeps its natural color
      ctx.fillStyle = "#F3EEE6";
      ctx.fillRect(0, 0, 640, 640);

      // Subtle hairline outer border and top collection accent rule
      ctx.strokeStyle = "rgba(22, 22, 22, 0.22)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(16, 16, 608, 608);

      ctx.fillStyle = washHex;
      ctx.fillRect(16, 16, 608, 4);

      // Inner recessed mat for the scan
      const pad = 28;
      const availW = 640 - pad * 2;
      const availH = 496;
      ctx.fillStyle = "#EAE2D3";
      ctx.fillRect(pad, pad, availW, availH);

      const scale = Math.min(
        (availW - 16) / Math.max(1, img.width),
        (availH - 16) / Math.max(1, img.height),
      );
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const offsetX = (640 - drawW) * 0.5;
      const offsetY = pad + (availH - drawH) * 0.5;

      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

      ctx.strokeStyle = "rgba(22, 22, 22, 0.14)";
      ctx.lineWidth = 1;
      ctx.strokeRect(offsetX, offsetY, drawW, drawH);

      // Caption strip at bottom of paper mount
      ctx.fillStyle = "#C4782A";
      ctx.font = '600 12px "Inter", -apple-system, sans-serif';
      ctx.textAlign = "left";
      ctx.fillText(
        `${station.display_year.toUpperCase()}  ·  ${station.dc_publisher.toUpperCase()}`.slice(
          0,
          64,
        ),
        28,
        552,
      );

      ctx.fillStyle = "#161616";
      ctx.font = '500 22px "Cormorant Garamond", Georgia, serif';
      const titleLines = wrapCanvasLines(ctx, station.dc_title, 580, 2);
      titleLines.forEach((line, lineIdx) => {
        ctx.fillText(line, 28, 580 + lineIdx * 24);
      });

      tex.needsUpdate = true;
    };
    img.onerror = () => {
      console.warn(
        `[BccnsArchive] Failed to load archival scan for station "${station.dc_title}" (${station.id}): ${proxiedUrl}`,
      );
      // Keep the already rendered title + citation canvas intact
    };
    img.src = proxiedUrl;
  }

  return tex;
}

/**
 * SOURCE OF TRUTH KEYWORDS: createArchPreviewTexture, rotunda archway image, parallax scan texture
 * WHAT: Creates a high-presence archway preview texture for each collection portal in the rotunda.
 * WHY: Ensures the archival scan inside the archway fills the arched opening cleanly for the parallax and hover shader.
 * WHERE: loadHallTextures.
 */
export function createArchPreviewTexture(
  station: ArchiveStation,
  washHex = "#C4782A",
): THREE.CanvasTexture {
  const canvas = renderArchivalDocumentCanvas(station, 0, washHex);
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const proxiedUrl = resolveArchivalMediaUrl(station.media_url);
  if (proxiedUrl && ctx && typeof Image !== "undefined") {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.fillStyle = "#EFE8DA";
      ctx.fillRect(0, 0, 640, 640);

      // Cover-fit with generous margin so horizontal parallax shift never exposes empty edges
      const targetW = 560;
      const targetH = 560;
      const scale = Math.max(
        targetW / Math.max(1, img.width),
        targetH / Math.max(1, img.height),
      );
      const drawW = Math.min(600, img.width * scale);
      const drawH = Math.min(600, img.height * scale);
      const offsetX = (640 - drawW) * 0.5;
      const offsetY = (640 - drawH) * 0.5;

      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

      // Subtle warm vignette around edges to blend naturally into the archway depth
      const radGrad = ctx.createRadialGradient(320, 320, 170, 320, 320, 340);
      radGrad.addColorStop(0, "rgba(243, 238, 230, 0.0)");
      radGrad.addColorStop(1, "rgba(235, 227, 213, 0.42)");
      ctx.fillStyle = radGrad;
      ctx.fillRect(0, 0, 640, 640);

      tex.needsUpdate = true;
    };
    img.src = proxiedUrl;
    img.onerror = () => {
      // Keep the already rendered title + citation canvas intact; image scan unavailable
    };
  }

  return tex;
}

/**
 * SOURCE OF TRUTH KEYWORDS: createArchTitleBannerTexture, high-contrast serif, rotunda arch title
 * WHAT: Renders a crisp serif title and date banner above each rotunda portal arch.
 * WHY: Replaces the old social-media sprite sheet with BCCNS collection titles in ink (#161616) and gold (#C9892D).
 * WHERE: buildProceduralHallScene and buildMuseumRoomScene.
 */
function createArchTitleBannerTexture(
  title: string,
  years: string,
  accentHex = "#C4782A",
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, 1024, 256);

    ctx.fillStyle = accentHex;
    ctx.font = '600 22px "Inter", -apple-system, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(years.toUpperCase(), 512, 54);

    // Subtle hairline rule beneath year
    ctx.fillStyle = "rgba(22, 22, 22, 0.2)";
    ctx.fillRect(452, 78, 120, 1.5);

    ctx.fillStyle = "#161616";
    ctx.font = '600 50px "Cormorant Garamond", Georgia, serif';
    const lines = wrapCanvasLines(ctx, title, 920, 2);
    if (lines.length === 1) {
      ctx.fillText(lines[0], 512, 142);
    } else {
      lines.forEach((line, i) => {
        ctx.fillText(line, 512, 120 + i * 52);
      });
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * SOURCE OF TRUTH KEYWORDS: loadHallTextures, warm plaster, noise_texture, previewsByCollection
 * WHAT: Loads the shared floor, platform, and noise textures plus an archival scan preview for each of the 6 collections.
 * WHY: Ensures every rotunda arch holds an authentic archival scan from that collection, never a synthetic illustration.
 * WHERE: bccns-archive-experience.tsx initialization.
 */
export async function loadHallTextures(
  textureLoader: THREE.TextureLoader,
  collections: ArchiveCollection[],
  assetsBase = "/assets",
): Promise<LoadedHallTextures> {
  const loadTex = (file: string, flipY = false): Promise<THREE.Texture | null> =>
    new Promise((resolve) => {
      textureLoader.load(
        `${assetsBase}/${file}`,
        (t) => {
          t.flipY = flipY;
          t.colorSpace = THREE.SRGBColorSpace;
          resolve(t);
        },
        undefined,
        () => resolve(null),
      );
    });

  const [noise, platform, floor] = await Promise.all([
    loadTex("noise_texture.webp", false),
    loadTex("Platform_Diffuse.webp", false),
    loadTex("FloorHall_Diffuse.webp", false),
  ]);

  if (noise) {
    noise.colorSpace = THREE.NoColorSpace;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
  }

  const previewsByCollection: Partial<Record<CollectionKey, THREE.Texture | null>> = {};
  for (const cfg of PORTAL_CONFIGS) {
    const col = collections.find((c) => c.key === cfg.collectionKey);
    const stationWithImage =
      col?.stations.find(
        (s) => Boolean(resolveArchivalMediaUrl(s.media_url)),
      ) ?? col?.stations[0];
    if (stationWithImage) {
      previewsByCollection[cfg.collectionKey] = createArchPreviewTexture(
        stationWithImage,
        cfg.washHex,
      );
    } else {
      previewsByCollection[cfg.collectionKey] = platform;
    }
  }

  const rotundaPreview =
    previewsByCollection.slavery_and_halifax ||
    previewsByCollection.black_loyalists ||
    platform;

  return { noise, platform, floor, rotundaPreview, previewsByCollection };
}

function createWallSegmentGeometry(halfW = 5.45): THREE.ExtrudeGeometry {
  const wallH = 12.6142;
  const archHalfW = 1.78;
  const archSpringY = 3.75;

  // Single U-shaped wall profile with open doorway down to y = 0 (prevents any bottom curb clipping)
  const wallShape = new THREE.Shape();
  wallShape.moveTo(-halfW, 0);
  wallShape.lineTo(-archHalfW, 0);
  wallShape.lineTo(-archHalfW, archSpringY);
  wallShape.absarc(0, archSpringY, archHalfW, Math.PI, 0, true);
  wallShape.lineTo(archHalfW, 0);
  wallShape.lineTo(halfW, 0);
  wallShape.lineTo(halfW, wallH);
  wallShape.lineTo(-halfW, wallH);
  wallShape.closePath();

  const geom = new THREE.ExtrudeGeometry(wallShape, {
    depth: 0.48,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.12,
    bevelSegments: 3,
    curveSegments: 32,
  });
  geom.rotateY(-Math.PI / 2);
  geom.translate(0.24, 0, 0);
  geom.computeVertexNormals();
  return geom;
}

function createArchBandGeometry(
  innerR: number,
  outerR: number,
  springY: number,
  depth: number,
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-outerR, 0);
  shape.lineTo(-outerR, springY);
  shape.absarc(0, springY, outerR, Math.PI, 0, true);
  shape.lineTo(outerR, 0);
  shape.lineTo(innerR, 0);
  shape.lineTo(innerR, springY);
  shape.absarc(0, springY, innerR, 0, Math.PI, false);
  shape.lineTo(-innerR, 0);
  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.10,
    bevelSize: 0.10,
    bevelSegments: 3,
    curveSegments: 40,
  });
  geom.rotateY(-Math.PI / 2);
  geom.translate(depth / 2, 0, 0);
  geom.computeVertexNormals();
  return geom;
}

let cachedInnerArchBandGeom: THREE.ExtrudeGeometry | null = null;
let cachedMidArchBandGeom: THREE.ExtrudeGeometry | null = null;
let cachedOuterArchBandGeom: THREE.ExtrudeGeometry | null = null;

/**
 * SOURCE OF TRUTH KEYWORDS: resetGeometryCache, arch band geometry cache
 * WHAT: Clears the module-level cached ExtrudeGeometries used by createGreekArchwayMoldingGroup.
 * WHY: Called before disposing a scene so the cached geometries are not left as disposed (but still
 *      truthy) references, which would cause the next scene build to render with dead WebGL buffers.
 * WHERE: Called by BccnsArchiveExperience before disposing hall or room scene roots.
 */
export function resetGeometryCache(): void {
  cachedInnerArchBandGeom = null;
  cachedMidArchBandGeom = null;
  cachedOuterArchBandGeom = null;
}

/**
 * SOURCE OF TRUTH KEYWORDS: createGreekArchwayMoldingGroup, classical Greek moulding, stepped archivolt, keystone
 * WHAT: Builds a sleek Neoclassical / Greek stepped archway moulding with Attic plinth bases, impost capitals, 3-fascia archivolt, and crown keystone.
 * WHY: Gives both the Rotunda entrance arches and the End-of-Hallway arches identical, refined Greek architectural borders.
 * WHERE: buildProceduralHallScene and buildMuseumRoomScene.
 */
function createGreekArchwayMoldingGroup(
  _accentColor?: number | string,
): THREE.Group {
  if (!cachedInnerArchBandGeom) {
    cachedInnerArchBandGeom = createArchBandGeometry(1.78, 1.805, 3.75, 0.50);
  }
  if (!cachedMidArchBandGeom) {
    cachedMidArchBandGeom = createArchBandGeometry(1.805, 1.88, 3.75, 0.54);
  }
  if (!cachedOuterArchBandGeom) {
    cachedOuterArchBandGeom = createArchBandGeometry(1.88, 1.925, 3.75, 0.58);
  }

  const group = new THREE.Group();

  // Single uniform limestone material — no contrasting border/trim colors on any arch part.
  const limestoneMat = new THREE.MeshStandardMaterial({
    color: 0xede5d6,
    emissive: 0xd8cebc,
    emissiveIntensity: 0.12,
    roughness: 0.55,
    metalness: 0.05,
  });

  // 1. Three-stepped Greek archivolt bands — all uniform limestone, no accent borders
  group.add(new THREE.Mesh(cachedInnerArchBandGeom, limestoneMat));
  group.add(new THREE.Mesh(cachedMidArchBandGeom, limestoneMat));
  group.add(new THREE.Mesh(cachedOuterArchBandGeom, limestoneMat));

  // 2. Stepped Attic plinth bases (y = 0..0.34) and Doric/Ionic impost capitals at springline (y = 3.75)
  const plinthLowerGeom = new THREE.BoxGeometry(0.64, 0.18, 0.24);
  const plinthUpperGeom = new THREE.BoxGeometry(0.60, 0.14, 0.20);
  const impostCapGeom = new THREE.BoxGeometry(0.64, 0.11, 0.25);
  const impostNeckGeom = new THREE.BoxGeometry(0.60, 0.05, 0.21);

  for (const side of [-1, 1]) {
    // Each piece starts exactly at the arch opening edge (1.78) so nothing intrudes into the doorway
    const openingEdge = 1.78;

    const baseLower = new THREE.Mesh(plinthLowerGeom, limestoneMat);
    baseLower.position.set(0, 0.09, side * (openingEdge + 0.12));
    group.add(baseLower);

    const baseUpper = new THREE.Mesh(plinthUpperGeom, limestoneMat);
    baseUpper.position.set(0, 0.25, side * (openingEdge + 0.10));
    group.add(baseUpper);

    const impostCap = new THREE.Mesh(impostCapGeom, limestoneMat);
    impostCap.position.set(0, 3.75, side * (openingEdge + 0.125));
    group.add(impostCap);

    const impostNeck = new THREE.Mesh(impostNeckGeom, limestoneMat);
    impostNeck.position.set(0, 3.66, side * (openingEdge + 0.105));
    group.add(impostNeck);
  }

  // 3. Classical Crown Keystone at top of the arch (y = 5.56)
  const keystoneGeom = new THREE.BoxGeometry(0.64, 0.32, 0.24);
  const keystoneMesh = new THREE.Mesh(keystoneGeom, limestoneMat);
  keystoneMesh.position.set(0, 5.56, 0);
  group.add(keystoneMesh);

  const keystoneAccentGeom = new THREE.BoxGeometry(0.66, 0.22, 0.06);
  const keystoneAccent = new THREE.Mesh(keystoneAccentGeom, limestoneMat);
  keystoneAccent.position.set(0, 5.56, 0);
  group.add(keystoneAccent);

  return group;
}

function createPlatformGeometry(): THREE.LatheGeometry {
  const points = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(4.01, 0.0),
    new THREE.Vector2(4.01, 0.036),
    new THREE.Vector2(4.005, 0.04),
    new THREE.Vector2(0.0, 0.04),
  ];
  const geom = new THREE.LatheGeometry(points, 72);
  const pos = geom.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    uvs[i * 2] = x / 8.02 + 0.5;
    uvs[i * 2 + 1] = z / 8.02 + 0.5;
  }
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
}

function createFloorGeometry(): THREE.CircleGeometry {
  const geom = new THREE.CircleGeometry(12.5, 72);
  geom.rotateX(-Math.PI / 2);
  const pos = geom.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uvs[i * 2] = pos.getX(i) / 25.0 + 0.5;
    uvs[i * 2 + 1] = pos.getZ(i) / 25.0 + 0.5;
  }
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  return geom;
}

function createBannerQuadGeometry(): THREE.PlaneGeometry {
  return new THREE.PlaneGeometry(4.6, 1.15);
}

/**
 * SOURCE OF TRUTH KEYWORDS: buildProceduralHallScene, 6 portals, warm plaster rotunda
 * WHAT: Builds the 6-portal warm-plaster BCCNS rotunda hall in the Centre's own order (60° spacing).
 * WHY: "One hall portal = one collection or historical chapter, in the Centre's own order... The colonnade is warm plaster and soft daylight, with a pale reflective floor and a light atmospheric fog."
 * WHERE: bccns-archive-experience.tsx.
 */
export function buildProceduralHallScene(
  textures: LoadedHallTextures,
  portals: PortalConfig[] = PORTAL_CONFIGS,
): THREE.Group {
  const root = new THREE.Group();
  root.name = "BCCNS_Rotunda_Hall";

  const rot20 = new THREE.Quaternion(0, 0.1736481785774231, 0, 0.9848077297210693);

  const wallMat = new THREE.MeshLambertMaterial({
    color: 0xf3eee6,
    emissive: 0xe9e0d1,
    emissiveIntensity: 0.14,
    side: THREE.DoubleSide,
  });

  const platformMat = new THREE.MeshStandardMaterial({
    color: 0xf3eee6,
    map: textures.platform || null,
    roughness: 0.35,
    metalness: 0.04,
  });

  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xf0e9dd,
    map: textures.floor || null,
    emissive: new THREE.Color(0xf3eee6),
    emissiveIntensity: 0.06,
    roughness: 0.85,
    metalness: 0.0,
  });

  const platformMesh = new THREE.Mesh(createPlatformGeometry(), platformMat);
  platformMesh.name = "PlatformHall";
  platformMesh.quaternion.copy(rot20);
  root.add(platformMesh);

  // Subtle copper-ochre ring inlaid on the central dais
  const ringGeom = new THREE.RingGeometry(3.92, 4.01, 72);
  ringGeom.rotateX(-Math.PI / 2);
  const ringMesh = new THREE.Mesh(
    ringGeom,
    new THREE.MeshBasicMaterial({ color: 0xc4782a, side: THREE.DoubleSide }),
  );
  ringMesh.position.set(0, 0.043, 0);
  root.add(ringMesh);

  const floorMesh = new THREE.Mesh(createFloorGeometry(), floorMat);
  floorMesh.name = "FloorHall";
  floorMesh.quaternion.copy(rot20);
  root.add(floorMesh);

  const reflectorAnchor = new THREE.Object3D();
  reflectorAnchor.name = "reflector";
  reflectorAnchor.position.set(-9.396925926208496, 0.015, 3.420201539993286);
  reflectorAnchor.quaternion.copy(rot20);
  root.add(reflectorAnchor);

  const wallGeom = createWallSegmentGeometry(5.65);
  const bannerGeom = createBannerQuadGeometry();
  const previewGeom = new THREE.PlaneGeometry(3.64, 5.56, 20, 20);
  // Translate by half height so bottom sits at y = 0.0, matching createPortalEnergyField 1:1
  previewGeom.translate(0, 5.56 * 0.5, 0);

  const wallRadius = 9.85;
  const glowRadius = 9.82;
  const textRadius = 9.48;
  const previewRadius = 10.12;

  portals.forEach((cfg, idx) => {
    const theta = THREE.MathUtils.degToRad(cfg.angleDeg);
    const dirX = -Math.sin(theta);
    const dirZ = -Math.cos(theta);
    const wallRotY = theta - Math.PI / 2;

    const wallMesh = new THREE.Mesh(wallGeom, wallMat);
    wallMesh.name = `WallsHall_${idx}`;
    wallMesh.position.set(dirX * wallRadius, 0, dirZ * wallRadius);
    wallMesh.rotation.set(0, wallRotY, 0);
    root.add(wallMesh);

    const portalAnchor = new THREE.Object3D();
    portalAnchor.name = cfg.portalNode;
    portalAnchor.position.set(dirX * wallRadius, 0, dirZ * wallRadius);
    portalAnchor.rotation.set(0, theta + Math.PI / 2, 0);
    portalAnchor.scale.set(1, 1, 1);
    root.add(portalAnchor);

    const glowGroup = createGreekArchwayMoldingGroup(cfg.washHex);
    glowGroup.name = cfg.glowNode;
    glowGroup.position.set(dirX * glowRadius, 0, dirZ * glowRadius);
    glowGroup.rotation.set(0, wallRotY, 0);
    root.add(glowGroup);

    const textMesh = new THREE.Mesh(
      bannerGeom,
      new THREE.MeshBasicMaterial({
        map: createArchTitleBannerTexture(cfg.title, cfg.years, cfg.washHex),
        transparent: true,
        side: THREE.DoubleSide,
      }),
    );
    textMesh.name = cfg.textNode;
    textMesh.position.set(dirX * textRadius, 6.26, dirZ * textRadius);
    // Rotate by theta so the PlaneGeometry (+Z front normal) faces inward toward the camera unflipped
    textMesh.rotation.set(0, theta, 0);
    root.add(textMesh);

    const previewMesh = new THREE.Mesh(
      previewGeom,
      new THREE.MeshBasicMaterial({
        map: textures.previewsByCollection[cfg.collectionKey] || textures.platform,
      }),
    );
    previewMesh.name = cfg.previewNode;
    previewMesh.position.set(dirX * previewRadius, 0, dirZ * previewRadius);
    previewMesh.rotation.set(0, theta, 0);
    root.add(previewMesh);
  });

  const viewNode = new THREE.Object3D();
  viewNode.name = "View";
  viewNode.position.set(0, 2.6, 0);

  const camera = new THREE.PerspectiveCamera(
    THREE.MathUtils.radToDeg(0.5483113556160755),
    typeof window !== "undefined" ? window.innerWidth / window.innerHeight : 1.6,
    0.1,
    34,
  );
  camera.name = "Camera";
  camera.position.set(0, 0, 4.5);
  viewNode.add(camera);
  root.add(viewNode);

  return root;
}

/**
 * SOURCE OF TRUTH KEYWORDS: createContactShadowTexture, soft contact shadow, colonnade station
 * WHAT: Generates a soft elliptical contact shadow texture placed on the colonnade floor beneath each archival record.
 * WHY: "Do not frame it in a heavy card. A record sits in the colonnade with a soft contact shadow and opens onto paper."
 * WHERE: buildMuseumRoomScene.
 */
function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 64, 8, 128, 64, 108);
    grad.addColorStop(0, "rgba(22, 22, 22, 0.24)");
    grad.addColorStop(0.55, "rgba(22, 22, 22, 0.08)");
    grad.addColorStop(1, "rgba(22, 22, 22, 0.0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * SOURCE OF TRUTH KEYWORDS: createTwinArchEndWallGeometry, end of hallway arches, portal_1, portal_2
 * WHAT: Builds the precision twin-arch end wall at x = portalWallX with two open semicircular archways at Z = -2.35 and Z = +2.35 matching the Rotunda arch dimensions.
 * WHY: Guarantees the end-of-hallway arches, Greek mouldings, preview images, and FBM portal energy overlays match the Rotunda entrance arches 1:1.
 * WHERE: buildMuseumRoomScene.
 */
function createTwinArchEndWallGeometry(): THREE.ExtrudeGeometry {
  const halfW = 6.2;
  const wallH = 11.2;
  const archHalfW = 1.78;
  const archSpringY = 3.75;
  const leftArchZ = -2.35;
  const rightArchZ = 2.35;

  const shape = new THREE.Shape();
  shape.moveTo(-halfW, 0);
  // Left arch opening centered at leftArchZ (-2.35)
  shape.lineTo(leftArchZ - archHalfW, 0);
  shape.lineTo(leftArchZ - archHalfW, archSpringY);
  shape.absarc(leftArchZ, archSpringY, archHalfW, Math.PI, 0, true);
  shape.lineTo(leftArchZ + archHalfW, 0);

  // Center pier between left and right arches
  shape.lineTo(rightArchZ - archHalfW, 0);
  shape.lineTo(rightArchZ - archHalfW, archSpringY);
  shape.absarc(rightArchZ, archSpringY, archHalfW, Math.PI, 0, true);
  shape.lineTo(rightArchZ + archHalfW, 0);

  // Outer perimeter of end wall
  shape.lineTo(halfW, 0);
  shape.lineTo(halfW, wallH);
  shape.lineTo(-halfW, wallH);
  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.48,
    bevelEnabled: false,
    curveSegments: 40,
  });
  // Rotate so shape X maps to world +Z and extrude depth runs along +X
  geom.rotateY(-Math.PI / 2);
  geom.translate(0.24, 0, 0);
  geom.computeVertexNormals();
  return geom;
}

/**
 * SOURCE OF TRUTH KEYWORDS: createMuseumWallPlaqueTexture, station curatorial plaque, wall label
 * WHAT: Renders a dark-ink and gold museum curatorial wall plaque mounted beside each framed archival station.
 * WHY: Grounds each hanging picture frame in an authentic museum gallery wall installation.
 * WHERE: buildMuseumRoomScene.
 */
function createMuseumWallPlaqueTexture(
  station: ArchiveStation,
  index: number,
  washHex: string,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#1E1A17";
    ctx.fillRect(0, 0, 512, 192);

    ctx.strokeStyle = "#C4782A";
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, 496, 176);

    ctx.fillStyle = washHex;
    ctx.fillRect(24, 24, 52, 3);

    ctx.fillStyle = "#C9892D";
    ctx.font = '600 13px "Inter", -apple-system, sans-serif';
    ctx.textAlign = "left";
    ctx.fillText(
      `STATION 0${index + 1}  ·  ${station.display_year.toUpperCase()}`,
      24,
      48,
    );

    ctx.fillStyle = "#F3EEE6";
    ctx.font = '500 22px "Cormorant Garamond", Georgia, serif';
    const lines = wrapCanvasLines(ctx, station.dc_title, 460, 2);
    lines.forEach((line, idx) => {
      ctx.fillText(line, 24, 82 + idx * 26);
    });

    ctx.fillStyle = "rgba(243, 238, 230, 0.72)";
    ctx.font = '500 12px "Inter", -apple-system, sans-serif';
    ctx.fillText(station.dc_publisher.toUpperCase().slice(0, 48), 24, 158);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface BuildMuseumRoomOptions {
  collection: ArchiveCollection;
  allCollections: ArchiveCollection[];
  roomLimits: RoomLimitConfig;
  portalTheme: RoomPortalTheme;
  textures: LoadedHallTextures;
  gltfLoader: GLTFLoader;
  assetsBase?: string;
}

/**
 * SOURCE OF TRUTH KEYWORDS: buildMuseumRoomScene, museum picture frames, gallery walls, end of hallway arches
 * WHAT: Builds the 3D archival exhibition gallery for any of the 6 BCCNS historical chapters.
 * WHY: Replaces open side arches with architectural museum gallery walls and hanging 3D picture frames with overhead picture lights, plaques, and twin end-of-hallway chapter portals.
 * WHERE: transitionToCollectionRoom in bccns-archive-experience.tsx.
 */
export async function buildMuseumRoomScene({
  collection,
  allCollections,
  roomLimits,
  portalTheme,
  textures,
}: BuildMuseumRoomOptions): Promise<MuseumRoomBuildResult> {
  const root = new THREE.Group();
  root.name = `BCCNS_Gallery_${collection.key}`;

  const minX = roomLimits.min[0];
  const maxX = roomLimits.max[0];
  const portalWallX = maxX + 8.829;
  const startWallX = minX - 4.2;
  const corridorLen = portalWallX - startWallX;
  const corridorCenterX = (startWallX + portalWallX) * 0.5;
  const wallZ = 4.35;

  // Materials — Warm plaster walls (#F3EEE6), deep bronze-walnut architectural trim (#26201B), copper ochre (#C4782A)
  const wallMat = new THREE.MeshLambertMaterial({
    color: 0xf3eee6,
    emissive: 0xeae1d3,
    emissiveIntensity: 0.16,
    side: THREE.DoubleSide,
  });

  const recessedBayMat = new THREE.MeshLambertMaterial({
    color: 0xebe3d5,
    emissive: 0xe2d8c7,
    emissiveIntensity: 0.12,
  });

  const plinthMat = new THREE.MeshStandardMaterial({
    color: 0x241e1a,
    roughness: 0.65,
    metalness: 0.08,
  });

  const frameOuterMat = new THREE.MeshStandardMaterial({
    color: 0x261f1a,
    roughness: 0.42,
    metalness: 0.18,
  });

  const ochreTrimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(collection.washHex || "#C4782A"),
    roughness: 0.35,
    metalness: 0.32,
  });

  const goldTrimMat = new THREE.MeshStandardMaterial({
    color: 0xc9892d,
    roughness: 0.32,
    metalness: 0.42,
  });

  const paperBackingMat = new THREE.MeshBasicMaterial({
    color: 0xf3eee6,
  });

  const floorMat = new THREE.MeshBasicMaterial({
    color: 0xf1ebe0,
    map: textures.floor || null,
    side: THREE.DoubleSide,
  });

  // 1. Corridor Floor & Central Exhibition Runner Border
  const floorGeom = new THREE.PlaneGeometry(corridorLen + 14, 14);
  floorGeom.rotateX(-Math.PI / 2);
  const floorMesh = new THREE.Mesh(floorGeom, floorMat);
  floorMesh.name = "Floor";
  floorMesh.position.set(corridorCenterX, 0, 0);
  root.add(floorMesh);

  // Subtle inlaid copper-ochre floor guide lines along both sides of the walk
  const floorRuleGeom = new THREE.PlaneGeometry(corridorLen, 0.045);
  floorRuleGeom.rotateX(-Math.PI / 2);
  const leftFloorRule = new THREE.Mesh(floorRuleGeom, ochreTrimMat);
  leftFloorRule.position.set(corridorCenterX, 0.008, -2.85);
  root.add(leftFloorRule);
  const rightFloorRule = new THREE.Mesh(floorRuleGeom, ochreTrimMat);
  rightFloorRule.position.set(corridorCenterX, 0.008, 2.85);
  root.add(rightFloorRule);

  // 2. Solid Architectural Museum Gallery Walls (replacing open side arches)
  const sideWallGeom = new THREE.BoxGeometry(corridorLen, 8.8, 0.36);
  const leftWall = new THREE.Mesh(sideWallGeom, wallMat);
  leftWall.position.set(corridorCenterX, 4.4, -wallZ);
  root.add(leftWall);

  const rightWall = new THREE.Mesh(sideWallGeom, wallMat);
  rightWall.position.set(corridorCenterX, 4.4, wallZ);
  root.add(rightWall);

  // Baseboard plinths, dado rails, and upper picture-hanging rails along both gallery walls
  const baseboardGeom = new THREE.BoxGeometry(corridorLen, 0.34, 0.44);
  const dadoGeom = new THREE.BoxGeometry(corridorLen, 0.06, 0.42);
  const pictureRailGeom = new THREE.BoxGeometry(corridorLen, 0.09, 0.46);
  const corniceGeom = new THREE.BoxGeometry(corridorLen, 0.28, 0.54);

  for (const side of [-1, 1]) {
    const zBase = side * (wallZ - 0.04);
    const baseboard = new THREE.Mesh(baseboardGeom, plinthMat);
    baseboard.position.set(corridorCenterX, 0.17, zBase);
    root.add(baseboard);

    const dado = new THREE.Mesh(dadoGeom, ochreTrimMat);
    dado.position.set(corridorCenterX, 0.96, zBase);
    root.add(dado);

    const picRail = new THREE.Mesh(pictureRailGeom, plinthMat);
    picRail.position.set(corridorCenterX, 5.25, zBase);
    root.add(picRail);

    const cornice = new THREE.Mesh(corniceGeom, wallMat);
    cornice.position.set(corridorCenterX, 6.45, zBase);
    root.add(cornice);
  }

  // Coffered Gallery Ceiling & Warm Daylight Skylight Strip
  const ceilingBeamStride = 7.2;
  const numCeilingBeams = Math.ceil(corridorLen / ceilingBeamStride) + 1;
  const crossBeamGeom = new THREE.BoxGeometry(0.38, 0.34, wallZ * 2 + 0.4);
  const pilasterGeom = new THREE.BoxGeometry(0.42, 6.45, 0.22);
  const pilasterBaseGeom = new THREE.BoxGeometry(0.5, 0.42, 0.28);

  for (let i = 0; i < numCeilingBeams; i++) {
    const bx = startWallX + i * ceilingBeamStride;
    if (bx > portalWallX - 1.2) break;

    const beam = new THREE.Mesh(crossBeamGeom, wallMat);
    beam.position.set(bx, 6.55, 0);
    root.add(beam);

    // Architectural pilasters dividing the gallery walls into rhythmic exhibition bays
    for (const side of [-1, 1]) {
      const pilaster = new THREE.Mesh(pilasterGeom, recessedBayMat);
      pilaster.position.set(bx, 3.225, side * (wallZ - 0.12));
      root.add(pilaster);

      const pilasterBase = new THREE.Mesh(pilasterBaseGeom, plinthMat);
      pilasterBase.position.set(bx, 0.21, side * (wallZ - 0.12));
      root.add(pilasterBase);
    }
  }

  // Back Entry Wall behind camera start
  const backWallGeom = new THREE.BoxGeometry(0.4, 9.0, wallZ * 2 + 1.0);
  const backWall = new THREE.Mesh(backWallGeom, wallMat);
  backWall.position.set(startWallX, 4.5, 0);
  root.add(backWall);

  // 3. End-of-Hallway Twin Arch Portals Wall (portal_1 -> next collection, portal_2 -> previous collection / rotunda)
  const endWallMesh = new THREE.Mesh(createTwinArchEndWallGeometry(), wallMat);
  endWallMesh.name = "EndPortalWall";
  endWallMesh.position.set(portalWallX, 0, 0);
  root.add(endWallMesh);

  // Dark recessed backing chamber behind the twin arches so portal previews never bleed into fog
  const chamberBackGeom = new THREE.PlaneGeometry(11.6, 7.2);
  chamberBackGeom.rotateY(-Math.PI / 2);
  const chamberBackMesh = new THREE.Mesh(
    chamberBackGeom,
    new THREE.MeshBasicMaterial({ color: 0x1a1715 }),
  );
  chamberBackMesh.position.set(portalWallX + 0.72, 3.4, 0);
  root.add(chamberBackMesh);

  const rightArchZ = 2.35;
  const leftArchZ = -2.35;

  const portal1Anchor = new THREE.Object3D();
  portal1Anchor.name = "portal_1";
  portal1Anchor.position.set(portalWallX - 0.02, 0, rightArchZ);
  root.add(portal1Anchor);

  const portal2Anchor = new THREE.Object3D();
  portal2Anchor.name = "portal_2";
  portal2Anchor.position.set(portalWallX - 0.02, 0, leftArchZ);
  root.add(portal2Anchor);

  const portal1Glow = createGreekArchwayMoldingGroup(portalTheme.portal1Color);
  portal1Glow.name = "portal_1_glow";
  portal1Glow.position.set(portalWallX - 0.04, 0, rightArchZ);
  // Orient the Greek archway molding to face inward toward the gallery,
  // matching the rotunda entrance arch orientation (rotation.set(0, wallRotY, 0)).
  portal1Glow.rotation.set(0, Math.PI, 0);
  root.add(portal1Glow);

  const portal2Glow = createGreekArchwayMoldingGroup(portalTheme.portal2Color);
  portal2Glow.name = "portal_2_glow";
  portal2Glow.position.set(portalWallX - 0.04, 0, leftArchZ);
  portal2Glow.rotation.set(0, Math.PI, 0);
  root.add(portal2Glow);

  // Archival preview image planes positioned flush inside both end-of-hallway arches (matching Rotunda arch preview geometry)
  const previewPlaneGeom = new THREE.PlaneGeometry(3.64, 5.56, 20, 20);
  previewPlaneGeom.translate(0, 5.56 * 0.5, 0);
  previewPlaneGeom.rotateY(-Math.PI / 2);

  const nextKey = portalTheme.nextCollection;
  const prevKey = portalTheme.prevCollection;

  const nextColObj =
    nextKey !== "hall" ? allCollections.find((c) => c.key === nextKey) : undefined;
  const prevColObj =
    prevKey !== "hall" ? allCollections.find((c) => c.key === prevKey) : undefined;

  const fallbackArchTex =
    textures.rotundaPreview ||
    textures.previewsByCollection[collection.key] ||
    textures.platform;

  const previewNextTex =
    nextKey !== "hall"
      ? textures.previewsByCollection[nextKey] || fallbackArchTex
      : fallbackArchTex;
  const previewPrevTex =
    prevKey !== "hall"
      ? textures.previewsByCollection[prevKey] || fallbackArchTex
      : fallbackArchTex;

  const previewNextMesh = new THREE.Mesh(
    previewPlaneGeom,
    new THREE.MeshBasicMaterial({
      map: previewNextTex || null,
      side: THREE.DoubleSide,
    }),
  );
  previewNextMesh.name = `portal_preview_${nextKey}`;
  previewNextMesh.position.set(portalWallX + 0.27, 0, rightArchZ);
  previewNextMesh.userData.targetCollection = nextKey;
  root.add(previewNextMesh);

  const previewPrevMesh = new THREE.Mesh(
    previewPlaneGeom,
    new THREE.MeshBasicMaterial({
      map: previewPrevTex || null,
      side: THREE.DoubleSide,
    }),
  );
  previewPrevMesh.name = `portal_preview_${prevKey}`;
  previewPrevMesh.position.set(portalWallX + 0.27, 0, leftArchZ);
  previewPrevMesh.userData.targetCollection = prevKey;
  root.add(previewPrevMesh);

  // Unflipped serif chapter banners mounted directly above each end-of-hallway arch
  const labelGeom = new THREE.PlaneGeometry(3.8, 0.96);
  labelGeom.rotateY(-Math.PI / 2);

  const nextLabel = nextColObj ? nextColObj.title : "Centre Rotunda";
  const nextYears = nextColObj ? `NEXT · ${nextColObj.period}` : "RETURN · ALL 6 HALLS";
  const prevLabel = prevColObj ? prevColObj.title : "Centre Rotunda";
  const prevYears = prevColObj ? `PREVIOUS · ${prevColObj.period}` : "RETURN · ALL 6 HALLS";

  const text1 = new THREE.Mesh(
    labelGeom,
    new THREE.MeshBasicMaterial({
      map: createArchTitleBannerTexture(nextLabel, nextYears, portalTheme.portal1Color),
      transparent: true,
      side: THREE.DoubleSide,
    }),
  );
  text1.name = "portal_text_1";
  text1.position.set(portalWallX - 0.16, 6.26, rightArchZ);
  root.add(text1);

  const text2 = new THREE.Mesh(
    labelGeom,
    new THREE.MeshBasicMaterial({
      map: createArchTitleBannerTexture(prevLabel, prevYears, portalTheme.portal2Color),
      transparent: true,
      side: THREE.DoubleSide,
    }),
  );
  text2.name = "portal_text_2";
  text2.position.set(portalWallX - 0.16, 6.26, leftArchZ);
  root.add(text2);

  // 4. Dual Leapfrogging Reflector Anchors
  const reflector01 = new THREE.Object3D();
  reflector01.name = "reflector_01";
  reflector01.position.set(-51.3, 0.03, 0);
  root.add(reflector01);

  const reflector02 = new THREE.Object3D();
  reflector02.name = "reflector_02";
  reflector02.position.set(-25.3, 0.03, 0);
  root.add(reflector02);

  // 5. Framed Archival Stations Hanging on the Museum Gallery Walls
  const stations = collection.stations || [];
  const firstPicX = -44.6;
  const lastPicX = maxX - 2.4;
  const picStepX =
    stations.length > 1 ? (lastPicX - firstPicX) / (stations.length - 1) : 7.2;

  // Picture canvas geometry in XY plane (+Z front normal), co-aligned with the 3D picture frame
  const picGeom = new THREE.PlaneGeometry(2.54, 2.54, 24, 24);

  // 4-Bar Mitered Museum Picture Frame geometries & recessed mat board (strictly behind z = 0 so picMesh is never occluded)
  const frameHorizBarGeom = new THREE.BoxGeometry(2.92, 0.16, 0.12);
  const frameVertBarGeom = new THREE.BoxGeometry(0.16, 2.60, 0.12);
  const filletHorizBarGeom = new THREE.BoxGeometry(2.64, 0.045, 0.09);
  const filletVertBarGeom = new THREE.BoxGeometry(0.045, 2.55, 0.09);
  const matBoardBoxGeom = new THREE.BoxGeometry(2.62, 2.62, 0.03);
  const hangingRodGeom = new THREE.CylinderGeometry(0.012, 0.012, 2.1, 8);
  const pictureLightBarGeom = new THREE.BoxGeometry(1.35, 0.055, 0.24);
  const pictureLightArmGeom = new THREE.BoxGeometry(0.06, 0.06, 0.36);
  const plaqueGeom = new THREE.PlaneGeometry(0.96, 0.36);

  const shadowGeom = new THREE.PlaneGeometry(3.1, 1.35);
  shadowGeom.rotateX(-Math.PI / 2);
  const shadowTex = createContactShadowTexture();
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
  });

  const pictureMeshes: THREE.Mesh[] = [];
  const pictureXPositions: number[] = [];

  stations.forEach((station, idx) => {
    const isRightSide = idx % 2 === 0;
    const xPos = +(firstPicX + idx * picStepX).toFixed(3);
    const yPos = 2.42;
    const zPos = isRightSide ? 2.86 : -2.86;
    // Tilt each frame ~30 degrees toward the approaching visitor so all scans are clearly visible upon entering the hallway
    const cantAngleY = isRightSide ? Math.PI + 0.52 : -0.52;
    const normalX = Math.sin(cantAngleY);
    const normalZ = Math.cos(cantAngleY);

    const tex = createStationScanTexture(station, idx, collection.washHex);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.DoubleSide,
      fog: true,
    });

    // Place picMesh 0.018m in front of the frame center so it sits cleanly in front of the matBoard (-0.035m) at all times
    const picBaseX = xPos + normalX * 0.018;
    const picBaseZ = zPos + normalZ * 0.018;

    const picMesh = new THREE.Mesh(picGeom, mat);
    picMesh.name = `station_${idx + 1}`;
    picMesh.position.set(picBaseX, yPos, picBaseZ);
    picMesh.rotation.set(0, cantAngleY, 0);
    picMesh.userData.stationData = station;
    picMesh.userData.stationIndex = idx;
    picMesh.userData.baseX = picBaseX;
    picMesh.userData.baseZ = picBaseZ;
    picMesh.userData.normalX = normalX;
    picMesh.userData.normalZ = normalZ;
    picMesh.userData.cantAngleY = cantAngleY;

    root.add(picMesh);
    pictureMeshes.push(picMesh);
    pictureXPositions.push(xPos);

    // 3D Museum Picture Frame & Suspension Hardware co-aligned behind picMesh
    const frameGroup = new THREE.Group();
    frameGroup.position.set(xPos, yPos, zPos);
    frameGroup.rotation.set(0, cantAngleY, 0);
    picMesh.userData.frameGroup = frameGroup;
    frameGroup.userData.baseX = xPos;
    frameGroup.userData.baseZ = zPos;

    // 4-Bar Outer Museum Frame (top, bottom, left, right)
    const topBar = new THREE.Mesh(frameHorizBarGeom, frameOuterMat);
    topBar.position.set(0, 1.38, 0.01);
    frameGroup.add(topBar);

    const bottomBar = new THREE.Mesh(frameHorizBarGeom, frameOuterMat);
    bottomBar.position.set(0, -1.38, 0.01);
    frameGroup.add(bottomBar);

    const leftBar = new THREE.Mesh(frameVertBarGeom, frameOuterMat);
    leftBar.position.set(-1.38, 0, 0.01);
    frameGroup.add(leftBar);

    const rightBar = new THREE.Mesh(frameVertBarGeom, frameOuterMat);
    rightBar.position.set(1.38, 0, 0.01);
    frameGroup.add(rightBar);

    // 4-Bar Inner Copper-Ochre Fillet
    const topFillet = new THREE.Mesh(filletHorizBarGeom, ochreTrimMat);
    topFillet.position.set(0, 1.295, 0.005);
    frameGroup.add(topFillet);

    const bottomFillet = new THREE.Mesh(filletHorizBarGeom, ochreTrimMat);
    bottomFillet.position.set(0, -1.295, 0.005);
    frameGroup.add(bottomFillet);

    const leftFillet = new THREE.Mesh(filletVertBarGeom, ochreTrimMat);
    leftFillet.position.set(-1.295, 0, 0.005);
    frameGroup.add(leftFillet);

    const rightFillet = new THREE.Mesh(filletVertBarGeom, ochreTrimMat);
    rightFillet.position.set(1.295, 0, 0.005);
    frameGroup.add(rightFillet);

    // Recessed warm-paper backing board (z from -0.05 to -0.02, strictly behind picMesh at +0.018)
    const matBoard = new THREE.Mesh(matBoardBoxGeom, paperBackingMat);
    matBoard.position.set(0, 0, -0.035);
    frameGroup.add(matBoard);

    // Two vertical gallery suspension rods rising to the picture rail
    const leftRod = new THREE.Mesh(hangingRodGeom, plinthMat);
    leftRod.position.set(-0.98, 2.25, -0.04);
    frameGroup.add(leftRod);

    const rightRod = new THREE.Mesh(hangingRodGeom, plinthMat);
    rightRod.position.set(0.98, 2.25, -0.04);
    frameGroup.add(rightRod);

    // Overhead museum picture light bar & arm
    const lightBar = new THREE.Mesh(pictureLightBarGeom, goldTrimMat);
    lightBar.position.set(0, 1.58, 0.16);
    frameGroup.add(lightBar);

    const lightArm = new THREE.Mesh(pictureLightArmGeom, plinthMat);
    lightArm.position.set(0, 1.54, 0.0);
    frameGroup.add(lightArm);

    // Museum curatorial wall plaque mounted below the frame
    const plaqueMat = new THREE.MeshBasicMaterial({
      map: createMuseumWallPlaqueTexture(station, idx, collection.washHex),
    });
    const plaqueMesh = new THREE.Mesh(plaqueGeom, plaqueMat);
    plaqueMesh.position.set(0, -1.72, 0.02);
    frameGroup.add(plaqueMesh);

    root.add(frameGroup);

    // Soft contact shadow on the pale reflective floor directly below the framed station
    const shadowMesh = new THREE.Mesh(shadowGeom, shadowMat);
    shadowMesh.position.set(xPos, 0.035, zPos);
    shadowMesh.rotation.y = isRightSide ? -0.52 : 0.52;
    root.add(shadowMesh);
  });

  const roomConfig = computeRoomConfig(pictureXPositions, minX, maxX);

  // 6. Camera View Rig
  const viewNode = new THREE.Object3D();
  viewNode.name = "View";
  viewNode.position.set(minX, 1.8, 0);
  viewNode.rotation.set(0, -Math.PI / 2, 0);

  const camera = new THREE.PerspectiveCamera(
    53.7,
    typeof window !== "undefined" ? window.innerWidth / window.innerHeight : 1.6,
    0.1,
    100,
  );
  camera.name = "Camera";
  camera.position.set(0, 0, 2);
  viewNode.add(camera);
  root.add(viewNode);

  return {
    root,
    viewNode,
    camera,
    pictureMeshes,
    pictureXPositions,
    roomConfig,
    portal1Anchor,
    portal2Anchor,
    portal1Glow,
    portal2Glow,
    previewNextMesh,
    previewPrevMesh,
    reflector01,
    reflector02,
  };
}
