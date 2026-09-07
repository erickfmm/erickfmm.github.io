# Gap Analysis: Modern Model Architectures vs. Frankenstein Schema

**Date:** 2026-09-07
**Status:** Research document for future implementation
**Companion:** 14 new YAML presets in `frankenstein-transformer/examples/` (see table in §3)

All architecture values below were read directly from each model's `config.json` on
Hugging Face (`https://huggingface.co/<repo>/raw/main/config.json`) on 2026-09-07.
Frankenstein schema references are `frankenstein-transformer/schema/`.

---

## 1. Scope: verified architectures

| Model | HF repo | model_type | Released | YAML preset |
|-------|---------|-----------|----------|-------------|
| Qwen3.8-27B | `Qwen/Qwen3.8-27B` | `qwen3_5_text` | 2026-08 | `qwen3_8_27b.yaml` |
| Qwen3.8-2.4T-A95B | `Qwen/Qwen3.8-2.4T-A95B` | `qwen3_5_moe_text` | 2026-08 | `qwen3_8_2t4_a95b.yaml` |
| Qwen3.8-Flash-Next | `Qwen/Qwen3.8-Flash-Next` | `qwen4_exp_text` | 2026-08 | `qwen3_8_flash_next.yaml` |
| Qwen3-Next-80B-A3B | `Qwen/Qwen3-Next-80B-A3B-Instruct` | `qwen3_next` | 2025-09 | `qwen3_next_80b.yaml` |
| GLM-5 | `zai-org/GLM-5` | `glm_moe_dsa` | 2026-02 | `glm_5.yaml` |
| GLM-4.7 | `zai-org/GLM-4.7` | `glm4_moe` | 2025-12 | `glm_4_7.yaml` |
| Kimi-K3 | `moonshotai/Kimi-K3` | `kimi_k3` (KimiLinear) | 2026-06 | `kimi_k3.yaml` |
| Kimi-K2.7-Code | `moonshotai/Kimi-K2.7-Code` | `kimi_k25` (DeepseekV3 core) | 2026-06 | `kimi_k2_7.yaml` |
| MiniMax-M3 | `MiniMaxAI/MiniMax-M3` | `minimax_m3_vl` | 2026-06 | `minimax_m3.yaml` |
| MiniMax-M2.7 | `MiniMaxAI/MiniMax-M2.7` | `minimax_m2` | 2026-04 | `minimax_m2_7.yaml` |
| Llama-4-Scout-17B-16E | `meta-llama/Llama-4-Scout-17B-16E-Instruct` | `llama4_text` | 2025-04 | `llama4_scout.yaml` |
| Llama-4-Maverick-17B-128E | `meta-llama/Llama-4-Maverick-17B-128E-Instruct` | `llama4_text` | 2025-04 | `llama4_maverick.yaml` |
| Phi-4 | `microsoft/phi-4` | `phi3` | 2024-12 | `phi_4.yaml` |
| gpt-oss-120b | `openai/gpt-oss-120b` | `gpt_oss` | 2025-08 | `gpt_oss_120b.yaml` |
| LFM2.5-2.6B | `LiquidAI/LFM2.5-2.6B` | `lfm2` | 2026 | **doc-only** (G2) |
| LFM2.5-8B-A1B | `LiquidAI/LFM2.5-8B-A1B` | `lfm2_moe` | 2026-08 | **doc-only** (G2) |
| LFM2.5-Encoder-350M | `LiquidAI/LFM2.5-Encoder-350M` | `lfm2` (bidirectional MLM) | 2026-07 | **doc-only** (G2) |
| Phi-4-mini-flash | `microsoft/Phi-4-mini-flash-reasoning` | `phi4flash` | 2025-06 | **doc-only** (G1) |

No YAML preset exists for the four doc-only models: their core mixers are not expressible
in the current schema (details in the gap sections). They should get presets as soon as
the corresponding gaps (G1, G2) are implemented.

---

## 2. Cross-cutting gap catalog (to implement later)

Ordered roughly by how many modern models each gap unblocks.

### G1 — Causal sliding-window attention block
- **Needed by:** gpt-oss-120b (`layer_types` alternates `sliding_attention`/`full_attention`,
  sliding window 128), Phi-4-mini-flash (`sliding_window: 512`, hybrid GDN+SWA, arXiv:2507.06607).
