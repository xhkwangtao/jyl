from __future__ import annotations

import argparse
import json
import math
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
import xml.etree.ElementTree as ET


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_KMZ_PATH = ROOT_DIR / 'docs/tracks/2026-03-10 09 45 15.kmz'
DEFAULT_TRACK_KMZ_PATH = ROOT_DIR / 'docs/tracks/jyl_tracks.kmz'
DEFAULT_POINTS_KMZ_PATH = ROOT_DIR / 'docs/tracks/jyl_points.kmz'
DEFAULT_OUTPUT_PATH = ROOT_DIR / 'miniprogram/config/jyl-map-data.generated.js'

KML_NS = {
    'k': 'http://www.opengis.net/kml/2.2',
    'gx': 'http://www.google.com/kml/ext/2.2',
}

SIMPLIFY_TOLERANCE_METERS = 0.0


@dataclass(frozen=True)
class PoiSpec:
    source_name: str
    key: str
    name: str
    point_type: str
    visible: bool
    card_visible: bool
    checkin_visible: bool
    theme_tag: str
    theme_tone: str
    short_hint: str
    description: str
    stay_text: str
    scene_line: str
    guide_tip: str
    trigger_radius_m: int


POI_SPECS = [
    PoiSpec(
        source_name='起点',
        key='route-start',
        name='路线起点',
        point_type='start',
        visible=True,
        card_visible=False,
        checkin_visible=False,
        theme_tag='起点',
        theme_tone='forest',
        short_hint='从这里进入整段步行导览线',
        description='整段步行导览线的起点，适合先确认路线方向再出发。',
        stay_text='建议停留 5 分钟',
        scene_line='游客可在这里整理装备、查看线路，再开始沿主线前进。',
        guide_tip='建议先看一眼整条路线，再顺着步行线开始游览。',
        trigger_radius_m=45,
    ),
    PoiSpec(
        source_name='右侧上左侧下',
        key='route-tip',
        name='路线提示点',
        point_type='guide',
        visible=True,
        card_visible=True,
        checkin_visible=True,
        theme_tag='提示',
        theme_tone='forest',
        short_hint='先确认上下行方向，再继续沿主线前进',
        description='沿线较早出现的提示位置，适合在这里确认前进方向。',
        stay_text='建议停留 3 分钟',
        scene_line='这里更适合作为路线判断点，而不是长时间停留的观景点。',
        guide_tip='如果同行里有人第一次来，建议在这里统一一下后续走法。',
        trigger_radius_m=35,
    ),
    PoiSpec(
        source_name='最佳游览路线AI小九爱心温馨提示',
        key='route-note',
        name='游览提示点',
        point_type='guide',
        visible=False,
        card_visible=False,
        checkin_visible=False,
        theme_tag='提示',
        theme_tone='forest',
        short_hint='适合补充一段简短的路线说明',
        description='沿主线布置的提示点，可用于自动播放路线提醒。',
        stay_text='建议停留 2 分钟',
        scene_line='更适合做系统触发点，不需要在地图上单独占一个公开位置。',
        guide_tip='可在游客接近时补一句简短提醒，避免界面上堆太多标记。',
        trigger_radius_m=30,
    ),
    PoiSpec(
        source_name='做回顾',
        key='review-spot',
        name='回顾讲解点',
        point_type='guide',
        visible=False,
        card_visible=False,
        checkin_visible=False,
        theme_tag='回顾',
        theme_tone='stone',
        short_hint='适合做一段阶段性回顾',
        description='适合在返程阶段补充回顾内容的讲解触发点。',
        stay_text='建议停留 3 分钟',
        scene_line='这里不必单独放大显示，更适合藏在讲解逻辑里自动触发。',
        guide_tip='可在游客接近时自动播放回顾内容，不建议在地图上单独展示。',
        trigger_radius_m=35,
    ),
    PoiSpec(
        source_name='客服中心领取',
        key='visitor-service',
        name='游客服务点',
        point_type='service',
        visible=True,
        card_visible=True,
        checkin_visible=True,
        theme_tag='服务',
        theme_tone='teal',
        short_hint='适合短暂停留、整理节奏和补给',
        description='沿线较实用的服务节点，适合短暂停留和整理后续节奏。',
        stay_text='建议停留 6 分钟',
        scene_line='如果游客体力一般，这里很适合做一次短暂停留再继续。',
        guide_tip='适合作为“补给和整理节奏”的提醒点，不必久留。',
        trigger_radius_m=45,
    ),
    PoiSpec(
        source_name='总结',
        key='route-summary',
        name='终点回顾点',
        point_type='scenic',
        visible=True,
        card_visible=True,
        checkin_visible=True,
        theme_tag='回顾',
        theme_tone='stone',
        short_hint='适合回看刚走过的路线和风景',
        description='适合做一段收束讲解，让游客在返程阶段回顾整段路线。',
        stay_text='建议停留 5 分钟',
        scene_line='这里更像是整段行程的收束点，适合讲“这一路看到了什么”。',
        guide_tip='如果要做收尾讲解，这里比真正离场前更自然。',
        trigger_radius_m=40,
    ),
    PoiSpec(
        source_name='正方形牌',
        key='view-sign',
        name='观景指示牌',
        point_type='scenic',
        visible=False,
        card_visible=False,
        checkin_visible=False,
        theme_tag='地标',
        theme_tone='gold',
        short_hint='现场可辨识的地标点位',
        description='带有明显现场标识的参考点，适合做补充说明或方位确认。',
        stay_text='建议停留 3 分钟',
        scene_line='如果游客对环境不熟，这类地标比抽象坐标更容易理解。',
        guide_tip='可用于补充方位说明，但不建议和回顾点同时公开展示。',
        trigger_radius_m=30,
    ),
    PoiSpec(
        source_name='两条路 右侧下 左侧上',
        key='fork-point',
        name='岔路口',
        point_type='junction',
        visible=False,
        card_visible=False,
        checkin_visible=False,
        theme_tag='岔路',
        theme_tone='forest',
        short_hint='靠近返程分流位置',
        description='用于提示左右分流方向的辅助点位。',
        stay_text='建议停留 2 分钟',
        scene_line='这类点更适合用于避免走错，不需要作为正式景点展示。',
        guide_tip='建议在游客接近时提示一句方向，不要做成大卡片。',
        trigger_radius_m=30,
    ),
    PoiSpec(
        source_name='彩蛋隐藏知识 火焰山矿 或四海镇信息 吉祥 堡子',
        key='local-story',
        name='地方故事讲解点',
        point_type='scenic',
        visible=False,
        card_visible=False,
        checkin_visible=False,
        theme_tag='讲解',
        theme_tone='gold',
        short_hint='适合补充地方故事和沿线背景',
        description='更偏讲解内容的点位，适合承接地方故事和沿线知识。',
        stay_text='建议停留 4 分钟',
        scene_line='这里更适合讲内容，而不是提醒游客必须停下拍照。',
        guide_tip='可以与附近观景点配合使用，游客走近后自动补充故事信息。',
        trigger_radius_m=35,
    ),
    PoiSpec(
        source_name='四海镇',
        key='sihai-view',
        name='四海镇观景点',
        point_type='scenic',
        visible=True,
        card_visible=True,
        checkin_visible=True,
        theme_tag='观景',
        theme_tone='gold',
        short_hint='沿线较开阔的停留和远眺位置',
        description='这一段视野更开阔，适合停下来远眺并补充讲解。',
        stay_text='建议停留 8 分钟',
        scene_line='如果要给游客留下更强的记忆点，这里是整条线里更值得停留的一站。',
        guide_tip='建议把这里作为主要停留点之一，讲解和拍照都适合。',
        trigger_radius_m=50,
    ),
    PoiSpec(
        source_name='终点',
        key='route-end',
        name='路线终点',
        point_type='end',
        visible=False,
        card_visible=False,
        checkin_visible=False,
        theme_tag='终点',
        theme_tone='stone',
        short_hint='整段步行导览线回到收束位置',
        description='整段线路在这里收束，适合结束导航流程。',
        stay_text='建议停留 3 分钟',
        scene_line='这更适合作为流程上的结束点，不必在公开地图上再放一个大标记。',
        guide_tip='如果需要结束提示，可在游客接近时自动收尾，不必再单独展示。',
        trigger_radius_m=40,
    ),
]


