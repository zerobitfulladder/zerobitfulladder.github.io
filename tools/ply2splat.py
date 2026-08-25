"""Convert a Gaussian-splat PLY into the compact .splat format.

The .splat layout is 32 bytes per gaussian: position (3f32), scale (3f32),
colour (4u8 RGBA) and rotation (4u8, w first). Spherical harmonics above the
DC term are dropped because the web renderer stores only a flat colour; on a
typical face capture those bands carry ~4% of the DC magnitude.

Nothing is discarded by default. Cropping and filtering are opt-in.

Property order is read from the header rather than assumed: Brush writes
x/y/z last, where the Inria exporter writes them first.

    uv run python tools/ply2splat.py in.ply out.splat [options]

Options:
    --centre R          working radius used to locate the subject (default 6)
    --no-centre         leave the cloud where it is
    --crop R            DISCARD gaussians beyond R of the subject centre
    --min-alpha N       discard gaussians with 8-bit alpha below N
    --max-scale F       discard gaussians whose largest axis exceeds F
    --rotate X,Y,Z      level the subject, in degrees (gsplat YXZ order)
    --shift X,Y,Z       translate after rotating, to put the orbit target on
                        the origin (so idle rotation pivots where the camera
                        is actually looking)
    --flip-yz           COLMAP/Brush Y-down -> Y-up (180 deg about X)
    --head-centre       bias the pivot upward (only for head+shoulders busts)
"""

import re
import sys
from pathlib import Path

import numpy as np

SH_C0 = 0.28209479177387814


def euler_to_quat(rx: float, ry: float, rz: float) -> np.ndarray:
    """Euler degrees -> (w, x, y, z), matching gsplat's Quaternion.FromEuler.

    gsplat uses Three.js YXZ order. Ported verbatim so that angles dialled in
    the browser bake to exactly the same orientation here.
    """
    n, i, e = np.radians([rx, ry, rz]) / 2.0
    A, o = np.cos(i), np.sin(i)
    s_, r_ = np.cos(n), np.sin(n)
    Q, I = np.cos(e), np.sin(e)
    return np.array([
        A * s_ * Q + o * r_ * I,      # w
        A * r_ * Q + o * s_ * I,      # x
        o * s_ * Q - A * r_ * I,      # y
        A * s_ * I - o * r_ * Q,      # z
    ], dtype=np.float64)


