# Userscript++

一个用户脚本开发框架。**Userscript++ 只发布框架源码**(核心、构建工具、模板和示例),不发布任何要安装的脚本。开发者用它给某个网站写**站点适配**和**插件**,构建出自己的**站点脚本**并自己发布;用户安装的是这些站点脚本。依据 `/mnt/project-files/spec/` 的功能文档(主要是 `framework.md`)净室实现。

**不影响其他脚本。** 每条站点脚本自带一份核心,实例之间完全独立:

- 页面上没有共用的全局名字。实例只通过工厂参数 `U` 交给自己的站点和插件;控制台调试入口挂在这条脚本自己的名字上(开发构建缺省 `uspp_<脚本ID>`,发布构建缺省不挂;名字已被占用时不覆盖,只记 warn)。
- 页面上留下的名字都带脚本 ID:网站存储键 `UserscriptPP:<ID>:settings`、IndexedDB 库 `UserscriptPP:<ID>`、界面根元素 `<uspp-<ID>-root>`、类名 `uspp-<ID>-…`、`data-uspp-<ID>` 标记、样式标识、日志前缀和菜单命令文字(用脚本名)。GM 存储本来就按脚本隔开。
- 只防"同一条脚本重复运行"(按脚本 ID),不会因为页面上有别的基于框架的脚本而退出。
- `fetch`、XHR、WebSocket、EventSource、`history`、`TURBOPACK`、webpack 分块全局、`adoptedStyleSheets` 这些页面对象只在已有值外面串联一层,保留别人的包装;框架不夺回。别人替换 `TURBOPACK` 且没有串联时,框架记 warn 并停用依赖它的功能,不重新挂接。

## 结构

