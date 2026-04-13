#!/usr/bin/env python3

import argparse
import json
import re
import struct
import sys
import zlib
from hashlib import sha1
from pathlib import Path
from typing import Dict, List, Optional, Tuple


OBJ_START_RE = re.compile(rb"(?m)^(\d+)\s+(\d+)\s+obj\b")
INT_RE = re.compile(rb"/%s\s+(\d+)")
REF_RE = re.compile(rb"/%s\s+(\d+)\s+(\d+)\s+R")


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


def normalize_stream_start(body: bytes, stream_pos: int) -> int:
    pos = stream_pos + len(b"stream")
    if body[pos : pos + 2] == b"\r\n":
        return pos + 2
    if body[pos : pos + 1] in {b"\r", b"\n"}:
        return pos + 1
    return pos


class PDFObject:
    def __init__(self, number: int, generation: int, body: bytes):
        self.number = number
        self.generation = generation
        self.body = body
        self.dict_bytes: Optional[bytes] = None
        self.stream: Optional[bytes] = None
        self._parse()

    def _parse(self) -> None:
        stream_pos = self.body.find(b"stream")
        if stream_pos == -1:
            self.dict_bytes = self.body.strip()
            return
        self.dict_bytes = self.body[:stream_pos].strip()
        length = self.read_length()
        if length is None:
            return
        start = normalize_stream_start(self.body, stream_pos)
        self.stream = self.body[start : start + length]

    def read_length(self) -> Optional[int]:
        if self.dict_bytes is None:
            return None
        direct = re.search(rb"/Length\s+(\d+)", self.dict_bytes)
        if direct:
            return int(direct.group(1))
        return None


def load_objects(pdf_bytes: bytes) -> Dict[int, PDFObject]:
    matches = list(OBJ_START_RE.finditer(pdf_bytes))
    objects: Dict[int, PDFObject] = {}
    for idx, match in enumerate(matches):
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(pdf_bytes)
        body = pdf_bytes[start:end]
        endobj = body.rfind(b"endobj")
        if endobj != -1:
            body = body[:endobj]
        objects[int(match.group(1))] = PDFObject(
            int(match.group(1)),
            int(match.group(2)),
            body,
        )
    return objects


def get_object_body(objects: Dict[int, PDFObject], ref: int) -> bytes:
    obj = objects.get(ref)
    return obj.body if obj else b""


def resolve_icc_components(objects: Dict[int, PDFObject], ref: int) -> Optional[int]:
    body = get_object_body(objects, ref)
    match = re.search(rb"/N\s+(\d+)", body)
    return int(match.group(1)) if match else None


def read_int(dict_bytes: bytes, name: bytes) -> Optional[int]:
    match = re.search(rb"/" + name + rb"\s*(\d+)", dict_bytes)
    return int(match.group(1)) if match else None


def read_ref(dict_bytes: bytes, name: bytes) -> Optional[int]:
    match = re.search(rb"/" + name + rb"\s*(\d+)\s+(\d+)\s+R", dict_bytes)
    return int(match.group(1)) if match else None


def read_name_or_ref(dict_bytes: bytes, name: bytes) -> Optional[bytes]:
    match = re.search(
        rb"/" + name + rb"\s*(/?[A-Za-z0-9]+(?:\s+\d+\s+R)?|\[[^\]]+\])",
        dict_bytes,
    )
    return match.group(1) if match else None


def parse_colorspace(
    objects: Dict[int, PDFObject], value: Optional[bytes]
) -> Tuple[str, Optional[int]]:
    if value is None:
        return "unknown", None
    value = value.strip()
    if value == b"/DeviceRGB":
        return "rgb", 3
    if value == b"/DeviceGray":
        return "gray", 1
    if value == b"/DeviceCMYK":
        return "cmyk", 4
    if re.fullmatch(rb"\d+\s+\d+\s+R", value):
        ref = int(value.split()[0])
        ref_body = get_object_body(objects, ref).strip()
        return parse_colorspace(objects, ref_body)
    if value.startswith(b"[") and value.endswith(b"]"):
        if value.startswith(b"[/ICCBased"):
            ref_match = re.search(rb"/ICCBased\s+(\d+)\s+(\d+)\s+R", value)
            if ref_match:
                components = resolve_icc_components(objects, int(ref_match.group(1)))
                if components == 1:
                    return "gray", 1
                if components == 3:
                    return "rgb", 3
                if components == 4:
                    return "cmyk", 4
        if value.startswith(b"[/DeviceRGB"):
            return "rgb", 3
        if value.startswith(b"[/DeviceGray"):
            return "gray", 1
    return value.decode("latin1", errors="replace"), None


def decode_image_data(
    stream: bytes, filters: List[str], dict_bytes: bytes, colorspace_kind: str
) -> bytes:
    data = stream
    for flt in filters:
        if flt == "FlateDecode":
            data = zlib.decompress(data)
        elif flt in {"DCTDecode", "JPXDecode"}:
            return data
        else:
            raise ValueError(f"Unsupported filter: {flt}")
    return data


def parse_filters(dict_bytes: bytes) -> List[str]:
    array_match = re.search(rb"/Filter\s*\[([^\]]+)\]", dict_bytes)
    if array_match:
        return [item.decode("latin1") for item in re.findall(rb"/([A-Za-z0-9]+)", array_match.group(1))]
    single_match = re.search(rb"/Filter\s*/([A-Za-z0-9]+)", dict_bytes)
    return [single_match.group(1).decode("latin1")] if single_match else []