def read_kmz_root(path: Path) -> ET.Element:
    with zipfile.ZipFile(path) as zip_file:
        kml_entries = [name for name in zip_file.namelist() if name.lower().endswith('.kml')]
        if not kml_entries:
            raise ValueError(f'No KML file found in KMZ: {path}')
        with zip_file.open(kml_entries[0]) as file_handle:
            return ET.fromstring(file_handle.read())


def normalize_name(value: str) -> str:
    return ''.join(value.replace('\r', '').replace('\n', '').split())


def prettify_name(value: str) -> str:
    return normalize_name(value).replace('&&', ' · ')


def parse_coordinate_text(value: str | None) -> list[tuple[float, float]]:
    if not value:
        return []

    coordinates: list[tuple[float, float]] = []
    for token in value.replace('\r', ' ').replace('\n', ' ').split():
        parts = token.split(',')
        if len(parts) < 2:
            continue
        try:
            coordinates.append((float(parts[0]), float(parts[1])))
        except ValueError:
            continue
    return coordinates


def extract_track(root: ET.Element) -> list[tuple[float, float]]:
    coords: list[tuple[float, float]] = []
    for coord in root.findall('.//gx:Track/gx:coord', KML_NS):
        raw_parts = coord.text.split() if coord.text else []
        if len(raw_parts) >= 2:
            lon = float(raw_parts[0])
            lat = float(raw_parts[1])
            coords.append((lon, lat))
    if coords:
        return coords

    for line in root.findall('.//k:LineString/k:coordinates', KML_NS):
        coords.extend(parse_coordinate_text(''.join(line.itertext())))
    if not coords:
        raise ValueError('No track coordinates found in KMZ file.')
    return coords


