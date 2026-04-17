#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree as ET
from zipfile import ZipFile


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DOCX_PATH = Path("/Users/mac/Developer/Work/jiuyanlou/docs/九眼楼线下点位1.0.docx")
CURRENT_LINK_LIST_PATH = PROJECT_ROOT / "docs" / "poi-qrcode-list.md"
WORD_LINK_LIST_PATH = PROJECT_ROOT / "docs" / "poi-qrcode-list-word.md"
COMPARE_REPORT_PATH = PROJECT_ROOT / "docs" / "poi-qrcode-compare-word-vs-current.md"
LANDING_PREFIX = "pages/landing/index?s=bsp&scene="
SCENE_PAYLOAD_PREFIX = "s=bsp&scene="


@dataclass(frozen=True)
class CurrentLink:
    name: str
    scene: str
    path: str


@dataclass(frozen=True)
class WordPoint:
    seq: str
    name: str


@dataclass(frozen=True)
class ManualRule:
    status: str
    compare_result: str
    current_name: str | None = None
    proposed_scene: str | None = None
    note: str = ""


@dataclass(frozen=True)
class WordLinkRecord:
    seq: str
    word_name: str
    scene: str
    landing_path: str
    status: str
    compare_result: str
    current_name: str | None
    current_scene: str | None
    current_path: str | None
    ready_now: bool
    note: str


MANUAL_RULES: dict[tuple[str, str], ManualRule] = {
    ("2", "翁万达广场广告牌"): ManualRule(
        status="split_new",
        compare_result="Word 拆分，原清单合并",
        current_name="翁万达广场 · 检票口",
        proposed_scene="wwdgcggp",
        note="Word 将“翁万达广场广告牌”和“检票口，当心有蛇提示牌”拆成两处；当前旧清单只有一条合并链接。"
    ),
    ("3", "检票口，当心有蛇提示牌"): ManualRule(
        status="split_new",
        compare_result="Word 拆分，原清单合并",
        current_name="翁万达广场 · 检票口",
        proposed_scene="jpkdxysp",
        note="Word 将检票口警示牌单列；当前旧清单把它和翁万达广场合并成一条链接。"
    ),
    ("5", "铁桥边立牌（大）"): ManualRule(
        status="rename_reuse",
        compare_result="改名复用旧链接",
        current_name="铁桥边立牌（大炮陈列处）",
        note="同一处点位，当前旧清单名称更具体。"
    ),
    ("6", "石桥处立牌"): ManualRule(
        status="missing_new",
        compare_result="Word 有，原清单缺失",
        proposed_scene="sqclp",
        note="Word 单列了石桥处立牌；当前旧清单没有对应链接。"
    ),
    ("9", "右侧分叉"): ManualRule(
        status="missing_new",
        compare_result="Word 有，原清单缺失",
        proposed_scene="ycfc",
        note="Word 单列了右侧分叉；当前旧清单没有对应链接。"
    ),
    ("10", "火焰广场处地图旁"): ManualRule(
        status="rename_reuse",
        compare_result="改名复用旧链接",
        current_name="火焰广场处地图",
        note="同一处点位，Word 名称强调“地图旁”。"
    ),
    ("14", "诗词牌子"): ManualRule(
        status="ordered_reuse",
        compare_result="按顺序复用旧链接",
        current_name="诗词牌子-14",
        note="Word 用通用名“诗词牌子”；按文档顺序对应当前“诗词牌子-14”。"
    ),
    ("15", "分叉路（大）"): ManualRule(
        status="missing_new",
        compare_result="Word 有，原清单缺失",
        proposed_scene="fcld",
        note="Word 单列了分叉路（大）；当前旧清单没有对应链接。"
    ),
    ("17", "诗词牌子"): ManualRule(
        status="ordered_reuse",
        compare_result="按顺序复用旧链接",
        current_name="诗词牌子-17",
        note="Word 用通用名“诗词牌子”；按文档顺序对应当前“诗词牌子-17”。"
    ),
    ("21", "中军帐小景"): ManualRule(
        status="rename_reuse",
        compare_result="改名复用旧链接",
        current_name="军中帐小景",
        note="同一处点位，Word 与旧清单只是字序不同。"
    ),
    ("新", "第一楼"): ManualRule(
        status="rename_reuse",
        compare_result="改名复用旧链接",
        current_name="第一楼石碑",
        note="当前旧清单名称更具体，指向“第一楼石碑”。"
    ),
    ("28", "下山第二块（小）"): ManualRule(
        status="rename_reuse",
        compare_result="改名复用旧链接",
        current_name="下山第二块牌子（小）",
        note="同一处点位，当前旧清单补了“牌子”字样。"
    ),
    ("29", "分叉点第一个竖牌（小）"): ManualRule(
        status="rename_reuse",
        compare_result="改名复用旧链接",
        current_name="四海镇 · 分叉点第一个竖牌（小）",
        note="同一处点位，当前旧清单补了“四海镇”前缀。"
    ),
}


