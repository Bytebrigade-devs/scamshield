# ScamShield — Theme, Typography & UI Styling Guide

**Project:** IS2901 Software Development Project · Byte Brigade  
**Version:** 1.1 · 17 October 2026 · **Approved by team decision, 16 October 2026**  
**Status:** Team-approved specification; every module follows this system. The user's requirement for smooth, non-brick-like buttons is confirmed. No application styling has been implemented or visually verified yet — approval is not implementation evidence.  
**Design steward:** Module 1 owner (proposed); to be named and recorded at the ownership meeting. All module owners follow the same approved system.

## 1. Purpose and direction

Give the landing page, onboarding, subscription screens, password vault, scam checker, admin dashboard and Digital Safety Score one coherent identity.

**Direction: light-first, navy–teal, clear and reassuring.** Use generous whitespace, readable typography, softly rounded controls and restrained shadows. The product should feel like an approachable digital-safety companion, not a neon hacker terminal.

- Navy anchors the identity and text hierarchy.
- Teal identifies actions and selected controls.
- Neutral backgrounds carry most of the interface.
- Green, amber and red communicate meaningful states, not decorative module identities.
- Smoothness comes from proportions, rounded edges and subtle feedback—not excessive gradients, blur or animation.

This is the approved ScamShield visual specification; every module follows it. A value can still be refined through the change process in §7 (propose with reason, affected components and examples; record the decision here and in the changelog). Dark mode is not specified in this version and must not be improvised independently by a module owner.

## 2. Colour palette

The semantic names below are the contract between design and implementation. Exact values live in shared tokens, not individual components.

| Semantic token | Value | Purpose |
|---|---|---|
| `--color-brand` | `#0F172A` | Brand identity and prominent headings |
| `--color-primary` | `#0F766E` | Primary buttons, links and selected controls |
| `--color-on-primary` | `#FFFFFF` | Text/icons on primary buttons |
| `--color-primary-hover` | `#115E59` | Hover state for primary buttons |
| `--color-primary-active` | `#134E4A` | Pressed state for primary buttons |
| `--color-primary-subtle` | `#F0FDFA` | Quiet teal tint for secondary hover and supporting surfaces |
| `--color-background` | `#F8FAFC` | Default page background |
| `--color-surface` | `#FFFFFF` | Cards, forms and elevated panels |
| `--color-text` | `#0F172A` | Main text |
| `--color-text-muted` | `#475569` | Supporting text and descriptions |
| `--color-border-subtle` | `#E2E8F0` | Decorative card edges and separators only |
| `--color-border-control` | `#64748B` | Input/control boundaries where needed for identification |
| `--color-success` | `#15803D` | Low-risk indicators and successful operations, with contextual labels |
| `--color-warning` | `#B45309` | Caution and suspicious-result indicators |
| `--color-danger` | `#B91C1C` | High-risk indicators, errors and destructive actions |
| `--color-disabled-bg` | `#E2E8F0` | Disabled button background |
| `--color-disabled-text` | `#64748B` | Disabled button text/icons |

### Usage rules

1. Keep most surfaces white or soft white; use teal selectively so primary actions remain obvious.
2. Do not give each module a separate theme. The multicolour module map in `project-overview.html` is a management visualisation, not the product palette.
3. Pair status colours with readable text and an icon. Never communicate risk through colour alone.
4. A green result means a limited assessment such as **“Low risk detected”**, not **“Guaranteed safe.”** Final verdict/category wording must follow the shared taxonomy agreed under X-13; this guide does not define new backend categories.
5. Do not use the subtle separator colour as the sole visible boundary of an input that needs a contrasting outline.
6. Charts must include labels/legends and additional distinctions where needed. Agree a shared chart palette rather than treating risk colours as arbitrary series colours.

### Contrast checks

Calculated from the specified sRGB hex values using WCAG relative luminance; ratios are rounded to two decimal places.

| Foreground / background | Contrast | Normal-text AA (4.5:1) |
|---|---:|---|
| White `#FFFFFF` / teal `#0F766E` | 5.47:1 | Pass |
| Navy `#0F172A` / page `#F8FAFC` | 17.06:1 | Pass |
| Slate `#475569` / page `#F8FAFC` | 7.24:1 | Pass |
| Green `#15803D` / white `#FFFFFF` | 5.02:1 | Pass |
| Amber `#B45309` / white `#FFFFFF` | 5.02:1 | Pass |
| Red `#B91C1C` / white `#FFFFFF` | 6.47:1 | Pass |

These are checks of specific opaque colour pairs, not certification of a complete UI or the generated image. Recheck actual state/background combinations, including any tinted alerts, transparency and focus indicators. Disabled controls are not a model for ordinary text contrast.

## 3. Typography

**Primary family: Plus Jakarta Sans.** Use one main family for headings, body text, navigation, forms and buttons. It provides the modern, approachable direction without separate module fonts.

