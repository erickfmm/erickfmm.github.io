var FTDiagram = (function () {
    'use strict';

    var CATS = {
        standard_attn: { c: 'attn', l: 'Standard Attention' },
        sigmoid_attn: { c: 'attn', l: 'Sigmoid Attention' },
        gated_softmax_attn: { c: 'attn', l: 'Gated Softmax Attn' },
        titan_attn: { c: 'attn', l: 'Titan Attention' },
        retnet: { c: 'recur', l: 'RetNet' },
        retnet_attn: { c: 'recur', l: 'RetNet Attn' },
        mamba: { c: 'ssm', l: 'Mamba SSM' },
        ode: { c: 'ode', l: 'ODE Block' },
        gla_attn: { c: 'attn', l: 'GLA Attention' },
        deltanet_attn: { c: 'recur', l: 'DeltaNet Attn' },
        gated_deltanet_attn: { c: 'recur', l: 'Gated DeltaNet' },
        gated_deltanet2_attn: { c: 'recur', l: 'Gated DeltaNet-2' },
        hgrn2_attn: { c: 'recur', l: 'HGRN2' },
        fox_attn: { c: 'attn', l: 'FoX Attention' },
        nsa_attn: { c: 'sparse', l: 'Native Sparse Attn' },
        engram_attn: { c: 'attn', l: 'Engram Attn' },
        longformer_attn: { c: 'sparse', l: 'Longformer Attn' },
        bigbird_attn: { c: 'sparse', l: 'BigBird Attn' },
        sparse_transformer_attn: { c: 'sparse', l: 'Sparse Transformer' },
        sparsek_attn: { c: 'sparse', l: 'SparseK Attn' },
        sparge_attn: { c: 'eval', l: 'SpargeAttn' },
        fasa_attn: { c: 'eval', l: 'FASA' },
        // Newer mixers added in the restructured schema (schema/_model/_dims.yaml).
        gqa_attn: { c: 'attn', l: 'Grouped-Query Attn' },
        mla_attn: { c: 'attn', l: 'Multi-Head Latent Attn' },
        gqla_attn: { c: 'attn', l: 'Group-Query Latent Attn' },
        mlra_attn: { c: 'attn', l: 'Multi-Head Low-Rank Attn' },
        tucker_attn: { c: 'attn', l: 'Tucker Attn' },
        iha_attn: { c: 'attn', l: 'Interleaved Head Attn' },
        gta_attn: { c: 'attn', l: 'Grouped-head laTenT Attn' },
        mtla_attn: { c: 'attn', l: 'Temporal Latent Attn' },
        cca_attn: { c: 'attn', l: 'Compressed Conv Attn' },
        ccgqa_attn: { c: 'attn', l: 'Compressed Conv GQA' },
        msa_attn: { c: 'sparse', l: 'MiniMax Sparse Attn' },
        sparda_attn: { c: 'sparse', l: 'SparDA Attn' },
        kda_attn: { c: 'recur', l: 'Kimi Delta Attn' }
    };

    var STYLES = {
        attn: 'fill:#4a9eff,stroke:#2a6ecf,color:#fff',
        recur: 'fill:#3fb950,stroke:#2a8c3c,color:#fff',
        ssm: 'fill:#a371f7,stroke:#8957e5,color:#fff',
        ode: 'fill:#db61a2,stroke:#bf4b8a,color:#fff',
        sparse: 'fill:#d2991d,stroke:#b07c16,color:#fff',
        eval: 'fill:#f85149,stroke:#da3633,color:#fff',
        emb: 'fill:#39d2c0,stroke:#2ab5a5,color:#fff',
        norm: 'fill:#768390,stroke:#57606a,color:#fff',
        ffn: 'fill:#6e7681,stroke:#484f58,color:#fff',
        moe: 'fill:#f0883e,stroke:#d18616,color:#fff',
        output: 'fill:#bc8cff,stroke:#a371f7,color:#fff',
        train: 'fill:#1f6feb,stroke:#1a5cc8,color:#fff',
        input: 'fill:#39d2c0,stroke:#2ab5a5,color:#fff',
        info: 'fill:#161b22,stroke:#30363d,color:#c9d1d9'
    };

    var _id = 0;
    function nid() { return 'nd' + (_id++); }
    function esc(s) { return String(s).replace(/"/g, '#quot;'); }
    function fmt(n) {
        if (typeof n !== 'number') return String(n);
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
        return String(n);
    }
    function expand(pat, n) {
        if (!pat || !n) return [];
        var o = [];
        for (var i = 0; i < n; i++) o.push(pat[i % pat.length]);
        return o;
    }
    function catOf(t) { return (CATS[t] || {}).c || 'attn'; }
    function lblOf(t) { return (CATS[t] || {}).l || t; }
    function vis(all, mx) {
        mx = mx || 8;
        if (all.length <= mx) return all.map(function (t, i) { return { i: i, t: t, d: false }; });
        var r = [], h = Math.ceil(mx / 2), tl = Math.floor(mx / 2);
        for (var i = 0; i < h; i++) r.push({ i: i, t: all[i], d: false });
        r.push({ i: -1, t: null, d: true });
        for (var j = all.length - tl; j < all.length; j++) r.push({ i: j, t: all[j], d: false });
        return r;
    }

    // Read a dotted path from a plain object; returns undefined if any link
    // is missing. Used to pull values from the hierarchical model schema
    // (m.dims.hidden_size, m.norm.type, m.embedding.factorized.enabled, ...).
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

    // Resolve a model value trying the new hierarchical path first, then the
    // legacy flat path, finally falling back to a default. Keeps the diagram
    // working for both the restructured schema (m.dims.*, m.norm.*, ...) and
    // older YAMLs on disk that still use the flat shape (m.vocab_size, ...).
    function pick(m, newPath, legacyPath, dflt) {
        var v = getDeep(m, newPath);
        if (v === undefined) v = getDeep(m, legacyPath);
        return v === undefined ? dflt : v;
    }

    function generate(config) {
        _id = 0;
        var L = ['graph TD'];
        for (var k in STYLES) L.push('    classDef ' + k + ' ' + STYLES[k]);
        L.push('');
        if (config.base_model) _baseModel(L, config);
        else _custom(L, config);
        return L.join('\n');
    }

    function _baseModel(L, cfg) {
        var tr = cfg.training || {};
        var task = tr.task || 'mlm';
        var sbert = tr.sbert || {};

        var n0 = nid();
        L.push('    ' + n0 + '["' + esc(cfg.base_model) + '<br/>Pretrained Model"]:::emb');

        if (task === 'sbert') {
            var n1 = nid(), n2 = nid(), n3 = nid();
            L.push('    ' + n0 + ' --> ' + n1);
            L.push('    ' + n1 + '["Encoder<br/>frozen or fine-tuned"]:::attn');
            L.push('    ' + n1 + ' --> ' + n2);
            L.push('    ' + n2 + '["Pooling: ' + esc(sbert.pooling_mode || 'mean') + '"]:::output');
            L.push('    ' + n2 + ' --> ' + n3);
            L.push('    ' + n3 + '["Sentence Embeddings"]:::output');
        } else {
            var n1 = nid(), n2 = nid();
            L.push('    ' + n0 + ' --> ' + n1);
            L.push('    ' + n1 + '["Continual Pretraining<br/>Task: ' + esc(task.toUpperCase()) + '"]:::train');
            L.push('    ' + n1 + ' --> ' + n2);
            L.push('    ' + n2 + '["Output"]:::output');
        }
        _trainBlock(L, tr);
    }

    function _custom(L, cfg) {
        var m = cfg.model || {};
        var tr = cfg.training || {};
        var mc = cfg.model_class || '';
        // mode field is now under dims.* in the restructured schema; keep the
        // legacy m.mode fallback for YAMLs that still use the flat shape.
        var dec = mc === 'frankesteindecoder' || pick(m, 'dims.mode', 'mode', '') === 'decoder';
        var pat = pick(m, 'dims.layer_pattern', 'layer_pattern', ['standard_attn']);
        if (typeof pat === 'string') pat = [pat];
        var nL = pick(m, 'dims.num_layers', 'num_layers', 1);
        var loops = pick(m, 'dims.num_loops', 'num_loops', 1);
        var H = pick(m, 'dims.hidden_size', 'hidden_size', 768);
        var V = pick(m, 'dims.vocab_size', 'vocab_size', 50000);
        var nH = pick(m, 'dims.num_heads', 'num_heads', 12);
        var rH = pick(m, 'dims.retention_heads', 'retention_heads', nH);
        var fact = pick(m, 'embedding.factorized.enabled', 'use_factorized_embedding', false);
        var fD = pick(m, 'embedding.factorized.dim', 'factorized_embedding_dim', 128);
        var conv = pick(m, 'embedding.conv.enabled', 'use_embedding_conv', false);
        var cK = pick(m, 'embedding.conv.kernel', 'embedding_conv_kernel', 3);
        // Positional encoding moved under attention.titan.*; legacy fields
        // (positional_encoding, use_hope, hope_base, hope_damping) remain
        // available as fallbacks for older configurations on disk.
        var legacyHope = pick(m, 'attention.titan.use_hope', 'use_hope', false);
        var pe = pick(m, 'attention.titan.positional_encoding', 'positional_encoding', legacyHope ? 'hope' : '');
        var hopeBase = pick(m, 'attention.titan.hope.base', 'hope_base', null);
        var hopeDamping = pick(m, 'attention.titan.hope.damping', 'hope_damping', null);
        // These keys stayed flat in the restructured schema (model.* top level).
        var moe = m.use_moe;
        var nE = m.num_experts || 4;
        var tK = m.top_k_experts || 2;
        var fH = m.ffn_hidden_size || 3072;
        var fA = m.ffn_activation || 'gelu';
        var nrm = pick(m, 'norm.type', 'norm_type', 'layer_norm');
        var bit = m.use_bitnet;
        var oS = m.ode_solver || 'rk4';
        var oSt = m.ode_steps || 2;
        var drp = pick(m, 'dims.dropout', 'dropout', 0);
        var task = tr.task || 'mlm';

        var layers = expand(pat, nL);
        var v = vis(layers, 8);

        var nIn = nid();
        L.push('    ' + nIn + '["Input IDs<br/>vocab: ' + fmt(V) + '"]:::input');
        L.push('');

        L.push('    subgraph SG_EMB ["Embedding"]');
        var chain = [];
        var nE0 = nid();
        var eLbl;
        if (fact) {
            eLbl = 'Factorized Emb<br/>' + fmt(V) + ' x ' + fD + ' -> ' + fD + ' x ' + H;
        } else {
            eLbl = 'Token Embedding<br/>' + fmt(V) + ' x ' + H;
        }
        L.push('        ' + nE0 + '["' + esc(eLbl) + '"]:::emb');
        chain.push(nE0);

        if (conv) {
            var nC = nid();
            L.push('        ' + nC + '["Conv1D<br/>kernel: ' + cK + '"]:::emb');
            chain.push(nC);
        }

        if (pe === 'hope') {
            var nP = nid();
            var pLbl = 'HoPE';
            if (hopeBase !== null) pLbl += ' base:' + hopeBase;
            if (hopeDamping !== null) pLbl += ' d:' + hopeDamping;
            L.push('        ' + nP + '["' + esc(pLbl) + '"]:::emb');
            chain.push(nP);
        } else if (pe === 'rope') {
            var nP = nid();
            L.push('        ' + nP + '["RoPE<br/>Rotary Pos Enc"]:::emb');
            chain.push(nP);
        } else if (!dec) {
            var nP = nid();
            L.push('        ' + nP + '["Learned Pos Enc"]:::emb');
            chain.push(nP);
        }

        L.push('    end');
        L.push('');

        L.push('    ' + nIn + ' --> ' + chain[0]);
        for (var i = 1; i < chain.length; i++) {
            L.push('    ' + chain[i - 1] + ' --> ' + chain[i]);
        }

        var lastEmb = chain[chain.length - 1];
        var loopLbl = nL + ' layer' + (nL > 1 ? 's' : '');
        if (loops > 1) loopLbl += ' x ' + loops + ' loops';
        if (dec) loopLbl += ' (causal)';

        L.push('');
        L.push('    subgraph SG_LAYERS ["' + esc(loopLbl) + '"]');
        var layerIds = [];
        for (var vi = 0; vi < v.length; vi++) {
            var item = v[vi];
            if (item.d) {
                var nD = nid();
                L.push('        ' + nD + '["..."]:::info');
                layerIds.push(nD);
            } else {
                var nLi = nid();
                var c = catOf(item.t);
                var lb = lblOf(item.t);
                var det = '';
                if (c === 'recur') det = '<br/>' + rH + ' ret heads';
                else if (c === 'attn' || c === 'sparse') det = '<br/>' + nH + ' heads';
                else if (c === 'ode') det = '<br/>' + oS + ', ' + oSt + ' steps';
                L.push('        ' + nLi + '["L' + item.i + ': ' + esc(lb) + det + '"]:::' + c);
                layerIds.push(nLi);
            }
        }
        L.push('    end');
        L.push('');

        L.push('    ' + lastEmb + ' --> ' + layerIds[0]);
        for (var li = 1; li < layerIds.length; li++) {
            L.push('    ' + layerIds[li - 1] + ' --> ' + layerIds[li]);
        }

        if (loops > 1) {
            var nLoop = nid();
            L.push('    ' + layerIds[layerIds.length - 1] + ' -.-> ' + nLoop);
            L.push('    ' + nLoop + '["Loop x' + loops + '"]:::info');
            L.push('    ' + nLoop + ' -.-> ' + layerIds[0]);
        }

        var lastLayer = layerIds[layerIds.length - 1];
        var nHead = nid(), nOut = nid();

        if (dec) {
            L.push('    ' + lastLayer + ' --> ' + nHead);
            L.push('    ' + nHead + '["LM Head<br/>' + H + ' -> ' + fmt(V) + '"]:::output');
            L.push('    ' + nHead + ' --> ' + nOut);
            L.push('    ' + nOut + '["Next Token Logits"]:::output');
        } else if (task === 'mlm') {
            L.push('    ' + lastLayer + ' --> ' + nHead);
            L.push('    ' + nHead + '["MLM Head<br/>' + H + ' -> ' + fmt(V) + '"]:::output');
            L.push('    ' + nHead + ' --> ' + nOut);
            L.push('    ' + nOut + '["Masked Token Logits"]:::output');
        } else {
            L.push('    ' + lastLayer + ' --> ' + nHead);
            L.push('    ' + nHead + '["Projection<br/>' + H + ' -> ' + fmt(V) + '"]:::output');
            L.push('    ' + nHead + ' --> ' + nOut);
            L.push('    ' + nOut + '["Output"]:::output');
        }

        L.push('');
        L.push('    subgraph SG_DETAIL ["Per-Layer Detail"]');
        var nLbl = 'LayerNorm';
        if (nrm === 'dynamic_tanh') nLbl = 'DynamicTanh';
        else if (nrm === 'derf') nLbl = 'DynamicErf';
        var d1 = nid(), d2 = nid(), d3 = nid(), d4 = nid();
        L.push('        ' + d1 + '["' + esc(nLbl) + ' pre"]:::norm');
        L.push('        ' + d2 + '["Mixer Block"]:::attn');
        L.push('        ' + d3 + '["' + esc(nLbl) + ' post"]:::norm');
        var fLbl = 'FFN: ' + H + ' -> ' + fH + ' -> ' + H;
        fLbl += '<br/>' + fA;
        if (bit) fLbl += '<br/>BitNet: on';
        if (drp > 0) fLbl += '<br/>dropout: ' + drp;
        L.push('        ' + d4 + '["' + esc(fLbl) + '"]:::ffn');
        L.push('        ' + d1 + ' --> ' + d2 + ' --> ' + d3 + ' --> ' + d4);
        L.push('    end');
        L.push('');
        L.push('    ' + nOut + ' ~~~ ' + d1);

        if (moe) {
            L.push('');
            L.push('    subgraph SG_MOE ["MoE - ' + nE + ' experts, top-' + tK + '"]');
            var nR = nid();
            L.push('        ' + nR + '["Router"]:::moe');
            var maxShow = Math.min(nE, 8);
            for (var e = 0; e < maxShow; e++) {
                var nEi = nid();
                L.push('        ' + nEi + '["Expert ' + e + '<br/>' + H + ' -> ' + fH + ' -> ' + H + '"]:::moe');
                L.push('        ' + nR + ' --> ' + nEi);
            }
            if (nE > 8) {
                var nM = nid();
                L.push('        ' + nM + '["... +' + (nE - 8) + ' more"]:::moe');
                L.push('        ' + nR + ' --> ' + nM);
            }
            L.push('    end');
            L.push('    ' + d4 + ' ~~~ ' + nR);
        }

        _trainBlock(L, tr);
    }

    function _trainBlock(L, tr) {
        var opt = tr.optimizer || {};
        var optC = opt.optimizer_class || 'adamw';
        var task = tr.task || 'mlm';
        var sched = tr.scheduler_type || 'cosine';
        var bs = tr.batch_size || '?';
        var ml = tr.max_length || '?';
        var ep = tr.num_epochs || '?';

        L.push('');
        L.push('    subgraph SG_TRAIN ["Training"]');
        var t1 = nid(), t2 = nid(), t3 = nid();
        L.push('        ' + t1 + '["Task: ' + esc(task.toUpperCase()) + '"]:::train');
        L.push('        ' + t2 + '["Optimizer: ' + esc(optC) + '<br/>Scheduler: ' + esc(sched) + '"]:::train');
        L.push('        ' + t3 + '["Batch: ' + bs + ' | Seq: ' + ml + '<br/>Epochs: ' + ep + '"]:::train');
        L.push('    end');
    }

    function getInfo(cfg) {
        var m = cfg.model || {};
        var tr = cfg.training || {};
        var pat = pick(m, 'dims.layer_pattern', 'layer_pattern', []);
        if (typeof pat === 'string') pat = [pat];
        var nL = pick(m, 'dims.num_layers', 'num_layers', 0);
        var loops = pick(m, 'dims.num_loops', 'num_loops', 1);
        var expanded = expand(pat, nL);
        var counts = {};
        expanded.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
        return {
            modelClass: cfg.model_class || cfg.base_model || 'unknown',
            isBase: !!cfg.base_model,
            isDecoder: cfg.model_class === 'frankesteindecoder',
            hiddenSize: pick(m, 'dims.hidden_size', 'hidden_size', undefined),
            numLayers: nL,
            numLoops: loops,
            logicalLayers: nL * loops,
            numHeads: pick(m, 'dims.num_heads', 'num_heads', undefined),
            useMoe: m.use_moe || false,
            numExperts: m.num_experts || 0,
            topK: m.top_k_experts || 0,
            normType: pick(m, 'norm.type', 'norm_type', 'layer_norm'),
            useBitnet: m.use_bitnet || false,
            task: tr.task || 'mlm',
            layerTypes: counts,
            layerPattern: pat
        };
    }

    return { generate: generate, getInfo: getInfo };
})();