| 层 | 目录 | 内容 |
| --- | --- | --- |
| 核心 | `core/` | 插件管理、设置存储(跨标签同步、三处合并、按站点分区)、框架设置面板(Plugins / Themes / Quick CSS / Keybinds / Notifications / Updates / Backup,插件可再加页)、命令和搜索栏、安全模式、诊断、样式 / 主题 / Quick CSS、弹窗与提示、事件、菜单命令、悬浮按钮、备份 |
| 页面接入工具 | `core/lib/` | Turbopack / webpack 驱动(拦截、补丁、模块查找)、方法补丁器、网络改写、DOM 工具(共用一个 MutationObserver、幂等写入、自身写入不触发自身)、路由变化、网络旁路(只读复制的响应)、React fiber 和 JSX 渲染钩子 |
| 构建工具 | `scripts/build.mjs` | 把核心、站点适配和插件打成一条站点脚本,元数据头全部来自脚本配置;打进 `CHANGELOG.md`;支持 TS / JSX;`--watch` 监视重建,`--hot` 单插件热重载,`--channel` 发布渠道 |
| 脚手架 | `scripts/create.mjs` | 生成站点目录和插件目录的起步文件 |
| CI | `.github/workflows/ci.yml` | 测试、构建、补丁静态检查;每周线上检查补丁,失效时自动开(或追加到已有的)带 `site-changed` 标签的 Issue |
| 补丁检查器 | `scripts/check-patches.mjs` | 静态检查补丁写法;拉取线上页面和全部分块(含懒加载分块)逐条测试补丁,可放进 CI |
| 类型声明 | `types/index.d.ts` | 工厂参数 `U` 的完整类型,JS 里用 JSDoc 也能补全 |
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
   | `name` / `description` / `author` / `icon` / `homepage` / `supportURL` | 写进元数据头。配了 `supportURL` 时多一个命令 "Report a problem":GitHub 仓库地址直接打开填好诊断信息的新建 Issue 页,其他地址打开它并把诊断信息复制到剪贴板 |
   | `namespace` | 不写时按脚本 ID 生成一个唯一值(`userscript-pp:<ID>:<12 位十六进制>`)并写回本文件,以后的构建沿用 |
   | `version` | 不写时用构建时间(UTC)`YYYYMMDD.HHMMSS`;写语义化版本时预发布版本(`1.0.0-beta.2`)比正式版旧 |
   | `updateBase` | 更新地址前缀;写了才有 `@updateURL`(`<前缀><文件名>.meta.js`)和 `@downloadURL`(`<前缀><文件名>.user.js`),不写就没有更新行 |
   | `fileName` | 产物文件名,缺省为脚本 ID |
   | `match` / `excludeMatch` | 缺省取站点定义的 `matches` / `excludeMatches` |
   | `grants` / `connect` / `require` / `resource` | `@grant` 由构建按产物自动推导(扫描用到的 `GM_xxx`,含插件的);`grants` 只用来追加扫描不到的,例如 `GM.getValue` 这类异步接口和 `window.close`。`@connect` 只写用到的主机:`updateBase` 的主机、`themeHosts`、`connect` 里列的(`--hot` 构建另加本机);都没有时不写,脚本不能跨域请求。`connect: ["*"]` 恢复成任意主机。运行时 `U.fetchExternal` / `ctx.fetchExternal` 按同一份列表再把一道关(各脚本管理器对 `@connect` 的执行尺度不一),拦下的请求列在诊断信息里;插件定义里写 `connect: ["api.example"]` 时,这些主机由构建自动收进 `@connect`,这个插件的 `ctx.fetchExternal` 也只能访问它们 |
   | `license` | 写进 `@license`,缺省 `GPL-3.0-or-later`;写了不兼容 GPL 的许可证时构建会提示(见"许可证") |
   | `themeHosts` | 在线主题允许从哪些主机取 CSS(写进 `@connect`);不在列表里的地址,Themes 页会说明原因。脚手架生成的配置里带了几个常见主机 |
   | `global` | 开发构建的控制台调试名,缺省 `uspp_<ID>`;写 `null` 关掉。`window[Symbol.for("uspp:<ID>")]` 上只有页面桥(补丁里 `$self` 用的门面),不是完整接口。插件停了时门面上的函数原样交还第一个参数;第一个参数不是该交还的值时(例如 id、配置字符串),在插件定义里写 `selfFallback` 给出降级 |
   | `globalInProduction` | 为 `true` 时发布构建也挂调试名。调试名上是完整接口,网站自己的脚本也能拿到,发布版不建议打开 |

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

   可选字段还有 `excludeMatches`、`settingsHost`(把框架设置页嵌进站点设置界面,见 `sites/grok/settings-host.js`)、`components`(站点原生组件,核心界面优先用)、`renderer()`(站点自己的 React,返回 `{ React, createRoot, createPortal }`;不提供时核心用内置的 Preact)、`common`(公共件,挂到 `U.sites.<id>.common`)、`api`(旧接口名别名)、`pluginAliases`(把插件的旧字段映射到注入点)、`routeInfo(url)`(路由事件里附带的站点语义)、`network: true` / `route: true`(在 document-start 就装好网络旁路 / 路由监听)、`styleHost: "element"`(样式放进 `<head>` 而不是可构造样式表)、`uiShadow: false`(框架界面不放进 Shadow DOM)。

   框架界面(设置面板、弹窗、通知)缺省放在 `<uspp-root>` 的 Shadow DOM 里,站点的 `button {}`、`* {}` 这类宽泛规则进不来;本系统登记的样式(界面样式、插件样式、主题、Quick CSS)会同步进去一份。要让站点样式作用到框架界面上时写 `uiShadow: false`。

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

   **效果预览**:插件可写 `preview` 字段,设置面板里插件卡片会多一个眼睛按钮,点开后在插件对话框顶部显示预览。可写图片地址 / data: URI、内联 SVG 文本、`{ src, alt, caption }`、前后对比 `{ before, after, caption }`,或实时演示组件 `({ plugin, settings, enabled }) => 节点`(也可写 `{ component, caption }`;改设置时跟着重画),多项写成数组会左右翻页。没写时按 `slots` 自动列出插件会加的按钮和菜单项;写 `preview: false` 不显示。网站的 CSP 可能拦外链图片,优先用 data: URI、内联 SVG 或演示组件。例子见 `sites/example.dev/plugins/ExampleHello`。

   插件名在一条脚本里必须唯一(重名时构建报错)。插件停止时它加的注入点内容、事件订阅、设置监听都会自动撤掉。

6. **构建站点脚本**:`node <框架目录>/scripts/build.mjs --site-dir sites/<id> --out dist`,产出 `<文件名>.user.js` / `.meta.js`(发布构建)和 `<文件名>.dev.user.js` / `.dev.meta.js`(开发构建,名字后带 " (dev)")。`--site-dir` 可写多次,把多个站点打进同一条脚本(配置取第一个站点目录的)。
   开发时用 `--watch`(配合 `--dev`)在源码变化时自动重新构建;脚本管理器里装一次开发构建,改完刷新页面即可(Violentmonkey 可以对本地文件开"跟踪本地文件")。

   **发布渠道**:在 `userscript.json` 里写 `channels`,例如 `"channels": { "beta": { "updateBase": "https://…/beta/" } }`,然后 `--channel beta` 只出这个渠道的发布构建:渠道里的字段覆盖顶层字段;没写 `name` / `fileName` 时名字后加 " (beta)"、文件名加 `.beta`,和稳定版装在一起互不覆盖(同一页面上两者只会运行先注入的那条)。不带 `--channel` 就是稳定版;开发构建相当于 dev 渠道。

