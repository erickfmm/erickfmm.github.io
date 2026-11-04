#!/usr/bin/env python3
"""Flatten a LaTeX paper into a single self-contained .tex for pandoc.

Inlines every ``\\input{path}`` (recursively) and replaces
``\\bibliographystyle{...}`` / ``\\bibliography{...}`` with the contents of the
resolved ``.bbl`` file (produced by bibtex). The result is a single document
that pandoc can convert to HTML without resolving \\input or .bib at conversion
time.

With ``--web`` the document is additionally prepared for the browser build:

* ``\\fitfigure{...}`` (an ``\\adjustbox`` wrapper pandoc does not understand
  and therefore silently drops) is unwrapped, so the inner
  ``\\includegraphics`` survives the conversion.
* every ``\\includegraphics{...figures/<name>.pdf}`` is rewritten to the
  matching SVG under ``--figures-url``. The lookup is by file stem, so the
  English (``figures/<name>.pdf``) and Spanish (``../paper/figures/<name>.pdf``)
  sources both resolve against the same SVG tree.

Usage:
    python3 flatten_tex.py <input.tex> <input.bbl> <output.tex> [options]

Options:
    --web                 Prepare the document for the HTML/paper-tab build.
    --figures-dir DIR     Directory holding the compiled SVG figures.
                          Defaults to ``figures`` relative to the current
                          working directory (the paper/ build root).
    --figures-url URL     URL prefix for the rewritten figures.
                          Default: /frankenstein-transformer/paper/figures

If <input.bbl> does not exist the bibliography is dropped (the rest still
inlines). Exit code is 0 on success.
"""
import argparse
import re
import sys
from pathlib import Path

DEFAULT_FIGURES_URL = "/frankenstein-transformer/paper/figures"

FIGURE_COMMAND = "\\fitfigure{"
INCLUDE_RE = re.compile(r"\\includegraphics\{([^}]+)\}")


def _flatten_inputs(text: str, base_dir: Path) -> str:
    def inline(m):
        target = base_dir / (m.group(1) + ".tex")
        if target.exists():
            sub = target.read_text(encoding="utf-8", errors="replace")
            return _flatten_inputs(sub, target.parent)
        return m.group(0)

    return re.sub(r"\\input\{([^}]+)\}", inline, text)


def _svg_index(figures_dir: Path) -> dict[str, str]:
    """Map a figure stem to its path (relative to figures_dir) in the SVG tree."""
    index: dict[str, str] = {}
    for svg in sorted(figures_dir.rglob("*.svg")):
        index.setdefault(svg.stem, svg.relative_to(figures_dir).as_posix())
    return index


def _webify(text: str, figures_dir: Path, figures_url: str) -> str:
    """Unwrap \\fitfigure and point every \\includegraphics at its SVG."""
    # Invocations look like `\fitfigure{\includegraphics{...}}`; the macro
    # definition ends with `\fitfigure}[1]{`, so replacing the trailing `{`
    # only touches call sites.
    text = text.replace(FIGURE_COMMAND, "{")

    if not figures_dir.is_dir():
        print(f"WARNING: figures dir not found: {figures_dir}", file=sys.stderr)
        return text

    index = _svg_index(figures_dir)
    if not index:
        print(f"WARNING: no .svg files under {figures_dir}", file=sys.stderr)
        return text

    prefix = figures_url.rstrip("/")
    missing: list[str] = []
    rewritten = 0

    def repl(m):
        nonlocal rewritten
        raw = m.group(1).strip()
        if raw.startswith(prefix):
            return m.group(0)
        rel = index.get(Path(raw).stem)
        if rel is None:
            missing.append(raw)
            return m.group(0)
        rewritten += 1
        return f"\\includegraphics{{{prefix}/{rel}}}"

    text = INCLUDE_RE.sub(repl, text)
    print(f"web figures: {rewritten} rewritten, {len(missing)} unresolved")
    for raw in missing:
        print(f"WARNING: no SVG for {raw}", file=sys.stderr)
    return text


def flatten(
    tex_path: Path,
    bbl_path: Path,
    web: bool = False,
    figures_dir: Path | None = None,
    figures_url: str = DEFAULT_FIGURES_URL,
) -> str:
    text = tex_path.read_text(encoding="utf-8", errors="replace")
    text = _flatten_inputs(text, tex_path.parent)

    bbl = ""
    if bbl_path.exists():
        bbl = bbl_path.read_text(encoding="utf-8", errors="replace")

    text = re.sub(r"\\bibliographystyle\{[^}]*\}\s*", "", text)
    text = re.sub(r"\\bibliography\{[^}]*\}", lambda _m: bbl, text)

    if web:
        text = _webify(text, figures_dir or Path("figures"), figures_url)
    return text


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Flatten a LaTeX paper into one .tex for pandoc.",
    )
    parser.add_argument("tex", type=Path, help="input .tex")
    parser.add_argument("bbl", type=Path, help="input .bbl")
    parser.add_argument("out", type=Path, help="output .tex")
    parser.add_argument(
        "--web",
        action="store_true",
        help="unwrap \\fitfigure and rewrite figure includes to SVG",
    )
    parser.add_argument(
        "--figures-dir",
        type=Path,
        default=Path("figures"),
        help="directory with the compiled SVG figures (default: figures)",
    )
    parser.add_argument(
        "--figures-url",
        default=DEFAULT_FIGURES_URL,
        help=f"URL prefix for figures (default: {DEFAULT_FIGURES_URL})",
    )
    args = parser.parse_args()

    text = flatten(
        args.tex,
        args.bbl,
        web=args.web,
        figures_dir=args.figures_dir,
        figures_url=args.figures_url,
    )
    args.out.write_text(text, encoding="utf-8")
    print(f"OK {args.out} ({args.out.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
