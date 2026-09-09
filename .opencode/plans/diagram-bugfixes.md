# Fix: 3 diagram bugs in frankenstein-transformer/index.html

Files to modify: `frankenstein-transformer/index.html`, `frankenstein-transformer/ft-diagram.js`
(No test suite/lint in this static-site repo — verification via headless-browser harness, see below.)

---

## Bug 1 — Diagram always shows Standard Attention

### Root cause (reproduced live, headless Chromium)
- Sidebar presets (`loadExample('frankenstein'|'standard')`) store model keys **flat-dotted**:
  `PRESETS.frankenstein.model = { 'dims.layer_pattern': ['retnet','titan_attn',...], ... }`
- `applyPreset()` (index.html:2845) calls `syncIncludesFromConfig(preset)`, which uses
  `getPath(config, 'model.dims.layer_pattern')` — a **literal nested walk** (`preset.model['dims']` → undefined).
- Result: every `model.dims.*` "Include key" checkbox stays **unchecked** →
  `readObjectValue()` (index.html:1614 `isFieldIncluded`) drops the whole `dims` object from `buildConfig()`
  → `FTDiagram._custom` falls back to its default `['standard_attn']` (ft-diagram.js:716) → diagram shows
  "L0: Standard Attention".
- Confirmed: after `loadExample('frankenstein')`, `buildConfig().model.dims === undefined`
  (also silently corrupts YAML output for presets). Repo-example loading (`applyYamlConfig` + nested YAML) works fine.

### Fix (index.html only)
1. Add helper `unflattenDottedKeys(obj)` next to `normalizeModelFlat` (~line 3041):
   converts `{ 'dims.layer_pattern': v }` → `{ dims: { layer_pattern: v } }` (deep-merges, skips arrays/scalars).
2. In `applyPreset()` line 2845 change to:
   ```js
   syncIncludesFromConfig(Object.assign({}, preset, { model: unflattenDottedKeys(preset.model || {}) }));
   ```
   → include checkboxes get checked → `layer_pattern` (and all dims) reach the config, YAML, and FTDiagram.

---

## Bug 2 — PNG export fails (`SecurityError: Tainted canvases`) + print mode

### Root cause (confirmed)
- Mermaid 11 emits node/edge labels inside `<foreignObject>` with non-XHTML markup (`<br>`, `<p>`).
  Chrome **taints the canvas** when an SVG image containing `foreignObject` is drawn
  (blob-URL SVG) → `c.toBlob()` throws `SecurityError` (index.html:3363).
  Also confirmed: `mermaid.render().svg` as-string is not even valid XML (tag mismatch), so it must be
  round-tripped through the DOM before serialization.
- Current export uses the on-screen theme (dark bg) — user wants print mode (white bg, light standard colors).

### Fix
**ft-diagram.js:**
- Add `STYLES_PRINT` palette — pastel fills + dark strokes + dark text per class:
  attn `#dbeafe/#1d4ed8/#111827`, recur `#dcfce7/#15803d`, ssm `#ede9fe/#6d28d9`, ode `#fce7f3/#a21caf`,
  sparse `#fef3c7/#a16207`, eval `#fee2e2/#b91c1c`, field `#ccfbf1/#0f766e`, fastw `#ffe4e6/#9f1239`,
  emb `#ccfbf1/#0d9488`, norm `#e5e7eb/#4b5563`, ffn `#e5e7eb/#374151`, moe `#ffedd5/#c2410c`,
  output `#f3e8ff/#7c3aed`, train `#dbeafe/#1e40af`, input `#ccfbf1/#0d9488`,
  info `#f3f4f6/#6b7280`, mhc `#ffedd5/#b45309` (all text `#111827`).
- Extend signature: `generate(config, orientation, palette)` — `palette === 'print'` swaps `STYLES` → `STYLES_PRINT`
  in the classDef loop (ft-diagram.js:543). Default behavior unchanged.

**index.html — rewrite `downloadDiagramPNG()` as async:**
1. Guard: no svg → existing `diagramGenerateFirst` feedback.
2. `const config = buildConfig()` (try/catch → feedback), `const def = FTDiagram.generate(config, diagramOrientation, 'print')`.
3. Temporarily re-init mermaid for print:
   `mermaid.initialize({ startOnLoad:false, theme:'default', flowchart:{ htmlLabels:false, useMaxWidth:false },
   themeVariables:{ background:'#ffffff', lineColor:'#334155', textColor:'#0f172a', primaryTextColor:'#0f172a',
   clusterBkg:'#f8fafc', clusterBorder:'#94a3b8', edgeLabelBackground:'#ffffff', fontSize:'13px' } })`.
   (`htmlLabels:false` renders real `<text>` nodes — validated: only ~1 foreignObject remains vs. many.)
4. `const { svg } = await mermaid.render('mPrint-' + (_diagC++), def)`.
5. Post-process inside a detached holder (`holder.innerHTML = svg` → DOM round-trip = valid XML):
   - Replace every remaining `foreignObject` with a centered `<text><tspan>` built from its `textContent`
     lines (13px sans-serif, `text-anchor:middle`, positioned from fo x/y/width/height).
   - Set explicit `width`/`height` attrs from the `viewBox`.
   - Prepend `<rect width="100%" height="100%" fill="#ffffff"/>`.
6. `XMLSerializer` → Blob(`image/svg+xml`) → objectURL → `Image` → canvas @2× → fill white → drawImage →
   `toBlob('image/png')` → anchor download `architecture_diagram.png` → revoke URLs.
7. `finally`: re-`mermaid.initialize` back to UI theme (`currentMermaidTheme()` + `mermaidThemeVars()`) so
   on-screen rendering is untouched; try/catch → `setFeedback` on error.
   No foreignObject in the export SVG → no taint (blob URL is fine; avoids data-URL size limits).

---

## Bug 3 — Low-contrast edges (black in dark, celeste in light)

### Root cause
`mermaidThemeVars()` (index.html:3224) sets `lineColor: var(--border)` → `#30363d` (near-black on dark bg)
/ `#d0d7de` (pale celeste on white).

### Fix (index.html `mermaidThemeVars`)
Explicit contrasting accent colors:
- dark → `lineColor: '#58a6ff'`
- light → `lineColor: '#0969da'`
plus `edgeLabelBackground: surface` for readable edge labels. Arrowheads follow `lineColor` automatically;
existing `refreshMermaidTheme()` re-renders on theme toggle.

---

## Verification (headless Chromium harness — same as diagnosis)
1. `loadExample('frankenstein')` → include checkbox checked, `buildConfig().model.dims.layer_pattern ===
   ['retnet','titan_attn',...]`, diagram first mixer subgraph = "RetNet", YAML contains the pattern.
2. Repo example `llama2_70b.yaml` → still "Grouped-Query Attn" (no regression).
3. `downloadDiagramPNG()` → download event fires, PNG > 0 bytes; screenshot shows white bg, pastel nodes,
   dark edges/text.
4. Dark/light: computed `.flowchart-link` stroke = `#58a6ff` / `#0969da`; screenshots for visual contrast.