| Role | Weight | Size / line height |
|---|---:|---|
| Landing hero | 700 | 36–64px responsively / 1.1–1.15 |
| Page heading | 700 | 28–36px responsively / 1.2 |
| Section heading | 600–700 | 22–28px / 1.25 |
| Card heading | 600 | 18–20px / 1.3 |
| Body and explanations | 400 | 16px / 1.5 |
| Buttons and labels | 500–600 | 14–16px / 1.4 |
| Supporting metadata | 400–500 | 14px / 1.5 |

- Load weights 400, 500, 600 and 700 centrally; do not import fonts separately on each page.
- Use a fallback stack such as `"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif`.
- Use a system monospace stack only for revealed password values and technical strings—not ordinary headings or navigation.
- Use tabular numerals for changing scores, counters, prices and table numbers so columns do not jump.
- Avoid widespread uppercase text, heavy letter spacing and cramped line heights. Keep long explanatory copy comfortably readable.
- If sample content includes Sinhala or Tamil, verify glyph rendering with suitable script-specific fallbacks, such as Noto Sans Sinhala/Tamil. This is not a claim of translated UI or multilingual detection accuracy.
- During the Next.js scaffold, configure font loading once at the root using the project's agreed font-loading mechanism (for example, `next/font`); no loader or dependency is added by this document.

