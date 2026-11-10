#!/usr/bin/env python3
"""Flatten a LaTeX paper into a single self-contained .tex for pandoc.

Inlines every ``\\input{path}`` (recursively) and replaces
``\\bibliographystyle{...}`` / ``\\bibliography{...}`` with the contents of the
resolved ``.bbl`` file (produced by bibtex). The result is a single document
that pandoc can convert to HTML without resolving \\input or .bib at
conversion time.

With ``--web`` the document is prepared for the browser build. The figures are
**not** rewritten inside the LaTeX: letting pandoc see ``\\includegraphics``
makes it drop several ``longtable`` environments later in the document. Instead
the LaTeX is left untouched (pandoc still discards the ``\\adjustbox``-based
``\\fitfigure`` wrapper) and a JSON manifest maps each ``fig:<label>`` to the
SVG that ``postprocess_html.py`` injects into the matching empty ``<figure>``.

Usage:
    python3 flatten_tex.py <input.tex> <input.bbl> <output.tex> [options]

Options:
    --web                 Emit the figure manifest for the HTML build.
    --manifest PATH       Where to write the manifest (default: <output>.figures.json).
    --figures-dir DIR     Directory holding the compiled SVG figures.
                          Defaults to ``figures`` relative to the current
                          working directory (the paper/ build root).
    --figures-url URL     URL prefix for the figure SVGs.
                          Default: /frankenstein-transformer/paper/figures

If <input.bbl> does not exist the bibliography is dropped (the rest still
inlines). Exit code is 0 on success.
"""
import argparse
import json
import re
import sys
from pathlib import Path

DEFAULT_FIGURES_URL = "/frankenstein-transformer/paper/figures"

FIGURE_ENV_RE = re.compile(r"\\begin\{figure\}(?:\[[^\]]*\])?(.*?)\\end\{figure\}", re.S)
INCLUDE_RE = re.compile(r"\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}")
LABEL_RE = re.compile(r"\\label\{(fig:[^}]+)\}")


def _flatten_inputs(text: str, base_dir: Path, root_dir: Path | None = None) -> str:
    # LaTeX resolves \input relative to the main document, but a nested include
    # may also be written relative to its own file; try both.
    if root_dir is None:
        root_dir = base_dir

    def inline(m):
        rel = m.group(1) + ".tex"
        for target in (base_dir / rel, root_dir / rel):
            if target.exists():
                sub = target.read_text(encoding="utf-8", errors="replace")
                return _flatten_inputs(sub, target.parent, root_dir)
        return m.group(0)

    return re.sub(r"\\input\{([^}]+)\}", inline, text)


def _svg_index(figures_dir: Path) -> dict[str, str]:
    """Map a figure stem to its path (relative to figures_dir) in the SVG tree."""
    index: dict[str, str] = {}
    for svg in sorted(figures_dir.rglob("*.svg")):
        index.setdefault(svg.stem, svg.relative_to(figures_dir).as_posix())
    return index


def figure_manifest(text: str, figures_dir: Path, figures_url: str) -> dict[str, str]:
    """Map every ``fig:<label>`` to the SVG URL that belongs in its figure."""
    if not figures_dir.is_dir():
        print(f"WARNING: figures dir not found: {figures_dir}", file=sys.stderr)
        return {}

    index = _svg_index(figures_dir)
    if not index:
        print(f"WARNING: no .svg files under {figures_dir}", file=sys.stderr)
        return {}

    prefix = figures_url.rstrip("/")
    manifest: dict[str, str] = {}
    missing: list[str] = []

    for match in FIGURE_ENV_RE.finditer(text):
        body = match.group(1)
        include = INCLUDE_RE.search(body)
        if include is None:
            continue
        label = LABEL_RE.search(body)
        if label is None:
            missing.append(f"{include.group(1)} (no fig: label)")
            continue
        rel = index.get(Path(include.group(1).strip()).stem)
        if rel is None:
            missing.append(f"{label.group(1)} -> {include.group(1)}")
            continue
        manifest[label.group(1)] = f"{prefix}/{rel}"

    print(f"web figures: {len(manifest)} mapped, {len(missing)} unresolved")
    for raw in missing:
        print(f"WARNING: no SVG for {raw}", file=sys.stderr)
    return manifest


def flatten(
    tex_path: Path,
    bbl_path: Path,
    web: bool = False,
    figures_dir: Path | None = None,
    figures_url: str = DEFAULT_FIGURES_URL,
) -> tuple[str, dict[str, str]]:
    text = tex_path.read_text(encoding="utf-8", errors="replace")
    text = _flatten_inputs(text, tex_path.parent)

    bbl = ""
    if bbl_path.exists():
        bbl = bbl_path.read_text(encoding="utf-8", errors="replace")

    text = re.sub(r"\\bibliographystyle\{[^}]*\}\s*", "", text)
    text = re.sub(r"\\bibliography\{[^}]*\}", lambda _m: bbl, text)

    manifest = (
        figure_manifest(text, figures_dir or Path("figures"), figures_url)
        if web
        else {}
    )
    return text, manifest


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
        help="write the fig:<label> -> SVG manifest for postprocess_html.py",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=None,
        help="manifest path (default: <output>.figures.json)",
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

    text, manifest = flatten(
        args.tex,
        args.bbl,
        web=args.web,
        figures_dir=args.figures_dir,
        figures_url=args.figures_url,
    )
    args.out.write_text(text, encoding="utf-8")
    print(f"OK {args.out} ({args.out.stat().st_size} bytes)")

    if args.web:
        manifest_path = args.manifest or args.out.with_suffix(
            args.out.suffix + ".figures.json"
        )
        manifest_path.write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        print(f"OK {manifest_path} ({len(manifest)} figures)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
