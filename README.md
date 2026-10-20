# Userscript++

一个用户脚本开发框架:核心与站点无关,站点开发者在它上面给某个网站写**站点适配**和**插件**。依据 `/mnt/project-files/spec/` 的功能文档(主要是 `framework.md`)净室实现。自带一个 Grok 参考适配,它只用公开接口写成,可以照着它写自己的适配。

## 结构

| 层 | 目录 | 内容 |
| --- | --- | --- |
| 核心 | `core/` | 插件管理、设置存储(跨标签同步、三处合并、按站点分区)、框架设置面板(Plugins / Themes / Quick CSS / Backup)、样式 / 主题 / Quick CSS、弹窗与提示、事件、菜单命令、悬浮按钮、备份 |
| 页面接入工具 | `core/lib/` | Turbopack 驱动(拦截、补丁、模块查找)、DOM 工具(共用一个 MutationObserver、幂等写入、自身写入不触发自身)、路由变化、网络旁路(只读复制的响应)、React fiber 和 JSX 渲染钩子 |
| 站点适配 | `sites/<id>/` | 匹配哪些网址、用哪种接入方式、界面挂在哪里、提供哪些公共件和事件;站点自带插件放在 `sites/<id>/plugins/` |
| 通用插件 | `plugins/` | 在任何站点都可用的插件(目前没有) |

核心只内置一个必需插件 `Settings`。每个页面最多一个当前站点;没有站点匹配时是通用站点 `generic`,只有核心,设置从脚本管理器菜单打开。页面接入工具由当前站点声明后才启用,例如只有声明了 `driver: "turbopack"` 的站点才会拦截打包器。

自带的站点:

- **grok**(参考适配,`*://grok.com/*`):Turbopack 驱动;在 Grok 设置对话框里加 "Userscript++" 分组、头像菜单里加 "Userscript++" 子菜单;注入点 `chatBar`、`conversationMenu`、`messageMenu`、`userMenu`;事件 `streamEnd`;公共件 `UserscriptPP.sites.grok.common`。自带两个隐藏的必需插件 `GrokChatBar`、`GrokMenus`,负责把注入点挂进 Grok 界面(补丁被其他脚本绕过时改用渲染钩子兜底)。
- **example**(只进开发构建,`*://localhost/uspp-example*`):不用打包器,只用 DOM 工具的最小示例。

## 安装与更新

| 文件 | 内容 | 匹配 |
| --- | --- | --- |
| `dist/Userscript++.user.js` | 全站版:核心 + 全部站点适配 | `*://*/*` |
| `dist/Userscript++.grok.user.js` | 单站版:核心 + Grok 适配 | `*://grok.com/*` |
| `*.dev.user.js` | 对应的开发构建(含 `.dev` 站点和插件) | 同上 |

用 Tampermonkey / Violentmonkey 等脚本管理器安装其中一个(全站版和单站版不要同时装)。发布仓库是 https://github.com/0-V-linuxdo/UserscriptPP,`@updateURL` / `@downloadURL` 指向该仓库 `main` 分支 `dist/` 下的同名 `.meta.js` / `.user.js`,脚本管理器按版本号(`YYYYMMDD.HHMM`)自动更新。

## 设置

- 任何站点:脚本管理器菜单 "Userscript++ settings",或 `UserscriptPP.openSettings({ tab, plugin })`。站点声明了 `settingsHost` 时先用站点自己的设置界面,打不开时用框架面板。
- Plugins 页只列当前站点和通用插件,卡片上标出所属站点。
- 主题和 Quick CSS 按站点分区(`plugins.Settings.sites.<站点ID>`;通用站点上按主机名分区),只对当前站点生效;主题可勾选 "Use on all sites"。旧版放在顶层的主题和 Quick CSS 会自动搬到 Grok 分区。
- 设置存在脚本管理器存储(键 `UserscriptPPSettings`,所有网站共用);在有适配的站点上另存一份到 IndexedDB 和 localStorage 作备份,通用站点上不写网站存储。读取时三处合并,以最丰富的一份为主。多个标签页互相同步,收到同步时派发 `settingsSync`。
- Backup 页导出 / 导入整份设置(含全部站点分区);标 `sensitive: true` 的设置项默认不导出。

