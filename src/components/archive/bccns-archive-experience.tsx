"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { BsStars } from "react-icons/bs";
import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { archiveEffects, archiveGeometry } from "@/src/lib/archive";
import { ArchiveSearchBar } from "@/src/components/archive/archive-search-bar";
import { ImmersiveArchiveHUD } from "@/src/components/archive/immersive-archive-hud";
import type { ArchiveGlance } from "@/src/types";
import type {
  AppMode,
  ArchiveCollection,
  ArchiveGateView,
  AskView,
  ArchivePayload,
  ArchiveStation,
  CameraFaderController,
  CollectionKey,
  LoadedHallTextures,
  MuseumRoomBuildResult,
  PortalConfig,
  PortalEnergyController,
  PortalLightsController,
  PortalPreviewController,
  RoomConfigMetrics,
  StationPictureShaderController,
} from "@/src/types";

/**
 * SOURCE OF TRUTH KEYWORDS: BccnsArchiveExperience, rotunda, gallery dolly, DublinCore panel, collection map, deep links
 * WHAT: Interactive 3D digital archive for the Black Cultural Centre for Nova Scotia, Cherry Brook (established 1983).
 * WHY: Integrates the 3D rotunda and colonnade walk with the Next.js / Supabase Postgres Dublin Core catalog while honouring the Centre's voice, palette, and build rules.
 * WHERE: Rendered by app/page.tsx and app/museum/page.tsx.
 */

type CoverTransitionType = "nav-forward" | "nav-back" | "gate-switch";

/**
 * SOURCE OF TRUTH KEYWORDS: startViewTransition, bccns-gate, nav-forward, nav-back, gate-switch
 * WHAT: Runs a landing-cover update inside the browser view-transition callback.
 * WHY: addTransitionType is not a stable React export. document.startViewTransition is the public contract, and browsers without it apply the update immediately.
 * WHERE: showGateView in BccnsArchiveExperience.
 */
function runCoverTransition(update: () => void, type: CoverTransitionType) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = (
    document as Document & {
      startViewTransition?: (callback: () => void) => { finished: Promise<void> };
    }
  ).startViewTransition;
  if (reduced || typeof start !== "function") {
    update();
    return;
  }
  const root = document.documentElement;
  root.dataset.coverTransition = type;
  const clearType = () => {
    delete root.dataset.coverTransition;
  };
  try {
    start(update).finished.then(clearType, clearType);
  } catch {
    clearType();
    update();
  }
}

interface PreloaderState {
  active: boolean;
  title: string;
  flippedCount: number;
  percent: number;
}

function shortestAngleDiffDeg(fromDeg: number, toDeg: number): number {
  return ((((toDeg - fromDeg) % 360) + 540) % 360) - 180;
}

/**
 * SOURCE OF TRUTH KEYWORDS: nearestPortalDelta, PORTAL_CONFIGS, lock-on, rotunda
 * WHAT: Signed turn, in radians, from the current heading to the nearest gallery door.
 * WHY: The rotunda should settle on a door instead of resting in the gap between them.
 * WHERE: The hall animation loop and the arrow keys.
 */
function nearestPortalDelta(fromRad: number): number {
  const fromDeg = ((THREE.MathUtils.radToDeg(fromRad) % 360) + 360) % 360;
  let best = 0;
  let bestAbs = Infinity;
  for (const cfg of archiveEffects.PORTAL_CONFIGS) {
    const diff = shortestAngleDiffDeg(fromDeg, cfg.angleDeg);
    const abs = Math.abs(diff);
    if (abs < bestAbs) {
      bestAbs = abs;
      best = diff;
    }
  }
  return THREE.MathUtils.degToRad(best);
}

/**
 * SOURCE OF TRUTH KEYWORDS: portalStepDelta, ArrowLeft, ArrowRight, rotunda
 * WHAT: Signed turn to the next door in the requested direction, skipping the one already centered.
 * WHY: A key press should advance one lock-on stop, not a fraction of the gap.
 * WHERE: Hall arrow keys.
 */
function portalStepDelta(fromRad: number, direction: 1 | -1): number {
  const fromDeg = ((THREE.MathUtils.radToDeg(fromRad) % 360) + 360) % 360;
  let best = direction * 360;
  for (const cfg of archiveEffects.PORTAL_CONFIGS) {
    const diff = shortestAngleDiffDeg(fromDeg, cfg.angleDeg);
    if (Math.abs(diff) < 2) continue;
    if (direction > 0 && diff > 0 && diff < best) best = diff;
    if (direction < 0 && diff < 0 && diff > best) best = diff;
  }
  if (Math.abs(best) > 180) return THREE.MathUtils.degToRad(direction * 60);
  return THREE.MathUtils.degToRad(best);
}

/**
 * SOURCE OF TRUTH KEYWORDS: coastStationX, roomTargetX, picture lock-on, exit arches
 * WHAT: Settles the gallery walk on the station the camera has reached, or on the exit arches once the last board is behind it.
 * WHY: A fast scroll must stay on the board it reached. Passing the last board should hold the camera in front of the exit arches instead of rewinding.
 * WHERE: The gallery animation loop.
 */
function coastStationX(
  fromX: number,
  travel: number,
  minX: number,
  maxX: number,
  roomConfig: RoomConfigMetrics | null,
  count: number,
): number {
  const span = Math.max(0.001, maxX - minX);
  const viewX = (index: number) =>
    minX + (archiveEffects.getMarkerPercentage(index, roomConfig) / 100) * span;
  const stops = Array.from({ length: count }, (_, index) => viewX(index));
  if (stops.length === 0) return THREE.MathUtils.clamp(fromX, minX, maxX);

  // Same distance that counts as a real step. The dolly ends in front of the exit arches.
  const commit = 0.9;
  const lastPicture = stops[stops.length - 1];
  if (maxX > lastPicture + commit) stops.push(maxX);

  let nearest = 0;
  let nearestDist = Infinity;
  for (let index = 0; index < stops.length; index += 1) {
    const dist = Math.abs(stops[index] - fromX);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = index;
    }
  }
  if (Math.abs(travel) <= commit) return stops[nearest];

  const direction = travel > 0 ? 1 : -1;
  let reached = direction > 0 ? 0 : stops.length - 1;

  if (direction > 0) {
    for (let index = 0; index < stops.length; index += 1) {
      if (fromX + 0.05 >= stops[index]) reached = index;
    }
    if (reached < stops.length - 1 && fromX > stops[reached] + commit) {
      reached += 1;
    }
  } else {
    for (let index = stops.length - 1; index >= 0; index -= 1) {
      if (fromX - 0.05 <= stops[index]) reached = index;
    }
    if (reached > 0 && fromX < stops[reached] - commit) {
      reached -= 1;
    }
  }

  return stops[reached];
}

/**
 * SOURCE OF TRUTH KEYWORDS: disposeMaterial, disposeSceneTree, disposeEngineResources, WebGL memory leak
 * WHAT: Recursively disposes Three.js geometries, materials, and textures from a scene object graph,
 *       plus all shader controller resources tracked in the engine state. Shared hall textures
 *       (noise, platform, floor, rotunda preview, collection previews) are preserved because they
 *       are reused across scene transitions.
 * WHY: st.scene.remove(root) only detaches objects from the scene graph. It does NOT free WebGL
 *      GPU memory. Without explicit disposal, every rotunda↔gallery transition leaks textures,
 *      materials, and geometries, eventually crashing the tab on low-end devices.
 * WHERE: Called in mountRotundaScene, transitionToCollectionRoom, and the component unmount cleanup.
 */

function isSharedHallTexture(tex: THREE.Texture | null, st: { textures: { noise: THREE.Texture | null; platform: THREE.Texture | null; floor: THREE.Texture | null; rotundaPreview: THREE.Texture | null; previewsByCollection: Partial<Record<string, THREE.Texture | null>> } | null }): boolean {
  if (!tex || !st.textures) return false;
  const t = st.textures;
  return (
    tex === t.noise ||
    tex === t.platform ||
    tex === t.floor ||
    tex === t.rotundaPreview ||
    Object.values(t.previewsByCollection).includes(tex)
  );
}

interface UniformTextureEntry {
  value?: THREE.Texture | THREE.Texture[] | object | string | number | boolean | null;
}

interface MaterialWithUniforms {
  uniforms?: Record<string, UniformTextureEntry>;
}

interface MaterialTextureHolder {
  [key: string]: THREE.Texture | THREE.Texture[] | object | string | number | boolean | null | undefined;
}

function disposeMaterial(mat: THREE.Material, st: { textures: LoadedHallTextures | null }): void {
  // Dispose textures bound in uniforms (ShaderMaterial)
  const matUniforms = (mat as MaterialWithUniforms).uniforms;
  if (matUniforms) {
    for (const key of Object.keys(matUniforms)) {
      const u = matUniforms[key];
      if (u && u.value instanceof THREE.Texture && !isSharedHallTexture(u.value, st)) {
        u.value.dispose();
      }
      if (u && Array.isArray(u.value)) {
        u.value.forEach((v) => {
          if (v instanceof THREE.Texture && !isSharedHallTexture(v, st)) {
            v.dispose();
          }
        });
      }
    }
  }

  // Dispose textures bound directly on the material (map, alphaMap, etc.)
  const matHolder = mat as unknown as MaterialTextureHolder;
  for (const key of Object.keys(mat)) {
    const val = matHolder[key];
    if (val instanceof THREE.Texture && !isSharedHallTexture(val, st)) {
      val.dispose();
    }
    if (Array.isArray(val)) {
      val.forEach((v) => {
        if (v instanceof THREE.Texture && !isSharedHallTexture(v, st)) {
          v.dispose();
        }
      });
    }
  }

  mat.dispose();
}

function disposeSceneTree(obj: THREE.Object3D, st: { textures: LoadedHallTextures | null }): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        const mats = Array.isArray(child.material)
          ? child.material
          : [child.material];
        mats.forEach((m) => disposeMaterial(m, st));
      }
    }
  });
}

function disposeEngineResources(st: {
  energyControllers: PortalEnergyController[];
  lightControllers: PortalLightsController[];
  previewControllers: PortalPreviewController[];
  stationShaderControllers: StationPictureShaderController[];
  roomFaderController: CameraFaderController | null;
  floorReflectors: Reflector[];
  interactivePortalMeshes: THREE.Mesh[];
  roomPortalMeshes: THREE.Mesh[];
  textures: LoadedHallTextures | null;
}): void {
  // Energy controllers (PortalEnergyField ShaderMaterial meshes)
  st.energyControllers.forEach((ctrl) => {
    if (ctrl.mesh) {
      if (ctrl.mesh.geometry) ctrl.mesh.geometry.dispose();
      if (ctrl.mesh.material) {
        const mats = Array.isArray(ctrl.mesh.material)
          ? ctrl.mesh.material
          : [ctrl.mesh.material];
        mats.forEach((m) => disposeMaterial(m, st));
      }
    }
    if (ctrl.material) disposeMaterial(ctrl.material, st);
  });
  st.energyControllers = [];

  // Preview controllers (PortalPreviewShader ShaderMaterial meshes)
  st.previewControllers.forEach((ctrl) => {
    if (ctrl.mesh) {
      if (ctrl.mesh.geometry) ctrl.mesh.geometry.dispose();
      if (ctrl.mesh.material) {
        const mats = Array.isArray(ctrl.mesh.material)
          ? ctrl.mesh.material
          : [ctrl.mesh.material];
        mats.forEach((m) => disposeMaterial(m, st));
      }
    }
    if (ctrl.material) disposeMaterial(ctrl.material, st);
  });
  st.previewControllers = [];

  // Station picture shader controllers (StationPictureShader ShaderMaterial meshes)
  st.stationShaderControllers.forEach((ctrl) => {
    if (ctrl.mesh) {
      if (ctrl.mesh.geometry) ctrl.mesh.geometry.dispose();
      if (ctrl.mesh.material) {
        const mats = Array.isArray(ctrl.mesh.material)
          ? ctrl.mesh.material
          : [ctrl.mesh.material];
        mats.forEach((m) => disposeMaterial(m, st));
      }
    }
    if (ctrl.material) disposeMaterial(ctrl.material, st);
  });
  st.stationShaderControllers = [];

  // Camera fader plane
  if (st.roomFaderController?.mesh) {
    const mesh = st.roomFaderController.mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      mats.forEach((m) => disposeMaterial(m, st));
    }
  }
  st.roomFaderController = null;

  // Floor reflectors (WebGLRenderTarget: must be disposed to avoid GPU memory leaks)
  if (!st.floorReflectors) st.floorReflectors = [];
  st.floorReflectors.forEach((r) => {
    const target = r.getRenderTarget();
    if (target) target.dispose();
    const mat = r.material;
    if (Array.isArray(mat)) {
      mat.forEach((m) => m.dispose());
    } else if (mat) {
      mat.dispose();
    }
  });
  st.floorReflectors = [];

  // Light controllers (PointLights: no GPU buffers to free, just clear refs)
  st.lightControllers = [];

  // Clear mesh reference arrays (meshes already disposed via scene traversal or above)
  st.interactivePortalMeshes = [];
  st.roomPortalMeshes = [];
}

