// Userscript++ 公开接口的类型声明。站点适配和插件都写成 `U => 定义`,U 就是这里的 UsppApi。
// 用法(JS 里也能得到补全):
//   /** @param {import("userscript-pp").UsppApi} U */
//   export default U => U.definePlugin({ ... });
// 或在 TypeScript 里:import type { UsppApi } from "userscript-pp";

export type Unsubscribe = () => void;
export type Pattern = string | RegExp;
export type Find = Pattern | Pattern[];
export type FilterFn = (value: any) => boolean;
export type Node = any;
export type Component<P = any> = (props: P) => Node;

// ---------- 补丁 ----------
export type ReplaceFn = (match: string, ...groups: any[]) => string;
export interface PatchReplacement {
    /** 正则里可以写 \i 代表一个标识符 */
    match: Pattern;
    /** 字符串里 $self 展开成本插件对象在页面上的门面:只能用补丁源码里写出的 $self.<名字>(方法已绑定到插件对象) */
    replace: string | ReplaceFn;
    /** 返回 false 时跳过这条替换 */
    predicate?: () => boolean;
    /** 替换失配时不报警告(可选的替换用) */
    noWarn?: boolean;
}
export interface Patch {
    /** 用来认出目标模块的源码片段(字符串或正则,数组表示都要命中) */
    find: Find;
    /** 一条或多条替换,按顺序作用在命中的模块源码上 */
    replacement: PatchReplacement | PatchReplacement[];
    /** 补所有命中的模块,而不是第一个 */
    all?: boolean;
    /** 有一条替换失败就整组撤销 */
    group?: boolean;
    /** 找不到模块时不报警告 */
    noWarn?: boolean;
    /** 返回 false 时这组补丁不登记 */
    predicate?: () => boolean;
}
export interface PatchReport {
    stats: { applied: number; bypassed: number; noEffect: number; errors: number; runtimeFallbacks: number; patchedModules: (string | number)[]; injectionFallbacks: string[]; takenOver: boolean; yielded: boolean };
    results: { plugin: string; find: string; moduleId: string | number; replacements: { match: string; status: string; error?: string }[] }[];
    orphaned: string[];
    pending: string[];
    notApplicable: string[];
    /** 已停用插件的补丁(开发构建只校验不应用)里 match 失配的 */
    validateMisses: { plugin: string; find: string; match: string; moduleId: string | number }[];
    /** 开发构建:每条补丁 find 的累计耗时 */
    timings?: { plugin: string; find: string; ms: number }[];
}
export interface CheckIssue { severity: "error" | "warn"; where: string; message: string }
export interface CheckResult {
    plugin: string; index: number; enabled: boolean; find: string;
    status: "ok" | "notFound" | "partial" | "groupReverted" | "syntaxError" | "invalid" | "skipped";
    modules: (string | number)[];
    replacements: { moduleId: string | number; statuses: { match: string; status: string; error?: string }[] }[];
    issues: CheckIssue[];
    ms: number;
}
export interface CheckReport {
    summary: { total: number; ok: number; failed: number; skipped: number; warnings: number; modules: number };
    results: CheckResult[];
    crawl: { chunks: number; failed: { path: string; error: string }[]; truncated: boolean } | null;
    finders: { finder: string; lazy: boolean; calls: number }[];
    validateMisses: PatchReport["validateMisses"];
}

// ---------- 设置 ----------
export declare const enum OptionTypeEnum { STRING = 0, NUMBER = 1, BIGINT = 2, BOOLEAN = 3, SELECT = 4, SLIDER = 5, COMPONENT = 6, CUSTOM = 7 }
export interface SettingCommon {
    /** 显示在设置项下方的说明 */
    description?: string;
    /** 输入框的占位提示 */
    placeholder?: string;
    /** 不在设置对话框里显示(仍可读写) */
    hidden?: boolean;
    /** 改了之后要刷新页面才生效;设置面板会提示刷新 */
    restartNeeded?: boolean;
    /** 导出备份时默认不含 */
    sensitive?: boolean;
    /** 值变化后调用(用户修改、导入、别的标签页同步都算) */
    onChange?(value: any): void;
    /** 传给自定义组件的额外属性 */
    componentProps?: Record<string, unknown>;
}
export type SettingDef = SettingCommon & (
    | { type: OptionTypeEnum.STRING; default?: string; multiline?: boolean; rows?: number }
    | { type: OptionTypeEnum.NUMBER; default?: number }
    | { type: OptionTypeEnum.BIGINT; default?: bigint }
    | { type: OptionTypeEnum.BOOLEAN; default?: boolean }
    | { type: OptionTypeEnum.SELECT; options: readonly { label: string; value: string | number | boolean; default?: boolean }[] }
    | { type: OptionTypeEnum.SLIDER; min: number; max: number; default: number; markers?: number[] }
    | { type: OptionTypeEnum.COMPONENT; component: Component<{ setValue(v: any): void; option: SettingDef }>; default?: unknown }
    | { type: OptionTypeEnum.CUSTOM; default?: unknown }
);
export type SettingsDefinition = Record<string, SettingDef>;
type ValueOf<D> = D extends { type: OptionTypeEnum.BOOLEAN } ? boolean
    : D extends { type: OptionTypeEnum.NUMBER | OptionTypeEnum.SLIDER } ? number
    : D extends { type: OptionTypeEnum.BIGINT } ? bigint
    : D extends { type: OptionTypeEnum.STRING } ? string
    : D extends { type: OptionTypeEnum.SELECT; options: readonly { value: infer V }[] } ? V
    : any;
export type SettingsStore<D extends SettingsDefinition> = { [K in keyof D]: ValueOf<D[K]> };
export interface DefinedSettings<D extends SettingsDefinition = SettingsDefinition> {
    /** 传给 definePluginSettings 的原始定义 */
    def: D;
    /** 各设置项的校验和灰显规则(isValid / disabled) */
    checks: Record<string, { disabled?(): boolean; isValid?(value: any): boolean | string }>;
    /** 所属插件名;插件定义里引用这组设置后才有值 */
    pluginName: string | null;
    /** 读写都会存盘并通知监听者 */
    readonly store: SettingsStore<D>;
    /** 不触发通知的原始对象 */
    readonly plain: SettingsStore<D>;
    /** React / Preact 组件里用:这些键变化时重渲染 */
    use(keys?: (keyof D)[]): SettingsStore<D>;
    /** 只用于类型:给 store 加上不在定义里、由插件自己维护的字段 */
    withPrivateSettings<P extends object>(): DefinedSettings<D> & { store: SettingsStore<D> & P };
}

