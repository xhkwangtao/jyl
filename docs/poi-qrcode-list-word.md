# 九眼楼 Word 对应小程序链接清单

生成时间：2026-04-17

数据来源：

- `/Users/mac/Developer/Work/jiuyanlou/docs/九眼楼线下点位1.0.docx`
- `/Users/mac/Developer/Work/jyl/docs/poi-qrcode-list.md`

使用说明：

- 本清单严格按 Word 文档里的点位顺序生成，共 `29` 条点位记录。
- Word 原文缺少序号 `11`，并额外有一条序号为 `新` 的“第一楼”；这里保持原文写法，不擅自重排。
- 所有链接统一采用当前小程序 landing 入口格式：`pages/landing/index?s=bsp&scene={scene}`
- `当前可直接使用 = 是`：表示现有旧清单已经有同一条链接，今天就能直接拿去生成二维码。
- `当前可直接使用 = 否`：表示这是按 Word 拆分或补出的新链接，当前系统里还没有对应映射，正式使用前需要补 landing 分发。

批量生成二维码用纯文本：

```text
1 | 景区大门口左侧牌子 | jqdmkzcpz | pages/landing/index?s=bsp&scene=jqdmkzcpz
2 | 翁万达广场广告牌 | wwdgcggp | pages/landing/index?s=bsp&scene=wwdgcggp
3 | 检票口，当心有蛇提示牌 | jpkdxysp | pages/landing/index?s=bsp&scene=jpkdxysp
4 | 步道起点大石头 | bdqddst | pages/landing/index?s=bsp&scene=bdqddst
5 | 铁桥边立牌（大） | tqblpdpclc | pages/landing/index?s=bsp&scene=tqblpdpclc
6 | 石桥处立牌 | sqclp | pages/landing/index?s=bsp&scene=sqclp
7 | 石桥边战鼓车 | sqbzgc | pages/landing/index?s=bsp&scene=sqbzgc
8 | 步道分叉口立牌 | bdfcklp | pages/landing/index?s=bsp&scene=bdfcklp
9 | 右侧分叉 | ycfc | pages/landing/index?s=bsp&scene=ycfc
10 | 火焰广场处地图旁 | hygcdt | pages/landing/index?s=bsp&scene=hygcdt
12 | 登山步道起点左侧入口牌 | dsbdqdzcrkp | pages/landing/index?s=bsp&scene=dsbdqdzcrkp
13 | 登山步道凿石料小景 | dsbdzslxj | pages/landing/index?s=bsp&scene=dsbdzslxj
14 | 诗词牌子 | scpz14 | pages/landing/index?s=bsp&scene=scpz14
15 | 分叉路（大） | fcld | pages/landing/index?s=bsp&scene=fcld
16 | 毛驴运输石料小景 | mlysslxj | pages/landing/index?s=bsp&scene=mlysslxj
17 | 诗词牌子 | scpz17 | pages/landing/index?s=bsp&scene=scpz17
18 | 分叉路汇合点（大） | fclhhdd | pages/landing/index?s=bsp&scene=fclhhdd
19 | 木亭子 | mtz | pages/landing/index?s=bsp&scene=mtz
20 | 城上卫生间 | cswsj | pages/landing/index?s=bsp&scene=cswsj
21 | 中军帐小景 | jzzxj | pages/landing/index?s=bsp&scene=jzzxj
22 | 营盘城外牌 | ypcwp | pages/landing/index?s=bsp&scene=ypcwp
23 | 营盘内二维码 | ypnewm | pages/landing/index?s=bsp&scene=ypnewm
24 | 单片楼避雷针底座（内） | dplblzdzn | pages/landing/index?s=bsp&scene=dplblzdzn
25 | 九眼楼 | jyl | pages/landing/index?s=bsp&scene=jyl
26 | 碑刻区 | bkq | pages/landing/index?s=bsp&scene=bkq
新 | 第一楼 | dylsb | pages/landing/index?s=bsp&scene=dylsb
27 | 下山路第一处牌子（小） | xsldycpzx | pages/landing/index?s=bsp&scene=xsldycpzx
28 | 下山第二块（小） | xsedkpzx | pages/landing/index?s=bsp&scene=xsedkpzx
29 | 分叉点第一个竖牌（小） | shzfcddygsp | pages/landing/index?s=bsp&scene=shzfcddygsp
```

