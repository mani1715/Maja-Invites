#!/usr/bin/env python3
"""Find handlers that treat the admin-id STRING as a dict.

`auth.get_current_admin` returns `admins.id` — a plain `str`. Several handlers
annotated it `current_admin: dict` and then called `.get("admin_id")` on it.
That is an `AttributeError` on EVERY call, and because those modules wrap their
bodies in a bare `except Exception`, it surfaced as a 500 with a plausible
message rather than a crash anyone would chase:

    POST /profiles/{id}/referral-code   500 whenever a code had to be minted
    POST /admin/referrals/override      500 always
    POST /payments/create-order         500 always
    PUT  profile theme                  saved the theme, THEN 500'd on the
                                        audit-log line

Static analysis finds them without needing a request that reaches the line.
Run it after any change to the auth dependencies:

    python scripts/find_dict_admin_deref.py

Exit code 1 means something matched.

It deliberately does NOT flag a dereference guarded by `isinstance(x, dict)` —
that is the correct way to accept either shape, and flagging it would make this
a tool people learn to ignore.
"""
from __future__ import annotations

import ast
import io
import pathlib
import sys

# Dependencies that yield an id STRING, not a dict.
STR_DEPS = {"get_current_admin"}
DEREF_ATTRS = {"get", "keys", "items", "values", "pop"}


def _depends_on(default: ast.expr) -> str | None:
    """Return the dependency name if `default` is `Depends(<name>)`."""
    if not isinstance(default, ast.Call):
        return None
    func = default.func
    name = getattr(func, "id", None) or getattr(func, "attr", None)
    if name != "Depends" or not default.args:
        return None
    dep = default.args[0]
    return getattr(dep, "id", None) or getattr(dep, "attr", None)


def _str_dep_params(fn: ast.AST) -> set[str]:
    args = list(fn.args.args) + list(fn.args.kwonlyargs)
    defaults = ([None] * (len(fn.args.args) - len(fn.args.defaults))
                + list(fn.args.defaults) + list(fn.args.kw_defaults))
    return {a.arg for a, d in zip(args, defaults)
            if d is not None and _depends_on(d) in STR_DEPS}


def _isinstance_dict_guarded(fn: ast.AST, name: str) -> set[int]:
    """Line numbers inside `if isinstance(<name>, dict): ...` bodies.

    Also covers `elif`, since ast models that as a nested If in `orelse`.
    """
    safe: set[int] = set()
    for node in ast.walk(fn):
        if not isinstance(node, ast.If):
            continue
        test = node.test
        if not (isinstance(test, ast.Call)
                and getattr(test.func, "id", None) == "isinstance"
                and len(test.args) == 2
                and getattr(test.args[0], "id", None) == name
                and getattr(test.args[1], "id", None) == "dict"):
            continue
        for sub in node.body:
            for n in ast.walk(sub):
                if hasattr(n, "lineno"):
                    safe.add(n.lineno)
    return safe


def scan(root: pathlib.Path) -> list[tuple[str, int, str, str]]:
    hits: list[tuple[str, int, str, str]] = []
    for path in sorted(root.glob("*.py")):
        try:
            tree = ast.parse(io.open(path, encoding="utf-8").read())
        except (SyntaxError, OSError):
            continue
        for fn in [n for n in ast.walk(tree)
                   if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]:
            names = _str_dep_params(fn)
            if not names:
                continue
            safe_lines = set()
            for name in names:
                safe_lines |= _isinstance_dict_guarded(fn, name)
            for node in ast.walk(fn):
                what = None
                if (isinstance(node, ast.Attribute)
                        and isinstance(node.value, ast.Name)
                        and node.value.id in names
                        and node.attr in DEREF_ATTRS):
                    what = f".{node.attr}()"
                elif (isinstance(node, ast.Subscript)
                      and isinstance(node.value, ast.Name)
                      and node.value.id in names):
                    what = "[...]"
                if what and node.lineno not in safe_lines:
                    hits.append((str(path), node.lineno, fn.name, what))
    return sorted(set(hits))


def main() -> int:
    root = pathlib.Path(__file__).resolve().parent.parent / "backend"
    hits = scan(root)
    for path, lineno, fn, what in hits:
        print(f"{path}:{lineno}  {fn}()  dereferences the admin-id string with {what}")
    if not hits:
        print("admin-id deref scan: clean")
        return 0
    print(f"\n{len(hits)} dereference(s) in "
          f"{len({(h[0], h[2]) for h in hits})} handler(s).\n"
          "get_current_admin returns a str. Take it as `admin_id: str` and use "
          "it directly, or guard with isinstance(x, dict).", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
