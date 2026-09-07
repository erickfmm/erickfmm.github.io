# Paper fixes — `frankenstein-transformer/paper/`

Status: **documented only, NOT applied** (deferred by owner decision on 2026-09-07).
Every item below lists the evidence (file:line / log excerpt) and external sources
(arXiv) so the error can be independently verified before fixing.

Related: the Mermaid diagram formula fixes derived from the same audit were
applied to `frankenstein-transformer/ft-diagram.js` (see §6).

---

## P1 — LaTeX bug: accent dropped in math mode (ES PDF)

- **File:** `paper/es/appendices/annex-4-sparse-attention.tex:379`
  ```latex
  \State $\mathcal{T}_t \gets \mathrm{TopK-Índices}([s_1, \ldots, s_t], N_{\text{fac}})$
  ```
- **Evidence:**
  - `paper/es/paper-es.log:2190` — `LaTeX Warning: Command \' invalid in math mode on input line 379.`
  - `paper/es/paper-es.log:2192` — `Missing character: There is no Í in font cmr10!`
  - Only occurrence in the whole ES build (other `\'` uses in
    `annex-8-funciones-activacion.tex:244,251,260,275,339` are text-mode and correct).
- **Impact:** the FASA algorithm in the compiled PDF renders "TopK-**ndices**"
  (accent silently dropped).
- **Fix:** `\mathrm{TopK}\text{-Índices}` (or `\textrm{TopK-Índices}`).

## P2 — Bibliography: 44 entries missing `year` (yearless references)

- **Root cause:** the `.bib` files are Zotero exports using the biblatex `date`
  field, but both papers compile with `natbib` + `\bibliographystyle{plainnat}`
  (`en/paper.tex:10,64-65`, `es/paper-es.tex:10,64-65`), which only reads `year`.
- **Evidence:**
  - 45 `Warning--empty year in ...` lines in each of `paper/en/paper.blg` and
    `paper/es/paper-es.blg` (44 unique keys).
  - `paper/en/paper.bbl:148` renders `\bibitem[Devlin et~al()Devlin, ...]`
    (empty `()`), so PDF and `paper-en.html` show "Devlin, ... Toutanova. :" with no year.
- **Fix:** add `year = {YYYY}` to each entry (derive from its `date`; where key and
  `date` disagree, the key matches the publication venue — noted).

### `bibliography/attention_types.bib` (5)
| Key | @entry line | date | year to add |
|---|---|---|---|
| behrouz_titans_2025 | 2 | 2025 | 2025 |
| gu_mamba_2023 | 17 | 2023 | 2023 |
| sun_retentive_2023 | 32 | 2023 | 2023 |
| ramapuram_theory_2024 | 47 | 2024 | 2024 |
| vaswani_attention_2017 | 61 | 2017 | 2017 |

### `bibliography/optimizers.bib` (18)
| Key | @entry line | date | year to add |
|---|---|---|---|
| loshchilov_decoupled_2017 | 2 | 2017 | 2017 |
| liu_variance_2019 | 16 | 2019 | 2019 |
| xie_adan_2022 | 30 | 2022 | 2022 |
| taniguchi_adopt_2024 | 45 | 2024 | 2024 |
| pagliardini_ademamix_2024 | 59 | 2024 | 2024 |
| yuan_mars_2024 | 74 | 2024 | 2024 |
| liang_cautious_2024 | 89 | 2024 | 2024 |
| you_largebatch_2020 | 104 | 2020 | 2020 |
| defazio_road_2024 | 118 | 2024 | 2024 |
| gupta_shampoo_2018 | 132 | 2018 | 2018 |
| vyas_soap_2024 | 147 | 2024 | 2024 |
| shazeer_adafactor_2018 | 163 | 2018 | 2018 |
| zhao_galore_2024 | 178 | 2024 | 2024 |
| mishchenko_prodigy_2023 | 193 | 2023 | 2023 |
| chen_symbolic_2023 | 208 | 2023 | 2023 |
| liu_sophia_2023 | 222 | 2023 | 2023 |
| shen_convergence_2025 | 237 | 2025 | 2025 |
| boissin_turbo-muon_2025 | 251 | 2025 | 2025 |

