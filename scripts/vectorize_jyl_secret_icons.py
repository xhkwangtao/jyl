#!/usr/bin/env python3

import argparse
import json
import math
import struct
import zlib
from collections import Counter
from pathlib import Path
from typing import Iterable, List, Sequence, Tuple


PNG_SIG = b"\x89PNG\r\n\x1a\n"


def png_chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def build_png(width: int, height: int, color_type: int, pixel_rows: bytes) -> bytes:
    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, color_type, 0, 0, 0)
    raw = bytearray()
    channels = {0: 1, 2: 3, 6: 4}[color_type]
    row_size = width * channels
    for offset in range(0, len(pixel_rows), row_size):
        raw.append(0)
        raw.extend(pixel_rows[offset : offset + row_size])
    return (
        signature
        + png_chunk(b"IHDR", ihdr)
        + png_chunk(b"IDAT", zlib.compress(bytes(raw), level=9))
        + png_chunk(b"IEND", b"")
    )


def read_png(path: Path) -> Tuple[int, int, int, List[bytes]]:
    data = path.read_bytes()
    if not data.startswith(PNG_SIG):
        raise ValueError(f"{path} is not a PNG")
    pos = 8
    width = height = color_type = None
    idat_parts: List[bytes] = []
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        tag = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if tag == b"IHDR":
            width, height, bit_depth, color_type, _, _, _ = struct.unpack(
                ">IIBBBBB", chunk
            )
            if bit_depth != 8:
                raise ValueError(f"Unsupported PNG bit depth: {bit_depth}")
        elif tag == b"IDAT":
            idat_parts.append(chunk)
        elif tag == b"IEND":
            break
    if width is None or height is None or color_type is None:
        raise ValueError(f"PNG {path} is missing IHDR")
    raw = zlib.decompress(b"".join(idat_parts))
    channels = {0: 1, 2: 3, 6: 4}.get(color_type)
    if channels is None:
        raise ValueError(f"Unsupported PNG color type: {color_type}")
    stride = width * channels
    rows: List[bytes] = []
    idx = 0
    for _ in range(height):
        filter_type = raw[idx]
        if filter_type != 0:
            raise ValueError(f"Unsupported PNG row filter: {filter_type}")
        idx += 1
        rows.append(raw[idx : idx + stride])
        idx += stride
    return width, height, color_type, rows


def rgba_pixels(color_type: int, rows: Sequence[bytes]) -> List[Tuple[int, int, int, int]]:
    pixels: List[Tuple[int, int, int, int]] = []
    if color_type == 6:
        for row in rows:
            for x in range(0, len(row), 4):
                pixels.append(tuple(row[x : x + 4]))
    elif color_type == 2:
        for row in rows:
            for x in range(0, len(row), 3):
                r, g, b = row[x : x + 3]
                pixels.append((r, g, b, 255))
    elif color_type == 0:
        for row in rows:
            for value in row:
                pixels.append((value, value, value, 255))
    else:
        raise ValueError(color_type)
    return pixels


def analyze_icon(
    width: int, height: int, pixels: Sequence[Tuple[int, int, int, int]], alpha_threshold: int
) -> dict:
    opaque = 0
    min_x = width
    min_y = height
    max_x = -1
    max_y = -1
    colors = Counter()
    mask: List[List[bool]] = [[False] * width for _ in range(height)]

    for idx, (r, g, b, a) in enumerate(pixels):
        y, x = divmod(idx, width)
        if a >= alpha_threshold:
            mask[y][x] = True
            opaque += 1
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)
            colors[(r, g, b)] += 1

    if max_x == -1:
        raise ValueError("Image has no opaque pixels")

    fill_rgb, _ = colors.most_common(1)[0]
    coverage = opaque / (width * height)
    return {
        "mask": mask,
        "fill_rgb": fill_rgb,
        "opaque_pixels": opaque,
        "coverage_ratio": coverage,
        "bbox": (min_x, min_y, max_x, max_y),
    }


def crop_rgba(
    width: int,
    height: int,
    pixels: Sequence[Tuple[int, int, int, int]],
    bbox: Tuple[int, int, int, int],
    padding: int,
) -> Tuple[int, int, bytes]:
    min_x, min_y, max_x, max_y = bbox
    x0 = max(0, min_x - padding)
    y0 = max(0, min_y - padding)
    x1 = min(width, max_x + 1 + padding)
    y1 = min(height, max_y + 1 + padding)
    out = bytearray()
    for y in range(y0, y1):
        row_start = y * width
        for x in range(x0, x1):
            out.extend(pixels[row_start + x])
    return x1 - x0, y1 - y0, bytes(out)


