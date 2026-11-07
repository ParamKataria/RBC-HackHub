/**
 * SOURCE OF TRUTH KEYWORDS: BccnsArchiveExperience, archive components barrel, 3D rotunda, ArchiveSearchBar, ImmersiveArchiveHUD
 * WHAT: Barrel export for the shared BCCNS 3D archive and search components.
 * WHY: Keeps route imports concise across app/page.tsx, app/museum/page.tsx, and app/catalog.
 * WHERE: app/page.tsx, app/museum/page.tsx, and app/catalog.
 */
export { BccnsArchiveExperience } from "./bccns-archive-experience";
export { ArchiveSearchBar, filterHref, sameFilters } from "./archive-search-bar";
export { ImmersiveArchiveHUD } from "./immersive-archive-hud";

