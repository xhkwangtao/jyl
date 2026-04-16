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

扫码 landing 页说明：

- landing 页路由为 `miniprogram/pages/landing/index`
- 首页在接收到扫码入口参数时，会先中转到 landing 页，再由 landing 页决定展示激活页、视频页或直接跳转。
- landing 参数解析与来源码映射配置位于 `miniprogram/utils/landing-redirect.js`
- landing 页面主逻辑位于 `miniprogram/pages/landing/index.js`

一、当前已实现的基础入参：

- `scene`：扫码整串参数，常见格式为 `s=hb1&sn=123456`，进入小程序时通常是 URL 编码后的形式。
- `s`：来源码 / 渠道码，用于决定跳转目标。
- `sn`：序列号。当前版本只要带 `sn`，就优先进入 landing 的“激活成功页”样式。

当前基础参数优先级：

- 有 `sn`：直接显示激活成功页样式，不再执行 `s` 跳转。
- 无 `sn`，有 `s` 且命中配置：按 `s` 配置跳转。
- 无 `sn`，有 `s` 但未命中配置：进入视频承接页。
- `s`、`sn` 都没有：显示激活成功页样式。

当前基础 `s` 映射关系：

- `hb1`：跳转到 VIP 购买页，金额 `18.60`
- `hb2`：跳转到 VIP 购买页，金额 `15.80`
- `taipingzhai`：跳转到首页 `/pages/index/index`
- `jinguolou`：跳转到首页 `/pages/index/index`
- `huangyaxizhao`：跳转到首页 `/pages/index/index`
- `changshouyuan`：跳转到首页 `/pages/index/index`

当前 landing 可直接测试的路径示例：

- `/pages/landing/index?s=hb1&sn=123456`
- `/pages/landing/index?s=hb2`
- `/pages/landing/index?sn=123456`
- `/pages/index/index?scene=s%3Dhb1%26sn%3D123456`
- `/pages/index/index?scene=s%3Dhb2`
- `/pages/index/index?scene=s%3Dunknown_source`

二、点位二维码这一版参数约定：

- 点位二维码不建议直接把地图页路径写死在二维码里，统一先进入 landing 页。
- 点位二维码建议统一使用 `scene + s + code + 可选 sn` 这一套参数模型。
- 推荐格式为：`/pages/index/index?scene=s%3Dpoi%26code%3Dpoi-01`
- 其中：
- `s`：入口大类。点位二维码统一建议使用 `poi`
- `code`：二维码目标码，用于唯一标识一个点位或一个扫码入口
- `sn`：仅保留给特殊序列号 / 激活码 / 闪卡码等场景，不建议和普通点位码混用
- 当前 `docs/poi-qrcode-list.md` 中生成的“建议 landing 路径”，采用的就是这套 `s=poi + code=...` 的约定

三、点位二维码分发规则约定：

- 扫码先进入 landing 页，再由 landing 页决定是否跳到地图点位、路线、活动页或其他页面。
- 点位二维码建议的默认动作是：打开地图页并聚焦到对应点位。
- 地图点位二维码后续实现时，建议优先使用接口解析 `s / code / sn`，接口失败或未返回时，再走本地默认配置兜底。
- 接口和本地兜底建议返回统一的数据结构，避免 landing 页维护两套逻辑。

四、扫码入口设计约定：

- `s`：表示入口大类，例如 `poi`、`route`、`campaign`、`card`
- `code`：表示具体入口码，例如 `poi-01`、`route-easy`
- `sn`：表示特殊序列号，仅在激活、卡片、兑换码等场景下使用
- 不建议把每个点位都做成一个新的 `s`
- 不建议长期把 `markerId` 作为二维码外部永久码
- 不建议直接把中文点位名作为二维码主键

五、当前文档与实现状态说明：

- `scene / s / sn` 是当前代码已经支持并实际在 landing 页里使用的基础参数。
- `s=poi + code=...` 是本轮已经确认的点位二维码参数约定，用于后续正式接入 landing 点位分发逻辑。
- `docs/poi-qrcode-list.md` 中的点位二维码清单，已经按这套约定生成。
- 在 landing 尚未补齐 `code` 解析前，清单中的“当前可直开地图路径”可用于联调。

后续维护注意事项：

- 如果要新增扫码来源码，优先修改 `miniprogram/utils/landing-redirect.js` 里的 `LANDING_REDIRECT_CONFIG`
- 如果后续要接真实激活接口，优先改 `miniprogram/pages/landing/index.js` 里“有 `sn` 时”的分支逻辑
- 如果后续正式接入点位二维码，建议在 landing 页里新增 `code` 解析与“接口优先、本地兜底”的点位分发逻辑
- 如果正式上线不再需要视频试看计数测试逻辑，需要同步调整 `landing_video_view_count` 的本地存储使用方式