### `bibliography/other.bib` (21)
| Key | @entry line | date | year to add |
|---|---|---|---|
| zhang_continuous_2021 | 2 | 2021-05-18 | 2021 |
| reimers_sentence-bert_2019 | 49 | 2019-08-27 | 2019 |
| wang_bitnet_2023 | 64 | 2023-10-17 | 2023 |
| samson_lightweight_2026 | 183 | 2026-01-05 | 2026 |
| zhu_transformers_2025 | 197 | 2025-06-14 | 2025 |
| chen_stronger_2025 | 211 | 2025-12-11 | 2025 |
| bravin_embbert_2026 | 239 | 2026-02-11 | 2026 |
| dai_hope_2025 | 269 | 2025-09-08 | 2025 |
| zhang_root_2019 | 329 | 2019-10-16 | 2019 |
| graef2026flashnorm | 686 | 2026-04-24 | 2026 |
| he_deep_2016 | 701 | 2016-06-27 | 2016 |
| kerssies2025eomt | 743 | 2025-03-10 | 2025 |
| dosovitskiy2021vit | 729 | 2020-10-22 | **2021** (key = ICLR 2021; date = arXiv v1) |
| he2022mae | 757 | 2021-11-11 | **2022** (key = CVPR 2022; date = arXiv v1) |
| su_rope_2024 | 771 | 2024-06-13 | 2024 (per key/version date; arXiv v1 is 2021) |
| press_alibi_2022 | 785 | 2022-01-25 | 2022 |
| kazemnejad_nope_2023 | 799 | 2023-05-31 | 2023 |
| ohrstrom_pape_2026 | 813 | 2026-02-01 | 2026 |
| bianchessi_bam_2025 | 827 | 2025-05-28 | 2025 |
| devlin_bert_2019 | 79 | 2019-05-24 | 2019 |

(Line numbers are the `@...{key` entry-start lines; the `date` field sits a few
lines below each. Re-check line numbers before applying — edits above shift them.)

## P3 — Bib field name: `journaltitle` → `journal`

- **File:** `paper/bibliography/other.bib:11` (`zhang_continuous_2021`) uses the
  biblatex-only `journaltitle` field; plainnat warns `empty journal`
  (`en/paper.blg`) and the entry prints without venue.
  Latent same problem: `other.bib:108` (`cai_survey_2025`, currently uncited).
- **Fix:** rename field to `journal` (plus `year = {2021}` from P2).

## P4 — hyperref warnings: math in subsection titles

- **Files:** `paper/en/appendices/annex-4-sparse-attention.tex:199`
  (`\subsection{SparseK Attention: Differentiable Top-$k$ Selection}`) and
  `paper/es/appendices/annex-4-sparse-attention.tex:199` (ES equivalent).
- **Evidence:** `paper/en/paper.log:2192-2199` and `paper/es/paper-es.log:2181-2188`
  — `Package hyperref Warning: Token not allowed in a PDF string (Unicode):
  removing 'math shift' on input line 199` (twice per build: PDF bookmark + .toc).
- **Impact:** cosmetic — bookmark renders as "Top k".
- **Fix:** `\texorpdfstring{Top-$k$}{Top-k}` (or plain `Top-k`).

## P5 — Content inconsistency: KDA description in §04

- **Files:** `paper/en/sections/04-architecture-taxonomy.tex:230` (and the ES
  counterpart `es/sections/04-taxonomia-arquitectura.tex`, ~line 230).
  Says KDA "introduces kernelized dynamic attention with learnable gating over
  the kernel bandwidth".
- **Contradicts:** `paper/en/appendices/annex-5-gated-attention.tex` §8
  (lines 445-480), which correctly defines KDA as a delta-rule recurrence
  `S_t = (I − β_t k_t k_tᵀ) D_t S_{t−1} + β_t v_t k_tᵀ` with channel-wise decay.
