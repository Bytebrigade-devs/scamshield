# ScamShield — Theme, Typography & UI Styling Guide

**Project:** IS2901 Software Development Project · Byte Brigade  
**Version:** 1.2 · 18 October 2026 · **Light specification approved by team decision, 16 October 2026; dark-mode extension requested by the project manager, 18 October 2026**  
**Status:** Shared light-default specification with a manager-requested dark-mode extension. The user's requirement for smooth, non-brick-like buttons is unchanged. This revision documents tokens and states only; it does not implement application styling or verify rendered dark-mode UI. The earlier team approval is not extended to new dark-mode mockups or implementation.  
**Design steward:** Module 1 owner (proposed); to be named and recorded at the ownership meeting. All module owners follow the same approved system.

## 1. Purpose and direction

### M3 implementation notes — 27 October 2026

PR #22 consumes the palette through shared aliases in `src/app/globals.css`. Its inverse navigation aliases (`--color-nav-background`, `--color-nav-surface`, `--color-nav-text`, `--color-nav-muted`, `--color-nav-border`, `--color-nav-accent`, `--color-nav-selected`) map respectively to the existing dark background, surface, text, muted, border, primary and subtle-primary values. Navigation stays an inverse surface in the light-default layout. `--color-overlay` centralises the existing navy backdrop at 45% opacity; transparency still needs rendered-context review. Component styles contain no raw colour literals.

Secondary controls use the specified surface fill with primary-coloured text/border and mode-specific pressed states. Body type is 16px; metadata and controls are at least 14px, including mobile layouts. A single root `@font-face` loads the licensed local Plus Jakarta Sans file. These are implementation notes, not a new palette, a typography exception, or design-steward sign-off. Rendered dark-mode acceptance remains open.

Give the landing page, onboarding, subscription screens, password vault, scam checker, admin dashboard and Digital Safety Score one coherent identity.

**Direction: light-default with a coordinated dark mode, navy–teal, clear and reassuring.** Use generous whitespace, readable typography, softly rounded controls and restrained shadows. Dark mode uses navy backgrounds, slate surfaces, light text and brighter teal actions—not a neon hacker terminal.

- Navy anchors the identity: headings in light mode, backgrounds in dark mode.
- Teal identifies actions and selected controls.
- Neutral backgrounds carry most of the interface.
- Green, amber and red communicate meaningful states, not decorative module identities.
- Smoothness comes from proportions, rounded edges and subtle feedback—not excessive gradients, blur or animation.

Every module follows this shared ScamShield visual specification. A value can still be refined through the change process in §7 (propose with reason, affected components and examples; record the decision here and in the changelog). Dark mode is specified below as a coordinated extension; module owners must not invent separate dark palettes. Light remains the default. Adding these specifications does not implement a theme switcher or persistence behaviour.

## 2. Colour palette

The semantic names below are the contract between design and implementation. Exact values live in shared tokens, not individual components.

### Light palette (default; existing values unchanged)

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

### Dark palette

Override the same semantic names at the application root for dark mode; components keep their existing aliases. A light brand asset must be reviewed separately rather than placing an unchanged navy wordmark on navy.

| Semantic token | Dark value | Purpose |
|---|---|---|
| `--color-brand` | `#F8FAFC` | Brand text and prominent headings on dark surfaces |
| `--color-primary` | `#2DD4BF` | Primary buttons, links and selected controls |
| `--color-on-primary` | `#0F172A` | Dark text/icons on bright teal buttons; never reuse white labels here |
| `--color-primary-hover` | `#5EEAD4` | Hover fill for primary buttons |
| `--color-primary-active` | `#14B8A6` | Pressed fill for primary buttons |
| `--color-primary-subtle` | `#134E4A` | Quiet teal supporting surface and secondary hover/pressed fill |
| `--color-background` | `#0F172A` | Default page background |
| `--color-surface` | `#1E293B` | Cards, forms, menus and elevated panels |
| `--color-text` | `#F8FAFC` | Main text |
| `--color-text-muted` | `#CBD5E1` | Supporting text, descriptions and placeholders; not a replacement for labels |
| `--color-border-subtle` | `#334155` | Decorative card edges and separators only |
| `--color-border-control` | `#94A3B8` | Identifiable input/control boundaries |
| `--color-success` | `#4ADE80` | Low-risk indicators and successful operations, with contextual labels |
| `--color-warning` | `#FBBF24` | Caution and suspicious-result indicators |
| `--color-danger` | `#F87171` | High-risk indicators, errors and destructive actions |
| `--color-disabled-bg` | `#334155` | Disabled button background |
| `--color-disabled-text` | `#94A3B8` | Disabled button text/icons |

