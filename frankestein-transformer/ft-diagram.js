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
        info: 'fill:#161b22,stroke:#30363d,color:#c9d1d9',
        mhc: 'fill:#f0883e,stroke:#d18616,color:#fff'
    };

    // Per-mixer tensor flow templates. Each entry is a list of nodes, each
    // node: { n: label, c: cat, e?: edge-label-from-prev, from?: [idx] (fork),
    //         to?: [idx] (merge into these later nodes), loop?: idx (recurrence)
    // This lets us express parallel Q/K/V branches converging into scores,
    // memory read/write loops, latent down/up branches, etc. — and emit
    // Mermaid edges that make the dataflow explicit and tensors connected.
    var SUBSTRUCT = {
        // Dense: three parallel projections Q,K,V → scores ← softmax → O.
        standard_attn: [
            { n: 'x [B,n,H]', c: 'attn', id: 'x' },
            { n: 'Q = Wq·x [B,n,H]', c: 'attn', e: 'Wq', from: ['x'] },
            { n: 'K = Wk·x [B,n,H]', c: 'attn', e: 'Wk', from: ['x'] },
            { n: 'V = Wv·x [B,n,H]', c: 'attn', e: 'Wv', from: ['x'] },
            { n: 'scores = QKᵀ/√d [B,nh,n]', c: 'attn', e: 'QKᵀ', from: ['Q = Wq·x [B,n,H]', 'K = Wk·x [B,n,H]'] },
            { n: 'softmax(scores)', c: 'attn', e: 'softmax', from: ['scores = QKᵀ/√d [B,nh,n]'] },
            { n: 'A = softmax · V', c: 'attn', e: 'A·V', from: ['softmax(scores)', 'V = Wv·x [B,n,H]'] },
            { n: 'O = Wo·A [B,n,H]', c: 'attn', e: 'Wo', from: ['A = softmax · V'] }
        ],
        sigmoid_attn: [
            { n: 'x [B,n,H]', c: 'attn', id: 'x' },
            { n: 'Q = Wq·x [B,n,H]', c: 'attn', e: 'Wq', from: ['x'] },
            { n: 'K = Wk·x [B,n,H]', c: 'attn', e: 'Wk', from: ['x'] },
            { n: 'V = Wv·x [B,n,H]', c: 'attn', e: 'Wv', from: ['x'] },
            { n: 'scores = QKᵀ [B,nh,n]', c: 'attn', e: 'QKᵀ', from: ['Q = Wq·x [B,n,H]', 'K = Wk·x [B,n,H]'] },
            { n: 'A = σ(scores)', c: 'attn', e: 'sigmoid', from: ['scores = QKᵀ [B,nh,n]'] },
            { n: 'O = A·V [B,n,H]', c: 'attn', e: 'A·V', from: ['A = σ(scores)', 'V = Wv·x [B,n,H]'] }
        ],
        gated_softmax_attn: [
            { n: 'x [B,n,H]', c: 'attn', id: 'x' },
            { n: 'Q = Wq·x [B,n,H]', c: 'attn', e: 'Wq', from: ['x'] },
            { n: 'K = Wk·x [B,n,H]', c: 'attn', e: 'Wk', from: ['x'] },
            { n: 'V = Wv·x [B,n,H]', c: 'attn', e: 'Wv', from: ['x'] },
            { n: 'scores = QKᵀ/√d', c: 'attn', e: 'QKᵀ', from: ['Q = Wq·x [B,n,H]', 'K = Wk·x [B,n,H]'] },
            { n: 'softmax(scores)', c: 'attn', e: 'softmax', from: ['scores = QKᵀ/√d'] },
            { n: 'gate g = σ(Wg·x)', c: 'attn', e: 'Wg', from: ['x'] },
            { n: 'O = g · (Wo·softmax·V)', c: 'attn', e: 'gate·out', from: ['softmax(scores)', 'V = Wv·x [B,n,H]', 'gate g = σ(Wg·x)'] }
        ],
        gqa_attn: [
            { n: 'x [B,n,H]', c: 'attn', id: 'x' },
            { n: 'Q = Wq·x [B,n,H]', c: 'attn', e: 'Wq', from: ['x'] },
            { n: 'K = Wk·x [B,n,Hkv]', c: 'attn', e: 'Wk (shared)', from: ['x'] },
            { n: 'V = Wv·x [B,n,Hkv]', c: 'attn', e: 'Wv (shared)', from: ['x'] },
            { n: 'repeat_kv(K,V) → [B,n,H]', c: 'attn', e: 'repeat', from: ['K = Wk·x [B,n,Hkv]', 'V = Wv·x [B,n,Hkv]'] },
            { n: 'scores = QKᵀ/√d', c: 'attn', e: 'QKᵀ', from: ['Q = Wq·x [B,n,H]', 'repeat_kv(K,V) → [B,n,H]'] },
            { n: 'softmax(scores)', c: 'attn', e: 'softmax', from: ['scores = QKᵀ/√d'] },
            { n: 'O = Wo·(softmax·V) [B,n,H]', c: 'attn', e: 'Wo', from: ['softmax(scores)', 'repeat_kv(K,V) → [B,n,H]'] }
        ],
        // Recurrent: state recurrence loop + output read.
        retnet: [
            { n: 'x [B,n,H]', c: 'recur', id: 'x' },
            { n: 'Q,K,V = W·x [B,n,rH]', c: 'recur', e: 'Wqkv', from: ['x'] },
            { n: 'Sₜ₋₁ [rH,H]', c: 'recur', id: 'Sprev' },
            { n: 'decay γ + cumsum', c: 'recur', e: 'parallel', from: ['Q,K,V = W·x [B,n,rH]'] },
            { n: 'Sₜ = γ⊗Sₜ₋₁ + KᵀV', c: 'recur', e: 'update', from: ['decay γ + cumsum', 'Sₜ₋₁ [rH,H]'], loop: 'Sprev' },
            { n: 'O = Q·Sₜ [B,n,H]', c: 'recur', e: 'read', from: ['Sₜ = γ⊗Sₜ₋₁ + KᵀV', 'Q,K,V = W·x [B,n,rH]'] }
        ],
        retnet_attn: 'retnet',
        mamba: [
            { n: 'x [B,n,H]', c: 'ssm', id: 'x' },
            { n: 'select Δ,B,C', c: 'ssm', e: 'select', from: ['x'] },
            { n: 'discretize Ā,B̄ (ZOH)', c: 'ssm', e: 'ZOH', from: ['select Δ,B,C'] },
            { n: 'conv1d', c: 'ssm', e: 'conv', from: ['discretize Ā,B̄ (ZOH)'] },
            { n: 'hₜ = Ā·hₜ₋₁ + B̄·x', c: 'ssm', e: 'scan', from: ['conv1d'], id: 'hprev' },
            { n: 'O = C·hₜ [B,n,H]', c: 'ssm', e: 'read', from: ['hₜ = Ā·hₜ₋₁ + B̄·x'], loop: 'hprev' }
        ],
        ode: [
            { n: 'x₀ [B,n,H]', c: 'ode', id: 'x0' },
            { n: 'f(θ) step 1', c: 'ode', e: 'euler/rk4', from: ['x₀ [B,n,H]'] },
            { n: 'f(θ) step 2 …', c: 'ode', e: 'step', from: ['f(θ) step 1'] },
            { n: 'xₜ [B,n,H]', c: 'ode', e: 'integrate', from: ['f(θ) step 2 …'] }
        ],
        gla_attn: [
            { n: 'x [B,n,H]', c: 'attn', id: 'x' },
            { n: 'Q,K,V [B,n,H]', c: 'attn', e: 'Wqkv', from: ['x'] },
            { n: 'gate αₜ = σ(Wα·x)', c: 'attn', e: 'Wα', from: ['x'] },
            { n: 'Sₜ = αₜ⊗Sₜ₋₁+(1-αₜ)V', c: 'attn', e: 'update', from: ['Q,K,V [B,n,H]', 'gate αₜ = σ(Wα·x)'], id: 'Sprev' },
            { n: 'O = Q·Sₜ [B,n,H]', c: 'attn', e: 'read', from: ['Sₜ = αₜ⊗Sₜ₋₁+(1-αₜ)V', 'Q,K,V [B,n,H]'], loop: 'Sprev' }
        ],
        deltanet_attn: [
            { n: 'x [B,n,H]', c: 'recur', id: 'x' },
            { n: 'Q,K,V [B,n,H]', c: 'recur', e: 'Wqkv', from: ['x'] },
            { n: 'βₜ = σ(Wβ·x)', c: 'recur', e: 'Wβ', from: ['x'] },
            { n: 'Sₜ = βₜ⊗Sₜ₋₁+(1-βₜ)V', c: 'recur', e: 'correct', from: ['Q,K,V [B,n,H]', 'βₜ = σ(Wβ·x)'], id: 'Sprev' },
            { n: 'O = Q·Sₜ [B,n,H]', c: 'recur', e: 'read', from: ['Sₜ = βₜ⊗Sₜ₋₁+(1-βₜ)V', 'Q,K,V [B,n,H]'], loop: 'Sprev' }
        ],
        gated_deltanet_attn: 'deltanet_attn',
        gated_deltanet2_attn: [
            { n: 'x [B,n,H]', c: 'recur', id: 'x' },
            { n: 'Q,K,V [B,n,H]', c: 'recur', e: 'Wqkv', from: ['x'] },
            { n: 'erase gate βₜ', c: 'recur', e: 'Wβ', from: ['x'] },
            { n: 'write gate αₜ', c: 'recur', e: 'Wα', from: ['x'] },
            { n: 'Sₜ = βₜ⊗Sₜ₋₁+αₜ⊗V', c: 'recur', e: 'update', from: ['Q,K,V [B,n,H]', 'erase gate βₜ', 'write gate αₜ'], id: 'Sprev' },
            { n: 'O = Q·Sₜ [B,n,H]', c: 'recur', e: 'read', from: ['Sₜ = βₜ⊗Sₜ₋₁+αₜ⊗V', 'Q,K,V [B,n,H]'], loop: 'Sprev' }
        ],
        hgrn2_attn: [
            { n: 'x [B,n,H]', c: 'recur', id: 'x' },
            { n: 'Q,K,V [B,n,H]', c: 'recur', e: 'Wqkv', from: ['x'] },
            { n: 'forget gate fₜ', c: 'recur', e: 'Wf', from: ['x'] },
            { n: 'Sₜ = fₜ⊗Sₜ₋₁+fₜ⊗V', c: 'recur', e: 'outer', from: ['Q,K,V [B,n,H]', 'forget gate fₜ'], id: 'Sprev' },
            { n: 'O = Q·Sₜ [B,n,H]', c: 'recur', e: 'read', from: ['Sₜ = fₜ⊗Sₜ₋₁+fₜ⊗V', 'Q,K,V [B,n,H]'], loop: 'Sprev' }
        ],
        fox_attn: [
            { n: 'x [B,n,H]', c: 'attn', id: 'x' },
            { n: 'Q,K,V [B,n,H]', c: 'attn', e: 'Wqkv', from: ['x'] },
            { n: 'forget fₜ in logit', c: 'attn', e: 'Wf', from: ['x'] },
            { n: 'scores = fₜ⊗QKᵀ', c: 'attn', e: 'gate', from: ['Q,K,V [B,n,H]', 'forget fₜ in logit'] },
            { n: 'softmax(scores)', c: 'attn', e: 'softmax', from: ['scores = fₜ⊗QKᵀ'] },
            { n: 'O = Wo·softmax·V', c: 'attn', e: 'Wo', from: ['softmax(scores)', 'Q,K,V [B,n,H]'] }
        ],
        kda_attn: [
            { n: 'x [B,n,H]', c: 'recur', id: 'x' },
            { n: 'Q,K (kernel proj)', c: 'recur', e: 'Wqk', from: ['x'] },
            { n: 'bandwidth gate h', c: 'recur', e: 'Wh', from: ['x'] },
            { n: 'K̃ = kernel(Q,K,h)', c: 'recur', e: 'kernel', from: ['Q,K (kernel proj)', 'bandwidth gate h'] },
            { n: 'V = Wv·x [B,n,H]', c: 'recur', e: 'Wv', from: ['x'] },
            { n: 'O = K̃·V [B,n,H]', c: 'recur', e: 'read', from: ['K̃ = kernel(Q,K,h)', 'V = Wv·x [B,n,H]'] }
        ],
        // Sparse: Q,K,V + mask/selector + blocked scores.
        sparse_transformer_attn: [
            { n: 'x [B,n,H]', c: 'sparse', id: 'x' },
            { n: 'Q,K,V [B,n,H]', c: 'sparse', e: 'Wqkv', from: ['x'] },
            { n: 'strided pattern p', c: 'sparse', e: 'pattern', from: ['x'] },
            { n: 'masked scores = p⊗QKᵀ', c: 'sparse', e: 'mask', from: ['Q,K,V [B,n,H]', 'strided pattern p'] },
            { n: 'softmax', c: 'sparse', e: 'softmax', from: ['masked scores = p⊗QKᵀ'] },
            { n: 'O = Wo·softmax·V', c: 'sparse', e: 'Wo', from: ['softmax', 'Q,K,V [B,n,H]'] }
        ],
        longformer_attn: [
            { n: 'x [B,n,H]', c: 'sparse', id: 'x' },
            { n: 'Q,K,V [B,n,H]', c: 'sparse', e: 'Wqkv', from: ['x'] },
            { n: 'sliding window w', c: 'sparse', e: 'local', from: ['x'] },
            { n: '+ global tokens g', c: 'sparse', e: 'global', from: ['x'] },
            { n: 'masked scores = (w+g)⊗QKᵀ', c: 'sparse', e: 'mask', from: ['Q,K,V [B,n,H]', 'sliding window w', '+ global tokens g'] },
            { n: 'softmax', c: 'sparse', e: 'softmax', from: ['masked scores = (w+g)⊗QKᵀ'] },
            { n: 'O = Wo·softmax·V', c: 'sparse', e: 'Wo', from: ['softmax', 'Q,K,V [B,n,H]'] }
        ],
        bigbird_attn: [
            { n: 'x [B,n,H]', c: 'sparse', id: 'x' },
            { n: 'Q,K,V [B,n,H]', c: 'sparse', e: 'Wqkv', from: ['x'] },
            { n: 'local + random graph', c: 'sparse', e: 'graph', from: ['x'] },
            { n: '+ global tokens', c: 'sparse', e: 'global', from: ['x'] },
            { n: 'masked scores = graph⊗QKᵀ', c: 'sparse', e: 'mask', from: ['Q,K,V [B,n,H]', 'local + random graph', '+ global tokens'] },
            { n: 'softmax', c: 'sparse', e: 'softmax', from: ['masked scores = graph⊗QKᵀ'] },
            { n: 'O = Wo·softmax·V', c: 'sparse', e: 'Wo', from: ['softmax', 'Q,K,V [B,n,H]'] }
        ],
        sparsek_attn: [
            { n: 'x [B,n,H]', c: 'sparse', id: 'x' },
            { n: 'Q,K,V [B,n,H]', c: 'sparse', e: 'Wqkv', from: ['x'] },
            { n: 'top-k selector', c: 'sparse', e: 'top-k', from: ['Q,K,V [B,n,H]'] },
            { n: 'top-k scores = QKᵀ', c: 'sparse', e: 'select', from: ['Q,K,V [B,n,H]', 'top-k selector'] },
            { n: 'softmax', c: 'sparse', e: 'softmax', from: ['top-k scores = QKᵀ'] },
            { n: 'O = Wo·softmax·V', c: 'sparse', e: 'Wo', from: ['softmax', 'Q,K,V [B,n,H]'] }
        ],
        nsa_attn: [
            { n: 'x [B,n,H]', c: 'sparse', id: 'x' },
            { n: 'Q,K,V [B,n,H]', c: 'sparse', e: 'Wqkv', from: ['x'] },
            { n: 'block scoring', c: 'sparse', e: 'score', from: ['Q,K,V [B,n,H]'] },
            { n: 'block selection', c: 'sparse', e: 'select', from: ['block scoring'] },
            { n: 'sparse scores = QKᵀ', c: 'sparse', e: 'QKᵀ', from: ['Q,K,V [B,n,H]', 'block selection'] },
            { n: 'softmax', c: 'sparse', e: 'softmax', from: ['sparse scores = QKᵀ'] },
            { n: 'O = Wo·softmax·V', c: 'sparse', e: 'Wo', from: ['softmax', 'Q,K,V [B,n,H]'] }
        ],
        msa_attn: [
            { n: 'x [B,n,H]', c: 'sparse', id: 'x' },
            { n: 'Q,K,V [B,n,H]', c: 'sparse', e: 'Wqkv', from: ['x'] },
            { n: 'block-sparse mask', c: 'sparse', e: 'mask', from: ['x'] },
            { n: 'masked scores = mask⊗QKᵀ', c: 'sparse', e: 'QKᵀ', from: ['Q,K,V [B,n,H]', 'block-sparse mask'] },
            { n: 'softmax', c: 'sparse', e: 'softmax', from: ['masked scores = mask⊗QKᵀ'] },
            { n: 'O = Wo·softmax·V', c: 'sparse', e: 'Wo', from: ['softmax', 'Q,K,V [B,n,H]'] }
        ],
        sparda_attn: [
            { n: 'x [B,n,H]', c: 'sparse', id: 'x' },
            { n: 'Q,K,V [B,n,H]', c: 'sparse', e: 'Wqkv', from: ['x'] },
            { n: 'forecast proj', c: 'sparse', e: 'forecast', from: ['Q,K,V [B,n,H]'] },
            { n: 'sparse scores = QKᵀ', c: 'sparse', e: 'QKᵀ', from: ['Q,K,V [B,n,H]', 'forecast proj'] },
            { n: 'softmax', c: 'sparse', e: 'softmax', from: ['sparse scores = QKᵀ'] },
            { n: 'O = Wo·softmax·V', c: 'sparse', e: 'Wo', from: ['softmax', 'Q,K,V [B,n,H]'] }
        ],
        sparge_attn: [
            { n: 'x [B,n,H]', c: 'eval', id: 'x' },
            { n: 'Q,K,V [B,n,H]', c: 'eval', e: 'Wqkv', from: ['x'] },
            { n: 'sparse predictor (eval)', c: 'eval', e: 'predict', from: ['Q,K,V [B,n,H]'] },
            { n: 'pruned scores', c: 'eval', e: 'QKᵀ', from: ['Q,K,V [B,n,H]', 'sparse predictor (eval)'] },
            { n: 'softmax', c: 'eval', e: 'softmax', from: ['pruned scores'] },
            { n: 'O = Wo·softmax·V', c: 'eval', e: 'Wo', from: ['softmax', 'Q,K,V [B,n,H]'] }
        ],
        fasa_attn: [
            { n: 'x [B,n,H]', c: 'eval', id: 'x' },
            { n: 'Q,K,V [B,n,H]', c: 'eval', e: 'Wqkv', from: ['x'] },
            { n: 'freq-aware prune (eval)', c: 'eval', e: 'frequency', from: ['Q,K,V [B,n,H]'] },
            { n: 'sparse scores', c: 'eval', e: 'QKᵀ', from: ['Q,K,V [B,n,H]', 'freq-aware prune (eval)'] },
            { n: 'softmax', c: 'eval', e: 'softmax', from: ['sparse scores'] },
            { n: 'O = Wo·softmax·V', c: 'eval', e: 'Wo', from: ['softmax', 'Q,K,V [B,n,H]'] }
        ],
        // Latent: down-project KV → latent → up-project → attention.
        mla_attn: [
            { n: 'x [B,n,H]', c: 'attn', id: 'x' },
            { n: 'c_KV = W_down·x [B,n,r]', c: 'attn', e: 'W_down', from: ['x'] },
            { n: 'K,V = W_up·c_KV [B,n,H]', c: 'attn', e: 'W_up', from: ['c_KV = W_down·x [B,n,r]'] },
            { n: 'Q = Wq·x [B,n,H]', c: 'attn', e: 'Wq', from: ['x'] },
            { n: 'RoPE(Q,K)', c: 'attn', e: 'RoPE', from: ['Q = Wq·x [B,n,H]', 'K,V = W_up·c_KV [B,n,H]'] },
            { n: 'scores = QKᵀ/√d', c: 'attn', e: 'QKᵀ', from: ['RoPE(Q,K)'] },
            { n: 'softmax', c: 'attn', e: 'softmax', from: ['scores = QKᵀ/√d'] },
            { n: 'O = Wo·softmax·V [B,n,H]', c: 'attn', e: 'Wo', from: ['softmax', 'K,V = W_up·c_KV [B,n,H]'] }
        ],
        gqla_attn: 'mla_attn',
        mlra_attn: [
            { n: 'x [B,n,H]', c: 'attn', id: 'x' },
            { n: 'c_KV = W_down·x', c: 'attn', e: 'W_down', from: ['x'] },
            { n: 'partition L sub-heads', c: 'attn', e: 'split', from: ['c_KV = W_down·x'] },
            { n: 'Kᵢ,Vᵢ = W_up^(i)·cᵢ', c: 'attn', e: 'W_up', from: ['partition L sub-heads'] },
            { n: 'Q = Wq·x [B,n,H]', c: 'attn', e: 'Wq', from: ['x'] },
            { n: 'scores = QKᵀ/√d', c: 'attn', e: 'QKᵀ', from: ['Q = Wq·x [B,n,H]', 'Kᵢ,Vᵢ = W_up^(i)·cᵢ'] },
            { n: 'softmax', c: 'attn', e: 'softmax', from: ['scores = QKᵀ/√d'] },
            { n: 'O = Wo·softmax·V [B,n,H]', c: 'attn', e: 'Wo', from: ['softmax', 'Kᵢ,Vᵢ = W_up^(i)·cᵢ'] }
        ],
        tucker_attn: [
            { n: 'x [B,n,H]', c: 'attn', id: 'x' },
            { n: 'Q = Tucker_q(x) [qr]', c: 'attn', e: 'q_rank', from: ['x'] },
            { n: 'K,V = Tucker_kv(x) [kr]', c: 'attn', e: 'kv_rank', from: ['x'] },
            { n: 'reconstruct Q,K,V [B,n,H]', c: 'attn', e: 'recon', from: ['Q = Tucker_q(x) [qr]', 'K,V = Tucker_kv(x) [kr]'] },
            { n: 'scores = QKᵀ/√d', c: 'attn', e: 'QKᵀ', from: ['reconstruct Q,K,V [B,n,H]'] },
            { n: 'softmax', c: 'attn', e: 'softmax', from: ['scores = QKᵀ/√d'] },
            { n: 'O = Wo·softmax·V [B,n,H]', c: 'attn', e: 'Wo', from: ['softmax', 'reconstruct Q,K,V [B,n,H]'] }
        ],
        iha_attn: [
            { n: 'x [B,n,H]', c: 'attn', id: 'x' },
            { n: 'interleave heads', c: 'attn', e: 'interleave', from: ['x'] },
            { n: 'latent K,V', c: 'attn', e: 'latent', from: ['interleave heads'] },
            { n: 'Q = Wq·x [B,n,H]', c: 'attn', e: 'Wq', from: ['x'] },
            { n: 'scores = QKᵀ/√d', c: 'attn', e: 'QKᵀ', from: ['Q = Wq·x [B,n,H]', 'latent K,V'] },
            { n: 'softmax', c: 'attn', e: 'softmax', from: ['scores = QKᵀ/√d'] },
            { n: 'O = Wo·softmax·V [B,n,H]', c: 'attn', e: 'Wo', from: ['softmax', 'latent K,V'] }
        ],
        gta_attn: [
            { n: 'x [B,n,H]', c: 'attn', id: 'x' },
            { n: 'shared map', c: 'attn', e: 'map', from: ['x'] },
            { n: 'latent K,V', c: 'attn', e: 'latent', from: ['shared map'] },
            { n: 'Q = Wq·x [B,n,H]', c: 'attn', e: 'Wq', from: ['x'] },
            { n: 'scores = QKᵀ/√d', c: 'attn', e: 'QKᵀ', from: ['Q = Wq·x [B,n,H]', 'latent K,V'] },
            { n: 'softmax', c: 'attn', e: 'softmax', from: ['scores = QKᵀ/√d'] },
            { n: 'O = Wo·softmax·V [B,n,H]', c: 'attn', e: 'Wo', from: ['softmax', 'latent K,V'] }
        ],
        mtla_attn: [
            { n: 'x [B,n,H]', c: 'attn', id: 'x' },
            { n: 'temporal compress', c: 'attn', e: 'temporal', from: ['x'] },
            { n: 'latent K,V', c: 'attn', e: 'latent', from: ['temporal compress'] },
            { n: 'Q = Wq·x [B,n,H]', c: 'attn', e: 'Wq', from: ['x'] },
            { n: 'scores = QKᵀ/√d', c: 'attn', e: 'QKᵀ', from: ['Q = Wq·x [B,n,H]', 'latent K,V'] },
            { n: 'softmax', c: 'attn', e: 'softmax', from: ['scores = QKᵀ/√d'] },
            { n: 'O = Wo·softmax·V [B,n,H]', c: 'attn', e: 'Wo', from: ['softmax', 'latent K,V'] }
        ],
        cca_attn: [
            { n: 'x [B,n,H]', c: 'attn', id: 'x' },
            { n: '1D conv', c: 'attn', e: 'conv', from: ['x'] },
            { n: 'c = W_down·conv(x) [r]', c: 'attn', e: 'W_down', from: ['1D conv'] },
            { n: 'Q = Wq·x [B,n,H]', c: 'attn', e: 'Wq', from: ['x'] },
            { n: 'latent attn = Q·c', c: 'attn', e: 'QKᵀ', from: ['Q = Wq·x [B,n,H]', 'c = W_down·conv(x) [r]'] },
            { n: 'softmax', c: 'attn', e: 'softmax', from: ['latent attn = Q·c'] },
            { n: 'O = Wo·softmax·V [B,n,H]', c: 'attn', e: 'Wo', from: ['softmax', 'c = W_down·conv(x) [r]'] }
        ],
        ccgqa_attn: [
            { n: 'x [B,n,H]', c: 'attn', id: 'x' },
            { n: '1D conv', c: 'attn', e: 'conv', from: ['x'] },
            { n: 'c = W_down·conv(x) [r]', c: 'attn', e: 'W_down', from: ['1D conv'] },
            { n: 'Q = Wq·x [B,n,H]', c: 'attn', e: 'Wq', from: ['x'] },
            { n: 'GQA(Q, c) → K,V', c: 'attn', e: 'GQA', from: ['Q = Wq·x [B,n,H]', 'c = W_down·conv(x) [r]'] },
            { n: 'softmax', c: 'attn', e: 'softmax', from: ['GQA(Q, c) → K,V'] },
            { n: 'O = Wo·softmax·V [B,n,H]', c: 'attn', e: 'Wo', from: ['softmax', 'GQA(Q, c) → K,V'] }
        ],
        // Memory: dense QKV/O + memory bank read/write.
        titan_attn: [
            { n: 'x [B,n,H]', c: 'attn', id: 'x' },
            { n: 'Q,K,V = W·x [B,n,H]', c: 'attn', e: 'Wqkv', from: ['x'] },
            { n: 'memory M [slots,dim]', c: 'attn', id: 'M' },
            { n: 'read gate, write gate', c: 'attn', e: 'gates', from: ['x'] },
            { n: 'retrieved ctx ← M', c: 'attn', e: 'read', from: ['memory M [slots,dim]', 'read gate, write gate'] },
            { n: 'M ← write(V)', c: 'attn', e: 'write', from: ['Q,K,V = W·x [B,n,H]', 'read gate, write gate'], loop: 'M' },
            { n: 'attn over M + ctx', c: 'attn', e: 'QKᵀ', from: ['Q,K,V = W·x [B,n,H]', 'retrieved ctx ← M'] },
            { n: 'O = Wo·out [B,n,H]', c: 'attn', e: 'Wo', from: ['attn over M + ctx'] }
        ],
        engram_attn: [
            { n: 'x [B,n,H]', c: 'attn', id: 'x' },
            { n: 'Q,K,V = W·x [B,n,H]', c: 'attn', e: 'Wqkv', from: ['x'] },
            { n: 'memory bank M', c: 'attn', id: 'M' },
            { n: 'learned read', c: 'attn', e: 'read', from: ['Q,K,V = W·x [B,n,H]', 'memory bank M'] },
            { n: 'learned write', c: 'attn', e: 'write', from: ['Q,K,V = W·x [B,n,H]'], loop: 'M' },
            { n: 'retrieved ctx', c: 'attn', e: 'retrieve', from: ['learned read'] },
            { n: 'O = Wo·(ctx+V) [B,n,H]', c: 'attn', e: 'Wo', from: ['retrieved ctx', 'Q,K,V = W·x [B,n,H]'] }
        ]
    };

    function resolveSub(t) {
        var s = SUBSTRUCT[t];
        if (typeof s === 'string') return resolveSub(s);
        return s || SUBSTRUCT.standard_attn;
    }

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
    }

    // Render a single mixer subgraph from its SUBSTRUCT template. Nodes are
    // created first (preserving order), then edges are emitted using the
    // `from` arrays to connect the explicit dataflow (parallel Q/K/V
    // branches converging into scores, state recurrence, memory read/write
    // loops, etc.). Returns the id of the first and last node so callers
    // can wire NormPre → mixer-in and mixer-out → NormPost.
    function _mixerSubgraph(L, t, ti, ind) {
        ind = ind || '    ';
        var sub = resolveSub(t);
        var fam = catOf(t);
        var sgName = 'SG_MIXER_' + ti;
        var sgLbl = esc(lblOf(t)) + ' (' + fam + ')';
        L.push(ind + 'subgraph ' + sgName + ' ["' + sgLbl + '"]');
        // Allocate nodes, indexed by label so `from` can resolve to ids.
        var byLabel = {};
        var byIdIdx = {};
        var ids = [];
        for (var si = 0; si < sub.length; si++) {
            var nd = sub[si];
            var nId = nid();
            var role = nd.c || fam;
            L.push(ind + '    ' + nId + '["' + esc(nd.n) + '"]:::' + role);
            byLabel[nd.n] = nId;
            byIdIdx[si] = nId;
            ids.push(nId);
        }
        L.push(ind + 'end');
        // Edges: for each node with `from`, emit labelled edges from each
        // source. Fall back to the previous node (chain) when no `from`.
        for (var si = 0; si < sub.length; si++) {
            var nd = sub[si];
            var tgt = ids[si];
            var sources = nd.from || (si > 0 ? [sub[si - 1].n] : []);
            for (var fi = 0; fi < sources.length; fi++) {
                var src = byLabel[sources[fi]];
                if (!src) continue;
                if (nd.e) {
                    L.push(ind + ' ' + src + ' --"' + esc(nd.e) + '"--> ' + tgt);
                } else {
                    L.push(ind + ' ' + src + ' --> ' + tgt);
                }
            }
            // Recurrence loop: a node marked `loop` feeds back to an
            // earlier state node (Sₜ₋₁ / hₜ₋₁ / memory M).
            if (nd.loop) {
                var loopTarget = byLabel[nd.loop];
                if (loopTarget) {
                    L.push(ind + ' ' + tgt + ' -. "next" .-> ' + loopTarget);
                }
            }
        }
        L.push('');
        return { first: ids[0], last: ids[ids.length - 1] };
    }

    // FFN detail subgraph: x → (gate,up) → activation → down → y.
    function _ffnSubgraph(L, H, fH, fA, bit, drp, moe, nE, tK, ind) {
        ind = ind || '    ';
        L.push(ind + 'subgraph SG_FFN ["Feed-Forward"]');
        var isGlu = /glu|geglu|swiglu/i.test(String(fA || ''));
        var xId = nid(), aId = nid(), actId = nid(), dId = nid(), yId = nid();
        L.push(ind + '    ' + xId + '["x [B,n,H]"]:::ffn');
        if (isGlu) {
            L.push(ind + '    ' + aId + '["gate,up: H→' + fH + '<br/>act: ' + fA + '"]:::ffn');
            L.push(ind + '    ' + xId + ' --"Wg,Wu"--> ' + aId);
            L.push(ind + '    ' + actId + '["swish(gate)⊙up [' + fH + ']"]:::ffn');
            L.push(ind + '    ' + aId + ' --"⊙"--> ' + actId);
        } else {
            L.push(ind + '    ' + aId + '["up: H→' + fH + '<br/>act: ' + fA + '"]:::ffn');
            L.push(ind + '    ' + xId + ' --"Wup"--> ' + aId);
            L.push(ind + '    ' + actId + '["' + fA + '(up) [' + fH + ']"]:::ffn');
            L.push(ind + '    ' + aId + ' --"' + fA + '"--> ' + actId);
        }
        L.push(ind + '    ' + dId + '["down: ' + fH + '→H"]:::ffn');
        L.push(ind + '    ' + actId + ' --"Wdown"--> ' + dId);
        L.push(ind + '    ' + yId + '["y [B,n,H]"]:::ffn');
        L.push(ind + '    ' + dId + ' --> ' + yId);
        if (bit) L.push(ind + '    %% BitNet ternary on');
        if (drp > 0) L.push(ind + '    %% dropout ' + drp);
        L.push(ind + 'end');
        L.push('');

        if (moe) {
            L.push(ind + 'subgraph SG_MOE ["MoE — ' + nE + ' experts, top-' + tK + '"]');
            var nR = nid();
            L.push(ind + '    ' + nR + '["Router<br/>gate(x) → top-' + tK + '"]:::moe');
            L.push(ind + '    ' + xId + ' --"route"--> ' + nR);
            var maxShow = Math.min(nE, 8);
            for (var e = 0; e < maxShow; e++) {
                var nEi = nid();
                L.push(ind + '    ' + nEi + '["Expert ' + e + '<br/>H→' + fH + '→H"]:::moe');
                L.push(ind + '    ' + nR + ' --"top-' + tK + '"--> ' + nEi);
                L.push(ind + '    ' + nEi + ' --"merge"--> ' + yId);
            }
            if (nE > 8) {
                var nM = nid();
                L.push(ind + '    ' + nM + '["... +' + (nE - 8) + ' more"]:::moe');
                L.push(ind + '    ' + nR + ' --> ' + nM);
                L.push(ind + '    ' + nM + ' --"merge"--> ' + yId);
            }
            L.push(ind + 'end');
            L.push('');
        }
        return { in: xId, out: yId };
    }

    // mHC block subgraph (Manifold-Constrained Hyper-Connections). One block
    // sits after each layer's FFN and before the next NormPre when enabled.
    function _mhcBlock(L, m, ind) {
        ind = ind || '    ';
        var n = pick(m, 'mhc.expansion_rate', 'mhc_expansion_rate', 4);
        var iters = pick(m, 'mhc.sinkhorn_iters', 'mhc_sinkhorn_iters', 20);
        var gInit = pick(m, 'mhc.gating_init', 'mhc_gating_init', 0.01);
        var ckpt = pick(m, 'mhc.checkpoint', 'mhc_checkpoint', false);
        var sg = 'SG_MHC_' + (_id++);
        L.push(ind + 'subgraph ' + sg + ' ["mHC · n=' + n + ' (Sinkhorn ' + iters + ' iters, α=' + gInit + ')"]');
        var a = nid(), b = nid(), c = nid(), d = nid(), e = nid();
        L.push(ind + '    ' + a + '["x [B,n,C]"]:::mhc');
        L.push(ind + '    ' + b + '["mhc_in_proj<br/>→ [B,n,n·C]"]:::mhc');
        L.push(ind + '    ' + c + '["H[res] (n×n doubly-stoch.)<br/>Sinkhorn-Knopp ' + iters + 'x"]:::mhc');
        L.push(ind + '    ' + d + '["φ_l · α<br/>coef projection"]:::mhc');
        L.push(ind + '    ' + e + '["mhc_out_proj<br/>→ [B,n,C]"]:::mhc');
        L.push(ind + '    ' + a + ' --"W_in"--> ' + b + ' --"mix"--> ' + c + ' --"α"--> ' + d + ' --"W_out"--> ' + e);
        if (ckpt) L.push(ind + '    %% gradient checkpointing on');
        L.push(ind + 'end');
        L.push('');
        return { in: a, out: e };
    }

    function _custom(L, cfg) {
        var m = cfg.model || {};
        var tr = cfg.training || {};
        var mc = cfg.model_class || '';
        var dec = mc === 'frankensteindecoder' || pick(m, 'dims.mode', 'mode', '') === 'decoder';
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
        var legacyHope = pick(m, 'attention.titan.use_hope', 'use_hope', false);
        var pe = pick(m, 'attention.titan.positional_encoding', 'positional_encoding', legacyHope ? 'hope' : '');
        var hopeBase = pick(m, 'attention.titan.hope.base', 'hope_base', null);
        var hopeDamping = pick(m, 'attention.titan.hope.damping', 'hope_damping', null);
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
        var mhcEnabled = toBool(pick(m, 'mhc.enabled', 'use_mhc', false), false);

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
        if (mhcEnabled) loopLbl += ' + mHC';

        // Per-layer chain with explicit dataflow. We collapse repeated
        // identical layers into a single "..." when there are many, but
        // always show the first two and last two so the NormPre → mixer →
        // NormPost → FFN (→ mHC) rhythm is visible end-to-end.
        L.push('');
        L.push('    subgraph SG_LAYERS ["' + esc(loopLbl) + '"]');
        var prevOuter = lastEmb;
        var distinctTypes = [];
        layers.forEach(function (t) {
            if (distinctTypes.indexOf(t) === -1) distinctTypes.push(t);
        });

        // Each visible layer wires NormPre → mixer → NormPost → FFN →
        // [mHC] → next. On the first occurrence of each distinct mixer
        // type (and once for FFN/MoE, once for mHC) the detailed tensor
        // subgraph is embedded inline inside SG_LAYERS so the dataflow of
        // attention / MoE / etc. is visible without repeating it per layer.
        var normLbl = 'LayerNorm';
        if (nrm === 'dynamic_tanh') normLbl = 'DynamicTanh';
        else if (nrm === 'derf') normLbl = 'DynamicErf';
        else if (nrm === 'rms_norm') normLbl = 'RMSNorm';
        else if (nrm === 'prms_norm') normLbl = 'pRMSNorm';
        else if (nrm === 'flash_norm') normLbl = 'FlashNorm';

        var detailShown = {};
        var ffnShown = false;
        var mhcShown = false;

        for (var vi = 0; vi < v.length; vi++) {
            var item = v[vi];
            if (item.d) {
                var nD = nid();
                L.push('        ' + nD + '["... (repeated layers)"]:::info');
                L.push('        ' + prevOuter + ' --> ' + nD);
                prevOuter = nD;
            } else {
                var t = item.t;
                var fam = catOf(t);
                var lb = lblOf(t);
                var det = '';
                if (fam === 'recur') {
                    var headsForLayer = (t === 'retnet' || t === 'retnet_attn') ? rH : nH;
                    det = '<br/>' + headsForLayer + ' heads';
                } else if (fam === 'attn' || fam === 'sparse') {
                    det = '<br/>' + nH + ' heads';
                } else if (fam === 'ode') {
                    det = '<br/>' + oS + ', ' + oSt + ' steps';
                }
                var nPre = nid();
                var nMix = nid();
                var nPost = nid();
                var nFfnIn = nid();
                var nFfnOut = nid();
                L.push('        ' + nPre + '["L' + item.i + ' · ' + esc(normLbl) + ' pre"]:::norm');
                L.push('        ' + nMix + '["L' + item.i + ': ' + esc(lb) + det + '"]:::' + fam);
                L.push('        ' + nPost + '["L' + item.i + ' · ' + esc(normLbl) + ' post"]:::norm');
                L.push('        ' + nFfnIn + '["FFN in<br/>H→' + fH + ' (' + fA + ')"]:::ffn');
                L.push('        ' + nFfnOut + '["FFN out<br/>' + fH + '→H"]:::ffn');
                L.push('        ' + prevOuter + ' --> ' + nPre);
                L.push('        ' + nPre + ' --"x"--> ' + nMix);
                L.push('        ' + nMix + ' --"O"--> ' + nPost);
                L.push('        ' + nPost + ' --"+residual"--> ' + nFfnIn);
                L.push('        ' + nFfnIn + ' --"Wup"--> ' + nFfnOut);
                prevOuter = nFfnOut;
                if (mhcEnabled) {
                    var nMhc = nid();
                    L.push('        ' + nMhc + '["mHC L' + item.i + '<br/>n=' + pick(m, 'mhc.expansion_rate', 'mhc_expansion_rate', 4) + '"]:::mhc');
                    L.push('        ' + nFfnOut + ' --"+residual"--> ' + nMhc);
                    prevOuter = nMhc;
                }
                // First occurrence of this mixer type: embed its detailed
                // tensor dataflow subgraph inline (then stop showing it).
                if (!detailShown[t]) {
                    detailShown[t] = true;
                    _mixerSubgraph(L, t, distinctTypes.indexOf(t), '        ');
                }
                // First layer: embed the FFN (and MoE) detail once.
                if (!ffnShown) {
                    ffnShown = true;
                    _ffnSubgraph(L, H, fH, fA, bit, drp, moe, nE, tK, '        ');
                }
                // First layer: embed the mHC block detail once when enabled.
                if (mhcEnabled && !mhcShown) {
                    mhcShown = true;
                    _mhcBlock(L, m, '        ');
                }
            }
        }
        L.push('    end');
        L.push('');

        var lastLayer = prevOuter;
        var nHead = nid(), nOut = nid();

        if (dec) {
            L.push('    ' + lastLayer + ' --"+residual"--> ' + nHead);
            L.push('    ' + nHead + '["LM Head<br/>' + H + ' -> ' + fmt(V) + '"]:::output');
            L.push('    ' + nHead + ' --> ' + nOut);
            L.push('    ' + nOut + '["Next Token Logits"]:::output');
        } else if (task === 'mlm') {
            L.push('    ' + lastLayer + ' --"+residual"--> ' + nHead);
            L.push('    ' + nHead + '["MLM Head<br/>' + H + ' -> ' + fmt(V) + '"]:::output');
            L.push('    ' + nHead + ' --> ' + nOut);
            L.push('    ' + nOut + '["Masked Token Logits"]:::output');
        } else {
            L.push('    ' + lastLayer + ' --"+residual"--> ' + nHead);
            L.push('    ' + nHead + '["Projection<br/>' + H + ' -> ' + fmt(V) + '"]:::output');
            L.push('    ' + nHead + ' --> ' + nOut);
            L.push('    ' + nOut + '["Output"]:::output');
        }
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
            isDecoder: cfg.model_class === 'frankensteindecoder',
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
            useMhc: toBool(pick(m, 'mhc.enabled', 'use_mhc', false), false),
            mhcExpansionRate: pick(m, 'mhc.expansion_rate', 'mhc_expansion_rate', 4),
            task: tr.task || 'mlm',
            layerTypes: counts,
            layerPattern: pat
        };
    }

    function toBool(v, dflt) {
        if (v === undefined || v === null) return dflt;
        if (typeof v === 'boolean') return v;
        if (typeof v === 'string') return v === 'true' || v === 'True' || v === '1';
        return dflt;
    }

    return { generate: generate, getInfo: getInfo };
})();