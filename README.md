# Userscript++

一个用户脚本开发框架。**Userscript++ 只发布框架源码**(核心、构建工具、模板和示例),不发布任何要安装的脚本。开发者用它给某个网站写**站点适配**和**插件**,构建出自己的**站点脚本**并自己发布;用户安装的是这些站点脚本。依据 `/mnt/project-files/spec/` 的功能文档(主要是 `framework.md`)净室实现。

**不影响其他脚本。** 每条站点脚本自带一份核心,实例之间完全独立:

- 页面上没有共用的全局名字。实例只通过工厂参数 `U` 交给自己的站点和插件;控制台调试入口挂在这条脚本自己的名字上(开发构建缺省 `uspp_<脚本ID>`,发布构建缺省不挂;名字已被占用时不覆盖,只记 warn)。
- 页面上留下的名字都带脚本 ID:网站存储键 `UserscriptPP:<ID>:settings`、IndexedDB 库 `UserscriptPP:<ID>`、界面根元素 `<uspp-<ID>-root>`、类名 `uspp-<ID>-…`、`data-uspp-<ID>` 标记、样式标识、日志前缀和菜单命令文字(用脚本名)。GM 存储本来就按脚本隔开。
- 只防"同一条脚本重复运行"(按脚本 ID),不会因为页面上有别的基于框架的脚本而退出。
- `fetch`、XHR、`history`、`TURBOPACK`、`adoptedStyleSheets` 这些页面对象只在已有值外面串联一层,保留别人的包装;框架不夺回。别人替换 `TURBOPACK` 且没有串联时,框架记 warn 并停用依赖它的功能,不重新挂接。

## 结构

| 层 | 目录 | 内容 |
| --- | --- | --- |
| 核心 | `core/` | 插件管理、设置存储(跨标签同步、三处合并、按站点分区)、框架设置面板(Plugins / Themes / Quick CSS / Backup)、样式 / 主题 / Quick CSS、弹窗与提示、事件、菜单命令、悬浮按钮、备份 |
| 页面接入工具 | `core/lib/` | Turbopack 驱动(拦截、补丁、模块查找)、DOM 工具(共用一个 MutationObserver、幂等写入、自身写入不触发自身)、路由变化、网络旁路(只读复制的响应)、React fiber 和 JSX 渲染钩子 |
| 构建工具 | `scripts/build.mjs` | 把核心、站点适配和插件打成一条站点脚本,元数据头全部来自脚本配置 |
| 模板 / 示例 | `sites/` | `example.dev`(最小模板)、`grok`(用打包器驱动的完整示例) |
| 通用插件 | `plugins/` | 打进每条脚本、在任何站点都可用的插件(目前没有) |

核心只内置一个必需插件 `Settings`。每个页面最多一个当前站点;脚本里没有站点匹配当前网址时是空白站点 `generic`,只有核心(供试接口用)。页面接入工具由当前站点声明后才启用,例如只有声明了 `driver: "turbopack"` 的站点才会拦截打包器。

`sites/` 下的两个站点都只是源码,构建出的示例脚本不带更新地址:

- **example**(`*://localhost/uspp-example*`):不用打包器,只用 DOM 工具的最小模板。
- **grok**(`*://grok.com/*`;Grok 上请用 Void++):Turbopack 驱动;在 Grok 设置对话框和头像菜单里加以脚本名命名的分组 / 子菜单;注入点 `chatBar`、`conversationMenu`、`messageMenu`、`userMenu`;事件 `streamEnd`;公共件 `U.sites.grok.common`。自带两个隐藏的必需插件 `GrokChatBar`、`GrokMenus`(补丁被其他脚本绕过时改用渲染钩子兜底)。

## 写一个站点适配

站点适配和插件都写成**接收框架实例的工厂** `U => 定义`。`U` 是这条脚本自己的实例;不要 `import` 核心的模块(测试会检查)。

1. **在你自己的仓库里建站点目录** `sites/<id>/`。`<id>` 用小写字母开头,含小写字母、数字和 `-`;目录名必须和站点 ID 一致(只给开发构建用的可以叫 `<id>.dev`)。可以把 `sites/example.dev/` 复制过去作起点。框架仓库放在旁边或作依赖都行,构建时指向它的 `scripts/build.mjs`。
2. **写脚本配置** `sites/<id>/userscript.json`(发布信息全部来自这里,框架不提供指向任何仓库的缺省值):

   ```json
   {
       "id": "my-news",
       "name": "My News++",
       "namespace": "https://me.example/userscripts",
       "description": "给 news.example.com 加工具按钮",
       "author": "me",
       "version": "1.0.0"
   }
   ```

   | 字段 | 说明 |
   | --- | --- |
   | `id` | 脚本 ID,缺省为站点 ID;页面上的名字、存储键和产物文件名都用它 |
   | `name` / `description` / `author` / `icon` / `homepage` / `supportURL` | 写进元数据头 |
   | `namespace` | 不写时按脚本 ID 生成一个唯一值(`userscript-pp:<ID>:<12 位十六进制>`)并写回本文件,以后的构建沿用 |
   | `version` | 不写时用构建时间 `YYYYMMDD.HHMM` |
   | `updateBase` | 更新地址前缀;写了才有 `@updateURL`(`<前缀><文件名>.meta.js`)和 `@downloadURL`(`<前缀><文件名>.user.js`),不写就没有更新行 |
   | `fileName` | 产物文件名,缺省为脚本 ID |
   | `match` / `excludeMatch` | 缺省取站点定义的 `matches` / `excludeMatches` |
   | `grants` / `connect` / `require` / `resource` | 在框架必需的授权之外追加;`connect` 缺省 `["*"]` |
   | `global` | 开发构建的控制台调试名,缺省 `uspp_<ID>`;写 `null` 关掉 |
   | `globalInProduction` | 为 `true` 时发布构建也挂调试名 |