7. **在浏览器里验收**:装上开发构建打开目标网站,控制台里 `uspp_<ID>.site.id` 应为你的站点 ID,`Object.keys(uspp_<ID>.plugins)` 里有你的插件且 `started` 为 true;脚本管理器菜单 "<脚本名> settings" 能打开设置面板;`await uspp_<ID>.countIdleMutations(8000)` 的 `count` 应为 0。开发构建里还可以用 `uspp_<ID>.registerSite(定义)` 在控制台试一个站点(不能用 `driver`),发布构建里没有这个工具。
   **检查补丁**(用了打包器驱动时):开发构建里在控制台执行 `await uspp_<ID>.checkPatches()`,会取运行时注册表里全部模块,再找出还没加载的懒加载分块逐个取回(只解析,不执行),逐条测试本脚本所有插件(含已停用的)和站点设置入口的补丁:find 命中几个模块、每条替换是否生效、补丁后的代码能否解析;同时列出解析为空的查找器(`uspp_<ID>.failedFinders()`)。不开浏览器时用命令行:

   ```sh
   node <框架目录>/scripts/check-patches.mjs --site-dir sites/<id>                         # 只做静态检查
   node <框架目录>/scripts/check-patches.mjs --site-dir sites/<id> --url https://站点/      # 拉线上页面和全部分块测试
   node <框架目录>/scripts/check-patches.mjs --site-dir sites/<id> --chunks 保存的分块目录   # 用本地文件测试
   ```

   静态检查会报:正则展开 `\i` 后无法编译、`replace` 引用的 `$n` / `$<name>` 超出捕获组、字符串 `match` 却用了 `$1`、字符串里写了 `\i`、捕获组超过 5 个、匹配串超过 200 字符、贪婪的 `.*`、太短的 `find`。有错误时退出码为 1,在 GitHub Actions 里输出行内标注;`--json` 输出完整报告,`--strict` 让提示也算失败。给了 `--url` / `--chunks` 却一个模块都没取到(页面改版、被拦截、网络失败),或取不到的分块超过 `--max-fetch-failures`(缺省 0.2),也算失败,不会退回静态检查后报通过;`--min-modules <n>` 要求至少取到多少个模块,确实只想做静态检查时加 `--allow-offline`。开发构建的健康报告还会列出最慢的 find(`patchReport().timings`),已停用插件里失配的补丁在 `patchReport().validateMisses`。

8. **配置更新地址并发布**:在 `userscript.json` 里写 `updateBase`(例如你的仓库 raw 地址下的 `dist/`),重新构建,把发布构建的 `.user.js` 和 `.meta.js` 放到该地址。脚本管理器按 `version` 自动更新。

## 设置

- 脚本管理器菜单 "<脚本名> settings"(管理器没有菜单命令时是页面角落的悬浮按钮),或 `U.openSettings({ tab, plugin })`。站点声明了 `settingsHost` 时先用站点自己的设置界面,打不开时用框架面板。
- Plugins 页只列这条脚本里当前站点和通用的插件。
- 主题和 Quick CSS 按站点分区(`plugins.Settings.sites.<站点ID>`;空白站点上按主机名分区),只对当前站点生效。
- 设置存在这条脚本的 GM 存储里,按份分键(脚本管理器按脚本隔开):`UserscriptPPSettings:meta` 存顶层设置和插件名单,`UserscriptPPSettings:p:<插件名>` 存每个插件的设置,每份各带版本;旧版本的整份键 `UserscriptPPSettings` 只在第一次读到时迁移。多个标签页的写入在同一 origin 的 Web Locks 里串行,经 `BroadcastChannel` 广播;在有适配的站点上,这个网站的 `localStorage` 里有一份镜像(同 origin 的标签页之间同步用,也用来补回关页面时没落盘的写入,只"快进" GM),IndexedDB 里另存一份作备份(合并到 2 秒写一次,离开页面时补写)。所以管理器没有值变化监听(AdGuard)时多标签页也能同步。内容和上次写入的一样时不重写。GM 是唯一权威,站点副本只在 GM 为空时拿来救回。升级存储格式后请刷新所有打开的标签页。多个标签页互相同步,收到同步时派发 `settingsSync`。本次构建里没有的插件(暂时拿掉、改名、或用户回退了版本),设置和插件数据先保留并记下最后见到的时间,超过 90 天没再出现才删除。
- Backup 页导出 / 导入整份设置;标 `sensitive: true` 的设置项默认不导出。导入前先列出会打开、会关掉的插件和会变的设置项数;导入时按各插件的设置定义逐项校验(类型、下拉选项、`isValid`),不合法的值改用缺省值并告诉用户,本次构建里没有的插件原样保留。导入前的设置(和要被覆盖的插件数据)存在 GM 存储里 7 天,导入完成的提示条上、Backup 页和搜索栏的 "Undo last import" 都能撤销,刷新页面后也可以。接口:`U.previewImport`、`U.importSettings`、`U.undoImport`、`U.lastImport`。

