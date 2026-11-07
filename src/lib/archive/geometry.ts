import * as THREE from "three";
import { computeRoomConfig, createFloorLedMaterial, PORTAL_CONFIGS } from "@/src/lib/archive/effects";
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
 * SOURCE OF TRUTH KEYWORDS: paintArchivalScan, contain fit, cover fit, natural scan color
 * WHAT: Paints a loaded archival scan onto the station or arch canvas in its own colors.
 * WHY: The typeset title and citation stay only until a media_url image arrives. The scan itself is the picture.
 * WHERE: createStationScanTexture and createArchPreviewTexture.
 */
function paintArchivalScan(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  fit: "contain" | "cover",
): void {
  const size = 640;
  ctx.fillStyle = "#F3EEE6";
  ctx.fillRect(0, 0, size, size);

  const margin = fit === "contain" ? 16 : 0;
  const avail = size - margin * 2;
  const scale =
    fit === "cover"
      ? Math.max(avail / Math.max(1, img.width), avail / Math.max(1, img.height))
      : Math.min(avail / Math.max(1, img.width), avail / Math.max(1, img.height));
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  ctx.drawImage(img, (size - drawW) * 0.5, (size - drawH) * 0.5, drawW, drawH);
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

// Per-station scan texture cache keyed by station id (+ wash hex so a station
// rendered under a different collection's accent keeps its own canvas). Reusing
// the same CanvasTexture across the rotunda preview and the gallery picture
// frame means one WebGL texture, one canvas, and one image fetch per station.
const stationScanTextureCache = new Map<string, THREE.CanvasTexture>();
const archTitleBannerTextureCache = new Map<string, THREE.CanvasTexture>();

export function createStationScanTexture(
  station: ArchiveStation,
  index: number,
  washHex = "#C4782A",
): THREE.CanvasTexture {
  const cacheKey = `${station.id}|${washHex}`;
  const cached = stationScanTextureCache.get(cacheKey);
  if (cached) return cached;

  const canvas = renderArchivalDocumentCanvas(station, index, washHex);
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 1;

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
      paintArchivalScan(ctx, img, "contain");
      tex.needsUpdate = true;
    };
    img.onerror = () => {
      console.warn(
        `[BccnsArchive] Failed to load archival scan for station "${station.dc_title}" (${station.id}): ${proxiedUrl}`,
      );
    };
    img.src = proxiedUrl;
  }

  stationScanTextureCache.set(cacheKey, tex);
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
      paintArchivalScan(ctx, img, "cover");
      tex.needsUpdate = true;
    };
    img.onerror = () => {
      // Keep the already rendered title + citation canvas intact; image scan unavailable
    };
    img.src = proxiedUrl;
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
  const cacheKey = `${title}|${years}|${accentHex}`;
  const cached = archTitleBannerTextureCache.get(cacheKey);
  if (cached) return cached;

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
  archTitleBannerTextureCache.set(cacheKey, tex);
  return tex;
}

/**
 * SOURCE OF TRUTH KEYWORDS: createStationTitlePlateTexture, gallery caption, Cormorant Garamond, station title
 * WHAT: Paints a warm-paper caption with the record year and a serif title for one hallway board.
 * WHY: Each framed scan needs a readable title on the board itself, set in the archive's serif rather than baked into the picture.
 * WHERE: The museum picture frames in buildMuseumRoomScene.
 */