def extract_named_points(root: ET.Element) -> dict[str, tuple[float, float]]:
    points: dict[str, tuple[float, float]] = {}
    placemarks = root.findall('.//k:Placemark', KML_NS)
    for placemark in placemarks:
        point = placemark.find('k:Point', KML_NS)
        if point is None:
            continue
        coords_node = point.find('k:coordinates', KML_NS)
        point_coordinates = parse_coordinate_text(coords_node.text if coords_node is not None else None)
        if not point_coordinates:
            continue
        name_node = placemark.find('k:name', KML_NS)
        name = normalize_name(''.join(name_node.itertext()) if name_node is not None else '')
        if not name:
            continue
        lon, lat = point_coordinates[0]
        if math.isclose(lon, 0.0, abs_tol=1e-9) and math.isclose(lat, 0.0, abs_tol=1e-9):
            continue
        points.setdefault(name, (lon, lat))
    return points


def haversine_meters(a: tuple[float, float], b: tuple[float, float]) -> float:
    earth_radius = 6378137.0
    lon1, lat1 = a
    lon2, lat2 = b
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    term = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    )
    return earth_radius * 2 * math.atan2(math.sqrt(term), math.sqrt(1 - term))


def total_distance_meters(points: Iterable[tuple[float, float]]) -> float:
    points_list = list(points)
    return sum(
        haversine_meters(points_list[index - 1], points_list[index])
        for index in range(1, len(points_list))
    )


