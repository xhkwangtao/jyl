#!/usr/bin/env python3

import shutil
import struct
import zlib
from pathlib import Path


PNG_SIG = b"\x89PNG\r\n\x1a\n"
SOURCE_DIR = Path("docs/tracks/jyl_pdf_assets/icons")
NAMED_PNG_DIR = SOURCE_DIR / "named" / "png"
NAMED_SVG_DIR = SOURCE_DIR / "named" / "svg"
MINIPROGRAM_DIR = Path("miniprogram/images/secret-icons")

ICON_DEFINITIONS = [
  {"source_obj": 13, "asset_key": "gate-arch", "named_base": "01_翁万达广场_工匠暗号_拱门"},
  {"source_obj": 39, "asset_key": "cannon", "named_base": "02_大炮陈列处_军防暗号_火炮"},
  {"source_obj": 45, "asset_key": "war-drum", "named_base": "03_战鼓车_军防暗号_战鼓"},
  {"source_obj": 57, "asset_key": "leaf", "named_base": "04_步道分叉口_生态暗号_柏叶"},
  {"source_obj": 63, "asset_key": "flame", "named_base": "05_火焰广场_工匠暗号_火焰"},
  {"source_obj": 77, "asset_key": "stone-mountain", "named_base": "06_凿石料小景_工匠暗号_石山"},
  {"source_obj": 82, "asset_key": "poetry-book", "named_base": "07_诗词牌子上山段_文化暗号_诗卷"},
  {"source_obj": 88, "asset_key": "haul-cart", "named_base": "08_毛驴运输小景_工匠暗号_板车"},
  {"source_obj": 102, "asset_key": "stele-tablet", "named_base": "09_诗词牌子半山段_文化暗号_碑牌"},
  {"source_obj": 108, "asset_key": "climb-route", "named_base": "10_分叉路汇合点_生态暗号_山路"},
  {"source_obj": 119, "asset_key": "mountain-pass", "named_base": "11_城上卫生间_生态暗号_山口"},
  {"source_obj": 124, "asset_key": "command-tent", "named_base": "12_中军帐_军防暗号_军帐"},
  {"source_obj": 138, "asset_key": "camp-gate", "named_base": "13_营盘内_军防暗号_营盘"},
  {"source_obj": 143, "asset_key": "single-tower", "named_base": "14_单片楼_军防暗号_单片楼"},
  {"source_obj": 154, "asset_key": "inscription", "named_base": "15_碑刻区_文化暗号_碑刻"},
  {"source_obj": 166, "asset_key": "great-wall", "named_base": "16_第一楼石碑_军防暗号_长城"},
  {"source_obj": 171, "asset_key": "paw", "named_base": "17_野生动物牌_生态暗号_兽掌"},
  {"source_obj": 182, "asset_key": "medal", "named_base": "18_总结牌_生态暗号_勋章"},
  {"source_obj": 187, "asset_key": "pavilion", "named_base": "19_四海镇彩蛋牌_生态暗号_古亭"},
]

COLOR_PRESETS = {
  "dark": (17, 17, 17),
  "gray": (181, 186, 193),
}


def png_chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def build_png(width: int, height: int, color_type: int, pixel_rows: bytes) -> bytes:
    signature = PNG_SIG
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


def read_png_rgba(path: Path):
    data = path.read_bytes()
    if not data.startswith(PNG_SIG):
      raise ValueError(f"{path} is not a PNG")
    pos = 8
    width = height = color_type = None
    idat_parts = []
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        tag = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if tag == b"IHDR":
            width, height, bit_depth, color_type, _, _, _ = struct.unpack(">IIBBBBB", chunk)
            if bit_depth != 8:
                raise ValueError(f"Unsupported bit depth: {bit_depth}")
        elif tag == b"IDAT":
            idat_parts.append(chunk)
        elif tag == b"IEND":
            break
    if width is None or height is None or color_type is None:
        raise ValueError(f"Missing IHDR in {path}")
    raw = zlib.decompress(b"".join(idat_parts))
    channels = {0: 1, 2: 3, 6: 4}.get(color_type)
    if channels is None:
        raise ValueError(f"Unsupported color type: {color_type}")
    stride = width * channels
    pixels = []
    idx = 0
    for _ in range(height):
        if raw[idx] != 0:
            raise ValueError(f"Unsupported row filter {raw[idx]} in {path}")
        idx += 1
        row = raw[idx : idx + stride]
        idx += stride
        if color_type == 6:
            pixels.extend(row)
        elif color_type == 2:
            for pos in range(0, len(row), 3):
                pixels.extend(row[pos : pos + 3])
                pixels.append(255)
        elif color_type == 0:
            for value in row:
                pixels.extend([value, value, value, 255])
    return width, height, pixels


def recolor_png(source_path: Path, target_path: Path, rgb):
    width, height, pixels = read_png_rgba(source_path)
    recolored = bytearray()
    red, green, blue = rgb
    for idx in range(0, len(pixels), 4):
        alpha = pixels[idx + 3]
        if alpha:
            recolored.extend([red, green, blue, alpha])
        else:
            recolored.extend([0, 0, 0, 0])
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_bytes(build_png(width, height, 6, bytes(recolored)))


def main():
    NAMED_PNG_DIR.mkdir(parents=True, exist_ok=True)
    NAMED_SVG_DIR.mkdir(parents=True, exist_ok=True)
    MINIPROGRAM_DIR.mkdir(parents=True, exist_ok=True)

    for icon in ICON_DEFINITIONS:
        source_png = SOURCE_DIR / "png" / f"secret_obj_{icon['source_obj']:03d}.png"
        source_svg = SOURCE_DIR / "svg" / f"secret_obj_{icon['source_obj']:03d}.svg"

        named_png = NAMED_PNG_DIR / f"{icon['named_base']}.png"
        named_svg = NAMED_SVG_DIR / f"{icon['named_base']}.svg"
        shutil.copy2(source_png, named_png)
        shutil.copy2(source_svg, named_svg)

        for variant, rgb in COLOR_PRESETS.items():
            target = MINIPROGRAM_DIR / f"{icon['asset_key']}-{variant}.png"
            recolor_png(source_png, target, rgb)

    print(f"Prepared {len(ICON_DEFINITIONS)} named icons and recolored assets in {MINIPROGRAM_DIR}")


if __name__ == "__main__":
    main()