## 写一个站点适配

以 `sites/example.dev/` 为模板。站点适配和插件都写成**接收公开接口的工厂** `U => 定义`,`U` 就是 `window.UserscriptPP`;不要 `import` 核心的模块(测试会检查),这样适配也能写成一条独立脚本在运行时注册。

1. **新建目录** `sites/<id>/`,`<id>` 用小写字母、数字和 `-`,也是设置分区的键。只想在开发构建里用就把目录命名为 `<id>.dev`。
2. **写站点定义** `sites/<id>/index.js`:

   ```js
   export default U => U.defineSite({
       id: "news",
       name: "News",
       matches: ["*://news.example.com/*"],
       // driver: "turbopack",            // 站点用 Turbopack 打包时才写;否则只用 DOM / 网络工具
       ready: { element: "main", timeout: 15000 },  // 也可以是返回布尔的函数,或 { module: 导出过滤函数 }
       theme: () => document.documentElement.classList.contains("dark") ? "dark" : "light",
       slots: [{ name: "toolbar", kind: "button", context: "点击事件" }],
       events: ["articleOpened"],
       start() { /* 站点自己的启动逻辑:挂注入点、派发站点事件 */ },
   });
   ```

   可选字段还有 `excludeMatches`、`settingsHost`(把框架设置页嵌进站点设置界面,见 `sites/grok/settings-host.js`)、`components`(站点原生组件,核心界面优先用)、`renderer()`(站点自己的 React,返回 `{ React, createRoot, createPortal }`;不提供时核心用内置的 Preact)、`common`(公共件,挂到 `UserscriptPP.sites.<id>.common`)、`api`(旧接口名别名)、`pluginAliases`(把插件的旧字段映射到注入点)、`routeInfo(url)`(路由事件里附带的站点语义)、`network: true` / `route: true`(在 document-start 就装好网络旁路 / 路由监听,才能看到页面的第一个请求;不写时首次调用 `onRequest` / `onRouteChange` 才装)、`styleHost: "element"`(样式放进 `<head>` 而不是可构造样式表)。

3. **挂注入点**:在 `start()` 里用 `U.onSlotChange("toolbar", 重画)` 监听,重画时用 `U.getSlotItems("toolbar")` 取内容,用 `U.mount` / `U.setAttr` / `U.setText` 写 DOM(这些写入不会触发你自己的 `U.observe` 回调,值不变时不写)。站点改版找不到位置时什么都不做。核心自带的注入点 `menuCommand`(脚本管理器菜单)、`floating`(悬浮按钮区)、`settings.pluginActions`(插件卡片上的按钮)在任何站点都能用。
4. **写第一个插件** `sites/<id>/plugins/<插件名>/index.js`(构建时自动把 `site` 设为该站点):

   ```js
   export default U => {
       const settings = U.definePluginSettings({
           greeting: { type: U.OptionType.STRING, default: "Hello", description: "Text shown on click." },
       });
       return U.definePlugin({
           name: "SayHello", description: "Adds a toolbar button.", authors: ["you"],
           enabledByDefault: true,
           startAt: U.StartAt.SiteReady,
           settings,
           slots: {
               toolbar: { label: "Say hello", onClick: () => U.showToast(settings.store.greeting) },
               menuCommand: { label: "Say hello", onSelect: () => U.showToast(settings.store.greeting) },
           },
           events: { articleOpened: d => console.log(d) },
       });
   };
   ```

   插件名在所有站点里必须唯一(重名时构建报错)。插件停止时它加的注入点内容、事件订阅、设置监听都会自动撤掉。