def project_to_local_meters(point: tuple[float, float], origin: tuple[float, float]) -> tuple[float, float]:
    lon, lat = point
    origin_lon, origin_lat = origin
    mean_lat = math.radians((lat + origin_lat) / 2)
    meters_per_degree_lat = 111320.0
    meters_per_degree_lon = 111320.0 * math.cos(mean_lat)
    return (
        (lon - origin_lon) * meters_per_degree_lon,
        (lat - origin_lat) * meters_per_degree_lat,
    )


def perpendicular_distance(
    point: tuple[float, float],
    start: tuple[float, float],
    end: tuple[float, float],
    origin: tuple[float, float],
) -> float:
    px, py = project_to_local_meters(point, origin)
    sx, sy = project_to_local_meters(start, origin)
    ex, ey = project_to_local_meters(end, origin)
    if math.isclose(sx, ex) and math.isclose(sy, ey):
        return math.hypot(px - sx, py - sy)
    numerator = abs((ey - sy) * px - (ex - sx) * py + ex * sy - ey * sx)
    denominator = math.hypot(ey - sy, ex - sx)
    return numerator / denominator


def douglas_peucker(points: list[tuple[float, float]], tolerance_meters: float) -> list[tuple[float, float]]:
    if len(points) <= 2:
        return points[:]

    origin = points[0]
    start = points[0]
    end = points[-1]
    max_distance = -1.0
    split_index = -1

    for index in range(1, len(points) - 1):
        distance = perpendicular_distance(points[index], start, end, origin)
        if distance > max_distance:
            max_distance = distance
            split_index = index

    if max_distance <= tolerance_meters or split_index < 0:
        return [start, end]

    left = douglas_peucker(points[: split_index + 1], tolerance_meters)
    right = douglas_peucker(points[split_index:], tolerance_meters)
    return left[:-1] + right


def simplify_track(points: list[tuple[float, float]], tolerance_meters: float) -> list[tuple[float, float]]:
    if tolerance_meters <= 0:
        return points[:]

    return douglas_peucker(points, tolerance_meters)


def out_of_china(lon: float, lat: float) -> bool:
    return not (73.66 < lon < 135.05 and 3.86 < lat < 53.55)


def transform_lat(x: float, y: float) -> float:
    result = (
        -100.0
        + 2.0 * x
        + 3.0 * y
        + 0.2 * y * y
        + 0.1 * x * y
        + 0.2 * math.sqrt(abs(x))
    )
    result += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    result += (20.0 * math.sin(y * math.pi) + 40.0 * math.sin(y / 3.0 * math.pi)) * 2.0 / 3.0
    result += (160.0 * math.sin(y / 12.0 * math.pi) + 320 * math.sin(y * math.pi / 30.0)) * 2.0 / 3.0
    return result


def transform_lon(x: float, y: float) -> float:
    result = (
        300.0
        + x
        + 2.0 * y
        + 0.1 * x * x
        + 0.1 * x * y
        + 0.1 * math.sqrt(abs(x))
    )
    result += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    result += (20.0 * math.sin(x * math.pi) + 40.0 * math.sin(x / 3.0 * math.pi)) * 2.0 / 3.0
    result += (150.0 * math.sin(x / 12.0 * math.pi) + 300.0 * math.sin(x / 30.0 * math.pi)) * 2.0 / 3.0
    return result


def wgs84_to_gcj02(lon: float, lat: float) -> tuple[float, float]:
    if out_of_china(lon, lat):
        return lon, lat

    semi_major_axis = 6378245.0
    eccentricity = 0.00669342162296594323
    delta_lat = transform_lat(lon - 105.0, lat - 35.0)
    delta_lon = transform_lon(lon - 105.0, lat - 35.0)
    rad_lat = math.radians(lat)
    magic = math.sin(rad_lat)
    magic = 1 - eccentricity * magic * magic
    sqrt_magic = math.sqrt(magic)
    delta_lat = (delta_lat * 180.0) / (
        ((semi_major_axis * (1 - eccentricity)) / (magic * sqrt_magic)) * math.pi
    )
    delta_lon = (delta_lon * 180.0) / ((semi_major_axis / sqrt_magic) * math.cos(rad_lat) * math.pi)
    return lon + delta_lon, lat + delta_lat


