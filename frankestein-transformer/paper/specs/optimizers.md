# Optimizer Families Specification

> Cross-references: [Schema Reference](schema-reference.md) · [Training Safety](training-safety.md) · [Architecture](architecture.md)

## Optimizer Routing Framework

The system supports **23 optimizer families** across seven algorithmic categories. The optimizer is selected via `training.optimizer.optimizer_class` and configured through prefixed parameter groups.

### Optimizer Selection Decision Tree

```
Choose optimizer objective
├── Reliable baseline → AdamW / RAdam
├── Lower optimizer memory → Adafactor / GaLore / Lion / APOLLO
└── Aggressive or structured → Adan, ADOPT, Sophia, Shampoo, SOAP, Muon
                                    ↓
                          Schema-prefixed groups
                          (LR, weight decay, betas, eps)
```

## Prefixed Key Contract

All optimizer parameters use the prefix format: **`<optimizer_class>-<group>_<param>`**

### Shared Per-Group Suffix Families

| Group | LR Suffix | WD Suffix | Betas Suffix | Eps Suffix |
|---|---|---|---|---|
| Embeddings | `lr_embeddings` | `wd_embeddings` | `betas_embeddings` | `eps_embeddings` |
| Normalizations | `lr_norms` | `wd_norms` | `betas_norms` | `eps_norms` |
| ODE blocks | `lr_ode` | `wd_ode` | `betas_ode` | `eps_ode` |
| RetNet blocks | `lr_retnet` | `wd_retnet` | `betas_retnet` | `eps_retnet` |
| Mamba blocks | `lr_mamba` | `wd_mamba` | `betas_mamba` | `eps_mamba` |
| Attention blocks | `lr_attention` | `wd_attention` | `betas_attention` | `eps_attention` |
| Other parameters | `lr_other` | `wd_other` | `betas_other` | `eps_other` |

### Optimizer-Specific Global Suffixes

| Optimizer Class | Extra Parameters |
|---|---|
| `sgd_momentum` | `momentum`, `nesterov` |
| `adafactor` | `beta2_decay`, `clip_threshold`, `eps1`, `eps2` |
| `galore_adamw` | `rank`, `update_proj_gap` |
| `prodigy` | `d_coef` |
| `sophia` | `rho`, `update_k` |
| `muon` / `turbo_muon` | `momentum`, `nesterov`, `ns_steps`, `ns_eps` |
| `cautious_adamw` | `cautious_clip` |
| `apollo` | `rank`, `update_proj_gap`, `scale`, `scale_type`, `proj_type`, `scale_front`, `disable_nl` |
| `apollo_mini` | `update_proj_gap`, `scale`, `proj_type`, `scale_front`, `disable_nl` |
| `q_apollo` | `rank`, `update_proj_gap`, `scale`, `scale_type`, `proj_type`, `scale_front`, `disable_nl`, `quant_bits` |

All other classes accept only prefixed shared groups.

## Complete Optimizer Inventory