## 公开接口

即工厂参数 `U`,完整列表见 `framework.md` 第 7 节。另有 `apiVersion`、`scriptId`、`scriptName`、`prefix`(本脚本的 `uspp-<ID>-` 前缀)。常用的:站点 `defineSite`、`site`、`sites`、`isSite`、`buildSites`(`registerSite` 只在开发构建里);插件 `definePlugin`、`registerPlugin`、`startPlugin`、`stopPlugin`、`plugins`、`StartAt`;设置 `definePluginSettings`、`Settings`、`SettingsStore`、`openSettings`;注入点 `addSlotItem`、`removeSlotItem`、`getSlotItems`、`onSlotChange`;DOM `waitForElement`、`observe`、`setAttr`、`setText`、`toggleClass`、`mount`;路由 / 网络 `onRouteChange`、`onRequest`、`onResponse`;界面 `react`、`components`、`icons`、`openModal`、`showToast`、`showNotice`;打包器 `addPatch`、`patchReport`、`onPatchBypassed`、`find*`、`waitFor`。

对照 Void++ 补齐的接口:

| 接口 | 作用 |
| --- | --- |
| `extractAndLoadChunks(code, matcher?)` / `extractAndLoadChunksLazy` | 找到源码匹配 `code` 的模块,取出它懒加载的分块并加载,再执行入口模块;之后 `find*` 就能找到懒加载的组件 |
| `importModule(id)`、`loadChunk(path)` | 按 ID 异步取模块;按路径加载一个分块(优先用运行时自己的加载函数,否则插入 `<script>`) |
| `injectExports(find, { 名字: 原导出 => 值 })` | 给源码匹配的模块追加导出,已执行的立即补上,之后执行的在执行完时补上;不覆盖已有导出,不改运行时的公共方法;返回撤销函数 |
| `findCssClasses(...类名)` / `findCssClassesLazy`、`mapMangledCssClasses(模块, 类名)` | 找 CSS 模块,把混淆后的类名按原名取出 |
| `findBulk(...过滤器)`、`mapMangledModuleLazy` | 一次扫描找多个模块;`mapMangledModule` 的懒版本 |
| `components.Flex` / `Grid` / `Text` / `Paragraph` / `SectionHeader` / `InfoHint` / `ErrorCard` / `ColorSettingRow` / `SelectionCheckbox` / `SelectionActionBar` / `Textarea` | 布局、排版、提示、颜色设置行、批量选择;`CodeEditor` 加 `language: "css"` 带语法高亮 |
| `createExternalStore()`、`createSelectionStore()`、`useExternalStore`、`useFiltered`、`useAsyncAction`、`highlightCss` | 组件间共享的小状态、批量选择、按关键字过滤、带忙状态的异步按钮 |
| STRING 设置的 `multiline: true`(可配 `rows`) | 设置对话框里显示多行输入框 |
| `checkPatches()`、`failedFinders()`(开发构建) | 页面里的补丁 / 查找器检查器,见上文 |

Grok 示例里保留旧名(只在带它的构建里有):`common`、`addChatBarButton`、`removeChatBarButton`、`addContextMenuItem`、`removeContextMenuItem`,以及插件字段 `chatBarButton`、`contextMenuItems`。

## 插件作用域与扩展接口