3. **写站点定义** `sites/<id>/index.js`:

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

   可选字段还有 `excludeMatches`、`settingsHost`(把框架设置页嵌进站点设置界面,见 `sites/grok/settings-host.js`)、`components`(站点原生组件,核心界面优先用)、`renderer()`(站点自己的 React,返回 `{ React, createRoot, createPortal }`;不提供时核心用内置的 Preact)、`common`(公共件,挂到 `U.sites.<id>.common`)、`api`(旧接口名别名)、`pluginAliases`(把插件的旧字段映射到注入点)、`routeInfo(url)`(路由事件里附带的站点语义)、`network: true` / `route: true`(在 document-start 就装好网络旁路 / 路由监听)、`styleHost: "element"`(样式放进 `<head>` 而不是可构造样式表)。

4. **声明并挂注入点**:在 `start()` 里用 `U.onSlotChange("toolbar", 重画)` 监听,重画时用 `U.getSlotItems("toolbar")` 取内容,用 `U.mount` / `U.setAttr` / `U.setText` 写 DOM(这些写入不会触发你自己的 `U.observe` 回调,值不变时不写)。站点改版找不到位置时什么都不做。核心自带的注入点 `menuCommand`(脚本管理器菜单)、`floating`(悬浮按钮区)、`settings.pluginActions`(插件卡片上的按钮)在任何站点都能用。

   **命名**:源码里写 `uspp-xxx`(元素名、类名)、`data-uspp-xxx`、`uspp_xxx`(ID)时,构建会自动改成带脚本 ID 的 `uspp-<ID>-xxx`、`data-uspp-<ID>-xxx`、`uspp_<ID>_xxx`,两条脚本互不冲突;前面是 `/` 的(网址、路径)不改。`dataset.usppXxx` 这种驼峰写法不会被改写,请用 `setAttribute("data-uspp-xxx", …)`。

5. **写第一个插件** `sites/<id>/plugins/<插件名>/index.js`(构建时自动把 `site` 设为该站点):

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

   插件名在一条脚本里必须唯一(重名时构建报错)。插件停止时它加的注入点内容、事件订阅、设置监听都会自动撤掉。

6. **构建站点脚本**:`node <框架目录>/scripts/build.mjs --site-dir sites/<id> --out dist`,产出 `<文件名>.user.js` / `.meta.js`(发布构建)和 `<文件名>.dev.user.js` / `.dev.meta.js`(开发构建,名字后带 " (dev)")。`--site-dir` 可写多次,把多个站点打进同一条脚本(配置取第一个站点目录的)。
7. **在浏览器里验收**:装上开发构建打开目标网站,控制台里 `uspp_<ID>.site.id` 应为你的站点 ID,`Object.keys(uspp_<ID>.plugins)` 里有你的插件且 `started` 为 true;脚本管理器菜单 "<脚本名> settings" 能打开设置面板;`await uspp_<ID>.countIdleMutations(8000)` 的 `count` 应为 0。开发构建里还可以用 `uspp_<ID>.registerSite(定义)` 在控制台试一个站点(不能用 `driver`),发布构建里没有这个工具。
8. **配置更新地址并发布**:在 `userscript.json` 里写 `updateBase`(例如你的仓库 raw 地址下的 `dist/`),重新构建,把发布构建的 `.user.js` 和 `.meta.js` 放到该地址。脚本管理器按 `version` 自动更新。

## 设置

- 脚本管理器菜单 "<脚本名> settings",或 `U.openSettings({ tab, plugin })`。站点声明了 `settingsHost` 时先用站点自己的设置界面,打不开时用框架面板。
- Plugins 页只列这条脚本里当前站点和通用的插件。
- 主题和 Quick CSS 按站点分区(`plugins.Settings.sites.<站点ID>`;空白站点上按主机名分区),只对当前站点生效。
- 设置存在这条脚本的 GM 存储里(键 `UserscriptPPSettings`,脚本管理器按脚本隔开);在有适配的站点上另存一份到这个网站的 IndexedDB 和 localStorage 作备份(键带脚本 ID)。读取时三处合并,以最丰富的一份为主。多个标签页互相同步,收到同步时派发 `settingsSync`。不在这条脚本里的插件的旧设置在启动时清理。
- Backup 页导出 / 导入整份设置;标 `sensitive: true` 的设置项默认不导出。