// ---------- 插件 ----------
export type StartAtValue = "Init" | "DOMContentLoaded" | "SiteReady";
export interface SlotItem { label?: string; icon?: Component | Node; onClick?(e: any, ctx: any): void; onSelect?(ctx: any): void; order?: number; [k: string]: any }
// ---------- 插件作用域 ----------
export interface PatchHooks {
    /** 可以修改 args;返回 false 时不调用原方法 */
    before?(args: any[], self: any): void | false;
    /** 替换调用;next(...参数) 调用原方法(不传参数时沿用 args) */
    instead?(args: any[], next: (...args: any[]) => any, self: any): any;
    /** 返回非 undefined 时替换结果 */
    after?(args: any[], result: any, self: any): any;
}
export interface RequestRewrite { url?: string; init?: RequestInit; body?: any; block?: boolean }
export type RequestRewriteResult = RequestRewrite | Response | void | undefined;
export interface RewriteRequestCtx { url: string; method: string; type: "fetch" | "xhr"; phase?: "open" | "send"; init?: RequestInit; input?: any; body?: string | null; json(): any; respond(body: any, init?: ResponseInit): Response }
export interface RewriteResponseCtx { url: string; method: string; status: number; type: "fetch" | "xhr"; headers?: Headers; text(): any; json(): any; clone?(): Response; respond?(body: any, init?: ResponseInit): Response }
export interface SocketHooks { open?(socket: any, url: string): void; send?(data: any, socket: any): any; message?(data: any, socket: any): any }
export interface PluginDataStore {
    /** 读一个键;没有时返回 fallback */
    get<T = any>(key: string, fallback?: T): Promise<T>;
    /** 写一个键(值可以是任何能结构化克隆的数据) */
    set(key: string, value: any): Promise<void>;
    /** 删一个键 */
    del(key: string): Promise<void>;
    /** 列出全部键 */
    keys(): Promise<string[]>;
    /** 清空本插件的全部数据 */
    clear(): Promise<void>;
}
export interface PluginData extends PluginDataStore { readonly global: PluginDataStore }
/** start(ctx) / stop(ctx) 拿到的作用域:经它登记的东西插件停用时自动撤掉 */
export interface PluginCtx {
    /** 本作用域所属的插件名 */
    readonly plugin: string;
    /** 插件停用时中止;传给 fetch、addEventListener 等可自动取消 */
    readonly signal: AbortSignal;
    /** 同 U.fetchExternal;插件声明了 connect 时只能访问这些主机(当前网站总是允许) */
    fetchExternal(url: string, opts?: { timeout?: number }): Promise<Response>;
    /** 把插件自己捕获的错误记到本插件名下(Plugins 页卡片和诊断信息里显示) */
    reportError(err: unknown, where?: string): void;
    /** 作用域是否已释放(插件已停用) */
    readonly disposed: boolean;
    /** 目前还登记着的清理条数;提前撤销的、到点执行过的定时器不算 */
    readonly pending: number;
    /** 本插件的数据存储(IndexedDB;.global 存在 GM 存储里跨网站共享) */
    readonly data: PluginData;
    /** 登记一个清理函数,插件停用时调用;返回值可提前手动调用 */
    register(fn: () => void): () => void;
    /** 同 U.observe,插件停用时自动退订;回调出错记到本插件名下 */
    observe(selector: string, opts: { added?(el: Element): void; removed?(el: Element): void; root?: Element }): Unsubscribe;
    /** 路由变化时调用;插件停用时自动退订 */
    onRouteChange(fn: (d: { url: string; previous: string | null; info?: any }) => void): Unsubscribe;
    /** 同 U.onRequest,插件停用时自动退订 */
    onRequest: UsppApi["onRequest"];
    /** 同 U.onResponse,插件停用时自动退订 */
    onResponse: UsppApi["onResponse"];
    /** 同 U.rewriteRequest,插件停用时自动撤掉 */
    rewriteRequest: UsppApi["rewriteRequest"];
    /** 同 U.rewriteResponse,插件停用时自动撤掉 */
    rewriteResponse: UsppApi["rewriteResponse"];
    /** 同 U.onWebSocket,插件停用时自动撤掉 */
    onWebSocket: UsppApi["onWebSocket"];
    /** 同 U.onEventSource,插件停用时自动撤掉 */
    onEventSource: UsppApi["onEventSource"];
    /** 同 U.addRenderHook,插件停用时自动撤掉 */
    addRenderHook: UsppApi["addRenderHook"];
    /** 订阅框架事件(见 U.Events);插件停用时自动退订 */
    subscribe(event: string, handler: (data: any) => void): Unsubscribe;
    /** 注入点内容变化时调用;插件停用时自动退订 */
    onSlotChange(slot: string, fn: () => void): Unsubscribe;
    /** 往注入点里加一项;插件停用时自动移除,点击处理出错记到本插件名下 */
    addSlotItem(slot: string, id: string, def: SlotItem): Unsubscribe;
    /** 同 U.patchMethod,插件停用时自动撤掉 */
    patch(obj: any, method: string, hooks: PatchHooks): Unsubscribe;
    /** addEventListener 的作用域版:插件停用时自动移除,回调出错记到本插件名下 */
    listen(target: EventTarget, type: string, fn: (e: any) => void, opts?: any): Unsubscribe;
    /** 插件停用时自动清除;返回值可提前取消 */
    setTimeout(fn: (...a: any[]) => void, ms?: number, ...a: any[]): Unsubscribe;
    /** 插件停用时自动清除;返回值可提前取消 */
    setInterval(fn: (...a: any[]) => void, ms?: number, ...a: any[]): Unsubscribe;
}
export interface CommandDef { id: string; name: string; description?: string; keywords?: string[]; run(): any; defaultKey?: string; plugin?: string; when?(): boolean }
export interface SettingsPageDef { id: string; label: string; icon?: Component; component: Component; order?: number }
export interface NotifyOptions { title?: any; body?: any; icon?: any; onClick?(): void; duration?: number; system?: boolean; type?: string }
export interface InterceptResult<T = any> { value: T; cancelled: boolean; by: string | null }

