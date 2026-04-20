# jyl

九眼楼项目仓库。

当前目录约定：

- `miniprogram/`：微信小程序源码目录
- `editor/`：网页版轨迹与照片编辑器
- `backend/`：后端目录
- `docs/`：文档和轨迹原始资料

微信开发者工具请直接打开 `miniprogram/` 目录。

小程序源码提交和上传时，只以 `miniprogram/` 为准，不应包含 `backend/` 和 `docs/`。

网页编辑器使用方式：

- 进入 `editor/`
- 运行 `npm install`
- 运行 `npm run dev`
- 浏览器打开提示的本地地址，导入 `.kmz` 开始编辑

小程序研学暗号流程说明：

- 暗号收集页当前保留了一个“测试标记收集”按钮，方便开发联调时不扫码直接验证收集、进度、报告解锁等流程。
- 这个按钮不是正式功能。正式使用时，学生只能通过扫描对应二维码收集暗号。
- 统一开关位于 `miniprogram/config/feature-flags.js`
- 配置项为 `ENABLE_MANUAL_SECRET_COLLECTION_FOR_TESTING`
- 当前默认值为 `true`，表示保留测试按钮
- 正式上线前必须改为 `false`，这样暗号收集页里的手动测试按钮会自动隐藏，并且页面逻辑也只允许扫码收集

地图讲解收费测试说明：

- 地图页的景点讲解当前采用“前 3 个景点免费试听，第 4 个新景点开始收费拦截”的规则。
- 免费次数按“已试听过的景点 ID”累计，同一个景点暂停后继续播放不会重复扣次数。
- 当前测试阶段，地图页左下角保留了讲解付费测试悬浮控件，可直接切换“已付费 / 未付费”，并可重置免费试听次数。
- 当前测试阶段，收费墙页点击“立即购买”会直接将对应功能标记为已开通，然后返回上一页，方便联调。
- 正式上线前，需要移除或隐藏地图页这组测试控件，并把收费墙页的模拟开通逻辑替换为真实下单与支付流程。

微信支付分账测试脚本说明：

- 本仓库已提供本地脚本 `scripts/wechat_profitsharing_test.js`，用于微信支付分账联调。
- 该脚本是本地 Node 脚本，不会放到小程序前端里，也不会把商户私钥放进小程序代码。
- 示例配置文件为 `scripts/wechat_profitsharing_test.config.example.json`
- 实际使用时请复制为 `scripts/wechat_profitsharing_test.config.json`
- 建议将私钥、公钥等敏感文件放入项目根目录 `.local-secrets/`
- `.local-secrets/`、`scripts/wechat_profitsharing_test.config.json`、`scripts/.wechat_profitsharing_test.state.json` 已加入忽略，不会提交到仓库

推荐使用步骤：

- `cp scripts/wechat_profitsharing_test.config.example.json scripts/wechat_profitsharing_test.config.json`
- 按实际服务商参数填写配置文件
- 执行 `node scripts/wechat_profitsharing_test.js query-max-ratio`
- 执行 `node scripts/wechat_profitsharing_test.js query-amount`
- 执行 `node scripts/wechat_profitsharing_test.js add-receiver`
- 执行 `node scripts/wechat_profitsharing_test.js profitsharing`
- 执行 `node scripts/wechat_profitsharing_test.js query-order`

脚本当前支持的命令：

- `query-max-ratio`：查询特约商户允许服务商分账的最大比例，仅服务商模式适用
- `query-amount`：查询订单剩余待分金额
- `add-receiver`：添加分账接收方
- `profitsharing`：发起分账
- `query-order`：查询分账结果
- `unfreeze`：解冻剩余待分金额

常用参数覆盖：

- `--config <path>`：指定配置文件
- `--transaction-id <value>`：覆盖微信订单号
- `--out-order-no <value>`：指定商户分账单号
- `--amount <value>`：覆盖分账金额，单位分
- `--description <value>`：覆盖描述
- `--receiver-account <value>`：覆盖接收方账号
- `--receiver-name <value>`：覆盖接收方名称
- `--receiver-type <value>`：覆盖接收方类型
- `--relation-type <value>`：覆盖接收方关系类型
- `--dry-run`：只打印请求，不实际调用微信支付接口