**`start(ctx)` / `stop(ctx)`。** 插件启动时拿到自己的作用域 `ctx`。经 `ctx` 登记的东西,插件停用时按登记的倒序自动撤掉:`ctx.observe`、`onRouteChange`、`onRequest` / `onResponse`、`rewriteRequest` / `rewriteResponse`、`onWebSocket` / `onEventSource`、`addRenderHook`、`subscribe`、`onSlotChange`、`addSlotItem`、`patch`(方法补丁)、`listen`(事件监听)、`setTimeout` / `setInterval`、`register(撤销函数)`;`ctx.signal` 在停用时中止,`ctx.data` 是插件数据存储。**运行期错误归到插件**:经 `ctx` 登记的回调(监听、定时器、observe、路由、事件、注入点项的点击、网络和方法补丁的处理函数,含 async 的)、`events` / `zustand` / `commands` / `interceptors` / `onSettingsChange` 和 async `start()` 在 await 之后出的错,都记到这个插件名下,插件卡片上显示错误数(悬停看最近一条),诊断信息里有 "Runtime errors" 一行,`U.pluginErrorStats()` 可取;插件自己捕获的错误用 `ctx.reportError(err, 位置)` 记。30 秒内出错 10 次的插件本页先停掉并提示用户(不改开关,刷新后照常启动;必需插件不停)。`start` 同步执行期间直接调用的 `U.observe` 等也归到这个插件名下(`await` 之后不算,一律用 `ctx` 更稳)。**回调以登记它的插件身份运行**:经 `ctx` 或 `U.*` 登记的回调执行时,里面再调用的 `U.*` 归登记它的插件,而不是恰好触发它的插件(例如别的插件在 `start()` 里加了注入点内容,同步通知到你的 `onSlotChange`);插件停止或被熔断后,它的回调不再被调用(`ctx.live` 可查)。插件定义里的 `commands`、`interceptors`、`settingsPages` 也随插件启停。

| 接口 | 作用 |
| --- | --- |
| `U.patchMethod(对象, 方法名, { before, instead, after })` / `ctx.patch` | 给任意对象的方法加钩子。`before` 可改参数、返回 `false` 跳过原方法;`instead(args, next)` 替换调用;`after` 返回非 `undefined` 时替换结果。只在已有方法外包一层;撤销时对象上的方法还是本层才还原,否则留作透传 |
| `rewriteRequest(匹配, 处理)` / `rewriteResponse` | 改写 `fetch` / XHR:返回 `{ url, init, body }` 改请求,`{ block: true }` 拦掉(fetch 抛 TypeError),返回 `Response` 直接作答;`makeResponse(内容)` 造响应。只在有改写匹配时才走异步路径;XHR 只支持同步处理 |
| `onWebSocket(匹配, { open, send, message })` / `onEventSource` | 观察和改写 WebSocket / EventSource 的收发 |
| `ctx.fetchExternal(地址)` | 跨域取数据(走 `GM_xmlhttpRequest`,返回标准 `Response`)。主机要在脚本的 `@connect` 里;插件定义写了 `connect` 时还要在其中,否则拒绝并说明原因 |
| `ctx.data` / `U.DataStore.for(名字)` | 插件数据(缓存、历史这类大块数据):`get` / `set` / `del` / `keys` / `clear`,存在当前网站的 IndexedDB;`.global` 存在 GM 存储里跨网站共享。备份页可选"包含插件数据" |
| 设置项 `isValid` / `disabled` / `hidden` | 设置对话框里校验(不通过时不保存并显示原因)和灰显;`plugin.about` 组件显示在预览上方 |
| 渲染型注入点、`U.renderSlot(注入点, 容器)`、`SlotOutlet` | 插件往注入点放 `render` 组件,每项各自有错误边界;Grok 示例有 `messageAccessory`(回答下方)和 `messageToolbar` |
| 菜单注入点 `patch: true` + `applyMenuPatches` | 插件可以增、删、改原生菜单项(Grok 的 `conversationMenu`) |
| 拦截器 `addInterceptor(名字, 处理)` / 插件字段 `interceptors` | 站点声明的拦截点(Grok:`beforeSend`,发送前改写或取消消息);处理返回新值或 `{ cancel: true }`,出错或超时跳过 |
| 命令 `registerCommand` / 插件字段 `commands`、快捷键、搜索栏 | 命令可绑快捷键(设置的 Keybinds 页改绑、查冲突);`Alt+Shift+P` 打开搜索栏,搜命令、插件和设置项 |
| 安全模式 | 同一个标签页连续两次启动没完成(按标签页计数,存在 `sessionStorage`,同时打开几个标签页互不影响)、网址带 `#uspp-safe` 或菜单 "reload in safe mode" 时只启动必需插件,不加载主题和 Quick CSS;页面上提示原因和最后在启动的插件 |
| 诊断、失败汇总、通知 | `collectDiagnostics()` / 命令 "Copy diagnostic info"(版本、脚本管理器、启用和失败的插件、补丁统计、最近日志;不含设置值);插件启动失败时汇总提示;`notify()` 卡片通知和 Notifications 页历史 |
| `registerSettingsPage({ id, label, component })` / 插件字段 `settingsPages` | 给框架设置面板加一页 |

## 开发者体验

