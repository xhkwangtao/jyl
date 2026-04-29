# 小程序首页公告与页面统计设计

## 1. 目标

在不改动现有首页主体布局和业务流程的前提下，为九眼楼小程序补齐两项客户端能力：

- 首页公告：接入客户端公告接口，第一阶段只展示 `display_type=modal` 的首页公告。
- 页面统计：为当前小程序全部实际页面统一接入页面访问上报。

本次实现范围仅限小程序端，不包含后端接口、后台管理页或 OpenAPI 变更。

## 2. 范围与约束

### 2.1 首页公告

- 只在首页 [index.js](/Users/wangtao/wtNew/wenlv/jyl/miniprogram/pages/index/index.js) 展示公告。
- 首页现有视觉结构、卡片顺序、交互流程不改。
- 只渲染 `display_type=modal` 的公告。
- `banner` 和 `list` 仅做数据兼容，不进入当前首页 UI。
- 如果接口返回多条 `modal` 公告，只取排序后的第一条可展示项。
- 公告关闭后本地记忆；同一公告不重复弹出，直到公告 `id` 变化或 `updated_at` 变化。

### 2.2 页面统计

- 当前小程序全部实际页面统一接入页面访问上报。
- 上报失败必须静默降级，不影响页面展示、登录、支付、跳转和扫码分发。
- 不记录敏感内容，不透传整包页面 query。

### 2.3 明确不做

- 不实现公告 `banner`、`list` 的可视化展示。
- 不实现多公告轮播或连续弹窗队列。
- 不实现 web-view 页面的新建与内容承载。
- 不改后端接口协议。

## 3. 当前代码现状

### 3.1 小程序页面

当前实际页面包括：

- `/pages/index/index`
- `/pages/landing/index`
- `/pages/my-page/my-page`
- `/pages/order-center/index`
- `/pages/order-center/detail`
- `/pages/study-report/study-report`
- `/pages/check-in/check-in`
- `/pages/staff-study-report/staff-study-report`
- `/subpackages/guide/pages/map/map`
- `/subpackages/guide/pages/ai-chat/ai-chat`
- `/subpackages/guide/pages/scenic-audio-list/scenic-audio-list`
- `/subpackages/guide/pages/payment/subscribe/subscribe`

这些页面都已各自维护 `onLoad`、`onShow`、导航和登录逻辑，不适合用全局劫持 `Page` 或大面积改造生命周期。

### 3.2 网络请求基础设施

项目已有统一请求封装 [request.js](/Users/wangtao/wtNew/wenlv/jyl/miniprogram/utils/request.js)，支持：

- 从存储和默认配置中解析 API Base URL
- 自动带上 JWT Token
- 统一处理请求异常

本次新服务层优先复用该封装。

## 4. 方案选择

本次采用“组件化公告 + 包装式埋点”的方案。

### 4.1 首页公告

- 服务层负责请求和数据标准化。
- 首页页面只做编排：拉取公告、判断是否应弹、响应关闭和跳转。
- 模态框 UI 独立封装为组件，挂在首页根节点最外层作为覆盖层，不侵入现有内容结构。

### 4.2 页面统计

- 服务层负责构建请求体、补齐环境字段、发起上报。
- 包装工具负责在不破坏原页面业务逻辑的前提下，把上报挂到页面生命周期。
- 每个页面只做最小接入，不做全局魔改。

## 5. 首页公告设计

### 5.1 文件职责

- `miniprogram/services/announcement-service.js`
  - 请求 `/client/announcements/home`
  - 提取首页可用公告
  - 标准化公告块结构
- `miniprogram/utils/announcement-link.js`
  - 统一处理 `none`、`miniprogram`、`webview` 跳转
  - 负责 query 拼接和路径保护
- `miniprogram/components/announcement-modal/`
  - 模态框外壳
  - 内容块渲染
  - 关闭按钮和点击事件透出
- `miniprogram/pages/index/index.js`
  - 首页公告拉取时机
  - 是否展示判断
  - 本地关闭记忆
  - 点击跳转前后的页面状态处理

### 5.2 数据选择规则

公告请求返回后按以下顺序处理：

1. 仅读取 `items` 数组。
2. 只保留 `display_type === 'modal'` 的公告。
3. 按后端已返回顺序取第一条公告。
4. 如果该公告已被本地关闭记忆命中，则本次不展示。

