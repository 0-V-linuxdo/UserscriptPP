# 更新记录

框架本身的版本记录(站点脚本自己的更新记录写在各自站点目录的 `CHANGELOG.md` 里)。版本号遵循语义化版本:0.x 期间,次版本号(0.1 → 0.2)表示有不兼容改动,修订号(0.1.0 → 0.1.1)只做兼容修正。公开接口的不兼容改动同时递增 `U.apiVersion`。

## 未发布

- 修正跨标签页来回改设置时改动丢失:本页写过的值被别的标签页改掉后,本页再改回原值,"内容没变就不写"会误以为存储里还是它而跳过写入,刷新后改动消失;在别的标签页撤销导入也会因此被吞掉。现在收到别的标签页的写入后按存储里的内容比较;管理器没有值变化监听时照常写入。
- 修正检查更新:自动检查还没回来时手动"Check for updates"会提示 "up to date (vundefined)";现在同时发起的检查共用同一次请求和结果。检查失败不再记为当天已检查(之前离线启动后 24 小时内不再自动检查),改为按 5 分钟、30 分钟、2 小时、6 小时退避重试。Updates 页的"自动检查"开关改了立即重绘。
- 设置带版本号 `$rev`(每次保存加一):读到几份副本、收到别的标签页的写入时以版本号为准,不再依赖时钟(时钟回拨或几台设备时间不准时,旧副本可能盖掉新的);晚到的旧版本直接丢弃。别的标签页删掉整条插件设置(例如重置插件)现在也会同步过来并逐项通知,之前会被本页下次保存写回。旧版本写的设置没有版本号,照旧处理。
- 补丁检查器缺少证据就失败:`--url` / `--chunks` 一个模块都没取到、或取不到的分块太多时退出码为 1,不再悄悄退回静态检查后报通过(每周 CI 线上检查因此能在站点改版或被拦截时开 Issue)。新参数 `--min-modules`、`--max-fetch-failures`、`--allow-offline`;输出列出取不到的分块。CI 的线上检查不再把令牌留在 `.git/config` 里。
- `@grant` 按产物自动推导:构建时扫描用到的 `GM_xxx` 写进元数据头,`userscript.json` 的 `grants` 追加在后面。修正核心用了 `GM_notification` 却没授权、系统通知从不生效的问题。
- 开发构建内联 sourcemap:报错位置和断点对应回站点、插件的源文件(DevTools 里在 `uspp-src:///<脚本 ID>/` 下);热重载推来的插件代码也带 sourcemap。
- 记录每个插件的启动耗时(`plugins.<名>.startMs`):Plugins 页卡片上标出启动超过 10 ms 的插件,诊断信息里列出最慢的 5 个。
- 新命令 "Report a problem":配了 `supportURL` 时出现;GitHub 仓库直接打开填好诊断信息的新建 Issue 页,其他地址打开并把诊断信息复制到剪贴板。只打开页面,不上传任何东西。
- 外部请求白名单:`fetchExternal` 只能访问脚本 `@connect` 里的主机,拦下的请求列在诊断信息里;插件可声明 `connect`,构建时自动收进 `@connect`,运行时这个插件的 `ctx.fetchExternal` 也只能访问这些主机。
- 站点改版提醒:构建指纹变了,或补丁一条都没生效且有失效的,提示用户 "<站点> has changed"(每个版本只提示一次,配了 `supportURL` 时可一键报告问题);CI 每周线上检查失败时自动开 Issue。
- 元数据头写 `@license`(缺省 `GPL-3.0-or-later`,`userscript.json` 的 `license` 可改)。
- 框架界面放进 Shadow DOM,站点的宽泛样式不再影响设置面板;站点可写 `uiShadow: false` 关掉。
- 修正开发构建的 sourcemap 把构建机的本地目录写进脚本:来源名只写相对位置(`sites/<目录>/…`、框架内路径),换目录构建结果不变;热重载推来的插件代码同样处理。
- 适配 Violentmonkey、Tampermonkey、ScriptCat、AdGuard:管理器没有菜单命令时(AdGuard)设置入口改放在悬浮按钮区;`GM_notification`、`GM_setClipboard` 没有时退回 `GM.notification` / `GM.setClipboard`;构建同时写 `@exclude`(AdGuard 不认 `@exclude-match`);诊断信息列出当前管理器缺的能力。
- 运行期错误归到插件:`ctx` 的回调、插件定义里的事件和设置处理函数、async `start()` 的出错按插件计数,显示在插件卡片和诊断信息里(`U.pluginErrorStats()`、`ctx.reportError`);30 秒内出错 10 次的插件本页先停掉并提示。
- 保存:内容没变时不重写;网站存储的备份只写 IndexedDB,合并到 2 秒一次(管理器没有值变化监听时仍写 localStorage 供多标签页同步),旧的 localStorage 副本会删掉。
- `types/index.d.ts` 的公开成员都有文档注释(编辑器悬停可见),测试检查新增成员也要带注释。
- 备份导入:导入前预览会打开、会关掉的插件和会变的设置;按设置定义逐项校验,不合法的值改用缺省值并列出;导入前的设置先存下来,7 天内可撤销(提示条、Backup 页、"Undo last import" 命令,`U.undoImport()`)。

## 0.1.0 - 2026-11-06

- 以 GPL-3.0(或更新版本)发布,见 `LICENSE`。
- 第一个带版本号的框架发布,可以按 tag 引用(见 README "框架版本与引用")。
- `package.json` 提供命令 `uspp-build`、`uspp-create`、`uspp-check-patches`;构建所需的 esbuild、preact 改为运行依赖,框架作为依赖安装后即可构建。
- `scripts/build.mjs` 不写 `--out` 时输出到当前目录的 `dist/`(之前是框架目录的 `dist/`)。
- 新增 `U.frameworkVersion`;诊断信息里带上框架版本。
- 发布构建去掉只在开发构建里用的代码(补丁检查器、查找器登记、热重载);构建里没有 webpack 站点时不打进 webpack 驱动。示例脚本由 417 KB 降到 392 KB。