使用注意：

- 当前脚本支持 `merchant`（普通商户）和 `partner`（普通服务商）两种模式
- 普通商户模式下不需要填写 `sub_mchid`
- 服务商模式下需要填写 `sub_mchid`
- 订单必须本身支持分账，否则后续真实请求会失败
- 分账请求和解冻请求都是异步处理，真正结果要继续通过 `query-order` 查询

微信支付 Native 下单测试脚本说明：

- 本仓库已提供本地脚本 `scripts/wechat_payment_test.js`，用于先生成一笔真实微信支付订单，再继续做分账测试
- 示例配置文件为 `scripts/wechat_payment_test.config.example.json`
- 实际使用时请复制为 `scripts/wechat_payment_test.config.json`
- `scripts/wechat_payment_test.config.json`、`scripts/.wechat_payment_test.state.json` 已加入忽略，不会提交到仓库

推荐使用步骤：

- `cp scripts/wechat_payment_test.config.example.json scripts/wechat_payment_test.config.json`
- 执行 `node scripts/wechat_payment_test.js native-prepay`
- 将返回的 `code_url` 转成二维码，用微信扫一扫完成支付
- 支付成功后执行 `node scripts/wechat_payment_test.js query-order`
- 从查单结果中拿到 `transaction_id` 后，再回填到 `scripts/wechat_profitsharing_test.config.json`

脚本当前支持的命令：

- `native-prepay`：生成 Native 支付订单，返回 `code_url`
- `query-order`：通过商户订单号查询支付订单，拿到 `transaction_id`

使用注意：

- 当前脚本按普通商户模式编写，`mode` 必须为 `merchant`
- 为了让后续分账可测试，下单时默认会带 `settle_info.profit_sharing=true`
- `notify_url` 可以先配置成一个临时可访问地址；即使回调逻辑尚未处理，也可以通过主动查单拿到 `transaction_id`

扫码 landing 页说明：

- landing 页路由为 `miniprogram/pages/landing/index`
- 首页在接收到扫码入口参数时，会先中转到 landing 页，再由 landing 页决定展示入口页、视频页或直接跳转。
- landing 参数解析与来源码映射配置位于 `miniprogram/utils/landing-redirect.js`
- landing 页面主逻辑位于 `miniprogram/pages/landing/index.js`

一、当前已实现的基础入参：

- `scene`：扫码整串参数，常见格式为 `s=hb1&sn=123456`；点位场景下也支持直接承载点位首字母码，例如 `scene=jqdm`。
- `s`：来源码 / 渠道码，用于决定跳转目标。
- `sn`：序列号 / 凭证号。当前版本会保留并展示该参数，但不会再触发“闪卡激活”逻辑。

当前基础参数优先级：

- `s=bsp` 且 `scene` 为点位首字母码：优先跳转地图页点位，例如 `s=bsp&scene=jqdm`。
- `s=route` 且 `sn` 命中路线码：优先跳转地图页路线，例如 `s=route&sn=route-highlight`。
- `s=filter` 且 `sn` 命中筛选值：优先跳转地图页筛选。
- 无 `sn`，有 `s` 且命中配置：按 `s` 配置跳转。
- 无 `sn`，有 `s` 但未命中配置：进入视频承接页。
- 只有 `sn` 或没有可跳转参数：显示通用入口页。

当前基础 `s` 映射关系：

- `hb1`：跳转到 VIP 购买页，金额 `18.60`
- `hb2`：跳转到 VIP 购买页，金额 `15.80`
- `taipingzhai`：跳转到首页 `/pages/index/index`
- `jinguolou`：跳转到首页 `/pages/index/index`
- `huangyaxizhao`：跳转到首页 `/pages/index/index`
- `changshouyuan`：跳转到首页 `/pages/index/index`

