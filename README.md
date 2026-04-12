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
