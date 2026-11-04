#!/usr/bin/env python3
"""Post-process the pandoc HTML of the paper for the website.

The paper tab loads 70+ inline SVG figures, so every ``<img>`` is marked
``loading="lazy"`` (and ``decoding="async"``) to keep the initial render cheap.
The substitution is idempotent: images that already carry a ``loading``
attribute are left untouched.

Usage:
    python3 postprocess_html.py paper-en.html paper-es.html
"""
import re
import sys
from pathlib import Path

IMG_RE = re.compile(r"<img\b(?![^>]*\bloading=)([^>]*)>")


def add_lazy_images(html: str) -> tuple[str, int]:
    count = 0

    def repl(m):
        nonlocal count
        count += 1
        return '<img loading="lazy" decoding="async"' + m.group(1) + ">"

    return IMG_RE.sub(repl, html), count


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    for name in argv:
        path = Path(name)
        html = path.read_text(encoding="utf-8")
        html, count = add_lazy_images(html)
        path.write_text(html, encoding="utf-8")
        print(f"{path}: {count} images marked lazy")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