### Additional shared state and elevation tokens

These additions complete focus and destructive-button states in both modes without changing existing light palette values. Status text uses `--color-danger`; filled destructive controls use it with `--color-on-danger`.

| Semantic token | Light value | Dark value | Purpose |
|---|---|---|---|
| `--color-on-danger` | `#FFFFFF` | `#0F172A` | Text/icons on destructive fills in every state |
| `--color-danger-hover` | `#991B1B` | `#FCA5A5` | Destructive-button hover fill |
| `--color-danger-active` | `#7F1D1D` | `#EF4444` | Destructive-button pressed fill |
| `--color-focus` | `#0F766E` | `#2DD4BF` | Keyboard-focus outline on the mode's page, surface and subtle teal fill |
| `--shadow-surface` | `0 4px 16px rgb(15 23 42 / 0.06)` | `0 4px 16px rgb(0 0 0 / 0.20)` | Optional restrained elevation; never the only dark-surface boundary |

### Usage rules

1. Keep most surfaces neutral: white/soft white in light mode, navy/slate in dark mode. Use teal selectively so primary actions remain obvious.
2. Do not give each module a separate theme. The multicolour module map in `project-overview.html` is a management visualisation, not the product palette.
3. Pair status colours with readable text and an icon. Never communicate risk through colour alone.
4. A green result means a limited assessment such as **“Low risk detected”**, not **“Guaranteed safe.”** Final verdict/category wording must follow the shared taxonomy agreed under X-13; this guide does not define new backend categories.
5. Do not use the subtle separator colour as the sole visible boundary of an input that needs a contrasting outline.
6. Charts must include labels/legends and additional distinctions where needed. Agree a shared chart palette rather than treating risk colours as arbitrary series colours.

### Light contrast checks

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

### Dark contrast checks

Calculated from the specified opaque sRGB values using the same WCAG relative-luminance formula. Text must reach 4.5:1; identifying control boundaries and focus indicators must reach 3:1 against adjacent backgrounds. Use unrounded results for pass/fail decisions.

| Foreground / background | Contrast | Threshold | Result |
|---|---:|---|---|
| Main text `#F8FAFC` / page `#0F172A` | 17.06:1 | 4.5:1 | Pass |
| Main text `#F8FAFC` / surface `#1E293B` | 13.98:1 | 4.5:1 | Pass |
| Muted text `#CBD5E1` / surface `#1E293B` | 9.85:1 | 4.5:1 | Pass |
| Primary link/focus `#2DD4BF` / surface `#1E293B` | 7.86:1 | 4.5:1 text; 3:1 focus | Pass |
| Primary label `#0F172A` / default fill `#2DD4BF` | 9.59:1 | 4.5:1 | Pass |
| Primary label `#0F172A` / hover fill `#5EEAD4` | 12.07:1 | 4.5:1 | Pass |
| Primary label `#0F172A` / pressed fill `#14B8A6` | 7.17:1 | 4.5:1 | Pass |
| Secondary label/focus `#2DD4BF` / subtle fill `#134E4A` | 5.09:1 | 4.5:1 text; 3:1 focus | Pass |
| Success `#4ADE80` / surface `#1E293B` | 8.40:1 | 4.5:1 | Pass |
| Warning `#FBBF24` / surface `#1E293B` | 8.76:1 | 4.5:1 | Pass |
| Danger `#F87171` / surface `#1E293B` | 5.29:1 | 4.5:1 | Pass |
| Destructive label `#0F172A` / default fill `#F87171` | 6.45:1 | 4.5:1 | Pass |
| Destructive label `#0F172A` / hover fill `#FCA5A5` | 9.41:1 | 4.5:1 | Pass |
| Destructive label `#0F172A` / pressed fill `#EF4444` | 4.74:1 | 4.5:1 | Pass |
| Control border `#94A3B8` / surface `#1E293B` | 5.71:1 | 3:1 | Pass |
| Control border `#94A3B8` / page `#0F172A` | 6.96:1 | 3:1 | Pass |
| Focus `#2DD4BF` / page `#0F172A` | 9.59:1 | 3:1 | Pass |