当前 landing 可直接测试的路径示例：

- `pages/landing/index?s=hb1&sn=123456`
- `pages/landing/index?s=hb2`
- `pages/landing/index?sn=123456`
- `pages/landing/index?s=bsp&scene=jqdm`
- `pages/landing/index?s=route&sn=route-highlight`
- `pages/landing/index?scene=s%3Dhb1%26sn%3D123456`
- `pages/landing/index?scene=s%3Dhb2`
- `pages/landing/index?scene=s%3Dunknown_source`

二、点位二维码这一版参数约定：

- 点位二维码不建议直接把地图页路径写死在二维码里，统一先进入 landing 页。
- 点位二维码当前统一使用 `s + scene` 这一套主参数模型。
- 推荐格式为：`pages/landing/index?s=bsp&scene=jqdm`
- 其中：
- `s`：表示扫码来源类型或渠道码。点位二维码建议固定使用 `bsp`
- `scene`：承载点位首字母码或其他具体业务值。点位建议使用 `jqdm`、`jyl`、`mtz`
- `sn`：保留给路线、凭证或其他序列号场景，不用于点位二维码
- 当前 `docs/poi-qrcode-list.md` 中生成的“建议 landing 路径”，已经切换为 `s=bsp&scene=点位首字母码`

三、点位二维码分发规则约定：

- 扫码先进入 landing 页，再由 landing 页决定是否跳到地图点位、路线、活动页或其他页面。
- 点位二维码建议的默认动作是：打开地图页并聚焦到对应点位。
- 当前代码已经支持 `s=bsp&scene=jqdm` 这类参数直接分发到地图页点位。
- 当前代码也支持 `s=route&sn=route-highlight` 这类参数直接分发到地图页路线。
- 如果后续接真实接口，建议优先使用接口解析 `s / scene / sn`，接口失败或未返回时，再走本地默认配置兜底。
- 接口和本地兜底建议返回统一的数据结构，避免 landing 页维护两套逻辑。

四、扫码入口设计约定：

- `s`：表示扫码来源码或来源类型，例如 `bsp`、`route`、`filter`、`hb1`
- `scene`：优先用于承载扫码入口里的具体业务值。点位场景下承载点位首字母码
- `sn`：继续保留给旧二维码兼容和序列号场景；路线场景下也仍可承载路线码
- 当前点位二维码主协议为 `s=bsp&scene=点位首字母码`
- 不建议直接把中文点位名作为二维码主键

五、当前文档与实现状态说明：

- `scene / s / sn` 是当前代码已经支持并实际在 landing 页里使用的基础参数。
- `s=bsp&scene=jqdm` 这类点位参数已经接入 landing 分发逻辑，可直接跳到地图对应点位。
- 地图页当前对外统一按 `huangyaguan` 那套 URL 参数读取：`filter / poi / poiId / poiName / showAIRoute / action / routeData`。
- `routeData` 用于承载路线信息；当前 landing 分发内置路线时，使用的也是这一个参数。
- `poi_id / poi_name / routeId / route_code` 这类字段不再作为地图页对外 URL 官方入参，仅保留给内部待导航对象或 `routeData` 解析兼容。
- `docs/poi-qrcode-list.md` 中的点位二维码清单，已经按这套约定生成。
- 清单中的“当前可直开地图路径”可继续用于联调或临时测试。

后续维护注意事项：

- 如果要新增扫码来源码，优先修改 `miniprogram/utils/landing-redirect.js` 里的 `LANDING_REDIRECT_CONFIG`
- 如果后续要接真实后端 landing 配置接口，优先改 `miniprogram/utils/landing-redirect.js` 和 `miniprogram/pages/landing/index.js` 的分发逻辑
- 如果后续要扩展更多二维码类型，建议继续沿用当前这套 `s + scene` 主协议，并按需保留 `sn` 兼容，不要再新增一套独立参数模型
- 如果正式上线不再需要视频试看计数测试逻辑，需要同步调整 `landing_video_view_count` 的本地存储使用方式