STATUS_LABELS = {
    "exact_reuse": "直接复用",
    "rename_reuse": "改名复用",
    "ordered_reuse": "按顺序复用",
    "split_new": "按 Word 拆分后需新增映射",
    "missing_new": "需新增映射",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate Word-aligned miniapp QR link reports.")
    parser.add_argument("--docx", default=str(DEFAULT_DOCX_PATH), help="Path to the source Word document.")
    parser.add_argument("--current-list", default=str(CURRENT_LINK_LIST_PATH), help="Path to the current QR-code link list.")
    parser.add_argument("--word-output", default=str(WORD_LINK_LIST_PATH), help="Path to write the Word-aligned link list.")
    parser.add_argument("--compare-output", default=str(COMPARE_REPORT_PATH), help="Path to write the comparison report.")
    return parser.parse_args()


def parse_current_link_list(path: Path) -> list[CurrentLink]:
    content = path.read_text(encoding="utf-8")
    match = re.search(r"```text\s*(.*?)```", content, flags=re.S)
    if not match:
        raise ValueError(f"未在当前清单中找到纯文本链接块: {path}")

    records: list[CurrentLink] = []
    for raw_line in match.group(1).splitlines():
        line = raw_line.strip()
        if not line:
            continue
        parts = [part.strip() for part in line.split(" | ")]
        if len(parts) != 3:
            raise ValueError(f"无法解析当前清单中的链接行: {line}")
        name, scene, landing_path = parts
        records.append(CurrentLink(name=name, scene=scene, path=landing_path))
    return records


def parse_word_points(path: Path) -> list[WordPoint]:
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    with ZipFile(path) as archive:
        xml = archive.read("word/document.xml")
    root = ET.fromstring(xml)

    points: list[WordPoint] = []
    for row in root.findall(".//w:tr", namespace):
        cells: list[str] = []
        for cell in row.findall("./w:tc", namespace):
            texts = [node.text for node in cell.findall(".//w:t", namespace) if node.text]
            cells.append("".join(texts).strip())

        if not cells:
            continue

        seq = cells[0].strip()
        name = cells[1].strip() if len(cells) > 1 else ""

        if seq.isdigit() and name:
            points.append(WordPoint(seq=seq, name=name))
            continue

        if seq == "新" and name:
            points.append(WordPoint(seq=seq, name=name))

    return points


def build_landing_path(scene: str) -> str:
    return f"{LANDING_PREFIX}{scene}"


def ensure_valid_scene(scene: str) -> None:
    if not scene:
        raise ValueError("scene 不能为空。")
    if len(f"{SCENE_PAYLOAD_PREFIX}{scene}") > 32:
        raise ValueError(f"scene 超出 32 字符限制: {scene}")


def resolve_word_records(word_points: Iterable[WordPoint], current_links: list[CurrentLink]) -> list[WordLinkRecord]:
    current_by_name = {item.name: item for item in current_links}
    records: list[WordLinkRecord] = []

    for point in word_points:
        rule = MANUAL_RULES.get((point.seq, point.name))

        if point.name in current_by_name and rule is None:
            current = current_by_name[point.name]
            records.append(
                WordLinkRecord(
                    seq=point.seq,
                    word_name=point.name,
                    scene=current.scene,
                    landing_path=current.path,
                    status="exact_reuse",
                    compare_result="同名复用旧链接",
                    current_name=current.name,
                    current_scene=current.scene,
                    current_path=current.path,
                    ready_now=True,
                    note="Word 名称与当前旧清单一致，可直接使用。"
                )
            )
            continue

        if rule is None:
            raise ValueError(f"未为 Word 点位建立映射规则: {point.seq} {point.name}")

        if rule.status in {"rename_reuse", "ordered_reuse"}:
            if not rule.current_name or rule.current_name not in current_by_name:
                raise ValueError(f"当前清单中找不到要复用的点位: {point.seq} {point.name}")
            current = current_by_name[rule.current_name]
            records.append(
                WordLinkRecord(
                    seq=point.seq,
                    word_name=point.name,
                    scene=current.scene,
                    landing_path=current.path,
                    status=rule.status,
                    compare_result=rule.compare_result,
                    current_name=current.name,
                    current_scene=current.scene,
                    current_path=current.path,
                    ready_now=True,
                    note=rule.note
                )
            )
            continue

        ensure_valid_scene(rule.proposed_scene or "")
        current = current_by_name.get(rule.current_name or "")
        records.append(
            WordLinkRecord(
                seq=point.seq,
                word_name=point.name,
                scene=rule.proposed_scene or "",
                landing_path=build_landing_path(rule.proposed_scene or ""),
                status=rule.status,
                compare_result=rule.compare_result,
                current_name=current.name if current else None,
                current_scene=current.scene if current else None,
                current_path=current.path if current else None,
                ready_now=False,
                note=rule.note
            )
        )

    return records


def build_word_link_list_markdown(docx_path: Path, current_list_path: Path, records: list[WordLinkRecord]) -> str:
    today = date.today().isoformat()
    pure_text_lines = [
        f"{record.seq} | {record.word_name} | {record.scene} | {record.landing_path}"
        for record in records
    ]

    rows = []
    for record in records:
        rows.append(
            "| {seq} | {word_name} | `{scene}` | `{landing_path}` | {ready} | {status} | {current_name} | {note} |".format(
                seq=record.seq,
                word_name=record.word_name,
                scene=record.scene,
                landing_path=record.landing_path,
                ready="是" if record.ready_now else "否",
                status=STATUS_LABELS[record.status],
                current_name=record.current_name or "无",
                note=record.note,
            )
        )

    return f"""# 九眼楼 Word 对应小程序链接清单

生成时间：{today}

数据来源：

- `{docx_path}`
- `{current_list_path}`

使用说明：

- 本清单严格按 Word 文档里的点位顺序生成，共 `29` 条点位记录。
- Word 原文缺少序号 `11`，并额外有一条序号为 `新` 的“第一楼”；这里保持原文写法，不擅自重排。
- 所有链接统一采用当前小程序 landing 入口格式：`pages/landing/index?s=bsp&scene={{scene}}`
- `当前可直接使用 = 是`：表示现有旧清单已经有同一条链接，今天就能直接拿去生成二维码。
- `当前可直接使用 = 否`：表示这是按 Word 拆分或补出的新链接，当前系统里还没有对应映射，正式使用前需要补 landing 分发。

批量生成二维码用纯文本：

```text
{chr(10).join(pure_text_lines)}
```

详细清单：

| Word 序号 | Word 点位名称 | `scene` | 建议 landing 路径 | 当前可直接使用 | 生成方式 | 当前旧清单对应点位 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
{chr(10).join(rows)}
"""


def build_compare_markdown(docx_path: Path, current_list_path: Path, records: list[WordLinkRecord], current_links: list[CurrentLink]) -> str:
    today = date.today().isoformat()
    status_counts = {
        "exact_reuse": sum(1 for record in records if record.status == "exact_reuse"),
        "rename_reuse": sum(1 for record in records if record.status == "rename_reuse"),
        "ordered_reuse": sum(1 for record in records if record.status == "ordered_reuse"),
        "split_new": sum(1 for record in records if record.status == "split_new"),
        "missing_new": sum(1 for record in records if record.status == "missing_new"),
    }

    referenced_current_names = {record.current_name for record in records if record.current_name}
    current_only = [link for link in current_links if link.name not in referenced_current_names]

    compare_rows = []
    for record in records:
        compare_rows.append(
            "| {seq} | {word_name} | `{word_scene}` | `{word_path}` | {current_name} | {current_scene} | {current_path} | {result} | {note} |".format(
                seq=record.seq,
                word_name=record.word_name,
                word_scene=record.scene,
                word_path=record.landing_path,
                current_name=record.current_name or "无",
                current_scene=f"`{record.current_scene}`" if record.current_scene else "无",
                current_path=f"`{record.current_path}`" if record.current_path else "无",
                result=record.compare_result,
                note=record.note,
            )
        )

    current_only_rows = []
    for link in current_only:
        current_only_rows.append(
            f"| 无 | 无 | 无 | 无 | {link.name} | `{link.scene}` | `{link.path}` | 原清单独有 | 当前旧清单有这条链接，但 Word 文档没有单列这个点位。 |"
        )

    return f"""# 九眼楼 Word 链接与原清单对比

生成时间：{today}

数据来源：

- Word 源文件：`{docx_path}`
- 原小程序链接清单：`{current_list_path}`

汇总结论：

- Word 点位行数：`{len(records)}`
- 原小程序链接条数：`{len(current_links)}`
- 同名直接复用：`{status_counts["exact_reuse"]}`
- 改名复用：`{status_counts["rename_reuse"]}`
- 按顺序复用：`{status_counts["ordered_reuse"]}`
- Word 拆分后需新增映射：`{status_counts["split_new"]}`
- Word 有、原清单缺失：`{status_counts["missing_new"]}`
- 原清单独有：`{len(current_only)}`

对比表：

| Word 序号 | Word 点位 | Word `scene` | Word landing 路径 | 原清单对应点位 | 原 `scene` | 原 landing 路径 | 对比结果 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
{chr(10).join(compare_rows + current_only_rows)}
"""


def main() -> None:
    args = parse_args()
    docx_path = Path(args.docx).expanduser().resolve()
    current_list_path = Path(args.current_list).expanduser().resolve()
    word_output_path = Path(args.word_output).expanduser().resolve()
    compare_output_path = Path(args.compare_output).expanduser().resolve()

    current_links = parse_current_link_list(current_list_path)
    word_points = parse_word_points(docx_path)
    records = resolve_word_records(word_points, current_links)

    word_output_path.write_text(
        build_word_link_list_markdown(docx_path, current_list_path, records),
        encoding="utf-8",
    )
    compare_output_path.write_text(
        build_compare_markdown(docx_path, current_list_path, records, current_links),
        encoding="utf-8",
    )

    print(f"已生成 Word 对应链接清单: {word_output_path}")
    print(f"已生成对比清单: {compare_output_path}")
    print(f"Word 点位数: {len(records)}")
    print(f"当前可直接使用: {sum(1 for record in records if record.ready_now)}")
    print(f"需新增映射: {sum(1 for record in records if not record.ready_now)}")


if __name__ == "__main__":
    main()
