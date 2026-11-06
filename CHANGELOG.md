# 更新记录

框架本身的版本记录(站点脚本自己的更新记录写在各自站点目录的 `CHANGELOG.md` 里)。版本号遵循语义化版本:0.x 期间,次版本号(0.1 → 0.2)表示有不兼容改动,修订号(0.1.0 → 0.1.1)只做兼容修正。公开接口的不兼容改动同时递增 `U.apiVersion`。

## 0.1.0 - 2026-11-06

- 第一个带版本号的框架发布,可以按 tag 引用(见 README "框架版本与引用")。
- `package.json` 提供命令 `uspp-build`、`uspp-create`、`uspp-check-patches`;构建所需的 esbuild、preact 改为运行依赖,框架作为依赖安装后即可构建。
- `scripts/build.mjs` 不写 `--out` 时输出到当前目录的 `dist/`(之前是框架目录的 `dist/`)。
- 新增 `U.frameworkVersion`;诊断信息里带上框架版本。
- 发布构建去掉只在开发构建里用的代码(补丁检查器、查找器登记、热重载);构建里没有 webpack 站点时不打进 webpack 驱动。示例脚本由 417 KB 降到 392 KB。