def round_coordinate_pair(point: tuple[float, float]) -> list[float]:
    lon, lat = point
    return [round(lon, 6), round(lat, 6)]


def nearest_track_index(target: tuple[float, float], track: list[tuple[float, float]]) -> int:
    best_index = 0
    best_distance = float('inf')
    for index, candidate in enumerate(track):
        distance = haversine_meters(target, candidate)
        if distance < best_distance:
            best_distance = distance
            best_index = index
    return best_index


def build_source_label(path: Path) -> str:
    try:
        return path.relative_to(ROOT_DIR).as_posix()
    except ValueError:
        return str(path)


def infer_generic_poi_type(name: str, order_index: int) -> str:
    if order_index == 0:
        return 'start'
    if any(keyword in name for keyword in ('卫生间', '游客中心', '服务', '检票口')):
        return 'service'
    if any(keyword in name for keyword in ('分叉', '岔路', '汇合', '路口')):
        return 'junction'
    if any(keyword in name for keyword in ('九眼楼', '石碑', '碑刻', '小景', '亭', '战鼓车', '避雷针', '大门', '陈列处')):
        return 'scenic'
    if any(keyword in name for keyword in ('牌', '二维码', '地图', '入口')):
        return 'guide'
    return 'scenic'


def infer_generic_theme(name: str, point_type: str) -> tuple[str, str]:
    if point_type == 'start':
        return '起点', 'forest'
    if point_type == 'service':
        return '服务', 'teal'
    if point_type == 'junction':
        return '岔路', 'forest'
    if point_type == 'guide':
        if '二维码' in name:
            return '提示', 'stone'
        return '导览', 'stone'

    if any(keyword in name for keyword in ('九眼楼', '石碑', '碑刻', '营盘', '军中帐')):
        return '遗迹', 'stone'
    if any(keyword in name for keyword in ('大门', '亭', '桥', '战鼓车', '避雷针', '陈列处')):
        return '地标', 'gold'
    return '观景', 'gold'


def infer_generic_visibility(name: str, point_type: str) -> tuple[bool, bool, bool]:
    if point_type == 'start':
        return True, False, False
    if point_type == 'guide':
        return False, False, False
    if point_type == 'junction':
        return True, False, False
    if point_type == 'service':
        return True, True, True
    if point_type == 'scenic':
        return True, True, True
    return True, True, True