def crop_mask(
    mask: Sequence[Sequence[bool]],
    bbox: Tuple[int, int, int, int],
    padding: int,
) -> Tuple[int, int, int, int, List[List[bool]]]:
    min_x, min_y, max_x, max_y = bbox
    height = len(mask)
    width = len(mask[0]) if height else 0
    x0 = max(0, min_x - padding)
    y0 = max(0, min_y - padding)
    x1 = min(width, max_x + 1 + padding)
    y1 = min(height, max_y + 1 + padding)
    cropped = [list(row[x0:x1]) for row in mask[y0:y1]]
    return x0, y0, x1, y1, cropped


def row_runs(row: Sequence[bool]) -> List[Tuple[int, int]]:
    runs: List[Tuple[int, int]] = []
    start = None
    for idx, value in enumerate(row):
        if value and start is None:
            start = idx
        elif not value and start is not None:
            runs.append((start, idx))
            start = None
    if start is not None:
        runs.append((start, len(row)))
    return runs


def merge_runs_to_rects(mask: Sequence[Sequence[bool]]) -> List[Tuple[int, int, int, int]]:
    rects: List[Tuple[int, int, int, int]] = []
    active: dict = {}

    for y in range(len(mask) + 1):
        runs = row_runs(mask[y]) if y < len(mask) else []
        next_active = {}
        for run in runs:
            if run in active:
                next_active[run] = active[run]
            else:
                next_active[run] = y
        for run, start_y in active.items():
            if run not in next_active:
                x0, x1 = run
                rects.append((x0, start_y, x1 - x0, y - start_y))
        active = next_active

    return rects


def rects_to_svg_path(rects: Iterable[Tuple[int, int, int, int]]) -> str:
    parts = []
    for x, y, w, h in rects:
        parts.append(f"M{x} {y}h{w}v{h}h-{w}Z")
    return "".join(parts)


