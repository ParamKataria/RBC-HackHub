# Style lock — BCCNS Digital Archive

Established: 2026-11-05. Source: starter scaffolding + user answers (Elegant/editorial mood, generated palette).

## Palette
- Background: #fff5f4 (role: page background, warm off-white paper)
- Surface: #f6ebea (role: cards/panels, aged paper sheet)
- Primary: #936362 (role: primary actions, links, brand accent — muted brick/mauve)
- Accent: #477b6a (role: sparingly, for emphasis only — muted sage green)
- Text primary: #221717 — contrast vs background: 16.31 (WCAG AA pass, from scripts/check_contrast.py)
- Text muted: rgba(34,23,23,0.72)
- Button label color: white — contrast vs Primary: 5.00 (from scripts/check_contrast.py; verified white is readable on #936362)
- Dark mode: not needed for this project — single mode only (locked light mode, warm paper theme)

## Architectural materials
Source: extracted from the walnut-rotunda screenshot (dominant plaster hue 34°) plus the user's request to stop the floor, walls, and frames reading as three unrelated colors. UI chrome above stays on the locked palette. The 3D room uses one hue: light plaster, a deeper floor of that same hue, and walnut as the only dark material.
- Plaster / fog / clear: #E8D9C8 (walls and atmosphere)
- Floor: #D2C0A8 (same hue, one step deeper)
- Platform: #DCCBB4
- Door frames: walnut grain, kept
- Gallery plinths and picture frames: #4A3224 and #5C3D28 (darker walnut, not a separate black)
- Chapter washes stay on record labels and the thin inner arch line only

## Color contract

The palette above is not a set of five approved hexes the model may combine freely. It is a contract: for each pairing of colors, a required contrast ratio.

Required ratios by pairing:

| Foreground on background | Floor | Why |
|---|---|---|
| body/muted text on bg or surface | 4.5:1 | WCAG AA text |
| button label on its fill (Primary, or any color used as a solid fill) | 4.5:1 | text on a fill |
| link/accent used as text | 4.5:1 | text |
| a fill vs the page (does the button/badge show up at all) | 3:1 | UI component (1.4.11) |
| accent used as a highlight or icon | 3:1 | graphical object |
| a border that conveys state (focus ring, error/active edge, the only boundary between two regions) | 3:1 | UI component. A purely decorative hairline is exempt: record it as decorative. |

Legal pairings (run `scripts/check_contrast.py --matrix text=.. bg=.. surface=.. primary=.. accent=.. border=.. on-primary=..` and paste the summary):

- Text-safe (>=4.5): text/on-primary, text/bg, text/surface, text/border, primary/on-primary, accent/on-primary, bg/primary, bg/accent
- UI-safe (>=3.0 and <4.5): surface/primary, surface/accent, primary/border, text/accent, accent/border, text/primary
- Decorative (<3.0): border/on-primary, bg/border, surface/border, surface/on-primary, bg/surface, bg/on-primary, primary/accent

The model may only compose color pairings that appear in the text-safe or UI-safe lists (matched to the pairing's purpose). If it needs a pairing that lands in Decorative for a purpose that requires more (a fill that needs a readable label, a border that must convey state), that is a flag: switch to a legal pairing, or darken/lighten a color and re-run the matrix. Do not ship the failing pairing.

If a token's value was adjusted mid-build to clear a pairing it originally failed (a lightness nudge per that failure path), note it here — e.g. "Accent nudged from #xxxxxx to #yyyyyy to clear UI-safe against Surface" — so a later session in this project sees the final value already reflects a contrast fix, not an arbitrary change.

## Typography
- Display/heading font: Cormorant Garamond — serif display, matches the archival/editorial feel of a museum catalogue
- Body font: Inter — neutral sans for UI chrome, labels, and small text
- Scale: 1.25 ratio, base 16px

## Shape language
- Corner radius: 0-4px maximum; rectangular architectural shapes only (Greek archways, mitered frames, box geometries); no pill shapes, no rounded-full buttons
- Shadow depth: flat, no drop shadows; separation by hairline borders and surface color shifts only
- Border usage: 1px hairline borders instead of shadows for separation; borders are decorative only, never the sole state indicator

## Density & spacing
- Base unit: 4px
- Section padding (app shell): dense, information-dense per `references/component-patterns.md`'s App shell section; not marketing-page generous
- Content card internal padding: space-6 (24px) minimum for feature/info cards
- Compact/dense card internal padding: space-3 (12px) for stat tiles, nav rows, dial items
- Showcase/hero card internal padding: space-8 (32px) for arrival screen and welcome card
- Overall density: dense, information-dense (3D app shell with concurrent UI overlays)
- Section separation: fixed section padding, no tint/divider (whitespace separation only, matching the 3D canvas-first layout)

## Structure
- Macrostructure(s) used: none (single-page 3D app shell; no marketing pages)
- Narrative arc per page: arrival → rotunda hall (6 collection portals) → gallery walk (chronological stations) → record panel (Dublin Core detail)
- Shared chrome (stays consistent across the project's pages): top chrome (wordmark + header station title + actions nav), bottom floating controls (collection map, enter collection, return rotunda, curatorial voice)
- Per-page body archetypes: rotunda dial (6-portal colonnade), gallery scrubber (chronological walk), record sheet (Dublin Core grid + scan column)
- Build stamp / log: `.tastemaker/log.json` carries the per-build record; CSS stamp format is in `references/diversification.md`

## Reference intelligence
- Reference board: `.tastemaker/reference-board.md` inferred, not viewed (no insno MCP available this session, no reference images supplied by user)
- Design read: 3D museum archive for African Nova Scotian historical records, mode Experience, with solemn/archival/authoritative/warm paper visual lane
- Dials: variance 3, motion 4, density 6, art direction 7
- Foundation: existing repo stack (Next.js 15, React 19, Three.js r0.187, Tailwind CSS), no new design system imports
- Quality bar: existing refined archival palette (ochre/brick/forest/gold) evolved into the generated Elegant/editorial palette
- Direction contract: Thesis — a warm, paper-toned 3D archive that treats each Dublin Core record as a museum object; First viewport — arrival screen resolving into the BCCNS wordmark over the rotunda hall; System — Next.js App Router + Three.js WebGL with Supabase Dublin Core catalog; Risk — WebGL memory leaks on scene transitions, external image CORS failures on archival scans

## Anti-references
- No indigo-to-purple gradients (the default AI UI tell)
- No pill shapes or rounded-full buttons
- No frosted-glass blur or glassmorphism
- No emoji as icons
- No lorem ipsum or fabricated metrics

## Taste memory
- Profile priors used: none (no ~/.tastemaker/profile.md exists)
- Decision log: `.tastemaker/decisions.log`
- Last resolved decisions: none yet (first build)
- Pending review: none
- Profile promotion: none
- Memory precedence note: current user request (apply tastemaker, steer palette by use case) wins over all prior state; no prior style lock exists

## Navigation chrome
Omit (no app shell; this is a single-page 3D experience)

## Mood descriptors
solemn, archival, authoritative, warm

## Aesthetic mode
none

## Assets
- Anchor asset: none yet (archival scans loaded dynamically from Supabase media_url via /api/image-proxy)
- Asset style: canvas-rendered archival document sheets (paper, ink, newsprint, map) with natural scan colors — never recolored to match palette
- Illustration vs. photography split: real archival photography/scans for records; canvas-rendered document sheets for previews
- Illustration source used: none (all imagery is real archival content from holding institutions)
- Logo: BCCNS wordmark (text-based, Cherry Brook Nova Scotia, est. 1983) in Cormorant Garamond serif

## Arrival gate
The first screen is a full-viewport hero cover over the rotunda (`100dvh`), not a modal and not a floating card. The wash is a deeper warm paper at 94% opacity with no backdrop blur, so the room still shows through and the type stays readable. Title, copy, and actions are centered in a readable measure and scale with the viewport. Header and dial chrome stay hidden until the archive view. Scene wheel, touch, drag, and pointer look stay locked on the arrival and ask views. Ask the archive slides to the ask view. Enter digital archive fades into the rotunda.

## Motion
- Feel: quick and restrained — 3D scene transitions with fade cameras, no celebratory bounces
- Curves: cubic-bezier(0.23, 1, 0.32, 1) for ease-out; no overshoot/bounce easing on UI state
- Durations: press 150ms, panel 220ms, page/story 340ms (preloader), transition 280ms (rotunda return), cover swap 780ms with the drawer curve because the cover travels the full viewport
- Entrance duration/distance: 220ms, 12px rise for modal entrances
- Screen tracks: 3D scene animation via requestAnimationFrame; UI overlays fade in/out; no scroll-reveal on marketing content (not applicable)
- Frequency rules: hover tooltips delay ~800ms; focus tooltips 0ms; preloader runs once on arrival; no motion on static paper cards
- Reduced motion: spatial 3D motion collapses to opacity crossfade; camera fades use ≤150ms; hover lift on picture frames disabled under prefers-reduced-motion
- Verified by: scripts/audit_motion.py pending

## Do not
- No gradients — user rejected indigo/purple as the default AI tell
- No rounded-full buttons or pill shapes — feels too playful for this archival brand
- No recoloring archival scans to match the palette — paper, ink, newsprint, and maps keep their own color
- No fabricated metrics or invented proof — every Dublin Core field comes from the Supabase catalog
