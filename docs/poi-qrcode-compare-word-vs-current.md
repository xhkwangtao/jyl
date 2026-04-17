# 九眼楼 Word 链接与原清单对比

生成时间：2026-04-17

数据来源：

- Word 源文件：`/Users/mac/Developer/Work/jiuyanlou/docs/九眼楼线下点位1.0.docx`
- 原小程序链接清单：`/Users/mac/Developer/Work/jyl/docs/poi-qrcode-list.md`

汇总结论：

- Word 点位行数：`29`
- 原小程序链接条数：`26`
- 同名直接复用：`16`
- 改名复用：`6`
- 按顺序复用：`2`
- Word 拆分后需新增映射：`2`
- Word 有、原清单缺失：`3`
- 原清单独有：`1`

对比表：

| Word 序号 | Word 点位 | Word `scene` | Word landing 路径 | 原清单对应点位 | 原 `scene` | 原 landing 路径 | 对比结果 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 景区大门口左侧牌子 | `jqdmkzcpz` | `pages/landing/index?s=bsp&scene=jqdmkzcpz` | 景区大门口左侧牌子 | `jqdmkzcpz` | `pages/landing/index?s=bsp&scene=jqdmkzcpz` | 同名复用旧链接 | Word 名称与当前旧清单一致，可直接使用。 |
| 2 | 翁万达广场广告牌 | `wwdgcggp` | `pages/landing/index?s=bsp&scene=wwdgcggp` | 翁万达广场 · 检票口 | `wwdgcjpk` | `pages/landing/index?s=bsp&scene=wwdgcjpk` | Word 拆分，原清单合并 | Word 将“翁万达广场广告牌”和“检票口，当心有蛇提示牌”拆成两处；当前旧清单只有一条合并链接。 |
| 3 | 检票口，当心有蛇提示牌 | `jpkdxysp` | `pages/landing/index?s=bsp&scene=jpkdxysp` | 翁万达广场 · 检票口 | `wwdgcjpk` | `pages/landing/index?s=bsp&scene=wwdgcjpk` | Word 拆分，原清单合并 | Word 将检票口警示牌单列；当前旧清单把它和翁万达广场合并成一条链接。 |
| 4 | 步道起点大石头 | `bdqddst` | `pages/landing/index?s=bsp&scene=bdqddst` | 步道起点大石头 | `bdqddst` | `pages/landing/index?s=bsp&scene=bdqddst` | 同名复用旧链接 | Word 名称与当前旧清单一致，可直接使用。 |
| 5 | 铁桥边立牌（大） | `tqblpdpclc` | `pages/landing/index?s=bsp&scene=tqblpdpclc` | 铁桥边立牌（大炮陈列处） | `tqblpdpclc` | `pages/landing/index?s=bsp&scene=tqblpdpclc` | 改名复用旧链接 | 同一处点位，当前旧清单名称更具体。 |
| 6 | 石桥处立牌 | `sqclp` | `pages/landing/index?s=bsp&scene=sqclp` | 无 | 无 | 无 | Word 有，原清单缺失 | Word 单列了石桥处立牌；当前旧清单没有对应链接。 |
| 7 | 石桥边战鼓车 | `sqbzgc` | `pages/landing/index?s=bsp&scene=sqbzgc` | 石桥边战鼓车 | `sqbzgc` | `pages/landing/index?s=bsp&scene=sqbzgc` | 同名复用旧链接 | Word 名称与当前旧清单一致，可直接使用。 |
| 8 | 步道分叉口立牌 | `bdfcklp` | `pages/landing/index?s=bsp&scene=bdfcklp` | 步道分叉口立牌 | `bdfcklp` | `pages/landing/index?s=bsp&scene=bdfcklp` | 同名复用旧链接 | Word 名称与当前旧清单一致，可直接使用。 |
| 9 | 右侧分叉 | `ycfc` | `pages/landing/index?s=bsp&scene=ycfc` | 无 | 无 | 无 | Word 有，原清单缺失 | Word 单列了右侧分叉；当前旧清单没有对应链接。 |
| 10 | 火焰广场处地图旁 | `hygcdt` | `pages/landing/index?s=bsp&scene=hygcdt` | 火焰广场处地图 | `hygcdt` | `pages/landing/index?s=bsp&scene=hygcdt` | 改名复用旧链接 | 同一处点位，Word 名称强调“地图旁”。 |
| 12 | 登山步道起点左侧入口牌 | `dsbdqdzcrkp` | `pages/landing/index?s=bsp&scene=dsbdqdzcrkp` | 登山步道起点左侧入口牌 | `dsbdqdzcrkp` | `pages/landing/index?s=bsp&scene=dsbdqdzcrkp` | 同名复用旧链接 | Word 名称与当前旧清单一致，可直接使用。 |
| 13 | 登山步道凿石料小景 | `dsbdzslxj` | `pages/landing/index?s=bsp&scene=dsbdzslxj` | 登山步道凿石料小景 | `dsbdzslxj` | `pages/landing/index?s=bsp&scene=dsbdzslxj` | 同名复用旧链接 | Word 名称与当前旧清单一致，可直接使用。 |
| 14 | 诗词牌子 | `scpz14` | `pages/landing/index?s=bsp&scene=scpz14` | 诗词牌子-14 | `scpz14` | `pages/landing/index?s=bsp&scene=scpz14` | 按顺序复用旧链接 | Word 用通用名“诗词牌子”；按文档顺序对应当前“诗词牌子-14”。 |
| 15 | 分叉路（大） | `fcld` | `pages/landing/index?s=bsp&scene=fcld` | 无 | 无 | 无 | Word 有，原清单缺失 | Word 单列了分叉路（大）；当前旧清单没有对应链接。 |
| 16 | 毛驴运输石料小景 | `mlysslxj` | `pages/landing/index?s=bsp&scene=mlysslxj` | 毛驴运输石料小景 | `mlysslxj` | `pages/landing/index?s=bsp&scene=mlysslxj` | 同名复用旧链接 | Word 名称与当前旧清单一致，可直接使用。 |
| 17 | 诗词牌子 | `scpz17` | `pages/landing/index?s=bsp&scene=scpz17` | 诗词牌子-17 | `scpz17` | `pages/landing/index?s=bsp&scene=scpz17` | 按顺序复用旧链接 | Word 用通用名“诗词牌子”；按文档顺序对应当前“诗词牌子-17”。 |
| 18 | 分叉路汇合点（大） | `fclhhdd` | `pages/landing/index?s=bsp&scene=fclhhdd` | 分叉路汇合点（大） | `fclhhdd` | `pages/landing/index?s=bsp&scene=fclhhdd` | 同名复用旧链接 | Word 名称与当前旧清单一致，可直接使用。 |
| 19 | 木亭子 | `mtz` | `pages/landing/index?s=bsp&scene=mtz` | 木亭子 | `mtz` | `pages/landing/index?s=bsp&scene=mtz` | 同名复用旧链接 | Word 名称与当前旧清单一致，可直接使用。 |
| 20 | 城上卫生间 | `cswsj` | `pages/landing/index?s=bsp&scene=cswsj` | 城上卫生间 | `cswsj` | `pages/landing/index?s=bsp&scene=cswsj` | 同名复用旧链接 | Word 名称与当前旧清单一致，可直接使用。 |
| 21 | 中军帐小景 | `jzzxj` | `pages/landing/index?s=bsp&scene=jzzxj` | 军中帐小景 | `jzzxj` | `pages/landing/index?s=bsp&scene=jzzxj` | 改名复用旧链接 | 同一处点位，Word 与旧清单只是字序不同。 |
| 22 | 营盘城外牌 | `ypcwp` | `pages/landing/index?s=bsp&scene=ypcwp` | 营盘城外牌 | `ypcwp` | `pages/landing/index?s=bsp&scene=ypcwp` | 同名复用旧链接 | Word 名称与当前旧清单一致，可直接使用。 |
| 23 | 营盘内二维码 | `ypnewm` | `pages/landing/index?s=bsp&scene=ypnewm` | 营盘内二维码 | `ypnewm` | `pages/landing/index?s=bsp&scene=ypnewm` | 同名复用旧链接 | Word 名称与当前旧清单一致，可直接使用。 |
| 24 | 单片楼避雷针底座（内） | `dplblzdzn` | `pages/landing/index?s=bsp&scene=dplblzdzn` | 单片楼避雷针底座（内） | `dplblzdzn` | `pages/landing/index?s=bsp&scene=dplblzdzn` | 同名复用旧链接 | Word 名称与当前旧清单一致，可直接使用。 |
| 25 | 九眼楼 | `jyl` | `pages/landing/index?s=bsp&scene=jyl` | 九眼楼 | `jyl` | `pages/landing/index?s=bsp&scene=jyl` | 同名复用旧链接 | Word 名称与当前旧清单一致，可直接使用。 |
| 26 | 碑刻区 | `bkq` | `pages/landing/index?s=bsp&scene=bkq` | 碑刻区 | `bkq` | `pages/landing/index?s=bsp&scene=bkq` | 同名复用旧链接 | Word 名称与当前旧清单一致，可直接使用。 |
| 新 | 第一楼 | `dylsb` | `pages/landing/index?s=bsp&scene=dylsb` | 第一楼石碑 | `dylsb` | `pages/landing/index?s=bsp&scene=dylsb` | 改名复用旧链接 | 当前旧清单名称更具体，指向“第一楼石碑”。 |
| 27 | 下山路第一处牌子（小） | `xsldycpzx` | `pages/landing/index?s=bsp&scene=xsldycpzx` | 下山路第一处牌子（小） | `xsldycpzx` | `pages/landing/index?s=bsp&scene=xsldycpzx` | 同名复用旧链接 | Word 名称与当前旧清单一致，可直接使用。 |
| 28 | 下山第二块（小） | `xsedkpzx` | `pages/landing/index?s=bsp&scene=xsedkpzx` | 下山第二块牌子（小） | `xsedkpzx` | `pages/landing/index?s=bsp&scene=xsedkpzx` | 改名复用旧链接 | 同一处点位，当前旧清单补了“牌子”字样。 |
| 29 | 分叉点第一个竖牌（小） | `shzfcddygsp` | `pages/landing/index?s=bsp&scene=shzfcddygsp` | 四海镇 · 分叉点第一个竖牌（小） | `shzfcddygsp` | `pages/landing/index?s=bsp&scene=shzfcddygsp` | 改名复用旧链接 | 同一处点位，当前旧清单补了“四海镇”前缀。 |
| 无 | 无 | 无 | 无 | 景区大门 | `jqdm` | `pages/landing/index?s=bsp&scene=jqdm` | 原清单独有 | 当前旧清单有这条链接，但 Word 文档没有单列这个点位。 |