def rgb_to_hex(rgb: Tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def render_contact_sheet(
    icons: Sequence[dict], out_path: Path, cell_size: int = 220, padding: int = 24
) -> None:
    if not icons:
        return
    columns = 4
    rows = math.ceil(len(icons) / columns)
    width = columns * cell_size + (columns + 1) * padding
    height = rows * cell_size + (rows + 1) * padding
    canvas = bytearray([255] * width * height * 4)

    def paste_rgba(
        target: bytearray,
        target_width: int,
        src_width: int,
        src_height: int,
        src_pixels: Sequence[Tuple[int, int, int, int]],
        offset_x: int,
        offset_y: int,
    ) -> None:
        for sy in range(src_height):
            ty = offset_y + sy
            if ty < 0 or ty >= height:
                continue
            for sx in range(src_width):
                tx = offset_x + sx
                if tx < 0 or tx >= width:
                    continue
                sr, sg, sb, sa = src_pixels[sy * src_width + sx]
                if sa == 0:
                    continue
                dst_idx = (ty * target_width + tx) * 4
                dr, dg, db, da = target[dst_idx : dst_idx + 4]
                alpha = sa / 255.0
                inv = 1.0 - alpha
                target[dst_idx] = int(sr * alpha + dr * inv)
                target[dst_idx + 1] = int(sg * alpha + dg * inv)
                target[dst_idx + 2] = int(sb * alpha + db * inv)
                target[dst_idx + 3] = int(255 * (alpha + (da / 255.0) * inv))

    for index, icon in enumerate(icons):
        col = index % columns
        row = index // columns
        cell_x = padding + col * (cell_size + padding)
        cell_y = padding + row * (cell_size + padding)
        src_w = icon["cropped_width"]
        src_h = icon["cropped_height"]
        scale = min(cell_size / src_w, cell_size / src_h)
        scaled_w = max(1, int(round(src_w * scale)))
        scaled_h = max(1, int(round(src_h * scale)))

        scaled: List[Tuple[int, int, int, int]] = []
        for y in range(scaled_h):
            src_y = min(src_h - 1, int(y / scale))
            for x in range(scaled_w):
                src_x = min(src_w - 1, int(x / scale))
                scaled.append(icon["cropped_pixels"][src_y * src_w + src_x])

        offset_x = cell_x + (cell_size - scaled_w) // 2
        offset_y = cell_y + (cell_size - scaled_h) // 2
        paste_rgba(canvas, width, scaled_w, scaled_h, scaled, offset_x, offset_y)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(build_png(width, height, 6, bytes(canvas)))


def main() -> int:
    parser = argparse.ArgumentParser(description="Vectorize extracted JYL secret icons.")
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("docs/tracks/jyl_pdf_assets/manifest.json"),
        help="Manifest file generated by extract_jyl_pdf_assets.py",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("docs/tracks/jyl_pdf_assets/icons"),
        help="Output directory for cropped PNGs, SVGs, and manifests",
    )
    parser.add_argument(
        "--alpha-threshold",
        type=int,
        default=128,
        help="Alpha threshold used to decide opaque pixels",
    )
    parser.add_argument(
        "--max-coverage",
        type=float,
        default=0.6,
        help="Skip images whose opaque coverage exceeds this ratio",
    )
    parser.add_argument(
        "--padding",
        type=int,
        default=12,
        help="Padding added around cropped icons",
    )
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    candidates = [
        item
        for item in manifest["items"]
        if item["status"] == "ok"
        and item["width"] == 886
        and item["height"] == 886
        and item.get("smask") is not None
        and item["path"].endswith(".png")
    ]

    svg_dir = args.out_dir / "svg"
    png_dir = args.out_dir / "png"
    svg_dir.mkdir(parents=True, exist_ok=True)
    png_dir.mkdir(parents=True, exist_ok=True)

    generated = []

    for item in candidates:
        source_path = Path(item["path"])
        width, height, color_type, rows = read_png(source_path)
        pixels = rgba_pixels(color_type, rows)
        analysis = analyze_icon(width, height, pixels, args.alpha_threshold)

        if analysis["coverage_ratio"] > args.max_coverage:
            continue

        fill_hex = rgb_to_hex(analysis["fill_rgb"])
        x0, y0, x1, y1, cropped_mask = crop_mask(
            analysis["mask"], analysis["bbox"], args.padding
        )
        rects = merge_runs_to_rects(cropped_mask)
        path_data = rects_to_svg_path(rects)
        cropped_width = x1 - x0
        cropped_height = y1 - y0
        cropped_png_w, cropped_png_h, cropped_png = crop_rgba(
            width, height, pixels, analysis["bbox"], args.padding
        )

        if cropped_width != cropped_png_w or cropped_height != cropped_png_h:
            raise ValueError("Crop size mismatch between mask and PNG data")

        base_name = f"secret_obj_{item['object']:03d}"
        svg_path = svg_dir / f"{base_name}.svg"
        png_path = png_dir / f"{base_name}.png"

        svg_content = (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{cropped_width}" '
            f'height="{cropped_height}" viewBox="0 0 {cropped_width} {cropped_height}">'
            f'<path fill="{fill_hex}" d="{path_data}"/></svg>\n'
        )
        svg_path.write_text(svg_content, encoding="utf-8")
        png_path.write_bytes(build_png(cropped_width, cropped_height, 6, cropped_png))

        generated.append(
            {
                "object": item["object"],
                "source_path": str(source_path),
                "svg_path": str(svg_path),
                "png_path": str(png_path),
                "fill": fill_hex,
                "coverage_ratio": round(analysis["coverage_ratio"], 6),
                "opaque_pixels": analysis["opaque_pixels"],
                "bbox": {
                    "min_x": analysis["bbox"][0],
                    "min_y": analysis["bbox"][1],
                    "max_x": analysis["bbox"][2],
                    "max_y": analysis["bbox"][3],
                },
                "crop": {
                    "x0": x0,
                    "y0": y0,
                    "x1": x1,
                    "y1": y1,
                    "width": cropped_width,
                    "height": cropped_height,
                },
                "rect_count": len(rects),
                "cropped_width": cropped_width,
                "cropped_height": cropped_height,
                "cropped_pixels": [
                    tuple(cropped_png[idx : idx + 4])
                    for idx in range(0, len(cropped_png), 4)
                ],
            }
        )

    render_contact_sheet(generated, args.out_dir / "contact_sheet.png")

    manifest_out = []
    for item in generated:
        clean = dict(item)
        clean.pop("cropped_pixels")
        manifest_out.append(clean)

    (args.out_dir / "manifest.json").write_text(
        json.dumps(
            {
                "source_manifest": str(args.manifest),
                "icons_generated": len(manifest_out),
                "items": manifest_out,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    summary = [
        f"icons_generated: {len(manifest_out)}",
        f"svg_dir: {svg_dir}",
        f"png_dir: {png_dir}",
        f"contact_sheet: {args.out_dir / 'contact_sheet.png'}",
    ]
    (args.out_dir / "summary.txt").write_text("\n".join(summary), encoding="utf-8")
    print(f"Generated {len(manifest_out)} vector icons in {args.out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
