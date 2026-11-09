/*!
 * ft-chartmaker.js — a vanilla, no-build "Tableau-style" chart maker.
 *
 * Port of the BI constructor in analisis_sagec (bi.js + ConstructorBI.vue):
 * typed fields (blue dimensions / green measures), four shelves
 * (Columns · Rows · Color · Size), 14 chart recipes, aggregation, ordering,
 * Top-N and a serialisable configuration that is stored in localStorage.
 *
 * Everything is inside one IIFE and exposes a small `window.FTCM` API.
 * ECharts 5 is expected as the global `echarts` (vendored next to this file).
 */
(function (global) {
  'use strict';

  /* =========================================================================
   * 0. Tiny i18n / formatting helpers
   * ========================================================================= */

  var FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
  var STORAGE_KEY = 'ft-charts-v1';
  var MAX_SCATTER_POINTS = 12000;
  var MAX_BOX_JITTER = 14000;
  var MAX_SERIES = 80;
  /* Temporary data host: the same files that used to live in data/. */
  var HF_BUCKET = 'https://huggingface.co/buckets/erickfmm/frankenstein-transformer-exp2/resolve/';

  function lang() {
    return document.documentElement.getAttribute('data-lang') === 'es' ? 'es' : 'en';
  }
  function themeName() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }
  function loc(en, es) { return { en: en, es: es }; }
  function L(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    return lang() === 'es' ? (v.es || v.en || '') : (v.en || v.es || '');
  }
  function locale() { return lang() === 'es' ? 'es-CL' : 'en-US'; }

  function fmtInt(n, lc) {
    if (n == null || !Number.isFinite(+n)) return '—';
    return Number(n).toLocaleString(lc || locale(), { maximumFractionDigits: 0 });
  }
  function fmtNum(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    return Number(n).toLocaleString(locale(), { maximumFractionDigits: 2 });
  }
  function fmtTick(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    var a = Math.abs(n);
    if (a !== 0 && (a < 0.001 || a >= 1000000)) return n.toExponential(1);
    return Number(n.toFixed(3)).toLocaleString(locale(), { maximumFractionDigits: 3 });
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function round4(v) {
    if (v == null || !Number.isFinite(v)) return null;
    return Math.round(v * 10000) / 10000;
  }
  function clone(o) {
    try { return JSON.parse(JSON.stringify(o)); } catch (e) { return o; }
  }
  function clampInt(v, lo, hi, dflt) {
    var n = Math.round(Number(v));
    if (!Number.isFinite(n)) return dflt;
    return Math.min(hi, Math.max(lo, n));
  }
  function numstr(n, lc) { return fmtInt(n, lc); }

  /* =========================================================================
   * 1. Vocabulary
   * ========================================================================= */

  var AGG_IDS = ['conteo', 'suma', 'promedio', 'mediana', 'min', 'max'];
  var AGG_LABELS = {
    conteo: loc('count', 'conteo'),
    suma: loc('sum', 'suma'),
    promedio: loc('average', 'promedio'),
    mediana: loc('median', 'mediana'),
    min: loc('min', 'mínimo'),
    max: loc('max', 'máximo')
  };

  var SORT_IDS = ['auto', 'valor', 'valor-asc', 'alfabetico', 'natural'];
  var SORT_LABELS = {
    auto: loc('automatic', 'automático'),
    valor: loc('value ↓', 'valor ↓'),
    'valor-asc': loc('value ↑', 'valor ↑'),
    alfabetico: loc('alphabetic', 'alfabético'),
    natural: loc('natural order', 'orden natural')
  };

  var TYPES = [
    { id: 'barras', icon: '▥', label: loc('Bars', 'Barras') },
    { id: 'barras-apiladas', icon: '▤', label: loc('Stacked', 'Apiladas') },
    { id: 'barras-horizontales', icon: '▭', label: loc('Horizontal', 'Horizontales') },
    { id: 'linea', icon: '∿', label: loc('Line', 'Línea') },
    { id: 'area', icon: '◭', label: loc('Area', 'Área') },
    { id: 'scatter', icon: '⁘', label: loc('Scatter', 'Dispersión') },
    { id: 'histograma', icon: '▦', label: loc('Histogram', 'Histograma') },
    { id: 'boxplot', icon: '▯', label: loc('Box', 'Caja') },
    { id: 'pastel', icon: '◔', label: loc('Pie', 'Pastel') },
    { id: 'donut', icon: '◎', label: loc('Donut', 'Donut') },
    { id: 'heatmap', icon: '▩', label: loc('Heatmap', 'Mapa de calor') },
    { id: 'treemap', icon: '▧', label: loc('Treemap', 'Treemap') },
    { id: 'sunburst', icon: '✹', label: loc('Sunburst', 'Sunburst') },
    { id: 'sankey', icon: '⇄', label: loc('Sankey', 'Sankey') }
  ];
  var TYPE_IDS = TYPES.map(function (t) { return t.id; });
  function typeById(id) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].id === id) return TYPES[i];
    return null;
  }

  var HINTS = {
    barras: loc(
      'Dimension in Columns (X) or Rows · optional measure in the other shelf (no measure = row count).',
      'Dimensión en Columnas (eje X) o Filas · medida opcional en la otra estantería (sin medida = conteo de filas).'
    ),
    'barras-apiladas': loc(
      'Like bars; a second dimension (or Color) splits and stacks the series.',
      'Igual que barras; una segunda dimensión (o Color) separa y apila las series.'
    ),
    'barras-horizontales': loc(
      'Like bars but with categories on the vertical axis: handy for long names.',
      'Igual que barras pero con el eje de categorías en vertical: útil con nombres largos.'
    ),
    linea: loc(
      'Ordinal dimension (epoch) in Columns · measure in Rows. Color draws one line per value.',
      'Dimensión ordinal (época) en Columnas · medida en Filas. Con Color se dibuja una línea por valor.'
    ),
    area: loc(
      'Like line, stacked when there is more than one series (Color or a second dimension).',
      'Como la línea, apilada cuando hay más de una serie (Color o segunda dimensión).'
    ),
    scatter: loc(
      'Two measures, one in Columns and one in Rows · optional Color splits groups or paints a gradient · Size scales the bubbles.',
      'Dos medidas, una en Columnas y otra en Filas · Color opcional separa grupos o pinta un gradiente · Tamaño escala las burbujas.'
    ),
    histograma: loc(
      'One measure in Columns or Rows: split into bins. A second measure in the other shelf sets the height.',
      'Una medida en Columnas o Filas: se reparte en intervalos. Una segunda medida en la otra estantería define la altura.'
    ),
    boxplot: loc(
      'Dimension in Columns (groups) + measure in Rows: box and whiskers from the raw values, plus optional jitter points.',
      'Dimensión en Columnas (grupos) + medida en Filas: caja y bigotes con los valores crudos, más puntos jitter opcionales.'
    ),
    pastel: loc(
      'One dimension (slices) and a measure or count (size). Sort and trim with Top N.',
      'Una dimensión (porciones) y una medida o conteo (tamaño). Ordena y recorta con «Top N».'
    ),
    donut: loc('Like pie, with a hollow centre.', 'Igual que el pastel, con el centro hueco.'),
    heatmap: loc(
      'Two dimensions (one in Columns and one in Rows) and a value: count or aggregated measure per cell.',
      'Dos dimensiones (una en Columnas y otra en Filas) y un valor: conteo o medida agregada por celda.'
    ),
    treemap: loc(
      'One or two hierarchical dimensions (Columns → Rows) and a value that sets the area.',
      'Una o dos dimensiones jerárquicas (Columnas → Filas) y un valor que define el área.'
    ),
    sunburst: loc(
      'Up to three hierarchical dimensions (Columns + Rows) and a value per sector.',
      'Hasta tres dimensiones jerárquicas (Columnas + Filas) y un valor por sector.'
    ),
    sankey: loc(
      'Two or three chained dimensions (Columns → Rows) and a value that sets the flow width.',
      'Dos o tres dimensiones encadenadas (Columnas → Filas) y un valor que define el grosor del flujo.'
    )
  };

  var MSG = {
    empty: loc('Empty configuration', 'Configuración vacía'),
    unknown: loc('Unknown chart type', 'Tipo de gráfico desconocido'),
    noDim: loc('Add a dimension (blue field) to Columns or Rows', 'Añade una dimensión (campo azul) a Columnas o Filas'),
    histMeasure: loc('The histogram needs a measure (green field)', 'El histograma necesita una medida (campo verde)'),
    scatterTwo: loc('Scatter needs two measures: one in Columns and one in Rows', 'La dispersión necesita dos medidas: una en Columnas y otra en Filas'),
    boxNeeds: loc('The box plot needs a dimension (X) and a measure (Y)', 'La caja necesita una dimensión (X) y una medida (Y)'),
    pieNeeds: loc('Add at least one dimension (blue field)', 'Añade al menos una dimensión (campo azul)'),
    heatNeeds: loc('The heatmap needs two dimensions (X and Y)', 'El mapa de calor necesita dos dimensiones (X e Y)'),
    sankeyNeeds: loc('The flow diagram needs two or three chained dimensions', 'El diagrama de flujo necesita dos o tres dimensiones encadenadas'),
    noRows: loc('No rows can be charted with this configuration', 'Ninguna fila se puede graficar con esta configuración'),
    noData: loc('No data loaded', 'No hay datos cargados'),
    emptyHint: loc(
      'Click a blue field to start, or load the default view.',
      'Haz click en un campo azul para empezar, o carga la vista por defecto.'
    ),
    loadFail: loc('Could not load the dataset', 'No se pudo cargar el conjunto de datos'),
    bigData: loc(
      'Loading the learning curves: 86,274 epochs (~20 MB). This can take a few seconds.',
      'Cargando las curvas de aprendizaje: 86.274 épocas (~20 MB). Puede tardar unos segundos.'
    ),
    storageFail: loc(
      'This browser did not allow saving charts (they will be lost on reload).',
      'Este navegador no permitió guardar los gráficos (se perderán al recargar).'
    ),
    saveInvalid: loc('Cannot save: ', 'No se puede guardar: '),
    saved: loc('Chart added to “My charts”.', 'Gráfico añadido a «Mis gráficos».'),
    restored: loc('Configuration restored.', 'Configuración restaurada.'),
    deleted: loc('Saved chart removed.', 'Gráfico guardado eliminado.'),
    cleared: loc('All saved charts removed.', 'Se eliminaron todos los gráficos guardados.'),
    clearConfirm: loc('Remove every saved chart from this browser?', '¿Eliminar todos los gráficos guardados de este navegador?'),
    copied: loc('Link copied to the clipboard.', 'Enlace copiado al portapapeles.'),
    copyFail: loc('Could not copy automatically — the link is in the address bar.', 'No se pudo copiar automáticamente — el enlace está en la barra de direcciones.'),
    png: loc('Chart downloaded as PNG.', 'Gráfico descargado como PNG.'),
    csv: loc('Aggregated CSV downloaded.', 'CSV agregado descargado.'),
    nothingExport: loc('Nothing to export yet: build a valid chart first.', 'Aún no hay nada que exportar: construye un gráfico válido primero.'),
    logOff: loc('Log axis unavailable: the chart contains zero or negative values.', 'Eje log no disponible: el gráfico contiene ceros o valores negativos.'),
    sampled: loc('Sampled to keep the browser responsive.', 'Muestreado para mantener el navegador ágil.'),
    seriesCapped: loc('Only the top 80 series are drawn.', 'Solo se dibujan las 80 series principales.'),
    nonPositive: loc('Links with a non-positive value are not drawn.', 'Los enlaces con valor no positivo no se dibujan.'),
    savedEmpty: loc(
      'No saved charts yet. Build one and press “Save chart”.',
      'Aún no hay gráficos guardados. Construye uno y pulsa «Guardar gráfico».'
    ),
    savedNoPreview: loc('Open this dataset to preview', 'Abre este conjunto para ver la vista previa'),
    invalidSaved: loc('Invalid configuration', 'Configuración no válida'),
    resetDone: loc('Default view restored.', 'Vista por defecto restaurada.'),
    noEcharts: loc('ECharts failed to load (vendor/echarts.min.js).', 'ECharts no se pudo cargar (vendor/echarts.min.js).')
  };

  /* =========================================================================
   * 2. Dataset registry (typed fields, human labels, stable ids)
   * ========================================================================= */

  function CAT(id, en, es, orden) {
    return { id: id, tipo: 'cat', label: loc(en, es), orden: orden || null };
  }
  function NUM(id, en, es) {
    return { id: id, tipo: 'num', label: loc(en, es) };
  }

  var DATASETS = {
    master: {
      id: 'master',
      file: HF_BUCKET + 'master.csv',
      count: 868,
      label: loc('Configurations', 'Configuraciones'),
      fields: [
        CAT('combo_id', 'Configuration', 'Configuración'),
        CAT('family', 'Family', 'Familia'),
        CAT('mixer_a', 'Mixer A', 'Mixer A'),
        CAT('mixer_b', 'Mixer B', 'Mixer B'),
        CAT('train_status', 'Training status', 'Estado de entrenamiento'),
        CAT('deploy_std_status', 'Deploy status (standard)', 'Estado de despliegue (estándar)'),
        CAT('export_status', 'Export status', 'Estado de exportación'),
        CAT('is_pair', 'Hybrid pair', 'Par híbrido'),

        NUM('total', 'Total parameters', 'Parámetros totales'),
        NUM('attention', 'Attention parameters', 'Parámetros de atención'),
        NUM('embeddings', 'Embedding parameters', 'Parámetros de embeddings'),
        NUM('ffn', 'FFN parameters', 'Parámetros de FFN'),
        NUM('head', 'Head parameters', 'Parámetros de cabeza'),
        NUM('norm', 'Norm parameters', 'Parámetros de normalización'),
        NUM('pos', 'Positional parameters', 'Parámetros posicionales'),
        NUM('loss_final', 'Final loss', 'Pérdida final'),
        NUM('acc_final', 'Final accuracy', 'Precisión final'),
        NUM('test_acc', 'Test accuracy', 'Precisión de test'),
        NUM('test_loss', 'Test loss', 'Pérdida de test'),
        NUM('loss_avg', 'Loss (avg)', 'Pérdida (prom.)'),
        NUM('acc_avg', 'Accuracy (avg)', 'Precisión (prom.)'),
        NUM('loss_std', 'Loss (std)', 'Pérdida (desv.)'),
        NUM('acc_std', 'Accuracy (std)', 'Precisión (desv.)'),
        NUM('step_ms_avg', 'Step time (ms, avg)', 'Tiempo por paso (ms, prom.)'),
        NUM('tok_s_avg', 'Tokens/s (avg)', 'Tokens/s (prom.)'),
        NUM('tok_s_median', 'Tokens/s (median)', 'Tokens/s (mediana)'),
        NUM('grad_avg', 'Gradient norm (avg)', 'Norma del gradiente (prom.)'),
        NUM('clip_avg', 'Clip ratio (avg)', 'Proporción de recorte (prom.)'),
        NUM('train_dur', 'Training duration (s)', 'Duración del entrenamiento (s)'),
        NUM('deploy_std_dur', 'Deploy duration, standard (s)', 'Duración de despliegue, estándar (s)'),
        NUM('deploy_q_dur', 'Deploy duration, quantized (s)', 'Duración de despliegue, cuantizado (s)'),
        NUM('eval_std_dur', 'Eval duration, standard (s)', 'Duración de evaluación, estándar (s)'),
        NUM('export_dur', 'Export duration (s)', 'Duración de exportación (s)'),
        NUM('inf_top1_std', 'Top-1 accuracy (standard)', 'Precisión top-1 (estándar)'),
        NUM('inf_top5_std', 'Top-5 hit (standard)', 'Acierto top-5 (estándar)'),
        NUM('inf_top1_q', 'Top-1 accuracy (quantized)', 'Precisión top-1 (cuantizado)'),
        NUM('inf_top5_q', 'Top-5 hit (quantized)', 'Acierto top-5 (cuantizado)'),
        NUM('quant_top5_delta', 'Top-5 delta (quant − standard)', 'Delta top-5 (cuant − estándar)'),
        NUM('deploy_speedup', 'Deploy speed-up', 'Aceleración de despliegue'),
        NUM('eval_speedup', 'Eval speed-up', 'Aceleración de evaluación'),
        NUM('n_steps', 'Training steps', 'Pasos de entrenamiento'),
        NUM('params_per_mixer', 'Params per mixer', 'Parámetros por mixer'),
        NUM('speed_score', 'Speed score', 'Puntuación de velocidad')
      ]
    },

    inference: {
      id: 'inference',
      file: HF_BUCKET + 'inference_samples.csv',
      count: 6520,
      label: loc('Inference records', 'Registros de inferencia'),
      derive: function (row) {
        row.top5_hit_num = row.top5_hit === 'True' || row.top5_hit === 'true' ? 1 : 0;
        row.first_token_match_num = row.first_token_match === 'True' || row.first_token_match === 'true' ? 1 : 0;
      },
      fields: [
        CAT('combo_id', 'Configuration', 'Configuración'),
        CAT('model_class', 'Model class', 'Clase de modelo'),
        CAT('task', 'Task', 'Tarea'),
        CAT('deploy_format', 'Deploy format', 'Formato de despliegue'),
        CAT('sample_id', 'Sample id', 'Id de muestra', function (k) { return Number(k); }),
        CAT('status', 'Status', 'Estado'),
        CAT('base', 'Base configuration', 'Configuración base'),

        NUM('metric_value', 'Metric value', 'Valor de la métrica'),
        NUM('mask_position', 'Mask position', 'Posición de la máscara'),
        NUM('token_accuracy', 'Token accuracy', 'Precisión por token'),
        NUM('top5_hit_num', 'Top-5 hit (0/1)', 'Acierto top-5 (0/1)'),
        NUM('first_token_match_num', 'First-token match (0/1)', 'Coincidencia del primer token (0/1)')
      ],
      derived: ['top5_hit_num', 'first_token_match_num']
    },

    pipeline: {
      id: 'pipeline',
      file: HF_BUCKET + 'pipeline_stages.csv',
      count: 5271,
      label: loc('Pipeline stages', 'Etapas del pipeline'),
      fields: [
        CAT('category', 'Stage', 'Etapa'),
        CAT('combo_id', 'Configuration', 'Configuración'),
        CAT('status', 'Status', 'Estado'),
        CAT('family', 'Family', 'Familia'),
        CAT('base', 'Base configuration', 'Configuración base'),

        NUM('duration_sec', 'Duration (s)', 'Duración (s)'),
        NUM('returncode', 'Return code', 'Código de retorno'),
        NUM('test_accuracy', 'Test accuracy', 'Precisión de test'),
        NUM('test_loss', 'Test loss', 'Pérdida de test')
      ]
    },

    epochs: {
      id: 'epochs',
      file: HF_BUCKET + 'training_per_epoch.csv',
      count: 86274,
      label: loc('Learning curves', 'Curvas de aprendizaje'),
      fields: [
        CAT('combo_id', 'Configuration', 'Configuración'),
        CAT('epoch', 'Epoch', 'Época', function (k) { return Number(k); }),

        NUM('loss', 'Loss', 'Pérdida'),
        NUM('accuracy', 'Accuracy', 'Precisión'),
        NUM('learning_rate', 'Learning rate', 'Tasa de aprendizaje'),
        NUM('grad_norm', 'Gradient norm', 'Norma del gradiente'),
        NUM('grad_norm_attention', 'Gradient norm · attention', 'Norma del gradiente · atención'),
        NUM('grad_norm_ffn', 'Gradient norm · FFN', 'Norma del gradiente · FFN'),
        NUM('grad_norm_embeddings', 'Gradient norm · embeddings', 'Norma del gradiente · embeddings'),
        NUM('grad_norm_head', 'Gradient norm · head', 'Norma del gradiente · cabeza'),
        NUM('grad_norm_norm', 'Gradient norm · norms', 'Norma del gradiente · normas'),
        NUM('grad_norm_pos', 'Gradient norm · positional', 'Norma del gradiente · posicional'),
        NUM('step_time_ms', 'Step time (ms)', 'Tiempo por paso (ms)'),
        NUM('tokens_per_sec', 'Tokens/s', 'Tokens/s'),
        NUM('clip_ratio', 'Clip ratio', 'Proporción de recorte')
      ]
    }
  };
  var DATASET_IDS = ['master', 'inference', 'pipeline', 'epochs'];

  /* =========================================================================
   * 3. CSV parser (quoted fields, embedded commas/quotes/newlines)
   * ========================================================================= */

  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = '';
    var i = 0;
    var n = text.length;
    var inQuotes = false;
    if (text.charCodeAt(0) === 0xfeff) i = 1;

    while (i < n) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i += 1; continue;
        }
        field += c; i += 1; continue;
      }
      if (c === '"') { inQuotes = true; i += 1; continue; }
      if (c === ',') { row.push(field); field = ''; i += 1; continue; }
      if (c === '\r') { i += 1; continue; }
      if (c === '\n') {
        row.push(field); rows.push(row);
        row = []; field = ''; i += 1; continue;
      }
      field += c; i += 1;
    }
    if (field.length || row.length) {
      row.push(field); rows.push(row);
    }
    return rows;
  }

  /* =========================================================================
   * 4. Config model (identical shape to bi.js)
   * ========================================================================= */

  function baseConfig() {
    return {
      titulo: '',
      tipo: 'barras',
      columnas: [],
      filas: [],
      color: null,
      tamano: null,
      agregacion: 'conteo',
      orden: 'auto',
      topN: 0,
      bins: 20,
      ejeLog: false,
      etiquetas: false,
      puntos: true
    };
  }

  function defaultConfig(dsId) {
    var c = baseConfig();
    if (dsId === 'inference') {
      c.tipo = 'barras';
      c.columnas = [{ campo: 'task' }];
    } else if (dsId === 'pipeline') {
      c.tipo = 'barras';
      c.columnas = [{ campo: 'category' }];
    } else if (dsId === 'epochs') {
      c.tipo = 'linea';
      c.columnas = [{ campo: 'epoch' }];
      c.filas = [{ campo: 'loss' }];
      c.agregacion = 'promedio';
      c.topN = 0;
    } else {
      c.tipo = 'barras';
      c.columnas = [{ campo: 'family' }];
    }
    return c;
  }

  function idsOf(list) {
    if (!Array.isArray(list)) return [];
    return list.map(function (p) {
      return typeof p === 'string' ? p : (p && p.campo);
    }).filter(Boolean);
  }

  function dimsOf(config, data) {
    return idsOf(config.columnas).concat(idsOf(config.filas))
      .map(function (id) { return data.byId[id]; })
      .filter(function (f) { return f && f.tipo === 'cat'; });
  }
  function measuresOf(config, data) {
    return idsOf(config.columnas).concat(idsOf(config.filas))
      .map(function (id) { return data.byId[id]; })
      .filter(function (f) { return f && f.tipo === 'num'; });
  }

  function validateBI(config, data) {
    if (!config || typeof config !== 'object') return MSG.empty;
    var dims = dimsOf(config, data);
    var meds = measuresOf(config, data);
    switch (config.tipo) {
      case 'barras':
      case 'barras-apiladas':
      case 'barras-horizontales':
      case 'linea':
      case 'area':
        return dims.length ? null : MSG.noDim;
      case 'histograma':
        return meds.length ? null : MSG.histMeasure;
      case 'scatter':
        return meds.length >= 2 ? null : MSG.scatterTwo;
      case 'boxplot':
        return dims.length && meds.length ? null : MSG.boxNeeds;
      case 'pastel':
      case 'donut':
      case 'treemap':
      case 'sunburst':
        return dims.length ? null : MSG.pieNeeds;
      case 'heatmap':
        return dims.length >= 2 ? null : MSG.heatNeeds;
      case 'sankey':
        return dims.length >= 2 ? null : MSG.sankeyNeeds;
      default:
        return MSG.unknown;
    }
  }

  function compatibility(config, data) {
    var out = {};
    TYPES.forEach(function (t) {
      var probe = clone(config);
      probe.tipo = t.id;
      out[t.id] = validateBI(probe, data);
    });
    return out;
  }

  function valueLabel(config, med) {
    if (!med || config.agregacion === 'conteo') return L(loc('count of rows', 'conteo de filas'));
    return L(AGG_LABELS[config.agregacion] || config.agregacion) + ' · ' + L(med.label);
  }

  function describeConfig(config, data) {
    var tipo = typeById(config.tipo);
    var dims = dimsOf(config, data).map(function (f) { return L(f.label); });
    var meds = measuresOf(config, data);
    var valor = (!meds.length || config.agregacion === 'conteo')
      ? L(loc('count', 'conteo'))
      : L(AGG_LABELS[config.agregacion] || config.agregacion) + ' · ' + L(meds[0].label);
    return [tipo ? L(tipo.label) : config.tipo, dims.join(' × ') || L(loc('no dimension', 'sin dimensión')), valor].join(' · ');
  }

  function configCompatible(config, data) {
    if (!config) return false;
    var ids = idsOf(config.columnas).concat(idsOf(config.filas))
      .concat(config.color ? [config.color.campo] : [])
      .concat(config.tamano ? [config.tamano.campo] : []);
    for (var i = 0; i < ids.length; i++) if (!data.byId[ids[i]]) return false;
    return TYPE_IDS.indexOf(config.tipo) >= 0;
  }

  function sanitizeConfig(raw, data) {
    var out = baseConfig();
    if (raw && typeof raw === 'object') {
      Object.keys(out).forEach(function (k) { if (k in raw) out[k] = raw[k]; });
    }
    out.titulo = typeof out.titulo === 'string' ? out.titulo : '';
    if (TYPE_IDS.indexOf(out.tipo) < 0) out.tipo = 'barras';
    function keep(list) {
      return idsOf(list).filter(function (id) { return data.byId[id]; }).slice(0, 2)
        .map(function (campo) { return { campo: campo }; });
    }
    function keep1(p) {
      return p && p.campo && data.byId[p.campo] ? { campo: p.campo } : null;
    }
    out.columnas = keep(out.columnas);
    out.filas = keep(out.filas);
    out.color = keep1(out.color);
    out.tamano = keep1(out.tamano);
    if (AGG_IDS.indexOf(out.agregacion) < 0) out.agregacion = 'conteo';
    if (SORT_IDS.indexOf(out.orden) < 0) out.orden = 'auto';
    out.topN = Math.max(0, Math.round(Number(out.topN) || 0));
    out.bins = clampInt(out.bins, 5, 50, 20);
    out.ejeLog = !!out.ejeLog;
    out.etiquetas = !!out.etiquetas;
    out.puntos = !!out.puntos;
    return out;
  }

  /* =========================================================================
   * 5. Aggregation helpers
   * ========================================================================= */

  function newGroup() { return { n: 0, vals: [], cache: null }; }
  function accumulate(g, v) {
    g.n += 1;
    if (v != null && Number.isFinite(v)) g.vals.push(v);
  }
  function quantile(sorted, q) {
    if (!sorted.length) return null;
    var pos = (sorted.length - 1) * q;
    var b = Math.floor(pos);
    var r = pos - b;
    var v = sorted[b + 1] !== undefined
      ? sorted[b] + r * (sorted[b + 1] - sorted[b])
      : sorted[b];
    return round4(v);
  }
  function boxOf(vals) {
    if (!vals || !vals.length) return null;
    var o = vals.slice().sort(function (a, b) { return a - b; });
    return [quantile(o, 0), quantile(o, 0.25), quantile(o, 0.5), quantile(o, 0.75), quantile(o, 1)];
  }
  function aggValue(g, agg) {
    if (!g) return 0;
    if (agg === 'conteo') return g.n;
    if (!g.vals.length) return 0;
    if (g.cache && g.cache[agg] != null) return g.cache[agg];
    var i, sum = 0, v;
    if (agg === 'suma') {
      for (i = 0; i < g.vals.length; i++) sum += g.vals[i];
      v = round4(sum);
    } else if (agg === 'promedio') {
      for (i = 0; i < g.vals.length; i++) sum += g.vals[i];
      v = round4(sum / g.vals.length);
    } else if (agg === 'mediana') {
      v = quantile(g.vals.slice().sort(function (a, b) { return a - b; }), 0.5);
    } else if (agg === 'min') {
      v = Math.min.apply(null, g.vals);
    } else if (agg === 'max') {
      v = Math.max.apply(null, g.vals);
    } else {
      v = g.n;
    }
    g.cache = g.cache || {};
    g.cache[agg] = v;
    return v;
  }

  function sortKeys(keys, field, valueOfKey, order, topN) {
    var list = keys.slice();
    var total = function (k) { var v = valueOfKey(k); return v == null ? 0 : v; };
    if (topN > 0 && list.length > topN) {
      list.sort(function (a, b) { return total(b) - total(a); });
      list = list.slice(0, topN);
    }
    var mode = order === 'auto' ? (field && field.orden ? 'natural' : 'valor') : order;
    if (mode === 'natural') {
      if (field && field.orden) {
        return list.sort(function (a, b) {
          var oa = field.orden(a), ob = field.orden(b);
          if (oa == null || Number.isNaN(oa)) return 1;
          if (ob == null || Number.isNaN(ob)) return -1;
          return oa - ob;
        });
      }
      mode = 'alfabetico';
    }
    if (mode === 'alfabetico') {
      return list.sort(function (a, b) { return String(a).localeCompare(String(b), locale()); });
    }
    if (mode === 'valor-asc') return list.sort(function (a, b) { return total(a) - total(b); });
    return list.sort(function (a, b) { return total(b) - total(a); });
  }

  function sampleRows(rows, cap) {
    if (rows.length <= cap) return { rows: rows, sampled: false, total: rows.length };
    var out = [];
    var stride = rows.length / cap;
    for (var i = 0; i < cap; i++) out.push(rows[Math.floor(i * stride)]);
    return { rows: out, sampled: true, total: rows.length, kept: out.length };
  }

  function valueOf(field, row) {
    if (!field) return null;
    var v = row[field.id];
    if (field.tipo === 'num') return (typeof v === 'number' && Number.isFinite(v)) ? v : null;
    if (v == null) return null;
    var s = String(v).trim();
    return s === '' ? null : s;
  }

  /* =========================================================================
   * 6. Theme
   * ========================================================================= */

  function themeOf() {
    if (themeName() === 'light') {
      return {
        light: true,
        bg: '#ffffff',
        text: '#1f2328',
        muted: '#59636e',
        border: '#d0d7de',
        borderSoft: '#e7ebf0',
        tooltipBg: '#ffffff',
        palette: ['#0969da', '#1a7f37', '#bc4c00', '#bf3989', '#8250df', '#1b7c83',
          '#cf222e', '#4d7c0f', '#9a6700', '#0550ae', '#953800', '#116329', '#6e7781'],
        accent: '#0969da',
        heat: ['#eef4ff', '#9db9f7', '#1d4ed8', '#0550ae']
      };
    }
    return {
      light: false,
      bg: '#161b22',
      text: '#d6deea',
      muted: '#8b949e',
      border: '#30363d',
      borderSoft: '#232a33',
      tooltipBg: '#1c232c',
      palette: ['#58a6ff', '#3fb950', '#ffa657', '#f778ba', '#d2a8ff', '#39c5cf',
        '#ff7b72', '#7ee787', '#e3b341', '#a5d6ff', '#ff9bce', '#56d364', '#bc8cff'],
      accent: '#58a6ff',
      heat: ['#0b1a2e', '#1f4f7a', '#58a6ff', '#a5d6ff']
    };
  }

  function tooltipBase(th) {
    return {
      backgroundColor: th.tooltipBg,
      borderColor: th.border,
      borderWidth: 1,
      padding: [7, 10],
      textStyle: { color: th.text, fontSize: 12, fontFamily: FONT },
      extraCssText: 'box-shadow:0 8px 24px rgba(0,0,0,.35);border-radius:8px;'
    };
  }
  function legendOf(th, n, hasTitle) {
    if (n <= 1) return undefined;
    return {
      top: hasTitle ? 26 : 0,
      type: 'scroll',
      textStyle: { color: th.muted, fontSize: 11 },
      pageIconColor: th.accent,
      pageTextStyle: { color: th.muted }
    };
  }
  function titleOf(config, th) {
    if (!config.titulo) return undefined;
    return {
      text: config.titulo,
      left: 'center',
      top: 5,
      textStyle: { color: th.text, fontSize: 14, fontWeight: 600, fontFamily: FONT }
    };
  }
  function gridOf(hasTitle, hasLegend) {
    return {
      left: 14,
      right: 22,
      top: hasTitle ? 58 : (hasLegend ? 42 : 32),
      bottom: 8,
      containLabel: true
    };
  }
  function catAxis(data, th, extra) {
    var opts = extra ? Object.assign({}, extra) : {};
    var rotate = typeof opts.rotate === 'number' ? opts.rotate : 45;
    delete opts.rotate;
    var showAll = !!opts.showAllLabels;
    delete opts.showAllLabels;
    var n = data ? data.length : 0;
    var interval = 'auto';
    if (showAll) interval = 0;
    else if (n > 24) interval = Math.max(0, Math.ceil(n / 20) - 1);
    var o = {
      type: 'category',
      data: data,
      axisLabel: {
        rotate: rotate,
        interval: interval,
        fontSize: 10.5,
        color: th.muted,
        hideOverlap: true,
        fontFamily: FONT
      },
      axisTick: { alignWithLabel: true, lineStyle: { color: th.border } },
      axisLine: { lineStyle: { color: th.border } },
      splitLine: { show: false }
    };
    if (rotate) {
      o.axisLabel.width = 150;
      o.axisLabel.overflow = 'truncate';
    }
    Object.keys(opts).forEach(function (k) { o[k] = opts[k]; });
    return o;
  }

  /** Small caption used instead of a centred axis name (which collides with
   *  rotated tick labels and double-counts the bottom margin). */
  function axisCaption(text, th) {
    return {
      type: 'text',
      left: 14,
      bottom: 2,
      silent: true,
      style: { text: text, fill: th.muted, fontSize: 10.5, fontFamily: FONT }
    };
  }
  function valAxis(name, th, log, extra) {
    var o = {
      type: log ? 'log' : 'value',
      name: name || '',
      nameTextStyle: { color: th.muted, fontSize: 10.5, fontFamily: FONT, align: 'left' },
      nameGap: 14,
      axisLabel: { color: th.muted, fontSize: 10.5, fontFamily: FONT, formatter: fmtTick },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: th.borderSoft, type: 'dashed' } }
    };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  function logPossibleFor(series) {
    for (var s = 0; s < series.length; s++) {
      var d = series[s].data || [];
      for (var i = 0; i < d.length; i++) {
        var v = typeof d[i] === 'number' ? d[i] : (Array.isArray(d[i]) ? d[i][d[i].length - 1] : null);
        if (v == null || !Number.isFinite(v) || v <= 0) return false;
      }
    }
    return true;
  }

  /* =========================================================================
   * 7. Chart recipes (ported from bi.js)
   * ========================================================================= */

  function table(headers, rows, name) {
    return { headers: headers, rows: rows, name: name || 'chart' };
  }

  /* --- bars / stacked / horizontal / line / area ------------------------- */
  function recipeCategorical(config, rows, data, th, opts) {
    opts = opts || {};
    var dims = dimsOf(config, data);
    var med = measuresOf(config, data)[0] || null;
    var dimX = dims[0];
    var colorDef = config.color ? data.byId[config.color.campo] : null;
    var dimSerie = dims[1] || (colorDef && colorDef.tipo === 'cat' ? colorDef : null);
    if (dimSerie && dimX && dimSerie.id === dimX.id) dimSerie = null;

    var grupos = new Map();
    var f, kx, ks, i;
    for (i = 0; i < rows.length; i++) {
      f = rows[i];
      kx = valueOf(dimX, f);
      if (kx == null) continue;
      ks = dimSerie ? valueOf(dimSerie, f) : '·';
      if (dimSerie && ks == null) continue;
      if (!grupos.has(kx)) grupos.set(kx, new Map());
      var m = grupos.get(kx);
      if (!m.has(ks)) m.set(ks, newGroup());
      accumulate(m.get(ks), med ? valueOf(med, f) : null);
    }
    if (!grupos.size) return null;

    var agg = config.agregacion;
    var totalKey = function (k) {
      var s = 0;
      var it = grupos.get(k);
      if (!it) return 0;
      it.forEach(function (g) { s += aggValue(g, agg) || 0; });
      return s;
    };
    var keys = sortKeys(Array.from(grupos.keys()), dimX, totalKey, config.orden, config.topN);
    var seriesKeys = ['·'];
    var cappedSeries = false;
    if (dimSerie) {
      var set = new Set();
      keys.forEach(function (k) {
        grupos.get(k).forEach(function (_v, s) { set.add(s); });
      });
      var totalSeries = function (k) {
        var s = 0;
        keys.forEach(function (kx) {
          var m = grupos.get(kx);
          s += m && m.has(k) ? (aggValue(m.get(k), agg) || 0) : 0;
        });
        return s;
      };
      seriesKeys = sortKeys(Array.from(set), dimSerie, totalSeries, 'auto', 0);
      if (seriesKeys.length > MAX_SERIES) {
        seriesKeys = seriesKeys.slice(0, MAX_SERIES);
        cappedSeries = true;
      }
    }

    var stacked = !!opts.apilado || (config.tipo === 'area' && seriesKeys.length > 1);
    var series = seriesKeys.map(function (ks2, idx) {
      var datos = keys.map(function (kx2) {
        var m = grupos.get(kx2);
        return m && m.has(ks2) ? (aggValue(m.get(ks2), agg) || 0) : 0;
      });
      var single = seriesKeys.length <= 1;
      return {
        name: dimSerie ? String(ks2) : valueLabel(config, med),
        type: opts.serie || 'bar',
        data: datos,
        stack: stacked ? 'total' : undefined,
        smooth: false,
        symbol: opts.serie === 'line' ? 'circle' : undefined,
        symbolSize: opts.serie === 'line' ? 4 : undefined,
        showSymbol: opts.serie === 'line' ? keys.length <= 60 : undefined,
        lineStyle: opts.serie === 'line' ? { width: 2.1 } : undefined,
        areaStyle: opts.serie === 'line' && config.tipo === 'area' ? { opacity: 0.28 } : undefined,
        itemStyle: {
          color: single ? th.accent : th.palette[idx % th.palette.length],
          borderRadius: opts.serie === 'bar' && !stacked ? [3, 3, 0, 0] : 0
        },
        barMaxWidth: 34,
        label: {
          show: !!config.etiquetas,
          position: opts.horizontal ? 'right' : (opts.serie === 'line' ? 'top' : 'top'),
          fontSize: 9.5,
          color: th.text,
          formatter: function (p) { return fmtNum(p.value); }
        },
        emphasis: { focus: 'series' }
      };
    });

    var categorias = keys.map(String);
    var logPossible = logPossibleFor(series);
    var useLog = !!config.ejeLog && logPossible;
    var valueAxis = valAxis(valueLabel(config, med), th, useLog);
    var xRotate = 45;

    var option = {
      color: th.palette,
      title: titleOf(config, th),
      tooltip: (function () {
        var t = tooltipBase(th);
        t.trigger = 'axis';
        t.axisPointer = { type: 'shadow' };
        t.confine = true;
        t.formatter = function (params) {
          var list = Array.isArray(params) ? params : [params];
          if (!list.length) return '';
          var total = list.reduce(function (s, p) { return s + (typeof p.value === 'number' ? p.value : 0); }, 0);
          var head = '<b>' + esc(list[0].axisValueLabel != null ? list[0].axisValueLabel : list[0].name) + '</b>';
          var body = list.map(function (p) {
            var v = typeof p.value === 'number' ? p.value : 0;
            var pct = stacked && total > 0 ? ' (' + Math.round((v / total) * 100) + ' %)' : '';
            return (p.marker || '') + ' ' + esc(p.seriesName) + ': <b>' + fmtNum(v) + '</b>' + pct;
          });
          return [head].concat(body).join('<br/>');
        };
        return t;
      })(),
      legend: legendOf(th, series.length, !!config.titulo),
      graphic: opts.horizontal ? undefined : [axisCaption(L(dimX.label), th)],
      grid: Object.assign(gridOf(!!config.titulo, series.length > 1),
        { bottom: opts.horizontal ? 8 : 24 }),
      xAxis: opts.horizontal
        ? valAxis(valueLabel(config, med), th, useLog)
        : catAxis(categorias, th, { rotate: xRotate }),
      yAxis: opts.horizontal
        ? catAxis(categorias, th, { inverse: true, rotate: 0, name: L(dimX.label), nameTextStyle: { color: th.muted, fontSize: 10.5 } })
        : valAxis(valueLabel(config, med), th, useLog),
      series: series
    };
    if (opts.horizontal) {
      option.xAxis = valueAxis;
    }

    var headers = [L(dimX.label), dimSerie ? L(dimSerie.label) : L(loc('series', 'serie')), valueLabel(config, med)];
    var trows = [];
    keys.forEach(function (kx3) {
      seriesKeys.forEach(function (ks3) {
        var m = grupos.get(kx3);
        var v = m && m.has(ks3) ? (aggValue(m.get(ks3), agg) || 0) : 0;
        trows.push([String(kx3), dimSerie ? String(ks3) : '—', v]);
      });
    });

    var nCats = keys.length;
    var enNote = numstr(rows.length, 'en-US') + ' rows → ' + numstr(nCats, 'en-US') + ' categories' +
      (dimSerie ? ' × ' + numstr(series.length, 'en-US') + ' series' : '');
    var esNote = numstr(rows.length, 'es-CL') + ' filas → ' + numstr(nCats, 'es-CL') + ' categorías' +
      (dimSerie ? ' × ' + numstr(series.length, 'es-CL') + ' series' : '');

    return {
      option: option,
      table: table(headers, trows, config.tipo),
      meta: {
        note: loc(enNote, esNote),
        warn: cappedSeries ? MSG.seriesCapped : null,
        logPossible: logPossible,
        groups: nCats
      }
    };
  }

  /* --- histogram --------------------------------------------------------- */
  function recipeHistogram(config, rows, data, th) {
    var meds = measuresOf(config, data);
    var medida = meds[0];
    var medY = meds[1] || null;
    var valores = [];
    var i, f, v;
    for (i = 0; i < rows.length; i++) {
      f = rows[i];
      v = valueOf(medida, f);
      if (v != null && Number.isFinite(v)) valores.push({ v: v, fila: f });
    }
    if (valores.length < 2) return null;

    var min = Infinity, max = -Infinity;
    for (i = 0; i < valores.length; i++) {
      if (valores[i].v < min) min = valores[i].v;
      if (valores[i].v > max) max = valores[i].v;
    }
    if (min === max) min -= 0.5;
    var nBins = clampInt(config.bins, 5, 50, 20);
    var width = (max - min) / nBins || 1;
    var bins = [];
    for (i = 0; i < nBins; i++) bins.push(newGroup());
    for (i = 0; i < valores.length; i++) {
      var idx = Math.min(nBins - 1, Math.max(0, Math.floor((valores[i].v - min) / width)));
      accumulate(bins[idx], medY ? valueOf(medY, valores[i].fila) : null);
    }

    var labels = [];
    for (i = 0; i < nBins; i++) {
      labels.push(fmtTick(min + i * width) + '–' + fmtTick(min + (i + 1) * width));
    }
    var useCount = !medY || config.agregacion === 'conteo';
    var datos = bins.map(function (g) { return useCount ? g.n : (aggValue(g, config.agregacion) || 0); });
    var nameY = useCount ? L(loc('rows', 'filas')) : valueLabel(config, medY);
    var nameX = L(medida.label);
    var logPossible = datos.every(function (d) { return Number.isFinite(d) && d > 0; });
    var useLog = !!config.ejeLog && logPossible;

    var option = {
      title: titleOf(config, th),
      tooltip: (function () {
        var t = tooltipBase(th);
        t.trigger = 'axis';
        t.confine = true;
        t.formatter = function (params) {
          var p = Array.isArray(params) ? params[0] : params;
          var k = p && p.dataIndex != null ? p.dataIndex : 0;
          var g = bins[k] || { n: 0 };
          return '<b>' + esc(labels[k]) + '</b> ' + esc(nameX) + '<br/>' +
            esc(nameY) + ': <b>' + fmtNum(datos[k]) + '</b> · ' +
            fmtInt(g.n) + ' ' + L(loc('row(s)', 'fila(s)'));
        };
        return t;
      })(),
      grid: Object.assign(gridOf(!!config.titulo, false), { bottom: 24 }),
      graphic: [axisCaption(nameX + ' (' + nBins + ' bins)', th)],
      xAxis: catAxis(labels, th, { rotate: 55 }),
      yAxis: valAxis(nameY, th, useLog, { minInterval: useCount ? 1 : null }),
      series: [{
        type: 'bar',
        name: nameY,
        data: datos,
        barMaxWidth: 40,
        itemStyle: { color: th.accent, borderRadius: [3, 3, 0, 0] },
        label: {
          show: !!config.etiquetas,
          position: 'top',
          fontSize: 9.5,
          color: th.text,
          formatter: function (p) { return fmtNum(p.value); }
        }
      }]
    };

    var headers = [nameX, L(loc('bin start', 'inicio del intervalo')), L(loc('bin end', 'fin del intervalo')), nameY];
    var trows = labels.map(function (lab, k) {
      return [lab, round4(min + k * width), round4(min + (k + 1) * width), datos[k]];
    });
    var enNote = numstr(valores.length, 'en-US') + ' values · ' + nBins + ' bins';
    var esNote = numstr(valores.length, 'es-CL') + ' valores · ' + nBins + ' intervalos';
    return {
      option: option,
      table: table(headers, trows, 'histogram'),
      meta: { note: loc(enNote, esNote), logPossible: logPossible, warn: null, groups: nBins }
    };
  }

  /* --- scatter ----------------------------------------------------------- */
  function recipeScatter(config, rows, data, th) {
    var meds = measuresOf(config, data);
    var medX = meds[0];
    var medY = meds[1];
    var colorDef = config.color ? data.byId[config.color.campo] : null;
    var tamDef = config.tamano ? data.byId[config.tamano.campo] : null;
    var tamMed = tamDef && tamDef.tipo === 'num' ? tamDef : null;

    var sample = sampleRows(rows, MAX_SCATTER_POINTS);
    var puntos = [];
    var i, f, x, y;
    for (i = 0; i < sample.rows.length; i++) {
      f = sample.rows[i];
      x = valueOf(medX, f);
      y = valueOf(medY, f);
      if (x == null || y == null) continue;
      puntos.push({
        x: x,
        y: y,
        tam: tamMed ? valueOf(tamMed, f) : null,
        colorVal: colorDef && colorDef.tipo === 'num' ? valueOf(colorDef, f) : null,
        grupo: colorDef && colorDef.tipo === 'cat' ? valueOf(colorDef, f) : null,
        id: f.combo_id || f.sample_id || ''
      });
    }
    if (!puntos.length) return null;

    var tamMax = 0;
    if (tamMed) for (i = 0; i < puntos.length; i++) tamMax = Math.max(tamMax, puntos[i].tam == null ? 0 : puntos[i].tam);
    function sizeOf(p) {
      if (!tamMed || p.tam == null || tamMax <= 0) return 7;
      return 5 + Math.sqrt(Math.max(0, p.tam) / tamMax) * 24;
    }
    function tip(p) {
      var d = p.data && p.data.meta;
      if (!d) return '';
      var extra = (tamMed && d.tam != null) ? ' · ' + esc(L(tamMed.label)) + ': ' + fmtNum(d.tam) : '';
      return (d.id ? '<b>' + esc(d.id) + '</b><br/>' : '') +
        esc(L(medX.label)) + ': ' + fmtNum(d.x) + ' · ' +
        esc(L(medY.label)) + ': ' + fmtNum(d.y) + extra +
        (d.colorVal != null && colorDef ? '<br/>' + esc(L(colorDef.label)) + ': ' + fmtNum(d.colorVal) : '');
    }

    var series, visualMap;
    if (colorDef && colorDef.tipo === 'cat') {
      var grupos = new Map();
      for (i = 0; i < puntos.length; i++) {
        var k = puntos[i].grupo == null ? '—' : puntos[i].grupo;
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(puntos[i]);
      }
      var claves = sortKeys(Array.from(grupos.keys()), colorDef,
        function (kk) { return grupos.get(kk).length; }, 'auto', 0);
      if (claves.length > MAX_SERIES) claves = claves.slice(0, MAX_SERIES);
      series = claves.map(function (kk, idx) {
        return {
          name: String(kk),
          type: 'scatter',
          data: grupos.get(kk).map(function (p) {
            return {
              value: [p.x, p.y],
              symbolSize: sizeOf(p),
              meta: { x: p.x, y: p.y, tam: p.tam, colorVal: p.colorVal, id: p.id }
            };
          }),
          itemStyle: { color: th.palette[idx % th.palette.length], opacity: 0.68 }
        };
      });
    } else {
      var valsColor = puntos.map(function (p) { return p.colorVal; }).filter(function (v2) { return v2 != null; });
      series = [{
        name: L(medY.label),
        type: 'scatter',
        data: puntos.map(function (p) {
          return {
            value: [p.x, p.y, p.colorVal],
            symbolSize: sizeOf(p),
            meta: { x: p.x, y: p.y, tam: p.tam, colorVal: p.colorVal, id: p.id }
          };
        }),
        itemStyle: { opacity: 0.72, color: th.accent }
      }];
      if (colorDef && valsColor.length) {
        visualMap = {
          dimension: 2,
          min: Math.min.apply(null, valsColor),
          max: Math.max.apply(null, valsColor),
          calculable: true,
          orient: 'horizontal',
          left: 'center',
          bottom: 0,
          text: [L(colorDef.label), ''],
          textStyle: { color: th.muted, fontSize: 10.5 },
          inRange: { color: th.light ? ['#dbeafe', '#60a5fa', '#1d4ed8', '#1e3a8a'] : ['#0b1a2e', '#1f6feb', '#58a6ff', '#c9e2ff'] }
        };
      }
    }

    var n = puntos.length;
    var enNote = numstr(n, 'en-US') + ' points · ' + esc(L(medX.label)) + ' vs ' + esc(L(medY.label));
    var esNote = numstr(n, 'es-CL') + ' puntos · ' + esc(L(medX.label)) + ' vs ' + esc(L(medY.label));
    var warn = sample.sampled
      ? loc(
        MSG.sampled.en + ' (' + numstr(sample.kept, 'en-US') + ' of ' + numstr(sample.total, 'en-US') + ' rows)',
        MSG.sampled.es + ' (' + numstr(sample.kept, 'es-CL') + ' de ' + numstr(sample.total, 'es-CL') + ' filas)'
      )
      : null;

    var option = {
      color: th.palette,
      title: titleOf(config, th),
      tooltip: (function () { var t = tooltipBase(th); t.trigger = 'item'; t.confine = true; t.formatter = tip; return t; })(),
      legend: legendOf(th, series.length, !!config.titulo),
      grid: gridOf(!!config.titulo, series.length > 1),
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
        { type: 'inside', yAxisIndex: 0, filterMode: 'none' }
      ],
      visualMap: visualMap,
      xAxis: {
        type: 'value',
        name: L(medX.label),
        nameLocation: 'middle',
        nameGap: 26,
        nameTextStyle: { color: th.muted, fontSize: 10.5 },
        axisLabel: { color: th.muted, fontSize: 10.5, formatter: fmtTick },
        axisLine: { lineStyle: { color: th.border } },
        splitLine: { lineStyle: { color: th.borderSoft, type: 'dashed' } },
        scale: true
      },
      yAxis: {
        type: 'value',
        name: L(medY.label),
        nameTextStyle: { color: th.muted, fontSize: 10.5 },
        axisLabel: { color: th.muted, fontSize: 10.5, formatter: fmtTick },
        axisLine: { lineStyle: { color: th.border } },
        splitLine: { lineStyle: { color: th.borderSoft, type: 'dashed' } },
        scale: true
      },
      series: series
    };

    var headers = [L(medX.label), L(medY.label)];
    if (colorDef) headers.push(L(colorDef.label));
    if (tamMed) headers.push(L(tamMed.label));
    var trows = puntos.map(function (p) {
      var r = [p.x, p.y];
      if (colorDef) r.push(p.colorVal != null ? p.colorVal : (p.grupo != null ? p.grupo : ''));
      if (tamMed) r.push(p.tam);
      return r;
    });
    return {
      option: option,
      table: table(headers, trows, 'scatter'),
      meta: { note: loc(enNote, esNote), warn: warn, logPossible: null, groups: n }
    };
  }

  /* --- boxplot ----------------------------------------------------------- */
  var frac = function (x) { return x - Math.floor(x); };
  var jitter = function (i) { return frac(Math.sin((i + 1) * 12.9898) * 43758.5453) - 0.5; };

  function recipeBoxplot(config, rows, data, th) {
    var dim = dimsOf(config, data)[0];
    var med = measuresOf(config, data)[0];
    var grupos = new Map();
    var i, f, k, v;
    for (i = 0; i < rows.length; i++) {
      f = rows[i];
      k = valueOf(dim, f);
      v = valueOf(med, f);
      if (k == null || v == null || !Number.isFinite(v)) continue;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(v);
    }
    if (!grupos.size) return null;

    var medianOf = function (vals) {
      return quantile(vals.slice().sort(function (a, b) { return a - b; }), 0.5);
    };
    var claves = sortKeys(Array.from(grupos.keys()), dim,
      function (kk) { return medianOf(grupos.get(kk)) || 0; },
      config.orden === 'auto' ? 'valor' : config.orden, config.topN);

    var entradas = claves.map(function (kk) {
      var vals = grupos.get(kk).filter(function (x) { return Number.isFinite(x); });
      return { k: String(kk), vals: vals, caja: boxOf(vals), n: vals.length };
    }).filter(function (e) { return e.caja && e.caja.every(function (x) { return x != null; }); });
    if (!entradas.length) return null;

    var perGroupCap = Math.max(1, Math.floor(MAX_BOX_JITTER / Math.max(1, entradas.length)));
    var sampledJitter = false;
    var boxData = entradas.map(function (e) { return e.caja; });
    var series = [{
      type: 'boxplot',
      name: L(med.label),
      data: boxData,
      boxWidth: ['18%', '46%'],
      itemStyle: { color: th.light ? '#e8eefc' : '#182b45', borderColor: th.accent, borderWidth: 1.2 },
      emphasis: { itemStyle: { borderColor: th.accent, shadowBlur: 5, shadowColor: 'rgba(0,0,0,.3)' } }
    }];

    if (config.puntos) {
      var puntos = [];
      var j = 0;
      entradas.forEach(function (e, idx) {
        var vals = e.vals;
        var stride = vals.length > perGroupCap ? vals.length / perGroupCap : 1;
        if (stride > 1) sampledJitter = true;
        var count = Math.min(vals.length, perGroupCap);
        for (var q = 0; q < count; q++) {
          var vv = stride > 1 ? vals[Math.floor(q * stride)] : vals[q];
          puntos.push([idx + jitter(j++) * 0.34, vv]);
        }
      });
      if (puntos.length) {
        series.unshift({
          type: 'scatter',
          data: puntos,
          symbolSize: 3,
          silent: true,
          tooltip: { show: false },
          itemStyle: { color: th.accent, opacity: 0.24 },
          z: 1
        });
      }
    }

    var option = {
      title: titleOf(config, th),
      tooltip: (function () {
        var t = tooltipBase(th);
        t.trigger = 'item';
        t.confine = true;
        t.formatter = function (p) {
          var e = entradas[p.dataIndex];
          if (!e) return '';
          return '<b>' + esc(e.k) + '</b> · n=' + fmtInt(e.n) + '<br/>' +
            L(loc('min', 'mín')) + ' ' + fmtNum(e.caja[0]) + ' · Q1 ' + fmtNum(e.caja[1]) +
            ' · ' + L(loc('median', 'mediana')) + ' ' + fmtNum(e.caja[2]) + '<br/>Q3 ' +
            fmtNum(e.caja[3]) + ' · ' + L(loc('max', 'máx')) + ' ' + fmtNum(e.caja[4]) + ' ' + esc(L(med.label));
        };
        return t;
      })(),
      grid: gridOf(!!config.titulo, false),
      xAxis: catAxis(entradas.map(function (e) { return e.k; }), th),
      yAxis: valAxis(L(med.label), th, false),
      series: series
    };

    var headers = [L(dim.label), L(loc('n', 'n')), L(loc('min', 'mín')), 'Q1',
      L(loc('median', 'mediana')), 'Q3', L(loc('max', 'máx'))];
    var trows = entradas.map(function (e) {
      return [e.k, e.n].concat(e.caja);
    });
    var enNote = numstr(entradas.length, 'en-US') + ' groups · ' + numstr(rows.length, 'en-US') + ' rows';
    var esNote = numstr(entradas.length, 'es-CL') + ' grupos · ' + numstr(rows.length, 'es-CL') + ' filas';
    return {
      option: option,
      table: table(headers, trows, 'boxplot'),
      meta: {
        note: loc(enNote, esNote),
        warn: sampledJitter
          ? loc(
            MSG.sampled.en + ' Jitter shows at most ' + numstr(MAX_BOX_JITTER, 'en-US') + ' raw points; box statistics use every value.',
            MSG.sampled.es + ' El jitter muestra como máximo ' + numstr(MAX_BOX_JITTER, 'es-CL') + ' puntos crudos; la caja usa todos los valores.'
          )
          : null,
        logPossible: null,
        groups: entradas.length
      }
    };
  }

  /* --- pie / donut ------------------------------------------------------- */
  function recipePie(config, rows, data, th) {
    var dim = dimsOf(config, data)[0];
    var med = measuresOf(config, data)[0] || null;
    var grupos = new Map();
    var i, f, k;
    for (i = 0; i < rows.length; i++) {
      f = rows[i];
      k = valueOf(dim, f);
      if (k == null) continue;
      if (!grupos.has(k)) grupos.set(k, newGroup());
      accumulate(grupos.get(k), med ? valueOf(med, f) : null);
    }
    if (!grupos.size) return null;

    var agg = config.agregacion;
    var totalOf = function (kk) { return aggValue(grupos.get(kk), agg) || 0; };
    var claves = sortKeys(Array.from(grupos.keys()), dim, totalOf,
      config.orden === 'auto' ? 'valor' : config.orden, config.topN);
    var total = claves.reduce(function (s, kk) { return s + totalOf(kk); }, 0);
    var donut = config.tipo === 'donut';

    var option = {
      color: th.palette,
      title: titleOf(config, th),
      tooltip: (function () {
        var t = tooltipBase(th);
        t.trigger = 'item';
        t.confine = true;
        t.formatter = function (p) {
          return '<b>' + esc(p.name) + '</b><br/>' + esc(valueLabel(config, med)) +
            ': <b>' + fmtNum(p.value) + '</b> · ' + p.percent + ' %';
        };
        return t;
      })(),
      legend: {
        bottom: 0,
        type: 'scroll',
        textStyle: { color: th.muted, fontSize: 11 },
        pageIconColor: th.accent,
        pageTextStyle: { color: th.muted }
      },
      series: [{
        type: 'pie',
        name: valueLabel(config, med),
        radius: donut ? ['38%', '66%'] : '66%',
        center: ['50%', config.titulo ? '50%' : '46%'],
        data: claves.map(function (kk) { return { name: String(kk), value: totalOf(kk) }; }),
        label: { formatter: '{b}: {d}%', fontSize: 10.5, color: th.text, minShowLabelAngle: 1.5 },
        labelLine: { length: 8, length2: 8, lineStyle: { color: th.border } },
        labelLayout: { hideOverlap: true },
        itemStyle: { borderColor: th.bg, borderWidth: 1.5 },
        emphasis: { scale: true, scaleSize: 4 }
      }]
    };

    var trows = claves.map(function (kk) {
      var v = totalOf(kk);
      return [String(kk), v, total > 0 ? round4((v / total) * 100) : 0];
    });
    var headers = [L(dim.label), valueLabel(config, med), L(loc('share (%)', 'porcentaje (%)'))];
    var enNote = numstr(claves.length, 'en-US') + ' slices · total ' + fmtInt(total, 'en-US');
    var esNote = numstr(claves.length, 'es-CL') + ' porciones · total ' + fmtInt(total, 'es-CL');
    return {
      option: option,
      table: table(headers, trows, donut ? 'donut' : 'pie'),
      meta: { note: loc(enNote, esNote), warn: null, logPossible: null, groups: claves.length }
    };
  }

  /* --- heatmap ----------------------------------------------------------- */
  function recipeHeatmap(config, rows, data, th) {
    var dims = dimsOf(config, data);
    var dimX = dims[0];
    var dimY = dims[1];
    var med = measuresOf(config, data)[0] || null;
    var celdas = new Map();
    var totX = new Map();
    var totY = new Map();
    var i, f, x, y, key;
    for (i = 0; i < rows.length; i++) {
      f = rows[i];
      x = valueOf(dimX, f);
      y = valueOf(dimY, f);
      if (x == null || y == null) continue;
      key = x + '|' + y;
      if (!celdas.has(key)) celdas.set(key, newGroup());
      accumulate(celdas.get(key), med ? valueOf(med, f) : null);
      totX.set(x, (totX.get(x) || 0) + 1);
      totY.set(y, (totY.get(y) || 0) + 1);
    }
    if (!celdas.size) return null;

    var agg = config.agregacion;
    var cell = function (xx, yy) {
      var g = celdas.get(xx + '|' + yy);
      return g ? (aggValue(g, agg) || 0) : 0;
    };
    var keysX = sortKeys(Array.from(totX.keys()), dimX, function (kk) { return totX.get(kk); }, config.orden, config.topN);
    var keysY = sortKeys(Array.from(totY.keys()), dimY, function (kk) { return totY.get(kk); }, config.orden, config.topN);
    var datos = [];
    var max = 0;
    var min = Infinity;
    keysX.forEach(function (xx) {
      keysY.forEach(function (yy) {
        var v = cell(xx, yy);
        if (v > max) max = v;
        if (v < min) min = v;
        datos.push([String(xx), String(yy), v]);
      });
    });
    if (!Number.isFinite(min)) min = 0;
    if (max === min) max = min + 1;
    var xLabels = keysX.map(String);

    var option = {
      title: titleOf(config, th),
      tooltip: (function () {
        var t = tooltipBase(th);
        t.trigger = 'item';
        t.confine = true;
        t.formatter = function (p) {
          return '<b>' + esc(p.value[0]) + ' · ' + esc(p.value[1]) + '</b><br/>' +
            esc(valueLabel(config, med)) + ': <b>' + fmtNum(p.value[2]) + '</b>';
        };
        return t;
      })(),
      grid: Object.assign(gridOf(!!config.titulo, false),
        { bottom: 24, right: 66, top: config.titulo ? 56 : 42 }),
      graphic: [axisCaption(L(dimX.label), th)],
      xAxis: catAxis(xLabels, th, {
        rotate: 60,
        splitArea: { show: true, areaStyle: { color: [th.light ? '#fafbfc' : '#171d25', th.bg] } }
      }),
      yAxis: {
        type: 'category',
        data: keysY.map(String),
        inverse: true,
        name: L(dimY.label),
        nameLocation: 'start',
        nameGap: 14,
        nameTextStyle: { color: th.muted, fontSize: 10.5, align: 'left' },
        axisLabel: { fontSize: 10.5, color: th.muted, hideOverlap: true },
        axisLine: { lineStyle: { color: th.border } },
        axisTick: { lineStyle: { color: th.border } },
        splitArea: { show: true, areaStyle: { color: [th.light ? '#fafbfc' : '#171d25', th.bg] } }
      },
      visualMap: {
        min: min,
        max: max,
        calculable: true,
        orient: 'vertical',
        right: 6,
        top: 'middle',
        itemWidth: 10,
        itemHeight: 110,
        textStyle: { color: th.muted, fontSize: 10.5 },
        inRange: { color: th.heat }
      },
      series: [{
        type: 'heatmap',
        name: valueLabel(config, med),
        data: datos,
        label: {
          show: !!config.etiquetas,
          fontSize: 9.5,
          color: th.text,
          formatter: function (p) { return fmtNum(p.value[2]); }
        },
        itemStyle: { borderColor: th.bg, borderWidth: 1.5 },
        emphasis: { itemStyle: { shadowBlur: 4, shadowColor: 'rgba(0,0,0,.35)' } }
      }]
    };

    var headers = [L(dimX.label), L(dimY.label), valueLabel(config, med)];
    var trows = datos.map(function (d) { return [d[0], d[1], d[2]]; });
    var enNote = numstr(keysX.length, 'en-US') + ' × ' + numstr(keysY.length, 'en-US') + ' cells';
    var esNote = numstr(keysX.length, 'es-CL') + ' × ' + numstr(keysY.length, 'es-CL') + ' celdas';
    return {
      option: option,
      table: table(headers, trows, 'heatmap'),
      meta: { note: loc(enNote, esNote), warn: null, logPossible: null, groups: datos.length }
    };
  }

  /* --- treemap / sunburst ------------------------------------------------ */
  function buildTree(config, rows, dims, med) {
    var agg = config.agregacion;
    var raiz = { hijos: new Map(), grupo: null };
    function add(node, level, row) {
      if (level === dims.length) {
        if (!node.grupo) node.grupo = newGroup();
        accumulate(node.grupo, med ? valueOf(med, row) : null);
        return;
      }
      var k = valueOf(dims[level], row);
      if (k == null) return;
      if (!node.hijos.has(k)) node.hijos.set(k, { hijos: new Map(), grupo: null });
      add(node.hijos.get(k), level + 1, row);
    }
    for (var i = 0; i < rows.length; i++) add(raiz, 0, rows[i]);

    function totalOf(node) {
      if (!node.hijos.size) return aggValue(node.grupo, agg) || 0;
      var s = 0;
      node.hijos.forEach(function (h) { s += totalOf(h); });
      return s;
    }
    function build(node, level) {
      var keys = sortKeys(Array.from(node.hijos.keys()), dims[level],
        function (k) { return totalOf(node.hijos.get(k)); }, config.orden, config.topN);
      return keys.map(function (k) {
        var child = node.hijos.get(k);
        var value = totalOf(child);
        if (!child.hijos.size) return { name: String(k), value: value };
        return { name: String(k), value: value, children: build(child, level + 1) };
      });
    }
    var datos = build(raiz, 0);
    return { datos: datos, total: datos.reduce(function (s, d) { return s + (d.value || 0); }, 0) };
  }

  function flattenTree(nodes, path, out) {
    nodes.forEach(function (n) {
      var p = path.concat([n.name]);
      if (n.children && n.children.length) flattenTree(n.children, p, out);
      else out.push([p.join(' › '), n.value]);
    });
  }

  function recipeTreemap(config, rows, data, th) {
    var dims = dimsOf(config, data).slice(0, 2);
    if (!dims.length) return null;
    var med = measuresOf(config, data)[0] || null;
    var tree = buildTree(config, rows, dims, med);
    if (!tree.datos.length) return null;
    var total = tree.total;

    var option = {
      color: th.palette,
      title: titleOf(config, th),
      tooltip: (function () {
        var t = tooltipBase(th);
        t.trigger = 'item';
        t.confine = true;
        t.formatter = function (p) {
          var pct = total > 0 ? ' · ' + Math.round(((p.value || 0) / total) * 100) + ' %' : '';
          return '<b>' + esc(p.name) + '</b><br/>' + esc(valueLabel(config, med)) +
            ': <b>' + fmtNum(p.value) + '</b>' + pct;
        };
        return t;
      })(),
      series: [{
        type: 'treemap',
        name: valueLabel(config, med),
        top: config.titulo ? 44 : 10,
        left: 4,
        right: 4,
        bottom: 26,
        data: tree.datos,
        roam: false,
        nodeClick: 'zoomToNode',
        breadcrumb: {
          show: true, bottom: 0, height: 20,
          itemStyle: { color: th.light ? '#eef1f4' : '#1c232c', textStyle: { color: th.muted, fontSize: 10 } }
        },
        upperLabel: { show: true, height: 20, fontSize: 10.5, color: th.text },
        label: { show: true, fontSize: 10.5, color: th.text, formatter: function (p) { return p.name; } },
        levels: [
          { itemStyle: { borderWidth: 2, borderColor: th.bg, gapWidth: 2 } },
          { itemStyle: { borderWidth: 1, borderColor: th.bg, gapWidth: 1 }, colorSaturation: [0.35, 0.65] }
        ],
        itemStyle: { borderColor: th.bg }
      }]
    };

    var trows = [];
    flattenTree(tree.datos, [], trows);
    var headers = [L(loc('path', 'ruta')), valueLabel(config, med)];
    var enNote = numstr(trows.length, 'en-US') + ' leaves · total ' + fmtInt(total, 'en-US');
    var esNote = numstr(trows.length, 'es-CL') + ' hojas · total ' + fmtInt(total, 'es-CL');
    return {
      option: option,
      table: table(headers, trows, 'treemap'),
      meta: { note: loc(enNote, esNote), warn: null, logPossible: null, groups: trows.length }
    };
  }

  function recipeSunburst(config, rows, data, th) {
    var dims = dimsOf(config, data).slice(0, 3);
    if (!dims.length) return null;
    var med = measuresOf(config, data)[0] || null;
    var tree = buildTree(config, rows, dims, med);
    if (!tree.datos.length) return null;
    var total = tree.total;

    var option = {
      color: th.palette,
      title: titleOf(config, th),
      tooltip: (function () {
        var t = tooltipBase(th);
        t.trigger = 'item';
        t.confine = true;
        t.formatter = function (p) {
          var pct = total > 0 ? ' · ' + Math.round(((p.value || 0) / total) * 100) + ' %' : '';
          return '<b>' + esc(p.name) + '</b><br/>' + esc(valueLabel(config, med)) +
            ': <b>' + fmtNum(p.value) + '</b>' + pct;
        };
        return t;
      })(),
      series: [{
        type: 'sunburst',
        data: tree.datos,
        radius: ['12%', '90%'],
        center: ['50%', config.titulo ? '52%' : '50%'],
        sort: null,
        nodeClick: 'rootToNode',
        emphasis: { focus: 'ancestor' },
        label: { rotate: 'radial', fontSize: 10, minAngle: 4, color: th.text },
        itemStyle: { borderColor: th.bg, borderWidth: 1.5 }
      }]
    };

    var trows = [];
    flattenTree(tree.datos, [], trows);
    var headers = [L(loc('path', 'ruta')), valueLabel(config, med)];
    var enNote = numstr(trows.length, 'en-US') + ' leaves · total ' + fmtInt(total, 'en-US');
    var esNote = numstr(trows.length, 'es-CL') + ' hojas · total ' + fmtInt(total, 'es-CL');
    return {
      option: option,
      table: table(headers, trows, 'sunburst'),
      meta: { note: loc(enNote, esNote), warn: null, logPossible: null, groups: trows.length }
    };
  }

  /* --- sankey ------------------------------------------------------------ */
  function recipeSankey(config, rows, data, th) {
    var dims = dimsOf(config, data).slice(0, 3);
    if (dims.length < 2) return null;
    var med = measuresOf(config, data)[0] || null;
    var agg = config.agregacion;

    var nodos = new Map();
    var enlaces = new Map();
    function nodeOf(level, value) {
      var key = level + '·' + value;
      if (!nodos.has(key)) {
        nodos.set(key, {
          name: key,
          displayName: String(value),
          depth: level,
          itemStyle: { color: th.palette[level % th.palette.length] }
        });
      }
      return key;
    }

    for (var i = 0; i < rows.length; i++) {
      var f = rows[i];
      var vals = dims.map(function (d) { return valueOf(d, f); });
      if (vals.some(function (v) { return v == null; })) continue;
      var previous = null;
      for (var level = 0; level < vals.length; level++) {
        var current = nodeOf(level, vals[level]);
        if (previous != null) {
          var key = previous + '→' + current;
          if (!enlaces.has(key)) enlaces.set(key, { source: previous, target: current, grupo: newGroup() });
          accumulate(enlaces.get(key).grupo, med ? valueOf(med, f) : null);
        }
        previous = current;
      }
    }
    if (!enlaces.size) return null;

    var allLinks = Array.from(enlaces.values()).map(function (e) {
      return { source: e.source, target: e.target, value: Math.max(0, aggValue(e.grupo, agg) || 0) };
    });
    var links = allLinks.filter(function (e) { return e.value > 0; })
      .sort(function (a, b) { return b.value - a.value; });
    if (!links.length) return null;
    var dropped = allLinks.length - links.length;

    var option = {
      title: titleOf(config, th),
      tooltip: (function () {
        var t = tooltipBase(th);
        t.trigger = 'item';
        t.confine = true;
        t.formatter = function (p) {
          if (p.dataType === 'edge') {
            var nameOf = function (n) { return nodos.get(n) ? nodos.get(n).displayName : n; };
            return esc(nameOf(p.data.source)) + ' → ' + esc(nameOf(p.data.target)) + '<br/>' +
              esc(valueLabel(config, med)) + ': <b>' + fmtNum(p.data.value) + '</b>';
          }
          var d = p.data;
          return '<b>' + esc(d.displayName || d.name) + '</b>';
        };
        return t;
      })(),
      series: [{
        type: 'sankey',
        left: '2%',
        right: '12%',
        top: config.titulo ? 54 : 18,
        bottom: 14,
        nodeWidth: 14,
        nodeGap: 10,
        draggable: true,
        layoutIterations: 32,
        emphasis: { focus: 'adjacency' },
        data: Array.from(nodos.values()),
        links: links,
        label: {
          fontSize: 10.5,
          color: th.text,
          formatter: function (p) { return (p.data && p.data.displayName) || p.name; }
        },
        lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.42 },
        itemStyle: { borderWidth: 0 }
      }]
    };

    var trows = links.map(function (e) {
      return [nodos.get(e.source).displayName, nodos.get(e.target).displayName, e.value];
    });
    var headers = [L(loc('source', 'origen')), L(loc('target', 'destino')), valueLabel(config, med)];
    var enNote = numstr(links.length, 'en-US') + ' links · ' + numstr(nodos.size, 'en-US') + ' nodes';
    var esNote = numstr(links.length, 'es-CL') + ' enlaces · ' + numstr(nodos.size, 'es-CL') + ' nodos';
    return {
      option: option,
      table: table(headers, trows, 'sankey'),
      meta: {
        note: loc(enNote, esNote),
        warn: dropped > 0 ? MSG.nonPositive : null,
        logPossible: null,
        groups: links.length
      }
    };
  }

  /* --- entry point ------------------------------------------------------- */
  function buildChart(config, rows, data, th) {
    if (!rows || !rows.length) return { option: null, table: null, meta: { reason: MSG.noData } };
    var err = validateBI(config, data);
    if (err) return { option: null, table: null, meta: { reason: err } };

    var result = null;
    switch (config.tipo) {
      case 'barras': result = recipeCategorical(config, rows, data, th, {}); break;
      case 'barras-apiladas': result = recipeCategorical(config, rows, data, th, { apilado: true }); break;
      case 'barras-horizontales': result = recipeCategorical(config, rows, data, th, { horizontal: true }); break;
      case 'linea': result = recipeCategorical(config, rows, data, th, { serie: 'line' }); break;
      case 'area': result = recipeCategorical(config, rows, data, th, { serie: 'line' }); break;
      case 'histograma': result = recipeHistogram(config, rows, data, th); break;
      case 'scatter': result = recipeScatter(config, rows, data, th); break;
      case 'boxplot': result = recipeBoxplot(config, rows, data, th); break;
      case 'pastel':
      case 'donut': result = recipePie(config, rows, data, th); break;
      case 'heatmap': result = recipeHeatmap(config, rows, data, th); break;
      case 'treemap': result = recipeTreemap(config, rows, data, th); break;
      case 'sunburst': result = recipeSunburst(config, rows, data, th); break;
      case 'sankey': result = recipeSankey(config, rows, data, th); break;
      default: result = null;
    }
    if (!result || !result.option) return { option: null, table: null, meta: { reason: MSG.noRows } };

    var opt = result.option;
    opt.backgroundColor = th.bg;
    opt.textStyle = { fontFamily: FONT, color: th.text, fontSize: 11.5 };
    var reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    opt.animation = !reduce && rows.length < 20000;
    opt.animationDuration = 320;
    return result;
  }

  /* =========================================================================
   * 8. Storage
   * ========================================================================= */

  function loadSaved() {
    try {
      var raw = global.localStorage ? global.localStorage.getItem(STORAGE_KEY) : null;
      if (!raw) return [];
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (x) { return x && x.config && x.dataset; });
    } catch (e) {
      return [];
    }
  }
  function persistSaved(arr) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
      return true;
    } catch (e) {
      toast(L(MSG.storageFail), 'warn');
      return false;
    }
  }

  /* =========================================================================
   * 9. UI state and DOM
   * ========================================================================= */

  var state = {
    dsId: 'master',
    data: null,
    cache: {},
    config: null,
    saved: [],
    loading: false,
    search: '',
    drag: null,
    chart: null,
    minis: [],
    lastTable: null,
    lastMeta: null,
    rafPending: false,
    toastTimer: null,
    saveTimer: null,
    switchSeq: 0,
    pendingDs: null
  };

  var $ = function (id) { return document.getElementById(id); };
  var el = {};

  function cacheEls() {
    el.dataset = $('cm-dataset');
    el.dsMeta = $('cm-ds-meta');
    el.title = $('cm-title');
    el.types = $('cm-types');
    el.search = $('cm-search');
    el.fieldList = $('cm-field-list');
    el.fieldCount = $('cm-field-count');
    el.shelves = document.querySelector('.cm-shelves');
    el.agg = $('cm-agg');
    el.sort = $('cm-sort');
    el.topn = $('cm-topn');
    el.bins = $('cm-bins');
    el.binsVal = $('cm-bins-val');
    el.log = $('cm-log');
    el.labels = $('cm-labels');
    el.points = $('cm-points');
    el.optAgg = $('opt-agg');
    el.optBins = $('opt-bins');
    el.optLog = $('opt-log');
    el.optLabels = $('opt-labels');
    el.optPoints = $('opt-points');
    el.hint = $('cm-hint');
    el.chart = $('cm-chart');
    el.empty = $('cm-empty');
    el.emptyMsg = $('cm-empty-msg');
    el.emptyReset = $('cm-empty-reset');
    el.loading = $('cm-loading');
    el.loadingMsg = $('cm-loading-msg');
    el.note = $('cm-note');
    el.noteWarn = $('cm-note-warn');
    el.png = $('cm-png');
    el.png2 = $('cm-png2');
    el.csv = $('cm-csv');
    el.csv2 = $('cm-csv2');
    el.save = $('cm-save');
    el.link = $('cm-link');
    el.reset = $('cm-reset');
    el.savedGrid = $('cm-saved-grid');
    el.savedEmpty = $('cm-saved-empty');
    el.clear = $('cm-clear');
    el.toast = $('cm-toast');
  }

  function toast(msg, kind) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () { el.toast.className = 'toast'; }, 3400);
  }

  /* =========================================================================
   * 10. Data loading
   * ========================================================================= */

  function prepareDataset(def, header, matrix) {
    var byId = {};
    var derived = def.derived || [];
    var fields = def.fields.filter(function (f) {
      var ok = header.indexOf(f.id) >= 0 || derived.indexOf(f.id) >= 0;
      if (!ok) console.warn('[chartmaker] field "' + f.id + '" is missing from ' + def.file + ' and will be ignored');
      return ok;
    }).map(function (f) {
      return { id: f.id, tipo: f.tipo, label: f.label, orden: f.orden || null };
    });
    fields.forEach(function (f) { byId[f.id] = f; });

    var numericFields = fields.filter(function (f) { return f.tipo === 'num'; });
    var rows = [];
    var col = header.length;
    for (var r = 1; r < matrix.length; r++) {
      var arr = matrix[r];
      if (!arr.length) continue;
      if (arr.length === 1 && arr[0] === '') continue;
      var obj = {};
      for (var c = 0; c < col; c++) obj[header[c]] = c < arr.length ? arr[c] : '';
      if (def.derive) def.derive(obj);
      for (var n = 0; n < numericFields.length; n++) {
        var id = numericFields[n].id;
        var raw = obj[id];
        if (raw === '' || raw == null) { obj[id] = null; continue; }
        var v = typeof raw === 'number' ? raw : Number(raw);
        obj[id] = Number.isFinite(v) ? v : null;
      }
      rows.push(obj);
    }
    return {
      id: def.id,
      def: def,
      file: def.file,
      label: def.label,
      header: header,
      fields: fields,
      byId: byId,
      rows: rows
    };
  }

  function loadDataset(id) {
    if (state.cache[id]) return Promise.resolve(state.cache[id]);
    var def = DATASETS[id];
    return fetch(def.file).then(function (res) {
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      return res.text();
    }).then(function (text) {
      var matrix = parseCSV(text);
      if (!matrix.length) throw new Error('empty CSV');
      var header = matrix[0].map(function (h) { return h.trim(); });
      var data = prepareDataset(def, header, matrix);
      state.cache[id] = data;
      var alert = document.getElementById('cm-data-alert');
      if (alert) alert.hidden = true;
      return data;
    });
  }

  /* =========================================================================
   * 11. Rendering: fields, shelves, types, options
   * ========================================================================= */

  function usedFieldIds() {
    var c = state.config;
    if (!c) return {};
    var map = {};
    idsOf(c.columnas).forEach(function (id) { map[id] = true; });
    idsOf(c.filas).forEach(function (id) { map[id] = true; });
    if (c.color) map[c.color.campo] = true;
    if (c.tamano) map[c.tamano.campo] = true;
    return map;
  }

  function renderFields() {
    if (!state.data) { el.fieldList.innerHTML = ''; return; }
    var data = state.data;
    var used = usedFieldIds();
    var q = state.search.trim().toLowerCase();
    function filtered(tipo) {
      return data.fields.filter(function (f) {
        if (f.tipo !== tipo) return false;
        if (!q) return true;
        return L(f.label).toLowerCase().indexOf(q) >= 0 || f.id.toLowerCase().indexOf(q) >= 0;
      });
    }
    var dims = filtered('cat');
    var nums = filtered('num');
    var totalDims = data.fields.filter(function (f) { return f.tipo === 'cat'; }).length;
    var totalNums = data.fields.length - totalDims;
    el.fieldCount.textContent = fmtInt(data.fields.length);

    function rowHtml(f) {
      var isUsed = !!used[f.id];
      var kind = f.tipo === 'num' ? 'num' : 'cat';
      var title = (f.tipo === 'num' ? L(loc('Measure', 'Medida')) : L(loc('Dimension', 'Dimensión'))) +
        ' · ' + (isUsed
          ? L(loc('click to remove', 'click para quitar'))
          : L(loc('click or drag to Columns, Rows, Color or Size', 'click o arrastra a Columnas, Filas, Color o Tamaño')));
      return '<div class="field is-' + kind + (isUsed ? ' is-used' : '') +
        '" data-field="' + esc(f.id) + '" draggable="true" role="button" tabindex="0" title="' + esc(title) + '">' +
        '<span class="dot ' + kind + '"></span>' +
        '<span class="lbl">' + esc(L(f.label)) + '</span>' +
        '<span class="tag">' + (f.tipo === 'num' ? '123' : 'ABC') + '</span>' +
        '</div>';
    }

    function groupHtml(kind, label, items, total) {
      var html = '<div class="field-group"><p class="field-group-title">' +
        '<span class="dot ' + kind + '"></span>' + esc(label) +
        ' <span class="n">(' + fmtInt(items.length) + (q ? ' / ' + fmtInt(total) : '') + ')</span></p>';
      if (!items.length) {
        html += '<div class="field-hint">' + esc(L(loc('No matches', 'Sin coincidencias'))) + '</div>';
      } else {
        html += items.map(rowHtml).join('');
      }
      return html + '</div>';
    }

    el.fieldList.innerHTML =
      groupHtml('cat', L(loc('Dimensions', 'Dimensiones')), dims, totalDims) +
      groupHtml('num', L(loc('Measures', 'Medidas')), nums, totalNums);
  }

  function fieldById(id) { return state.data ? state.data.byId[id] : null; }

  function pillHtml(shelf, index, field) {
    var kind = field.tipo === 'num' ? 'num' : 'cat';
    return '<span class="pill' + (kind === 'num' ? ' is-num' : '') + '" data-field="' + esc(field.id) +
      '" data-shelf="' + shelf + '" data-index="' + index + '" draggable="true" tabindex="0" role="button"' +
      ' aria-label="' + esc(L(field.label)) + '" title="' +
      esc(L(field.label) + ' · ' + L(loc('drag to move · press Delete to remove', 'arrastra para mover · pulsa Supr para quitar'))) + '">' +
      '<span class="dot ' + kind + '"></span>' +
      '<span class="plbl">' + esc(L(field.label)) + '</span>' +
      '<button class="px" data-remove="1" title="' + esc(L(loc('Remove field', 'Quitar campo'))) + '" aria-label="' +
      esc(L(loc('Remove field', 'Quitar campo'))) + '">×</button></span>';
  }

  function renderShelves() {
    var c = state.config;
    if (!c) return;
    ['columnas', 'filas', 'color', 'tamano'].forEach(function (shelf) {
      var wrap = el.shelves.querySelector('[data-pills="' + shelf + '"]');
      var count = el.shelves.querySelector('[data-count="' + shelf + '"]');
      if (!wrap) return;
      var html = '';
      if (shelf === 'color' || shelf === 'tamano') {
        var f = c[shelf] ? fieldById(c[shelf].campo) : null;
        html = f ? pillHtml(shelf, 0, f)
          : '<span class="shelf-hint">' + esc(L(loc('optional', 'opcional'))) + '</span>';
        if (count) count.textContent = f ? '1 / 1' : '0 / 1';
      } else {
        var ids = idsOf(c[shelf]);
        ids.forEach(function (id, i) {
          var fld = fieldById(id);
          if (fld) html += pillHtml(shelf, i, fld);
        });
        if (!ids.length) html = '<span class="shelf-hint">' +
          esc(L(loc('drop or click a field', 'arrastra o haz click en un campo'))) + '</span>';
        if (count) count.textContent = ids.length + ' / 2';
      }
      wrap.innerHTML = html;
    });
  }

  function renderTypes() {
    var c = state.config;
    if (!c || !state.data) return;
    var compat = compatibility(c, state.data);
    var labelSpan = el.types.querySelector('.cm-types-label');
    var html = labelSpan ? labelSpan.outerHTML : '';
    TYPES.forEach(function (t) {
      var reason = compat[t.id];
      var active = c.tipo === t.id;
      var disabled = !!reason && !active;
      var tip = reason ? L(reason) : L(loc('Show as ', 'Mostrar como ')) + L(t.label).toLowerCase();
      html += '<button class="chip' + (active ? ' is-active' : '') + (disabled ? ' is-disabled' : '') +
        '" data-type="' + t.id + '" data-reason="' + (reason ? esc(L(reason)) : '') + '"' +
        ' aria-pressed="' + (active ? 'true' : 'false') + '"' +
        (disabled ? ' aria-disabled="true"' : '') + ' title="' + esc(tip) + '">' +
        '<span class="ico" aria-hidden="true">' + t.icon + '</span>' +
        '<span>' + esc(L(t.label)) + '</span></button>';
    });
    el.types.innerHTML = html;
    var activeBtn = el.types.querySelector('.chip.is-active');
    if (activeBtn) activeBtn.setAttribute('aria-current', 'true');
  }

  function fillSelect(select, items, value) {
    if (!select) return;
    select.innerHTML = items.map(function (it) {
      return '<option value="' + esc(String(it.v)) + '">' + esc(it.label) + '</option>';
    }).join('');
    select.value = String(value);
  }

  function renderOptionLabels() {
    if (!el.agg) return;
    fillSelect(el.agg, AGG_IDS.map(function (id) { return { v: id, label: L(AGG_LABELS[id]) }; }), state.config.agregacion);
    fillSelect(el.sort, SORT_IDS.map(function (id) { return { v: id, label: L(SORT_LABELS[id]) }; }), state.config.orden);
    fillSelect(el.topn, [
      { v: 0, label: L(loc('all', 'todos')) },
      { v: 5, label: '5' }, { v: 10, label: '10' }, { v: 25, label: '25' },
      { v: 50, label: '50' }, { v: 100, label: '100' }
    ], state.config.topN);
  }

  function showIf(node, visible) {
    if (node) node.hidden = !visible;
  }

  function renderOptions(meta) {
    var c = state.config;
    if (!c) return;
    renderOptionLabels();
    el.log.checked = !!c.ejeLog;
    el.labels.checked = !!c.etiquetas;
    el.points.checked = !!c.puntos;
    el.bins.value = c.bins;
    el.binsVal.textContent = String(c.bins);

    var aggregate = ['scatter', 'boxplot'].indexOf(c.tipo) < 0;
    showIf(el.optAgg, aggregate);
    showIf(el.optBins, c.tipo === 'histograma');
    showIf(el.optLog, ['barras', 'barras-apiladas', 'barras-horizontales', 'linea', 'area', 'histograma'].indexOf(c.tipo) >= 0);
    showIf(el.optLabels, ['barras', 'barras-apiladas', 'barras-horizontales', 'linea', 'area', 'histograma',
      'pastel', 'donut', 'heatmap', 'treemap', 'sunburst'].indexOf(c.tipo) >= 0);
    showIf(el.optPoints, c.tipo === 'boxplot');

    var logOk = !meta || meta.logPossible !== false;
    el.log.disabled = !logOk;
    el.optLog.classList.toggle('is-off', !logOk);
    el.optLog.title = logOk
      ? L(loc('Logarithmic value axis (only if every value is > 0)', 'Eje de valores logarítmico (solo si todos los valores son > 0)'))
      : L(MSG.logOff);
  }

  /* =========================================================================
   * 12. Chart rendering
   * ========================================================================= */

  function ensureChart() {
    if (!global.echarts) return null;
    if (!state.chart) {
      state.chart = global.echarts.init(el.chart, null, { renderer: 'canvas' });
    }
    return state.chart;
  }

  function disposeChart() {
    if (state.chart) {
      try { state.chart.dispose(); } catch (e) {}
      state.chart = null;
    }
  }

  function clearChart() {
    if (state.chart) state.chart.clear();
  }

  function showEmpty(reason) {
    el.empty.hidden = false;
    el.emptyMsg.innerHTML = '<strong>' + esc(L(reason)) + '</strong><br>' +
      '<span style="font-size:12px">' + esc(L(MSG.emptyHint)) + '</span>';
  }
  function hideEmpty() { el.empty.hidden = true; }

  function showLoading(msg) {
    el.loading.hidden = false;
    el.loadingMsg.textContent = msg;
    el.empty.hidden = true;
    el.chart.style.opacity = '.2';
  }
  function hideLoading() {
    el.loading.hidden = true;
    el.chart.style.opacity = '';
  }

  function renderNote(meta) {
    if (!meta) {
      el.note.textContent = '';
      el.noteWarn.textContent = '';
      return;
    }
    el.note.innerHTML = meta.note ? esc(L(meta.note)) : '';
    var warns = [];
    if (meta.warn) warns.push(L(meta.warn));
    if (state.config.ejeLog && meta.logPossible === false) warns.push(L(MSG.logOff));
    el.noteWarn.textContent = warns.join(' · ');
  }

  function scheduleRender() {
    if (state.rafPending) return;
    state.rafPending = true;
    requestAnimationFrame(function () {
      state.rafPending = false;
      render();
    });
  }

  function render() {
    if (!state.data || state.loading) return;
    var c = state.config;
    var data = state.data;
    el.hint.textContent = L(HINTS[c.tipo] || '');

    var err = validateBI(c, data);
    var built = null;
    if (!err) built = buildChart(c, data.rows, data, themeOf());

    renderTypes();
    renderOptions(built ? built.meta : null);

    if (err || !built || !built.option) {
      clearChart();
      renderNote(built ? built.meta : null);
      showEmpty(err || (built && built.meta && built.meta.reason) || MSG.noRows);
      state.lastTable = null;
      state.lastMeta = null;
      updateExportState(false);
      return;
    }

    hideEmpty();
    state.lastTable = built.table;
    state.lastMeta = built.meta;
    var chart = ensureChart();
    if (!chart) {
      showEmpty(MSG.noEcharts);
      return;
    }
    chart.setOption(built.option, { notMerge: true, lazyUpdate: true });
    renderNote(built.meta);
    updateExportState(true);
  }

  /* =========================================================================
   * 13. Saving, restoring, exporting, sharing
   * ========================================================================= */

  function updateExportState(on) {
    [el.png, el.png2, el.csv, el.csv2].forEach(function (b) { if (b) b.disabled = !on; });
  }

  function safeFilename(base) {
    var s = String(base || 'chart').trim().toLowerCase()
      .replace(/[^a-z0-9\u00c0-\u024f]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!s) s = 'chart';
    return s.slice(0, 60);
  }

  function downloadBlob(name, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1200);
  }

  function downloadPNG() {
    if (!state.chart || !state.lastTable) { toast(L(MSG.nothingExport), 'warn'); return; }
    try {
      var th = themeOf();
      var url = state.chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: th.bg });
      var a = document.createElement('a');
      a.href = url;
      a.download = safeFilename(state.config.titulo || ('ft-' + state.dsId + '-' + state.config.tipo)) + '.png';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { document.body.removeChild(a); }, 800);
      toast(L(MSG.png), 'ok');
    } catch (e) {
      console.error(e);
      toast(L(MSG.nothingExport), 'warn');
    }
  }

  function csvCell(v) {
    var s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function downloadCSV() {
    if (!state.lastTable) { toast(L(MSG.nothingExport), 'warn'); return; }
    var t = state.lastTable;
    var lines = [t.headers.map(csvCell).join(',')];
    for (var i = 0; i < t.rows.length; i++) lines.push(t.rows[i].map(csvCell).join(','));
    var blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    downloadBlob(safeFilename(state.config.titulo || ('ft-' + state.dsId + '-' + t.name)) + '.csv', blob);
    toast(L(MSG.csv), 'ok');
  }

  function b64url(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64url(raw) {
    var b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function readUrlConfig() {
    try {
      var params = new URLSearchParams(location.search);
      var raw = params.get('config');
      if (!raw) return null;
      var obj = JSON.parse(fromB64url(raw));
      if (obj && obj.config && typeof obj.config === 'object') {
        return { dataset: obj.dataset, config: obj.config };
      }
      if (obj && obj.tipo) return { dataset: 'master', config: obj };
      return null;
    } catch (e) {
      console.warn('[chartmaker] invalid ?config link', e);
      return null;
    }
  }

  function copyLink() {
    if (!state.config) return;
    var payload = JSON.stringify({ v: 1, dataset: state.dsId, config: state.config });
    var url = location.origin + location.pathname + '?config=' + b64url(payload);
    try { history.replaceState(null, '', url); } catch (e) {}
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast(L(MSG.copied), 'ok');
      } catch (err) {
        toast(L(MSG.copyFail), 'warn');
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        toast(L(MSG.copied), 'ok');
      }).catch(fallback);
    } else {
      fallback();
    }
  }

  function saveCurrent() {
    var err = validateBI(state.config, state.data);
    if (err) { toast(L(MSG.saveInvalid) + L(err), 'warn'); return; }
    var entry = {
      id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      config: clone(state.config),
      dataset: state.dsId
    };
    state.saved.unshift(entry);
    if (persistSaved(state.saved)) toast(L(MSG.saved), 'ok');
    renderSaved();
  }

  function deleteSaved(id) {
    state.saved = state.saved.filter(function (g) { return g.id !== id; });
    persistSaved(state.saved);
    renderSaved();
    toast(L(MSG.deleted), 'ok');
  }

  function clearSaved() {
    if (!state.saved.length) return;
    if (!global.confirm(L(MSG.clearConfirm))) return;
    state.saved = [];
    persistSaved(state.saved);
    renderSaved();
    toast(L(MSG.cleared), 'ok');
  }

  function miniOption(config, data) {
    var built = buildChart(config, data.rows, data, themeOf());
    if (!built || !built.option) return null;
    var opt = built.option;
    delete opt.title;
    delete opt.dataZoom;
    delete opt.visualMap;
    delete opt.graphic;
    opt.animation = false;
    opt.legend = undefined;
    opt.tooltip = { show: false };
    opt.grid = { left: 4, right: 6, top: 6, bottom: 4, containLabel: true };
    function stripAxis(ax) {
      if (!ax || Array.isArray(ax)) return;
      ax.name = '';
      ax.axisLabel = { show: false };
      ax.axisTick = { show: false };
      ax.splitLine = { show: false };
    }
    stripAxis(opt.xAxis);
    stripAxis(opt.yAxis);
    if (opt.series) {
      opt.series.forEach(function (s) {
        if (s.label) s.label.show = false;
        if (s.type === 'sankey' || s.type === 'treemap' || s.type === 'sunburst') {
          if (s.label) s.label.show = false;
          if (s.upperLabel) s.upperLabel.show = false;
          if (s.breadcrumb) s.breadcrumb.show = false;
        }
      });
    }
    return opt;
  }

  function disposeMinis() {
    state.minis.forEach(function (c) { try { c.dispose(); } catch (e) {} });
    state.minis = [];
  }

  function renderSaved() {
    if (!el.savedGrid) return;
    disposeMinis();
    var list = state.saved;
    el.savedEmpty.hidden = list.length > 0;
    el.savedEmpty.textContent = list.length ? '' : L(MSG.savedEmpty);
    el.clear.disabled = !list.length;
    el.savedGrid.innerHTML = list.map(function (g) {
      var data = state.cache[g.dataset];
      var title = (g.config && g.config.titulo) || (data ? describeConfig(g.config, data) : g.dataset);
      var desc = (g.config && g.config.titulo && data) ? describeConfig(g.config, data) : (g.dataset || '');
      var dsLabel = DATASETS[g.dataset] ? L(DATASETS[g.dataset].label) : String(g.dataset || '');
      return '<article class="saved-card" data-id="' + esc(g.id) + '" tabindex="0" role="button" title="' +
        esc(L(loc('Click to restore this configuration', 'Click para restaurar esta configuración'))) + '">' +
        '<div class="saved-head"><span class="saved-title">' + esc(title) + '</span>' +
        '<span class="saved-actions">' +
        '<button class="mini-btn danger" data-del="' + esc(g.id) + '" title="' +
        esc(L(loc('Delete', 'Eliminar'))) + '" aria-label="' + esc(L(loc('Delete', 'Eliminar'))) + '">×</button>' +
        '</span></div>' +
        '<div class="saved-thumb" data-thumb="' + esc(g.id) + '">' +
        (data ? '' : '<div class="ph">' + esc(L(MSG.savedNoPreview)) + '<br><b>' + esc(dsLabel) + '</b></div>') +
        '</div>' +
        '<p class="saved-desc">' + esc(desc) + ' · ' + esc(dsLabel) + '</p>' +
        '</article>';
    }).join('');

    if (!global.echarts) return;
    list.forEach(function (g) {
      var data = state.cache[g.dataset];
      if (!data) return;
      var node = el.savedGrid.querySelector('[data-thumb="' + g.id + '"]');
      if (!node) return;
      var opt = miniOption(g.config, data);
      if (!opt) {
        node.innerHTML = '<div class="ph">' + esc(L(MSG.invalidSaved)) + '</div>';
        return;
      }
      try {
        var chart = global.echarts.init(node, null, { renderer: 'canvas' });
        chart.setOption(opt, { notMerge: true });
        state.minis.push(chart);
      } catch (e) {
        console.warn('[chartmaker] could not render saved thumbnail', e);
      }
    });
  }

  function restoreSaved(id) {
    var g = null;
    for (var i = 0; i < state.saved.length; i++) if (state.saved[i].id === id) g = state.saved[i];
    if (!g) return;
    switchDataset(g.dataset, clone(g.config)).then(function () {
      toast(L(MSG.restored), 'ok');
      var target = $('chart-panel');
      if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* =========================================================================
   * 14. Dataset switching
   * ========================================================================= */

  function updateDatasetMeta() {
    if (!state.data) { el.dsMeta.textContent = ''; return; }
    var rows = state.data.rows.length;
    var cols = state.data.header.length;
    var en = '<b>' + fmtInt(rows, 'en-US') + '</b> rows · ' + cols + ' columns';
    var es = '<b>' + fmtInt(rows, 'es-CL') + '</b> filas · ' + cols + ' columnas';
    el.dsMeta.innerHTML = L(loc(en, es));
  }

  function switchDataset(id, configOverride) {
    if (!DATASETS[id]) return Promise.resolve();
    var seq = ++state.switchSeq;
    var select = el.dataset;
    var previous = state.dsId;
    state.pendingDs = id;
    state.loading = true;
    showLoading(DATASETS[id].id === 'epochs' ? L(MSG.bigData)
      : L(loc('Loading dataset…', 'Cargando conjunto de datos…')));
    if (select) select.value = id;

    return loadDataset(id).then(function (data) {
      if (seq !== state.switchSeq) return;
      state.dsId = id;
      state.pendingDs = null;
      state.data = data;
      var next;
      if (configOverride) next = sanitizeConfig(configOverride, data);
      else if (state.config && configCompatible(state.config, data)) next = sanitizeConfig(state.config, data);
      else next = defaultConfig(id);
      state.config = next;
      el.title.value = next.titulo || '';
      state.loading = false;
      hideLoading();
      updateDatasetMeta();
      renderFields();
      renderShelves();
      render();
      renderSaved();
    }).catch(function (err) {
      if (seq !== state.switchSeq) return;
      console.error('[chartmaker] dataset load failed', err);
      state.pendingDs = null;
      state.loading = false;
      hideLoading();
      if (select) select.value = previous;
      var alert = document.getElementById('cm-data-alert');
      if (alert) alert.hidden = false;
      toast(L(MSG.loadFail) + ' (' + (err && err.message ? err.message : err) + ')', 'error');
      render();
    });
  }

  /* =========================================================================
   * 15. Shelves interaction (drag & drop + click/keyboard)
   * ========================================================================= */

  function removeEverywhere(fieldId) {
    var c = state.config;
    c.columnas = c.columnas.filter(function (p) { return p.campo !== fieldId; });
    c.filas = c.filas.filter(function (p) { return p.campo !== fieldId; });
    if (c.color && c.color.campo === fieldId) c.color = null;
    if (c.tamano && c.tamano.campo === fieldId) c.tamano = null;
  }

  function removePill(shelf, index) {
    var c = state.config;
    if (shelf === 'color' || shelf === 'tamano') c[shelf] = null;
    else c[shelf].splice(index, 1);
    configChanged();
  }

  function addTo(shelf, fieldId, index) {
    if (!state.data || !state.data.byId[fieldId]) return;
    var c = state.config;
    if (shelf === 'color' || shelf === 'tamano') {
      removeEverywhere(fieldId);
      c[shelf] = { campo: fieldId };
    } else {
      var list = c[shelf];
      var insertAt = list.length;
      if (index != null && list[index]) {
        var target = list[index];
        insertAt = target.campo === fieldId ? index : list.indexOf(target);
      }
      removeEverywhere(fieldId);
      var fresh = c[shelf];
      if (fresh.length >= 2) {
        fresh.splice(Math.min(Math.max(insertAt, 0), fresh.length - 1), 1, { campo: fieldId });
      } else {
        fresh.splice(Math.min(Math.max(insertAt, 0), fresh.length), 0, { campo: fieldId });
      }
    }
    configChanged();
  }

  function toggleField(fieldId) {
    var field = fieldById(fieldId);
    if (!field) return;
    var used = usedFieldIds();
    if (used[fieldId]) {
      removeEverywhere(fieldId);
      configChanged();
      return;
    }
    var c = state.config;
    if (field.tipo === 'cat') {
      if (c.columnas.length < 2) c.columnas.push({ campo: fieldId });
      else if (c.filas.length < 2) c.filas.push({ campo: fieldId });
      else c.color = { campo: fieldId };
    } else {
      if (c.filas.length < 2) c.filas.push({ campo: fieldId });
      else if (c.columnas.length < 2) c.columnas.push({ campo: fieldId });
      else if (!c.tamano) c.tamano = { campo: fieldId };
      else c.color = { campo: fieldId };
    }
    configChanged();
  }

  function configChanged() {
    renderShelves();
    renderFields();
    scheduleRender();
  }

  function clearDrag() {
    state.drag = null;
    document.querySelectorAll('.shelf.is-over').forEach(function (s) { s.classList.remove('is-over'); });
  }

  function dropTo(shelf, index) {
    var d = state.drag;
    clearDrag();
    if (!d) return;
    if (d.kind === 'pill' && d.shelf === shelf && d.index === index) return;
    addTo(shelf, d.campo, index == null ? null : index);
  }

  function bindShelfEvents() {
    document.querySelectorAll('.shelf').forEach(function (shelfEl) {
      var shelf = shelfEl.getAttribute('data-shelf');
      shelfEl.addEventListener('dragover', function (e) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = state.drag && state.drag.kind === 'pill' ? 'move' : 'copy';
      });
      shelfEl.addEventListener('dragenter', function (e) {
        e.preventDefault();
        shelfEl.classList.add('is-over');
      });
      shelfEl.addEventListener('dragleave', function (e) {
        if (!shelfEl.contains(e.relatedTarget)) shelfEl.classList.remove('is-over');
      });
      shelfEl.addEventListener('drop', function (e) {
        e.preventDefault();
        shelfEl.classList.remove('is-over');
        var pill = e.target.closest ? e.target.closest('.pill') : null;
        var index = pill ? Number(pill.getAttribute('data-index')) : null;
        dropTo(shelf, Number.isFinite(index) ? index : null);
      });
    });

    el.shelves.addEventListener('click', function (e) {
      var del = e.target.closest ? e.target.closest('[data-remove]') : null;
      if (del) {
        var pill = del.closest('.pill');
        if (pill) removePill(pill.getAttribute('data-shelf'), Number(pill.getAttribute('data-index')));
        return;
      }
    });

    el.shelves.addEventListener('keydown', function (e) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      var pill = e.target.closest ? e.target.closest('.pill') : null;
      if (!pill) return;
      e.preventDefault();
      removePill(pill.getAttribute('data-shelf'), Number(pill.getAttribute('data-index')));
    });

    el.shelves.addEventListener('focusin', function (e) {
      var pill = e.target.closest ? e.target.closest('.pill') : null;
      if (pill) pill.classList.add('is-focused');
    });
    el.shelves.addEventListener('focusout', function (e) {
      var pill = e.target.closest ? e.target.closest('.pill') : null;
      if (pill) pill.classList.remove('is-focused');
    });

    el.shelves.addEventListener('dragstart', function (e) {
      var pill = e.target.closest ? e.target.closest('.pill') : null;
      if (!pill) return;
      state.drag = {
        kind: 'pill',
        shelf: pill.getAttribute('data-shelf'),
        index: Number(pill.getAttribute('data-index')),
        campo: pill.getAttribute('data-field')
      };
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', state.drag.campo);
      }
    });
  }

  function bindFieldEvents() {
    el.fieldList.addEventListener('dragstart', function (e) {
      var f = e.target.closest ? e.target.closest('.field') : null;
      if (!f) return;
      state.drag = { kind: 'field', campo: f.getAttribute('data-field') };
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', state.drag.campo);
      }
    });
    el.fieldList.addEventListener('click', function (e) {
      var f = e.target.closest ? e.target.closest('.field') : null;
      if (!f) return;
      toggleField(f.getAttribute('data-field'));
    });
    el.fieldList.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      var f = e.target.closest ? e.target.closest('.field') : null;
      if (!f) return;
      e.preventDefault();
      toggleField(f.getAttribute('data-field'));
    });
  }

  /* =========================================================================
   * 16. Language & theme
   * ========================================================================= */

  function applyPlaceholders() {
    document.querySelectorAll('[data-ph-en]').forEach(function (n) {
      n.setAttribute('placeholder', L(loc(n.getAttribute('data-ph-en'), n.getAttribute('data-ph-es'))));
    });
  }
  function applyAriaLabels() {
    document.querySelectorAll('[data-aria-en]').forEach(function (n) {
      n.setAttribute('aria-label', L(loc(n.getAttribute('data-aria-en'), n.getAttribute('data-aria-es'))));
    });
  }
  function applyDocTitle() {
    document.title = L(loc('Chart maker · Frankenstein Transformer',
      'Constructor de gráficos · Frankenstein Transformer'));
  }
  function applyTitles() {
    document.querySelectorAll('[data-tip-en]').forEach(function (n) {
      n.setAttribute('title', L(loc(n.getAttribute('data-tip-en'), n.getAttribute('data-tip-es'))));
    });
  }

  function updateLangButtons() {
    var l = lang();
    document.querySelectorAll('[data-lang-btn]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-lang-btn') === l);
    });
  }
  function updateThemeButtons() {
    var t = themeName();
    document.querySelectorAll('[data-theme-btn]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-theme-btn') === t);
    });
  }

  function fillDatasetSelect() {
    if (!el.dataset) return;
    el.dataset.innerHTML = DATASET_IDS.map(function (id) {
      var d = DATASETS[id];
      return '<option value="' + id + '">' + esc(L(d.label)) + ' (' + fmtInt(d.count) + ')</option>';
    }).join('');
    el.dataset.value = state.pendingDs || state.dsId;
  }

  function setLang(l) {
    l = l === 'es' ? 'es' : 'en';
    document.documentElement.setAttribute('data-lang', l);
    document.documentElement.setAttribute('lang', l);
    try { global.localStorage.setItem('ft-lang', l); } catch (e) {}
    updateLangButtons();
    fillDatasetSelect();
    applyPlaceholders();
    applyTitles();
    applyAriaLabels();
    applyDocTitle();
    renderFields();
    renderShelves();
    render();
    renderSaved();
    updateDatasetMeta();
  }

  function setTheme(t) {
    t = t === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    try { global.localStorage.setItem('ft-theme', t); } catch (e) {}
    updateThemeButtons();
    disposeChart();
    disposeMinis();
    render();
    renderSaved();
  }

  /* =========================================================================
   * 17. Wiring
   * ========================================================================= */

  function bindControls() {
    document.querySelectorAll('[data-lang-btn]').forEach(function (b) {
      b.addEventListener('click', function () { setLang(b.getAttribute('data-lang-btn')); });
    });
    document.querySelectorAll('[data-theme-btn]').forEach(function (b) {
      b.addEventListener('click', function () { setTheme(b.getAttribute('data-theme-btn')); });
    });

    el.dataset.addEventListener('change', function () {
      switchDataset(el.dataset.value, null);
    });

    el.types.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.chip') : null;
      if (!btn) return;
      if (btn.getAttribute('aria-disabled') === 'true') {
        toast(btn.getAttribute('data-reason') || L(MSG.unknown), 'warn');
        return;
      }
      state.config.tipo = btn.getAttribute('data-type');
      scheduleRender();
      renderTypes();
    });

    el.search.addEventListener('input', function () {
      state.search = el.search.value;
      renderFields();
    });

    el.title.addEventListener('input', function () {
      state.config.titulo = el.title.value;
      scheduleRender();
    });

    el.agg.addEventListener('change', function () {
      state.config.agregacion = el.agg.value;
      scheduleRender();
    });
    el.sort.addEventListener('change', function () {
      state.config.orden = el.sort.value;
      scheduleRender();
    });
    el.topn.addEventListener('change', function () {
      state.config.topN = Number(el.topn.value) || 0;
      scheduleRender();
    });
    el.bins.addEventListener('input', function () {
      state.config.bins = clampInt(el.bins.value, 5, 50, 20);
      el.binsVal.textContent = String(state.config.bins);
      scheduleRender();
    });
    el.log.addEventListener('change', function () {
      state.config.ejeLog = el.log.checked;
      scheduleRender();
    });
    el.labels.addEventListener('change', function () {
      state.config.etiquetas = el.labels.checked;
      scheduleRender();
    });
    el.points.addEventListener('change', function () {
      state.config.puntos = el.points.checked;
      scheduleRender();
    });

    el.save.addEventListener('click', saveCurrent);
    el.link.addEventListener('click', copyLink);
    el.png.addEventListener('click', downloadPNG);
    el.png2.addEventListener('click', downloadPNG);
    el.csv.addEventListener('click', downloadCSV);
    el.csv2.addEventListener('click', downloadCSV);
    el.reset.addEventListener('click', function () {
      state.config = defaultConfig(state.dsId);
      el.title.value = '';
      renderFields();
      renderShelves();
      scheduleRender();
      toast(L(MSG.resetDone), 'ok');
    });
    el.emptyReset.addEventListener('click', function () {
      state.config = defaultConfig(state.dsId);
      el.title.value = '';
      renderFields();
      renderShelves();
      scheduleRender();
    });

    el.savedGrid.addEventListener('click', function (e) {
      var del = e.target.closest ? e.target.closest('[data-del]') : null;
      if (del) {
        e.stopPropagation();
        deleteSaved(del.getAttribute('data-del'));
        return;
      }
      var card = e.target.closest ? e.target.closest('.saved-card') : null;
      if (card) restoreSaved(card.getAttribute('data-id'));
    });
    el.savedGrid.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest ? e.target.closest('.saved-card') : null;
      if (!card) return;
      e.preventDefault();
      restoreSaved(card.getAttribute('data-id'));
    });
    el.clear.addEventListener('click', clearSaved);

    document.addEventListener('dragend', clearDrag);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') clearDrag();
    });

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (state.chart) state.chart.resize();
        state.minis.forEach(function (c) { try { c.resize(); } catch (e) {} });
      }, 110);
    });

    if (global.ResizeObserver) {
      var ro = new ResizeObserver(function () {
        if (state.chart) state.chart.resize();
      });
      ro.observe(el.chart);
    }
  }

  /* =========================================================================
   * 18. Boot
   * ========================================================================= */

  function boot() {
    cacheEls();
    if (!global.echarts) {
      console.error('[chartmaker] echarts global not found');
    }
    state.saved = loadSaved();
    fillDatasetSelect();
    bindControls();
    bindFieldEvents();
    bindShelfEvents();
    applyPlaceholders();
    applyTitles();
    applyAriaLabels();
    applyDocTitle();
    updateLangButtons();
    updateThemeButtons();

    var fromUrl = readUrlConfig();
    var startId = fromUrl && DATASETS[fromUrl.dataset] ? fromUrl.dataset : 'master';
    state.dsId = startId;
    el.dataset.value = startId;

    switchDataset(startId, fromUrl ? fromUrl.config : null).then(function () {
      renderSaved();
      if (fromUrl) toast(L(loc('Shared configuration loaded.', 'Configuración compartida cargada.')), 'ok');
    });

    global.FTCM = {
      state: state,
      datasets: DATASETS,
      buildChart: buildChart,
      validate: function () { return state.data ? validateBI(state.config, state.data) : MSG.noData; },
      apply: function (config) {
        if (!state.data) return;
        state.config = sanitizeConfig(config, state.data);
        el.title.value = state.config.titulo || '';
        renderFields();
        renderShelves();
        render();
      },
      setDataset: function (id) { return switchDataset(id, null); },
      setLang: setLang,
      setTheme: setTheme,
      save: saveCurrent,
      restore: restoreSaved,
      exportCSV: downloadCSV,
      exportPNG: downloadPNG
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