- **Gap:** the schema has sliding-window blocks only in encoder-oriented sparse mixers
  (`longformer_attn`, `bigbird_attn`, `sparse_transformer_attn` — see
  `schema/_model/_dims.yaml` layer table). There is no *causal* SWA mixer for decoders.
- **Proposal:** add `swa_attn` (causal sliding-window GQA with configurable window), usable
  in `layer_pattern` mixed with `gqa_attn`.
- **Refs:** https://huggingface.co/openai/gpt-oss-120b (config.json), arXiv:2507.06607.

### G2 — Gated short-convolution block (LFM)
- **Needed by:** LFM2.5-2.6B / 8B-A1B / Encoder-350M. `layer_types` in their configs is a
  mix of `conv` (20/30 layers at 2.6B; 16/24 at 8B-A1B; 11/16 at Encoder-350M) and
  `full_attention`. `conv_L_cache: 3`, `conv_dim`, `conv_dim_out`, `conv_bias` keys.
- **Gap:** no conv mixer exists. `model.embedding.conv` (`schema/_model/_embedding.yaml`)
  is an embedding-stage Conv1d only — not a per-layer mixer.
- **Proposal:** add `gconv_attn` — gated short convolution mixer (LfG-style) with
  `kernel` / `L_cache` / in-out dims, trainable in both encoder and decoder modes. This is
  the single highest-value gap for the whole LFM line (decoder + MLM encoder variants).
- **Refs:** https://huggingface.co/LiquidAI/LFM2.5-2.6B, LiquidAI LFM2 technical report.

### G3 — Shared experts in MoE
- **Needed by:** GLM-5 (`n_shared_experts: 1`), GLM-4.7 (`1`), Kimi-K3 (`num_shared_experts: 2`),
  Kimi-K2.7 (`1`), MiniMax-M3 (`1`), Qwen3.8 MoE (`shared_expert_intermediate_size: 2048/640`),
  Qwen3-Next (`512`), gpt-oss-120b, Llama-4 (`+1 shared`), LFM2.5-8B-A1B.
- **Gap:** `model.num_experts` / `top_k_experts` (`schema/_model/_model_flat.yaml`) implement
  pure top-k routing with no always-on shared expert term in the FFN output.
- **Proposal:** add `num_shared_experts` (default 0) + `shared_expert_intermediate_size`.
- **Note:** existing presets (deepseek_v3, kimi_k2, all new ones) simply omit the shared expert.

### G4 — Per-layer MoE placement
- **Needed by:** GLM-5/GLM-4.7/Kimi-K2.7 (`first_k_dense_replace: 3/3/1`), MiniMax-M3
  (`moe_layer_freq` list: first 3 layers dense), Llama-4 (`interleave_moe_layer_step: 1/2`),
  Qwen3-Next (`decoder_sparse_step: 1`), Kimi-K3 (`moe_layer_freq`).
- **Gap:** MoE is a model-wide switch (`use_moe`) applied to every layer; the schema has no
  notion of dense/MoE alternation.
- **Proposal:** add `moe_first_k_dense_replace` and/or `moe_interleave_step` (MoE on layers
  where `layer_idx % step == 0`), mirroring the HF config keys.
- **Note:** all presets today approximate by making every layer MoE (or every layer dense).

### G5 — Independent head_dim / non-square q-projections
- **Needed by:** Qwen3.8-27B (24 heads × head_dim 256 on hidden 5120 → q-proj 6144 > 5120),
  Qwen3.8-Flash-Next (24×256 on 2560), Qwen3-Next (16×256 on 2048), GLM-4.7 (96×128 on 5120),
  Kimi-K3 (96 heads, head_dim 128, on hidden 7168), gpt-oss-120b (64×64 on 2880).
- **Gap:** `schema/_model/_dims.yaml` documents `hidden_size` "**Must be divisible by
  `num_heads`**" and head dim is derived as `hidden_size / num_heads`. Qwen/GLM/K3 compute
  q/k/v projections to arbitrary widths independent of `hidden_size`.
- **Current workaround (applied in presets):** reduce `num_heads` so divisibility holds while
  preserving the real per-head dim — qwen3_8_27b uses 20 heads × 256 instead of 24 × 256;
  glm_4_7 uses 40 × 128 instead of 96 × 128; kimi_k3 uses 56 × 128 instead of 96 × 128.
