import * as THREE from "three";
import { z } from "zod";

/**
 * SOURCE OF TRUTH KEYWORDS: CollectionKey, ArchiveStation, ArchiveCollection, PortalConfig, MuseumTypes, DublinCore
 * WHAT: Shared Zod schemas and TypeScript interfaces for the BCCNS 3D rotunda and archival galleries.
 * WHY: Ensures all 6 historical chapter halls, Dublin Core stations, and Three.js controllers are strictly typed.
 * WHERE: lib/services/archive.ts, app/api/archive/route.ts, and src/components/archive/.
 */

export const collectionKeyValues = [
  "slavery_and_halifax",
  "black_loyalists",
  "the_maroons",
  "the_refugees",
  "caribbean_migrants",
  "construction_battalion",
] as const;

export const collectionKeySchema = z.enum(collectionKeyValues);

export type CollectionKey = z.infer<typeof collectionKeySchema>;

export type AppMode = "hall" | "museum";

export interface PortalConfig {
  id: number;
  portalNode: string;
  glowNode: string;
  previewNode: string;
  textNode: string;
  slug: string;
  collectionKey: CollectionKey;
  title: string;
  subtitle: string;
  years: string;
  angleDeg: number;
  washHex: string;
  hoverHex: string;
  color: number;
  hoverColor: number;
}

export interface CollectionVoice {
  speaker: string;
  role: string;
  community: string;
  statement: string;
  citation: string;
}

export const archiveStationSchema = z.object({
  id: z.string(),
  dc_title: z.string(),
  dc_creator: z.string().nullable(),
  dc_description: z.string().nullable(),
  dc_subject: z.array(z.string()),
  dc_date: z.string().nullable(),
  date_text: z.string().nullable(),
  display_year: z.string(),
  sort_year: z.number().int(),
  dc_type: z.string(),
  dc_publisher: z.string(),
  dc_identifier: z.string(),
  dc_source: z.string(),
  dc_coverage: z.string().nullable(),
  dcterms_spatial: z.string().nullable(),
  dcterms_temporal: z.string().nullable(),
  dc_relation: z.string().nullable(),
  dc_language: z.string().nullable(),
  dc_format: z.string().nullable(),
  dc_rights: z.string().nullable(),
  dcterms_access_rights: z.string().nullable(),
  dcterms_provenance: z.string().nullable(),
  collection: z.string().nullable(),
  media_url: z.string().nullable(),
  bccns_digitized: z.boolean().nullable(),
  citation: z.string(),
});

export type ArchiveStation = z.infer<typeof archiveStationSchema>;

export const archiveCollectionSchema = z.object({
  key: collectionKeySchema,
  slug: z.string(),
  title: z.string(),
  chapterTitle: z.string(),
  period: z.string(),
  washHex: z.string(),
  hoverHex: z.string(),
  angleDeg: z.number(),
  summary: z.string(),
  preparationNotice: z.string().nullable(),
  voice: z.object({
    speaker: z.string(),
    role: z.string(),
    community: z.string(),
    statement: z.string(),
    citation: z.string(),
  }),
  stations: z.array(archiveStationSchema),
});

export type ArchiveCollection = z.infer<typeof archiveCollectionSchema>;

export const archivePayloadSchema = z.object({
  institution: z.object({
    name: z.string(),
    location: z.string(),
    established: z.string(),
    societyIncorporated: z.string(),
    mandate: z.string(),
  }),
  collections: z.array(archiveCollectionSchema),
  liveDatabaseConnected: z.boolean(),
  totalCatalogRecords: z.number().int().nonnegative(),
});

export type ArchivePayload = z.infer<typeof archivePayloadSchema>;

export const archiveFilterSchema = z.object({
  collection: collectionKeySchema.optional(),
  record: z.string().trim().max(200).optional(),
});

export type ArchiveFilter = z.infer<typeof archiveFilterSchema>;

export const archiveImageProxyQuerySchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .max(2000)
    .refine((val) => {
      try {
        const parsed = new URL(val);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
      } catch {
        return false;
      }
    }, "Must be a valid HTTP or HTTPS archival image URL"),
});

export type ArchiveImageProxyQuery = z.infer<typeof archiveImageProxyQuerySchema>;

export interface RoomLimitConfig {
  min: [number, number, number];
  max: [number, number, number];
  portalDist: number;
}

export interface RoomPortalTheme {
  prevCollection: CollectionKey | "hall";
  nextCollection: CollectionKey | "hall";
  portal1Color: string;
  portal1Hover: string;
  portal2Color: string;
  portal2Hover: string;
  fogColor: number;
  bgColor: number;
}

export interface LoadedHallTextures {
  noise: THREE.Texture | null;
  platform: THREE.Texture | null;
  floor: THREE.Texture | null;
  rotundaPreview: THREE.Texture | null;
  previewsByCollection: Partial<Record<CollectionKey, THREE.Texture | null>>;
}

export interface PortalEnergyController {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  setHovered: (hovered: boolean) => void;
  update: (dt: number, elapsed: number) => void;
}

export interface PortalLightsController {
  lights: THREE.PointLight[];
  update: (dt: number, elapsed: number) => void;
}

export interface PortalPreviewController {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  setTexture: (tex: THREE.Texture | null) => void;
  setHovered: (hovered: boolean) => void;
  update: (dt: number, elapsed: number, cameraDeg?: number) => void;
}

export interface StationPictureShaderController {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  setHovered: (hovered: boolean) => void;
  update: (dt: number, elapsed: number) => void;
}

export interface CameraFaderController {
  mesh: THREE.Mesh;
  fadeTo: (alpha: number) => void;
  setAlphaImmediate: (alpha: number) => void;
  update: () => void;
}

export interface MuseumRoomBuildResult {
  root: THREE.Group;
  viewNode: THREE.Object3D;
  camera: THREE.PerspectiveCamera;
  pictureMeshes: THREE.Mesh[];
  pictureXPositions: number[];
  roomConfig: RoomConfigMetrics;
  portal1Anchor: THREE.Object3D;
  portal2Anchor: THREE.Object3D;
  portal1Glow: THREE.Object3D;
  portal2Glow: THREE.Object3D;
  previewNextMesh: THREE.Mesh;
  previewPrevMesh: THREE.Mesh;
  reflector01: THREE.Object3D;
  reflector02: THREE.Object3D;
}

export interface RoomConfigMetrics {
  pathLength: number;
  picturesPosition: number[];
  cameraStartPosition: number;
  picturesDistanceFromStart: number[];
  picturesDistanceFromPrev: number[];
  firstPicDistance: number;
  secondPicDistance: number;
}