export interface PluginDef {
    /** 插件名,在本脚本里唯一;也是设置和数据的键 */
    name: string;
    /** 显示在插件卡片上的一句话说明 */
    description: string;
    /** 作者名单,显示在插件卡片上 */
    authors: string[];
    /** 插件卡片上的图标组件 */
    icon?: Component<{ size?: number }>;
    /** 分类标签,Plugins 页按标签筛选 */
    tags?: string[];
    /** 会访问的外部主机(同 @connect 的写法);构建时汇总进 @connect,ctx.fetchExternal 只能访问这些主机,插件卡片上会列出 */
    connect?: string[];
    /** 毫秒时间戳;7 天内的出现在 Recent 分类 */
    updatedAt?: number;
    /** 所属站点 ID;"*" 表示任何站点(构建时按目录自动设置) */
    site?: string;
    /** 首次安装时是否默认启用 */
    enabledByDefault?: boolean;
    /** 必需插件:总是启用,用户不能关,安全模式下也运行 */
    required?: boolean;
    /** 不在 Plugins 页列出 */
    hidden?: boolean;
    /** 只在开发构建里包含 */
    dev?: boolean;
    /** 只在 Chromium 内核浏览器上可用 */
    chromiumOnly?: boolean;
    /** 启用或停用后要刷新页面才生效(例如用了打包器补丁) */
    requiresRestart?: boolean;
    /** 依赖的插件名;启用本插件时自动启用它们,并先启动 */
    dependencies?: string[];
    /** 启动时机,缺省 SiteReady(站点就绪后) */
    startAt?: StartAtValue;
    /** definePluginSettings 的返回值 */
    settings?: DefinedSettings<any>;
    /** 打包器补丁:模块加载时改写源码 */
    patches?: Patch[];
    /** 启用时注册、停用时撤掉的样式名(先用 registerStyle 登记) */
    managedStyle?: string;
    /** 停止时删掉这些选择器匹配的节点 */
    cleanupSelectors?: string[];
    /** 站点 zustand store 订阅(store 名 -> { selector, handler }) */
    zustand?: Record<string, { selector?(state: any): any; handler(current: any, prev: any): void }>;
    /** 注入点内容:注入点名 -> 一项或多项 */
    slots?: Record<string, SlotItem | SlotItem[]>;
    /** 事件订阅:事件名 -> 处理函数 */
    events?: Record<string, (data: any) => void>;
    /** 设置面板里的效果预览 */
    preview?: false | string | { src: string; alt?: string; caption?: string } | { before: string; after: string; caption?: string } | Component | { component: Component; caption?: string } | any[];
    /** 命令:功能搜索栏里能搜到,用户可以绑快捷键;id 自动加上 "<插件名>." 前缀(已含 "." 的除外) */
    commands?: CommandDef[];
    /** 站点声明的拦截器:返回新值替换、{ cancel: true } 取消、undefined 不改 */
    interceptors?: Record<string, (value: any) => any>;
    /** 往框架设置面板加的页 */
    settingsPages?: SettingsPageDef[];
    /** 插件对话框里设置项上方的说明组件 */
    about?: Component<{ plugin: Plugin }>;
    /** 启用时调用;可以是 async(await 之后的出错记为运行期错误) */
    start?(ctx: PluginCtx): void;
    /** 停用时调用;经 ctx 登记的东西会在它之后自动撤掉 */
    stop?(ctx: PluginCtx): void;
    /** 本插件的任一设置变化时调用 */
    onSettingsChange?(): void;
    [extra: string]: any;
}
export interface Plugin extends PluginDef { started: boolean; startError?: any; /** 本页启动耗时(毫秒),未启动时没有 */ startMs?: number }

// ---------- 站点 ----------
export interface SiteDef {
    /** 站点 ID:小写字母开头,和站点目录名一致 */
    id: string;
    /** 站点名,显示在界面和诊断信息里 */
    name: string;
    /** 适用的网址匹配模式(@match 写法) */
    matches: string[];
    /** 排除的网址匹配模式 */
    excludeMatches?: string[];
    /** 打包器驱动:turbopack(Next.js)或 webpack(4 / 5 的 JSONP 分块) */
    driver?: "turbopack" | "webpack";
    /** turbopack:chunkPath 为分块路径前缀;webpack:global 为分块全局名(webpackChunk<项目名> 或 webpackJsonp) */
    driverOptions?: { chunkPath?: string; global?: string };
    /** 站点就绪的判断:函数、等某个元素出现,或等某个模块加载 */
    ready?: (() => boolean) | { element?: string; module?: FilterFn; timeout?: number };
    /** 等站点就绪的最长时间(毫秒),超时后照常启动插件 */
    readyTimeout?: number;
    /** 站点当前是浅色还是深色;框架界面跟着切换 */
    theme?: () => "light" | "dark";
    /** 站点提供的注入点(名字、类型、是否支持菜单补丁) */
    slots?: { name: string; kind: "button" | "menu" | "render" | string; patch?: boolean; context?: string }[];
    /** 站点会派发的事件名 */
    events?: string[];
    /** 可拦截的动作名,站点在动作发生时调用 U.runInterceptors */
    interceptors?: string[];
    /** 把框架设置页嵌进站点自己设置界面的适配 */
    settingsHost?: { open?(opts: any): boolean; isOpen?(): boolean; patches?: Patch[]; [k: string]: any };
    /** 按名字取站点的原生组件;核心界面优先用它们 */
    components?: (name: string) => Component | null;
    /** 站点自己的 React;不提供时核心用内置的 Preact */
    renderer?(): { React: any; createRoot(el: Element): any; createPortal?: any; flushSync?: any } | null;
    /** 公共件,挂到 U.sites.<id>.common */
    common?: Record<string, any>;
    /** 旧接口名别名,挂到 U 上 */
    api?: Record<string, any>;
    /** 把插件的旧字段映射成注入点内容 */
    pluginAliases?: Record<string, (value: any) => Record<string, SlotItem | SlotItem[]>>;
    /** 给路由事件附带站点语义(例如当前是哪个会话) */
    routeInfo?(url: URL): any;
    /** 在 document-start 就装好网络旁路 */
    network?: boolean;
    /** 在 document-start 就装好路由监听 */
    route?: boolean;
    /** 样式放在哪:adopted(可构造样式表,缺省)或 element(<head> 里的 style 元素) */
    styleHost?: "element" | "adopted";
    /** 站点自带的插件(通常由构建按 plugins 目录收集) */
    plugins?: PluginDef[];
    /** 站点适配启动时调用 */
    start?(this: SiteDef, U: UsppApi): void;
    [extra: string]: any;
}

// ---------- 界面 ----------
export interface ReactLike {
    h(type: any, props?: any, ...children: any[]): Node;
    Fragment: any;
    getReact(): any; getRenderer(): any; usingSiteRenderer(): boolean;
    useState<T>(v: T | (() => T)): [T, (v: T | ((p: T) => T)) => void];
    useEffect(fn: () => void | (() => void), deps?: any[]): void;
    useLayoutEffect(fn: () => void | (() => void), deps?: any[]): void;
    useMemo<T>(fn: () => T, deps: any[]): T;
    useRef<T>(v?: T): { current: T };
    useCallback<T extends Function>(fn: T, deps: any[]): T;
    useReducer: any; useContext: any; useId(): string; useSyncExternalStore: any;
    useForceUpdate(): () => void;
    useSubscription(subscribe: (fn: () => void) => Unsubscribe): void;
}
export interface ExternalStore { subscribe(fn: () => void): Unsubscribe; emit(): void; getVersion(): number }
export interface SelectionStore<T = string> extends ExternalStore {
    has(id: T): boolean; readonly size: number; values(): T[];
    add(id: T): void; delete(id: T): void; toggle(id: T): void; setAll(ids: T[]): void; clear(): void;
}
export interface Components {
    Button: Component<{ variant?: "outline" | "primary" | "danger" | "ghost"; size?: "sm" | "md"; onClick?(e: any): void; disabled?: boolean; title?: string; children?: any }>;
    IconButton: Component<{ icon: Component; label: string; onClick?(e: any): void; active?: boolean; disabled?: boolean; size?: number }>;
    Switch: Component<{ checked: boolean; onChange(v: boolean): void; disabled?: boolean; label?: string }>;
    Select: Component<{ value: any; options: { label: string; value: any }[]; onChange(v: any): void; label?: string }>;
    Input: Component<any>;
    Textarea: Component<any>;
    /** language: "css" 时带语法高亮 */
    CodeEditor: Component<{ value: string; onChange?(v: string): void; placeholder?: string; readOnly?: boolean; minHeight?: number; language?: "css" }>;
    Tooltip: Component<{ content: any; children: any }>;
    Row: Component<{ title: any; description?: any; children?: any }>;
    Fragment: any;
    Flex: Component<{ direction?: "row" | "column"; gap?: number | string; align?: string; justify?: string; wrap?: boolean; [k: string]: any }>;
    Grid: Component<{ columns?: number | string; minWidth?: number | string; gap?: number | string; [k: string]: any }>;
    Text: Component<{ as?: string; size?: "xs" | "sm" | "md" | "lg" | "xl" | number; weight?: "normal" | "medium" | "semibold" | "bold" | number; color?: "primary" | "secondary" | "tertiary" | "danger" | string; mono?: boolean; [k: string]: any }>;
    Paragraph: Component<any>;
    SectionHeader: Component<{ title: any; description?: any; action?: any }>;
    InfoHint: Component<{ type?: "info" | "warn" | "danger" | "success"; title?: any; children?: any }>;
    ErrorCard: Component<{ title?: string; error?: unknown; onRetry?(): void }>;
    ColorSettingRow: Component<{ title: any; description?: any; value: string | null; onChange(v: string | null): void; allowClear?: boolean }>;
    SelectionCheckbox: Component<{ selection: SelectionStore<any>; id: any; label?: string }>;
    SelectionActionBar: Component<{ selection: SelectionStore<any>; noun?: string; allIds?: any[]; actions?: { label: string; onClick(ids: any[]): void; danger?: boolean }[]; onDelete?(ids: any[]): void }>;
    useExternalStore<S extends ExternalStore>(store: S): S;
    useFiltered<T>(list: T[], search: string, getKey?: (item: T) => string): T[];
    useAsyncAction(fn: (...a: any[]) => Promise<void>): [boolean, (...a: any[]) => Promise<void>];
    ModalCard: Component<{ title?: any; subtitle?: any; children?: any; footer?: any; onClose?(): void; width?: number }>;
    confirmDialog(opts: { title: string; body?: any; confirmText?: string; cancelText?: string; danger?: boolean }): Promise<boolean>;
    SlotOutlet: Component<{ slot: string; ctx?: any; filter?(def: SlotItem): boolean }>;
}