Plus Jakarta Sans is available under the **SIL Open Font License 1.1**. Retain its licence notice when distributing the font. Source: [Google Fonts licence file](https://github.com/google/fonts/blob/main/ofl/plusjakartasans/OFL.txt), checked 16 October 2026.

## 4. Buttons — smooth, not brick-like

**Confirmed user requirement:** “do not make buttons looks like bricky, maintain smootheness.”

Use softly rounded rectangles with balanced proportions. Do not interpret this as making every control pill-shaped.

| Property | Shared rule |
|---|---|
| Corner radius | 12px for standard buttons |
| Height | 44px standard; 48px prominent CTA |
| Horizontal padding | 20–24px; allow wrapping or appropriate responsive layout for longer labels |
| Label | Plus Jakarta Sans, 500–600; readable mixed case |
| Icon | Approximately 18–20px, optically centred, with an 8px label gap |
| Border | Thin, normally 1px where a visible border is needed |
| Shadow | None by default or a subtle soft shadow; no hard offset/block shadow |
| Feedback | 150–200ms, ease-out, limited to the properties that actually change |
| Keyboard focus | Clear 3px teal outline with 2px offset on the approved light surfaces; verify contrast on other backgrounds |

### Variants and states

| Variant | Default | Hover | Pressed |
|---|---|---|---|
| Primary | Teal fill, white label | Darker teal `--color-primary-hover` | Deep teal `--color-primary-active` |
| Secondary | White fill, teal label and 1px teal border | Subtle teal background | Subtle teal background with a darker teal label/border |
| Text / tertiary | Transparent surface, teal label | Underline for links; subtle tint for button controls | Darker teal label |
| Destructive | Danger fill, white label | Shared, contrast-checked darker danger state to be defined before implementation | Same shared state system; never a module-local colour |

- Disabled: use the shared disabled tokens, disable activation and remove hover/press feedback. Do not simply reduce the whole component's opacity.
- Loading: show a progress indicator and a meaningful label such as “Checking…”, prevent duplicate submission and retain the button's width where practical.
- Hover must not move neighbouring content. A small optional press transform may be considered, but no bouncing, exaggerated scaling or heavy 3D depression.
- Transition background colour, border colour, text colour and/or shadow explicitly; **never `transition: all`**.
- Respect `prefers-reduced-motion`: remove optional transforms and nonessential animation without removing state feedback.
- Keep touch targets at least 44 × 44px, including icon-only actions. Give icon-only controls accessible names.

**Avoid:** sharp square corners, oversized solid slabs, thick borders, hard shadows, mottled/textured teal fills, pronounced gradients and a different button design in every module.

## 5. Supporting surfaces and icons

- **Inputs:** approved 12px radius and at least 44px height for single-line controls; clear labels, legible placeholders, visible boundary/focus and field-specific error text.
- **Cards/panels:** approved 16px radius, white surface, subtle edge and restrained shadow only when elevation helps. Nested radii should look coherent with their spacing, rather than blindly using the same radius everywhere.
- **Spacing:** use a shared 4px-based scale, commonly 8, 12, 16, 24 and 32px. Give controls breathing room without turning the dashboard into oversized empty cards.
- **Shadows:** use the shared light-surface token `0 4px 16px rgb(15 23 42 / 0.06)`, validated in rendered context before marking the component done. Avoid stacking several heavy shadows.
- **Icons:** use one consistent outline-icon style, consistent stroke weight and optical alignment. Do not mix unrelated icon styles or use emoji as functional icons.
- **Background decoration:** faint teal shapes may support the landing page; they must not reduce legibility or become a mandatory treatment on every dashboard screen.

## 6. Generated image — what to retain and refine

The user supplied a generated landing-page image in this conversation. It is a **visual reference**, not a measured design file. No local image asset or Figma source is recorded here.

**Retain:** navy headings, teal actions, light neutral backgrounds, generous whitespace, softly rounded buttons/cards, restrained outline icons, amber suspicious-result styling and the visible explanation that low risk is not a guarantee of safety.

**Refine before implementation:**

1. Keep the main CTA proportions within the shared button rules so they do not feel chunky.
2. Replace generated mottled fills with clean, solid teal surfaces; keep any decorative gradient extremely restrained.
3. Set Plus Jakarta Sans explicitly. The exact font, colour values and measurements cannot be reliably inferred from a generated image.
4. Define and test actual hover, focus, pressed and loading states; a static image cannot prove smooth motion.
5. Reflow the overlapping checker/vault illustration on smaller screens so it never obscures content or controls.
6. Treat the landing checker as a clearly labelled **“Example preview”**, not an implied working pre-signup checker. Pre-signup checking remains unapproved (see the team-lead's `Management\INSTRUCTIONS.md`, which stays outside this repository).
7. Use synthetic examples and accurate security/privacy copy. Neither a lock icon nor a reassuring headline establishes audited security or guarantees protection.

The image's composition does not approve new features, a final logo, service-brand assets or marketing claims. The actual palette and typography specification takes precedence over approximate generated pixels.

## 7. Keeping all modules consistent

### One source of truth

After approval, mirror this specification into shared Figma styles/variables and the application's global token layer. Maintain a clear mapping between design names and code names.

Use three layers:

1. **Primitive:** raw values, such as teal-700 = `#0F766E` and radius-12 = `12px`.
2. **Semantic:** purpose aliases, such as `--color-primary`, `--font-body` and `--radius-control`.
3. **Component:** shared defaults, such as `--button-bg` referencing `--color-primary` and `--button-radius` referencing `--radius-control`.

Components consume aliases rather than repeating raw hex values, font declarations or arbitrary radii. Configure Tailwind against the same token layer; do not maintain a second, divergent palette.

### Ownership and change process

- The Module 1 design steward maintains the specification and shared components; the named person is recorded at the ownership meeting.
- Every module reuses the same Button, Input, Card and RiskBadge primitives. Dashboard density can differ from the landing page without changing the brand language.
- Propose a shared-token change with its reason, affected components and updated design examples. Do not silently override a global choice inside one route.
- Review and merge application changes through the established PR workflow. Record material decisions in this guide and `CHANGELOG.md`.
- `Management\` remains local unless sharing it is approved. **2026-10-17: a shared copy of this guide is authorised for the `scamshield` repository** so every member follows the approved system. Keep editing this original, re-copy it into the repository after each material change, and record the sync in `Management\CHANGELOG.md`; if the copies ever differ, this original is the source of truth.
- Apply brand styling to product mockups and presentation graphics as appropriate, but **official report/template formatting takes precedence** over this font and palette guide.

### Review checklist

- [x] Palette/font and detailed component values approved by team decision, 16 October 2026.
- [ ] Design steward named and recorded (Module 1 owner slot; ownership meeting).
- [ ] Landing, scam-result and vault/dashboard mockups compared before locking the visual system.
- [ ] Shared tokens and components used across modules; no unexplained local overrides.
- [ ] Buttons look rounded and balanced, not brick-like; states do not cause layout jumps.
- [ ] Body text remains readable; fonts/glyphs load correctly and zoom does not clip content.
- [ ] Text, control boundaries and focus indicators checked on their actual backgrounds.
- [ ] Risk states use labels/icons, with no guaranteed-safety implication.
- [ ] Keyboard focus, loading, disabled behaviour and reduced motion verified in the real interface.
- [ ] Desktop and mobile screenshots checked; overlapping illustration elements reflow safely.
- [ ] Before/after screenshots and interaction evidence reviewed when application styling is implemented.

## 8. Current verification and next step

**Verified now:** the six listed colour-pair contrast calculations and the font's licence source. The supplied image supports visual discussion only.

**Not yet verified:** rendered font appearance, responsive layout, component states, actual motion, full accessibility or consistency across implemented modules. This document is not evidence of working application UI.

**Next step:** mirror the approved tokens into Figma and the application token layer, name the design steward at the ownership meeting, then review representative mockups using the specified tokens before shared component implementation. Record approval or requested changes rather than treating documentation creation as design sign-off.

### Revision history

- **2026-10-16 · v1.0:** theme approved by team decision. Status moved from proposal to approved specification; approval recorded, design-steward naming still pending at the ownership meeting. No application styling implemented.
- **2026-10-17 · v1.1:** authorised a shared team copy in the `scamshield` repository so all members can follow this guide. The `Management\` original stays the source of truth; material future changes are re-copied into the repository and recorded in the changelog. No palette, typography or component values changed.
- **2026-10-16 · v0.1:** recorded the proposed navy–teal light-first theme, Plus Jakarta Sans typography, the confirmed smooth/non-brick-like button requirement, generated-reference refinements and cross-module maintenance rules. Documentation only; no application code or approved product scope changed.
