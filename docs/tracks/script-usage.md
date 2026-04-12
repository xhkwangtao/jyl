# KMZ 转小程序地图数据脚本

脚本位置：

`/Users/mac/Developer/Work/jyl/scripts/generate_jyl_map_data.py`

默认输入文件：

`/Users/mac/Developer/Work/jyl/docs/tracks/2026-03-10 09 45 15.kmz`

默认输出文件：

`/Users/mac/Developer/Work/jyl/miniprogram/config/jyl-map-data.generated.js`

## 这个脚本做了什么

一次完成下面几件事：

- 读取 `KMZ` 里的主轨迹
- 读取 `KMZ` 里的命名标注点
- 按预设名称挑出需要保留的导览点
- 把点名改成适合游客阅读的名称
- 把轨迹和点位从 `WGS84` 转成 `GCJ-02`
- 简化轨迹点数量，减少小程序地图负担
- 输出为小程序可直接读取的地图数据文件

## 最常用的命令

在项目根目录运行：

```bash
uv run python3 scripts/generate_jyl_map_data.py
```

这会使用默认的 `KMZ` 文件，并覆盖生成默认输出文件。

## 指定输入文件

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
  --input "docs/tracks/你的轨迹.kmz" \
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

`/Users/mac/Developer/Work/jyl/miniprogram/config/jyl-map-data.js`

地图页和打卡页都会继续从这个入口文件拿数据。