### 5.3 公告指纹与关闭记忆

公告指纹规则：

- 主键格式：`<id>:<updated_at>`
- `updated_at` 为空时退化为 `<id>:static`

本地存储只保存“最近一次已关闭的公告指纹”。

行为规则：

- 用户点击关闭按钮：记录当前指纹。
- 用户点击公告内跳转并开始导航：同样记录当前指纹。
- 下次首页 `onShow` 拉取到相同指纹时不再弹出。
- 只要 `id` 或 `updated_at` 变化，就视为新公告重新弹出。

### 5.4 渲染规则

优先使用 `content_blocks` 渲染；若不存在或为空，则回退成单个 `paragraph` 块展示 `content`。

第一阶段支持块类型：

- `image`
- `heading`
- `paragraph`
- `button`

未知块类型直接忽略。

字段缺失处理：

- `image` 缺少 `url` 时忽略该块。
- `heading`、`paragraph`、`button` 缺少 `text` 时忽略该块。
- `link` 缺失时按 `none` 处理。

### 5.5 跳转处理

统一由 `announcement-link` 工具处理：

- `none`：无动作
- `miniprogram`：拼接 `params` 后执行页面内跳转
- `webview`：优先进入统一入口；若项目当前无可用 web-view 页面，则友好提示“暂不支持打开该链接”

安全边界：

- `miniprogram` 仅接受以 `/` 开头的站内路径。
- `params` 只按键值对拼接，不执行动态脚本或模板注入。

### 5.6 展示时机

首页在 `onShow` 时拉取公告，而不是只在 `onLoad` 拉取。

原因：

- 运营上下线或修改公告后，用户返回首页即可感知最新状态。
- 与现有首页登录和资料同步流程兼容，不要求冷启动才能刷新。

失败策略：

- 请求失败：静默忽略，不弹公告，不 toast。
- 字段异常：静默忽略当前公告，不影响首页其他逻辑。

## 6. 页面统计设计

### 6.1 文件职责

- `miniprogram/services/page-analytics-service.js`
  - 生成匿名 ID
  - 采集系统信息和网络信息
  - 构造统计请求体
  - 调用 `/client/analytics/page-view`
- `miniprogram/utils/with-page-analytics.js`
  - 包装页面定义
  - 在保留原 `onLoad`、`onShow`、`onUnload` 的同时插入上报逻辑
  - 管理 referrer 和 source 的轻量运行时状态

### 6.2 页面接入方式

每个页面改为通过包装函数注册：

- `Page(withPageAnalytics(pageMeta, pageDefinition))`

`pageMeta` 至少包含：

- `pagePath`
- `pageTitle`
- 可选的 `buildExtra(options, context)`

这样每个页面仍保留原有逻辑，统计只是在生命周期外围追加最小逻辑。

### 6.3 上报时机

统一在 `onShow` 上报页面访问。

原因：

- 更符合 PV 语义，用户再次返回页面应重新计数。
- 适配 `navigateBack`、多次进入支付页、从 landing 重返首页等真实访问场景。

为避免极短时间的生命周期抖动导致重复上报，服务层增加一次轻量去重：

- 同一路径、同一页面实例、极短时间窗口内的重复触发只上报一次。
- 正常的重新进入或返回显示不被吞掉。

### 6.4 请求体字段来源

- `page_path`
  - 使用当前页面真实路由
- `page_title`
  - 使用显式 `pageMeta.pageTitle`
- `scene`
  - 来自 `wx.getLaunchOptionsSync()` 与后续 `App.onShow` 场景值
- `source`
  - 来自轻量导航来源状态
- `referrer`
  - 来自当前页面栈上一个页面的路由和 query
- `anonymous_id`
  - 本地生成并持久化
- `platform`
  - 来自系统信息
- `wechat_version`
  - 来自系统信息
- `device_model`
  - 来自系统信息
- `network_type`
  - 来自 `wx.getNetworkType`
- `extra`
  - 仅来自页面白名单提取

### 6.5 source 规则

`source` 只记录轻量来源，不要求完整埋点事件链。

建议值：

- `launch`
- `navigateTo`
- `redirectTo`
- `reLaunch`
- `navigateBack`
- `switchTab`
- `unknown`

实现方式：

