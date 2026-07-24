var FTParamEstimator = (function () {
  'use strict';

  // Read a dotted path from a plain object; returns undefined if missing.
  function getDeep(obj, dotted) {
    if (!obj || !dotted) return undefined;
    var cur = obj;
    var parts = dotted.split('.');
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  // Resolve a value trying the hierarchical path first, then the legacy flat path.
  function pick(m, newPath, legacyPath, dflt) {
    var v = getDeep(m, newPath);
    if (v === undefined) v = getDeep(m, legacyPath);
    return v === undefined ? dflt : v;
  }

  function toNum(v, dflt) {
    if (v === undefined || v === null || v === '') return dflt;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(n) ? dflt : n;
  }

  function toBool(v, dflt) {
    if (v === undefined || v === null) return dflt;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v === 'true' || v === 'True' || v === '1';
    return dflt;
  }

  // Attention families -> category, used to pick the right per-layer formula.
  var FAMILY = {
    // Dense
    standard_attn: 'dense', sigmoid_attn: 'dense', gated_softmax_attn: 'dense', gqa_attn: 'dense',
    // Recurrent / retentive
    retnet: 'recur', retnet_attn: 'recur', mamba: 'recur', ode: 'recur',
    deltanet_attn: 'recur', gated_deltanet_attn: 'recur', gated_deltanet2_attn: 'recur',
    hgrn2_attn: 'recur', fox_attn: 'recur', gla_attn: 'recur', kda_attn: 'recur',
    // Sparse
    sparse_transformer_attn: 'sparse', longformer_attn: 'sparse', bigbird_attn: 'sparse',
    sparsek_attn: 'sparse', nsa_attn: 'sparse', msa_attn: 'sparse', sparda_attn: 'sparse',
    sparge_attn: 'sparse', fasa_attn: 'sparse',
    // Latent
    mla_attn: 'latent', gqla_attn: 'latent', mlra_attn: 'latent', tucker_attn: 'latent',
    iha_attn: 'latent', gta_attn: 'latent', mtla_attn: 'latent',
    cca_attn: 'latent', ccgqa_attn: 'latent',
    // Memory
    titan_attn: 'memory', engram_attn: 'memory'
  };

  function familyOf(t) { return FAMILY[t] || 'dense'; }

  function format(n) {
    if (!isFinite(n) || n < 0) return '—';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(Math.round(n));
  }

  // ---- Per-component parameter estimates ----

  function embParams(m, V, H, fD, fact, conv, cK, dec) {
    var p = 0;
    if (fact) {
      p += V * fD + fD * H;
    } else {
      p += V * H;
    }
    if (!dec) p += 512 * H; // learned positional (max_position ~512)
    if (conv) p += cK * H + H;
    return p;
  }

  function normParamsPerLayer(normType, H) {
    switch (normType) {
      case 'layer_norm': return 2 * H;
      case 'rms_norm': return H;
      case 'prms_norm': return H;
      case 'flash_norm': return 0;
      case 'dynamic_tanh': return 2 * H;
      case 'derf': return 2 * H;
      default: return 2 * H;
    }
  }

  // Attention projection params for one layer, by family.
  function attnParams(family, t, H, nH, m) {
    var head = H / nH;
    var qkv, out;
    var extra = 0;
    switch (family) {
      case 'dense':
        // QKV = 3*(H*H) + 3H, output = H*H + H. GQA shares K,V across groups -> fewer KV params.
        if (t === 'gqa_attn') {
          // Heuristic: assume n_kv = nH/2 (schema default group size 2).
          var nKv = Math.max(1, Math.floor(nH / 2));
          var Hkv = head * nKv;
          qkv = H * H + 2 * (H * Hkv) + 3 * H;
        } else {
          qkv = 3 * (H * H) + 3 * H;
        }
        out = H * H + H;
        if (t === 'gated_softmax_attn') extra += H; // post-SDPA gate bias
        return qkv + out + extra;
      case 'latent': {
        // Down/up projections for K,V into latent of rank r ~ H/2 (Pareto-optimal per paper).
        var r = getDeep(m, 'attention.mla.latent_rank') || getDeep(m, 'attention.tucker.k_rank') || Math.floor(H / 2);
        qkv = H * H + 3 * H; // Q full + K,V up-proj share latent
        extra = 2 * (H * r + r * H); // W_down (H->r) and W_up (r->H) for K and V
        out = H * H + H;
        // MLRA partitions into L sub-heads: same total params, counted once.
        if (t === 'cca_attn' || t === 'ccgqa_attn') extra += 2 * (3 * r); // 1D conv kernel ~3 per latent channel
        return qkv + out + extra;
      }
      case 'recur': {
        // State matrices + gates. RetNet/Mamba/ODE have recurrent state of dim ~H.
        qkv = H * H + 2 * (H * H) + 3 * H; // Q,K,V
        extra = 2 * (H * H) + 4 * H; // state update + gates (alpha,beta,decay) heuristic
        out = H * H + H;
        if (t === 'ode') extra = H * H + H; // ODE: f(theta) ~ one extra linear, counted once (weight reuse over steps)
        return qkv + out + extra;
      }
      case 'sparse': {
        // Same QKV/O as dense + small selector (top-k gate ~ H*k).
        qkv = 3 * (H * H) + 3 * H;
        out = H * H + H;
        if (t === 'sparsek_attn' || t === 'nsa_attn') extra += H * 8; // top-k gate heuristic
        return qkv + out + extra;
      }
      case 'memory': {
        // Dense QKV/O + memory bank + read/write projections.
        qkv = 3 * (H * H) + 3 * H;
        out = H * H + H;
        // titan: persistent memory of ~256 slots * H, engram: similar.
        extra = 256 * H + 2 * (H * H);
        return qkv + out + extra;
      }
      default:
        return 4 * (H * H) + 4 * H;
    }
  }

  function ffnParams(m, H, fH, fA, moe, nE) {
    // FFN: H -> fH -> H. GLU has 3 matrices (gate,up,down), others 2.
    var isGlu = /glu|geglu|swiglu/i.test(String(fA || ''));
    var body = isGlu ? 3 * (H * fH) + 3 * fH + fH * H + H
                     : 2 * (H * fH) + 2 * fH + fH * H + H;
    if (moe) return nE * body;
    return body;
  }

  function headParams(H, V, dec) {
    // Untied LM/MLM head (weight tying not detected in schema -> count it).
    return H * V + V;
  }

  function estimate(config) {
    if (!config || config.base_model) {
      return { total: -1, breakdown: {}, note: 'Base model — parameter count unknown.' };
    }
    var m = config.model || {};
    var V = toNum(pick(m, 'dims.vocab_size', 'vocab_size', 50000), 50000);
    var H = toNum(pick(m, 'dims.hidden_size', 'hidden_size', 768), 768);
    var nL = toNum(pick(m, 'dims.num_layers', 'num_layers', 12), 12);
    var loops = toNum(pick(m, 'dims.num_loops', 'num_loops', 1), 1);
    var nH = toNum(pick(m, 'dims.num_heads', 'num_heads', 12), 12);
    var pat = pick(m, 'dims.layer_pattern', 'layer_pattern', ['standard_attn']);
    if (typeof pat === 'string') pat = [pat];
    var fact = toBool(pick(m, 'embedding.factorized.enabled', 'use_factorized_embedding', false), false);
    var fD = toNum(pick(m, 'embedding.factorized.dim', 'factorized_embedding_dim', 128), 128);
    var conv = toBool(pick(m, 'embedding.conv.enabled', 'use_embedding_conv', false), false);
    var cK = toNum(pick(m, 'embedding.conv.kernel', 'embedding_conv_kernel', 3), 3);
    var dec = pick(m, 'dims.mode', 'mode', '') === 'decoder' || config.model_class === 'frankesteindecoder';

    var normType = pick(m, 'norm.type', 'norm_type', 'layer_norm');
    var moe = toBool(m.use_moe, false);
    var nE = toNum(m.num_experts, 4);
    var tK = toNum(m.top_k_experts, 2);
    var fH = toNum(m.ffn_hidden_size, 3072);
    var fA = m.ffn_activation || 'gelu';
    var bit = toBool(m.use_bitnet, false);
    var mod = toBool(m.use_mixture_of_depths, false);

    // Expand pattern to num_layers (each layer sees its mixer type).
    var expanded = [];
    for (var i = 0; i < nL; i++) expanded.push(pat[i % pat.length] || 'standard_attn');

    var emb = embParams(m, V, H, fD, fact, conv, cK, dec);
    var normPer = normParamsPerLayer(normType, H);
    var pAttn = 0, pFfn = 0, pNorm = 0;
    for (var li = 0; li < nL; li++) {
      var fam = familyOf(expanded[li]);
      pAttn += attnParams(fam, expanded[li], H, nH, m);
      pFfn += ffnParams(m, H, fH, fA, moe, nE);
      pNorm += normPer * 2; // pre + post
    }
    // Logical depth multiplies compute, not params (weights reused). Params counted once.
    var head = headParams(H, V, dec);
    var modRouter = mod ? H * nL : 0; // MoD router per layer

    var total = emb + pAttn + pFfn + pNorm + head + modRouter;

    var notes = [];
    if (bit) notes.push('BitNet ternary (1.58 bit)');
    if (moe) notes.push('MoE: ' + nE + ' experts, top-' + tK + ' active');
    if (loops > 1) notes.push(loops + ' loops (params reused)');
    if (fH === 0 || !fH) notes.push('FFN size missing — used default');

    return {
      total: total,
      breakdown: {
        embeddings: emb,
        attention: pAttn,
        ffn: pFfn,
        norm: pNorm,
        head: head,
        other: modRouter
      },
      note: notes.length ? notes.join('; ') : ''
    };
  }

  return { estimate: estimate, format: format };
})();