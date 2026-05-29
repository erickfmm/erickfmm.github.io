# Usability and Design Audit Report

## Purpose

This document is an implementation-ready usability, accessibility, and design good-practices audit for the current site.

It covers:

- The main portfolio landing page at `index.html`
- Shared styling and behavior in `styles.css` and `portfolio.js`
- The interactive Config Builder tool at `frankestein-transformer/index.html`
- Supporting diagram behavior where relevant in `frankestein-transformer/ft-diagram.js`

The goal is not only to describe issues, but to make them actionable. Each finding includes:

- Severity
- Why it matters
- Evidence with file references
- Ready-to-implement recommendation
- Acceptance criteria

## Audit Scope

Reviewed files:

- `index.html`
- `styles.css`
- `portfolio.js`
- `frankestein-transformer/index.html`
- `frankestein-transformer/ft-diagram.js`
- `manifest.json`

This audit is code-based. It does not include live browser testing, analytics review, or user testing. Any item involving runtime behavior should still be validated manually after implementation.

## Executive Summary

The site has a solid visual foundation: strong sectioning, reusable card/button patterns, good responsive CSS primitives, and a clear identity. The biggest problems are not aesthetic quality but usability robustness and interaction quality.

The highest-impact issues are:

1. The portfolio navigation disappears on mobile with no replacement.
2. Large portions of the portfolio are hidden by default and only revealed with JavaScript.
3. Keyboard focus states are weak or missing across the site.
4. The Config Builder tabs are not implemented as accessible tabs.
5. The Config Builder has weak labeling, validation, and feedback patterns.
6. The landing page hero and the builder both suffer from excess cognitive load.

If addressed in order, these changes will materially improve:

- Mobile usability
- Accessibility compliance
- Perceived polish
- Conversion clarity
- Trust and robustness
- Ease of use for the Config Builder

## Severity Definitions

- Critical: Breaks navigation, hides content, or materially blocks usage for a meaningful group of users.
- High: Strong negative impact on usability, accessibility, or conversion.
- Medium: Noticeable friction or inconsistency that reduces clarity or confidence.
- Low: Polish, maintainability, or secondary UX issues.

## Strengths to Preserve

These should be kept while fixing issues:

1. Semantic page structure on the portfolio page.
   Evidence: `index.html:130-512`

2. Reusable visual system via tokens and shared components.
   Evidence: `styles.css:1-13`, `styles.css:110-134`, `styles.css:336-342`, `styles.css:406-460`

3. Strong responsive layout primitives.
   Evidence: `styles.css:140-151`, `styles.css:324-333`, `styles.css:368-404`, `styles.css:507-510`

4. Reduced motion support on the portfolio.
   Evidence: `styles.css:582-589`

5. Good use of native `details/summary` in the builder for advanced sections.
   Evidence: `frankestein-transformer/index.html:253-305`, `frankestein-transformer/index.html:320-323`, `frankestein-transformer/index.html:831-860`

6. Shared state concept across YAML, command, and diagram outputs.
   Evidence: `frankestein-transformer/index.html:398-400`, `frankestein-transformer/index.html:1076-1198`, `frankestein-transformer/index.html:1625-1651`

## Findings

### 1. Mobile navigation disappears with no fallback

- Severity: Critical
- Area: Portfolio navigation
- Evidence:
  - `styles.css:554-562`
  - `index.html:116-126`

#### Problem

At widths below `900px`, `.nav-links` is set to `display: none`, but there is no replacement menu, drawer, condensed navigation, or in-page table of contents. On smaller screens, the site loses its primary wayfinding mechanism.

#### Why it matters

- Users cannot quickly jump to `Sobre mi`, `Experiencia`, `Proyectos`, `Hugging Face`, or `Contacto`.
- Mobile users must scroll linearly through the page.
- The page feels less intentional and less usable on smaller devices.
- This is a major navigation regression.

#### Recommendation

Implement one of these patterns:

1. A mobile menu button that opens a simple drawer or dropdown with the same anchor links.
2. A horizontally scrollable mobile nav bar if minimalism is preferred.