**脚手架。** `node scripts/create.mjs site <id> --dir <目录> [--driver none|webpack|turbopack] [--global <分块全局名>] [--match <网址模式>] [--ts]` 生成站点目录(`index.js`、`userscript.json`、示例插件 `plugins/Hello`;`--ts` 时插件写成 TSX 并带 `tsconfig.json`)。`node scripts/create.mjs plugin <Name> --site <站点目录> [--ts] [--patch]` 加一个插件。已有的文件不覆盖。

**TS / JSX。** 入口可以是 `index.js` / `.mjs` / `.jsx` / `.ts` / `.tsx`,插件里引入的其他文件也一样。JSX 编译成 `U.react.h`,片段是 `U.react.Fragment`,不用自己引入。构建只去掉类型、不做类型检查;要检查就在站点目录里跑 `tsc --noEmit`(脚手架生成的 `tsconfig.json` 把 `userscript-pp` 指向 `types/index.d.ts`)。示例见 `sites/example.dev/plugins/ExampleTsx`。

**sourcemap。** 开发构建末尾内联 sourcemap(已按元数据头的行数平移),控制台报错和断点直接对应回站点、插件的源文件,TS / TSX 显示原来的写法;DevTools 的 Sources 面板里在 `uspp-src:///<脚本 ID>/` 下按目录列出。开发构建因此大几倍,发布构建不带。

**启动耗时。** 每个插件启动时记下耗时(`U.plugins.<名>.startMs`,毫秒,含 `start()`、注入点和命令登记,不含先启动的依赖);Plugins 页卡片上标出超过 10 ms 的,诊断信息列出最慢的 5 个。

**单插件热重载。** `node scripts/build.mjs --site-dir <目录> --hot`(= `--watch --dev`,外加 `127.0.0.1:5174` 上的热重载服务,`--hot-port` 改端口)。装好这次的开发构建后:只改了一个插件目录里的文件时,页面上原地替换这个插件(先停、换定义、再启动,开关和设置不变,经 `ctx` 登记的都会撤掉),右下角提示 "Reloaded <插件>";改了核心、站点文件或多个插件时提示重新安装开发构建。页面经 `GM_xmlhttpRequest` 长轮询,不受网站 CSP 的 `connect-src` 限制;但执行推来的代码要用 `new Function`,页面 CSP 禁止时会退回提示重新安装。声明了打包器补丁的插件不能原地替换(补丁只在模块加载时生效),同样提示。只有 `--hot` 构建会连接,普通开发构建和发布构建里没有这段逻辑。

**webpack 驱动。** 站点写 `driver: "webpack"`。脚本在 `Function.prototype` 上临时装一个 `m` 的 setter:运行时启动时执行 `__webpack_require__.m = 模块表`,这时还没有模块执行过,整张表(含入口块里随运行时一起执行的模块)先换成本系统的包装,`.m` 换成代理,之后经 `.m[id] = f` 登记的模块也会包装;拿到一次或页面 `load` 后就撤掉。`driverOptions.global`(可选,`webpackChunk<项目名>`,webpack 4 是 `webpackJsonp`)写了时,分块全局上另装一层 `push`:运行时之前推入的分块和运行时换上自己的 `push` 之后推入的分块都先经过本层,把模块工厂换成本系统的包装再交给下一层。补丁、`find*`、`onModuleLoad`、`patchReport` 和 Turbopack 驱动共用;方法简写的工厂(`123(e,t,n){…}`)会补成 `function`。分块全局已是别的脚本装的访问器时让给对方,补丁记为 `bypassed`。懒加载:`extractAndLoadChunks(源码特征)` 认得 webpack 的 `n.e(12).then(n.bind(n,34))` 和 `Promise.all([n.e(1),n.e(2)]).then(…)` 写法,`loadChunk(分块ID)` 交给运行时自己的 `__webpack_require__.e`,`importModule(ID)` 按 ID 取模块。构建指纹看同源 `<script src>` 的文件名(带内容哈希)。命令行补丁检查器 `--chunks` 能读 webpack 分块;`--url` 先在沙箱里按顺序执行页面引用的脚本(站点自己的运行时会装上),再借运行时的 `__webpack_require__.u` / `.p` 把源码里 `n.e(ID)` 引用的懒加载分块换成地址逐个取回,直到没有新分块(`--limit` 限制总数)。