def build_generic_meta(name: str, point_type: str) -> dict[str, str | int]:
    theme_tag, theme_tone = infer_generic_theme(name, point_type)

    if point_type == 'start':
        return {
            'themeTag': theme_tag,
            'themeTone': theme_tone,
            'shortHint': '从这里进入整条步行导览路线。',
            'description': f'{name} 作为路线起始参考点，适合在这里确认方向后再出发。',
            'stayText': '建议停留 3 分钟',
            'sceneLine': '可以在这里整理节奏、确认轨迹方向，再沿路线继续前进。',
            'guideTip': '建议先看一眼地图全线，再开始步行导览。',
            'triggerRadiusM': 45,
        }
    if point_type == 'service':
        return {
            'themeTag': theme_tag,
            'themeTone': theme_tone,
            'shortHint': '沿线可补给或短暂停留的服务节点。',
            'description': f'{name} 适合作为沿线服务补给点，便于调整游览节奏。',
            'stayText': '建议停留 5 分钟',
            'sceneLine': '如果需要休整或补给，这类点位比普通观景点更适合短暂停留。',
            'guideTip': '可在这里短暂停留，再继续沿主线前进。',
            'triggerRadiusM': 45,
        }
    if point_type == 'junction':
        return {
            'themeTag': theme_tag,
            'themeTone': theme_tone,
            'shortHint': '靠近分叉或汇合位置，适合做方向提醒。',
            'description': f'{name} 位于路线分流节点，更适合作为方向判断提示点。',
            'stayText': '建议停留 2 分钟',
            'sceneLine': '这里的重点是避免走错方向，不需要长时间停留。',
            'guideTip': '经过这里时建议确认前进方向，再继续行进。',
            'triggerRadiusM': 35,
        }
    if point_type == 'guide':
        return {
            'themeTag': theme_tag,
            'themeTone': theme_tone,
            'shortHint': '沿线标识或讲解信息点，更适合作为隐藏触发提示。',
            'description': f'{name} 更适合作为路线提示或信息补充点，不建议作为公开打卡点单独展示。',
            'stayText': '建议停留 3 分钟',
            'sceneLine': '这类点位更偏向讲解和识别，适合放到自动触发或补充说明里。',
            'guideTip': '如果后续需要更细的导览播报，可在游客靠近时自动触发。',
            'triggerRadiusM': 30,
        }

    if theme_tag == '遗迹':
        return {
            'themeTag': theme_tag,
            'themeTone': theme_tone,
            'shortHint': '沿线值得停留了解历史信息的遗迹点位。',
            'description': f'{name} 更适合作为历史遗迹类导览点，可在这里补充沿线背景和故事。',
            'stayText': '建议停留 7 分钟',
            'sceneLine': '这里不只是经过点，更适合停下来讲一段与现场相关的内容。',
            'guideTip': '如果是第一次来，建议把这里作为重点停留点之一。',
            'triggerRadiusM': 40,
        }

    if theme_tag == '地标':
        return {
            'themeTag': theme_tag,
            'themeTone': theme_tone,
            'shortHint': '现场辨识度较高的地标或装置点位。',
            'description': f'{name} 作为沿线辨识度较高的地标点，更适合停留拍照或做位置确认。',
            'stayText': '建议停留 5 分钟',
            'sceneLine': '这类点位通常更容易被游客记住，适合作为节奏上的小停留。',
            'guideTip': '适合用来确认自己所处位置，也适合做简短讲解。',
            'triggerRadiusM': 38,
        }

    return {
        'themeTag': theme_tag,
        'themeTone': theme_tone,
        'shortHint': '沿线值得停留浏览的景观点位。',
        'description': f'{name} 是沿线可停留浏览的点位，适合补充风景或现场讲解。',
        'stayText': '建议停留 6 分钟',
        'sceneLine': '这里更适合慢一点走，留出时间看环境、拍照或补充讲解。',
        'guideTip': '如果同行里有人第一次来，这类点位更适合稍微多停一会儿。',
        'triggerRadiusM': 40,
    }


def build_curated_pois(
    named_points_wgs84: dict[str, tuple[float, float]],
    track_wgs84: list[tuple[float, float]],
) -> list[dict]:
    pois: list[dict] = []
    for spec in POI_SPECS:
        source_point = named_points_wgs84[spec.source_name]
        route_index = nearest_track_index(source_point, track_wgs84)
        gcj02_point = wgs84_to_gcj02(*source_point)
        pois.append(
            {
                'id': spec.key,
                'key': spec.key,
                'sourceName': spec.source_name,
                'name': spec.name,
                'type': spec.point_type,
                'visible': spec.visible,
                'cardVisible': spec.card_visible,
                'checkinVisible': spec.checkin_visible,
                'themeTag': spec.theme_tag,
                'themeTone': spec.theme_tone,
                'shortHint': spec.short_hint,
                'description': spec.description,
                'stayText': spec.stay_text,
                'sceneLine': spec.scene_line,
                'guideTip': spec.guide_tip,
                'triggerRadiusM': spec.trigger_radius_m,
                'routeIndex': route_index,
                'locationGcj02': round_coordinate_pair(gcj02_point),
                'locationWgs84': round_coordinate_pair(source_point),
            }
        )
    return pois