Recommended approach for this project: add a small mobile menu toggle using native button semantics and a collapsible nav panel.

Implementation notes:

- Keep the existing desktop nav unchanged.
- Add a mobile-only toggle button with an accessible label.
- Keep the links identical to desktop nav for consistency.
- Close the menu after selecting an anchor link.
- Ensure focus is visible and menu state is programmatically exposed.

#### Acceptance criteria

- At widths below `900px`, users can still reach all major sections through a visible and usable navigation control.
- The menu is keyboard accessible.
- Focus remains visible while navigating the menu.
- Screen readers receive an accessible control name and expanded/collapsed state.

### 2. Portfolio content is hidden by default and depends on JavaScript to become visible

- Severity: Critical
- Area: Portfolio content rendering
- Evidence:
  - `styles.css:533-543`
  - `portfolio.js:47-60`
  - `index.html:153-505`

#### Problem

Elements with `.reveal` start at `opacity: 0` and are only made visible when JavaScript runs and the intersection observer adds `.is-visible`. If JavaScript fails, the observer does not fire, or the browser environment behaves unexpectedly, large parts of the page remain invisible.

#### Why it matters

- Important content can disappear entirely.
- This harms robustness, accessibility, and SEO confidence.
- Progressive enhancement is reversed: the enhanced behavior is required for basic visibility.

#### Recommendation

Invert the behavior so content is visible by default, and only animate when JavaScript explicitly enables it.

Recommended implementation pattern:

1. Make `.reveal` visible by default.
2. Add a class on `body` or `html` such as `.js-enabled` when JS loads.
3. Only apply the hidden pre-animation state when `.js-enabled .reveal` is present.
4. Keep reduced-motion behavior intact.

#### Acceptance criteria

- With JavaScript disabled, all portfolio content remains visible.
- With JavaScript enabled, reveal animations still work.
- No content is invisible at first render unless JS has explicitly enabled animation state.

### 3. Focus visibility is weak or missing across the site

- Severity: Critical
- Area: Global interaction usability and accessibility
- Evidence:
  - Portfolio: `styles.css:28-31`, `styles.css:101-103`, `styles.css:110-134`
  - Builder: `frankestein-transformer/index.html:100`, `frankestein-transformer/index.html:127-140`, `frankestein-transformer/index.html:205-210`

#### Problem

Interactive elements mostly define hover states but not robust `:focus-visible` styles. In the builder, inputs remove the native outline and replace it with a subtle border color shift only.

#### Why it matters

- Keyboard users can lose track of where they are.
- Dense UIs like the Config Builder become hard to operate without strong focus cues.
- This is a core WCAG expectation and a baseline design good practice.

#### Recommendation

Add a clear, consistent global focus-visible style for:

- Links
- Buttons
- Inputs
- Selects
- Textareas
- Summary elements
- Any custom toggles or tab triggers

Recommended visual style:

- High-contrast outline or box shadow
- Minimum 2px visible ring
- Small offset where appropriate
- Must be visible against dark backgrounds

#### Acceptance criteria

- Every interactive element shows a clear visible focus state via keyboard navigation.
- Focus styling is at least as obvious as hover styling.
- Focus remains visible in both the portfolio and builder views.

### 4. Sticky header lacks skip-link support and anchor offset handling

- Severity: High
- Area: Portfolio navigation and keyboard flow
- Evidence:
  - Sticky header: `styles.css:62-69`
  - Anchor sections: `index.html:204`, `251`, `318`, `339`, `409`, `437`, `487`
  - No skip-link or scroll offset rules found in audited files

#### Problem

The site uses a sticky header but does not provide:

- A skip link to bypass repeated navigation
- `scroll-margin-top` or equivalent anchor offset support

#### Why it matters

- Keyboard users should be able to skip repeated navigation.
- In-page anchor jumps can place headings too close to the sticky header.
- This creates friction in section-based navigation.

#### Recommendation

Implement both:

1. A skip link at the top of the page targeting `<main>`.
2. `scroll-margin-top` on section targets or headings to account for the sticky header.

