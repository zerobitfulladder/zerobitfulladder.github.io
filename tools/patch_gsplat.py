"""Expose OrbitControls' internal orbit state on the vendored gsplat build.

gsplat keeps alpha/beta/radius/target in closure variables with no getter, and
they cannot be recovered from outside: the camera transform gives three
equations for four unknowns (target xyz + radius). Without them there is no way
to read back a view the user has dialled in by hand.

This adds `getState()` and `setState()`. `setState` writes the *target*
alpha/beta/radius/target, and update() already damps the live values toward
those — so easing the camera home costs nothing extra.

Re-run it after re-vendoring gsplat.

    uv run python tools/patch_gsplat.py
"""

from pathlib import Path

TARGET = Path("docs/static/vendor/gsplat/gsplat.js")
ANCHOR = "Q = new R(l.x, l.y, l.z);\n    };\n"
STATE_API = (
    "    this.getState = () => ({ alpha: I, beta: d, radius: a,"
    " target: { x: Q.x, y: Q.y, z: Q.z } });\n"
    "    this.setState = (o) => { if (o.alpha !== void 0) I = o.alpha;"
    " if (o.beta !== void 0) d = o.beta;"
    " if (o.radius !== void 0) a = o.radius;"
    " if (o.target) Q = new R(o.target.x, o.target.y, o.target.z); };\n"
)
ADDITION = ANCHOR + STATE_API
OLD_GETSTATE = (
    "    this.getState = () => ({ alpha: I, beta: d, radius: a,"
    " target: { x: Q.x, y: Q.y, z: Q.z } });\n"
)


def main() -> None:
    src = TARGET.read_text(encoding="utf-8")
    if "this.setState" in src:
        print("already patched")
        return
    if "this.getState" in src:                     # upgrade an older patch
        TARGET.write_text(src.replace(OLD_GETSTATE, STATE_API), encoding="utf-8")
        print(f"patched {TARGET} — setState() added alongside getState()")
        return
    if src.count(ANCHOR) != 1:
        raise SystemExit(
            f"anchor matched {src.count(ANCHOR)} times, expected 1 — "
            "gsplat's build changed; re-derive the patch."
        )
    TARGET.write_text(src.replace(ANCHOR, ADDITION), encoding="utf-8")
    print(f"patched {TARGET} — getState()/setState() added")


if __name__ == "__main__":
    main()