- **Proposal:** add optional `dims.head_dim` override; when set, build q/k/v projections of
  width `num_heads × head_dim` and relax the divisibility rule.

### G6 — New activation functions
- **Needed by:** Kimi-K3 (`hidden_act: "situ"` with `activation_situ_beta: 4.0`,
  `activation_situ_linear_beta: 25.0`), MiniMax-M3 (`hidden_act: "swigluoai"` with
  `swiglu_alpha: 1.702`, `swiglu_limit: 7.0` — OpenAI's SwiGLU-OAI variant, also used by
  gpt-oss family).
- **Gap:** `ffn_activation` enum (`schema/_model/_model_flat.yaml:391`) has 44 values but
  neither `situ` nor `swigluoai`; there are no parameterized gate alpha/limit knobs.
- **Current workaround:** presets map situ→`silu`, swigluoai→`swiglu`.
- **Proposal:** add `situ` (2 params) and `swigluoai` (alpha, limit) to the enum, with
  parameters via `ffn_activation_config`.

### G7 — Per-layer NoPE / iRoPE
- **Needed by:** Llama-4 Scout/Maverick (`no_rope_layers`: 36 of 48 layers are NoPE — RoPE only
  every 4th layer, "iRoPE"), gpt-oss-120b (RoPE on half the head dims, plus YaRN scaling),
  Qwen3-Next family (RoPE on full-attention layers only; GDN layers have their own decay).
- **Gap:** `positional_encoding` (`schema/_model/_positional_encoding.yaml`) is model-wide;
  the per-mixer `use_pe` flags toggle whole mixer *types* (e.g. all `gqa_attn` layers), not
  individual layer indices within a type.
- **Proposal:** extend `positional_encoding_parameters.use_pe` (or layer_pattern entries) with
  per-layer-index overrides, e.g. `nope_layers: [0,1,2,4,...]` or `rope_every: 4`.
- **Note:** Qwen hybrid presets are unaffected because `gated_deltanet_attn` already defaults
  to PE-off; only Llama-4/gpt-oss presets lose fidelity here.

### G8 — YaRN / llama3-style rope scaling
- **Needed by:** gpt-oss-120b (`rope_type: yarn`, factor 32, beta_fast 32, beta_slow 1,
  truncate false), Llama-4-Scout (`rope_type: llama3`, factor 16, original_max 8192 → 10M ctx).
- **Gap:** `rope.scaling` in `schema/_model/_positional_encoding.yaml` is a scalar position
  multiplier only — no YaRN or llama3 frequency-scaling algorithms.
- **Proposal:** accept a nested `rope.scaling_config` object supporting `yarn` and `llama3`
  types with their factor/beta params.

### G9 — Attention sinks and logit softcapping / clipped softmax
- **Needed by:** gpt-oss-120b (learnable attention sink per head + softmax clipping, from the
  Gemma/gpt-oss lineage), Gemma-2/Gemma-3 lineage generally (already approximated in existing
  gemma2 presets).
- **Gap:** no sink or capping fields anywhere in `schema/_model/`.
- **Proposal:** optional `attention.attention_sink: true` (adds `num_heads` sink logits) and
  `attention.logit_softcapping: <float>` applied inside SDPA.

### G10 — GLM-5 DSA (DeepSeek Sparse Attention) indexer
- **Needed by:** GLM-5 (`model_type: glm_moe_dsa`; `index_head_dim: 128`, `index_n_heads: 32`,
  `index_topk: 2048`, `indexer_rope_interleave: true`).
- **Gap:** the closest blocks are `nsa_attn` (three-branch NSA) and `msa_attn`
  (MiniMax block-sparse: block_size/topk_blocks/index_dim — see
  `schema/_model/_attention_sparse.yaml`). GLM-5's DSA is a *selection-index* attention on top
  of MLA; msa_attn has the right knobs (top-k block selection with a lightweight index branch)
  but is GQA-based, not MLA-based.
- **Current workaround:** `glm_5.yaml` uses plain `mla_attn` (dense), dropping the sparse
  indexer.
- **Proposal:** either teach `msa_attn` to operate over MLA latents, or add `dsa_attn`
  (MLA + lightning indexer).