def quat_mul(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Hamilton product, (w, x, y, z), broadcasting over rows of b."""
    aw, ax, ay, az = a
    bw, bx, by, bz = b[:, 0], b[:, 1], b[:, 2], b[:, 3]
    return np.stack([
        aw * bw - ax * bx - ay * by - az * bz,
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
    ], axis=1)


def rotate_points(p: np.ndarray, q: np.ndarray) -> np.ndarray:
    """Rotate points by quaternion (w, x, y, z)."""
    w, x, y, z = q
    R = np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
        [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
        [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
    ])
    return p @ R.T


def locate_subject(xyz: np.ndarray, weight: np.ndarray, radius: float) -> np.ndarray:
    """Find the dense cluster's centre.

    A plain mean is dragged off-target by background geometry, so re-estimate
    from whatever falls inside the working radius until it settles.
    """
    centre = np.average(xyz, axis=0, weights=weight)
    for _ in range(12):
        inside = np.linalg.norm(xyz - centre, axis=1) <= radius
        if inside.sum() < 50:
            break
        moved = np.average(xyz[inside], axis=0, weights=weight[inside])
        if np.linalg.norm(moved - centre) < 1e-4:
            return moved
        centre = moved
    return centre


def convert(src: Path, dst: Path, opts: dict) -> None:
    raw = src.read_bytes()
    marker = b"end_header\n"
    head_end = raw.index(marker) + len(marker)
    header = raw[:head_end].decode("ascii", "replace")

    total = int(re.search(r"element vertex (\d+)", header).group(1))
    names = re.findall(r"property float (\S+)", header)
    if len(names) != len(re.findall(r"property (\S+) (\S+)", header)):
        raise SystemExit("Only all-float32 PLY bodies are supported.")

    idx = {name: i for i, name in enumerate(names)}
    data = np.frombuffer(raw, dtype=np.float32, count=total * len(names),
                         offset=head_end).reshape(total, len(names))

    def col(name: str) -> np.ndarray:
        return data[:, idx[name]]

    log_scale = np.stack([col(f"scale_{i}") for i in range(3)], axis=1)
    opacity = col("opacity")

    # Biggest, most opaque gaussians first, so a partial load still reads.
    order = np.argsort(-np.exp(log_scale.sum(axis=1)) / (1.0 + np.exp(-opacity)))

    xyz = np.stack([col(c) for c in "xyz"], axis=1)[order]
    scale = np.exp(log_scale[order])
    rot = np.stack([col(f"rot_{i}") for i in range(4)], axis=1)[order]
    rot = rot / np.linalg.norm(rot, axis=1, keepdims=True)
    dc = np.stack([col(f"f_dc_{i}") for i in range(3)], axis=1)[order]
    alpha = 1.0 / (1.0 + np.exp(-opacity[order]))

    keep = (alpha * 255) >= opts.get("min_alpha", 0)
    keep &= scale.max(axis=1) <= opts.get("max_scale", np.inf)

    centre = None
    if not opts.get("no_centre"):
        centre = locate_subject(xyz[keep], alpha[keep], opts.get("centre", 6.0))

    if opts.get("crop") is not None:
        if centre is None:
            raise SystemExit("--crop needs a centre; drop --no-centre.")
        keep &= np.linalg.norm(xyz - centre, axis=1) <= opts["crop"]

    xyz, scale, rot, dc, alpha = (
        xyz[keep], scale[keep], rot[keep], dc[keep], alpha[keep]
    )
    count = len(xyz)
    if centre is not None:
        xyz = xyz - centre

    if opts.get("flip_yz"):
        # COLMAP-style captures are Y-down/Z-forward; WebGL renderers assume
        # Y-up. Rotate 180 deg about X: negate y,z and premultiply the
        # rotations by (w,x,y,z) = (0,1,0,0).
        xyz[:, 1] *= -1.0
        xyz[:, 2] *= -1.0
        w, x, y, z = rot[:, 0], rot[:, 1], rot[:, 2], rot[:, 3]
        rot = np.stack([-x, w, z, -y], axis=1)
        print("  flipped Y/Z to a Y-up frame")

    if opts.get("rotate") is not None:
        # A capture's world frame is rarely level. Orbiting moves the camera
        # around the subject, so it can never remove a roll in the subject
        # itself — the model has to be rotated.
        rq = euler_to_quat(*opts["rotate"])
        xyz = rotate_points(xyz, rq).astype(np.float32)
        rot = quat_mul(rq, rot.astype(np.float64))
        rot = rot / np.linalg.norm(rot, axis=1, keepdims=True)
        print(f"  rotated by {tuple(opts['rotate'])} deg")

    if opts.get("shift") is not None:
        xyz = xyz + np.array(opts["shift"], dtype=np.float32)
        print(f"  shifted by {tuple(opts['shift'])}")

    if centre is not None and opts.get("head_centre"):
        # Only for busts. On a face-only capture the dense cluster IS the
        # head, and biasing upward pushes the pivot into the background.
        near = np.linalg.norm(xyz, axis=1) <= opts.get("centre", 6.0)
        if near.sum() > 100:
            up = xyz[near, 1]
            head = near.copy()
            head[near] = up >= np.percentile(up, 62)
            offset = np.average(xyz[head], axis=0, weights=alpha[head])
            xyz = xyz - offset
            print(f"  pivot moved to the head at "
                  f"[{offset[0]:.2f}, {offset[1]:.2f}, {offset[2]:.2f}]")

    out = np.zeros((count, 32), dtype=np.uint8)
    out[:, 0:12] = xyz.astype(np.float32).view(np.uint8).reshape(count, 12)
    out[:, 12:24] = scale.astype(np.float32).view(np.uint8).reshape(count, 12)
    out[:, 24:27] = np.clip((0.5 + SH_C0 * dc) * 255, 0, 255).astype(np.uint8)
    out[:, 27] = np.clip(alpha * 255, 0, 255).astype(np.uint8)
    out[:, 28:32] = np.clip(rot * 128 + 128, 0, 255).astype(np.uint8)
    dst.write_bytes(out.tobytes())

    subject = np.linalg.norm(xyz, axis=1)
    near = subject <= opts.get("centre", 6.0)
    if near.any():
        print(f"  subject p90 radius {np.percentile(subject[near], 90):.2f} "
              f"(camera distance ~{np.percentile(subject[near], 90) * 1.9:.1f})")
    print(f"  kept {count}/{total} ({count / total:.0%})")
    print(f"{count} gaussians  {src.stat().st_size / 1e6:.1f} MB -> "
          f"{dst.stat().st_size / 1e6:.1f} MB")


def parse_args(argv: list[str]) -> dict:
    opts: dict = {}
    i = 0
    while i < len(argv):
        flag, value = argv[i], (argv[i + 1] if i + 1 < len(argv) else "")
        if flag == "--centre":
            opts["centre"] = float(value)
        elif flag == "--crop":
            opts["crop"] = float(value)
        elif flag == "--rotate":
            opts["rotate"] = tuple(float(x) for x in value.split(","))
        elif flag == "--shift":
            opts["shift"] = tuple(float(x) for x in value.split(","))
        elif flag == "--min-alpha":
            opts["min_alpha"] = int(value)
        elif flag == "--max-scale":
            opts["max_scale"] = float(value)
        elif flag in ("--flip-yz", "--no-centre", "--head-centre"):
            opts[flag[2:].replace("-", "_")] = True
            i -= 1
        else:
            raise SystemExit(f"unknown option {flag}")
        i += 2
    return opts


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    convert(Path(sys.argv[1]), Path(sys.argv[2]), parse_args(sys.argv[3:]))