详细清单：

| Word 序号 | Word 点位名称 | `scene` | 建议 landing 路径 | 当前可直接使用 | 生成方式 | 当前旧清单对应点位 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 景区大门口左侧牌子 | `jqdmkzcpz` | `pages/landing/index?s=bsp&scene=jqdmkzcpz` | 是 | 直接复用 | 景区大门口左侧牌子 | Word 名称与当前旧清单一致，可直接使用。 |
| 2 | 翁万达广场广告牌 | `wwdgcggp` | `pages/landing/index?s=bsp&scene=wwdgcggp` | 否 | 按 Word 拆分后需新增映射 | 翁万达广场 · 检票口 | Word 将“翁万达广场广告牌”和“检票口，当心有蛇提示牌”拆成两处；当前旧清单只有一条合并链接。 |
| 3 | 检票口，当心有蛇提示牌 | `jpkdxysp` | `pages/landing/index?s=bsp&scene=jpkdxysp` | 否 | 按 Word 拆分后需新增映射 | 翁万达广场 · 检票口 | Word 将检票口警示牌单列；当前旧清单把它和翁万达广场合并成一条链接。 |
| 4 | 步道起点大石头 | `bdqddst` | `pages/landing/index?s=bsp&scene=bdqddst` | 是 | 直接复用 | 步道起点大石头 | Word 名称与当前旧清单一致，可直接使用。 |
| 5 | 铁桥边立牌（大） | `tqblpdpclc` | `pages/landing/index?s=bsp&scene=tqblpdpclc` | 是 | 改名复用 | 铁桥边立牌（大炮陈列处） | 同一处点位，当前旧清单名称更具体。 |
| 6 | 石桥处立牌 | `sqclp` | `pages/landing/index?s=bsp&scene=sqclp` | 否 | 需新增映射 | 无 | Word 单列了石桥处立牌；当前旧清单没有对应链接。 |
| 7 | 石桥边战鼓车 | `sqbzgc` | `pages/landing/index?s=bsp&scene=sqbzgc` | 是 | 直接复用 | 石桥边战鼓车 | Word 名称与当前旧清单一致，可直接使用。 |
| 8 | 步道分叉口立牌 | `bdfcklp` | `pages/landing/index?s=bsp&scene=bdfcklp` | 是 | 直接复用 | 步道分叉口立牌 | Word 名称与当前旧清单一致，可直接使用。 |
| 9 | 右侧分叉 | `ycfc` | `pages/landing/index?s=bsp&scene=ycfc` | 否 | 需新增映射 | 无 | Word 单列了右侧分叉；当前旧清单没有对应链接。 |
| 10 | 火焰广场处地图旁 | `hygcdt` | `pages/landing/index?s=bsp&scene=hygcdt` | 是 | 改名复用 | 火焰广场处地图 | 同一处点位，Word 名称强调“地图旁”。 |
| 12 | 登山步道起点左侧入口牌 | `dsbdqdzcrkp` | `pages/landing/index?s=bsp&scene=dsbdqdzcrkp` | 是 | 直接复用 | 登山步道起点左侧入口牌 | Word 名称与当前旧清单一致，可直接使用。 |
| 13 | 登山步道凿石料小景 | `dsbdzslxj` | `pages/landing/index?s=bsp&scene=dsbdzslxj` | 是 | 直接复用 | 登山步道凿石料小景 | Word 名称与当前旧清单一致，可直接使用。 |
| 14 | 诗词牌子 | `scpz14` | `pages/landing/index?s=bsp&scene=scpz14` | 是 | 按顺序复用 | 诗词牌子-14 | Word 用通用名“诗词牌子”；按文档顺序对应当前“诗词牌子-14”。 |
| 15 | 分叉路（大） | `fcld` | `pages/landing/index?s=bsp&scene=fcld` | 否 | 需新增映射 | 无 | Word 单列了分叉路（大）；当前旧清单没有对应链接。 |
| 16 | 毛驴运输石料小景 | `mlysslxj` | `pages/landing/index?s=bsp&scene=mlysslxj` | 是 | 直接复用 | 毛驴运输石料小景 | Word 名称与当前旧清单一致，可直接使用。 |
| 17 | 诗词牌子 | `scpz17` | `pages/landing/index?s=bsp&scene=scpz17` | 是 | 按顺序复用 | 诗词牌子-17 | Word 用通用名“诗词牌子”；按文档顺序对应当前“诗词牌子-17”。 |
| 18 | 分叉路汇合点（大） | `fclhhdd` | `pages/landing/index?s=bsp&scene=fclhhdd` | 是 | 直接复用 | 分叉路汇合点（大） | Word 名称与当前旧清单一致，可直接使用。 |
| 19 | 木亭子 | `mtz` | `pages/landing/index?s=bsp&scene=mtz` | 是 | 直接复用 | 木亭子 | Word 名称与当前旧清单一致，可直接使用。 |
| 20 | 城上卫生间 | `cswsj` | `pages/landing/index?s=bsp&scene=cswsj` | 是 | 直接复用 | 城上卫生间 | Word 名称与当前旧清单一致，可直接使用。 |
| 21 | 中军帐小景 | `jzzxj` | `pages/landing/index?s=bsp&scene=jzzxj` | 是 | 改名复用 | 军中帐小景 | 同一处点位，Word 与旧清单只是字序不同。 |
| 22 | 营盘城外牌 | `ypcwp` | `pages/landing/index?s=bsp&scene=ypcwp` | 是 | 直接复用 | 营盘城外牌 | Word 名称与当前旧清单一致，可直接使用。 |
| 23 | 营盘内二维码 | `ypnewm` | `pages/landing/index?s=bsp&scene=ypnewm` | 是 | 直接复用 | 营盘内二维码 | Word 名称与当前旧清单一致，可直接使用。 |
| 24 | 单片楼避雷针底座（内） | `dplblzdzn` | `pages/landing/index?s=bsp&scene=dplblzdzn` | 是 | 直接复用 | 单片楼避雷针底座（内） | Word 名称与当前旧清单一致，可直接使用。 |
| 25 | 九眼楼 | `jyl` | `pages/landing/index?s=bsp&scene=jyl` | 是 | 直接复用 | 九眼楼 | Word 名称与当前旧清单一致，可直接使用。 |
| 26 | 碑刻区 | `bkq` | `pages/landing/index?s=bsp&scene=bkq` | 是 | 直接复用 | 碑刻区 | Word 名称与当前旧清单一致，可直接使用。 |
| 新 | 第一楼 | `dylsb` | `pages/landing/index?s=bsp&scene=dylsb` | 是 | 改名复用 | 第一楼石碑 | 当前旧清单名称更具体，指向“第一楼石碑”。 |
| 27 | 下山路第一处牌子（小） | `xsldycpzx` | `pages/landing/index?s=bsp&scene=xsldycpzx` | 是 | 直接复用 | 下山路第一处牌子（小） | Word 名称与当前旧清单一致，可直接使用。 |
| 28 | 下山第二块（小） | `xsedkpzx` | `pages/landing/index?s=bsp&scene=xsedkpzx` | 是 | 改名复用 | 下山第二块牌子（小） | 同一处点位，当前旧清单补了“牌子”字样。 |
| 29 | 分叉点第一个竖牌（小） | `shzfcddygsp` | `pages/landing/index?s=bsp&scene=shzfcddygsp` | 是 | 改名复用 | 四海镇 · 分叉点第一个竖牌（小） | 同一处点位，当前旧清单补了“四海镇”前缀。 |
