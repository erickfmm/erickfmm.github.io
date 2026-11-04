#!/usr/bin/env python3
"""Post-process the pandoc HTML of the paper for the website.

Pandoc cannot be handed the figure images directly: when it parses
``\\includegraphics`` it silently drops several ``longtable`` environments in
the schema annex. So ``flatten_tex.py --web`` leaves the LaTeX untouched
(pandoc still drops the ``\\fitfigure`` wrapper and emits an empty ``<figure
id="fig:...">``) and writes a manifest mapping every figure label to its SVG.
This script injects those SVGs and marks every ``<img>`` as lazy-loaded.

Usage:
    python3 postprocess_html.py --manifest figures.json paper-en.html [paper-es.html]

The substitution is idempotent: figures that already contain an ``<img>`` are
left untouched, and the manifest entries that no figure consumed are reported.
"""
import argparse
import html
import json
import re
import sys
from pathlib import Path

FIGURE_RE = re.compile(
    r'(<figure id="(fig:[^"]+)"[^>]*>)(.*?)</figure>', re.S
)
IMG_RE = re.compile(r"<img\b(?![^>]*\bloading=)([^>]*)>")


def inject_figures(
    doc: str, manifest: dict[str, str]
) -> tuple[str, int, list[str], list[str]]:
    """Insert the manifest SVG into each empty figure, matched by fig: label."""
    placed: set[str] = set()
    unknown: list[str] = []

    def repl(match):
        opening, fid, body = match.group(1), match.group(2), match.group(3)
        url = manifest.get(fid)
        if url is None:
            unknown.append(fid)
            return match.group(0)
        if "<img" in body:
            placed.add(fid)
            return match.group(0)
        placed.add(fid)
        img = (
            '<p><span><img loading="lazy" decoding="async" '
            f'src="{html.escape(url)}" alt="image" /></span></p>'
        )
        return opening + img + body + "</figure>"

    out = FIGURE_RE.sub(repl, doc)
    unused = [label for label in manifest if label not in placed]
    return out, len(placed), unknown, unused


def add_lazy_images(doc: str) -> tuple[str, int]:
    count = 0

    def repl(m):
        nonlocal count
        count += 1
        return '<img loading="lazy" decoding="async"' + m.group(1) + ">"

    return IMG_RE.sub(repl, doc), count


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("html", nargs="+", type=Path, help="pandoc HTML files")
    parser.add_argument(
        "--manifest",
        type=Path,
        help="JSON manifest written by flatten_tex.py --web",
    )
    parser.add_argument(
        "--allow-missing",
        action="store_true",
        help="do not fail when the manifest and the HTML do not match exactly",
    )
    args = parser.parse_args(argv)

    manifest: dict[str, str] = {}
    if args.manifest is not None:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))

    problems = 0
    for path in args.html:
        doc = path.read_text(encoding="utf-8")
        injected = 0
        if manifest:
            doc, injected, unknown, unused = inject_figures(doc, manifest)
            if unknown:
                problems += len(unknown)
                print(
                    f"WARNING {path}: {len(unknown)} <figure> labels absent from the manifest: "
                    + ", ".join(unknown[:8]),
                    file=sys.stderr,
                )
            if unused:
                problems += len(unused)
                print(
                    f"WARNING {path}: {len(unused)} manifest figures not found in the HTML: "
                    + ", ".join(unused[:8]),
                    file=sys.stderr,
                )
        doc, lazy = add_lazy_images(doc)
        path.write_text(doc, encoding="utf-8")
        print(f"{path}: {injected} figures injected, {lazy} images marked lazy")

    if problems and not args.allow_missing:
        print(f"ERROR: {problems} figure/manifest mismatches", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