#### Acceptance criteria

- Tabbing from the top of the page reveals a visible skip link.
- Activating the skip link moves focus to main content.
- Anchor jumps position sections cleanly below the sticky header.

### 5. Main navigation does not include all major sections

- Severity: High
- Area: Information architecture
- Evidence:
  - Nav items: `index.html:116-121`
  - Missing sections: `index.html:318-435`

#### Problem

The page includes `Educacion` and `Publicaciones`, but the header nav does not include them.

#### Why it matters

- The navigation does not represent the actual site structure.
- Some important sections are discoverable only by scrolling.
- The page hierarchy feels incomplete.

#### Recommendation

Decide which sections are truly primary. Then align the nav with that decision.

Recommended options:

1. Add `Educacion` and `Publicaciones` to the main nav.
2. If the nav must stay short, consolidate lower-value sections elsewhere and make the structure explicit.

#### Acceptance criteria

- Main navigation reflects the actual primary sections of the page.
- No major section is silently excluded without a deliberate hierarchy reason.

### 6. The hero section has too many competing priorities

- Severity: High
- Area: Portfolio landing page hierarchy
- Evidence:
  - Header CTAs: `index.html:123-126`
  - Hero CTAs and metadata: `index.html:143-151`
  - Stats: `index.html:171-187`
  - Featured banner: `index.html:189-200`

#### Problem

Above the fold, the user sees multiple competing signals:

- Two header CTA buttons
- Two hero CTA buttons
- Contact details
- Stats cards
- A featured project promo banner

This weakens content hierarchy and splits attention.

#### Why it matters

- Users need one clear first action and one clear first impression.
- Excessive top-of-page density makes the page harder to scan.
- The hero feels less editorially curated.

#### Recommendation

Reduce top-of-page competition.

Suggested direction:

1. Keep one primary CTA and one secondary CTA.
2. Move full contact metadata lower or reduce it to one line.
3. Keep either the stats row or the featured banner immediately after the hero, not both.
4. Consider delaying the featured project until the projects section.

#### Acceptance criteria

- The hero communicates identity, value proposition, and one main next action in a single scan.
- Users are not asked to parse more than two CTA paths immediately.
- The featured project does not compete with the core personal introduction.

### 7. Primary CTA destination is weak relative to its promise

- Severity: High
- Area: Portfolio conversion flow
- Evidence:
  - CTA: `index.html:143-145`
  - Contact section: `index.html:487-509`

#### Problem

`Hablemos` suggests a high-intent next step, but the target section mostly restates contact links. There is no stronger guided action such as:

- Send email
- Open LinkedIn DM path
- Download CV
- Start project inquiry
- Schedule a conversation

#### Why it matters

- Good CTAs reduce ambiguity.
- Users should know what happens next.
- Reaching a static contact block feels less satisfying than expected.

#### Recommendation

Clarify the action path.

Possible implementation:

1. Rename CTA to match actual action, such as `Ver contacto`.
2. Or upgrade the contact section so `Hablemos` is accurate, for example:
   - Add a `mailto:` CTA with prefilled subject.
   - Add a direct CV CTA there.
   - Add a short project prompt and a primary contact method.

#### Acceptance criteria

- The primary CTA label matches the destination intent.
- The contact section contains a clear next action rather than only passive contact details.

### 8. CV links create unnecessary friction

- Severity: High
- Area: Portfolio conversion flow
- Evidence:
  - Header CV link: `index.html:125`
  - Contact CV link: `index.html:508`

#### Problem

The current CV links point to a GitHub `blob` page, not a direct PDF file. Users must then continue again to view or download the file.

#### Why it matters

- Resume access is a top-priority action on a portfolio.
- Extra steps reduce conversion.
- GitHub UI is not the ideal surface for this action.

#### Recommendation

Use a direct PDF URL instead of a GitHub HTML page.

Implementation options:

1. Host the PDF directly in this repository and link to it.
2. Use the raw GitHub URL if hosting elsewhere is not desired.

#### Acceptance criteria

- Clicking a CV CTA opens the PDF directly or downloads it immediately.
- The user does not land on an intermediate GitHub page.