export declare class Logger {
    constructor(name: string, color?: string);
    log(...a: any[]): void; info(...a: any[]): void; warn(...a: any[]): void; error(...a: any[]): void; debug(...a: any[]): void;
}

// ---------- 接口总表 ----------
export interface ChangelogEntry { version: string; date: string | null; notes: string[] }

export interface UsppApi {
    /** 站点脚本自己的版本(userscript.json 的 version) */
    version: string;
    /** 构建这条脚本所用的 Userscript++ 框架版本 */
    frameworkVersion: string;
    /** 公开接口版本;有不兼容改动时递增 */
    apiVersion: number;
    /** 构建类型 */
    buildType: "development" | "production";
    /** 本脚本的 ID(userscript.json 的 id) */
    scriptId: string;
    /** 本脚本的名字 */
    scriptName: string;
    /** 本脚本在页面上用的名字前缀 uspp-<ID>- */
    prefix: string;
    /** 打进本脚本的站点 ID */
    buildSites: string[];
    // 站点
    /** 定义站点适配(只做类型标注,原样返回) */
    defineSite(def: SiteDef): SiteDef;
    /** 只在开发构建里可用 */
    registerSite(def: SiteDef | ((U: UsppApi) => SiteDef)): boolean;
    /** 当前网页匹配到的站点;都不匹配时是 generic */
    readonly site: SiteDef;
    /** 打进本脚本的全部站点,按 ID */
    readonly sites: Record<string, SiteDef>;
    /** 当前站点是不是这个 ID */
    isSite(id: string): boolean;
    /** 当前站点的分区键(主题、Quick CSS 按它分开存) */
    siteKey(): string;
    // 插件
    /** 已登记的全部插件,按名字 */
    plugins: Record<string, Plugin>;
    /** 运行时登记一个插件;返回是否登记成功(同名已存在等情况为 false) */
    registerPlugin(def: PluginDef): boolean;
    /** 把用户开关记为打开并按条件启动(安全模式、启动阶段未到时不启动;清掉上次失败和熔断的记录);返回现在是否在运行 */
    startPlugin(name: string | Plugin): boolean;
    /** 把用户开关记为关闭并停下;必需插件、仍被别的启用插件依赖的插件不停,返回 false */
    stopPlugin(name: string | Plugin): boolean;
    /** 用户开关是否打开(必需插件和被依赖的插件总是 true) */
    isPluginEnabled(name: string): boolean;
    /** 把用户开关取反并随之启停;必需插件和被依赖的插件不变 */
    togglePlugin(name: string, enabled?: boolean): void;
    /** 插件当前状态:running 运行中、idle 没启用、waiting 启动阶段未到、safeMode 安全模式下不运行、failed 启动失败、tripped 出错太多本页停掉、blocked 依赖被停掉、reloadToEnable 开了但补丁要刷新后才生效、reloadToDisable 关了但补丁本页仍在、missing 没有这个插件 */
    pluginPhase(name: string | Plugin): "running" | "idle" | "waiting" | "safeMode" | "failed" | "tripped" | "blocked" | "reloadToEnable" | "reloadToDisable" | "missing";
    /** 改动要刷新页面才生效的插件(补丁计划、requiresRestart、restartNeeded 设置和页面加载时不同);变化时发 reloadNeeded 事件 */
    reloadNeeded(): string[];
    /** 定义插件(只做类型标注,原样返回) */
    definePlugin<T extends PluginDef>(def: T): T;
    /** 定义插件设置;返回的 store 读写都会存盘 */
    definePluginSettings<D extends SettingsDefinition>(def: D, checks?: DefinedSettings["checks"]): DefinedSettings<D>;
    /** 插件改名后,把旧名字下的设置搬到新名字 */
    migratePluginSettings(name: string, ...oldNames: string[]): void;
    /** 设置项改名后,把旧键的值搬到新键 */
    migratePluginSetting(plugin: string, oldKey: string, newKey: string): void;
    /** 插件在设置对话框里要显示的设置项 */
    getVisibleSettings(p: Plugin): [string, SettingDef][];
    /** 设置项类型 */
    OptionType: { STRING: OptionTypeEnum.STRING; NUMBER: OptionTypeEnum.NUMBER; BIGINT: OptionTypeEnum.BIGINT; BOOLEAN: OptionTypeEnum.BOOLEAN; SELECT: OptionTypeEnum.SELECT; SLIDER: OptionTypeEnum.SLIDER; COMPONENT: OptionTypeEnum.COMPONENT; CUSTOM: OptionTypeEnum.CUSTOM };
    /** 插件启动时机;TurbopackReady 是 SiteReady 的旧名字 */
    StartAt: { Init: "Init"; DOMContentLoaded: "DOMContentLoaded"; SiteReady: "SiteReady"; TurbopackReady: "SiteReady" };
    // 设置
    /** 全部设置(响应式:写入会存盘并通知监听者) */
    Settings: any;
    /** 全部设置的原始对象(不触发通知) */
    PlainSettings: any;
    /** 按路径监听设置变化 */
    SettingsStore: { addChangeListener(path: string, fn: (value: any, path: string) => void): void; removeChangeListener(path: string, fn: Function): void; addPrefixChangeListener(prefix: string, fn: (value: any, path: string) => void): void; removePrefixChangeListener(prefix: string, fn: Function): void; [k: string]: any };
    /** 打开设置:站点声明了 settingsHost 时先用站点的设置界面,否则用框架面板 */
    openSettings(opts?: { tab?: string; plugin?: string }): "site" | "panel";
    /** 打开框架自己的设置面板 */
    openSettingsPanel(opts?: { tab?: string; plugin?: string }): void;
    /** 关闭框架设置面板 */
    closeSettingsPanel(): void;
    /** 打开某个插件的设置对话框 */
    openPluginSettings(plugin: string | Plugin): boolean;
    /** 当前全部设置页(内置页在前,之后是登记的页) */
    readonly settingsPages: readonly { id: string; key: string; label: string; icon: Component; component: Component; custom?: boolean }[];
    /** 往框架设置面板加一页;返回撤销函数 */
    registerSettingsPage(def: SettingsPageDef): Unsubscribe;
    /** 导出这些插件的数据(备份用) */
    exportData(pluginNames: string[]): Promise<Record<string, { site: Record<string, any>; global: Record<string, any> }>>;
    /** 导入插件数据 */
    importData(data: Record<string, { site?: Record<string, any>; global?: Record<string, any> }>): Promise<void>;
    /** 导出设置;标了 sensitive 的设置缺省不含 */
    exportSettings(opts?: { includeSensitive?: boolean }): any;
    /** 导入设置:按设置定义逐项校验(不合法的值改用缺省值),导入前的设置先存下来可撤销;返回是否需要刷新 */
    importSettings(data: any, opts?: { data?: any }): Promise<boolean>;
    /** 导入前预览:会打开、会关掉的插件,会改变的设置项数,以及会被丢掉的不合法值 */
    previewImport(data: any): { turnOn: string[]; turnOff: string[]; changed: number; invalid: { plugin: string; key: string; reason: string }[] };
    /** 撤销上一次导入(7 天内,刷新页面后也可以);没有可撤销的导入时返回 null,否则返回是否需要刷新 */
    undoImport(): Promise<boolean | null>;
    /** 可撤销的上一次导入的时间,没有时为 null */
    lastImport(): Promise<{ at: number } | null>;
    /** 解析备份文件文本 */
    parseBackup(text: string): any;
    // 打包器
    /** 运行时登记一组打包器补丁(只对之后加载的模块生效) */
    addPatch(patch: Patch, pluginName: string): any;
    /** 已登记的全部补丁 */
    patches: any[];
    /** 补丁统计(同 patchReport().stats) */
    patchStats: any;
    /** 每次补丁命中的结果 */
    patchResults: any[];
    /** 补丁健康报告:命中、失配、绕过、没找到模块的 */
    patchReport(): PatchReport;
    /** 某个模块补丁后的源码(排查用) */
    getPatchedCode(id: string | number): string | null;
    /** 本插件的补丁被绕过(别的脚本先接管了打包器等)时调用 */
    onPatchBypassed(pluginName: string, cb: (results: any[]) => void): Unsubscribe;
    /** 记录插件改用了不依赖补丁的退回方案(诊断信息里列出) */
    registerInjectionFallback(pluginName: string, detail?: any): void;
    /** 开发构建:逐条测试补丁和查找器(含懒加载分块) */
    checkPatches?(opts?: { crawl?: boolean; limit?: number; log?: boolean }): Promise<CheckReport>;
    /** 开发构建:解析为空的查找器 */
    failedFinders?(): { finder: string; lazy: boolean; calls: number }[];
    /** 读发布地址上的 .meta.js 检查新版本;没配 updateBase 的构建返回 { hasUpdate: false, error: "no-update-url" } */
    checkForUpdate(): Promise<{ at?: number; current?: string; latest?: string | null; hasUpdate: boolean; error: string | null }>;
    /** 打开新版本的 .user.js,由脚本管理器接手安装;没有更新地址时返回 false */
    installUpdate(): boolean;
    /** 打开更新日志弹窗(缺省全部条目) */
    openChangelog(opts?: { entries?: ChangelogEntry[]; title?: string }): string;
    /** 构建时从站点目录的 CHANGELOG.md 读出的更新日志,新的在前 */
    readonly changelog: ChangelogEntry[];
    /** 开发构建:用新定义原地替换同名插件(热重载用) */
    replacePlugin?(def: PluginDef): { ok: boolean; started?: boolean; reason?: "invalid" | "missing" | "patches"; error?: unknown };
    // 模块查找
    /** 模块过滤器,配合 find / waitFor 使用 */
    filters: { byProps(...keys: string[]): FilterFn; byCode(...p: Pattern[]): FilterFn; byDisplayName(name: string): FilterFn; byStoreName(name: string): FilterFn; componentByCode(...p: Pattern[]): FilterFn; byClassName(...classes: string[]): FilterFn };
    /** 在已加载的模块里找第一个满足过滤器的导出 */
    find<T = any>(filter: FilterFn): T | null;
    /** 找全部满足过滤器的导出 */
    findAll<T = any>(filter: FilterFn): T[];
    /** 找带有这些属性的导出 */
    findByProps<T = any>(...keys: string[]): T | null;
    /** 找源码含这些片段的导出函数 */
    findByCode<T = any>(...p: Pattern[]): T | null;
    /** 按 displayName 找组件 */
    findByDisplayName<T = any>(name: string): T | null;
    /** 按源码片段找组件 */
    findComponentByCode<T = any>(...p: Pattern[]): T | null;
    /** 按导出名找组件 */
    findExportedComponent<T = any>(...names: string[]): T | null;
    /** 按名字找站点的状态 store */
    findStore<T = any>(name: string): T | null;
    /** find 的懒版本:第一次使用返回值时才查找 */
    findLazy<T = any>(filter: FilterFn): T;
    /** findByProps 的懒版本 */
    findByPropsLazy<T = any>(...keys: string[]): T;
    /** findByCode 的懒版本 */
    findByCodeLazy<T = any>(...p: Pattern[]): T;
    /** findByDisplayName 的懒版本,返回代理组件 */
    findByDisplayNameLazy<T = any>(name: string): Component;
    /** findComponentByCode 的懒版本,返回代理组件 */
    findComponentByCodeLazy<T = any>(...p: Pattern[]): Component;
    /** findExportedComponent 的懒版本,返回代理组件 */
    findExportedComponentLazy<T = any>(...names: string[]): Component;
    /** findStore 的懒版本 */
    findStoreLazy<T = any>(name: string): T;
    /** 找源码含这些片段的模块 ID */
    findModuleId(...p: Pattern[]): string | number | null;
    /** 找源码含这些片段的模块工厂,返回 [ID, 工厂] */
    findModuleFactory(...p: Pattern[]): [string | number, Function] | null;
    /** 在混淆过的模块里按过滤器给导出起名 */
    mapMangledModule<K extends string>(patterns: Find, mappers: Record<K, FilterFn>): Partial<Record<K, any>>;
    /** mapMangledModule 的懒版本 */
    mapMangledModuleLazy<K extends string>(patterns: Find, mappers: Record<K, FilterFn>): Partial<Record<K, any>>;
    /** CSS 模块:{ 原类名: 混淆后的类名 } */
    findCssClasses<K extends string>(...classes: K[]): Partial<Record<K, string>>;
    /** findCssClasses 的懒版本 */
    findCssClassesLazy<K extends string>(...classes: K[]): Partial<Record<K, string>>;
    /** 在给定的 CSS 模块对象里按原类名取混淆后的类名 */
    mapMangledCssClasses<K extends string>(mod: Record<string, string>, classes: K[]): Partial<Record<K, string>>;
    /** 一次扫描找多个模块,结果和过滤器一一对应 */
    findBulk(...filters: FilterFn[]): any[];
    /** 按 ID 取已加载的模块导出 */
    requireModule<T = any>(id: string | number): T | null;
    /** 按 ID 异步取模块 */
    importModule<T = any>(id: string | number): Promise<T>;
    /** 从匹配 code 的模块里取出懒加载分块并加载,再执行入口模块 */
    extractAndLoadChunks(code: Find, matcher?: RegExp): Promise<boolean>;
    /** extractAndLoadChunks 的懒版本:返回一个调用时才加载的函数 */
    extractAndLoadChunksLazy(code: Find, matcher?: RegExp): () => Promise<boolean>;
    /** extractAndLoadChunks 缺省用来认出分块加载调用的正则 */
    DefaultChunkLoadRegex: RegExp;
    /** 按路径加载一个分块 */
    loadChunk(path: string): Promise<boolean>;
    /** 给源码匹配 find 的模块追加导出;返回撤销函数 */
    injectExports(find: Find, exports: Record<string, (original: any) => any>): Unsubscribe & { modules: Set<string | number> };
    /** 等满足过滤器的模块出现后调用;返回取消函数 */
    waitFor<T = any>(filter: FilterFn, callback: (value: T) => void, timeoutMs?: number): Unsubscribe;
    /** 按源码片段列出匹配的模块工厂(排查用) */
    search(...p: Pattern[]): Record<string, Function>;
    /** 每个模块加载后调用 */
    onModuleLoad(cb: (exports: any, id: string | number) => void): Unsubscribe;
    /** 站点就绪后完成 */
    onceReady: Promise<void>;
    /** 已找到的全部状态 store,按名字 */
    getAllStores(): Map<string, any>;
    /** 是不是 zustand store */
    isZustandStore(v: any): boolean;
    /** 找站点打包进来的 React */
    findReact(): any;
    /** 重新扫描运行时的模块缓存 */
    syncModuleCache(): void;
    /** 模块缓存的版本号;有新模块时递增 */
    moduleCacheVersion(): number;
    // DOM / fiber / JSX
    /** 元素已存在时立即完成,否则等它出现;超时返回 null */
    waitForElement(selector: string, opts?: { root?: ParentNode; timeout?: number }): Promise<Element | null>;
    /** 观察匹配选择器的元素出现和消失;已存在的元素在下一帧按出现通知一次 */
    observe(selector: string, opts: { added?(el: Element): void; removed?(el: Element): void; root?: Element }): Unsubscribe;
    /** 值不变时不写;写入不会触发本系统的 observe 回调。返回是否写了 */
    setAttr(el: Element | null, name: string, value: any): boolean;
    /** 值不变时不写;写入不会触发本系统的 observe 回调 */
    setText(el: Element | null, text: string): boolean;
    /** 切换类名;状态不变时不写 */
    toggleClass(el: Element | null, cls: string, on?: boolean): boolean;
    /** 设置内联样式;值为 null 时删掉这一项 */
    setStyle(el: Element | null, styles: Record<string, string | null>): boolean;
    /** 把节点插入父元素(已在那里时不动) */
    mount<T extends globalThis.Node>(parent: Element | null, node: T, before?: globalThis.Node | null): T;
    /** 从页面上移除节点 */
    unmount(node: globalThis.Node | null): void;
    /** 取元素对应的 React fiber */
    getFiber(el: Element): any;
    /** 取元素对应组件的 props */
    getProps(el: Element): any;
    /** 从 fiber 往上找第一个满足条件的 */
    walkFiberUp(fiber: any, predicate: (f: any) => boolean, max?: number): any;
    /** 从元素往上找带有这个 prop 的组件 props */
    findFiberProps(el: Element, key: string, max?: number): any;
    /** 渲染钩子:满足 test 的元素创建时用 transform 改写 */
    addRenderHook(test: (type: any, props: any) => boolean, transform: (el: any) => any): Unsubscribe;
    /** 把 React children 转成数组 */
    asArray(children: any): any[];
    /** 元素树里是否有满足条件的节点 */
    treeHas(node: any, test: (n: any) => boolean): boolean;
    // 路由 / 网络
    /** 路由变化时调用(pushState、replaceState、前进后退、hash 变化) */
    onRouteChange(fn: (info: { url: string; prev: string | null; site?: any }) => void): Unsubscribe;
    /** 观察 fetch / XHR 请求(只读) */
    onRequest(matcher: Pattern | ((url: string, method: string) => boolean), handler: (req: { url: string; method: string; body?: any; type: "fetch" | "xhr" }) => void): Unsubscribe;
    /** 观察 fetch / XHR 响应(只读;onChunk 可逐块读流式响应) */
    onResponse(matcher: Pattern | ((url: string, method: string) => boolean), handler: (res: { url: string; method: string; status: number; type: "fetch" | "xhr"; text(): Promise<string>; json(): Promise<any>; clone(): any; onChunk(cb: (chunk: string, done: boolean) => void): void }) => void): Unsubscribe;
    /** 改写请求:返回 { url, init, body } 改写、{ block: true } 拦截、Response 直接应答;可以 async(XHR 只认同步结果,open 和 send 各调用一次,见 phase) */
    rewriteRequest(matcher: Pattern | ((url: string, method: string) => boolean), handler: (req: RewriteRequestCtx) => RequestRewriteResult | Promise<RequestRewriteResult>): Unsubscribe;
    /** 改写响应:fetch 返回 Response 替换;XHR 同步返回字符串或对象 */
    rewriteResponse(matcher: Pattern | ((url: string, method: string) => boolean), handler: (res: RewriteResponseCtx) => any): Unsubscribe;
    /** 观察和改写 WebSocket 的连接、发送和收到的消息 */
    onWebSocket(matcher: Pattern | ((url: string) => boolean), hooks: SocketHooks): Unsubscribe;
    /** 观察和改写 EventSource 收到的消息 */
    onEventSource(matcher: Pattern | ((url: string) => boolean), hooks: Omit<SocketHooks, "send">): Unsubscribe;
    /** 构造一个 Response(字符串、对象按 JSON) */
    makeResponse(body: any, init?: ResponseInit): Response;
    /** 给任意对象的方法加补丁;串联别人的包装,撤销时不破坏后来者 */
    patchMethod(obj: any, method: string, hooks: PatchHooks): Unsubscribe;
    /** 这个方法是否已被 patchMethod 包过 */
    isPatched(obj: any, method: string): boolean;
    /** 按插件名取数据存储 */
    DataStore: { for(plugin: string): PluginData };
    // 注入点
    /** 往注入点里加一项(同 id 时替换) */
    addSlotItem(slot: string, id: string, item: SlotItem): void;
    /** 从注入点里移除一项 */
    removeSlotItem(slot: string, id: string): void;
    /** 注入点的内容,按 order 排序 */
    getSlotItems(slot: string, opts?: { all?: boolean }): (SlotItem & { id: string })[];
    /** 在 DOM 容器里渲染注入点内容(项的 render(ctx) 组件,或缺省按钮);容器离开页面后自动卸载 */
    renderSlot(slot: string, container: Element, ctx?: any): { update(ctx?: any): void; unmount(): void };
    /** React 站点在自己的元素树里放的注入点出口 */
    SlotOutlet: Component<{ slot: string; ctx?: any; filter?(def: SlotItem): boolean }>;
    /** 菜单补丁:把原生项交给注入点里每个 patch(items, ctx) 依次处理 */
    applyMenuPatches<T = any>(slot: string, items: T[], ctx?: any): T[];
    /** 给站点声明的拦截器加一个处理函数 */
    addInterceptor(name: string, fn: (value: any) => any, opts?: { id?: string; order?: number }): Unsubscribe;
    /** 站点在动作发生时调用:依次执行拦截器,可改值或取消 */
    runInterceptors<T = any>(name: string, value: T, opts?: { timeout?: number }): Promise<InterceptResult<T>>;
    /** 是否有插件登记了这个拦截器 */
    hasInterceptors(name: string): boolean;
    /** 登记命令(功能搜索栏里能搜到,可以绑快捷键);返回撤销函数 */
    registerCommand(def: CommandDef): Unsubscribe;
    /** 执行命令;返回是否成功 */
    runCommand(id: string): Promise<boolean>;
    /** 当前可用的全部命令 */
    getCommands(): CommandDef[];
    /** 命令绑定的快捷键(用户设置优先,其次缺省快捷键) */
    keyFor(id: string): string;
    /** 打开功能搜索栏 */
    openPalette(): void;
    /** 关闭功能搜索栏 */
    closePalette(): void;
    /** 是否在安全模式(只运行必需插件,不加载主题和 Quick CSS) */
    isSafeMode(): boolean;
    /** 以安全模式刷新页面 */
    reloadInSafeMode(): void;
    /** 退出安全模式并刷新页面 */
    exitSafeMode(): void;
    /** 诊断信息文本:版本、脚本管理器、插件状态、补丁统计、最近日志;不含设置值 */
    collectDiagnostics(): string;
    /** 各插件的运行期错误,错误多的在前;tripped 为 true 表示出错太多已在本页停掉 */
    pluginErrorStats(): { name: string; count: number; last: { where: string; message: string; at: number } | null; tripped: boolean }[];
    /** 把诊断信息复制到剪贴板 */
    copyDiagnostics(): Promise<boolean>;
    /** 打开启动失败的插件汇总 */
    openFailedPlugins(): void;
    /** 注入点内容变化时调用 */
    onSlotChange(slot: string, fn: () => void): Unsubscribe;
    /** 注入点内容的版本号;每次变化递增 */
    getSlotVersion(slot: string): number;
    // 界面
    /** 当前用的 React(站点的或内置 Preact)和常用钩子 */
    react: ReactLike;
    /** 框架界面组件(站点提供原生组件时优先用原生的) */
    components: Components;
    /** 内置图标组件,按名字 */
    icons: Record<string, Component<{ size?: number }>>;
    /** CSS 语法高亮,返回 HTML */
    highlightCss(css: string): string;
    /** 建一个可订阅的外部状态,配合 useExternalStore */
    createExternalStore(): ExternalStore;
    /** 建一个多选状态(列表里勾选多项用) */
    createSelectionStore<T = string>(): SelectionStore<T>;
    /** 组件里订阅外部状态,变化时重渲染 */
    useExternalStore<S extends ExternalStore>(store: S): S;
    /** 按搜索词过滤列表 */
    useFiltered<T>(list: T[], search: string, getKey?: (item: T) => string): T[];
    /** 包装异步操作,返回 [进行中, 执行函数] */
    useAsyncAction(fn: (...a: any[]) => Promise<void>): [boolean, (...a: any[]) => Promise<void>];
    /** 打开弹窗;返回弹窗的 key */
    openModal(render: (props: { onClose(): void }) => Node, opts?: { modalKey?: string }): string;
    /** 按 key 关闭弹窗 */
    closeModal(key: string): void;
    /** 关闭全部弹窗 */
    closeAllModals(): void;
    /** 确保框架界面根已挂到页面上 */
    ensureUiRoot(): any;
    /** 显示一条短提示(站点有原生提示时用原生的) */
    showToast(message: any, type?: string, options?: { duration?: number; [k: string]: any }): string | number;
    /** 关闭提示 */
    dismissToast(id?: string | number): void;
    /** 提示类型 */
    ToastType: { MESSAGE: "MESSAGE"; SUCCESS: "SUCCESS"; ERROR: "ERROR"; INFO: "INFO"; WARNING: "WARNING"; LOADING: "LOADING" };
    /** 显示常驻提示条(例如安全模式),可带一个按钮 */
    showNotice(opts: { message: any; type?: string; action?: { label: string; onClick(): void; close?: boolean }; duration?: number }): string | number;
    /** 带标题和点击动作的通知;system 为 true 时同时发系统通知;返回关闭函数 */
    notify(opts: NotifyOptions): () => void;
    /** 最近的通知,新的在前(最多 50 条) */
    getNotificationHistory(): (NotifyOptions & { id: number; at: number })[];
    /** 关闭常驻提示条 */
    closeNotice(): void;
    /** 框架界面当前用浅色还是深色 */
    theme(): "light" | "dark";
    // 样式与主题
    /** 登记一段样式(同名时替换),缺省启用 */
    registerStyle(name: string, css: string): void;
    /** 启用已登记的样式 */
    enableStyle(name: string): void;
    /** 停用样式(保留登记) */
    disableStyle(name: string): void;
    /** 移除样式登记 */
    unregisterStyle(name: string): void;
    /** 生成带前缀的类名函数 */
    classNameFactory(prefix?: string): (...names: any[]) => string;
    /** 拼接类名,忽略假值 */
    classes(...names: any[]): string;
    /** 当前站点分区的主题列表(含适用于所有站点的) */
    getThemes(): any[];
    /** 按地址添加在线主题(主机要在允许列表里) */
    addTheme(url: string): Promise<any>;
    /** 添加本地主题 */
    addLocalTheme(name: string, css: string): any;
    /** 修改本地主题的名字或内容 */
    updateLocalTheme(id: string, data: { name?: string; css?: string }): void;
    /** 删除主题 */
    removeTheme(id: string): void;
    /** 启用主题 */
    enableTheme(id: string): Promise<void> | void;
    /** 停用主题 */
    disableTheme(id: string): void;
    /** 设置主题是否适用于所有站点 */
    setThemeAllSites(id: string, allSites: boolean): void;
    /** 主题总开关 */
    isThemesEnabled(): boolean;
    /** 设置主题总开关 */
    setThemesEnabled(b: boolean): void;
    /** 是否允许在线主题 */
    isOnlineThemesEnabled(): boolean;
    /** 设置是否允许在线主题 */
    setOnlineThemesEnabled(b: boolean): void;
    /** 当前站点分区的 Quick CSS */
    getQuickCss(): { css: string; enabled: boolean };
    /** 修改当前站点分区的 Quick CSS */
    setQuickCss(v: { css?: string; enabled?: boolean }): void;
    // 事件
    /** 订阅框架事件;返回退订函数 */
    subscribe(event: string, handler: (data: any) => void): Unsubscribe;
    /** 派发事件 */
    dispatch(event: string, data?: any): void;
    /** 框架内置的事件名 */
    Events: { PLUGIN_TOGGLE: "pluginToggle"; PLUGIN_PIN: "pluginPin"; PLUGIN_STAR: "pluginStar"; RELOAD_NEEDED: "reloadNeeded"; SETTINGS_SYNC: "settingsSync"; SITE_READY: "siteReady"; ROUTE_CHANGE: "routeChange" };
    // 工具
    /** 带脚本名前缀的日志类 */
    Logger: typeof Logger;
    /** 错误边界组件:子组件出错时显示 fallback */
    ErrorBoundary: Component<{ fallback?: Node; label?: string; children?: any }>;
    /** 第一次调用时才执行 factory 并缓存结果 */
    makeLazy<T>(factory: () => T, attempts?: number): () => T;
    /** 返回一个代理,第一次访问属性时才执行 factory */
    proxyLazy<T>(factory: () => T, shouldRetry?: () => boolean): T;
    /** 跨域取数据(GM_xmlhttpRequest),主机要在脚本的 @connect 里 */
    fetchExternal(url: string, init?: any): Promise<Response>;
    /** 复制文本到剪贴板 */
    copyToClipboard(text: string): Promise<void>;
    /** 防抖;返回的函数带 cancel() */
    debounce<T extends (...a: any[]) => void>(fn: T, ms?: number): T & { cancel(): void };
    /** 等待若干毫秒 */
    sleep(ms: number): Promise<void>;
    /** 只执行一次的函数 */
    onlyOnce<T extends (...a: any[]) => any>(fn: T): T;
    /** 转义正则特殊字符 */
    escapeRegExp(s: string): string;
    /** 把 showMenu、foo_bar 这类键名转成可读标题 */
    humanizeKey(key: string): string;
    /** 网址是否匹配其中任一个匹配模式 */
    matchesUrl(patterns: string[], url?: string): boolean;
    /** 网址是否匹配一个 @match 写法的模式 */
    matchPattern(pattern: string, url?: string): boolean;
    /** 是否 Chromium 内核浏览器 */
    isChromium(): boolean;
    /** 统计一段时间里本系统造成的 DOM 变更(空闲时应为 0,用来发现死循环写入) */
    countIdleMutations(ms?: number): Promise<{ count: number; samples: string[] }>;
    /** 开发构建:诊断开关 */
    diag?: any;
    /** 站点的旧接口别名(例如 Grok 示例的 common、addChatBarButton) */
    [alias: string]: any;

