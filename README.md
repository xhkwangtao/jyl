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