| # | Optimizer | Family | State Buffers | Per-Step Cost | Key Hyperparameters | arXiv Reference |
|---|---|---|---|---|---|---|
| 1 | `sgd_momentum` | Classical first-order | 1 (m) | O(n) | lr, momentum, wd | Polyak (1964) |
| 2 | `adamw` | Adaptive first/second moment | 2 (m, v) | O(n) | lr, β₁, β₂, eps, wd | 1711.05101 |
| 3 | `radam` | Adaptive variance-corrected | 2 (m, v) | O(n) | lr, β₁, β₂, eps, wd | 1908.03265 |
| 4 | `adan` | Momentum + variance reduction | 3 (m, v, s) | O(n) | lr, β₁, β₂, β₃, eps, wd | 2208.06677 |
| 5 | `adopt` | Adam variant (reordered) | 2 (m, v) | O(n) | lr, β₁, β₂, eps, wd | 2411.02853 |
| 6 | `ademamix` | Multi-EMA adaptive | 3 (m₁, m₂, v) | O(n) | lr, β₁, β₂, β₃, eps, wd | 2409.03137 |
| 7 | `mars_adamw` | Variance-reduced preconditioned | 3 (m, v, z) | O(n) | lr, β₁, β₂, eps, wd, γ | 2411.10438 |
| 8 | `cautious_adamw` | Masked momentum | 2 (m, v) | O(n) | lr, β₁, β₂, eps, wd | 2411.16085 |
| 9 | `lamb` | Layer-wise adaptive moments | 2 (m, v) | O(n) | lr, β₁, β₂, eps, wd | 1904.00962 |
| 10 | `schedulefree_adamw` | Scheduler-free adaptive | 3 (z, x, n) | O(n) | lr, β₁, β₂, wd | 2405.15682 |
| 11 | `adafactor` | Memory-efficient adaptive | 1–2 (row/col) | O(n) | lr, β₁, β₂, eps, wd | 1804.04235 |
| 12 | `galore_adamw` | Low-rank gradient projection | 2 (m, v) + SVD/proj | O(nr) | lr, rank r, β₁, β₂, eps, wd | 2403.03507 |
| 13 | `apollo` | Low-rank adaptive projection | 2 low-rank + proj | O(nr) | lr, rank r, update gap, scale, betas, eps, wd | 2412.05270 |
| 14 | `apollo_mini` | Rank-1 adaptive projection | 2 rank-1 + proj | O(n) | lr, update gap, scale, betas, eps, wd | 2412.05270 |
| 15 | `q_apollo` | Quantized low-rank projection | 2 quantized low-rank + proj | O(nr) | lr, rank r, update gap, scale, quant bits, betas, eps, wd | 2412.05270 |
| 16 | `anon` | Adaptivity-tunable Adam-like | 3 (m, v, fixed_lr) | O(n) | lr, β₁, β₂, eps, wd, γ | 2605.02317 |
| 17 | `prodigy` | Parameter-free adaptation | 3 (m, v, d) | O(n) | β₁, β₂, eps, wd, d₀ | 2306.06101 |
| 18 | `lion` | Sign momentum | 1 (m) | O(n) | lr, β₁, β₂, wd | 2302.06675 |
| 19 | `sophia` | Approx. second-order | 3 (m, v, h) | O(n) | lr, β₁, β₂, eps, wd, k | 2305.14342 |
| 20 | `shampoo` | Matrix preconditioner | 2d (L_i, R_i) | O(n^(1+2/d)) | lr, eps, wd, matrix eps | 1802.09568 |
| 21 | `soap` | Shampoo + Adam basis | 2d + 2 (m, v) | O(n^(1+1/d)) | lr, β₁, β₂, eps, wd, shampoo eps | 2409.11321 |
| 22 | `muon` | Orthogonality-based | 2 (m, v) | O(n·k) | lr, momentum, wd, NS steps k | 2505.23737 |
| 23 | `turbo_muon` | Accelerated orthogonalization | 2 (m, v) | O(n·k) | lr, momentum, wd, NS steps k | 2512.04632 |

## Optimizer Family Groupings

| Group | Methods | Primary Goal |
|---|---|---|
| Classical baseline | SGD, AdamW, RAdam | Stability and reference baselines |
| Momentum redesign | Adan, AdEMAMix, MARS, Cautious AdamW | Faster or safer first-order adaptation |
| Large-batch / schedule simplification | LAMB, Schedule-Free AdamW | Operational robustness at scale |
| Memory-efficient | Adafactor, GaLore, APOLLO, APOLLO-Mini, Q-APOLLO, Lion | Optimizer-state reduction |
| Curvature-aware | Shampoo, SOAP, Sophia | Better conditioning via second-order info |
| Geometry-oriented | Muon, Turbo-Muon | Orthogonalized update structure |
| Adaptivity-tunable | Anon | Continuously tunable adaptivity γ ∈ ℝ |

## Key Optimizer Equations

### AdamW (Baseline)
```
m_t = β₁ m_{t−1} + (1−β₁) g_t
v_t = β₂ v_{t−1} + (1−β₂) g_t²
θ_{t+1} = θ_t − η (m̂_t / (√v̂_t + ε) + λ θ_t)   [decoupled weight decay]
```

### APOLLO Family
```
R_t = P_t G_t                              [Gaussian random projection]
M_t^R = β₁ M_{t−1}^R + (1−β₁) R_t         [projected first moment]
V_t^R = β₂ V_{t−1}^R + (1−β₂) R_t²        [projected second moment]
S_t = structured scaling from R̃_t          [channel-wise or tensor-wise]
W_t = (1−ηλ)W_{t−1} − η·α·(G_t ⊙ S_t)    [scaled update]
```

### Anon (Adaptivity-Tunable with IDU)
```
m_t = β₁ m_{t−1} + (1−β₁) g_t
v_t = β₂ v_{t−1} + (1−β₂) g_t²
fixed_lr updated at t = 2^k via recursive aggregation
θ_{t+1} = θ_t − η/(1−β₁^t) · m_t ⊙ fixed_lr
```
γ > 1: accelerates saddle escape; γ = 1: Adam-like; γ = 0: SGD-like; γ < 0: flatter minima bias.