- 在统一工具中记录“下一次页面展示来源”。
- 页面 `onShow` 消费该值后写入本次上报。
- 首次进入页面默认视为 `launch`。

### 6.6 referrer 规则

优先使用页面栈倒数第二项构造来源页：

- 有上级页：记录其 `route` 和可安全序列化的 query
- 无上级页：空字符串

不依赖调用方手工传入 referrer，避免每个页面重复维护。

### 6.7 anonymous_id 规则

匿名 ID 在本地首次生成后持久化，后续复用。

要求：

- 与登录状态无关
- 不依赖后端返回
- 可在未登录访问和登录访问之间保持稳定

### 6.8 extra 白名单

第一阶段只允许上报业务确认过的安全字段：

- 地图页：`poiId`、`filter`、`action`
- 支付页：`featureKey`
- 订单详情页：`orderNo`

其他页面默认不上报额外字段。

原则：

- 不上报整包 `options`
- 不上报图片、聊天内容、手机号等敏感数据
- 不上报支付密钥和完整支付回调信息

## 7. 页面标题映射

页面标题不从页面 JSON 自动推断，改用显式元数据定义。

建议标题：

- `/pages/index/index`：首页
- `/pages/landing/index`：扫码承接页
- `/pages/my-page/my-page`：我的
- `/pages/order-center/index`：订单中心
- `/pages/order-center/detail`：订单详情
- `/pages/study-report/study-report`：研学报告
- `/pages/check-in/check-in`：守城认证中心
- `/pages/staff-study-report/staff-study-report`：员工研学报告
- `/subpackages/guide/pages/map/map`：地图
- `/subpackages/guide/pages/ai-chat/ai-chat`：AI聊天
- `/subpackages/guide/pages/scenic-audio-list/scenic-audio-list`：景点讲解
- `/subpackages/guide/pages/payment/subscribe/subscribe`：购买页

## 8. 异常处理与兼容边界

### 8.1 首页公告

- 接口失败：静默忽略
- 返回结构异常：静默忽略当前公告
- 未知块类型：忽略该块
- 跳转失败：提示轻量错误，不影响首页继续使用

### 8.2 页面统计

- 系统信息获取失败：字段置空或默认值
- 网络类型获取失败：字段置空
- 统计接口失败：静默忽略，不 toast
- 包装函数不得改变原有页面的执行顺序和 `this` 上下文

### 8.3 与现有重点流程的兼容性

实现时必须重点保护这些已有流程：

- 首页静默登录与用户资料同步
- landing 页扫码分发
- 地图页权限和付费拦截
- 支付页购买和回跳
- 研学答题卡与报告流程

## 9. 测试与验证策略

### 9.1 纯函数与服务层测试

优先为纯逻辑补最小自动化测试，覆盖：

- 公告指纹生成
- 公告关闭记忆命中判断
- `content_blocks` 回退规则
- 公告链接 query 拼接
- 页面标题映射
- `extra` 白名单过滤
- 统计请求体标准化

### 9.2 手工回归

至少验证以下场景：

1. 首页首次进入且存在 `modal` 公告时成功弹出。
2. 用户关闭公告后再次进入首页不再弹出。
3. 同一公告 `updated_at` 变化后重新弹出。
4. 点击公告内跳转后返回首页不重复弹出。
5. 所有页面进入时都能静默触发统计请求。
6. 统计接口失败时页面无 toast、无阻塞。
7. landing、地图、购买页等复杂页面原有流程不受影响。

## 10. 实施顺序建议

建议实施顺序：

1. 先补公告和统计相关纯函数测试。
2. 实现 `announcement-service` 与 `announcement-link`。
3. 实现 `announcement-modal` 组件并接入首页。
4. 实现 `page-analytics-service` 与 `with-page-analytics`。
5. 为全部页面逐一接入包装函数。
6. 完成关键页面回归验证。

## 11. 成功标准

当以下条件全部满足时，本次客户端实现视为完成：

- 首页能按接口数据弹出 `modal` 公告。
- 用户关闭同一公告后不会重复弹出，直到 `id` 或 `updated_at` 变化。
- 首页现有页面结构和主要业务流程没有回归。
- 当前小程序全部实际页面都已统一接入访问统计。
- 页面统计请求失败不会影响用户操作。
- 不上报超出设计文档允许范围的敏感信息。