function createStationTitlePlateTexture(
  title: string,
  year: string,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 350;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    // Same warm paper as the scan canvas (#F3EEE6) so the picture and the title read as one board.
    ctx.fillStyle = "#F3EEE6";
    ctx.fillRect(0, 0, 1024, 350);

    const yearLabel = year.trim().toUpperCase();
    let titleTop = 78;
    if (yearLabel) {
      ctx.fillStyle = "#5C4A3A";
      ctx.font = '600 28px "Inter", -apple-system, sans-serif';
      ctx.textBaseline = "middle";
      const glyphs = Array.from(yearLabel);
      const tracking = 3.2;
      const widths = glyphs.map((glyph) => ctx.measureText(glyph).width);
      const total =
        widths.reduce((sum, width) => sum + width, 0) +
        tracking * Math.max(0, glyphs.length - 1);
      let cursor = (1024 - total) / 2;
      ctx.textAlign = "left";
      glyphs.forEach((glyph, index) => {
        ctx.fillText(glyph, cursor, 58);
        cursor += widths[index] + tracking;
      });
      ctx.fillStyle = "rgba(22, 22, 22, 0.18)";
      ctx.fillRect(412, 92, 200, 2);
      titleTop = 118;
    }

    ctx.fillStyle = "#1A1612";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const sizes = [58, 50, 42, 36];
    let chosenSize = 36;
    let lines: string[] = [];
    const wordCount = title.trim().split(/\s+/).filter(Boolean).length;
    for (const size of sizes) {
      ctx.font = `600 ${size}px "Cormorant Garamond", Georgia, serif`;
      const wrapped = wrapCanvasLines(ctx, title, 920, 3);
      const shown = wrapped.join(" ").split(/\s+/).filter(Boolean).length;
      chosenSize = size;
      lines = wrapped;
      if (shown >= wordCount) break;
    }
    if (lines.join(" ").split(/\s+/).filter(Boolean).length < wordCount && lines.length > 0) {
      const last = lines[lines.length - 1];
      lines[lines.length - 1] = last.length > 1 ? `${last.replace(/\s+\S*$/, "")}…` : `${last}…`;
    }
    const lineHeight = Math.round(chosenSize * 1.14);
    const firstCenter = titleTop + 28 + lineHeight / 2;
    lines.forEach((line, index) => {
      ctx.fillText(line, 512, firstCenter + index * lineHeight);
    });
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * SOURCE OF TRUTH KEYWORDS: createArchSideLabelTexture, rotunda door label, collection subtitle, large serif
 * WHAT: Renders a large left-aligned chapter title, years, and place summary for the rotunda.
 * WHY: The home view reads the chapter beside each door, larger than the old banner above the arch.
 * WHERE: buildProceduralHallScene.
 */
function createArchSideLabelTexture(
  title: string,
  years: string,
  subtitle: string,
  accentHex = "#C4782A",
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1280;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, 1024, 1280);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    ctx.fillStyle = accentHex;
    ctx.font = '600 72px "Inter", -apple-system, sans-serif';
    ctx.fillText(years.toUpperCase(), 36, 110);

    ctx.fillStyle = accentHex;
    ctx.fillRect(36, 146, 340, 7);

    ctx.fillStyle = "#161616";
    ctx.font = '600 92px "Cormorant Garamond", Georgia, serif';
    const titleLines = wrapCanvasLines(ctx, title, 960, 4);
    titleLines.forEach((line, index) => {
      ctx.fillText(line, 36, 260 + index * 104);
    });

    const subtitleTop = 300 + titleLines.length * 104;
    ctx.fillStyle = "rgba(22, 22, 22, 0.82)";
    ctx.font = '500 64px "Cormorant Garamond", Georgia, serif';
    const subtitleLines = wrapCanvasLines(ctx, subtitle, 960, 3);
    subtitleLines.forEach((line, index) => {
      ctx.fillText(line, 36, subtitleTop + index * 78);
    });
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

/**
 * SOURCE OF TRUTH KEYWORDS: createContinuousRotundaWall, seamless plaster, six doorways, one shell
 * WHAT: Builds the rotunda plaster as one circular shell with six arch openings.
 * WHY: Six overlapping wall panels meet on a diagonal and catch the light as seams. One mesh has no joint to shadow.
 * WHERE: buildProceduralHallScene.
 */
function createContinuousRotundaWall(
  radius: number,
  portalAnglesDeg: number[],
): THREE.BufferGeometry {
  const innerR = radius - 0.24;
  const outerR = radius + 0.24;
  const wallH = 12.6142;
  const archHalf = 1.78;
  const spring = 3.75;
  const columns = 360;
  const rows = 22;
  const centers = portalAnglesDeg.map((deg) => THREE.MathUtils.degToRad(deg));

  const openingTop = (phi: number): number => {
    let top = 0;
    for (const center of centers) {
      const dPhi = Math.atan2(Math.sin(phi - center), Math.cos(phi - center));
      const az = Math.abs(dPhi) * radius;
      if (az >= archHalf) continue;
      top = Math.max(top, spring + Math.sqrt(archHalf * archHalf - az * az));
    }
    return top;
  };

  const positions: number[] = [];
  const indices: number[] = [];
  const stride = rows + 1;
  const yAt = (col: number, row: number): number => {
    const phi = (col / columns) * Math.PI * 2;
    const base = openingTop(phi);
    return base + (wallH - base) * (row / rows);
  };
  const vert = (col: number, row: number) => (col % columns) * stride + row;

  for (let col = 0; col < columns; col++) {
    const phi = (col / columns) * Math.PI * 2;
    for (let row = 0; row <= rows; row++) {
      const y = yAt(col, row);
      positions.push(-innerR * Math.sin(phi), y, -innerR * Math.cos(phi));
    }
  }

  for (let col = 0; col < columns; col++) {
    for (let row = 0; row < rows; row++) {
      const a = vert(col, row);
      const b = vert(col + 1, row);
      const d = vert(col, row + 1);
      const e = vert(col + 1, row + 1);
      indices.push(a, e, b, a, d, e);
    }
  }

  const lipStart = positions.length / 3;
  for (let col = 0; col < columns; col++) {
    const phi = (col / columns) * Math.PI * 2;
    const y = yAt(col, 0);
    positions.push(-outerR * Math.sin(phi), y, -outerR * Math.cos(phi));
  }
  for (let col = 0; col < columns; col++) {
    const next = (col + 1) % columns;
    if (yAt(col, 0) <= 0.001 && yAt(next, 0) <= 0.001) continue;
    const innerA = vert(col, 0);
    const innerB = vert(next, 0);
    const outerA = lipStart + col;
    const outerB = lipStart + next;
    indices.push(innerA, innerB, outerB, innerA, outerB, outerA);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * SOURCE OF TRUTH KEYWORDS: curveWallOntoCircle, circular rotunda wall, arc segment
 * WHAT: Bends a flat wall segment so its length lies on a circle of the given radius.
 * WHY: Flat panels meet at corners. Local +X points inward, so arc length in Z becomes a circular outer wall.
 * WHERE: buildProceduralHallScene.
 */
function curveWallOntoCircle(geom: THREE.BufferGeometry, radius: number): void {
  const pos = geom.attributes.position;
  if (!(pos instanceof THREE.BufferAttribute)) return;
  for (let i = 0; i < pos.count; i++) {
    const inward = pos.getX(i);
    const arc = pos.getZ(i);
    const beta = arc / radius;
    const radial = radius - inward;
    pos.setX(i, radius - radial * Math.cos(beta));
    pos.setZ(i, radial * Math.sin(beta));
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
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
    bevelThickness: 0.06,
    bevelSize: 0.06,
    bevelSegments: 2,
    curveSegments: 8,
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

  // Dispose cached CanvasTextures before clearing so their WebGL textures are
  // released and no disposed (still-truthy) texture references leak into the
  // next scene build.
  for (const tex of stationScanTextureCache.values()) {
    tex.dispose();
  }
  stationScanTextureCache.clear();

  for (const tex of archTitleBannerTextureCache.values()) {
    tex.dispose();
  }
  archTitleBannerTextureCache.clear();
}

/**
 * SOURCE OF TRUTH KEYWORDS: createWoodFinishTexture, walnut grain, door frame, satin varnish
 * WHAT: Paints a repeating walnut grain used on one Greek archway moulding.
 * WHY: A flat brown reads as paint. Long grain, pores, and a few knots read as finished wood on both the curved archivolt and the jambs. Each doorway owns its texture so scene disposal cannot hand the next room a freed map.
 * WHERE: createGreekArchwayMoldingGroup.
 */
function createWoodFinishTexture(): THREE.CanvasTexture {

  const width = 128;
  const height = 512;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#6B4328";
    ctx.fillRect(0, 0, width, height);

    for (let x = 0; x < width; x++) {
      const wobble = Math.sin(x * 0.21) * 0.35 + Math.sin(x * 0.07) * 0.2;
      const band = Math.sin(x * 0.72 + wobble);
      const fine = Math.sin(x * 2.15);
      const tone = 0.72 + band * 0.22 + fine * 0.07;
      const r = Math.round(118 * tone + 36);
      const g = Math.round(72 * tone + 18);
      const b = Math.round(38 * tone + 12);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, 0, 1, height);
    }

    ctx.globalAlpha = 0.22;
    for (let i = 0; i < 36; i++) {
      const x = (i * 53) % width;
      const y = (i * 89) % height;
      ctx.fillStyle = i % 4 === 0 ? "#F0D2A8" : "#3A2414";
      ctx.fillRect(x, y, i % 4 === 0 ? 1 : 2, 22 + (i % 6) * 10);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#4A2C18";
    ctx.beginPath();
    ctx.ellipse(36, 160, 7, 11, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8C6239";
    ctx.beginPath();
    ctx.ellipse(36, 160, 3, 5, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3E2616";
    ctx.beginPath();
    ctx.ellipse(92, 390, 6, 9, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/**
 * SOURCE OF TRUTH KEYWORDS: applyWoodGrainUVs, door frame grain, local position UVs
 * WHAT: Replaces mesh UVs so walnut grain runs with the height of each arch piece.
 * WHY: ExtrudeGeometry UVs stretch one tile across the whole arch. Local Y keeps the grain tight on the jambs and the curved bands.
 * WHERE: createGreekArchwayMoldingGroup, before the rotunda bend clones the geometry.
 */
function applyWoodGrainUVs(geom: THREE.BufferGeometry): void {
  const pos = geom.attributes.position;
  if (!(pos instanceof THREE.BufferAttribute)) return;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uvs[i * 2] = (pos.getX(i) + pos.getZ(i)) * 2.4;
    uvs[i * 2 + 1] = pos.getY(i) * 1.15;
  }
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
}

/**
 * SOURCE OF TRUTH KEYWORDS: seatRotundaArchFrame, deeper curved archivolt, flush rounded wall
 * WHAT: Thickens a rotunda arch frame and bends it onto the circular wall.
 * WHY: A flat frame leaves a gap against the curved plaster. A deeper rim follows the wall and stays flush.
 * WHERE: buildProceduralHallScene.
 */
function seatRotundaArchFrame(
  group: THREE.Group,
  radius: number,
  depthScale: number,
  inwardOffset: number,
): void {
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geom = mesh.geometry.clone();
    const pos = geom.attributes.position;
    if (pos instanceof THREE.BufferAttribute) {
      for (let i = 0; i < pos.count; i++) {
        pos.setX(i, pos.getX(i) * depthScale + inwardOffset);
      }
      pos.needsUpdate = true;
    }
    curveWallOntoCircle(geom, radius);
    mesh.geometry = geom;
    const material = mesh.material;
    if (material instanceof THREE.Material) {
      material.polygonOffset = true;
      material.polygonOffsetFactor = -2;
      material.polygonOffsetUnits = -2;
    }
  });
}

/**
 * SOURCE OF TRUTH KEYWORDS: createGreekArchwayMoldingGroup, walnut door frame, stepped archivolt, keystone
 * WHAT: Builds a sleek Neoclassical / Greek stepped archway moulding with Attic plinth bases, impost capitals, 3-fascia archivolt, and crown keystone.
 * WHY: Gives both the Rotunda entrance arches and the End-of-Hallway arches the same finished walnut border.
 * WHERE: buildProceduralHallScene and buildMuseumRoomScene.
 */
function createGreekArchwayMoldingGroup(
  _accentColor?: number | string,
): THREE.Group {
  if (!cachedInnerArchBandGeom) {
    cachedInnerArchBandGeom = createArchBandGeometry(1.78, 1.798, 3.75, 0.42);
    applyWoodGrainUVs(cachedInnerArchBandGeom);
  }
  if (!cachedMidArchBandGeom) {
    cachedMidArchBandGeom = createArchBandGeometry(1.798, 1.852, 3.75, 0.45);
    applyWoodGrainUVs(cachedMidArchBandGeom);
  }
  if (!cachedOuterArchBandGeom) {
    cachedOuterArchBandGeom = createArchBandGeometry(1.852, 1.888, 3.75, 0.48);
    applyWoodGrainUVs(cachedOuterArchBandGeom);
  }

  const group = new THREE.Group();

  const woodMap = createWoodFinishTexture();
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: woodMap,
    roughness: 0.38,
    metalness: 0.08,
    emissive: 0x4a301c,
    emissiveIntensity: 0.05,
  });

  // 1. Three-stepped Greek archivolt bands — one walnut finish, no accent borders
  group.add(new THREE.Mesh(cachedInnerArchBandGeom, woodMat));
  group.add(new THREE.Mesh(cachedMidArchBandGeom, woodMat));
  group.add(new THREE.Mesh(cachedOuterArchBandGeom, woodMat));

  // 2. Stepped Attic plinth bases (y = 0..0.34) and Doric/Ionic impost capitals at springline (y = 3.75)
  const plinthLowerGeom = new THREE.BoxGeometry(0.5, 0.15, 0.18);
  const plinthUpperGeom = new THREE.BoxGeometry(0.46, 0.12, 0.16);
  const impostCapGeom = new THREE.BoxGeometry(0.5, 0.09, 0.18);
  const impostNeckGeom = new THREE.BoxGeometry(0.46, 0.04, 0.16);
  applyWoodGrainUVs(plinthLowerGeom);
  applyWoodGrainUVs(plinthUpperGeom);
  applyWoodGrainUVs(impostCapGeom);
  applyWoodGrainUVs(impostNeckGeom);

  for (const side of [-1, 1]) {
    // Each piece starts exactly at the arch opening edge (1.78) so nothing intrudes into the doorway
    const openingEdge = 1.78;

    const baseLower = new THREE.Mesh(plinthLowerGeom, woodMat);
    baseLower.position.set(0, 0.075, side * (openingEdge + 0.09));
    group.add(baseLower);

    const baseUpper = new THREE.Mesh(plinthUpperGeom, woodMat);
    baseUpper.position.set(0, 0.21, side * (openingEdge + 0.075));
    group.add(baseUpper);

    const impostCap = new THREE.Mesh(impostCapGeom, woodMat);
    impostCap.position.set(0, 3.75, side * (openingEdge + 0.09));
    group.add(impostCap);

    const impostNeck = new THREE.Mesh(impostNeckGeom, woodMat);
    impostNeck.position.set(0, 3.68, side * (openingEdge + 0.075));
    group.add(impostNeck);
  }

  // 3. Classical Crown Keystone at top of the arch (y = 5.56)
  const keystoneGeom = new THREE.BoxGeometry(0.48, 0.24, 0.18);
  applyWoodGrainUVs(keystoneGeom);
  const keystoneMesh = new THREE.Mesh(keystoneGeom, woodMat);
  keystoneMesh.position.set(0, 5.56, 0);
  group.add(keystoneMesh);

  const keystoneAccentGeom = new THREE.BoxGeometry(0.5, 0.16, 0.05);
  applyWoodGrainUVs(keystoneAccentGeom);
  const keystoneAccent = new THREE.Mesh(keystoneAccentGeom, woodMat);
  keystoneAccent.position.set(0, 5.56, 0);
  group.add(keystoneAccent);

  return group;
}

/**
 * SOURCE OF TRUTH KEYWORDS: addArchOpeningEdge, dark reveal, chapter fillet, rotunda and gallery
 * WHAT: Adds the dark inner recess and thin chapter-colored fillet used on every doorway.
 * WHY: The rotunda and the gallery end arches have to read as the same walnut frame, including the inner edge.
 * WHERE: buildProceduralHallScene and buildMuseumRoomScene.
 */
function addArchOpeningEdge(group: THREE.Group, washHex: number | string): void {
  const revealMat = new THREE.MeshStandardMaterial({
    color: 0x2c261f,
    roughness: 0.86,
    metalness: 0.02,
    emissive: 0x1a1612,
    emissiveIntensity: 0.18,
  });
  const filletMat = new THREE.MeshStandardMaterial({
    color: washHex,
    roughness: 0.42,
    metalness: 0.12,
    emissive: new THREE.Color(washHex),
    emissiveIntensity: 0.08,
  });
  group.add(
    new THREE.Mesh(createArchBandGeometry(1.72, 1.78, 3.75, 0.18), revealMat),
    new THREE.Mesh(createArchBandGeometry(1.78, 1.805, 3.75, 0.2), filletMat),
  );
}

/**
 * SOURCE OF TRUTH KEYWORDS: createInsetRingLedGeometry, rotunda floor ring, LED circle
 * WHAT: Builds a flat ring whose v coordinate runs across the strip, so the floor LED shader can glow it.
 * WHY: The rotunda light sits in from the wall as a circle, not as a line jammed into the floor edge.
 * WHERE: buildProceduralHallScene.
 */
function createInsetRingLedGeometry(radius: number, width: number, segments = 160): THREE.BufferGeometry {
  const inner = radius - width / 2;
  const outer = radius + width / 2;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const theta = (i / segments) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    positions.push(inner * cos, 0, inner * sin, outer * cos, 0, outer * sin);
    uvs.push(i / segments, 0, i / segments, 1);
  }
  for (let i = 0; i < segments; i += 1) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
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

  // Plaster and floor share the walnut hue (~34°). The frames are the only darker note.
  const wallMat = new THREE.MeshLambertMaterial({
    color: 0xe8d9c8,
    emissive: 0xdccbb6,
    emissiveIntensity: 0.04,
    side: THREE.DoubleSide,
  });

  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xd2c0a8,
    roughness: 0.9,
    metalness: 0.0,
  });

  const floorMesh = new THREE.Mesh(createFloorGeometry(), floorMat);
  floorMesh.name = "FloorHall";
  floorMesh.quaternion.copy(rot20);
  root.add(floorMesh);

  // Inset from the wall (inner face at 9.61) so the ring reads as a circle in the floor.
  const rotundaRing = new THREE.Mesh(
    createInsetRingLedGeometry(7.55, 0.38),
    createFloorLedMaterial(),
  );
  rotundaRing.name = "rotunda_floor_led";
  rotundaRing.position.y = 0.02;
  root.add(rotundaRing);

  const reflectorAnchor = new THREE.Object3D();
  reflectorAnchor.name = "reflector";
  reflectorAnchor.position.set(-9.396925926208496, 0.015, 3.420201539993286);
  reflectorAnchor.quaternion.copy(rot20);
  root.add(reflectorAnchor);

  const wallRadius = 9.85;
  const previewRadius = 10.12;

  const wallGeom = createContinuousRotundaWall(
    wallRadius,
    portals.map((portal) => portal.angleDeg),
  );
  const hallWall = new THREE.Mesh(wallGeom, wallMat);
  hallWall.name = "WallsHall";
  root.add(hallWall);

  const previewGeom = new THREE.PlaneGeometry(3.64, 5.56, 20, 20);
  // Translate by half height so bottom sits at y = 0.0, matching createPortalEnergyField 1:1
  previewGeom.translate(0, 5.56 * 0.5, 0);

  portals.forEach((cfg, idx) => {
    const theta = THREE.MathUtils.degToRad(cfg.angleDeg);
    const dirX = -Math.sin(theta);
    const dirZ = -Math.cos(theta);
    const wallRotY = theta - Math.PI / 2;

    const labelAnchor = new THREE.Group();
    labelAnchor.name = `WallLabel_${idx}`;
    labelAnchor.position.set(dirX * wallRadius, 0, dirZ * wallRadius);
    labelAnchor.rotation.set(0, wallRotY, 0);
    root.add(labelAnchor);

    const sideLabelGeom = new THREE.PlaneGeometry(3.15, 3.9, 18, 1);
    // Face the centre (local +X on this wall is inward), then sit the card on the curve.
    sideLabelGeom.rotateY(Math.PI / 2);
    sideLabelGeom.translate(0.52, 2.72, -4.55);
    curveWallOntoCircle(sideLabelGeom, wallRadius);
    const textMesh = new THREE.Mesh(
      sideLabelGeom,
      new THREE.MeshBasicMaterial({
        map: createArchSideLabelTexture(
          cfg.title,
          cfg.years,
          cfg.subtitle,
          cfg.washHex,
        ),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    textMesh.name = cfg.textNode;
    labelAnchor.add(textMesh);

    const portalAnchor = new THREE.Object3D();
    portalAnchor.name = cfg.portalNode;
    portalAnchor.position.set(dirX * wallRadius, 0, dirZ * wallRadius);
    portalAnchor.rotation.set(0, theta + Math.PI / 2, 0);
    portalAnchor.scale.set(1, 1, 1);
    root.add(portalAnchor);

    const glowGroup = createGreekArchwayMoldingGroup(cfg.washHex);
    addArchOpeningEdge(glowGroup, cfg.washHex);
    seatRotundaArchFrame(glowGroup, wallRadius, 1.12, 0.28);
    glowGroup.name = cfg.glowNode;
    glowGroup.position.set(dirX * wallRadius, 0, dirZ * wallRadius);
    glowGroup.rotation.set(0, wallRotY, 0);
    root.add(glowGroup);

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
  viewNode.position.set(0, 3.15, 0);

  const camera = new THREE.PerspectiveCamera(
    THREE.MathUtils.radToDeg(0.5483113556160755),
    typeof window !== "undefined" ? window.innerWidth / window.innerHeight : 1.6,
    0.1,
    32,
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
 * WHAT: Builds the twin-arch end wall with two openings the same size as the rotunda doors, and plaster shoulders on both sides.
 * WHY: The gallery doorways use the rotunda arch width. The wall has to be wider than those frames so the walnut sits on plaster instead of meeting the side walls.
 * WHERE: buildMuseumRoomScene.
 */
function createTwinArchEndWallGeometry(halfW: number, archZ: number): THREE.ExtrudeGeometry {
  const wallH = 11.2;
  const archHalfW = 1.78;
  const archSpringY = 3.75;
  const leftArchZ = -archZ;
  const rightArchZ = archZ;

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

export interface BuildMuseumRoomOptions {
  collection: ArchiveCollection;
  allCollections: ArchiveCollection[];
  roomLimits: RoomLimitConfig;
  portalTheme: RoomPortalTheme;
  textures: LoadedHallTextures;
}

/**
 * SOURCE OF TRUTH KEYWORDS: buildMuseumRoomScene, museum picture frames, gallery walls, end of hallway arches
 * WHAT: Builds the 3D archival exhibition gallery for any of the 6 BCCNS historical chapters.
 * WHY: Replaces open side arches with architectural museum gallery walls and hanging 3D picture frames with overhead picture lights and twin end-of-hallway chapter portals.
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
  // Narrower than the first widened hall. End doors stay the rotunda opening (half-width 1.78, centers at ±2.35) so the frames, holes, and portal washes still meet, with plaster left beside each jamb.
  const wallZ = 5.15;
  const archZ = 2.35;

  // Materials — plaster and floor in the walnut hue; trim is the same wood, darker.
  const wallMat = new THREE.MeshLambertMaterial({
    color: 0xe8d9c8,
    emissive: 0xdccbb6,
    emissiveIntensity: 0.04,
    side: THREE.DoubleSide,
  });

  const recessedBayMat = new THREE.MeshLambertMaterial({
    color: 0xd5c3ab,
    emissive: 0xcbb8a0,
    emissiveIntensity: 0.03,
  });

  const plinthMat = new THREE.MeshLambertMaterial({ color: 0x4a3224 });

  const frameOuterMat = new THREE.MeshLambertMaterial({ color: 0x5c3d28 });

  const ochreTrimMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(collection.washHex || "#C4782A"),
  });

  const walnutTrimMat = new THREE.MeshLambertMaterial({ color: 0x6e4b30 });

  const paperBackingMat = new THREE.MeshBasicMaterial({
    color: 0xe8d9c8,
  });

  const floorMat = new THREE.MeshBasicMaterial({
    color: 0xd2c0a8,
    side: THREE.DoubleSide,
  });

  // 1. Corridor Floor & Central Exhibition Runner Border
  const floorGeom = new THREE.PlaneGeometry(corridorLen + 14, wallZ * 2 + 3);
  floorGeom.rotateX(-Math.PI / 2);
  const floorMesh = new THREE.Mesh(floorGeom, floorMat);
  floorMesh.name = "Floor";
  floorMesh.position.set(corridorCenterX, 0, 0);
  root.add(floorMesh);

  // LED strips along both sides of the walk. uv.x 0 is the entrance.
  const floorLedMaterial = createFloorLedMaterial();
  const floorLedGeom = new THREE.PlaneGeometry(corridorLen, 0.16);
  floorLedGeom.rotateX(-Math.PI / 2);
  const leftFloorLed = new THREE.Mesh(floorLedGeom, floorLedMaterial);
  leftFloorLed.name = "floor_led_left";
  leftFloorLed.position.set(corridorCenterX, 0.016, -2.85);
  root.add(leftFloorLed);
  const rightFloorLed = new THREE.Mesh(floorLedGeom, floorLedMaterial);
  rightFloorLed.name = "floor_led_right";
  rightFloorLed.position.set(corridorCenterX, 0.016, 2.85);
  root.add(rightFloorLed);

  // Cap the gallery so the hanging wires meet a real ceiling, just above the beams.
  const galleryCeilingY = 6.72;

  // 2. Solid Architectural Museum Gallery Walls (replacing open side arches)
  const sideWallGeom = new THREE.BoxGeometry(corridorLen, galleryCeilingY, 0.36);
  const leftWall = new THREE.Mesh(sideWallGeom, wallMat);
  leftWall.position.set(corridorCenterX, galleryCeilingY / 2, -wallZ);
  root.add(leftWall);

  const rightWall = new THREE.Mesh(sideWallGeom, wallMat);
  rightWall.position.set(corridorCenterX, galleryCeilingY / 2, wallZ);
  root.add(rightWall);

  // Baseboard plinths, dado rails, and upper picture-hanging rails along both gallery walls
  const baseboardGeom = new THREE.BoxGeometry(corridorLen, 0.34, 0.44);
  const dadoGeom = new THREE.BoxGeometry(corridorLen, 0.06, 0.42);
  const pictureRailGeom = new THREE.BoxGeometry(corridorLen, 0.09, 0.46);
  const corniceGeom = new THREE.BoxGeometry(corridorLen, 0.28, 0.54);

  for (const side of [-1, 1]) {
    const zBase = side * (wallZ - 0.04);
    const baseboard = new THREE.Mesh(baseboardGeom, walnutTrimMat);
    baseboard.position.set(corridorCenterX, 0.17, zBase);
    root.add(baseboard);

    const dado = new THREE.Mesh(dadoGeom, walnutTrimMat);
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
  const ceilingMat = new THREE.MeshLambertMaterial({
    color: 0xd9c6b0,
    emissive: 0xcbb8a2,
    emissiveIntensity: 0.04,
    side: THREE.DoubleSide,
  });
  const ceilingGeom = new THREE.PlaneGeometry(corridorLen + 2, wallZ * 2 + 1.2);
  ceilingGeom.rotateX(Math.PI / 2);
  const ceiling = new THREE.Mesh(ceilingGeom, ceilingMat);
  ceiling.name = "GalleryCeiling";
  ceiling.position.set(corridorCenterX, galleryCeilingY, 0);
  root.add(ceiling);

  const ceilingBeamStride = 7.2;
  const numCeilingBeams = Math.ceil(corridorLen / ceilingBeamStride) + 1;
  const crossBeamGeom = new THREE.BoxGeometry(0.38, 0.34, wallZ * 2 + 0.4);
  const pilasterGeom = new THREE.BoxGeometry(0.42, 5.7, 0.22);
  const pilasterBaseGeom = new THREE.BoxGeometry(0.56, 0.46, 0.34);
  const stationCount = collection.stations?.length ?? 0;
  const firstPicX = -38.2;
  const lastPicX = maxX - 2.4;
  const picStepX =
    stationCount > 1 ? (lastPicX - firstPicX) / (stationCount - 1) : 7.2;
  // A pilaster sits proud of the baseboard. Skip one that would land inside a frame.
  const pilasterClear = 1.85;
  const frameBlocksPilaster = (bx: number, side: number): boolean => {
    for (let idx = 0; idx < stationCount; idx += 1) {
      const pictureSide = idx % 2 === 0 ? 1 : -1;
      if (pictureSide !== side) continue;
      const pictureX = firstPicX + idx * picStepX;
      if (Math.abs(bx - pictureX) < pilasterClear) return true;
    }
    return false;
  };

  for (let i = 0; i < numCeilingBeams; i++) {
    const bx = startWallX + i * ceilingBeamStride;
    if (bx > portalWallX - 1.2) break;

    const beam = new THREE.Mesh(crossBeamGeom, wallMat);
    beam.position.set(bx, 6.55, 0);
    root.add(beam);

    for (const side of [-1, 1]) {
      if (frameBlocksPilaster(bx, side)) continue;
      // Proud of the baseboard, and stopped at the dado so the base is one piece.
      const pilaster = new THREE.Mesh(pilasterGeom, recessedBayMat);
      pilaster.position.set(bx, 3.31, side * (wallZ - 0.46));
      root.add(pilaster);

      const pilasterBase = new THREE.Mesh(pilasterBaseGeom, plinthMat);
      pilasterBase.position.set(bx, 0.23, side * (wallZ - 0.5));
      root.add(pilasterBase);
    }
  }

  // Back Entry Wall behind camera start
  const backWallGeom = new THREE.BoxGeometry(0.4, galleryCeilingY, wallZ * 2 + 1.0);
  const backWall = new THREE.Mesh(backWallGeom, wallMat);
  backWall.position.set(startWallX, galleryCeilingY / 2, 0);
  root.add(backWall);

  // 3. End-of-Hallway Twin Arch Portals Wall (portal_1 -> next collection, portal_2 -> previous collection / rotunda)
  const endWallMesh = new THREE.Mesh(createTwinArchEndWallGeometry(wallZ + 0.5, archZ), wallMat);
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

  const rightArchZ = archZ;
  const leftArchZ = -archZ;

  const portal1Anchor = new THREE.Object3D();
  portal1Anchor.name = "portal_1";
  portal1Anchor.position.set(portalWallX - 0.02, 0, rightArchZ);
  root.add(portal1Anchor);

  const portal2Anchor = new THREE.Object3D();
  portal2Anchor.name = "portal_2";
  portal2Anchor.position.set(portalWallX - 0.02, 0, leftArchZ);
  root.add(portal2Anchor);

  const portal1Glow = createGreekArchwayMoldingGroup(portalTheme.portal1Color);
  addArchOpeningEdge(portal1Glow, portalTheme.portal1Color);
  portal1Glow.name = "portal_1_glow";
  portal1Glow.position.set(portalWallX - 0.42, 0, rightArchZ);
  // Orient the Greek archway molding to face inward toward the gallery,
  // matching the rotunda entrance arch orientation (rotation.set(0, wallRotY, 0)).
  portal1Glow.rotation.set(0, Math.PI, 0);
  root.add(portal1Glow);

  const portal2Glow = createGreekArchwayMoldingGroup(portalTheme.portal2Color);
  addArchOpeningEdge(portal2Glow, portalTheme.portal2Color);
  portal2Glow.name = "portal_2_glow";
  portal2Glow.position.set(portalWallX - 0.42, 0, leftArchZ);
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

  const nextLabel = nextColObj ? nextColObj.title : "Gallery";
  const nextYears = nextColObj ? `NEXT · ${nextColObj.period}` : "RETURN · ALL 6 HALLS";
  const prevLabel = prevColObj ? prevColObj.title : "Gallery";
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

  // Picture above, serif title plate below. The board is raised so the caption clears the baseboard.
  const imageSize = 2.54;
  const imageHalf = imageSize / 2;
  const titleWidth = imageSize;
  const titleHeight = 0.82;
  const titleGap = 0;
  const titleCenterY = -(imageHalf + titleGap + titleHeight / 2);
  const frameLip = 0.15;
  const frameOuterW = 2.96;
  const sideX = frameOuterW / 2 - frameLip / 2;
  const topBarY = imageHalf + 0.1 + frameLip / 2;
  const bottomBarY = titleCenterY - titleHeight / 2 - 0.1 - frameLip / 2;
  const vertTop = topBarY - frameLip / 2;
  const vertBottom = bottomBarY + frameLip / 2;
  const vertHeight = vertTop - vertBottom;
  const vertY = (vertTop + vertBottom) / 2;
  const matTop = vertTop - 0.02;
  const matBottom = vertBottom + 0.02;
  const matHeight = matTop - matBottom;
  const matY = (matTop + matBottom) / 2;
  const contentBottom = titleCenterY - titleHeight / 2;
  const contentTop = imageHalf;
  const contentSpan = Math.max(0.001, contentTop - contentBottom);
  const pictureLampBase = (-imageHalf - contentBottom) / contentSpan;
  const pictureLampScale = imageSize / contentSpan;
  const titleLampScale = titleHeight / contentSpan;

  const yPos = 2.98;
  // Same cap as GalleryCeiling. The wire runs from the frame top into that plane.
  const ceilingLocalY = galleryCeilingY - yPos + 0.02;
  const rodBottom = topBarY;
  const rodLength = Math.max(0.45, ceilingLocalY - rodBottom);
  const rodY = rodBottom + rodLength / 2;

  const picGeom = new THREE.PlaneGeometry(imageSize, imageSize);
  const titleGeom = new THREE.PlaneGeometry(titleWidth, titleHeight);

  // 4-Bar Mitered Museum Picture Frame geometries & recessed mat board (strictly behind z = 0 so picMesh is never occluded)
  const frameHorizBarGeom = new THREE.BoxGeometry(frameOuterW, frameLip, 0.12);
  const frameVertBarGeom = new THREE.BoxGeometry(frameLip, vertHeight, 0.12);
  const filletHorizBarGeom = new THREE.BoxGeometry(frameOuterW - 0.28, 0.045, 0.09);
  const filletVertBarGeom = new THREE.BoxGeometry(0.045, vertHeight - 0.12, 0.09);
  const matBoardBoxGeom = new THREE.BoxGeometry(frameOuterW - 0.3, matHeight, 0.03);
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x3a2818 });
  const hangingRodGeom = new THREE.CylinderGeometry(0.015, 0.015, rodLength, 8);
  const ceilingCleatGeom = new THREE.BoxGeometry(0.1, 0.045, 0.1);
  const pictureLightBarGeom = new THREE.BoxGeometry(1.42, 0.07, 0.22);
  const pictureLightArmGeom = new THREE.BoxGeometry(0.06, 0.06, 0.36);
  const lampGlowGeom = new THREE.BoxGeometry(1.22, 0.025, 0.14);
  const lampHousingMat = new THREE.MeshLambertMaterial({
    color: 0xc9892d,
    emissive: 0x5a3d12,
    emissiveIntensity: 0.35,
  });
  const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xfff4d2 });

  const shadowGeom = new THREE.PlaneGeometry(3.4, 1.85);
  shadowGeom.rotateX(-Math.PI / 2);
  const shadowTex = createContactShadowTexture();
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
  });

  const pictureMeshes: THREE.Mesh[] = [];
  const stationLabelMeshes: THREE.Mesh[] = [];
  const pictureXPositions: number[] = [];

  stations.forEach((station, idx) => {
    const isRightSide = idx % 2 === 0;
    const xPos = +(firstPicX + idx * picStepX).toFixed(3);
    const zPos = (isRightSide ? 1 : -1) * (wallZ - 1.55);
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
    picMesh.userData.lampBase = pictureLampBase;
    picMesh.userData.lampScale = pictureLampScale;

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

    const titleMesh = new THREE.Mesh(
      titleGeom,
      new THREE.MeshBasicMaterial({
        map: createStationTitlePlateTexture(
          station.dc_title,
          station.display_year,
        ),
        side: THREE.DoubleSide,
        fog: true,
      }),
    );
    titleMesh.name = `station_label_${idx + 1}`;
    titleMesh.position.set(0, titleCenterY, 0.02);
    titleMesh.userData.stationData = station;
    titleMesh.userData.stationIndex = idx;
    titleMesh.userData.stationPicture = picMesh;
    titleMesh.userData.lampBase = 0;
    titleMesh.userData.lampScale = titleLampScale;
    frameGroup.add(titleMesh);
    stationLabelMeshes.push(titleMesh);

    // 4-Bar Outer Museum Frame (top, bottom, left, right)
    const topBar = new THREE.Mesh(frameHorizBarGeom, frameOuterMat);
    topBar.position.set(0, topBarY, 0.01);
    frameGroup.add(topBar);

    const bottomBar = new THREE.Mesh(frameHorizBarGeom, frameOuterMat);
    bottomBar.position.set(0, bottomBarY, 0.01);
    frameGroup.add(bottomBar);

    const leftBar = new THREE.Mesh(frameVertBarGeom, frameOuterMat);
    leftBar.position.set(-sideX, vertY, 0.01);
    frameGroup.add(leftBar);

    const rightBar = new THREE.Mesh(frameVertBarGeom, frameOuterMat);
    rightBar.position.set(sideX, vertY, 0.01);
    frameGroup.add(rightBar);

    // 4-Bar Inner Copper-Ochre Fillet
    const topFillet = new THREE.Mesh(filletHorizBarGeom, ochreTrimMat);
    topFillet.position.set(0, vertTop - 0.02, 0.005);
    frameGroup.add(topFillet);

    const bottomFillet = new THREE.Mesh(filletHorizBarGeom, ochreTrimMat);
    bottomFillet.position.set(0, vertBottom + 0.02, 0.005);
    frameGroup.add(bottomFillet);

    const leftFillet = new THREE.Mesh(filletVertBarGeom, ochreTrimMat);
    leftFillet.position.set(-(sideX - frameLip / 2 - 0.02), vertY, 0.005);
    frameGroup.add(leftFillet);

    const rightFillet = new THREE.Mesh(filletVertBarGeom, ochreTrimMat);
    rightFillet.position.set(sideX - frameLip / 2 - 0.02, vertY, 0.005);
    frameGroup.add(rightFillet);

    // Recessed warm-paper backing board, strictly behind the scan and the title plate
    const matBoard = new THREE.Mesh(matBoardBoxGeom, paperBackingMat);
    matBoard.position.set(0, matY, -0.035);
    frameGroup.add(matBoard);

    // Two wires from the top of the frame into a cleat on the ceiling
    for (const side of [-1, 1]) {
      const wire = new THREE.Mesh(hangingRodGeom, wireMat);
      wire.position.set(side * 0.98, rodY, 0.02);
      // The wire's midpoint is above the camera view, so frustum culling drops the whole line.
      wire.frustumCulled = false;
      frameGroup.add(wire);

      const cleat = new THREE.Mesh(ceilingCleatGeom, frameOuterMat);
      cleat.position.set(side * 0.98, ceilingLocalY, 0.02);
      cleat.frustumCulled = false;
      frameGroup.add(cleat);
    }

    // Picture lamp: brass housing, glowing diffuser, and a spot aimed down the board
    const lightBar = new THREE.Mesh(pictureLightBarGeom, lampHousingMat);
    lightBar.position.set(0, topBarY + 0.2, 0.18);
    frameGroup.add(lightBar);

    const lampGlow = new THREE.Mesh(lampGlowGeom, lampGlowMat);
    lampGlow.position.set(0, topBarY + 0.15, 0.2);
    frameGroup.add(lampGlow);

    const lightArm = new THREE.Mesh(pictureLightArmGeom, plinthMat);
    lightArm.position.set(0, topBarY + 0.14, 0.02);
    frameGroup.add(lightArm);

    const lampTarget = new THREE.Object3D();
    lampTarget.position.set(0, -0.15, 0.12);
    frameGroup.add(lampTarget);

    const lamp = new THREE.SpotLight(0xfff1cc, 6, 5.2, 0.78, 0.65, 1.4);
    lamp.position.set(0, topBarY + 0.16, 0.24);
    lamp.target = lampTarget;
    lamp.castShadow = false;
    frameGroup.add(lamp);

    root.add(frameGroup);

    // Soft contact shadow on the pale reflective floor directly below the framed station
    const shadowMesh = new THREE.Mesh(shadowGeom, shadowMat);
    shadowMesh.position.set(xPos, 0.035, zPos);
    shadowMesh.rotation.y = isRightSide ? -0.52 : 0.52;
    picMesh.userData.shadowMesh = shadowMesh;
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
    35,
  );
  camera.name = "Camera";
  camera.position.set(0, 0, 2);
  viewNode.add(camera);
  root.add(viewNode);

  const moving = new Set<THREE.Object3D>([viewNode, camera]);
  root.traverse((child) => {
    if (moving.has(child)) return;
    child.updateMatrix();
    child.matrixAutoUpdate = false;
  });

  return {
    root,
    viewNode,
    camera,
    pictureMeshes,
    stationLabelMeshes,
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