def build_generic_pois(
    named_points_wgs84: dict[str, tuple[float, float]],
    track_wgs84: list[tuple[float, float]],
) -> list[dict]:
    ordered_points = sorted(
        (
            {
                'sourceName': source_name,
                'routeIndex': nearest_track_index(source_point, track_wgs84),
                'locationWgs84': source_point,
            }
            for source_name, source_point in named_points_wgs84.items()
        ),
        key=lambda item: (item['routeIndex'], item['sourceName']),
    )

    pois: list[dict] = []
    for order_index, point in enumerate(ordered_points):
        point_type = infer_generic_poi_type(point['sourceName'], order_index)
        display_name = prettify_name(point['sourceName'])
        meta = build_generic_meta(display_name, point_type)
        visible, card_visible, checkin_visible = infer_generic_visibility(display_name, point_type)
        gcj02_point = wgs84_to_gcj02(*point['locationWgs84'])
        pois.append(
            {
                'id': f'poi-{order_index + 1:02d}',
                'key': f'poi-{order_index + 1:02d}',
                'sourceName': point['sourceName'],
                'name': display_name,
                'type': point_type,
                'visible': visible,
                'cardVisible': card_visible,
                'checkinVisible': checkin_visible,
                'themeTag': meta['themeTag'],
                'themeTone': meta['themeTone'],
                'shortHint': meta['shortHint'],
                'description': meta['description'],
                'stayText': meta['stayText'],
                'sceneLine': meta['sceneLine'],
                'guideTip': meta['guideTip'],
                'triggerRadiusM': meta['triggerRadiusM'],
                'routeIndex': point['routeIndex'],
                'locationGcj02': round_coordinate_pair(gcj02_point),
                'locationWgs84': round_coordinate_pair(point['locationWgs84']),
            }
        )
    return pois


def finalize_pois(pois: list[dict]) -> list[dict]:
    pois.sort(key=lambda item: (item['routeIndex'], item['name']))

    visible_card_order = 1
    for poi in pois:
        poi['sort'] = poi['routeIndex']
        if poi['cardVisible']:
            poi['orderText'] = f'{visible_card_order:02d}'
            poi['sequenceText'] = f'第 {visible_card_order:02d} 站'
            visible_card_order += 1
        elif poi['type'] == 'start':
            poi['orderText'] = ''
            poi['sequenceText'] = '路线起点'
        elif poi['type'] == 'end':
            poi['orderText'] = ''
            poi['sequenceText'] = '路线终点'
        else:
            poi['orderText'] = ''
            poi['sequenceText'] = poi['themeTag']
    return pois


def build_output(track_kmz_path: Path, points_kmz_path: Path, simplify_tolerance_meters: float) -> dict:
    track_root = read_kmz_root(track_kmz_path)
    points_root = read_kmz_root(points_kmz_path)
    track_wgs84 = extract_track(track_root)
    named_points_wgs84 = extract_named_points(points_root)
    if not named_points_wgs84:
        raise ValueError('No named points found in KMZ file.')

    simplified_track_wgs84 = simplify_track(track_wgs84, simplify_tolerance_meters)
    simplified_track_gcj02 = [wgs84_to_gcj02(lon, lat) for lon, lat in simplified_track_wgs84]

    has_curated_names = all(spec.source_name in named_points_wgs84 for spec in POI_SPECS)
    pois = build_curated_pois(named_points_wgs84, track_wgs84) if has_curated_names else build_generic_pois(named_points_wgs84, track_wgs84)
    pois = finalize_pois(pois)

    route_distance_m = round(total_distance_meters(track_wgs84))
    visible_count = sum(1 for poi in pois if poi['visible'])
    card_count = sum(1 for poi in pois if poi['cardVisible'])
    hidden_trigger_count = sum(1 for poi in pois if not poi['visible'])

    source_label = build_source_label(track_kmz_path)
    if track_kmz_path != points_kmz_path:
        source_label = f'{build_source_label(track_kmz_path)} + {build_source_label(points_kmz_path)}'

    return {
        'sourceFile': source_label,
        'sourceCoordinateSystem': 'WGS84',
        'outputCoordinateSystem': 'GCJ-02',
        'route': {
            'id': 'route-main',
            'name': '九眼楼步行导览路线',
            'distanceMeters': route_distance_m,
            'simplifyToleranceMeters': simplify_tolerance_meters,
            'sourcePointCount': len(track_wgs84),
            'simplifiedPointCount': len(simplified_track_gcj02),
            'pathGcj02': [round_coordinate_pair(point) for point in simplified_track_gcj02],
        },
        'poiSummary': {
            'visibleCount': visible_count,
            'cardCount': card_count,
            'hiddenTriggerCount': hidden_trigger_count,
            'totalCount': len(pois),
        },
        'pois': pois,
    }