**更新。** 构建时把站点目录的 `CHANGELOG.md` 打进脚本(每个版本一个二级标题,`## 1.2.0` 或 `## 1.2.0 - 2026-11-01`,下面的列表项是说明;只取最近 30 个版本)。脚本启动时发现版本比上次运行的新,就弹通知"已更新到 vX",点开只列这两次之间的条目;首次安装不提示。配了 `updateBase` 的构建每天自动检查一次发布地址上的 `.meta.js`,有新版本时通知,点通知打开新版本的 `.user.js`,由脚本管理器弹出它自己的安装确认。设置面板的 Updates 页显示当前版本、上次检查时间、"Check now"、"Update to vX" 和完整更新日志,可关掉自动检查;搜索栏里有 "Check for updates"、"Show changelog" 两个命令。插件也能用 `U.checkForUpdate()`、`U.installUpdate()`、`U.openChangelog()`、`U.changelog`。没配 `updateBase` 时不发请求,只有更新日志。

**CI。** `.github/workflows/ci.yml`:每次推送和合并请求跑 `npm test`、检查示例能否构建、补丁静态检查,并把构建出的脚本作为产物上传;每周一和手动触发时拉取线上 Grok 逐条测试补丁,站点改版导致补丁失效时这一步失败并标出是哪条。自己的站点仓库可以照抄,把 `--site grok` 换成 `--site-dir sites/<id>`。

## 与改写同一站点的脚本共存(Grok 示例)

**谁先挂接谁优先。** 本脚本启动时如果发现 `TURBOPACK` 已被先装的脚本挂接(装了访问器,或换了早期数组的 `push`),就不再挂接:在对方的处理链上再包一层,哪怕只是在分块交给运行时之前读一遍,都会改变对方的行为。这时补丁记为 `bypassed`(`patchReport().stats.yielded` 为 true),依赖补丁、需要站点模块的界面入口不出现,框架设置从脚本管理器菜单打开。反过来,本脚本先装、对方后装且不串联地接管 `TURBOPACK` 时,本脚本记 warn,同样按 `bypassed` 处理(`stats.takenOver`),不夺回。开发构建里可用诊断开关 `coexistActive` 强制照常挂接(见 `core/lib/diag.js`)。

下面说的是照常挂接(`coexistActive`)时的行为:和其他同样改写 Grok 模块的用户脚本一起装时,部分模块会先被对方包装。这时补丁记为 `bypassed`,`onPatchBypassed` 通知对应插件,Grok 适配改用渲染钩子兜底,功能不变。共存时 `patchReport()` 预期 `errors 0`、`runtimeFallbacks 0`、`orphaned []`,`Settings`、`GrokChatBar`、`GrokMenus` 列在 `injectionFallbacks` 里。没有打包器驱动的站点上声明了 `patches` 的插件照常启动,补丁列在 `patchReport().notApplicable`。

## 框架版本与引用

框架按语义化版本发布并打 tag(`v0.1.0` 这样),每个版本的改动见 [`CHANGELOG.md`](CHANGELOG.md)。站点仓库把框架作为开发依赖、锁定到某个 tag,升级时改 tag 即可:

```sh
npm install --save-dev github:0-V-linuxdo/UserscriptPP#v0.1.0
npx uspp-build --site-dir sites/<id> --out dist          # = node node_modules/userscript-pp/scripts/build.mjs …
npx uspp-create plugin <Name> --site sites/<id>
npx uspp-check-patches --site-dir sites/<id>
```

构建出的脚本里 `U.frameworkVersion` 是所用的框架版本,`U.version` 是站点脚本自己的版本(`userscript.json` 的 `version`),诊断信息里两个都有。

## 构建与测试

```sh
npm install
npm run build                            # 不带站点参数:只检查 sites/ 下的示例能否构建,不产出脚本
node scripts/build.mjs --site example    # 用框架仓库里的示例站点构建(--site a,b 打进同一条脚本)
node scripts/build.mjs --site-dir ../my-repo/sites/news --out ../my-repo/dist   # 用框架仓库之外的站点目录构建
node scripts/build.mjs --site example --dev --watch   # 监视源码,改动后自动重新构建(npm run watch -- --site example)
node scripts/build.mjs --site-dir … --hot            # 监视 + 单插件热重载(见"开发者体验")
node scripts/create.mjs site my-news --dir ../my-repo/sites/my-news --ts   # 脚手架
node scripts/build.mjs --site-dir … --channel beta    # 只出 beta 渠道的发布构建
node scripts/check-patches.mjs --site grok           # 补丁静态检查(加 --url / --chunks 做线上 / 本地分块测试)
npm test                                 # jsdom 冒烟测试
```

其他参数:`--out <目录>`(缺省 `dist/`)、`--dev` / `--prod`(只出一种构建)。