5. **构建单站版**:`node scripts/build.mjs --site <id>`,产物 `dist/Userscript++.<id>.user.js`,`@match` 收窄为该站的 `matches`。
6. **在浏览器里验收**:装上产物打开目标网站,控制台里 `UserscriptPP.site.id` 应为你的站点 ID,`Object.keys(UserscriptPP.plugins)` 里有你的插件且 `started` 为 true;脚本管理器菜单能打开设置面板;`await UserscriptPP.countIdleMutations(8000)` 的 `count` 应为 0。

不想打包时,也可以在另一条用户脚本或控制台里 `UserscriptPP.registerSite(定义)` 运行时注册(不能用 `driver`);当前是通用站点且网址匹配时会切换过去,之后 `registerPlugin` 的插件默认属于它。

## 公开接口

挂在 `window.UserscriptPP` 上,完整列表见 `framework.md` 第 7 节。常用的:站点 `defineSite`、`registerSite`、`site`、`sites`、`isSite`、`buildSites`;插件 `definePlugin`、`registerPlugin`、`startPlugin`、`stopPlugin`、`plugins`、`StartAt`;设置 `definePluginSettings`、`Settings`、`SettingsStore`、`openSettings`;注入点 `addSlotItem`、`removeSlotItem`、`getSlotItems`、`onSlotChange`;DOM `waitForElement`、`observe`、`setAttr`、`setText`、`toggleClass`、`mount`;路由 / 网络 `onRouteChange`、`onRequest`、`onResponse`;界面 `react`、`components`、`icons`、`openModal`、`showToast`、`showNotice`;打包器 `addPatch`、`patchReport`、`onPatchBypassed`、`find*`、`waitFor`。

Grok 上保留旧名:`common`、`addChatBarButton`、`removeChatBarButton`、`addContextMenuItem`、`removeContextMenuItem`,以及插件字段 `chatBarButton`、`contextMenuItems`。其他站点上这些名字存在,调用时只记 debug。

## 与其他脚本共存(Grok)

和其他同样改写 Grok 模块的用户脚本一起装时,部分模块会先被对方包装。这时补丁记为 `bypassed`,`onPatchBypassed` 通知对应插件,Grok 适配改用渲染钩子兜底,功能不变。共存时 `patchReport()` 预期 `errors 0`、`runtimeFallbacks 0`、`orphaned []`,`Settings`、`GrokChatBar`、`GrokMenus` 列在 `injectionFallbacks` 里。没有打包器驱动的站点上声明了 `patches` 的插件照常启动,补丁列在 `patchReport().notApplicable`。

## 构建与测试

```sh
npm install
npm run build                       # 全站版和开发构建,输出到 dist/
node scripts/build.mjs --site grok  # 单站版
npm test                            # jsdom 冒烟测试
```

`--out <目录>` 指定输出目录。测试覆盖:Grok 上独占 / 对方先注入 / 对方后注入 / 组件晚到;两个通用站点(含运行时注册站点、悬浮按钮和菜单命令);示例站点;单站版;站点适配不引用核心模块;核心里没有站点知识;产物里的 `void` 只作为运算符出现。

## 目录

- `core/index.js`:入口(守卫、全局对象、选站点、启动顺序)。
- `core/lib/`:插件、设置、站点、注入点、主题、样式、事件、菜单命令、备份,以及页面接入工具。
- `core/ui/`:渲染器抽象(站点 React 或内置 Preact)、抽象组件、弹窗、提示、悬浮按钮、样式。
- `core/settings/`:核心 `Settings` 插件和框架设置面板的四页。
- `sites/grok/`:Grok 参考适配(`common.js` 公共件、`stream.js` streamEnd、`settings-host.js` 设置入口、`plugins/` 两个挂载插件)。
- `sites/example.dev/`:示例站点。
- `plugins/<名字>/`:通用插件;目录名以 `.dev` 结尾只进开发构建,以 `.chromium` 结尾标记为仅 Chromium。
- `test/`:冒烟测试和仿 Grok 环境。
