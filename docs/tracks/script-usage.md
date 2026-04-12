# KMZ 转小程序地图数据脚本

脚本位置：

`scripts/generate_jyl_map_data.py`

默认输入文件：

`docs/tracks/jyl_tracks.kmz`

`docs/tracks/jyl_points.kmz`

默认输出文件：

`miniprogram/config/jyl-map-data.generated.js`

## 这个脚本做了什么

一次完成下面几件事：

- 读取 `KMZ` 里的主轨迹
- 读取 `KMZ` 里的命名标注点
- 支持“轨迹 KMZ”和“点位 KMZ”分开输入，也兼容单个 `KMZ` 同时包含轨迹和点位
- 当点位名不再匹配旧的预设名单时，自动把当前文件里的有效命名点转换成地图页可直接读取的数据
- 把轨迹和点位从 `WGS84` 转成 `GCJ-02`
- 简化轨迹点数量，减少小程序地图负担
- 自动区分公开点位和隐藏触发点，减少地图上一次性加载过多 marker
- 输出为小程序可直接读取的地图数据文件

## 默认点位可见性规则

当脚本进入“通用点位生成”模式时，会按名称和类型给点位自动分类：

- `service` 和 `scenic` 默认公开显示，同时进入地图卡片和打卡列表
- `junction` 默认只保留地图标记，用于岔路或方向提醒，不进入公开打卡列表
- `guide` 默认转成隐藏触发点，不在地图上公开显示
- 第一个点默认当作 `start`，仅保留路线起点用途，不进入公开打卡列表

当前这批九眼楼点位里，像 `牌`、`二维码`、`地图`、`入口` 这类名称通常会被识别为 `guide`，因此默认会作为隐藏触发点保留，用来做自动讲解或路线提醒，不再堆在地图页上。

## 最常用的命令

在项目根目录运行：

```bash
uv run python3 scripts/generate_jyl_map_data.py
```

如果 `docs/tracks/jyl_tracks.kmz` 和 `docs/tracks/jyl_points.kmz` 都存在，就会默认使用这两个文件，并覆盖生成默认输出文件。

如果这两个文件不存在，则会回退到旧的单文件模式。

## 指定轨迹和点位两个输入文件

```bash
uv run python3 scripts/generate_jyl_map_data.py \
  --track-input "docs/tracks/jyl_tracks.kmz" \
  --points-input "docs/tracks/jyl_points.kmz"
```

## 指定单个输入文件

如果你的 `KMZ` 本身同时包含轨迹和点位，仍然可以继续用旧参数：

```bash
uv run python3 scripts/generate_jyl_map_data.py \
  --input "docs/tracks/你的轨迹.kmz"
```

## 指定输出文件

```bash
uv run python3 scripts/generate_jyl_map_data.py \
  --output "miniprogram/config/custom-map-data.generated.js"
```

## 同时指定输入和输出

```bash
uv run python3 scripts/generate_jyl_map_data.py \
  --track-input "docs/tracks/jyl_tracks.kmz" \
  --points-input "docs/tracks/jyl_points.kmz" \
  --output "miniprogram/config/custom-map-data.generated.js"
```

## 调整路线简化强度

默认简化阈值是 `8` 米。

如果你想保留更多路线细节：

```bash
uv run python3 scripts/generate_jyl_map_data.py --tolerance 5
```

如果你想让路线更简洁：

```bash
uv run python3 scripts/generate_jyl_map_data.py --tolerance 12
```

## 输出结果在哪里用

脚本生成的文件会被这个入口文件读取：

`miniprogram/config/jyl-map-data.js`

地图页和打卡页都会继续从这个入口文件拿数据。

如果要快速检查这次生成的数据是否已经被入口文件读到，可以在项目根目录运行：

```bash
node - <<'NODE'
const data = require('./miniprogram/config/jyl-map-data.js')
console.log(data.poiSummary)
NODE
```