### G11 — Kimi K3 linear-attention specifics
- **Needed by:** Kimi-K3 `linear_attn_config`: `head_dim: 128`, `num_heads: 96`,
  `short_conv_kernel_size: 4`, `use_full_rank_gate: true`, `gate_lower_bound: -5.0`;
  MLA dims: `q_lora_rank: 1536`, `qk_nope_head_dim: 128`, `qk_rope_head_dim: 64`,
  `v_head_dim: 128`, `kv_lora_rank: 512`.
- **Gap:** `kda_attn` (schema: Kimi Delta Attention, arXiv:2510.26692) has no config surface
  in `schema/_model/` for conv kernel / gate bounds / full-rank gate; `mla_attn`
  (`schema/_model/_attention_latent.yaml`) exposes only `latent_rank` — no q_lora rank or
  per-part head-dim split.
- **Current workaround:** `kimi_k3.yaml` uses `kda_attn`/`mla_attn` at default hyperparams
  with `latent_rank: 512`.
- **Proposal:** add `attention.mla.q_lora_rank`, `attention.kda.{conv_kernel,gate_lower_bound,use_full_rank_gate}`.

### G12 — MTP / NextN layers
- **Needed by:** GLM-5 (`num_nextn_predict_layers: 1`), GLM-4.7 (`1`), Kimi-K2.7 (`0` in code
  release; deployed with MTP), MiniMax-M3 (`num_nextn_predict_layers: 1`, `num_mtp_modules: 7`).
- **Gap:** multi-token-prediction heads (extra transformer module + shared embedding LM head
  predicting n+1 tokens) don't exist in the training config.
- **Proposal:** optional `num_mtp_layers` (self-speculative decoding heads, loss-weighted).

### G13 — Low-rank / latent routed experts
- **Needed by:** Kimi-K3 (`routed_expert_hidden_size: 3584` vs hidden 7168 — factorized
  expert MLPs, `latent_moe_use_norm: true`, 896 experts × top-16).
- **Gap:** `num_experts` experts are full-rank MLPs of `ffn_hidden_size`; no factorized
  expert option.
- **Current workaround:** `kimi_k3.yaml` sets `ffn_hidden_size: 3072` (the moe_intermediate)
  for all experts.
- **Proposal:** optional `expert_hidden_size` (per-expert intermediate, decoupled from dense
  FFN) + `use_low_rank_experts`.

### G14 — Router fidelity
- **Needed by:** MiniMax-M3 (`scoring_func: sigmoid`, `use_routing_bias: true`,
  `routed_scaling_factor: 2.0`, `norm_topk_prob: true`), GLM-5 (`noaux_tc` top-k method,
  `routed_scaling_factor: 2.5`), Kimi-K3 (`moe_router_activation_func: sigmoid`,
  `moe_renormalize`, `num_expert_group: 1`, `routed_scaling_factor: 1.0`).
- **Gap:** router is softmax + top-k; no sigmoid scoring, routing bias, renormalization or
  output scaling factor.
- **Proposal:** `router.scoring_func`, `router.norm_topk_prob`, `router.scaling_factor`,
  `router.bias`.

### G15 — Qwen3-Next / GDN decoupled RoPE + tan gating
- **Needed by:** Qwen3-Next-80B and the Qwen3.8/Flash-Next hybrids:
  `linear_key_head_dim: 128`, `linear_value_head_dim: 128`, `linear_conv_kernel_dim: 4`
  (short conv inside the GDN output gate), decoupled RoPE and tan-decayed linear attention
  internals.
- **Gap:** `gated_deltanet_attn` exists (✅ trainable, arXiv DeltaNet lineage) but has no
  schema surface for its conv kernel or head-dims (defaults used in presets).
- **Proposal:** expose `attention.gated_deltanet.{conv_kernel,key_head_dim,value_head_dim}`.

### G16 — Bidirectional LFM encoder (masked-LM variant)
- **Needed by:** `LiquidAI/LFM2.5-Encoder-350M` (`Lfm2BidirectionalForMaskedLM`,
  `use_pos_enc: true`, `tie_word_embeddings: true`, `block_auto_adjust_ff_dim: true`).