### 9. Duplicate promotion of Frankenstein Transformer reduces portfolio breadth

- Severity: Medium
- Area: Portfolio content strategy
- Evidence:
  - Hero banner: `index.html:189-200`
  - Featured project card: `index.html:346-363`

#### Problem

The same project is emphasized twice in close proximity.

#### Why it matters

- Repetition consumes premium space.
- The portfolio looks narrower than it is.
- Users may perceive the rest of the project work as secondary.

#### Recommendation

Choose one dominant surface for this project.

Recommended approach:

- Keep the project featured in the projects section.
- Replace the hero banner with a more personal value proposition, publication highlight, or hiring-oriented proof point.

#### Acceptance criteria

- The project appears once as the main featured item.
- The hero supports personal positioning rather than repeating a project card.

### 10. Language and labeling are inconsistent

- Severity: Medium
- Area: Portfolio content polish and scan consistency
- Evidence:
  - `index.html:6-7`
  - `index.html:156`
  - `index.html:342`
  - `index.html:495-509`

#### Problem

The site is Spanish-first but mixes English and Spanish labels inconsistently, for example:

- `AI Engineer` and `IA Engineer`
- `Backend` and `Back-end`
- `Website` within an otherwise Spanish contact list
- `Ver CV` and `Abrir CV`

#### Why it matters

- Inconsistency lowers perceived polish.
- Mixed terminology makes scanning less smooth.
- It weakens voice and brand clarity.

#### Recommendation

Standardize the content language and terminology.

Suggested decision:

- Keep the site primarily in Spanish.
- Use English only for proper nouns, branded terms, or deliberate audience positioning.
- Standardize repeated labels across sections.

#### Acceptance criteria

- Repeated concepts use the same phrasing across the site.
- The content language strategy is consistent.

### 11. External links open in new tabs without user-facing cues

- Severity: Low
- Area: Link behavior
- Evidence:
  - Multiple `target="_blank"` links throughout `index.html`

#### Problem

Many links open a new tab, but the UI does not signal that behavior.

#### Why it matters

- New-tab behavior can be disorienting.
- Not every external link needs a new tab.

#### Recommendation

Apply a consistent rule:

1. Use new tabs only where it clearly helps preserve user context.
2. Optionally add a subtle icon or text cue for links that open in a new tab.

#### Acceptance criteria

- New-tab behavior is applied intentionally, not universally.
- If retained broadly, users receive a clear cue.

### 12. Portfolio metrics are hard-coded and can drift

- Severity: Low
- Area: Trust and maintainability
- Evidence:
  - `index.html:26`
  - `index.html:173-186`
  - `README.md:54-58`

#### Problem

Counts such as GitHub repos, datasets, and models are duplicated and hard-coded.

#### Why it matters

- Portfolio trust depends on accuracy.
- Stale numbers undermine credibility.

#### Recommendation

If dynamic data is not planned, centralize the values in one obvious source and document how to update them.

Longer-term option:

- Use a lightweight build step or fetch-based update if the site evolves.

#### Acceptance criteria

- Metrics are updated from one source or documented clearly.
- No duplicated values remain without a maintenance reason.

### 13. Builder tabs are not accessible tabs

- Severity: Critical
- Area: Config Builder interaction model
- Evidence:
  - Markup: `frankestein-transformer/index.html:205-210`
  - Behavior: `frankestein-transformer/index.html:393-400`

#### Problem

The builder uses buttons styled as tabs, but they lack expected tab semantics and keyboard behavior.

Missing pieces include:

- `role="tablist"`
- `role="tab"`
- `role="tabpanel"`
- `aria-selected`
- `aria-controls`
- Roving focus or arrow-key navigation

#### Why it matters

- Screen readers do not get a correct interaction model.
- Keyboard users do not get expected tab behavior.
- This creates friction in a high-complexity area.

#### Recommendation

Implement the tabs using proper ARIA tab semantics or replace the pattern with simpler section navigation if preferred.

Recommended approach:

1. Keep buttons but add proper `role`, `aria-selected`, and `aria-controls`.
2. Give each panel `role="tabpanel"` and link it to its tab.
3. Add keyboard support for Left/Right arrow keys and Home/End.
4. Move focus appropriately when switching tabs.

#### Acceptance criteria

- Screen readers announce tabs and selected state correctly.
- Arrow keys move between tabs.
- Tab activation shows only the relevant panel.
- Focus order remains logical.

### 14. Builder labels are not consistently associated with controls

- Severity: Critical
- Area: Config Builder form usability
- Evidence:
  - `frankestein-transformer/index.html:233-241`
  - `frankestein-transformer/index.html:250-257`
  - `frankestein-transformer/index.html:428-430`
  - `frankestein-transformer/index.html:523-530`

#### Problem

The helper `createLabel()` outputs a `<label>` without `for`, while many generated inputs do have IDs. This leaves much of the form visually labeled but not programmatically connected.

#### Why it matters

- Clicking labels does not focus fields reliably.
- Screen reader naming is weaker or inconsistent.
- This is especially harmful in a long, schema-driven form.

#### Recommendation

Update field generation so every non-decorative label is associated with its control.

Implementation approach:

1. Update `createLabel()` to accept the target ID.
2. Pass `for="..."` for all generated text, number, select, and textarea fields.
3. Retain wrapped-label patterns only where checkbox markup already supports it correctly.

#### Acceptance criteria

- Clicking a label focuses its input.
- All fields have accessible names derived from visible labels.
- The generator produces valid label-control associations consistently.

### 15. Builder required fields and validation are only partially implemented

- Severity: Critical
- Area: Config Builder data integrity
- Evidence:
  - Required markers: `frankestein-transformer/index.html:419-430`
  - Field rendering: `frankestein-transformer/index.html:452-472`
  - Value parsing: `frankestein-transformer/index.html:558-561`
  - Config build: `frankestein-transformer/index.html:942-1031`

#### Problem

The UI visually marks some fields as required, but the underlying inputs are not consistently marked `required`, and there is no form validation pass before YAML or command generation.

Numeric fields can also become invalid if emptied, leading to `NaN` or unreliable values entering generated output.

#### Why it matters

- Users can produce invalid configuration output silently.
- Weak validation reduces confidence in the tool.
- Recovery from mistakes is poor.

#### Recommendation

Add structured validation before generating output.

Recommended implementation:

1. Mark actual required inputs with `required` where applicable.
2. Validate numeric values before building config objects.
3. Reject `NaN`, empty mandatory strings, and malformed structured values.
4. Show inline error messages near fields and summarize at the top if needed.
5. Prevent output generation when validation fails.

#### Acceptance criteria

- Required fields cannot be omitted silently.
- Invalid numbers do not flow into YAML or command previews.
- Error states are visible, specific, and recoverable.

### 16. Builder feedback and error messaging are inconsistent and disruptive

- Severity: High
- Area: Config Builder status and system feedback
- Evidence:
  - Status text: `frankestein-transformer/index.html:383-388`
  - Copy actions: `frankestein-transformer/index.html:1101`, `frankestein-transformer/index.html:1229`, `frankestein-transformer/index.html:1691`
  - Load failures and generate flow: `frankestein-transformer/index.html:1440-1456`, `frankestein-transformer/index.html:1662`

#### Problem

The builder mixes plain inline text and blocking `alert()` dialogs. Alerts interrupt the user flow and provide weak context.

#### Why it matters

- Copy actions should feel lightweight, not disruptive.
- Errors should explain what failed and what to do next.
- Accessible feedback should be available to assistive technologies.

#### Recommendation

Replace `alert()` usage with a lightweight notification/status system.

Implementation approach:

1. Add a reusable status or toast area.
2. Mark it with `aria-live="polite"` for non-critical updates.
3. Use inline contextual errors for field problems.
4. Reserve assertive messaging only for major failures.

#### Acceptance criteria

- Copy actions show non-blocking success feedback.
- Load and render failures are communicated inline with recovery guidance.
- Status changes are announced accessibly.

