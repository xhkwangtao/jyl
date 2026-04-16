# 九眼楼点位二维码链接清单

生成时间：2026-04-16

数据来源：

- `miniprogram/config/jyl-map-data.generated.js`
- 当前点位总数：26

使用说明：

- 本清单采用 `README.md` 中“扫码 landing 页说明”里的参数约定，尤其是点位二维码的 `s=bsp&scene=点位首字母码` 方案。
- `建议 landing 路径`：按当前统一扫码入口方案生成，推荐作为正式二维码内容。
- `当前可直开地图路径`：按当前与 `huangyaguan` 对齐后的地图页 `poiId` 入参生成，适合联调或临时测试。
- 当前点位 `landing` 方案约定格式为：`pages/landing/index?s=bsp&scene={pointCode}`
- 二维码链接固定前缀为：`pages/landing/index?s=bsp&scene=`
- 当前地图直开格式为：`/pages/map/map?poiId={poiId}`

批量生成二维码用纯文本：

```text
景区大门 | jqdm | pages/landing/index?s=bsp&scene=jqdm
景区大门口左侧牌子 | jqdmkzcpz | pages/landing/index?s=bsp&scene=jqdmkzcpz
步道分叉口立牌 | bdfcklp | pages/landing/index?s=bsp&scene=bdfcklp
步道起点大石头 | bdqddst | pages/landing/index?s=bsp&scene=bdqddst
火焰广场处地图 | hygcdt | pages/landing/index?s=bsp&scene=hygcdt
登山步道凿石料小景 | dsbdzslxj | pages/landing/index?s=bsp&scene=dsbdzslxj
登山步道起点左侧入口牌 | dsbdqdzcrkp | pages/landing/index?s=bsp&scene=dsbdqdzcrkp
石桥边战鼓车 | sqbzgc | pages/landing/index?s=bsp&scene=sqbzgc
翁万达广场 · 检票口 | wwdgcjpk | pages/landing/index?s=bsp&scene=wwdgcjpk
诗词牌子-14 | scpz14 | pages/landing/index?s=bsp&scene=scpz14
铁桥边立牌（大炮陈列处） | tqblpdpclc | pages/landing/index?s=bsp&scene=tqblpdpclc
毛驴运输石料小景 | mlysslxj | pages/landing/index?s=bsp&scene=mlysslxj
诗词牌子-17 | scpz17 | pages/landing/index?s=bsp&scene=scpz17
分叉路汇合点（大） | fclhhdd | pages/landing/index?s=bsp&scene=fclhhdd
四海镇 · 分叉点第一个竖牌（小） | shzfcddygsp | pages/landing/index?s=bsp&scene=shzfcddygsp
城上卫生间 | cswsj | pages/landing/index?s=bsp&scene=cswsj
军中帐小景 | jzzxj | pages/landing/index?s=bsp&scene=jzzxj
营盘城外牌 | ypcwp | pages/landing/index?s=bsp&scene=ypcwp
营盘内二维码 | ypnewm | pages/landing/index?s=bsp&scene=ypnewm
单片楼避雷针底座（内） | dplblzdzn | pages/landing/index?s=bsp&scene=dplblzdzn
九眼楼 | jyl | pages/landing/index?s=bsp&scene=jyl
第一楼石碑 | dylsb | pages/landing/index?s=bsp&scene=dylsb
碑刻区 | bkq | pages/landing/index?s=bsp&scene=bkq
下山路第一处牌子（小） | xsldycpzx | pages/landing/index?s=bsp&scene=xsldycpzx
下山第二块牌子（小） | xsedkpzx | pages/landing/index?s=bsp&scene=xsedkpzx
木亭子 | mtz | pages/landing/index?s=bsp&scene=mtz
```

详细对照表：

