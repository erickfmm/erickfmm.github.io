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
├── flatten_tex.py      # inlines \input + .bbl into one .tex for pandoc
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

## Full rebuild

From this directory (`frankestein-transformer/paper/`):

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
python3 flatten_tex.py en/paper.tex     en/paper.bbl     /tmp/paper-en-flat.tex
python3 flatten_tex.py es/paper-es.tex  es/paper-es.bbl  /tmp/paper-es-flat.tex

# 3) Convert to standalone HTML with MathJax + TOC
pandoc /tmp/paper-en-flat.tex -f latex -t html5 \
    --standalone --mathjax --toc --toc-depth=3 -V lang=en \
    -o paper-en.html

pandoc /tmp/paper-es-flat.tex -f latex -t html5 \
    --standalone --mathjax --toc --toc-depth=3 -V lang=es \
    -o paper-es.html
```

## Notes

- TikZ diagrams do not render in the HTML output. The web app already shows a
  banner telling readers to download the PDF for figures and algorithms.
- The compiled PDFs are also served at `/frankestein-transformer/paper/en.pdf`
  and `es.pdf` (the top-level copies kept in sync with `en/paper.pdf` and
  `es/paper-es.pdf`).
- Bibtex emits warnings for a few citations not present in the `.bib` files
  (e.g. `sun_attnres_2026`, `dosovitskiy2021vit`); these appear as `[?]` in the
  output and are expected.