/**
 * SOURCE OF TRUTH KEYWORDS: settledBrief, glance copy, two sentences
 * WHAT: Keeps the first two sentences of a chapter summary or record description.
 * WHY: The search sheet should open with a short note, not the full catalog entry.
 * WHERE: The settled glance passed to ArchiveAsk.
 */
function settledBrief(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const sentences = clean.split(/(?<=[.!?])\s+/);
  const short = sentences.slice(0, 2).join(" ");
  if (short.length <= 280) return short;
  return `${short.slice(0, 277).replace(/\s+\S*$/, "")}…`;
}

type SettledNote = ArchiveGlance & { view: AskView };

export function BccnsArchiveExperience({
  payload,
}: {
  payload: ArchivePayload;
}): React.JSX.Element {
  const { institution, collections } = payload;

  // --- React UI State ---
  const [gateView, setGateView] = useState<ArchiveGateView>("arrival");
  const [appMode, setAppMode] = useState<AppMode>("hall");
  const [activePortalId, setActivePortalId] = useState<number>(0);
  const [currentCollectionKey, setCurrentCollectionKey] =
    useState<CollectionKey>("slavery_and_halifax");

  const [roomProgress, setRoomProgress] = useState<number>(0);
  const [activeStationIndex, setActiveStationIndex] = useState<number>(0);
  const [activeRoomConfig, setActiveRoomConfig] =
    useState<RoomConfigMetrics | null>(null);

  const [welcomeOpen, setWelcomeOpen] = useState<boolean>(false);
  const [voiceOpen, setVoiceOpen] = useState<boolean>(false);
  const [mapOpen, setMapOpen] = useState<boolean>(false);
  const [centreModalOpen, setCentreModalOpen] = useState<boolean>(false);

  const [selectedRecordModal, setSelectedRecordModal] = useState<{
    station: ArchiveStation;
    index: number;
  } | null>(null);
  const [scanFailed, setScanFailed] = useState<boolean>(false);
  const [copiedRecordLink, setCopiedRecordLink] = useState<boolean>(false);
  const [copiedCitation, setCopiedCitation] = useState<boolean>(false);

  const [portalPromptText, setPortalPromptText] = useState<string | null>(null);
  const [cursorInteractive, setCursorInteractive] = useState<boolean>(false);

  const [preloader, setPreloader] = useState<PreloaderState>({
    active: false,
    title: "AFRICAN NOVA SCOTIANS IN THE AGE OF SLAVERY AND ABOLITION",
    flippedCount: 0,
    percent: 0,
  });

  // --- DOM & Mutable Engine Refs ---
  const mountRef = useRef<HTMLDivElement | null>(null);
  const scrubberTrackRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const arrivalViewRef = useRef<HTMLElement | null>(null);
  const askViewRef = useRef<HTMLElement | null>(null);
  const gateOpenRef = useRef(true);
  const settledKeyRef = useRef<string | null>(null);
  const [settledNote, setSettledNote] = useState<SettledNote | null>(null);

  const engineRef = useRef<{
    renderer: THREE.WebGLRenderer | null;
    scene: THREE.Scene | null;
    ambientLight: THREE.AmbientLight | null;
    activeCamera: THREE.PerspectiveCamera | null;
    viewNode: THREE.Object3D | null;
    textures: LoadedHallTextures | null;
    currentHallRoot: THREE.Group | null;
    currentRoomBuild: MuseumRoomBuildResult | null;
    appMode: AppMode;
    currentCollectionKey: CollectionKey;
    arrivalHidden: boolean;
    modalBlocking: boolean;
    isTransitioning: boolean;
    transitionCompletedAt: number;
    welcomeOpen: boolean;
    welcomeClosedOnce: boolean;
    voiceAutoHidden: boolean;
    energyControllers: PortalEnergyController[];
    lightControllers: PortalLightsController[];
    previewControllers: PortalPreviewController[];
    stationShaderControllers: StationPictureShaderController[];
    interactivePortalMeshes: THREE.Mesh[];
    roomPortalMeshes: THREE.Mesh[];
    roomFaderController: CameraFaderController | null;
    floorReflectors: Reflector[];
    currentRotY: number;
    targetRotY: number;
    rotationSpeed: number;
    activePortalId: number;
    roomMinX: number;
    roomMaxX: number;
    roomCurrentX: number;
    roomTargetX: number;
    roomProgress: number;
    activeStationIndex: number;
    roomLookRotX: number;
    roomLookRotY: number;
    roomTargetLookRotX: number;
    roomTargetLookRotY: number;
    hallTravel: number;
    roomTravel: number;
    hallLatch: number | null;
    roomLatch: number | null;
    hoveredPortalCfg: PortalConfig | null;
    hoveredPicMesh: THREE.Mesh | null;
    hoveredRoomPortalMesh: THREE.Mesh | null;
  }>({
    renderer: null,
    scene: null,
    ambientLight: null,
    activeCamera: null,
    viewNode: null,
    textures: null,
    currentHallRoot: null,
    currentRoomBuild: null,
    appMode: "hall",
    currentCollectionKey: "slavery_and_halifax",
    arrivalHidden: false,
    modalBlocking: false,
    isTransitioning: false,
    transitionCompletedAt: 0,
    welcomeOpen: false,
    welcomeClosedOnce: false,
    voiceAutoHidden: false,
    energyControllers: [],
    lightControllers: [],
    previewControllers: [],
    stationShaderControllers: [],
    interactivePortalMeshes: [],
    roomPortalMeshes: [],
    roomFaderController: null,
    floorReflectors: [],
    currentRotY: 0,
    targetRotY: 0,
    rotationSpeed: 0,
    activePortalId: 0,
    roomMinX: -50.1,
    roomMaxX: 25.0,
    roomCurrentX: -50.1,
    roomTargetX: -50.1,
    roomProgress: 0,
    activeStationIndex: 0,
    roomLookRotX: 0,
    roomLookRotY: 0,
    roomTargetLookRotX: 0,
    roomTargetLookRotY: 0,
    hallTravel: 0,
    roomTravel: 0,
    hallLatch: null,
    roomLatch: null,
    hoveredPortalCfg: null,
    hoveredPicMesh: null,
    hoveredRoomPortalMesh: null,
  });

  // Sync React modal state into engine ref
  const sceneOpen = gateView === "archive";

  useEffect(() => {
    engineRef.current.arrivalHidden = sceneOpen;
  }, [sceneOpen]);

  useEffect(() => {
    const wasOpen = gateOpenRef.current;
    gateOpenRef.current = !sceneOpen;
    if (wasOpen && sceneOpen) {
      document.getElementById("bccnsWordmarkBtn")?.focus();
      return;
    }
    if (sceneOpen) return;
    const activeView = gateView === "ask" ? askViewRef.current : arrivalViewRef.current;
    activeView?.focus();
  }, [gateView, sceneOpen]);

  useEffect(() => {
    engineRef.current.modalBlocking =
      Boolean(selectedRecordModal) || centreModalOpen || mapOpen;
  }, [selectedRecordModal, centreModalOpen, mapOpen]);

  useEffect(() => {
    engineRef.current.welcomeOpen = welcomeOpen;
  }, [welcomeOpen]);

  // Reset scanFailed when opening a record panel
  useEffect(() => {
    setScanFailed(false);
    setCopiedRecordLink(false);
    setCopiedCitation(false);
  }, [selectedRecordModal]);

  /**
   * SOURCE OF TRUTH KEYWORDS: syncDeepLinkUrl, collection URL, record URL
   * WHAT: Keeps the browser URL synchronized with the active collection and open archival record.
   * WHY: "Every collection and record has a URL... copy a link to that record."
   * WHERE: Called on gallery transition, rotunda return, and record open/close.
   */
  const syncDeepLinkUrl = (
    mode: AppMode,
    collectionKey?: CollectionKey,
    recordId?: string | null,
  ) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (mode === "hall") {
      url.searchParams.delete("collection");
      url.searchParams.delete("record");
    } else if (collectionKey) {
      url.searchParams.set("collection", collectionKey);
      if (recordId) {
        url.searchParams.set("record", recordId);
      } else {
        url.searchParams.delete("record");
      }
    }
    window.history.replaceState({}, "", url);
  };

  // --- Engine Navigation Actions ---
  const rotateToPortalAngle = (targetDeg: number) => {
    const st = engineRef.current;
    const currentDeg =
      ((THREE.MathUtils.radToDeg(st.targetRotY) % 360) + 360) % 360;
    const shortestDiff = shortestAngleDiffDeg(currentDeg, targetDeg);
    st.targetRotY += THREE.MathUtils.degToRad(shortestDiff);
    st.hallTravel = 0;
    st.hallLatch = null;
  };

  const setRoomProgressPercent = (pct: number) => {
    const st = engineRef.current;
    const clamped = Math.max(0, Math.min(100, pct));
    const span = Math.max(0.001, st.roomMaxX - st.roomMinX);
    st.roomTargetX = st.roomMinX + (clamped / 100) * span;
    st.roomTravel = 0;
    st.roomLatch = null;
    st.roomProgress = clamped;
    setRoomProgress(clamped);
  };

  const closeWelcomeCard = () => {
    const st = engineRef.current;
    if (!st.welcomeOpen) return;
    st.welcomeOpen = false;
    setWelcomeOpen(false);
    st.welcomeClosedOnce = true;
  };

  const openRecordPanel = (station: ArchiveStation, index: number) => {
    setSelectedRecordModal({ station, index });
    syncDeepLinkUrl("museum", engineRef.current.currentCollectionKey, station.id);
  };

  const closeRecordPanel = () => {
    setSelectedRecordModal(null);
    syncDeepLinkUrl(
      engineRef.current.appMode,
      engineRef.current.currentCollectionKey,
      null,
    );
  };

  const runPreloader = async (chapterTitle: string, durationMs = 340) => {
    setPreloader({
      active: true,
      title: chapterTitle,
      flippedCount: 0,
      percent: 0,
    });

    const stepMs = Math.max(10, Math.floor(durationMs / 15));
    for (let i = 1; i <= 15; i++) {
      await new Promise((r) => setTimeout(r, stepMs));
      setPreloader({
        active: true,
        title: chapterTitle,
        flippedCount: i,
        percent: Math.round((i / 15) * 100),
      });
    }
    await new Promise((r) => setTimeout(r, 50));
    setPreloader((prev) => ({ ...prev, active: false }));
  };

  const attachHallEffects = (hallRoot: THREE.Group) => {
    const st = engineRef.current;
    if (!st.textures) return;

    st.energyControllers = [];
    st.lightControllers = [];
    st.previewControllers = [];
    st.interactivePortalMeshes = [];

    const reflectorAnchor = hallRoot.getObjectByName("reflector");
    if (reflectorAnchor) {
      if (!st.floorReflectors) st.floorReflectors = [];
      st.floorReflectors.push(
        archiveEffects.createFloorReflector(reflectorAnchor, {
          width: 20,
          height: 20,
          opacity: 0.07,
          blur: 0,
          matteColor: 0xe8d9c8,
        }),
      );
    }

    for (const cfg of archiveEffects.PORTAL_CONFIGS) {
      const portalAnchor = hallRoot.getObjectByName(cfg.portalNode);
      if (portalAnchor) {
        const energy = archiveEffects.createPortalEnergyField(portalAnchor, {
          color: cfg.color,
          hoverColor: cfg.hoverColor,
          transparency: 0.34,
          size: 5.56,
          noiseTexture: st.textures.noise,
        });
        energy.mesh.userData.portalConfig = cfg;
        energy.mesh.userData.energyController = energy;
        st.energyControllers.push(energy);
        st.interactivePortalMeshes.push(energy.mesh);
      }

      const glowNode = hallRoot.getObjectByName(cfg.glowNode);
      if (glowNode) {
        const lights = archiveEffects.createPortalPointLights(glowNode, {
          color: cfg.color,
          intensity: 3.6,
          distance: 2.4,
          decay: 0.12,
        });
        st.lightControllers.push(lights);
      }

      const previewNode = hallRoot.getObjectByName(cfg.previewNode);
      if (previewNode) {
        previewNode.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            const previewCtrl = archiveEffects.applyPortalPreviewShader(mesh, {
              portalAngleDeg: cfg.angleDeg,
              shiftMultiplier: 0.002,
              maxShift: 0.06,
              texture:
                st.textures?.previewsByCollection[cfg.collectionKey] || null,
            });
            mesh.userData.portalConfig = cfg;
            mesh.userData.previewController = previewCtrl;
            st.previewControllers.push(previewCtrl);
            st.interactivePortalMeshes.push(mesh);
          }
        });
      }
    }

    const foundView = hallRoot.getObjectByName("View");
    const foundCam = hallRoot.getObjectByName("Camera") as
      | THREE.PerspectiveCamera
      | undefined;
    if (foundView && foundCam && foundCam.isCamera) {
      st.viewNode = foundView;
      st.activeCamera = foundCam;
      st.viewNode.rotation.set(0, st.currentRotY, 0);
      archiveEffects.updateResponsiveCameraZoom(
        st.activeCamera,
        window.innerWidth,
        window.innerHeight,
      );
    }
  };

  const mountRotundaScene = async () => {
    const st = engineRef.current;
    if (!st.scene || !st.renderer || !st.textures) return;

    if (st.currentRoomBuild) {
      disposeSceneTree(st.currentRoomBuild.root, st);
      disposeEngineResources(st);
      archiveGeometry.resetGeometryCache();
      st.scene.remove(st.currentRoomBuild.root);
      st.currentRoomBuild = null;
    }
    if (st.currentHallRoot) {
      disposeSceneTree(st.currentHallRoot, st);
      st.scene.remove(st.currentHallRoot);
      st.currentHallRoot = null;
    }

    st.appMode = "hall";
    settledKeyRef.current = null;
    setSettledNote(null);
    setAppMode("hall");
    setWelcomeOpen(false);
    setVoiceOpen(false);
    setPortalPromptText(null);

    st.scene.background = new THREE.Color(0xe8d9c8);
    st.scene.fog = new THREE.Fog(0xe8d9c8, 8, 30);
    st.renderer.setClearColor(0xe8d9c8, 1);
    if (st.ambientLight) st.ambientLight.intensity = 3.2;

    st.currentHallRoot = archiveGeometry.buildProceduralHallScene(
      st.textures,
      archiveEffects.PORTAL_CONFIGS,
    );
    st.scene.add(st.currentHallRoot);
    attachHallEffects(st.currentHallRoot);
  };

  const transitionToCollectionRoom = async (
    collectionKey: CollectionKey,
    options?: { skipPreloader?: boolean; initialRecordId?: string | null },
  ) => {
    const st = engineRef.current;
    if (!st.scene || !st.renderer || !st.textures) return;
    if (st.isTransitioning) return;

    const targetCollection =
      collections.find((c) => c.key === collectionKey) ?? collections[0];
    if (!targetCollection) return;

    st.isTransitioning = true;
    st.hoveredPortalCfg = null;
    st.hoveredPicMesh = null;
    st.hoveredRoomPortalMesh = null;
    document.body.style.cursor = "default";
    setCursorInteractive(false);
    setPortalPromptText(null);

    const validKey = targetCollection.key;
    const portalTheme =
      archiveEffects.ROOM_PORTAL_THEME[validKey] ||
      archiveEffects.ROOM_PORTAL_THEME.slavery_and_halifax;
    const limits = archiveEffects.computeRoomLimitsForStationCount(
      targetCollection.stations.length,
    );

    if (!options?.skipPreloader) {
      await runPreloader(targetCollection.chapterTitle);
    }

    if (st.currentHallRoot) {
      disposeSceneTree(st.currentHallRoot, st);
      st.scene.remove(st.currentHallRoot);
      st.currentHallRoot = null;
    }
    if (st.currentRoomBuild) {
      disposeSceneTree(st.currentRoomBuild.root, st);
      disposeEngineResources(st);
      archiveGeometry.resetGeometryCache();
      st.scene.remove(st.currentRoomBuild.root);
      st.currentRoomBuild = null;
    }

    st.currentCollectionKey = validKey;
    st.appMode = "museum";
    st.roomMinX = limits.min[0];
    st.roomMaxX = limits.max[0];
    st.welcomeClosedOnce = false;
    st.voiceAutoHidden = false;
    // Entering an archway should never automatically pop up a card
    st.welcomeOpen = false;

    setCurrentCollectionKey(validKey);
    settledKeyRef.current = null;
    setSettledNote(null);
    setAppMode("museum");
    setWelcomeOpen(false);
    setVoiceOpen(false);
    setActiveStationIndex(0);
    setRoomProgress(0);
    setPortalPromptText(null);

    syncDeepLinkUrl("museum", validKey, options?.initialRecordId ?? null);

    st.scene.background = new THREE.Color(portalTheme.bgColor);
    st.scene.fog = new THREE.Fog(portalTheme.fogColor, 7, 23);
    st.renderer.setClearColor(portalTheme.bgColor, 1);
    if (st.ambientLight) st.ambientLight.intensity = 3.1;

    const roomBuild = await archiveGeometry.buildMuseumRoomScene({
      collection: targetCollection,
      allCollections: collections,
      roomLimits: limits,
      portalTheme,
      textures: st.textures,
    });

    st.currentRoomBuild = roomBuild;
    st.scene.add(roomBuild.root);
    setActiveRoomConfig(roomBuild.roomConfig);

    // Dispose reflectors from previous scene so they don't leak GPU memory
    if (!st.floorReflectors) st.floorReflectors = [];
    st.floorReflectors.forEach((r) => {
      const target = r.getRenderTarget();
      if (target) target.dispose();
      const mat = r.material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => m.dispose());
      } else if (mat) {
        mat.dispose();
      }
    });
    st.floorReflectors = [];

    st.floorReflectors.push(
      archiveEffects.createFloorReflector(roomBuild.reflector01, {
        width: 26,
        height: 19,
        opacity: 0.055,
        matteColor: 0xe8d9c8,
      }),
      archiveEffects.createFloorReflector(roomBuild.reflector02, {
        width: 26,
        height: 19,
        opacity: 0.055,
        matteColor: 0xe8d9c8,
      }),
    );

    st.energyControllers = [];
    st.lightControllers = [];
    st.previewControllers = [];
    st.stationShaderControllers = [];
    st.roomPortalMeshes = [];

    const nextKey = portalTheme.nextCollection;
    const prevKey = portalTheme.prevCollection;
    const nextColObj =
      nextKey !== "hall" ? collections.find((c) => c.key === nextKey) : null;
    const prevColObj =
      prevKey !== "hall" ? collections.find((c) => c.key === prevKey) : null;

    const nextPortalLabel = nextColObj
      ? `NEXT COLLECTION: ${nextColObj.title}`
      : "RETURN TO CENTRE ROTUNDA";
    const prevPortalLabel = prevColObj
      ? `PREVIOUS COLLECTION: ${prevColObj.title}`
      : "RETURN TO CENTRE ROTUNDA";

    const e1 = archiveEffects.createPortalEnergyField(roomBuild.portal1Anchor, {
      color: portalTheme.portal1Color,
      hoverColor: portalTheme.portal1Hover,
      transparency: 0.42,
      width: 3.64,
      size: 5.56,
      noiseTexture: st.textures.noise,
    });
    e1.mesh.rotation.y = -Math.PI / 2;
    e1.mesh.userData.portalTarget = nextKey;
    e1.mesh.userData.portalLabel = nextPortalLabel;
    st.energyControllers.push(e1);
    st.roomPortalMeshes.push(e1.mesh);

    const e2 = archiveEffects.createPortalEnergyField(roomBuild.portal2Anchor, {
      color: portalTheme.portal2Color,
      hoverColor: portalTheme.portal2Hover,
      transparency: 0.42,
      width: 3.64,
      size: 5.56,
      noiseTexture: st.textures.noise,
    });
    e2.mesh.rotation.y = -Math.PI / 2;
    e2.mesh.userData.portalTarget = prevKey;
    e2.mesh.userData.portalLabel = prevPortalLabel;
    st.energyControllers.push(e2);
    st.roomPortalMeshes.push(e2.mesh);

    // Point lights inside the end-of-hallway twin arches
    st.lightControllers.push(
      archiveEffects.createPortalPointLights(roomBuild.portal1Glow, {
        color: portalTheme.portal1Color,
        intensity: 3.2,
        distance: 2.6,
        decay: 0.14,
      }),
      archiveEffects.createPortalPointLights(roomBuild.portal2Glow, {
        color: portalTheme.portal2Color,
        intensity: 3.2,
        distance: 2.6,
        decay: 0.14,
      }),
    );

    // Wavy + hover shader on both end-of-hallway archway preview images
    const pNextCtrl = archiveEffects.applyPortalPreviewShader(
      roomBuild.previewNextMesh,
      {
        portalAngleDeg: 0,
        shiftMultiplier: 0.002,
        maxShift: 0.08,
      },
    );
    roomBuild.previewNextMesh.userData.portalTarget = nextKey;
    roomBuild.previewNextMesh.userData.portalLabel = nextPortalLabel;
    st.previewControllers.push(pNextCtrl);
    st.roomPortalMeshes.push(roomBuild.previewNextMesh);

    const pPrevCtrl = archiveEffects.applyPortalPreviewShader(
      roomBuild.previewPrevMesh,
      {
        portalAngleDeg: 0,
        shiftMultiplier: 0.002,
        maxShift: 0.08,
      },
    );
    roomBuild.previewPrevMesh.userData.portalTarget = prevKey;
    roomBuild.previewPrevMesh.userData.portalLabel = prevPortalLabel;
    st.previewControllers.push(pPrevCtrl);
    st.roomPortalMeshes.push(roomBuild.previewPrevMesh);

    // Picture lamp falloff on the scan and the title, so both share one pool of light.
    const shadeBoardSurface = (mesh: THREE.Mesh, wave: boolean) => {
      const mat = mesh.material;
      const first = Array.isArray(mat) ? mat[0] : mat;
      const tex = (first as THREE.MeshBasicMaterial | undefined)?.map ?? null;
      return archiveEffects.applyStationPictureShader(mesh, {
        texture: tex,
        accentColor: targetCollection.washHex,
        lampBase: Number(mesh.userData.lampBase ?? 0),
        lampScale: Number(mesh.userData.lampScale ?? 1),
        wave,
      });
    };
    for (const picMesh of roomBuild.pictureMeshes) {
      st.stationShaderControllers.push(shadeBoardSurface(picMesh, true));
    }
    for (const labelMesh of roomBuild.stationLabelMeshes) {
      shadeBoardSurface(labelMesh, false);
    }

    st.viewNode = roomBuild.viewNode;
    st.activeCamera = roomBuild.camera;
    st.roomCurrentX = st.roomMinX;
    st.roomTargetX = st.roomMinX;
    st.roomTravel = 0;
    st.roomLatch = null;
    st.roomProgress = 0;
    st.activeStationIndex = 0;
    st.roomLookRotX = 0;
    st.roomLookRotY = 0;
    st.roomTargetLookRotX = 0;
    st.roomTargetLookRotY = 0;

    // If deep-linked to a specific record, dolly directly to that station and open its panel
    if (options?.initialRecordId) {
      const targetIdx = targetCollection.stations.findIndex(
        (s) => s.id === options.initialRecordId,
      );
      if (targetIdx >= 0) {
        const pct = archiveEffects.getMarkerPercentage(
          targetIdx,
          roomBuild.roomConfig,
        );
        const span = st.roomMaxX - st.roomMinX;
        st.roomCurrentX = st.roomMinX + (pct / 100) * span;
        st.roomTargetX = st.roomCurrentX;
        st.roomProgress = pct;
        st.activeStationIndex = targetIdx;
        setRoomProgress(pct);
        setActiveStationIndex(targetIdx);
        setSelectedRecordModal({
          station: targetCollection.stations[targetIdx],
          index: targetIdx,
        });
      }
    }

    st.viewNode.position.set(st.roomCurrentX, 1.8, 0);
    st.viewNode.rotation.set(0, -Math.PI / 2, 0);
    st.activeCamera.rotation.order = "YXZ";
    st.activeCamera.rotation.set(0, 0, 0);
    archiveEffects.updateRoomCameraProjection(
      st.activeCamera,
      window.innerWidth,
      window.innerHeight,
      53.7,
    );

    st.roomFaderController = archiveEffects.createCameraFaderPlane(
      st.viewNode,
      1.0,
    );
    st.roomFaderController.fadeTo(0.0);
    st.isTransitioning = false;
    st.transitionCompletedAt = performance.now();
  };

  const returnToRotundaScene = async () => {
    const st = engineRef.current;
    if (st.isTransitioning) return;
    st.isTransitioning = true;
    st.hoveredPortalCfg = null;
    st.hoveredPicMesh = null;
    st.hoveredRoomPortalMesh = null;
    const cfg =
      archiveEffects.PORTAL_CONFIGS.find(
        (c) => c.collectionKey === st.currentCollectionKey,
      ) || archiveEffects.PORTAL_CONFIGS[0];
    await runPreloader("BLACK CULTURAL CENTRE ROTUNDA", 280);

    syncDeepLinkUrl("hall");

    // The latch still holds the unwrapped heading from before the hallway.
    // Chasing it spins the rotunda through every arch on the way back.
    st.hallTravel = 0;
    st.hallLatch = null;
    st.rotationSpeed = 0;
    st.currentRotY = THREE.MathUtils.degToRad(cfg.angleDeg);
    st.targetRotY = st.currentRotY;
    st.activePortalId = cfg.id;
    setActivePortalId(cfg.id);
    await mountRotundaScene();
    st.isTransitioning = false;
    st.transitionCompletedAt = performance.now();
  };

  // --- Keyboard Navigation & Escape to Close Topmost Panel ---
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedRecordModal) {
          closeRecordPanel();
          return;
        }
        if (centreModalOpen) {
          setCentreModalOpen(false);
          return;
        }
        if (mapOpen) {
          setMapOpen(false);
          return;
        }
        if (voiceOpen) {
          setVoiceOpen(false);
          return;
        }
        if (welcomeOpen) {
          closeWelcomeCard();
          return;
        }
      }

      const st = engineRef.current;
      if (!st.arrivalHidden || st.modalBlocking) return;

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const forward = e.key === "ArrowRight";
        if (st.appMode === "hall") {
          st.hallTravel = 0;
          st.hallLatch = null;
          st.targetRotY += portalStepDelta(st.targetRotY, forward ? -1 : 1);
        } else if (st.currentRoomBuild) {
          const count = st.currentRoomBuild.pictureMeshes.length;
          const span = Math.max(0.001, st.roomMaxX - st.roomMinX);
          const viewX = (index: number) =>
            st.roomMinX +
            (archiveEffects.getMarkerPercentage(index, st.currentRoomBuild?.roomConfig) / 100) * span;
          let nearest = 0;
          let nearestDist = Infinity;
          for (let index = 0; index < count; index += 1) {
            const dist = Math.abs(viewX(index) - st.roomTargetX);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearest = index;
            }
          }
          const next = THREE.MathUtils.clamp(
            nearest + (forward ? 1 : -1),
            0,
            Math.max(0, count - 1),
          );
          const stepped = nearestDist < 0.45 ? next : nearest;
          st.roomTravel = 0;
          st.roomLatch = null;
          st.roomTargetX = THREE.MathUtils.clamp(viewX(stepped), st.roomMinX, st.roomMaxX);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  // --- Mount WebGL Engine & Input Listeners ---
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const st = engineRef.current;
    const params = new URLSearchParams(window.location.search);
    const initialCollectionParam = (params.get("collection") ??
      params.get("target")) as CollectionKey | null;
    const initialRecordParam = params.get("record");
    const skipIntroParam =
      params.get("skipIntro") === "1" ||
      Boolean(initialCollectionParam) ||
      Boolean(initialRecordParam);

    if (skipIntroParam) {
      st.arrivalHidden = true;
      setGateView("archive");
    }

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0xe8d9c8, 1);
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe8d9c8);
    scene.fog = new THREE.Fog(0xe8d9c8, 8, 30);

    const ambientLight = new THREE.AmbientLight(0xfffaf0, 3.2);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff5e4, 1.1);
    dirLight.position.set(-5, 11, -5);
    scene.add(dirLight);

    const fallbackCamera = new THREE.PerspectiveCamera(
      31.42,
      window.innerWidth / window.innerHeight,
      0.1,
      34,
    );
    const fallbackView = new THREE.Object3D();
    fallbackView.position.set(0, 2.6, 0);
    fallbackCamera.position.set(0, 0, 4.5);
    fallbackView.add(fallbackCamera);
    scene.add(fallbackView);
    archiveEffects.updateResponsiveCameraZoom(
      fallbackCamera,
      window.innerWidth,
      window.innerHeight,
    );

    st.renderer = renderer;
    st.scene = scene;
    st.ambientLight = ambientLight;
    st.activeCamera = fallbackCamera;
    st.viewNode = fallbackView;
    let disposed = false;
    let rafId = 0;

    (async () => {
      const textureLoader = new THREE.TextureLoader();
      const loadedTextures = await archiveGeometry.loadHallTextures(
        textureLoader,
        collections,
        "/assets",
      );
      if (disposed) return;
      st.textures = loadedTextures;

      await mountRotundaScene();

      // Deep link support for ?collection=...&record=...
      if (initialCollectionParam) {
        const matchedCol = collections.find(
          (c) =>
            c.key === initialCollectionParam ||
            c.slug === initialCollectionParam,
        );
        if (matchedCol) {
          await transitionToCollectionRoom(matchedCol.key, {
            skipPreloader: true,
            initialRecordId: initialRecordParam,
          });
        }
      } else if (initialRecordParam) {
        for (const col of collections) {
          if (col.stations.some((s) => s.id === initialRecordParam)) {
            await transitionToCollectionRoom(col.key, {
              skipPreloader: true,
              initialRecordId: initialRecordParam,
            });
            break;
          }
        }
      }
    })();

    // --- Wheel, Pointer, and Touch Rotation / Dolly ---
    let isDragging = false;
    let isScrubbing = false;
    let pointerDownPos = { x: 0, y: 0 };
    let prevPointerX = 0;
    let prevPointerY = 0;
    const pointerNDC = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    // Screen-edge glance. Yaw is the wider motion; pitch stays a small nod.
    const lookYawLimit = 0.16;
    const lookPitchLimit = 0.07;
    let hallYaw = 0;
    let hallTargetYaw = 0;
    let hallPitch = 0;
    let hallTargetPitch = 0;
    let hallInputAt = 0;
    let roomInputAt = 0;

    const onWheel = (e: WheelEvent) => {
      const wheelTarget = e.target as HTMLElement | null;
      if (!st.arrivalHidden) {
        if (!wheelTarget?.closest(".bccns-arrival-card")) {
          e.preventDefault();
        }
        return;
      }
      if (wheelTarget?.closest("header")) return;
      if (st.modalBlocking) return;
      if (st.appMode === "hall") {
        hallInputAt = performance.now();
        st.hallLatch = null;
        const delta = THREE.MathUtils.clamp(e.deltaY * 0.001, -0.05, 0.05);
        st.hallTravel += delta;
        st.targetRotY += delta;
      } else if (st.appMode === "museum") {
        roomInputAt = performance.now();
        st.roomLatch = null;
        if (st.welcomeOpen) {
          closeWelcomeCard();
        }
        const roomDelta = e.deltaY * 0.006;
        st.roomTravel += roomDelta;
        st.roomTargetX = THREE.MathUtils.clamp(
          st.roomTargetX + roomDelta,
          st.roomMinX,
          st.roomMaxX,
        );
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!st.arrivalHidden) return;
      const targetEl = e.target as HTMLElement | null;
      if (
        targetEl?.closest("#bccnsScrubberTrack") &&
        !targetEl?.closest(".bccns-station-marker") &&
        scrubberTrackRef.current
      ) {
        isScrubbing = true;
        const rect = scrubberTrackRef.current.getBoundingClientRect();
        setRoomProgressPercent(((e.clientX - rect.left) / rect.width) * 100);
        return;
      }
      if (
        targetEl?.closest(
          "header, nav, section, footer, aside, .bccns-modal-backdrop, .bccns-collection-map",
        )
      ) {
        return;
      }
      isDragging = true;
      pointerDownPos = { x: e.clientX, y: e.clientY };
      prevPointerX = e.clientX;
      prevPointerY = e.clientY;
    };

    const onPointerUp = () => {
      isDragging = false;
      isScrubbing = false;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!st.arrivalHidden) {
        hallTargetYaw = 0;
        hallTargetPitch = 0;
        return;
      }

      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      }

      pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;

      if (isScrubbing && st.appMode === "museum" && scrubberTrackRef.current) {
        roomInputAt = performance.now();
        const rect = scrubberTrackRef.current.getBoundingClientRect();
        setRoomProgressPercent(((e.clientX - rect.left) / rect.width) * 100);
        return;
      }

      if (!st.activeCamera) return;

      if (st.appMode === "hall") {
        if (isDragging) {
          hallInputAt = performance.now();
          st.hallLatch = null;
          const dx = e.clientX - prevPointerX;
          prevPointerX = e.clientX;
          const delta = THREE.MathUtils.clamp(dx * 0.006, -0.6, 0.6);
          st.hallTravel += delta;
          st.targetRotY += delta;
        }

        raycaster.setFromCamera(pointerNDC, st.activeCamera);
        const hits = raycaster.intersectObjects(
          st.interactivePortalMeshes,
          false,
        );
        const hitMesh = hits.length > 0 ? (hits[0].object as THREE.Mesh) : null;

        const cfg = hitMesh
          ? (hitMesh.userData.portalConfig as PortalConfig | undefined) || null
          : null;

        st.energyControllers.forEach((ctrl) => {
          const ctrlCfg = ctrl.mesh.userData.portalConfig as
            | PortalConfig
            | undefined;
          ctrl.setHovered(Boolean(cfg && ctrlCfg && ctrlCfg.id === cfg.id));
        });

        st.previewControllers.forEach((ctrl) => {
          const ctrlCfg = ctrl.mesh.userData.portalConfig as
            | PortalConfig
            | undefined;
          ctrl.setHovered(Boolean(cfg && ctrlCfg && ctrlCfg.id === cfg.id));
        });

        st.hoveredPortalCfg = cfg;
        const isInteractive = Boolean(cfg);
        document.body.style.cursor = isInteractive ? "pointer" : "default";
        setCursorInteractive(isInteractive);
        setPortalPromptText(
          cfg ? `ENTER COLLECTION: ${cfg.title} (${cfg.years})` : null,
        );

        hallTargetYaw = THREE.MathUtils.clamp(
          -pointerNDC.x * lookYawLimit,
          -lookYawLimit,
          lookYawLimit,
        );
        hallTargetPitch = THREE.MathUtils.clamp(
          pointerNDC.y * lookPitchLimit,
          -lookPitchLimit,
          lookPitchLimit,
        );
      } else if (st.appMode === "museum" && st.currentRoomBuild) {
        // Local camera yaw/pitch. The rig heading stays fixed so the horizon does not bank.
        st.roomTargetLookRotY = THREE.MathUtils.clamp(
          -pointerNDC.x * lookYawLimit,
          -lookYawLimit,
          lookYawLimit,
        );
        st.roomTargetLookRotX = THREE.MathUtils.clamp(
          pointerNDC.y * lookPitchLimit,
          -lookPitchLimit,
          lookPitchLimit,
        );

        if (isDragging) {
          roomInputAt = performance.now();
          st.roomLatch = null;
          const dx = e.clientX - prevPointerX;
          const dy = e.clientY - prevPointerY;
          prevPointerX = e.clientX;
          prevPointerY = e.clientY;
          // Touch and pointer drag use the same smooth dolly as the wheel
          const primaryDelta = Math.abs(dx) >= Math.abs(dy) ? -dx : dy;
          if (st.welcomeOpen && Math.abs(primaryDelta) > 4) {
            closeWelcomeCard();
          }
          const roomDelta = primaryDelta * 0.045;
          st.roomTravel += roomDelta;
          st.roomTargetX = THREE.MathUtils.clamp(
            st.roomTargetX + roomDelta,
            st.roomMinX,
            st.roomMaxX,
          );
        }

        raycaster.setFromCamera(pointerNDC, st.activeCamera);
        const picHits = raycaster.intersectObjects(
          [
            ...st.currentRoomBuild.pictureMeshes,
            ...st.currentRoomBuild.stationLabelMeshes,
          ],
          false,
        );
        const validPicHit = picHits.find((h) => h.distance <= 16);
        const hitMesh = validPicHit ? (validPicHit.object as THREE.Mesh) : null;
        const linkedPicture = hitMesh?.userData.stationPicture as
          | THREE.Mesh
          | undefined;
        st.hoveredPicMesh = linkedPicture ?? hitMesh;

        st.stationShaderControllers.forEach((ctrl) => {
          ctrl.setHovered(ctrl.mesh === st.hoveredPicMesh);
        });

        const portalHits = raycaster.intersectObjects(
          st.roomPortalMeshes,
          false,
        );
        const validPortalHit = portalHits.find((h) => h.distance <= 20);
        st.hoveredRoomPortalMesh = validPortalHit
          ? (validPortalHit.object as THREE.Mesh)
          : null;

        const hoveredTarget = st.hoveredRoomPortalMesh?.userData?.portalTarget;

        st.energyControllers.forEach((ctrl) => {
          ctrl.setHovered(
            Boolean(
              hoveredTarget &&
                ctrl.mesh.userData.portalTarget === hoveredTarget,
            ),
          );
        });

        st.previewControllers.forEach((ctrl) => {
          ctrl.setHovered(
            Boolean(
              hoveredTarget &&
                ctrl.mesh.userData.portalTarget === hoveredTarget,
            ),
          );
        });

        if (st.hoveredPicMesh && st.hoveredPicMesh.userData.stationData) {
          const station = st.hoveredPicMesh.userData
            .stationData as ArchiveStation;
          document.body.style.cursor = "pointer";
          setCursorInteractive(true);
          setPortalPromptText(
            `READ RECORD: ${station.dc_title} (${station.display_year})`,
          );
        } else if (
          st.hoveredRoomPortalMesh &&
          st.hoveredRoomPortalMesh.userData.portalLabel
        ) {
          document.body.style.cursor = "pointer";
          setCursorInteractive(true);
          setPortalPromptText(
            String(st.hoveredRoomPortalMesh.userData.portalLabel),
          );
        } else {
          document.body.style.cursor = "default";
          setCursorInteractive(false);
          setPortalPromptText(null);
        }
      }
    };

    const onClick = (e: MouseEvent) => {
      if (
        !st.arrivalHidden ||
        st.modalBlocking ||
        st.isTransitioning ||
        performance.now() - st.transitionCompletedAt < 450
      ) {
        return;
      }
      const targetEl = e.target as HTMLElement | null;
      if (
        targetEl?.closest(
          "header, nav, section, footer, aside, .bccns-modal-backdrop, .bccns-collection-map, .bccns-preloader",
        )
      ) {
        return;
      }

      const moveDist = Math.hypot(
        e.clientX - pointerDownPos.x,
        e.clientY - pointerDownPos.y,
      );
      if (moveDist > 8) return;

      if (st.appMode === "hall" && st.hoveredPortalCfg) {
        const cameraDeg =
          ((THREE.MathUtils.radToDeg(st.currentRotY) % 360) + 360) % 360;
        const diffDeg = Math.abs(
          shortestAngleDiffDeg(cameraDeg, st.hoveredPortalCfg.angleDeg),
        );
        if (diffDeg <= 24) {
          transitionToCollectionRoom(st.hoveredPortalCfg.collectionKey);
        } else {
          rotateToPortalAngle(st.hoveredPortalCfg.angleDeg);
        }
      } else if (st.appMode === "museum") {
        if (st.hoveredPicMesh && st.hoveredPicMesh.userData.stationData) {
          openRecordPanel(
            st.hoveredPicMesh.userData.stationData as ArchiveStation,
            Number(st.hoveredPicMesh.userData.stationIndex || 0),
          );
        } else if (
          st.hoveredRoomPortalMesh &&
          st.hoveredRoomPortalMesh.userData.portalTarget
        ) {
          const target = st.hoveredRoomPortalMesh.userData.portalTarget as
            | CollectionKey
            | "hall";
          if (target === "hall") {
            returnToRotundaScene();
          } else {
            transitionToCollectionRoom(target);
          }
        }
      }
    };

    const onResize = () => {
      if (!st.renderer || !st.activeCamera) return;
      st.renderer.setSize(window.innerWidth, window.innerHeight);
      if (st.appMode === "hall") {
        archiveEffects.updateResponsiveCameraZoom(
          st.activeCamera,
          window.innerWidth,
          window.innerHeight,
        );
      } else {
        archiveEffects.updateRoomCameraProjection(
          st.activeCamera,
          window.innerWidth,
          window.innerHeight,
          53.7,
        );
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!st.arrivalHidden) {
        const touchTarget = e.target as HTMLElement | null;
        if (!touchTarget?.closest(".bccns-arrival-card")) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("click", onClick);
    window.addEventListener("resize", onResize);

    // --- Main Animation Loop ---
    const clock = new THREE.Clock();
    const animate = () => {
      if (disposed) return;
      rafId = requestAnimationFrame(animate);

      const dt = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      if (st.appMode === "hall" && st.viewNode) {
        if (!st.arrivalHidden) {
          hallTargetYaw = 0;
          hallTargetPitch = 0;
        }
        const diff = st.targetRotY - st.currentRotY;
        const hallIdle = st.arrivalHidden && !isDragging && performance.now() - hallInputAt > 180;
        if (!hallIdle) {
          st.hallLatch = null;
        } else {
          if (st.hallLatch === null) {
            const commit = THREE.MathUtils.degToRad(7);
            const delta =
              Math.abs(st.hallTravel) > commit
                ? portalStepDelta(st.targetRotY, st.hallTravel > 0 ? 1 : -1)
                : nearestPortalDelta(st.targetRotY);
            st.hallLatch = st.targetRotY + delta;
            st.hallTravel = 0;
          }
          const pull = 1 - Math.exp(-2.8 * dt);
          const gap = THREE.MathUtils.degToRad(
            shortestAngleDiffDeg(
              THREE.MathUtils.radToDeg(st.targetRotY),
              THREE.MathUtils.radToDeg(st.hallLatch),
            ),
          );
          st.targetRotY += gap * pull;
        }
        if (Math.abs(diff) > 1e-4) {
          st.rotationSpeed = Math.min(st.rotationSpeed + 0.3 * dt, 0.12);
          const step = THREE.MathUtils.clamp(
            diff * 4.5 * dt,
            -st.rotationSpeed,
            st.rotationSpeed,
          );
          st.currentRotY += step;
        } else {
          st.rotationSpeed = 0;
        }
        hallYaw += (hallTargetYaw - hallYaw) * 0.12;
        hallPitch += (hallTargetPitch - hallPitch) * 0.12;
        st.viewNode.rotation.set(0, st.currentRotY, 0);
        if (st.activeCamera) {
          st.activeCamera.rotation.order = "YXZ";
          st.activeCamera.rotation.y = hallYaw;
          st.activeCamera.rotation.x = hallPitch;
          st.activeCamera.rotation.z = 0;
        }

        const cameraDeg =
          ((THREE.MathUtils.radToDeg(st.currentRotY) % 360) + 360) % 360;
        for (const cfg of archiveEffects.PORTAL_CONFIGS) {
          const deltaDeg = Math.abs(
            shortestAngleDiffDeg(cameraDeg, cfg.angleDeg),
          );
          if (deltaDeg <= 26 && st.activePortalId !== cfg.id) {
            st.activePortalId = cfg.id;
            setActivePortalId(cfg.id);
            break;
          }
        }

        const hallMoving = Math.abs(st.targetRotY - st.currentRotY) > 0.012;
        const latchGap =
          st.hallLatch === null
            ? 180
            : Math.abs(
                shortestAngleDiffDeg(
                  THREE.MathUtils.radToDeg(st.currentRotY),
                  THREE.MathUtils.radToDeg(st.hallLatch),
                ),
              );
        const hallSettled = hallIdle && !hallMoving && latchGap < 1.2;
        if (!hallSettled) {
          if (settledKeyRef.current !== null) {
            settledKeyRef.current = null;
            setSettledNote(null);
          }
        } else {
          const portal =
            archiveEffects.PORTAL_CONFIGS.find((item) => item.id === st.activePortalId) ??
            archiveEffects.PORTAL_CONFIGS[0];
          const key = `hall:${portal.collectionKey}`;
          if (settledKeyRef.current !== key) {
            settledKeyRef.current = key;
            const chapter = collections.find((item) => item.key === portal.collectionKey);
            setSettledNote({
              id: key,
              kicker: portal.years,
              title: portal.title,
              body: settledBrief(chapter?.summary || portal.subtitle),
              view: { scope: "room", collectionKey: portal.collectionKey },
            });
          }
        }

        for (const energy of st.energyControllers) energy.update(dt, elapsed);
        for (const lights of st.lightControllers) lights.update(dt, elapsed);
        for (const preview of st.previewControllers)
          preview.update(dt, elapsed, cameraDeg);
      } else if (
        st.appMode === "museum" &&
        st.currentRoomBuild &&
        st.viewNode
      ) {
        const roomIdle =
          st.arrivalHidden &&
          !st.modalBlocking &&
          !isDragging &&
          !isScrubbing &&
          performance.now() - roomInputAt > 180;
        if (!roomIdle) {
          st.roomLatch = null;
        } else if (st.currentRoomBuild.pictureMeshes.length > 0) {
          if (st.roomLatch === null) {
            st.roomLatch = coastStationX(
              st.roomTargetX,
              st.roomTravel,
              st.roomMinX,
              st.roomMaxX,
              st.currentRoomBuild.roomConfig,
              st.currentRoomBuild.pictureMeshes.length,
            );
            st.roomTravel = 0;
          }
          const pull = 1 - Math.exp(-2.6 * dt);
          st.roomTargetX += (st.roomLatch - st.roomTargetX) * pull;
        }
        st.roomCurrentX += (st.roomTargetX - st.roomCurrentX) * 0.085;
        st.viewNode.position.x = st.roomCurrentX;

        st.roomLookRotX += (st.roomTargetLookRotX - st.roomLookRotX) * 0.12;
        st.roomLookRotY += (st.roomTargetLookRotY - st.roomLookRotY) * 0.12;
        st.viewNode.rotation.set(0, -Math.PI / 2, 0);
        if (st.activeCamera) {
          st.activeCamera.rotation.order = "YXZ";
          st.activeCamera.rotation.y = st.roomLookRotY;
          st.activeCamera.rotation.x = st.roomLookRotX;
          st.activeCamera.rotation.z = 0;
        }

        const span = Math.max(0.001, st.roomMaxX - st.roomMinX);
        const pct = Math.max(
          0,
          Math.min(100, ((st.roomCurrentX - st.roomMinX) / span) * 100),
        );

        if (Math.abs(pct - st.roomProgress) > 0.05) {
          st.roomProgress = pct;
          setRoomProgress(pct);

          const activeCol = collections.find(
            (c) => c.key === st.currentCollectionKey,
          );
          const stations = activeCol?.stations || [];
          let foundIdx = st.activeStationIndex;
          for (let i = 0; i < stations.length; i++) {
            if (
              archiveEffects.isEventMarkerActive(
                i,
                stations.length,
                pct,
                st.currentRoomBuild.roomConfig,
              )
            ) {
              foundIdx = i;
            }
          }
          if (foundIdx !== st.activeStationIndex) {
            st.activeStationIndex = foundIdx;
            setActiveStationIndex(foundIdx);
            if (foundIdx > 1 && !st.voiceAutoHidden) {
              st.voiceAutoHidden = true;
              setVoiceOpen(false);
            }
          }
        }

        archiveEffects.updateLeapfrogReflectors(
          st.roomCurrentX,
          st.currentRoomBuild.reflector01,
          st.currentRoomBuild.reflector02,
        );

        const roomSettled =
          roomIdle &&
          st.roomLatch !== null &&
          Math.abs(st.roomCurrentX - st.roomLatch) < 0.18 &&
          Math.abs(st.roomTargetX - st.roomCurrentX) < 0.18;
        if (!roomSettled) {
          if (settledKeyRef.current !== null) {
            settledKeyRef.current = null;
            setSettledNote(null);
          }
        } else {
          const chapter = collections.find((item) => item.key === st.currentCollectionKey);
          const stations = chapter?.stations ?? [];
          let foundIdx = 0;
          for (let i = 0; i < stations.length; i += 1) {
            if (
              archiveEffects.isEventMarkerActive(
                i,
                stations.length,
                pct,
                st.currentRoomBuild.roomConfig,
              )
            ) {
              foundIdx = i;
            }
          }
          const station = stations[foundIdx];
          if (chapter && station) {
            const key = `room:${station.id}`;
            if (settledKeyRef.current !== key) {
              settledKeyRef.current = key;
              setSettledNote({
                id: key,
                kicker: station.display_year,
                title: station.dc_title,
                body: settledBrief(
                  station.dc_description || station.citation || station.dc_type,
                ),
                view: {
                  scope: "record",
                  collectionKey: chapter.key,
                  recordId: station.id,
                },
              });
            }
          }
        }

        for (const pic of st.currentRoomBuild.pictureMeshes) {
          const isHov = pic === st.hoveredPicMesh;
          const baseX = Number(pic.userData.baseX || 0);
          const baseZ = Number(pic.userData.baseZ || 0);
          const nX = Number(pic.userData.normalX || 0);
          const nZ = Number(pic.userData.normalZ || 0);
          // Hovered frames lift gently off the wall along their facing normal
          const lift = isHov ? 0.06 : 0;
          pic.position.x += (baseX + nX * lift - pic.position.x) * 0.14;
          pic.position.z += (baseZ + nZ * lift - pic.position.z) * 0.14;
        }

        if (st.roomFaderController) st.roomFaderController.update();
        for (const energy of st.energyControllers) energy.update(dt, elapsed);
        for (const lights of st.lightControllers) lights.update(dt, elapsed);
        for (const preview of st.previewControllers)
          preview.update(dt, elapsed, st.roomLookRotY * 18);
        for (const picShader of st.stationShaderControllers)
          picShader.update(dt, elapsed);
      }

      if (st.renderer && st.scene && st.activeCamera) {
        st.renderer.render(st.scene, st.activeCamera);
      }
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("click", onClick);
      window.removeEventListener("resize", onResize);

      const st = engineRef.current;
      if (st.currentRoomBuild) {
        disposeSceneTree(st.currentRoomBuild.root, st);
        disposeEngineResources(st);
        archiveGeometry.resetGeometryCache();
        st.scene?.remove(st.currentRoomBuild.root);
        st.currentRoomBuild = null;
      }
      if (st.currentHallRoot) {
        disposeSceneTree(st.currentHallRoot, st);
        st.scene?.remove(st.currentHallRoot);
        st.currentHallRoot = null;
      }

      // Dispose shared hall textures loaded once at mount
      const textures = st.textures;
      if (textures) {
        [textures.noise, textures.platform, textures.floor, textures.rotundaPreview].forEach((tex) => {
          if (tex) tex.dispose();
        });
        Object.values(textures.previewsByCollection).forEach((tex) => {
          if (tex) tex.dispose();
        });
        st.textures = null;
      }

      renderer.dispose();
    };
  }, []);

  // Derived active collection and station
  const activeCollection: ArchiveCollection =
    collections.find((c) => c.key === currentCollectionKey) ?? collections[0];
  const activeStations = activeCollection?.stations ?? [];
  const currentHeaderStation =
    activeStations[activeStationIndex] ?? activeStations[0];
  const copyRecordDeepLink = async () => {
    if (!selectedRecordModal || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("collection", activeCollection.key);
    url.searchParams.set("record", selectedRecordModal.station.id);
    try {
      await navigator.clipboard.writeText(url.toString());
    } catch {
      // Ignore clipboard permission errors
    }
    setCopiedRecordLink(true);
    setTimeout(() => setCopiedRecordLink(false), 2000);
  };

  const copyRecordCitation = async () => {
    if (!selectedRecordModal || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("collection", activeCollection.key);
    url.searchParams.set("record", selectedRecordModal.station.id);
    const citationWithUrl = `${selectedRecordModal.station.citation}. Archive link: ${url.toString()}`;
    try {
      await navigator.clipboard.writeText(citationWithUrl);
    } catch {
      // Ignore clipboard permission errors
    }
    setCopiedCitation(true);
    setTimeout(() => setCopiedCitation(false), 2000);
  };

  /**
   * SOURCE OF TRUTH KEYWORDS: gateTransitionType, nav-forward, nav-back, ArchiveGateView
   * WHAT: Names the direction of a landing-view change.
   * WHY: Entering the rotunda moves forward. Returning from ask to the introduction moves back. Switching into ask is a sideways step.
   * WHERE: showGateView.
   */
  const gateTransitionType = (next: ArchiveGateView): CoverTransitionType => {
    if (next === "archive") return "nav-forward";
    if (next === "arrival" && gateView === "ask") return "nav-back";
    return "gate-switch";
  };

  const showGateView = (next: ArchiveGateView) => {
    runCoverTransition(() => {
      flushSync(() => {
        setGateView(next);
      });
    }, gateTransitionType(next));
    if (next !== "archive") return;
    engineRef.current.arrivalHidden = true;
  };

  const WordmarkTag = sceneOpen ? "h1" : "p";

  return (
    <div className={`bccns-archive-root${sceneOpen ? "" : " bccns-arrival-locked"}`}>
      <div
        className="bccns-experience"
        inert={sceneOpen ? undefined : true}
        aria-hidden={sceneOpen ? undefined : true}
      >
      {/* 3D Rotunda & Gallery Colonnade WebGL Canvas */}
      <div className="bccns-webgl-stage" id="app" ref={mountRef} />

      {/* Custom Hover Cursor */}
      <div
        ref={cursorRef}
        className={`bccns-hover-cursor ${cursorInteractive ? "interactive" : ""}`}
        aria-hidden="true"
      />

      {/* Top Chrome: type only, sitting on the scene */}
      <header className="bccns-top-chrome">
        <WordmarkTag className="bccns-wordmark">
          <button
            type="button"
            id="bccnsWordmarkBtn"
            onClick={() => {
              if (appMode === "museum") {
                returnToRotundaScene();
              } else {
                rotateToPortalAngle(0);
              }
            }}
          >
            BCCNS
          </button>
        </WordmarkTag>

        <ImmersiveArchiveHUD view={settledNote?.view ?? null} glance={settledNote} />

        <nav className="bccns-top-actions" aria-label="Archive navigation">
          <button
            type="button"
            className={`bccns-text-link ${mapOpen ? "active" : ""}`}
            id="collectionMapBtn"
            onClick={() => setMapOpen((prev) => !prev)}
          >
            Map
          </button>
          {appMode === "museum" && (
            <>
              <button
                type="button"
                className={`bccns-text-link ${welcomeOpen ? "active" : ""}`}
                id="toggleWelcomeCardBtn"
                onClick={() => {
                  if (!welcomeOpen) {
                    engineRef.current.welcomeOpen = true;
                    setWelcomeOpen(true);
                    setVoiceOpen(false);
                  } else {
                    closeWelcomeCard();
                  }
                }}
              >
                Chapter
              </button>
              <button
                type="button"
                className={`bccns-text-link ${voiceOpen ? "active" : ""}`}
                id="curatorialVoiceBtn"
                onClick={() => {
                  engineRef.current.welcomeOpen = false;
                  setWelcomeOpen(false);
                  setVoiceOpen((prev) => !prev);
                }}
              >
                Voice
              </button>
            </>
          )}
          {appMode === "museum" && currentHeaderStation && (
            <button
              type="button"
              className="bccns-text-link"
              id="inspectCurrentStationBtn"
              onClick={() =>
                openRecordPanel(currentHeaderStation, activeStationIndex)
              }
            >
              Record
            </button>
          )}
          <button
            type="button"
            className="bccns-text-link"
            id="centreMandateBtn"
            onClick={() => setCentreModalOpen(true)}
          >
            The Centre
          </button>
        </nav>
      </header>

      {/* Hover / Action Prompt Pill */}
      <div
        className={`bccns-portal-prompt ${portalPromptText ? "visible" : ""}`}
        id="portalPrompt"
      >
        {portalPromptText || "SELECT ARCH TO ENTER COLLECTION"}
      </div>

      {/* Bottom 6-Collection Rotunda Dial (Hall Mode) */}
      <section
        className={`bccns-hall-nav ${appMode === "museum" ? "hidden-nav" : ""}`}
        id="hallNav"
        aria-label="Historical collections in the rotunda"
      >
        <div className="bccns-hall-dial" id="rotundaDial">
          {archiveEffects.PORTAL_CONFIGS.map((cfg) => (
            <button
              key={cfg.id}
              type="button"
              className={`bccns-dial-item ${activePortalId === cfg.id ? "active" : ""}`}
              data-collection={cfg.collectionKey}
              onClick={() => {
                const camDeg =
                  ((THREE.MathUtils.radToDeg(engineRef.current.currentRotY) %
                    360) +
                    360) %
                  360;
                if (Math.abs(shortestAngleDiffDeg(camDeg, cfg.angleDeg)) < 16) {
                  transitionToCollectionRoom(cfg.collectionKey);
                } else {
                  rotateToPortalAngle(cfg.angleDeg);
                }
              }}
            >
              <div className="bccns-dial-track">
                <div className="bccns-dial-dot" />
              </div>
              <div className="bccns-dial-meta">
                <div className="bccns-dial-title">{cfg.title}</div>
                <div className="bccns-dial-years">{cfg.years}</div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Gallery Walk Chronological Scrubber (Museum Mode) */}
      <section
        className={`bccns-gallery-scrubber ${appMode === "museum" ? "visible-scrubber" : ""}`}
        id="galleryScrubberNav"
        aria-label="Chronological stations along the gallery walk"
      >
        <div
          className="bccns-scrubber-track"
          id="bccnsScrubberTrack"
          ref={scrubberTrackRef}
          onPointerDown={(e) => {
            const targetEl = e.target as HTMLElement | null;
            if (targetEl?.closest(".bccns-station-marker")) return;
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            const rect = e.currentTarget.getBoundingClientRect();
            setRoomProgressPercent(((e.clientX - rect.left) / rect.width) * 100);
          }}
          onPointerMove={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setRoomProgressPercent(((e.clientX - rect.left) / rect.width) * 100);
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
        >
          <div className="bccns-scrubber-line" />
          <div>
            {activeStations.map((station, idx) => {
              const cfgOrLen = activeRoomConfig ?? activeStations.length;
              const pct = archiveEffects.getMarkerPercentage(idx, cfgOrLen);
              const isActive = archiveEffects.isEventMarkerActive(
                idx,
                activeStations.length,
                roomProgress,
                activeRoomConfig,
              );
              const yearMatch = station.display_year.match(/\b(1[6-9]\d{2}|20\d{2})\b/);
              const yearLabel = yearMatch
                ? yearMatch[1]
                : String(station.sort_year);
              return (
                <button
                  key={station.id}
                  type="button"
                  className={`bccns-station-marker ${isActive ? "active" : ""}`}
                  style={{ left: `${pct}%` }}
                  aria-label={`Station ${idx + 1}: ${station.dc_title}, ${station.display_year}`}
                  title={`${station.display_year} · ${station.dc_title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setRoomProgressPercent(pct);
                    engineRef.current.activeStationIndex = idx;
                    setActiveStationIndex(idx);
                    if (isActive && Math.abs(roomProgress - pct) < 3.5) {
                      openRecordPanel(station, idx);
                    }
                  }}
                >
                  <span className="marker-year">{yearLabel}</span>
                  <span className="marker-tick" />
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Welcome Card (Warm Paper #F3EEE6) */}
      <aside
        className={`bccns-paper-card welcome-card ${welcomeOpen && appMode === "museum" ? "" : "card-hidden"}`}
        id="welcomeCard"
        aria-label="Collection introduction"
      >
        <button
          type="button"
          className="bccns-card-close"
          id="closeWelcomeCardBtn"
          aria-label="Close collection introduction"
          onClick={closeWelcomeCard}
        >
          &times;
        </button>
        <div className="bccns-small-caps-label">
          COLLECTION · {activeCollection.title}
        </div>
        <h2 className="bccns-card-title">{activeCollection.chapterTitle}</h2>
        <div className="bccns-card-period">
          {activeCollection.period} · {activeStations.length}{" "}
          {activeStations.length === 1 ? "ARCHIVAL STATION" : "ARCHIVAL STATIONS"}
        </div>
        <p className="bccns-card-body">{activeCollection.summary}</p>
        {activeCollection.preparationNotice && (
          <div className="bccns-prep-notice">
            {activeCollection.preparationNotice}
          </div>
        )}
        <div className="bccns-card-footer">
          SCROLL OR DRAG ALONG THE WALK · SELECT ANY STATION TO READ ITS RECORD
        </div>
      </aside>

      {/* Side Community / Curatorial Voice Card (Never a sponsor) */}
      <aside
        className={`bccns-paper-card voice-card ${voiceOpen && appMode === "museum" ? "" : "card-hidden"}`}
        id="curatorialVoiceCard"
        aria-label="Community and curatorial voice"
      >
        <button
          type="button"
          className="bccns-card-close"
          id="closeVoiceCardBtn"
          aria-label="Close curatorial voice card"
          onClick={() => setVoiceOpen(false)}
        >
          &times;
        </button>
        <div
          className="bccns-small-caps-label"
          style={{ color: "var(--bccns-green)" }}
        >
          {activeCollection.voice.role}
        </div>
        <h2 className="bccns-card-title">{activeCollection.voice.speaker}</h2>
        <div className="bccns-card-period">
          {activeCollection.voice.community}
        </div>
        <p className="bccns-card-body">{activeCollection.voice.statement}</p>
        <div className="bccns-card-footer">
          {activeCollection.voice.citation}
        </div>
      </aside>

      {/* Archival Record Panel (Dublin Core, Source Link, Citation Share, Rights Statement) */}
      <div
        className={`bccns-modal-backdrop ${selectedRecordModal ? "open" : ""}`}
        id="recordModalBackdrop"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeRecordPanel();
        }}
      >
        {selectedRecordModal && (
          <div
            className="bccns-record-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="recordPanelTitle"
          >
            <button
              type="button"
              className="bccns-card-close"
              id="closeRecordModalBtn"
              aria-label="Close archival record panel"
              onClick={closeRecordPanel}
            >
              &times;
            </button>

            {/* Left Column: Original Archival Scan or Title + Citation Sheet */}
            <div className="bccns-record-scan-column">
              <div className="bccns-scan-frame">
                {selectedRecordModal.station.media_url && !scanFailed ? (
                  <img
                    src={
                      archiveGeometry.resolveArchivalMediaUrl(
                        selectedRecordModal.station.media_url,
                      ) ?? selectedRecordModal.station.media_url
                    }
                    alt={selectedRecordModal.station.dc_title}
                    onError={() => setScanFailed(true)}
                  />
                ) : (
                  <div className="bccns-scan-fallback">
                    <div>
                      <div className="bccns-small-caps-label">
                        {selectedRecordModal.station.dc_type} ·{" "}
                        {selectedRecordModal.station.display_year}
                      </div>
                      <h3
                        style={{
                          fontFamily: "var(--font-bccns-serif), Georgia, serif",
                          fontSize: 26,
                          lineHeight: 1.15,
                          color: "var(--bccns-ink)",
                          marginTop: 8,
                        }}
                      >
                        {selectedRecordModal.station.dc_title}
                      </h3>
                      <p
                        style={{
                          fontSize: 13,
                          lineHeight: 1.55,
                          color: "rgba(22,22,22,0.75)",
                          marginTop: 12,
                        }}
                      >
                        {selectedRecordModal.station.bccns_digitized
                          ? "External scan hosted by the holding institution. Follow the source record link below to inspect the digitized file directly."
                          : "Textual or reference record indexed in the archive without an attached image file."}
                      </p>
                    </div>
                    <div
                      style={{
                        borderTop: "1px solid rgba(22,22,22,0.16)",
                        paddingTop: 12,
                        fontSize: 12,
                        lineHeight: 1.5,
                        color: "rgba(22,22,22,0.78)",
                      }}
                    >
                      <strong>Archival citation:</strong>{" "}
                      {selectedRecordModal.station.citation}
                    </div>
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  fontSize: 11.5,
                  color: "rgba(22,22,22,0.75)",
                }}
              >
                <div>
                  <strong>Holding Institution:</strong>{" "}
                  {selectedRecordModal.station.dc_publisher}
                </div>
                <div>
                  <strong>Format:</strong>{" "}
                  {selectedRecordModal.station.dc_format ??
                    selectedRecordModal.station.dc_type}
                </div>
              </div>
            </div>

            {/* Right Column: Catalogue Description, Creator, Place, Date, Holding Institution, Citation, Rights */}
            <div className="bccns-record-detail-column">
              <div>
                <div className="bccns-small-caps-label">
                  STATION {selectedRecordModal.index + 1} OF{" "}
                  {activeStations.length} ·{" "}
                  {selectedRecordModal.station.display_year}
                </div>
                <h2 className="bccns-record-title" id="recordPanelTitle">
                  {selectedRecordModal.station.dc_title}
                </h2>

                {selectedRecordModal.station.dc_description && (
                  <p className="bccns-record-description">
                    {selectedRecordModal.station.dc_description}
                  </p>
                )}

                <dl className="bccns-dublin-core-grid">
                  <dt className="bccns-dc-label">Creator</dt>
                  <dd className="bccns-dc-value">
                    {selectedRecordModal.station.dc_creator ??
                      "Not named in source record"}
                  </dd>

                  <dt className="bccns-dc-label">Place (Spatial)</dt>
                  <dd className="bccns-dc-value">
                    {selectedRecordModal.station.dcterms_spatial
                      ? selectedRecordModal.station.dcterms_spatial.replace(
                          /\|/g,
                          " · ",
                        )
                      : "Nova Scotia"}
                  </dd>

                  <dt className="bccns-dc-label">Date / Temporal</dt>
                  <dd className="bccns-dc-value">
                    {selectedRecordModal.station.dc_date ??
                      selectedRecordModal.station.date_text ??
                      selectedRecordModal.station.dcterms_temporal ??
                      "Date not recorded"}
                  </dd>

                  <dt className="bccns-dc-label">Holding Institution</dt>
                  <dd className="bccns-dc-value">
                    {selectedRecordModal.station.dc_publisher}
                  </dd>

                  <dt className="bccns-dc-label">Archival Source</dt>
                  <dd className="bccns-dc-value">
                    {selectedRecordModal.station.dc_source}
                  </dd>

                  <dt className="bccns-dc-label">Provenance</dt>
                  <dd className="bccns-dc-value">
                    {selectedRecordModal.station.dcterms_provenance ??
                      selectedRecordModal.station.dc_publisher}
                  </dd>

                  <dt className="bccns-dc-label">Subjects</dt>
                  <dd className="bccns-dc-value">
                    {selectedRecordModal.station.dc_subject.length > 0
                      ? selectedRecordModal.station.dc_subject.join(" · ")
                      : "African Nova Scotians"}
                  </dd>

                  <dt className="bccns-dc-label">Citation</dt>
                  <dd className="bccns-dc-value">
                    {selectedRecordModal.station.citation}
                  </dd>
                </dl>

                <div className="bccns-rights-box" style={{ marginTop: 14 }}>
                  <div>
                    <strong>Rights:</strong>{" "}
                    {selectedRecordModal.station.dc_rights}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <strong>Access &amp; Reproduction:</strong>{" "}
                    {selectedRecordModal.station.dcterms_access_rights}
                  </div>
                </div>
              </div>

              <div className="bccns-record-actions">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <a
                    href={selectedRecordModal.station.dc_identifier}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bccns-hairline-pill"
                    id="sourceRecordExternalLink"
                  >
                    OPEN SOURCE RECORD &rarr;
                  </a>
                  {selectedRecordModal.station.id.match(
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
                  ) && (
                    <Link
                      href={`/catalog/${selectedRecordModal.station.id}`}
                      className="bccns-hairline-pill"
                    >
                      FULL DUBLIN CORE SHEET
                    </Link>
                  )}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button
                    type="button"
                    className="bccns-hairline-pill"
                    id="copyCitationBtn"
                    onClick={copyRecordCitation}
                  >
                    {copiedCitation ? "CITATION COPIED" : "SHARE CITATION"}
                  </button>
                  <button
                    type="button"
                    className="bccns-hairline-pill"
                    id="copyRecordLinkBtn"
                    onClick={copyRecordDeepLink}
                  >
                    {copiedRecordLink ? "LINK COPIED" : "COPY LINK TO RECORD"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* The Centre Mandate & Institution Modal */}
      <div
        className={`bccns-modal-backdrop ${centreModalOpen ? "open" : ""}`}
        id="centreModalBackdrop"
        onClick={(e) => {
          if (e.target === e.currentTarget) setCentreModalOpen(false);
        }}
      >
        <div
          className="bccns-paper-card"
          style={{
            position: "relative",
            top: "auto",
            left: "auto",
            transform: "none",
            width: "100%",
            maxWidth: 660,
            borderTop: "3px solid var(--bccns-red)",
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="centreModalHeading"
        >
          <button
            type="button"
            className="bccns-card-close"
            id="closeCentreModalBtn"
            aria-label="Close institution information"
            onClick={() => setCentreModalOpen(false)}
          >
            &times;
          </button>
          <div className="bccns-small-caps-label">
            CHERRY BROOK, NOVA SCOTIA · ESTABLISHED {institution.established}
          </div>
          <h2 className="bccns-card-title" id="centreModalHeading">
            {institution.name}
          </h2>
          <div className="bccns-card-period">
            BLACK CULTURAL SOCIETY OF NOVA SCOTIA (INCORPORATED{" "}
            {institution.societyIncorporated})
          </div>
          <p className="bccns-card-body">
            The Black Cultural Centre for Nova Scotia in Cherry Brook was
            established in 1983 by the Black Cultural Society of Nova Scotia
            (incorporated 1977). Its mandate is to protect, preserve, and
            promote the history and culture of African Nova Scotians, Canada’s
            oldest Black communities.
          </p>
          <p className="bccns-card-body">
            This digital archive brings together Dublin Core records held by the
            Black Cultural Centre for Nova Scotia, Nova Scotia Archives, Library
            and Archives Canada, the Black Loyalist Heritage Centre in
            Birchtown, and The Canadian Encyclopedia. Each hall portal opens a
            historical chapter ordered chronologically along the colonnade walk,
            linking every station directly to its holding institution and
            archival citation.
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: 14,
              borderTop: "1px solid rgba(22,22,22,0.16)",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <span className="bccns-small-caps-label" style={{ marginBottom: 0 }}>
              BIRCHTOWN · PRESTON · SHELBURNE · HALIFAX · ANNAPOLIS ROYAL ·
              CHERRY BROOK
            </span>
            <Link
              href="/catalog"
              className="bccns-hairline-pill"
              onClick={() => setCentreModalOpen(false)}
            >
              OPEN FULL CATALOG &amp; ASK ARCHIVE
            </Link>
          </div>
        </div>
      </div>

      {/* Full-Viewport Collection Map */}
      <div
        className={`bccns-collection-map ${mapOpen ? "open" : ""}`}
        id="collectionMapModal"
        role="dialog"
        aria-modal="true"
        aria-label="Collection Map"
      >
        <div
          style={{
            width: "100%",
            maxWidth: 1320,
            margin: "0 auto 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderBottom: "1px solid rgba(22,22,22,0.18)",
            paddingBottom: 16,
          }}
        >
          <div>
            <div className="bccns-small-caps-label">
              BLACK CULTURAL CENTRE FOR NOVA SCOTIA · SIX HISTORICAL CHAPTERS
            </div>
            <h2
              style={{
                fontFamily: "var(--font-bccns-serif), Georgia, serif",
                fontSize: 36,
                fontWeight: 500,
                lineHeight: 1.05,
              }}
            >
              Collection Map
            </h2>
          </div>
          <button
            type="button"
            className="bccns-hairline-pill"
            id="closeMapModalBtn"
            onClick={() => setMapOpen(false)}
          >
            CLOSE MAP (ESC)
          </button>
        </div>

        <div className="bccns-map-grid">
          {collections.map((col, idx) => {
            const isCurrent =
              appMode === "museum" && currentCollectionKey === col.key;
            return (
              <button
                key={col.key}
                type="button"
                className={`bccns-map-card ${isCurrent ? "active" : ""}`}
                data-map-collection={col.key}
                style={
                  { "--collection-wash": col.washHex } as React.CSSProperties
                }
                onClick={() => {
                  setMapOpen(false);
                  transitionToCollectionRoom(col.key);
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 12,
                      marginBottom: 6,
                    }}
                  >
                    <span className="bccns-small-caps-label" style={{ marginBottom: 0 }}>
                      HALL 0{idx + 1} · {col.period}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "var(--bccns-gold)",
                      }}
                    >
                      {col.stations.length}{" "}
                      {col.stations.length === 1 ? "RECORD" : "RECORDS"}
                    </span>
                  </div>
                  <h3
                    style={{
                      fontFamily: "var(--font-bccns-serif), Georgia, serif",
                      fontSize: 28,
                      fontWeight: 500,
                      lineHeight: 1.1,
                      color: "var(--bccns-ink)",
                      marginBottom: 8,
                    }}
                  >
                    {col.title}
                  </h3>
                  <p
                    style={{
                      fontSize: 13,
                      lineHeight: 1.55,
                      color: "rgba(22,22,22,0.8)",
                    }}
                  >
                    {col.summary}
                  </p>
                </div>

                {col.preparationNotice && (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "rgba(22,22,22,0.7)",
                      borderTop: "1px dashed rgba(22,22,22,0.18)",
                      paddingTop: 8,
                    }}
                  >
                    {col.preparationNotice}
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    paddingTop: 6,
                  }}
                >
                  {col.stations.slice(0, 6).map((st) => (
                    <span
                      key={st.id}
                      style={{
                        fontSize: 10.5,
                        padding: "2px 8px",
                        border: "1px solid rgba(22,22,22,0.2)",
                        background: "var(--bccns-paper)",
                        color: "var(--bccns-ink)",
                      }}
                    >
                      {st.display_year}: {st.dc_title.slice(0, 32)}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        <div
          style={{
            width: "100%",
            maxWidth: 1320,
            margin: "20px auto 0",
            paddingTop: 14,
            borderTop: "1px solid rgba(22,22,22,0.16)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <span className="bccns-small-caps-label" style={{ marginBottom: 0 }}>
            SELECT ANY COLLECTION TO ENTER ITS GALLERY WALK
          </span>
          <button
            type="button"
            className="bccns-hairline-pill"
            onClick={() => {
              setMapOpen(false);
              returnToRotundaScene();
            }}
          >
            RETURN TO ROTUNDA HALL
          </button>
        </div>
      </div>

      {/* 15-Bar Preloader Overlay */}
      <div
        className={`bccns-preloader ${preloader.active ? "active" : ""}`}
        id="preloaderOverlay"
        aria-hidden={!preloader.active}
      >
        <div className="bccns-small-caps-label">
          BLACK CULTURAL CENTRE FOR NOVA SCOTIA
        </div>
        <div
          style={{
            fontFamily: "var(--font-bccns-serif), Georgia, serif",
            fontSize: 32,
            fontWeight: 500,
            textAlign: "center",
            maxWidth: 680,
            padding: "0 20px",
          }}
        >
          {preloader.title}
        </div>
        <div className="bccns-domino-row">
          {Array.from({ length: 15 }, (_, idx) => (
            <div
              key={idx}
              className={`bccns-domino-bar ${idx < preloader.flippedCount ? "flipped" : ""}`}
            />
          ))}
        </div>
        <div className="bccns-small-caps-label">
          PREPARING GALLERY: {preloader.percent}%
        </div>
      </div>
      </div>

      {!sceneOpen && (
      <main
        className="bccns-arrival-screen"
        id="startScreen"
        role="dialog"
        aria-modal="true"
        aria-labelledby={gateView === "ask" ? "bccns-ask-title" : "bccns-arrival-title"}
      >
        <div className="bccns-view-stage">
          {gateView === "arrival" ? (
          <section
            ref={arrivalViewRef}
            className="bccns-view bccns-arrival-card bccns-ledger"
            data-view="arrival"
            data-active="true"
            aria-labelledby="bccns-arrival-title"
            tabIndex={-1}
          >
            <div className="bccns-ledger-grid">
              <div className="bccns-ledger-logo">
                <span className="bccns-ledger-seal">
                  <img
                    src="/brand/bcc-mark.png"
                    alt=""
                    width={179}
                    height={118}
                  />
                </span>
              </div>
              <p className="bccns-ledger-est">
                <span>Est. {institution.established}</span>
                <span>Cherry Brook, NS</span>
              </p>
              <div className="bccns-ledger-gap" aria-hidden="true" />
              <Link href="/catalog" className="bccns-ledger-catalog">
                Browse catalog
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  aria-hidden="true"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
              <h1 id="bccns-arrival-title" className="bccns-ledger-title">
                <span className="bccns-ledger-title-fit">
                  <span>The Black</span>
                  <span>Cultural</span>
                  <span>Centre</span>
                  <em>for Nova Scotia</em>
                </span>
              </h1>
              <p className="bccns-ledger-stack">
                Archive /
                <br />
                Culture /
                <br />
                Memory
              </p>
              <p id="bccns-arrival-summary" className="bccns-ledger-copy">
                {institution.mandate} Turn the rotunda to enter six historical
                chapters and inspect digitized archival records with their exact
                holding institutions and citations.
              </p>
              <div className="bccns-ledger-actions">
                <button
                  type="button"
                  className="bccns-primary-enter-btn"
                  id="enterArchiveBtn"
                  onClick={() => showGateView("archive")}
                >
                  <span>Enter digital archive</span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    aria-hidden="true"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="bccns-ask-archive-btn"
                  id="askArchiveArrivalBtn"
                  onClick={() => showGateView("ask")}
                >
                  Ask the archive
                  <BsStars className="bccns-ask-mark" aria-hidden="true" />
                </button>
              </div>
            </div>
          </section>
          ) : (
          <section
            ref={askViewRef}
            className="bccns-view bccns-arrival-card bccns-title-wall"
            data-view="ask"
            data-active="true"
            aria-labelledby="bccns-ask-title"
            tabIndex={-1}
          >
            <div className="bccns-title-grid is-single">
              <div className="bccns-title-main">
                <h1 id="bccns-ask-title" className="bccns-arrival-heading">
                  Ask the archive
                </h1>
                <p className="bccns-arrival-copy">
                  Ask about a chapter, a place, or a record. The answer stays tied to the holdings.
                </p>
                <ArchiveSearchBar autoNavigate={false} showCatalogCta={true} />
                <div className="bccns-arrival-actions">
                  <button
                    type="button"
                    className="bccns-primary-enter-btn"
                    onClick={() => showGateView("archive")}
                  >
                    Enter digital archive
                  </button>
                  <button
                    type="button"
                    className="bccns-ask-archive-btn"
                    onClick={() => showGateView("arrival")}
                  >
                    Back to the centre
                  </button>
                </div>
              </div>
            </div>
          </section>
          )}
        </div>
      </main>
      )}
    </div>
  );
}
