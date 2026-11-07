/**
 * SOURCE OF TRUTH KEYWORDS: BccnsArchiveExperience, archive components barrel, 3D rotunda, ArchiveSearchBar, filterHref, mergeCatalogSearchParams
 * WHAT: Barrel export for the shared BCCNS 3D archive and search components.
 * WHY: Keeps route imports concise across app/page.tsx, app/museum/page.tsx, and app/catalog.
 * WHERE: app/page.tsx, app/museum/page.tsx, and app/catalog.
 */
export { BccnsArchiveExperience } from "./bccns-archive-experience";
export {
  ArchiveSearchBar,
  clearCatalogSearchParams,
  filterHref,
  handleModeSwitch,
  handleRadioArrowNavigation,
  mergeCatalogSearchParams,
} from "./archive-search-bar";
export { ImmersiveArchiveHUD } from "./immersive-archive-hud";