- **External source (verified):** Kimi Linear / Kimi Delta Attention —
  arXiv:2510.26692 ("KDA ... extends Gated DeltaNet with a finer-grained
  (channel-wise) gating mechanism"). See also arXiv:2605.22791 (Gated DeltaNet-2),
  whose Table 1 lists the exact KDA update used in annex-5.
- **Note:** the old `ft-diagram.js` `kda_attn` template inherited the §04 error
  (kernelized flow); fixed in ft-diagram.js on 2026-09-07 (see §6).
- **Fix:** rewrite the §04 one-liner (EN+ES) as a channel-wise-decay delta rule.

## P6 — Taxonomy figure vs text: missing nodes / counts

- **File:** `paper/en/sections/04-architecture-taxonomy.tex:71-80` (+ ES counterpart).
  The TikZ "Latent" column has 9 nodes (comment `% Latent column (9)`) but the
  text says Latent (10) — `gma_attn` is missing; `ssog_attn` has no category node
  at all (the spec's 8th category "Geometric Field" is absent from the figure).
- **Count mismatch:** §04 header claims 42 variants in 7 categories;
  `paper/specs/attention-mixers.md:7-29` tree lists 43 leaves under a "42" header
  (it splits GQA out of Dense and double-lists `retnet`/`retnet_attn`, plus SSOG).
- **Fix:** add `gma_attn` to the Latent column; add an SSOG/Geometric-Field node
  or fold SSOG into an existing category; reconcile 42 vs 43.

## P7 — Hygiene (optional)

- [ ] `paper/bibliography/other.bib` — 22 Zotero `file = {PDF:C\:\\Users\\erick.merino\\...}`
      fields leak a local Windows username (first at line 17). BibTeX ignores
      them, but they expose personal paths in a public repo. Strip them.
- [ ] `paper/es/paper-es.tex:47` (abstract) — anglicism "El toolkit además
      soporta..."; the rest of the Spanish text uses "el conjunto de
      herramientas".
- [ ] `paper/README.md:77-79` — stale note claiming BibTeX warns about citations
      "not present in the .bib files (e.g. sun_attnres_2026, dosovitskiy2021vit);
      these appear as `[?]`". Both keys exist (`other.bib:716`, `other.bib:729`),
      the `.blg` files contain **zero** "didn't find a database entry" warnings,
      and no `[?]` appears in the output. The real warnings are the empty-`year`
      ones (P2). Rewrite the note.

## Rebuild & verify (after applying)

```bash
cd paper/en && pdflatex paper && bibtex paper && pdflatex paper && pdflatex paper
cd ../es && pdflatex paper-es && bibtex paper-es && pdflatex paper-es && pdflatex paper-es
# HTML: flatten_tex.py + pandoc per paper/README.md:36-68
cp paper/en/paper.pdf paper/en.pdf && cp paper/es/paper-es.pdf paper/es.pdf
```

Checks: no `empty year` / `empty journal` in `.blg`; no `\' invalid in math mode`
in `paper-es.log`; no hyperref `math shift` warnings; `Í` renders in the ES PDF
(FASA algorithm); years appear in HTML references.

---

## External references used to verify (all checked 2026-09-07)

| Topic | Source |
|---|---|
| Sigmoid attention `σ(QKᵀ/√d + b)` | arXiv:2409.04431 (Ramapuram et al., *Theory, Analysis, and Best Practices for Sigmoid Self-Attention*) |
| GLA gate `α_t = σ(xW_α)^{1/τ}`, update `S_t = G_t S_{t−1} + k_t v_tᵀ` | arXiv:2312.06635 (Yang et al., *Gated Linear Attention Transformers...*), Table 1 & §4 |
| DeltaNet delta rule `S_t = (I − β_t k_t k_tᵀ)S_{t−1} + β_t k_t v_tᵀ` | arXiv:2102.11174 (Schlag et al., *Linear Transformers Are Secretly Fast Weight Programmers*); arXiv:2412.06464 |
| Gated DeltaNet `S_t = α_t (I − β_t k_t k_tᵀ)S_{t−1} + β_t k_t v_tᵀ` | arXiv:2412.06464 (Yang, Kautz, Hatamizadeh, *Gated Delta Networks*), Table 1 of arXiv:2605.22791 |
| KDA `S_t = (I − β_t k_t k_tᵀ)D_t S_{t−1} + β_t k_t v_tᵀ`, `o_t = S_tᵀ q_t` | arXiv:2510.26692 (*Kimi Linear*); Table 1 of arXiv:2605.22791 |
| GDN-2 erase `b_t`/write `w_t`/decay `D_t` gates, `S_t = (I − k_t(b_t⊙k_t)ᵀ)D_t S_{t−1} + k_t z_tᵀ` | arXiv:2605.22791 (Hatamizadeh et al., *Gated DeltaNet-2: Decoupling Erase and Write in Linear Attention*), §3.1, Table 1 |
| HGRN2 matrix state, `Diag(g_t)` forget gate with lower bound `[b_ℓ, 1]` | arXiv:2404.07904 (Qin et al., *HGRN2: Gated Linear RNNs with State Expansion*, COLM 2024); arXiv:2311.04823 (HGRN, lower-bounded forget gates) |
| FoX logit bias `A = softmax(QKᵀ + log F)`, `D_ij = Σ_{l=j+1}^{i} log f_l`, `f_t = σ(w_fᵀx_t + b_f)` | arXiv:2503.02130 (Lin et al., *Forgetting Transformer*, ICLR 2025), Eq. 11-12 |
| Falcon-1 `(1−η_tλ_t)S_{t−1} + η_t x_t r_tᵀ`; Falcon-2 `S_{t−1}(I − λ_t Diag(η_t)) + x_t(η_t⊙r_t)ᵀ`; Falcon-3 window `(η_t/|I_t|)Σ x_j(v_j − S_{t−1}ᵀx_j)ᵀ`; `x_t = φ(k_{t−1})`; `o_t = S_tᵀφ(q_t)`; `η_t = β_t/(‖x_t‖²+λ_t+ε)`; `μ_t^(B) = λmax(B⁻¹Σx_jx_jᵀ)`; 3A `γ_t S_{t−1} + η_t N̄_t^(B)` | arXiv:2608.27763 (*Fast Weight Attention for Continual Learning*), §4 + Fig. 3 equation boxes |
| Mamba conv1d before SSM select/Δ | arXiv:2312.00752 (Gu & Dao, *Mamba*), Fig. 3 block diagram |
| RetNet `S_n = γS_{n−1} + K_nᵀV_n` (diagram already correct) | arXiv:2307.08621 |

## §6 — Cross-reference: fixes applied to `ft-diagram.js` (2026-09-07)

The following SUBSTRUCT templates were corrected against the sources above
(paper annexes 2/5/14 + arXiv table). No paper files were touched.

`sigmoid_attn` (scale+bias), `gla_attn` (outer-product write + explicit `Sₜ₋₁`),
`deltanet_attn` (true delta rule), `gated_deltanet_attn` (de-aliased, adds αₜ decay),
`gated_deltanet2_attn` (erase bₜ / write wₜ / decay Dₜ gates),
`hgrn2_attn` (`gₜ⊗Sₜ₋₁ + V·Kᵀ`, was `fₜ⊗...+fₜ⊗V` typo), `fox_attn` (additive
log-space bias `QKᵀ/√d + D`), `kda_attn` (delta-rule recurrence, was kernelized
flow), `mamba` (conv1d reordered before select; loop from `hₜ`, was from output),
`gma_attn` (posterior normalization + read normalizer `Z`), falcon 1/2/3/1A/2A/3A
(exact update equations from Fig. 3 of arXiv:2608.27763, explicit `Sₜ₋₁` nodes,
read `oₜ = Sₜᵀ·φ(qₜ)`).