测试覆盖:Grok 示例脚本独占 / 对方先注入 / 对方后注入 / 组件晚到;空白站点(运行时注册站点、悬浮按钮和菜单命令);示例站点;不带站点参数不产出文件;框架仓库之外的站点目录,元数据头来自配置、发布构建没有调试全局名;没配更新地址时没有更新行、名字空间自动生成并沿用;**同一页面两条基于框架的脚本互不影响**(各自启动、重复注入只运行一次、`fetch` 和 `history` 与中间的第三方包装一起串联、存储键 / 样式 / 菜单 / 界面根元素 / 插件开关各自独立、空闲时 DOM 变更为 0);补丁检查器(页面里:注册表 + 爬到的懒分块全部通过、查找器登记;命令行:静态检查报出各类写法问题、本地分块和 `--url` 线上拉取、站点改版后报 notFound / 替换失配);懒加载分块、导出注入、CSS 类名、批量查找;组件库渲染和 CSS 高亮;多行字符串设置;类型声明覆盖接口上的每个名字;发布渠道;站点适配不引用核心模块;核心里没有站点知识;产物里的 `void` 只作为运算符出现;插件作用域自动清理、方法补丁器、网络改写(fetch / XHR / WebSocket)、设置校验、插件数据、渲染型注入点、菜单补丁、拦截器、命令和快捷键、搜索栏、设置页登记、通知、失败汇总、诊断、安全模式(手动 / 连续启动没完成);TSX 示例插件;热重载(只改一个插件时原地替换、改站点文件时提示整体更新);脚手架生成的 webpack 站点在仿 webpack 5 运行时上补丁生效、补丁后出错退回原始代码、别的脚本先挂接时让给对方,命令行检查器读 webpack 分块(本地分块和 `--url` 线上爬取,含懒加载分块),webpack 懒加载 `extractAndLoadChunks` / `loadChunk` / `importModule`;更新(版本变了提示两次之间的更新日志、到期自动检查、点通知打开新版本、Updates 页、没配更新地址时不请求)。

## 目录

- `core/index.js`:入口(重复运行守卫、实例、选站点、启动顺序)。
- `core/env.js`:脚本身份(ID、名字、调试名)和运行环境。
- `core/lib/`:插件、设置、站点、注入点、主题、样式、事件、菜单命令、备份,以及页面接入工具。
- `core/ui/`:渲染器抽象(站点 React 或内置 Preact)、抽象组件、布局排版小组件(`kit.js`)、CSS 高亮(`highlight.js`)、弹窗、提示、悬浮按钮、样式。
- `core/lib/reporter.js`:补丁检查器的共用逻辑(页面里的 `checkPatches()` 和 `scripts/check-patches.mjs`);`finder-log.js`:开发构建的查找器登记。
- `types/index.d.ts`:公开接口的类型声明。
- `core/settings/`:核心 `Settings` 插件和框架设置面板的四页。
- `sites/example.dev/`、`sites/grok/`:模板和示例(各带 `userscript.json`)。
- `plugins/<名字>/`:通用插件;目录名以 `.dev` 结尾只进开发构建,以 `.chromium` 结尾标记为仅 Chromium。
- `test/`:冒烟测试、仿 Grok 环境、两条脚本同页测试。

## 支持的脚本管理器

适配 Violentmonkey、Tampermonkey、ScriptCat 和 AdGuard(Windows / Mac / Android 版的用户脚本功能)。Greasemonkey 4 和 Safari 上的 Userscripts 只提供 `GM.xxx` 异步接口,不在适配范围内。

| | Violentmonkey | Tampermonkey | ScriptCat | AdGuard |
| --- | --- | --- | --- | --- |
| 设置存储、跨域请求、剪贴板 | 有 | 有 | 有 | 有 |
| 菜单命令 | 有 | 有 | 有 | 没有:设置入口自动改放在页面角落的悬浮按钮区 |
| 多标签页同步 | 有 | 有 | 有 | 没有值变化监听:只在有适配的站点上经网站存储同步 |
| 系统通知 | 有 | 有 | 有 | 只有 `GM.notification`,核心自动退回(构建会一并写 `@grant GM.notification`) |
| `@exclude-match` | 认 | 认 | 认 | 不认:构建同时写一份 `@exclude` |

核心按能力探测,不按管理器名字分支;缺的能力列在诊断信息的 "Script manager" 一行(例如 `missing: menu, crossTabSync`)。`@inject-into`、`@sandbox` 只有部分管理器认,其他的会忽略。

## 许可证

Userscript++ 以 [GPL-3.0](LICENSE)(或更新版本)发布。构建出的站点脚本里打包了框架核心,属于框架的衍生作品;公开发布这样的脚本时,也要以 GPL-3.0 兼容的许可证提供源码(脚本本身不压缩,`.user.js` 即可读源码)。