def write_output(data: dict, output_path: Path) -> None:
    output_text = 'module.exports = ' + json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(output_text, encoding='utf-8')


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description='Generate WeChat Mini Program map data from a KMZ track file.'
    )
    parser.add_argument(
        '--input',
        dest='input_path',
        default=None,
        help='Single KMZ file path containing both track and points.',
    )
    parser.add_argument(
        '--track-input',
        dest='track_input_path',
        default=None,
        help='Track KMZ file path. Default: docs/tracks/jyl_tracks.kmz when present.',
    )
    parser.add_argument(
        '--points-input',
        dest='points_input_path',
        default=None,
        help='Point KMZ file path. Default: docs/tracks/jyl_points.kmz when present.',
    )
    parser.add_argument(
        '--output',
        dest='output_path',
        default=str(DEFAULT_OUTPUT_PATH),
        help='Output JS data file path. Default: miniprogram/config/jyl-map-data.generated.js',
    )
    parser.add_argument(
        '--tolerance',
        dest='tolerance_meters',
        type=float,
        default=SIMPLIFY_TOLERANCE_METERS,
        help='Route simplification tolerance in meters. Default: 0.0 (preserve raw track)',
    )
    return parser.parse_args()


def resolve_input_paths(args: argparse.Namespace) -> tuple[Path, Path]:
    if args.input_path:
        combined_path = Path(args.input_path).expanduser().resolve()
        return combined_path, combined_path

    if args.track_input_path or args.points_input_path:
        track_path = Path(args.track_input_path or args.points_input_path).expanduser().resolve()
        points_path = Path(args.points_input_path or args.track_input_path).expanduser().resolve()
        return track_path, points_path

    if DEFAULT_TRACK_KMZ_PATH.exists() and DEFAULT_POINTS_KMZ_PATH.exists():
        return DEFAULT_TRACK_KMZ_PATH.resolve(), DEFAULT_POINTS_KMZ_PATH.resolve()

    return DEFAULT_KMZ_PATH.resolve(), DEFAULT_KMZ_PATH.resolve()


def main() -> None:
    args = parse_args()
    track_input_path, points_input_path = resolve_input_paths(args)
    output_path = Path(args.output_path).expanduser().resolve()

    output = build_output(track_input_path, points_input_path, args.tolerance_meters)
    write_output(output, output_path)

    route = output['route']
    summary = output['poiSummary']
    print(f'Generated {output_path}')
    print(f'Track source: {track_input_path}')
    print(f'Point source: {points_input_path}')
    print(
        'Route:',
        f"{route['sourcePointCount']} raw points -> {route['simplifiedPointCount']} simplified points",
        f"distance {route['distanceMeters']}m",
    )
    print(
        'POIs:',
        f"{summary['totalCount']} total,",
        f"{summary['visibleCount']} visible markers,",
        f"{summary['cardCount']} public cards/check-ins,",
        f"{summary['hiddenTriggerCount']} hidden triggers",
    )


if __name__ == '__main__':
    main()