- **Gap:** once G2 lands, an encoder-mode conv+attn hybrid trains with `task: mlm`
  directly — but tied embeddings are also missing (`schema/_model/_embedding.yaml` has
  factorized + conv only).
- **Proposal:** `embedding.tie_weights: true` (also standard in many small LMs).

---

## 3. What the 14 new presets express (and approximate)

| Preset | Faithful | Approximated (gap refs) |
|--------|----------|------------------------|
| `qwen3_8_27b` | hybrid GDN/GQA 3:1, dims, vocab, ffn | head count 24→20 (G5); no short-conv-in-GDN (G15) |
| `qwen3_8_2t4_a95b` | hybrid, MoE 512/10, dims | shared expert (G3); per-head dims (G5) |
| `qwen3_8_flash_next` | hybrid, MoE, dims | head count 24→10 (G5); shared expert (G3) |
| `qwen3_next_80b` | hybrid, MoE 512/10, dims | GDN internals (G15); shared expert (G3) |
| `glm_5` | MLA latent 512, MoE 256/8, dims | DSA indexer dropped (G10); dense-first-3 (G4); shared (G3) |
| `glm_4_7` | GQA grouping, MoE 160/8, dims | head count 96→40 (G5); partial-rope 0.5 unsupported (G7) |
| `kimi_k3` | exact 93-layer KDA/MLA split (24 MLA/69 KDA), MoE 896/16 | full 93-entry pattern included; activation situ→silu (G6); heads 96→56 (G5); low-rank experts (G13) |
| `kimi_k2_7` | MLA 512, MoE 384/8, dims | q_lora 1536 (G11); shared expert (G3) |
| `minimax_m3` | **msa_attn params exactly match** `sparse_attention_config` (block 128, topk 16, index 128), MoE 128/4 | swigluoai→swiglu (G6); dense-first-3 (G4); router (G14) |
| `minimax_m2_7` | GQA 48/8, MoE 256/8, all-full-attn (`attn_type_list` all 1s) | moe_inter 1536 = per-expert; M2.7 shared expert (G3) |
| `llama4_scout` | GQA 40/8, head_dim 128, MoE 16/1 — fully faithful dims | iRoPE NoPE layers (G7); MoE every-3rd (G4); llama3 rope scaling (G8) |
| `llama4_maverick` | same, MoE 128/1 | same |
| `phi_4` | dense GQA 40/10, ffn 17920 — fully faithful | — |
| `gpt_oss_120b` | GQA 64/8, MoE 128/4, dims | sliding/full alternation → all full-attn (G1); sinks (G9); YaRN (G8); head count faithful, head_dim 45 vs 64 (G5) |

Doc-only models: LFM2.5-2.6B / 8B-A1B / Encoder-350M (G2, G16), Phi-4-mini-flash (G1 + G15).

---

## 4. References

- Qwen: https://huggingface.co/Qwen/Qwen3.8-27B, /Qwen3.8-2.4T-A95B, /Qwen3.8-Flash-Next, /Qwen3-Next-80B-A3B-Instruct
- GLM: https://huggingface.co/zai-org/GLM-5, /GLM-4.7
- Kimi: https://huggingface.co/moonshotai/Kimi-K3, /Kimi-K2.7-Code; KDA: arXiv:2510.26692; K2.5 system: arXiv:2602.02276
- MiniMax: https://huggingface.co/MiniMaxAI/MiniMax-M3, /MiniMax-M2.7; MSA: arXiv:2606.13392
- Llama 4: https://huggingface.co/unsloth/Llama-4-Scout-17B-16E-Instruct, /Llama-4-Maverick-17B-128E-Instruct (mirror of gated meta-llama configs)
- Phi: https://huggingface.co/microsoft/phi-4, /Phi-4-mini-flash-reasoning (arXiv:2507.06607)
- gpt-oss: https://huggingface.co/openai/gpt-oss-120b
- Liquid: https://huggingface.co/LiquidAI/LFM2.5-2.6B, /LFM2.5-8B-A1B, /LFM2.5-Encoder-350M
- Schema: `frankenstein-transformer/schema/_model/` (`_dims.yaml`, `_positional_encoding.yaml`, `_model_flat.yaml`, `_attention_latent.yaml`, `_attention_sparse.yaml`)
- MLA: arXiv:2506.09342 · ModernBERT (MLM side): arXiv:2412.13663