### 17. Builder mobile responsiveness is only partial and introduces nested-scroll friction

- Severity: High
- Area: Config Builder responsive behavior
- Evidence:
  - Layout: `frankestein-transformer/index.html:53-58`, `168`
  - Tabs: `frankestein-transformer/index.html:59-73`, `205-210`
  - Sidebar small text/select: `frankestein-transformer/index.html:190-194`

#### Problem

The builder adapts at `900px`, but the main content keeps its own scroll container, the tabs are not optimized for narrow widths, and several controls are compact for touch use.

#### Why it matters

- Nested scroll regions are cumbersome on mobile.
- Small controls reduce tap comfort.
- Dense content becomes harder to browse and understand.

#### Recommendation

Improve the mobile interaction model:

1. Avoid nested `max-height: 100vh` + internal scrolling for the main content on smaller screens.
2. Allow tabs to wrap, stack, or become a segmented list on narrow widths.
3. Increase touch target sizes and small text where needed.
4. Audit long selects and wide code/output areas for overflow behavior.

#### Acceptance criteria

- The builder can be used on mobile without fighting nested scroll containers.
- Tabs remain readable and operable on narrow widths.
- Key controls meet comfortable touch target expectations.

### 18. Builder exposes too many irrelevant settings at once

- Severity: High
- Area: Config Builder information density
- Evidence:
  - Model and training sections: `frankestein-transformer/index.html:617-620`, `651-805`

#### Problem

Although `details` helps, the builder still presents many settings regardless of current model mode, task, or command. Irrelevant fields remain visible and raise cognitive load.

#### Why it matters

- Dense technical UIs need strong progressive disclosure.
- Showing everything at once makes the form feel more intimidating than necessary.
- Users may edit settings they do not understand or do not need.

#### Recommendation

Conditionally reveal settings based on current choices.

Suggested implementation order:

1. Show only task-relevant training fields.
2. Hide MLM-specific fields when not using MLM.
3. Hide or collapse GPU-specific fields unless enabled or relevant.
4. Make advanced optimizer parameters collapsed by default.
5. Group settings by user mental model rather than raw schema shape.

#### Acceptance criteria

- Users see the minimum needed to complete the current task.
- Advanced settings remain available but are not always competing for attention.

### 19. Builder command generation is not shell-safe for common inputs

- Severity: High
- Area: Config Builder copy-paste workflow
- Evidence:
  - `frankestein-transformer/index.html:1105-1198`

#### Problem

The command preview concatenates raw values such as file paths and free-text options directly into a command string. Values with spaces or shell-sensitive characters will break when pasted into a terminal.

#### Why it matters

- The command preview is a primary output of the tool.
- Broken pasted commands are a direct workflow failure.

#### Recommendation

Quote and escape user-supplied values when constructing the command preview.

Implementation guidance:

1. Add a small helper to shell-quote values safely.
2. Use it consistently for any user-entered value.
3. Preserve flags that are already fixed literals.

#### Acceptance criteria

- Paths with spaces are copied as valid shell arguments.
- Text values do not break the generated command syntax.

### 20. Builder language switching does not preserve user context well

- Severity: Medium
- Area: Config Builder continuity
- Evidence:
  - Language rebuild behavior observed in `frankestein-transformer/index.html` around the form rebuild flow

#### Problem

Changing language rebuilds the form and restores values, but not focus position or reading context.

#### Why it matters

- Keyboard users and screen reader users can lose their place.
- Mid-edit context switching becomes more disruptive than necessary.

#### Recommendation

Preserve context when rebuilding:

1. Track the active element and restore focus when possible.
2. Preserve the active tab and relevant expanded sections.
3. Consider preserving scroll position within the main panel.

#### Acceptance criteria

- Language changes do not drop the user back into an unrelated part of the interface.
- Focus and main context are preserved where practical.

### 21. Builder uses inline event handlers heavily, which makes interaction quality harder to evolve

- Severity: Low
- Area: Maintainability affecting UX evolution
- Evidence:
  - Multiple `onclick`, `onchange`, and `oninput` handlers throughout `frankestein-transformer/index.html`

