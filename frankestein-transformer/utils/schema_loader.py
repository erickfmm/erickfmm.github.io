from __future__ import annotations

import copy
from pathlib import Path
from typing import Any, Dict

import yaml


def resolve_schema(schema_path: str | Path) -> Dict[str, Any]:
    """Load a YAML schema and resolve all ``$ref`` pointers in-place.

    Walks the loaded dict recursively. When a key ``$ref`` is found at any
    level, the referenced file is loaded and its contents are merged into the
    parent object (replacing the ``$ref`` key).  References are resolved
    relative to the directory of the file that contains them.

    Args:
        schema_path: Path to the root schema YAML file.

    Returns:
        Fully resolved schema dictionary with all ``$ref`` pointers inlined.
    """
    schema_path = Path(schema_path)
    with schema_path.open("r", encoding="utf-8") as handle:
        schema = yaml.safe_load(handle) or {}

    return _resolve_refs(schema, schema_path.parent)


def _resolve_refs(node: Any, base_dir: Path) -> Any:
    if isinstance(node, dict):
        if "$ref" in node:
            ref_path = base_dir / node["$ref"]
            with ref_path.open("r", encoding="utf-8") as handle:
                resolved = yaml.safe_load(handle) or {}
            resolved = _resolve_refs(resolved, ref_path.parent)
            return resolved
        result = {}
        for key, value in node.items():
            result[key] = _resolve_refs(value, base_dir)
        return result
    elif isinstance(node, list):
        return [_resolve_refs(item, base_dir) for item in node]
    return node