The added light destructive hover/pressed fills also pass with white labels: `#991B1B` = **8.31:1**, `#7F1D1D` = **10.02:1**. In dark mode, white on the default primary fill would fail normal-text AA, so `--color-on-primary` must change with the theme. Risk badges use status-coloured text/icons on `--color-surface`; new tinted alert fills need separate shared tokens and contrast checks before use. These calculations do not certify rendered UI, transparency, focus geometry or chart accessibility.

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
| Keyboard focus | Clear 3px `--color-focus` outline with 2px offset; the offset exposes the mode's page/surface, not the button fill; recheck other adjacent backgrounds |

### Light variants and states

| Variant | Default | Hover | Pressed |
|---|---|---|---|
| Primary | Teal fill, white label | Darker teal `--color-primary-hover` | Deep teal `--color-primary-active` |
| Secondary | White fill, teal label and 1px teal border | Subtle teal background | Subtle teal background with a darker teal label/border |
| Text / tertiary | Transparent surface, teal label | Underline for links; subtle tint for button controls | Darker teal label |
| Destructive | `--color-danger` fill, `--color-on-danger` label | `--color-danger-hover` fill | `--color-danger-active` fill |

### Dark variants and states

| Variant | Default | Hover | Pressed |
|---|---|---|---|
| Primary | `--color-primary` fill, `--color-on-primary` label | `--color-primary-hover` fill; same label | `--color-primary-active` fill; same label |
| Secondary | `--color-surface` fill, `--color-primary` label and 1px border | `--color-primary-subtle` fill; same label/border | Same subtle fill/label/border; optional reduced-motion-aware press feedback only |
| Text / tertiary | Transparent, `--color-primary` label | Underline for links; subtle fill for button controls | Keep the primary label on the subtle fill; do not reuse light-mode pressed label colours |
| Destructive | `--color-danger` fill, `--color-on-danger` label | `--color-danger-hover` fill; same label | `--color-danger-active` fill; same label |

In both modes, primary labels consume `--color-on-primary`, not a hardcoded white. Loading indicators inherit the corresponding on-colour. Use `--color-focus` for keyboard focus rather than a status colour; keep its offset area opaque and unobscured.

- Disabled: use the shared disabled tokens, disable activation and remove hover/press feedback. Do not simply reduce the whole component's opacity.
- Loading: show a progress indicator and a meaningful label such as “Checking…”, prevent duplicate submission and retain the button's width where practical.
- Hover must not move neighbouring content. A small optional press transform may be considered, but no bouncing, exaggerated scaling or heavy 3D depression.
- Transition background colour, border colour, text colour and/or shadow explicitly; **never `transition: all`**.
- Respect `prefers-reduced-motion`: remove optional transforms and nonessential animation without removing state feedback.
- Keep touch targets at least 44 × 44px, including icon-only actions. Give icon-only controls accessible names.

**Avoid:** sharp square corners, oversized solid slabs, thick borders, hard shadows, mottled/textured teal fills, pronounced gradients and a different button design in every module.

## 5. Supporting surfaces and icons

- **Inputs:** approved 12px radius and at least 44px height for single-line controls; use `--color-surface`, `--color-text`, muted placeholders, `--color-border-control` and `--color-focus` in the active mode. Preserve clear labels and field-specific error text; dark inputs must not retain white autofill backgrounds or unreadable browser-native states.
- **Cards/panels:** approved 16px radius, `--color-surface`, subtle edge and restrained shadow only when elevation helps. Dark panels use the slate surface against the navy page; an identifying control still needs the stronger control border. Nested radii should look coherent with their spacing, rather than blindly using the same radius everywhere.
- **Spacing:** use a shared 4px-based scale, commonly 8, 12, 16, 24 and 32px. Give controls breathing room without turning the dashboard into oversized empty cards.
- **Shadows:** use `--shadow-surface` from the active mode, validated in rendered context before marking the component done. Keep the existing light shadow unchanged; dark elevation relies on surface contrast and edges rather than stacked heavy shadows or glowing borders.
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