#### Problem

The builder mixes large inline event wiring with generated HTML strings. This is workable for now, but makes it harder to improve semantics, validation, and state coordination cleanly.

#### Why it matters

- Future UX improvements become more fragile.
- Accessibility enhancements become harder to centralize.

#### Recommendation

Do not rewrite the whole tool immediately. Instead, incrementally move critical interactions to structured event binding for:

- Tabs
- Validation
- Feedback notifications
- Language switching context preservation

#### Acceptance criteria

- New interaction work does not increase inline-event sprawl.
- Critical behaviors are easier to test and maintain.

## Implementation Roadmap

### Phase 1: Critical usability and accessibility fixes

1. Add mobile navigation fallback on the portfolio.
2. Make portfolio content visible by default without JavaScript.
3. Add global focus-visible styles.
4. Add skip link and anchor offset support.
5. Implement accessible tabs in the builder.
6. Fix builder label associations.
7. Add builder validation guardrails.

### Phase 2: High-value UX clarity improvements

1. Simplify hero hierarchy.
2. Improve contact CTA clarity.
3. Replace CV links with direct PDF access.
4. Replace builder `alert()` feedback with inline/toast status.
5. Improve builder mobile layout and reduce nested scroll friction.
6. Add conditional progressive disclosure in the builder.
7. Quote generated command values safely.

### Phase 3: Polish and consistency

1. Align navigation with actual page structure.
2. Remove duplicate project promotion.
3. Standardize language and labels.
4. Review external new-tab behavior.
5. Reduce metric drift risk.
6. Preserve context on builder language switch.

## Suggested Work Breakdown by File

### `index.html`

- Add skip link.
- Add mobile nav toggle and mobile nav panel.
- Rebalance hero content and CTA emphasis.
- Adjust contact section CTA structure.
- Update CV links to direct file access.
- Revisit repeated Frankenstein Transformer promotion.
- Standardize labels and terminology.

### `styles.css`

- Add robust `:focus-visible` rules.
- Add skip-link styling.
- Add mobile nav styles.
- Add `scroll-margin-top` support for anchored sections.
- Update reveal animation model to be JS-enhanced rather than JS-required.
- Rebalance hero spacing if hierarchy changes.

### `portfolio.js`

- Add JS-enabled class for animation gating.
- Support mobile nav open/close behavior if implemented.
- Preserve current counter/reveal behavior after progressive-enhancement fix.

### `frankestein-transformer/index.html`

- Refactor tab markup and behavior for accessibility.
- Fix label generation with `for`/`id` associations.
- Add validation and inline error messaging.
- Add non-blocking live-region feedback for copy/load/render actions.
- Improve mobile layout behavior.
- Reduce irrelevant always-visible settings.
- Quote command arguments safely.
- Preserve context on language switch.

### `frankestein-transformer/ft-diagram.js`

- No urgent usability issue found in the diagram generator itself.
- Keep the current abbreviation behavior for long layer lists.

## QA Checklist After Implementation

### Portfolio page

- Mobile nav is available and usable below `900px`.
- Keyboard users can see focus at all times.
- Skip link appears and works.
- Anchor links do not land under the sticky header.
- All content is visible with JavaScript disabled.
- Hero has one clear primary action and a cleaner hierarchy.
- CV opens directly as a PDF.
- Language is consistent across sections.

### Config Builder

- Tabs are announced and operated correctly with keyboard and screen readers.
- All labels focus their associated fields.
- Required fields are enforced.
- Invalid data does not generate YAML or command output silently.
- Copy and load feedback is non-blocking and announced accessibly.
- Layout remains usable on mobile widths.
- Generated commands remain valid when values include spaces.
- Language switching preserves context acceptably.

## Recommended First Pass

If implementation should start immediately, the best first pass is:

1. Fix portfolio progressive enhancement and focus states.
2. Add mobile nav and skip link.
3. Fix builder tabs and labels.
4. Add builder validation and feedback.
5. Improve direct conversion paths like the CV link.

This sequence produces the biggest usability gain with the least product risk.
