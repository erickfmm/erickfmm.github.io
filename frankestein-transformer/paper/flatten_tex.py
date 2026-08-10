#!/usr/bin/env python3
"""Flatten a LaTeX paper into a single self-contained .tex for pandoc.

Inlines every ``\\input{path}`` (recursively) and replaces
``\\bibliographystyle{...}`` / ``\\bibliography{...}`` with the contents of the
resolved ``.bbl`` file (produced by bibtex). The result is a single document
that pandoc can convert to HTML without resolving \\input or .bib at conversion
time.

Usage:
    python3 flatten_tex.py <input.tex> <input.bbl> <output.tex>

If <input.bbl> does not exist the bibliography is dropped (the rest still
inlines). Exit code is 0 on success.
"""
import re
import sys
from pathlib import Path


def _flatten_inputs(text: str, base_dir: Path) -> str:
    def inline(m):
        target = base_dir / (m.group(1) + ".tex")
        if target.exists():
            sub = target.read_text(encoding="utf-8", errors="replace")
            return _flatten_inputs(sub, target.parent)
        return m.group(0)

    return re.sub(r"\\input\{([^}]+)\}", inline, text)


def flatten(tex_path: Path, bbl_path: Path) -> str:
    text = tex_path.read_text(encoding="utf-8", errors="replace")
    text = _flatten_inputs(text, tex_path.parent)

    bbl = ""
    if bbl_path.exists():
        bbl = bbl_path.read_text(encoding="utf-8", errors="replace")

    text = re.sub(r"\\bibliographystyle\{[^}]*\}\s*", "", text)
    text = re.sub(r"\\bibliography\{[^}]*\}", lambda _m: bbl, text)
    return text


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__)
        return 2
    tex, bbl, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    out.write_text(flatten(tex, bbl), encoding="utf-8")
    print(f"OK {out} ({out.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
