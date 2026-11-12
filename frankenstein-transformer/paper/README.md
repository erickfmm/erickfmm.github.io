# Paper build

Pipeline to regenerate the paper PDF and the HTML version (consumed by the
config builder's **Paper** tab) from the LaTeX sources.

## Layout

```
paper/
├── en/                 # English sources (paper.tex, sections/, appendices/)
│   ├── paper.tex
│   └── paper.pdf       # compiled output
├── es/                 # Spanish sources (paper-es.tex, sections/, appendices/)
│   ├── paper-es.tex
│   └── paper-es.pdf    # compiled output
├── bibliography/       # *.bib referenced by \bibliography{../bibliography/...}
├── figures/            # SVG renders of docs/paper/figures (EN `<name>.svg` +
│                       # ES `<name>-es.svg`; indexed by stem)
├── flatten_tex.py      # inlines \input + .bbl; --web writes the figure manifest
├── postprocess_html.py # injects the SVGs into <figure> and lazy-loads images
├── paper-en.html       # pandoc output (English)  ← used by the web app
├── paper-es.html       # pandoc output (Spanish)  ← used by the web app
└── README.md
```

## Requirements

- TeX Live with: `pdflatex`, `bibtex`, plus the packages used by the paper
  (`algorithm`, `algpseudocode`, `tikz`, `booktabs`, `longtable`, `tabularx`,
  `adjustbox`, `natbib`, `enumitem`, `tocbibind`, ...).
  On Debian/Ubuntu the only one outside the base set is `texlive-science`
  (provides `algorithm.sty` and `algpseudocode.sty`):
  ```bash
  sudo apt-get install -y texlive-science
  ```
- `pandoc` (≥ 3.x).
- Python 3 (stdlib only; no deps).
- `pnpm` + a Chrome/Chromium binary, only to rebuild the Mermaid figures
  (`docs/paper/figures/build-figures.sh`).

## Full rebuild

From this directory (`frankenstein-transformer/paper/`):

```bash
# 1) Compile each language: pdflatex → bibtex → pdflatex → pdflatex
#    (the extra passes resolve cross-references and the .bbl).

# English
( cd en && pdflatex -interaction=nonstopmode paper.tex && \
          bibtex paper && \
          pdflatex -interaction=nonstopmode paper.tex && \
          pdflatex -interaction=nonstopmode paper.tex )

# Spanish
( cd es && pdflatex -interaction=nonstopmode paper-es.tex && \
          bibtex paper-es && \
          pdflatex -interaction=nonstopmode paper-es.tex && \
          pdflatex -interaction=nonstopmode paper-es.tex )

# 2) Flatten each paper into a single self-contained .tex (inline \input + .bbl)
#    --web keeps the LaTeX untouched and writes a fig:<label> -> SVG manifest.
#    (Handing \includegraphics to pandoc makes it drop 8 longtables.)
python3 flatten_tex.py en/paper.tex     en/paper.bbl     /tmp/paper-en-flat.tex --web --manifest /tmp/paper-en-figures.json
python3 flatten_tex.py es/paper-es.tex  es/paper-es.bbl  /tmp/paper-es-flat.tex --web --manifest /tmp/paper-es-figures.json

# 3) Convert to standalone HTML with MathJax + TOC
pandoc /tmp/paper-en-flat.tex -f latex -t html5 \
    --standalone --mathjax --toc --toc-depth=3 -V lang=en \
    -o paper-en.html

pandoc /tmp/paper-es-flat.tex -f latex -t html5 \
    --standalone --mathjax --toc --toc-depth=3 -V lang=es \
    -o paper-es.html

# 4) Inject the SVG figures into their empty <figure> and mark images lazy
python3 postprocess_html.py --manifest /tmp/paper-en-figures.json paper-en.html
python3 postprocess_html.py --manifest /tmp/paper-es-figures.json paper-es.html
```

Every figure exists in English and Spanish (`<name>.svg` / `<name>-es.svg`); the
Spanish paper's `\includegraphics` point at the `-es` sources, so
`flatten_tex.py` maps its `fig:` labels to the `-es.svg` files automatically and
the Paper tab's language switch swaps the whole figure set.

The SVG figures themselves are generated in the main repo and copied here:

```bash
( cd ../../../docs/paper/figures && ./build-figures.sh svg )
# then copy docs/paper/figures/**/*.svg ->
#   frankenstein-transformer/paper/figures/**/*.svg
```

## Notes

- Figures are inline SVG in the HTML. Pandoc drops the `\fitfigure`
  (`\adjustbox`) wrapper and leaves a caption-only `<figure id="fig:...">`;
  `flatten_tex.py --web` maps those labels to SVGs and `postprocess_html.py`
  injects the `<img>`. Do **not** let pandoc parse `\includegraphics`: doing so
  silently drops 8 `longtable` environments in the schema annex.
- Algorithmic pseudocode (`algorithm`/`algpseudocode`) still does not render in
  the HTML output; the banner points readers to the PDF for it.
- The compiled PDFs are also served at `/frankenstein-transformer/paper/en.pdf`
  and `es.pdf` (the top-level copies kept in sync with `en/paper.pdf` and
  `es/paper-es.pdf`).
- Bibtex may emit `empty year` warnings for entries exported by Zotero with a
  `date` field but no `year` field (plainnat reads only `year`). These have
  been resolved by adding `year = {...}` to the affected entries; no `[?]`
  placeholders should appear. If new Zotero exports reintroduce the issue, add
  the `year` field derived from `date`.
