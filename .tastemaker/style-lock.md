# Style lock — Black Cultural Centre for Nova Scotia Digital Archive

Established: 2026-11-06. Source: existing product tokens, kept at the user's request. The landing screenshot and the BCC mark were the references. Palette was not regenerated.

## Palette
- Background: #c6b0a6 at 83% opacity (role: arrival wash over the live rotunda). Do not replace this wash.
- Surface: #f6ebea (role: paper, `--bccns-paper`)
- Primary: #221717 (role: ink fills and primary button, `--bccns-ink`)
- Accent: #936362 (role: ochre, large marks and the place-rail separator only, `--bccns-ochre`). Not small text.
- Text primary: #221717. Contrast vs wash #c6b0a6: 8.45 (WCAG AA pass)
- Text muted: rgba(34, 23, 23, 0.84) on the wash
- Button label color: paper #f6ebea on ink. Contrast 14.95. Ochre hover uses white, because paper on ochre is 4.28 and fails AA. White on ochre is 5.00.
- Green #477b6a and gold #ecd9d8 stay in the archive interior. They are not used on the arrival cover.
- Dark mode: not needed for this project. Single warm mode.

## Color contract

Legal pairings from `check_contrast.py --matrix text=221717 bg=c6b0a6 surface=f6ebea primary=221717 accent=936362 border=e5dada on-primary=f6ebea`:

- Text-safe (>=4.5): text/surface, text/on-primary, surface/primary, primary/on-primary, text/border, primary/border, text/bg, bg/primary
- UI-safe (>=3.0 and <4.5): surface/accent, accent/on-primary, accent/border, text/accent, primary/accent
- Decorative (<3.0): bg/accent, bg/surface, bg/on-primary, bg/border, surface/border, border/on-primary, text/primary, surface/on-primary

Ochre is never body copy on the wash. The place-rail middot is decorative. Focus rings on the cover use ink, which is text-safe on the wash.

## Typography
- Arrival display: Fraunces. Optical size on, italic for "for Nova Scotia".
- Arrival text: Libre Franklin.
- Archive interior, unchanged: Cormorant Garamond for titles, Geist for UI.
- Arrival scale: display clamp(36px, 4.4vw, 64px) at line-height 1.05. Body 16–18px.

## Shape language
- Corner radius: 2px on the cover buttons, matching the existing hairline controls.
- Shadow depth: none on the cover. The wash is the ground.
- Border usage: 1px hairline. The secondary action is transparent so the wash shows through.

## Density & spacing
- Base unit: 4px
- Cover padding: 128–168px top so the logo clears the name, 28–88px sides
- Title column: max 980px, left aligned, right side left open for the rotunda
- Overall density: editorial, one open side
- Section separation: a hairline above the place index

## Structure
- Macrostructure: Split Title Wall on the arrival cover only
- Narrative arc: hook is the institution name over the live rotunda. Chapters, records, and proof live inside the archive, not on this cover.
- Shared chrome: no nav or footer on the gate. The logo is fixed at the top center and stays while the ask cover swaps.
- Hero: H2 split, left bias, live rotunda as the visual, logo top center
- Build stamp: first line of `app/globals.css`. Log: `.tastemaker/log.json`

## Reference intelligence
- Reference board: `.tastemaker/reference-board.md` (viewed sources)
- Design read: museum front door for visitors and researchers, mode Experience, archival lane
- Dials: variance 6, motion 3, density 4, art direction 7
- Foundation: existing repo stack (Next, Tailwind tokens, CSS variables). No new component registry.
- Quality bar: NMAAHC's front door (name, one welcome line, one primary action, the institution itself as the picture)
- Direction contract: Thesis, a title wall over the rotunda. First viewport, logo centered, name and actions on the left, wash unchanged. System, existing BCCNS tokens plus an arrival-only type pairing. Risk, the logo is a small source file and should not be scaled past its native sharpness.
- Anti-references: centered poster, squiggle, pill chips, paired solid buttons, indigo gradients

## Taste memory
- Profile priors used: none (`~/.tastemaker/profile.md` was absent)
- Decision log: `.tastemaker/decisions.log`
- Last resolved decisions: user rejected the centered arrival stack on 2026-11-06
- Pending review: left-weighted title wall, Fraunces + Libre Franklin on the cover only
- Profile promotion: none. The palette and the Centre's name are this institution's, not a personal default.
- Memory precedence: the user request (keep the wash and the colours, change placement and type, logo at top center) wins over any generated palette.

## Assets
- Logo: `public/brand/bcc-mark.png`. White field removed from the attached mark. Credited as the Centre's own mark, not a fetched asset.
- Photography: the rotunda already on screen, seen through the wash. No stock photos added.
- Illustration: none. The mark is the institution's logo.
- Motion: one 280ms entrance on the title wall, disabled under reduced motion. Cover swaps keep the existing view transition. GSAP was not added. The app already moves between covers.