## 公开接口

即工厂参数 `U`,完整列表见 `framework.md` 第 7 节。另有 `apiVersion`、`scriptId`、`scriptName`、`prefix`(本脚本的 `uspp-<ID>-` 前缀)。常用的:站点 `defineSite`、`site`、`sites`、`isSite`、`buildSites`(`registerSite` 只在开发构建里);插件 `definePlugin`、`registerPlugin`、`startPlugin`、`stopPlugin`、`plugins`、`StartAt`;设置 `definePluginSettings`、`Settings`、`SettingsStore`、`openSettings`;注入点 `addSlotItem`、`removeSlotItem`、`getSlotItems`、`onSlotChange`;DOM `waitForElement`、`observe`、`setAttr`、`setText`、`toggleClass`、`mount`;路由 / 网络 `onRouteChange`、`onRequest`、`onResponse`;界面 `react`、`components`、`icons`、`openModal`、`showToast`、`showNotice`;打包器 `addPatch`、`patchReport`、`onPatchBypassed`、`find*`、`waitFor`。

Grok 示例里保留旧名(只在带它的构建里有):`common`、`addChatBarButton`、`removeChatBarButton`、`addContextMenuItem`、`removeContextMenuItem`,以及插件字段 `chatBarButton`、`contextMenuItems`。

## 与改写同一站点的脚本共存(Grok 示例)

**谁先挂接谁优先。** 本脚本启动时如果发现 `TURBOPACK` 已被先装的脚本挂接(装了访问器,或换了早期数组的 `push`),就不再挂接:在对方的处理链上再包一层,哪怕只是在分块交给运行时之前读一遍,都会改变对方的行为。这时补丁记为 `bypassed`(`patchReport().stats.yielded` 为 true),依赖补丁、需要站点模块的界面入口不出现,框架设置从脚本管理器菜单打开。反过来,本脚本先装、对方后装且不串联地接管 `TURBOPACK` 时,本脚本记 warn,同样按 `bypassed` 处理(`stats.takenOver`),不夺回。开发构建里可用诊断开关 `coexistActive` 强制照常挂接(见 `core/lib/diag.js`)。

下面说的是照常挂接(`coexistActive`)时的行为:和其他同样改写 Grok 模块的用户脚本一起装时,部分模块会先被对方包装。这时补丁记为 `bypassed`,`onPatchBypassed` 通知对应插件,Grok 适配改用渲染钩子兜底,功能不变。共存时 `patchReport()` 预期 `errors 0`、`runtimeFallbacks 0`、`orphaned []`,`Settings`、`GrokChatBar`、`GrokMenus` 列在 `injectionFallbacks` 里。没有打包器驱动的站点上声明了 `patches` 的插件照常启动,补丁列在 `patchReport().notApplicable`。

## 构建与测试

```sh
npm install
npm run build                            # 不带站点参数:只检查 sites/ 下的示例能否构建,不产出脚本
node scripts/build.mjs --site example    # 用框架仓库里的示例站点构建(--site a,b 打进同一条脚本)
node scripts/build.mjs --site-dir ../my-repo/sites/news --out ../my-repo/dist   # 用框架仓库之外的站点目录构建
npm test                                 # jsdom 冒烟测试
```

其他参数:`--out <目录>`(缺省 `dist/`)、`--dev` / `--prod`(只出一种构建)。

测试覆盖:Grok 示例脚本独占 / 对方先注入 / 对方后注入 / 组件晚到;空白站点(运行时注册站点、悬浮按钮和菜单命令);示例站点;不带站点参数不产出文件;框架仓库之外的站点目录,元数据头来自配置、发布构建没有调试全局名;没配更新地址时没有更新行、名字空间自动生成并沿用;**同一页面两条基于框架的脚本互不影响**(各自启动、重复注入只运行一次、`fetch` 和 `history` 与中间的第三方包装一起串联、存储键 / 样式 / 菜单 / 界面根元素 / 插件开关各自独立、空闲时 DOM 变更为 0);站点适配不引用核心模块;核心里没有站点知识;产物里的 `void` 只作为运算符出现。

## 目录

- `core/index.js`:入口(重复运行守卫、实例、选站点、启动顺序)。
- `core/env.js`:脚本身份(ID、名字、调试名)和运行环境。
- `core/lib/`:插件、设置、站点、注入点、主题、样式、事件、菜单命令、备份,以及页面接入工具。
- `core/ui/`:渲染器抽象(站点 React 或内置 Preact)、抽象组件、弹窗、提示、悬浮按钮、样式。
- `core/settings/`:核心 `Settings` 插件和框架设置面板的四页。
- `sites/example.dev/`、`sites/grok/`:模板和示例(各带 `userscript.json`)。
- `plugins/<名字>/`:通用插件;目录名以 `.dev` 结尾只进开发构建,以 `.chromium` 结尾标记为仅 Chromium。
- `test/`:冒烟测试、仿 Grok 环境、两条脚本同页测试。