    // ---------- 按用途分组(和上面平铺的名字指向同一个实现) ----------
    /** 打包器:模块查找、补丁、懒分块。lazy 里是懒查找器的短名字:U.webpack.lazy.byProps(...) 等同 U.findByPropsLazy(...) */
    webpack: Readonly<Pick<UsppApi, "filters" | "find" | "findAll" | "findByProps" | "findByCode" | "findByDisplayName" | "findComponentByCode" | "findExportedComponent" | "findStore"
        | "findModuleId" | "findModuleFactory" | "mapMangledModule" | "requireModule" | "waitFor" | "findCssClasses" | "mapMangledCssClasses" | "findBulk"
        | "extractAndLoadChunks" | "extractAndLoadChunksLazy" | "DefaultChunkLoadRegex" | "loadChunk" | "importModule" | "injectExports" | "search" | "onModuleLoad"
        | "getAllStores" | "isZustandStore" | "findReact" | "syncModuleCache" | "moduleCacheVersion"
        | "addPatch" | "patches" | "patchStats" | "patchResults" | "patchReport" | "getPatchedCode" | "onPatchBypassed" | "registerInjectionFallback">> & {
        readonly lazy: {
            readonly find: UsppApi["findLazy"]; readonly byProps: UsppApi["findByPropsLazy"]; readonly byCode: UsppApi["findByCodeLazy"];
            readonly byDisplayName: UsppApi["findByDisplayNameLazy"]; readonly componentByCode: UsppApi["findComponentByCodeLazy"];
            readonly exportedComponent: UsppApi["findExportedComponentLazy"]; readonly store: UsppApi["findStoreLazy"];
            readonly cssClasses: UsppApi["findCssClassesLazy"]; readonly mapMangledModule: UsppApi["mapMangledModuleLazy"];
        };
    };
    /** DOM、React fiber、渲染钩子、路由 */
    dom: Readonly<Pick<UsppApi, "waitForElement" | "observe" | "setAttr" | "setText" | "toggleClass" | "setStyle" | "mount" | "unmount"
        | "getFiber" | "getProps" | "walkFiberUp" | "findFiberProps" | "addRenderHook" | "asArray" | "treeHas" | "onRouteChange">>;
    /** 网络旁路与改写 */
    net: Readonly<Pick<UsppApi, "onRequest" | "onResponse" | "rewriteRequest" | "rewriteResponse" | "onWebSocket" | "onEventSource" | "makeResponse" | "fetchExternal">>;
    /** 界面:React、组件、弹窗、通知、搜索栏、注入点渲染 */
    ui: Readonly<Pick<UsppApi, "react" | "components" | "icons" | "openModal" | "closeModal" | "closeAllModals" | "ensureUiRoot" | "showToast" | "dismissToast" | "ToastType"
        | "showNotice" | "closeNotice" | "notify" | "getNotificationHistory" | "theme" | "highlightCss" | "createExternalStore" | "createSelectionStore"
        | "useExternalStore" | "useFiltered" | "useAsyncAction" | "ErrorBoundary" | "openPalette" | "closePalette" | "renderSlot" | "SlotOutlet">>;
    /** 设置、设置页、备份、插件数据 */
    settings: Readonly<Pick<UsppApi, "Settings" | "PlainSettings" | "SettingsStore" | "openSettings" | "openSettingsPanel" | "closeSettingsPanel" | "openPluginSettings"
        | "settingsPages" | "registerSettingsPage" | "exportSettings" | "importSettings" | "previewImport" | "undoImport" | "lastImport" | "parseBackup" | "exportData" | "importData" | "DataStore">>;
    /** 主题、Quick CSS、样式 */
    themes: Readonly<Pick<UsppApi, "getThemes" | "addTheme" | "addLocalTheme" | "updateLocalTheme" | "removeTheme" | "enableTheme" | "disableTheme" | "setThemeAllSites"
        | "isThemesEnabled" | "setThemesEnabled" | "isOnlineThemesEnabled" | "setOnlineThemesEnabled" | "getQuickCss" | "setQuickCss"
        | "registerStyle" | "enableStyle" | "disableStyle" | "unregisterStyle">>;
}

/** 站点适配 / 插件模块的默认导出 */
export type SiteFactory = (U: UsppApi) => SiteDef;
export type PluginFactory = (U: UsppApi) => PluginDef;