### Theme application contract (for later implementation)

- Light values are the root defaults. Apply dark semantic overrides once at the root using one agreed selector, such as `[data-theme="dark"]`; do not mix independent per-route palettes or a second Tailwind theme source.
- Set the corresponding native `color-scheme` (`light` or `dark`) with that root selection so built-in controls follow the mode. Inspect autofill, menus and browser-native states in the real application.
- Keep Plus Jakarta Sans, font weights/sizes, spacing, 12px controls, 16px cards, touch targets and motion timings identical across modes. Do not apply a global invert filter or lower whole-component opacity.
- Any future user/system preference, persistence or switcher must be agreed and implemented centrally. Until then, this guide defines dark styling without claiming a working toggle, automatic system-mode selection or flash-free initial rendering.

### Ownership and change process

- The Module 1 design steward maintains the specification and shared components; the named person is recorded at the ownership meeting.
- Every module reuses the same Button, Input, Card and RiskBadge primitives. Dashboard density can differ from the landing page without changing the brand language.
- Propose a shared-token change with its reason, affected components and updated design examples. Do not silently override a global choice inside one route.
- Review and merge application changes through the established PR workflow. Record material decisions in this guide and `CHANGELOG.md`.
- `Management\` remains local unless sharing it is approved. **2026-10-17: a shared copy of this guide is authorised for the `scamshield` repository** so every member follows the approved system. Keep editing this original, re-copy it into the repository after each material change, and record the sync in `Management\CHANGELOG.md`; if the copies ever differ, this original is the source of truth.
- Apply brand styling to product mockups and presentation graphics as appropriate, but **official report/template formatting takes precedence** over this font and palette guide.

### Review checklist

- [x] Original light palette/font and detailed component values approved by team decision, 16 October 2026.
- [x] Dark-mode specification added at the project manager's request, 18 October 2026; listed opaque contrast pairs calculated.
- [ ] Representative dark landing, scam-result and vault/dashboard mockups reviewed; no retrospective extension of the 16 October light approval.
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

**Verified now:** the six original light contrast pairs, 17 listed dark pairs and two added light destructive-state pairs calculated from the specified sRGB values. The font's licence source was checked for the original guide. The supplied image supports visual discussion only.

**Not yet verified by this revision:** rendered dark-mode appearance, theme switching/persistence, native-control/autofill behaviour, responsive layout, component states, focus geometry, actual motion, full accessibility or consistency across implemented modules. Existing light mockups do not verify dark rendering. This document is not evidence of working application UI.

**Next step:** review representative light/dark mockups and confirm the dark extension through the shared design process, name the design steward at the ownership meeting, then mirror the reviewed mode-aware tokens into Figma and the application's shared token layer. Verify actual component states and before/after desktop/mobile captures during implementation; documentation and numerical contrast checks are not rendered-design sign-off.

### Revision history

- **2026-10-18 · v1.2:** added the manager-requested navy/slate dark palette, mode-aware primary/destructive labels, focus/elevation tokens, dark component states and root-theme contract. Light remains the default; existing light palette, typography, spacing and geometry are unchanged. Added shared light destructive hover/pressed values and calculated contrast checks. Repository guide synchronised with its existing external-instructions reference adaptation. Documentation only; no application, Figma, diagram, switcher, commit or push change, and no new team/mockup approval claimed.
- **2026-10-16 · v1.0:** theme approved by team decision. Status moved from proposal to approved specification; approval recorded, design-steward naming still pending at the ownership meeting. No application styling implemented.
- **2026-10-17 · v1.1:** authorised a shared team copy in the `scamshield` repository so all members can follow this guide. The `Management\` original stays the source of truth; material future changes are re-copied into the repository and recorded in the changelog. No palette, typography or component values changed.
- **2026-10-16 · v0.1:** recorded the proposed navy–teal light-first theme, Plus Jakarta Sans typography, the confirmed smooth/non-brick-like button requirement, generated-reference refinements and cross-module maintenance rules. Documentation only; no application code or approved product scope changed.
