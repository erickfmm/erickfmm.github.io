var FTParamEstimator = (function () {
  'use strict';

  // Exact per-module parameter formulas derived from the PyTorch sources in
  // transformer-encoder-frankestein (src/model/**). Verified against
  // full_tests/param_count_check.py ground truth (98 example configs) via
  // full_tests/param_estimate_check.mjs.

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

  // Resolve hierarchical (new schema) then legacy flat path.
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

  // ---- next-prime helper (Engram N-gram hash embedding tables) ----
  function isPrime(n) {
    if (n < 2) return false;
    if (n < 4) return true;
    if (n % 2 === 0) return false;
    for (var d = 3; d * d <= n; d += 2) if (n % d === 0) return false;
    return true;
  }
  function nextPrime(start, seen) {
    var c = start + 1;
    while (!(isPrime(c) && !seen[c])) c++;
    return c;
  }
  function sumEngramPrimes(vocab, nGramTypes, headsPerGram) {
    // Mirrors NgramHasher: distinct primes strictly above vocab_size-1.
    var seen = {};
    var total = 0;
    var searchStart = vocab - 1;
    for (var i = 0; i < nGramTypes * headsPerGram; i++) {
      var p = nextPrime(searchStart, seen);
      seen[p] = true;
      total += p;
      searchStart = p;
    }
    return total;
  }

  function format(n) {
    if (!isFinite(n) || n < 0) return '—';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(Math.round(n));
  }

  // ---- Per-mixer parameter counts (exact, bias-free unless noted) ----
  // All use H = hidden, hd = head_dim, nH = num_heads.
  function mixerParams(t, m, H, nH, nKv) {
    var hd = H / nH;
    var kv = hd * nKv;               // KV projection width (num_kv_heads*head_dim)
    var q = H * H, o = H * H;        // default Q and O projections
    var k = H * H, v = H * H;
    var r;                            // latent rank (per-variant below)
    switch (t) {
      // ---- Dense ----
      case 'standard_attn':
      case 'sigmoid_attn':
      case 'titan_attn':
      case 'sparse_transformer_attn':
      case 'longformer_attn':
      case 'bigbird_attn':
      case 'sparge_attn':
      case 'fasa_attn':
      case 'iha_attn':
        return 4 * H * H;            // Q,K,V,O (bias=False everywhere)
      case 'gated_softmax_attn':
        return 5 * H * H;            // + gate_proj
      case 'gqa_attn':
        return H * H + 2 * (H * kv) + H * H;
      // ---- Recurrent / retentive ----
      case 'retnet':
      case 'retnet_attn':
        return 5 * H * H + 2 * H;    // Q,K,V,G,O + GroupNorm(2H)
      case 'ode':
        return 4 * H * H + 2 * H;    // packed QKV + O + norm
      case 'gla_attn': {
        var lr = toNum(pick(m, 'attention.gla.gate_low_rank', 'gla_gate_low_rank', 16), 16);
        return 5 * H * H + (H * lr) + (lr * H + H) + 2 * H; // gk_proj low-rank + norm
      }
      case 'deltanet_attn':
        return 5 * H * H + (H * nH + nH) + 2 * H; // beta_proj + norm
      case 'gated_deltanet_attn':
        return 5 * H * H + 2 * (H * nH + nH) + 2 * H; // alpha+beta + norm
      case 'gated_deltanet2_attn':
        return 5 * H * H + 2 * (H * (H + 1)) + 2 * H; // erase+write (biased) + norm
      case 'hgrn2_attn':
        return 5 * H * H + H * (H + 1) + 2 * H; // forget_proj (biased) + norm
      case 'fox_attn':
        return 4 * H * H + (H * nH + nH); // f_proj (biased)
      case 'kda_attn':
        return 5 * H * H + (H * nH + nH) + 2 * H; // beta_proj + norm
      case 'mamba':
        return H * (H + 1);          // in_proj Linear(H,H) biased
      // ---- Sparse ----
      case 'sparsek_attn':
        return 4 * H * H + (H * H + H) + (H + 1); // score_net MLP (64→64→1 fixed)
      case 'nsa_attn': {
        var bs = toNum(pick(m, 'attention.nsa.block_size', 'nsa_block_size', 128), 128);
        return 4 * H * H + 2 * (bs * hd * hd + hd) + (hd * 3 + 3); // compress + gate
      }
      case 'msa_attn': {
        var idx = toNum(pick(m, 'attention.msa.index_dim', 'msa_index_dim', 64), 64);
        return 2 * H * H + 2 * (H * kv) + H * (nKv * idx) + H * idx; // q,k,v,out + q_idx,k_idx
      }
      case 'sparda_attn': {
        var fd = toNum(pick(m, 'attention.sparda.forecast_dim', 'sparda_forecast_dim', 64), 64);
        return 2 * H * H + 2 * (H * kv) + H * (nKv * fd); // q,k,v + forecast
      }
      // ---- Latent ----
      case 'mla_attn':
      case 'gqla_attn':
        r = toNum(pick(m, 'attention.' + t.replace('_attn', '') + '.latent_rank', t.replace('_attn', '') + '_latent_rank', Math.max(1, Math.floor(H / 2))), Math.max(1, Math.floor(H / 2)));
        return 2 * H * H + 3 * (H * r); // Q,O full + dkv,uk,uv
      case 'mlra_attn': {
        r = toNum(pick(m, 'attention.mlra.latent_rank', 'mlra_latent_rank', Math.max(1, Math.floor(H / 2))), Math.max(1, Math.floor(H / 2)));
        var nlh = toNum(pick(m, 'attention.mlra.num_latent_heads', 'mlra_num_latent_heads', 4), 4);
        var sub = Math.floor(r / nlh), subOut = Math.floor(H / nlh);
        return 2 * H * H + H * r + 2 * (nlh * sub * subOut); // Q,O + dkv + per-head up
      }
      case 'mtla_attn':
        r = toNum(pick(m, 'attention.mtla.latent_rank', 'mtla_latent_rank', Math.max(1, Math.floor(H / 2))), Math.max(1, Math.floor(H / 2)));
        return 2 * H * H + 3 * (H * r) + (r * r + r); // Q,O + dkv,uk,uv + merge (biased)
      case 'tucker_attn': {
        var qR = toNum(pick(m, 'attention.tucker.query_rank', 'tucker_query_rank', H), H);
        var kR = toNum(pick(m, 'attention.tucker.key_rank', 'tucker_key_rank', Math.max(1, Math.floor(H / 2))), Math.max(1, Math.floor(H / 2)));
        var vR = toNum(pick(m, 'attention.tucker.value_rank', 'tucker_value_rank', Math.max(1, Math.floor(H / 2))), Math.max(1, Math.floor(H / 2)));
        return (H * qR + qR * H) + (H * kR + kR * H) + (H * vR + vR * H) + H * H; // factor+core per Q,K,V + O
      }
      case 'gta_attn':
        r = toNum(pick(m, 'attention.gta.value_latent_rank', 'gta_value_latent_rank', Math.max(1, Math.floor(H / 2))), Math.max(1, Math.floor(H / 2)));
        return 3 * H * H + 2 * (H * r); // Q,K,O + dv,uv
      case 'cca_attn': {
        r = toNum(pick(m, 'attention.cca.latent_rank', 'cca_latent_rank', Math.max(1, Math.floor(H / 4))), Math.max(1, Math.floor(H / 4)));
        var ncl = toNum(pick(m, 'attention.cca.num_conv_layers', 'cca_num_conv_layers', 2), 2);
        var ks = toNum(pick(m, 'attention.cca.conv_kernel_seq', 'cca_conv_kernel_seq', 4), 4);
        var kc = toNum(pick(m, 'attention.cca.conv_kernel_ch', 'cca_conv_kernel_ch', 3), 3);
        var vs = toBool(pick(m, 'attention.cca.value_shift', 'cca_value_shift', true), true);
        var packed = 2 * r;
        var p = H * packed + (vs ? 2 * (H * Math.floor(r / 2)) : H * r) + r * H;
        if (ncl >= 1) p += packed * ks;              // depthwise conv (groups=packed)
        if (ncl >= 2) p += Math.floor(packed / (2 * nH)) * packed * kc; // grouped conv
        return p + 1;                                 // temp scalar
      }
      case 'ccgqa_attn': {
        var qLat = toNum(pick(m, 'attention.ccgqa.query_latent_rank', 'ccgqa_query_latent_rank', Math.max(1, Math.floor(H / 2))), Math.max(1, Math.floor(H / 2)));
        var kvLat = toNum(pick(m, 'attention.ccgqa.kv_latent_rank', 'ccgqa_kv_latent_rank', Math.max(1, Math.floor(H / 8))), Math.max(1, Math.floor(H / 8)));
        var nkv2 = toNum(pick(m, 'attention.ccgqa.num_kv_heads', 'ccgqa_num_kv_heads', Math.max(1, Math.floor(nH / 4))), Math.max(1, Math.floor(nH / 4)));
        var ncl2 = toNum(pick(m, 'attention.ccgqa.num_conv_layers', 'ccgqa_num_conv_layers', 2), 2);
        var ks2 = toNum(pick(m, 'attention.ccgqa.conv_kernel_seq', 'ccgqa_conv_kernel_seq', 4), 4);
        var kc2 = toNum(pick(m, 'attention.ccgqa.conv_kernel_ch', 'ccgqa_conv_kernel_ch', 3), 3);
        var vs2 = toBool(pick(m, 'attention.ccgqa.value_shift', 'ccgqa_value_shift', true), true);
        var packed2 = qLat + kvLat;
        var p2 = H * packed2 + (vs2 ? 2 * (H * Math.floor(kvLat / 2)) : H * kvLat) + qLat * H;
        if (ncl2 >= 1) p2 += packed2 * ks2;
        if (ncl2 >= 2) p2 += Math.floor(packed2 / (nH + nkv2)) * packed2 * kc2;
        return p2 + 1;
      }
      // ---- Probabilistic / field ----
      case 'gma_attn': {
        var K = toNum(pick(m, 'attention.gma.num_components', 'gma_num_components', 8), 8);
        var dr = toNum(pick(m, 'attention.gma.routing_dim', 'gma_routing_dim', hd), hd);
        return 4 * H * H + nH * (2 * K * dr + K); // Q,K,V,O + mu,omega,alpha
      }
      case 'ssog_attn': {
        var R = toNum(pick(m, 'attention.ssog.num_atoms', 'ssog_num_atoms', 4), 4);
        var lookat = toBool(pick(m, 'attention.ssog.lookat', 'ssog_lookat', true), true);
        var p3 = 2 * H * H + nH * 5 * R + 4; // V,O + atoms + temp + 3 gate scalars
        if (lookat) {
          p3 += 2 * ((2 * nH * R) * H + 2 * nH * R); // mu_delta, sigma_delta
          p3 += (nH * R) * H + nH * R;               // lambda_gate
        }
        return p3;
      }
      // ---- Memory ----
      case 'engram_attn': {
        var maxN = toNum(pick(m, 'attention.engram.max_ngram_size', 'engram_max_ngram_size', 3), 3);
        var hpg = toNum(pick(m, 'attention.engram.n_heads_per_ngram', 'engram_n_heads_per_ngram', 4), 4);
        var edh = toNum(pick(m, 'attention.engram.embed_dim_per_head', 'engram_embed_dim_per_head', 32), 32);
        var kern = toNum(pick(m, 'attention.engram.kernel_size', 'engram_kernel_size', 4), 4);
        var V = toNum(pick(m, 'dims.vocab_size', 'vocab_size', 50000), 50000);
        var types = maxN - 1;
        var C = types * hpg * edh;
        var embP = sumEngramPrimes(V, types, hpg) * edh;
        return embP + (C * kern) + (2 * C) + 2 * (C * H) + H * H + 4 * H; // emb + conv + GN + V/K proj + O + 2 LN
      }
      default:
        return 4 * H * H;            // conservative dense default
    }
  }

  function normParams(normType, H) {
    switch (normType) {
      case 'layer_norm': return 2 * H;
      case 'dynamic_tanh': return 2 * H;
      case 'derf': return 2 * H + 2;   // α, β scalars + γ, s? → 2H+2
      case 'rms_norm': return H;
      case 'prms_norm': return H;
      case 'flash_norm': return 0;
      default: return 2 * H;
    }
  }

  function peParams(m, H, nH) {
    var pe = String(pick(m, 'positional_encoding', 'positional_encoding', 'hope') || 'hope').toLowerCase();
    var pep = getDeep(m, 'positional_encoding_parameters') || {};
    switch (pe) {
      case 'rope':
      case 'hope':
      case 'nope':
      case 'alibi':
      case 'sinusoidal_absolute':
      case 'sinusoidal_rotary':
        break;
      case 'bam':
        return 2 * nH + (toBool(pick(m, 'positional_encoding_parameters.bam.learn_mu', 'bam_learn_mu', false), false) ? nH : 0);
      case 'pape':
      case 'pape_efficient': {
        var nPar = toNum(getDeep(pep, 'pape.num_parabolas') !== undefined ? getDeep(pep, 'pape.num_parabolas') : pick(m, 'pape_num_parabolas', 'pape_num_parabolas', 4), 4);
        var nPos = toNum(getDeep(pep, 'pape.num_positions') !== undefined ? getDeep(pep, 'pape.num_positions') : pick(m, 'pape_num_positions', 'pape_num_positions', 1), 1);
        return (nH * nPar * nPos) + H * (2 * nH * nPar);
      }
      case 'pape_ri':
        return H * nH;                // a = Linear(H → nH)
      case 'learned_absolute':
        return toNum(pick(m, 'positional_encoding_parameters.learned.max_len', 'learned_max_len', 512), 512) * H;
      default:
        break;
    }
    return 0;
  }

  function ffnBodyParams(H, fH, fA) {
    var isGlu = /swiglu|geglu|reglu/i.test(String(fA || ''));
    return isGlu ? 3 * H * fH
                 : 2 * H * fH + fH + H; // up(+bias) + down(+bias)
  }

  function mhcBlockParams(H, n) {
    var inDim = n * H, outDim = n * n + 2 * n;
    return inDim * outDim + outDim + 3; // proj + bias + α_pre,α_post,α_res
  }

  function estimate(config) {
    if (!config || config.base_model) {
      return { total: -1, breakdown: {}, note: 'Base model — parameter count unknown.' };
    }
    var m = config.model || {};
    var isVit = config.model_class === 'frankenstein_vit';
    var isDecoder = config.model_class === 'frankensteindecoder';

    // dims — defaults mirror FrankensteinModelConfig dataclass defaults.
    var V = toNum(pick(m, 'dims.vocab_size', 'vocab_size', 50000), 50000);
    var H = toNum(pick(m, 'dims.hidden_size', 'hidden_size', 2048), 2048);
    var nL = toNum(pick(m, 'dims.num_layers', 'num_layers', 12), 12);
    var nH = toNum(pick(m, 'dims.num_heads', 'num_heads', 16), 16);
    var nKv = toNum(pick(m, 'dims.num_kv_heads', 'num_kv_heads', 1), 1);
    var loops = toNum(pick(m, 'dims.num_loops', 'num_loops', 2), 2);
    var pat = pick(m, 'dims.layer_pattern', 'layer_pattern', ['standard_attn']);
    if (typeof pat === 'string') pat = [pat];

    var normType = pick(m, 'norm.type', 'norm_type', 'dynamic_tanh');
    var fH = toNum(m.ffn_hidden_size, H * 2);
    var fA = m.ffn_activation || 'silu';
    var moe = toBool(m.use_moe, true);
    var nE = toNum(m.num_experts, 8);
    var mod = toBool(m.use_mixture_of_depths, false);
    var mhcEnabled = toBool(pick(m, 'mhc.enabled', 'use_mhc', false), false);
    var mhcN = toNum(pick(m, 'mhc.expansion_rate', 'mhc_expansion_rate', 4), 4);
    var resType = String(pick(m, 'residuals.type', 'residual_type', 'standard') || 'standard').toLowerCase();
    var nBlocks = toNum(pick(m, 'residuals.block_attn.num_blocks', 'block_attn_num_blocks', 8), 8);

    var fact = toBool(pick(m, 'embedding.factorized.enabled', 'use_factorized_embedding', false), false);
    var fD = toNum(pick(m, 'embedding.factorized.dim', 'factorized_embedding_dim', 128), 128);
    var conv = toBool(pick(m, 'embedding.conv.enabled', 'use_embedding_conv', true), true);
    var cK = toNum(pick(m, 'embedding.conv.kernel', 'embedding_conv_kernel', 3), 3);

    var expanded = [];
    for (var i = 0; i < nL; i++) expanded.push(pat[i % pat.length] || 'standard_attn');

    // ---- Embedding / patch embedding ----
    var emb = 0;
    var img = config.image || {};
    var patch = toNum(img.patch_size, 16);
    var inCh = toNum(img.in_channels, 3);
    var imgH = toNum(getDeep(img, 'image_size.height') !== undefined ? getDeep(img, 'image_size.height') : img.image_height, 224);
    var imgW = toNum(getDeep(img, 'image_size.width') !== undefined ? getDeep(img, 'image_size.width') : img.image_width, 224);
    if (isVit) {
      emb = patch * patch * inCh * H + H; // Conv2d patch embedding (+bias)
    } else if (fact) {
      emb = V * fD;
      if (conv) emb += cK * fD * fD + fD; // depthwise Conv1d
      emb += fD * H;                      // projection (bias=False)
    } else {
      emb = V * H;
    }

    // ---- Per-layer sums ----
    var normPer = normParams(normType, H);
    var ffnPer = ffnBodyParams(H, fH, fA);
    var pAttn = 0, pFfn = 0, pNorm = 0, pMhc = 0, pRouter = 0;
    for (var li = 0; li < nL; li++) {
      pAttn += mixerParams(expanded[li], m, H, nH, nKv);
      pFfn += moe ? nE * ffnPer : ffnPer;
      pNorm += normPer * 2;              // norm1 + norm2 (flash: 0 each)
      if (mhcEnabled) pMhc += 2 * mhcBlockParams(H, mhcN); // attn + ffn blocks
      if (moe) pRouter += H * nE;        // router (bias=False)
      if (mod) pRouter += H;             // depth_router (bias=False)
    }
    pNorm += normPer;                    // final_norm
    if (mhcEnabled) pMhc += (mhcN * H) * H + mhcN * H + H * (mhcN * H) + H; // encoder in/out projections

    // ---- Positional encoding ----
    var pPos = peParams(m, H, nH);
    if (isVit) {
      var peT = String(img.pos_embedding_type || 'learned_1d').toLowerCase();
      if (peT === 'learned_1d' || peT === 'learned_absolute') pPos = 512 * H;
      else if (peT === 'sinusoidal_absolute') pPos = 0;
      else pPos = 0;
      if (toBool(img.cls_token, true) && String(img.pooling_mode || 'cls') === 'cls') pPos += H; // cls token
      pPos += H; // mask token (always allocated)
    }
    var ssmax = toBool(pick(m, 'use_ssmax', 'use_ssmax', false), false);
    if (ssmax) pPos += nH;               // per-head Scalable Softmax scale

    // ---- Residual module (AttnRes) ----
    var pRes = 0;
    var logical = nL * loops;
    if (resType === 'full_attn') pRes = logical * H;
    else if (resType === 'block_attn') pRes = nBlocks * H;

    // ---- Heads ----
    var head = 0;
    if (isVit) {
      var nCls = toNum(img.num_classes, 1000);
      var nSeg = toNum(img.num_seg_classes, 21);
      var predTarget = String(img.prediction_target || 'mean_color_3bit');
      var predDim = predTarget === 'mean_color_3bit' ? 512
                  : predTarget === 'downsampled_3bit' ? 16 * 512
                  : patch * patch * inCh;
      head = (H * nCls + nCls) + (H * predDim + predDim) + (H * nSeg + nSeg);
      var scale = patch;                 // ViTDet upsampler (4× stages for P=16)
      while (scale > 1) {
        head += (H * H * 2 * 2 + H) + (H * 3 * 3 + H); // ConvTranspose + depthwise Conv
        scale = Math.floor(scale / 2);
      }
    } else {
      head = H * V + V;                  // LM/MLM head (bias=True, untied)
      var clsH = toBool(m.classification_head, false);
      if (clsH) head += H * toNum(m.num_labels, 10) + toNum(m.num_labels, 10);
    }
    // decoder == encoder backbone; loops reuse weights (params counted once)

    var total = emb + pPos + pAttn + pFfn + pNorm + head + pMhc + pRouter + pRes;

    var notes = [];
    if (moe) notes.push('MoE: ' + nE + ' experts');
    if (loops > 1) notes.push(loops + ' loops (weights reused)');
    if (mhcEnabled) notes.push('mHC n=' + mhcN);
    if (resType !== 'standard') notes.push('residual: ' + resType);

    return {
      total: total,
      breakdown: {
        embeddings: emb,
        pos: pPos,
        attention: pAttn,
        ffn: pFfn,
        norm: pNorm,
        head: head,
        mhc: pMhc,
        router: pRouter,
        residual: pRes
      },
      note: notes.join('; ')
    };
  }

  return { estimate: estimate, format: format };
})();