| 序号 | 点位名称 | 点位 ID | 对外 `s` 值 | 对外 `scene` 值（首字母码） | 点位类型 | 建议 landing 路径 | 当前可直开地图路径 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 景区大门 | `poi-01` | `bsp` | `jqdm` | `scenic` | `pages/landing/index?s=bsp&scene=jqdm` | `/pages/map/map?poiId=jqdm` |
| 2 | 景区大门口左侧牌子 | `poi-02` | `bsp` | `jqdmkzcpz` | `scenic` | `pages/landing/index?s=bsp&scene=jqdmkzcpz` | `/pages/map/map?poiId=jqdmkzcpz` |
| 3 | 步道分叉口立牌 | `poi-03` | `bsp` | `bdfcklp` | `junction` | `pages/landing/index?s=bsp&scene=bdfcklp` | `/pages/map/map?poiId=bdfcklp` |
| 4 | 步道起点大石头 | `poi-04` | `bsp` | `bdqddst` | `scenic` | `pages/landing/index?s=bsp&scene=bdqddst` | `/pages/map/map?poiId=bdqddst` |
| 5 | 火焰广场处地图 | `poi-05` | `bsp` | `hygcdt` | `guide` | `pages/landing/index?s=bsp&scene=hygcdt` | `/pages/map/map?poiId=hygcdt` |
| 6 | 登山步道凿石料小景 | `poi-06` | `bsp` | `dsbdzslxj` | `scenic` | `pages/landing/index?s=bsp&scene=dsbdzslxj` | `/pages/map/map?poiId=dsbdzslxj` |
| 7 | 登山步道起点左侧入口牌 | `poi-07` | `bsp` | `dsbdqdzcrkp` | `guide` | `pages/landing/index?s=bsp&scene=dsbdqdzcrkp` | `/pages/map/map?poiId=dsbdqdzcrkp` |
| 8 | 石桥边战鼓车 | `poi-08` | `bsp` | `sqbzgc` | `scenic` | `pages/landing/index?s=bsp&scene=sqbzgc` | `/pages/map/map?poiId=sqbzgc` |
| 9 | 翁万达广场 · 检票口 | `poi-09` | `bsp` | `wwdgcjpk` | `start` | `pages/landing/index?s=bsp&scene=wwdgcjpk` | `/pages/map/map?poiId=wwdgcjpk` |
| 10 | 诗词牌子-14 | `poi-10` | `bsp` | `scpz14` | `guide` | `pages/landing/index?s=bsp&scene=scpz14` | `/pages/map/map?poiId=scpz14` |
| 11 | 铁桥边立牌（大炮陈列处） | `poi-11` | `bsp` | `tqblpdpclc` | `scenic` | `pages/landing/index?s=bsp&scene=tqblpdpclc` | `/pages/map/map?poiId=tqblpdpclc` |
| 12 | 毛驴运输石料小景 | `poi-12` | `bsp` | `mlysslxj` | `scenic` | `pages/landing/index?s=bsp&scene=mlysslxj` | `/pages/map/map?poiId=mlysslxj` |
| 13 | 诗词牌子-17 | `poi-13` | `bsp` | `scpz17` | `guide` | `pages/landing/index?s=bsp&scene=scpz17` | `/pages/map/map?poiId=scpz17` |
| 14 | 分叉路汇合点（大） | `poi-14` | `bsp` | `fclhhdd` | `junction` | `pages/landing/index?s=bsp&scene=fclhhdd` | `/pages/map/map?poiId=fclhhdd` |
| 15 | 四海镇 · 分叉点第一个竖牌（小） | `poi-15` | `bsp` | `shzfcddygsp` | `junction` | `pages/landing/index?s=bsp&scene=shzfcddygsp` | `/pages/map/map?poiId=shzfcddygsp` |
| 16 | 城上卫生间 | `poi-16` | `bsp` | `cswsj` | `service` | `pages/landing/index?s=bsp&scene=cswsj` | `/pages/map/map?poiId=cswsj` |
| 17 | 军中帐小景 | `poi-17` | `bsp` | `jzzxj` | `scenic` | `pages/landing/index?s=bsp&scene=jzzxj` | `/pages/map/map?poiId=jzzxj` |
| 18 | 营盘城外牌 | `poi-18` | `bsp` | `ypcwp` | `guide` | `pages/landing/index?s=bsp&scene=ypcwp` | `/pages/map/map?poiId=ypcwp` |
| 19 | 营盘内二维码 | `poi-19` | `bsp` | `ypnewm` | `guide` | `pages/landing/index?s=bsp&scene=ypnewm` | `/pages/map/map?poiId=ypnewm` |
| 20 | 单片楼避雷针底座（内） | `poi-20` | `bsp` | `dplblzdzn` | `scenic` | `pages/landing/index?s=bsp&scene=dplblzdzn` | `/pages/map/map?poiId=dplblzdzn` |
| 21 | 九眼楼 | `poi-21` | `bsp` | `jyl` | `scenic` | `pages/landing/index?s=bsp&scene=jyl` | `/pages/map/map?poiId=jyl` |
| 22 | 第一楼石碑 | `poi-22` | `bsp` | `dylsb` | `scenic` | `pages/landing/index?s=bsp&scene=dylsb` | `/pages/map/map?poiId=dylsb` |
| 23 | 碑刻区 | `poi-23` | `bsp` | `bkq` | `scenic` | `pages/landing/index?s=bsp&scene=bkq` | `/pages/map/map?poiId=bkq` |
| 24 | 下山路第一处牌子（小） | `poi-24` | `bsp` | `xsldycpzx` | `guide` | `pages/landing/index?s=bsp&scene=xsldycpzx` | `/pages/map/map?poiId=xsldycpzx` |
| 25 | 下山第二块牌子（小） | `poi-25` | `bsp` | `xsedkpzx` | `guide` | `pages/landing/index?s=bsp&scene=xsedkpzx` | `/pages/map/map?poiId=xsedkpzx` |
| 26 | 木亭子 | `poi-26` | `bsp` | `mtz` | `scenic` | `pages/landing/index?s=bsp&scene=mtz` | `/pages/map/map?poiId=mtz` |

后续建议：

- 当前 `landing` 已支持 `s=bsp&scene=点位首字母码` 的本地分发逻辑；如果后续接后端接口，建议保持“接口优先、本地兜底”。
- 如果后面要把外部二维码从当前首字母码升级为更稳定的永久码，可在这份清单中新增一列 `二维码永久码`，再批量替换 `scene` 承载的点位值。