def combine_rgba(rgb: bytes, alpha: bytes) -> bytes:
    out = bytearray()
    for i in range(0, len(rgb), 3):
        out.extend(rgb[i : i + 3])
        out.append(alpha[i // 3])
    return bytes(out)


def decode_smask(
    objects: Dict[int, PDFObject], smask_ref: int, width: int, height: int
) -> bytes:
    smask_obj = objects[smask_ref]
    if smask_obj.stream is None or smask_obj.dict_bytes is None:
        raise ValueError(f"SMask object {smask_ref} has no stream")
    bits = read_int(smask_obj.dict_bytes, b"BitsPerComponent")
    if bits != 8:
        raise ValueError(f"SMask {smask_ref} uses unsupported bits={bits}")
    filters = parse_filters(smask_obj.dict_bytes)
    data = decode_image_data(smask_obj.stream, filters, smask_obj.dict_bytes, "gray")
    expected = width * height
    if len(data) != expected:
        raise ValueError(
            f"SMask {smask_ref} size mismatch, got {len(data)}, expected {expected}"
        )
    return data


def write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract embedded image assets from a PDF.")
    parser.add_argument("pdf", type=Path, help="Source PDF path")
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("docs/tracks/jyl_pdf_assets"),
        help="Output directory for extracted assets",
    )
    args = parser.parse_args()

    pdf_bytes = args.pdf.read_bytes()
    objects = load_objects(pdf_bytes)

    images_dir = args.out_dir / "images"
    manifest: List[dict] = []

    for obj_num in sorted(objects):
        obj = objects[obj_num]
        dict_bytes = obj.dict_bytes
        if not dict_bytes or b"/Subtype/Image" not in dict_bytes or obj.stream is None:
            continue

        width = read_int(dict_bytes, b"Width")
        height = read_int(dict_bytes, b"Height")
        bits = read_int(dict_bytes, b"BitsPerComponent")
        if not width or not height or not bits:
            continue

        filters = parse_filters(dict_bytes)
        colorspace_value = read_name_or_ref(dict_bytes, b"ColorSpace")
        colorspace_kind, components = parse_colorspace(objects, colorspace_value)
        smask_ref = read_ref(dict_bytes, b"SMask")

        base_name = f"obj_{obj_num:03d}_{width}x{height}"
        entry = {
            "object": obj_num,
            "width": width,
            "height": height,
            "bits_per_component": bits,
            "filters": filters,
            "colorspace": colorspace_kind,
            "smask": smask_ref,
        }

        try:
            if filters == ["DCTDecode"]:
                jpg_path = images_dir / f"{base_name}.jpg"
                write_bytes(jpg_path, obj.stream)
                entry["path"] = str(jpg_path)
                entry["sha1"] = sha1(obj.stream).hexdigest()
            elif filters == ["FlateDecode"]:
                if bits != 8:
                    raise ValueError(f"Unsupported bits per component: {bits}")
                if components not in {1, 3}:
                    raise ValueError(f"Unsupported component count: {components}")
                decoded = decode_image_data(obj.stream, filters, dict_bytes, colorspace_kind)
                expected = width * height * components
                if len(decoded) != expected:
                    raise ValueError(
                        f"Decoded size mismatch for object {obj_num}: got {len(decoded)}, expected {expected}"
                    )
                color_type = 0 if components == 1 else 2
                pixel_rows = decoded
                if smask_ref:
                    alpha = decode_smask(objects, smask_ref, width, height)
                    if components != 3:
                        raise ValueError("Alpha channel is only supported for RGB images")
                    pixel_rows = combine_rgba(decoded, alpha)
                    color_type = 6
                png_bytes = build_png(width, height, color_type, pixel_rows)
                png_path = images_dir / f"{base_name}.png"
                write_bytes(png_path, png_bytes)
                entry["path"] = str(png_path)
                entry["sha1"] = sha1(png_bytes).hexdigest()
            else:
                raise ValueError(f"Unsupported filter chain: {filters}")
            entry["status"] = "ok"
        except Exception as exc:  # noqa: BLE001
            entry["status"] = "error"
            entry["error"] = str(exc)

        manifest.append(entry)

    manifest_path = args.out_dir / "manifest.json"
    summary_path = args.out_dir / "summary.txt"
    ok_count = sum(1 for item in manifest if item["status"] == "ok")
    error_count = sum(1 for item in manifest if item["status"] == "error")

    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(
            {
                "pdf": str(args.pdf),
                "objects_total": len(objects),
                "images_extracted": ok_count,
                "images_failed": error_count,
                "items": manifest,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    summary_lines = [
        f"pdf: {args.pdf}",
        f"objects_total: {len(objects)}",
        f"images_extracted: {ok_count}",
        f"images_failed: {error_count}",
        "",
    ]
    for item in manifest:
        if item["status"] != "ok":
            summary_lines.append(
                f"[error] obj {item['object']}: {item.get('error', 'unknown error')}"
            )
    summary_path.write_text("\n".join(summary_lines), encoding="utf-8")
    print(f"Extracted {ok_count} images to {images_dir}")
    if error_count:
        print(f"{error_count} images failed, see {manifest_path}")
    return 0 if error_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
