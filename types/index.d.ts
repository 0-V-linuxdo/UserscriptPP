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
    predicate?: () => boolean;
    noWarn?: boolean;
}
export interface Patch {
    find: Find;
    replacement: PatchReplacement | PatchReplacement[];
    /** 补所有命中的模块,而不是第一个 */
    all?: boolean;
    /** 有一条替换失败就整组撤销 */
    group?: boolean;
    noWarn?: boolean;
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
    description?: string;
    placeholder?: string;
    hidden?: boolean;
    restartNeeded?: boolean;
    /** 导出备份时默认不含 */
    sensitive?: boolean;
    onChange?(value: any): void;
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
    def: D;
    checks: Record<string, { disabled?(): boolean; isValid?(value: any): boolean | string }>;
    pluginName: string | null;
    /** 读写都会存盘并通知监听者 */
    readonly store: SettingsStore<D>;
    /** 不触发通知的原始对象 */
    readonly plain: SettingsStore<D>;
    /** React / Preact 组件里用:这些键变化时重渲染 */
    use(keys?: (keyof D)[]): SettingsStore<D>;
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
    get<T = any>(key: string, fallback?: T): Promise<T>;
    set(key: string, value: any): Promise<void>;
    del(key: string): Promise<void>;
    keys(): Promise<string[]>;
    clear(): Promise<void>;
}
export interface PluginData extends PluginDataStore { readonly global: PluginDataStore }
/** start(ctx) / stop(ctx) 拿到的作用域:经它登记的东西插件停用时自动撤掉 */
export interface PluginCtx {
    readonly plugin: string;
    readonly signal: AbortSignal;
    /** 同 U.fetchExternal;插件声明了 connect 时只能访问这些主机(当前网站总是允许) */
    fetchExternal(url: string, opts?: { timeout?: number }): Promise<Response>;
    readonly disposed: boolean;
    /** 目前还登记着的清理条数;提前撤销的、到点执行过的定时器不算 */
    readonly pending: number;
    readonly data: PluginData;
    register(fn: () => void): () => void;
    observe(selector: string, opts: { added?(el: Element): void; removed?(el: Element): void; root?: Element }): Unsubscribe;
    onRouteChange(fn: (d: { url: string; previous: string | null; info?: any }) => void): Unsubscribe;
    onRequest: UsppApi["onRequest"];
    onResponse: UsppApi["onResponse"];
    rewriteRequest: UsppApi["rewriteRequest"];
    rewriteResponse: UsppApi["rewriteResponse"];
    onWebSocket: UsppApi["onWebSocket"];
    onEventSource: UsppApi["onEventSource"];
    addRenderHook: UsppApi["addRenderHook"];
    subscribe(event: string, handler: (data: any) => void): Unsubscribe;
    onSlotChange(slot: string, fn: () => void): Unsubscribe;
    addSlotItem(slot: string, id: string, def: SlotItem): Unsubscribe;
    patch(obj: any, method: string, hooks: PatchHooks): Unsubscribe;
    listen(target: EventTarget, type: string, fn: (e: any) => void, opts?: any): Unsubscribe;
    setTimeout(fn: (...a: any[]) => void, ms?: number, ...a: any[]): Unsubscribe;
    setInterval(fn: (...a: any[]) => void, ms?: number, ...a: any[]): Unsubscribe;
}
export interface CommandDef { id: string; name: string; description?: string; keywords?: string[]; run(): any; defaultKey?: string; plugin?: string; when?(): boolean }
export interface SettingsPageDef { id: string; label: string; icon?: Component; component: Component; order?: number }
export interface NotifyOptions { title?: any; body?: any; icon?: any; onClick?(): void; duration?: number; system?: boolean; type?: string }
export interface InterceptResult<T = any> { value: T; cancelled: boolean; by: string | null }

export interface PluginDef {
    name: string;
    description: string;
    authors: string[];
    icon?: Component<{ size?: number }>;
    tags?: string[];
    /** 会访问的外部主机(同 @connect 的写法);构建时汇总进 @connect,ctx.fetchExternal 只能访问这些主机,插件卡片上会列出 */
    connect?: string[];
    /** 毫秒时间戳;7 天内的出现在 Recent 分类 */
    updatedAt?: number;
    /** 所属站点 ID;"*" 表示任何站点(构建时按目录自动设置) */
    site?: string;
    enabledByDefault?: boolean;
    required?: boolean;
    hidden?: boolean;
    dev?: boolean;
    chromiumOnly?: boolean;
    requiresRestart?: boolean;
    dependencies?: string[];
    startAt?: StartAtValue;
    settings?: DefinedSettings<any>;
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
    start?(ctx: PluginCtx): void;
    stop?(ctx: PluginCtx): void;
    onSettingsChange?(): void;
    [extra: string]: any;
}
export interface Plugin extends PluginDef { started: boolean; startError?: any; /** 本页启动耗时(毫秒),未启动时没有 */ startMs?: number }

// ---------- 站点 ----------
export interface SiteDef {
    id: string;
    name: string;
    matches: string[];
    excludeMatches?: string[];
    /** 打包器驱动:turbopack(Next.js)或 webpack(4 / 5 的 JSONP 分块) */
    driver?: "turbopack" | "webpack";
    /** turbopack:chunkPath 为分块路径前缀;webpack:global 为分块全局名(webpackChunk<项目名> 或 webpackJsonp) */
    driverOptions?: { chunkPath?: string; global?: string };
    ready?: (() => boolean) | { element?: string; module?: FilterFn; timeout?: number };
    readyTimeout?: number;
    theme?: () => "light" | "dark";
    slots?: { name: string; kind: "button" | "menu" | "render" | string; patch?: boolean; context?: string }[];
    events?: string[];
    /** 可拦截的动作名,站点在动作发生时调用 U.runInterceptors */
    interceptors?: string[];
    settingsHost?: { open?(opts: any): boolean; isOpen?(): boolean; patches?: Patch[]; [k: string]: any };
    components?: (name: string) => Component | null;
    renderer?(): { React: any; createRoot(el: Element): any; createPortal?: any; flushSync?: any } | null;
    common?: Record<string, any>;
    api?: Record<string, any>;
    pluginAliases?: Record<string, (value: any) => Record<string, SlotItem | SlotItem[]>>;
    routeInfo?(url: URL): any;
    network?: boolean;
    route?: boolean;
    styleHost?: "element" | "adopted";
    plugins?: PluginDef[];
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
    apiVersion: number;
    buildType: "development" | "production";
    scriptId: string;
    scriptName: string;
    prefix: string;
    buildSites: string[];
    // 站点
    defineSite(def: SiteDef): SiteDef;
    /** 只在开发构建里可用 */
    registerSite(def: SiteDef | ((U: UsppApi) => SiteDef)): boolean;
    readonly site: SiteDef;
    readonly sites: Record<string, SiteDef>;
    isSite(id: string): boolean;
    siteKey(): string;
    // 插件
    plugins: Record<string, Plugin>;
    registerPlugin(def: PluginDef): boolean;
    startPlugin(name: string | Plugin): boolean;
    stopPlugin(name: string | Plugin): boolean;
    isPluginEnabled(name: string): boolean;
    togglePlugin(name: string, enabled?: boolean): void;
    definePlugin<T extends PluginDef>(def: T): T;
    definePluginSettings<D extends SettingsDefinition>(def: D, checks?: DefinedSettings["checks"]): DefinedSettings<D>;
    migratePluginSettings(name: string, ...oldNames: string[]): void;
    migratePluginSetting(plugin: string, oldKey: string, newKey: string): void;
    getVisibleSettings(p: Plugin): [string, SettingDef][];
    OptionType: { STRING: OptionTypeEnum.STRING; NUMBER: OptionTypeEnum.NUMBER; BIGINT: OptionTypeEnum.BIGINT; BOOLEAN: OptionTypeEnum.BOOLEAN; SELECT: OptionTypeEnum.SELECT; SLIDER: OptionTypeEnum.SLIDER; COMPONENT: OptionTypeEnum.COMPONENT; CUSTOM: OptionTypeEnum.CUSTOM };
    StartAt: { Init: "Init"; DOMContentLoaded: "DOMContentLoaded"; SiteReady: "SiteReady"; TurbopackReady: "SiteReady" };
    // 设置
    Settings: any;
    PlainSettings: any;
    SettingsStore: { addChangeListener(path: string, fn: (value: any, path: string) => void): void; removeChangeListener(path: string, fn: Function): void; addPrefixChangeListener(prefix: string, fn: (value: any, path: string) => void): void; removePrefixChangeListener(prefix: string, fn: Function): void; [k: string]: any };
    openSettings(opts?: { tab?: string; plugin?: string }): "site" | "panel";
    openSettingsPanel(opts?: { tab?: string; plugin?: string }): void;
    closeSettingsPanel(): void;
    openPluginSettings(plugin: string | Plugin): boolean;
    /** 当前全部设置页(内置页在前,之后是登记的页) */
    readonly settingsPages: readonly { id: string; key: string; label: string; icon: Component; component: Component; custom?: boolean }[];
    registerSettingsPage(def: SettingsPageDef): Unsubscribe;
    exportData(pluginNames: string[]): Promise<Record<string, { site: Record<string, any>; global: Record<string, any> }>>;
    importData(data: Record<string, { site?: Record<string, any>; global?: Record<string, any> }>): Promise<void>;
    exportSettings(opts?: { includeSensitive?: boolean }): any;
    importSettings(data: any): Promise<any>;
    parseBackup(text: string): any;
    // 打包器
    addPatch(patch: Patch, pluginName: string): any;
    patches: any[];
    patchStats: any;
    patchResults: any[];
    patchReport(): PatchReport;
    getPatchedCode(id: string | number): string | null;
    onPatchBypassed(pluginName: string, cb: (results: any[]) => void): Unsubscribe;
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
    filters: { byProps(...keys: string[]): FilterFn; byCode(...p: Pattern[]): FilterFn; byDisplayName(name: string): FilterFn; byStoreName(name: string): FilterFn; componentByCode(...p: Pattern[]): FilterFn; byClassName(...classes: string[]): FilterFn };
    find<T = any>(filter: FilterFn): T | null;
    findAll<T = any>(filter: FilterFn): T[];
    findByProps<T = any>(...keys: string[]): T | null;
    findByCode<T = any>(...p: Pattern[]): T | null;
    findByDisplayName<T = any>(name: string): T | null;
    findComponentByCode<T = any>(...p: Pattern[]): T | null;
    findExportedComponent<T = any>(...names: string[]): T | null;
    findStore<T = any>(name: string): T | null;
    findLazy<T = any>(filter: FilterFn): T;
    findByPropsLazy<T = any>(...keys: string[]): T;
    findByCodeLazy<T = any>(...p: Pattern[]): T;
    findByDisplayNameLazy<T = any>(name: string): Component;
    findComponentByCodeLazy<T = any>(...p: Pattern[]): Component;
    findExportedComponentLazy<T = any>(...names: string[]): Component;
    findStoreLazy<T = any>(name: string): T;
    findModuleId(...p: Pattern[]): string | number | null;
    findModuleFactory(...p: Pattern[]): [string | number, Function] | null;
    mapMangledModule<K extends string>(patterns: Find, mappers: Record<K, FilterFn>): Partial<Record<K, any>>;
    mapMangledModuleLazy<K extends string>(patterns: Find, mappers: Record<K, FilterFn>): Partial<Record<K, any>>;
    /** CSS 模块:{ 原类名: 混淆后的类名 } */
    findCssClasses<K extends string>(...classes: K[]): Partial<Record<K, string>>;
    findCssClassesLazy<K extends string>(...classes: K[]): Partial<Record<K, string>>;
    mapMangledCssClasses<K extends string>(mod: Record<string, string>, classes: K[]): Partial<Record<K, string>>;
    /** 一次扫描找多个模块,结果和过滤器一一对应 */
    findBulk(...filters: FilterFn[]): any[];
    requireModule<T = any>(id: string | number): T | null;
    /** 按 ID 异步取模块 */
    importModule<T = any>(id: string | number): Promise<T>;
    /** 从匹配 code 的模块里取出懒加载分块并加载,再执行入口模块 */
    extractAndLoadChunks(code: Find, matcher?: RegExp): Promise<boolean>;
    extractAndLoadChunksLazy(code: Find, matcher?: RegExp): () => Promise<boolean>;
    DefaultChunkLoadRegex: RegExp;
    loadChunk(path: string): Promise<boolean>;
    /** 给源码匹配 find 的模块追加导出;返回撤销函数 */
    injectExports(find: Find, exports: Record<string, (original: any) => any>): Unsubscribe & { modules: Set<string | number> };
    waitFor<T = any>(filter: FilterFn, callback: (value: T) => void, timeoutMs?: number): Unsubscribe;
    search(...p: Pattern[]): Record<string, Function>;
    onModuleLoad(cb: (exports: any, id: string | number) => void): Unsubscribe;
    onceReady: Promise<void>;
    getAllStores(): Map<string, any>;
    isZustandStore(v: any): boolean;
    findReact(): any;
    syncModuleCache(): void;
    moduleCacheVersion(): number;
    // DOM / fiber / JSX
    waitForElement(selector: string, opts?: { root?: ParentNode; timeout?: number }): Promise<Element | null>;
    observe(selector: string, opts: { added?(el: Element): void; removed?(el: Element): void; root?: Element }): Unsubscribe;
    setAttr(el: Element | null, name: string, value: any): boolean;
    setText(el: Element | null, text: string): boolean;
    toggleClass(el: Element | null, cls: string, on?: boolean): boolean;
    setStyle(el: Element | null, styles: Record<string, string | null>): boolean;
    mount<T extends globalThis.Node>(parent: Element | null, node: T, before?: globalThis.Node | null): T;
    unmount(node: globalThis.Node | null): void;
    getFiber(el: Element): any;
    getProps(el: Element): any;
    walkFiberUp(fiber: any, predicate: (f: any) => boolean, max?: number): any;
    findFiberProps(el: Element, key: string, max?: number): any;
    addRenderHook(test: (type: any, props: any) => boolean, transform: (el: any) => any): Unsubscribe;
    asArray(children: any): any[];
    treeHas(node: any, test: (n: any) => boolean): boolean;
    // 路由 / 网络
    onRouteChange(fn: (info: { url: string; prev: string | null; site?: any }) => void): Unsubscribe;
    onRequest(matcher: Pattern | ((url: string, method: string) => boolean), handler: (req: { url: string; method: string; body?: any; type: "fetch" | "xhr" }) => void): Unsubscribe;
    onResponse(matcher: Pattern | ((url: string, method: string) => boolean), handler: (res: { url: string; method: string; status: number; type: "fetch" | "xhr"; text(): Promise<string>; json(): Promise<any>; clone(): any; onChunk(cb: (chunk: string, done: boolean) => void): void }) => void): Unsubscribe;
    /** 改写请求:返回 { url, init, body } 改写、{ block: true } 拦截、Response 直接应答;可以 async(XHR 只认同步结果,open 和 send 各调用一次,见 phase) */
    rewriteRequest(matcher: Pattern | ((url: string, method: string) => boolean), handler: (req: RewriteRequestCtx) => RequestRewriteResult | Promise<RequestRewriteResult>): Unsubscribe;
    /** 改写响应:fetch 返回 Response 替换;XHR 同步返回字符串或对象 */
    rewriteResponse(matcher: Pattern | ((url: string, method: string) => boolean), handler: (res: RewriteResponseCtx) => any): Unsubscribe;
    onWebSocket(matcher: Pattern | ((url: string) => boolean), hooks: SocketHooks): Unsubscribe;
    onEventSource(matcher: Pattern | ((url: string) => boolean), hooks: Omit<SocketHooks, "send">): Unsubscribe;
    makeResponse(body: any, init?: ResponseInit): Response;
    /** 给任意对象的方法加补丁;串联别人的包装,撤销时不破坏后来者 */
    patchMethod(obj: any, method: string, hooks: PatchHooks): Unsubscribe;
    isPatched(obj: any, method: string): boolean;
    DataStore: { for(plugin: string): PluginData };
    // 注入点
    addSlotItem(slot: string, id: string, item: SlotItem): void;
    removeSlotItem(slot: string, id: string): void;
    getSlotItems(slot: string, opts?: { all?: boolean }): (SlotItem & { id: string })[];
    /** 在 DOM 容器里渲染注入点内容(项的 render(ctx) 组件,或缺省按钮);容器离开页面后自动卸载 */
    renderSlot(slot: string, container: Element, ctx?: any): { update(ctx?: any): void; unmount(): void };
    /** React 站点在自己的元素树里放的注入点出口 */
    SlotOutlet: Component<{ slot: string; ctx?: any; filter?(def: SlotItem): boolean }>;
    /** 菜单补丁:把原生项交给注入点里每个 patch(items, ctx) 依次处理 */
    applyMenuPatches<T = any>(slot: string, items: T[], ctx?: any): T[];
    addInterceptor(name: string, fn: (value: any) => any, opts?: { id?: string; order?: number }): Unsubscribe;
    runInterceptors<T = any>(name: string, value: T, opts?: { timeout?: number }): Promise<InterceptResult<T>>;
    hasInterceptors(name: string): boolean;
    registerCommand(def: CommandDef): Unsubscribe;
    runCommand(id: string): Promise<boolean>;
    getCommands(): CommandDef[];
    keyFor(id: string): string;
    openPalette(): void;
    closePalette(): void;
    isSafeMode(): boolean;
    reloadInSafeMode(): void;
    exitSafeMode(): void;
    collectDiagnostics(): string;
    copyDiagnostics(): Promise<boolean>;
    openFailedPlugins(): void;
    onSlotChange(slot: string, fn: () => void): Unsubscribe;
    getSlotVersion(slot: string): number;
    // 界面
    react: ReactLike;
    components: Components;
    icons: Record<string, Component<{ size?: number }>>;
    highlightCss(css: string): string;
    createExternalStore(): ExternalStore;
    createSelectionStore<T = string>(): SelectionStore<T>;
    useExternalStore<S extends ExternalStore>(store: S): S;
    useFiltered<T>(list: T[], search: string, getKey?: (item: T) => string): T[];
    useAsyncAction(fn: (...a: any[]) => Promise<void>): [boolean, (...a: any[]) => Promise<void>];
    openModal(render: (props: { onClose(): void }) => Node, opts?: { modalKey?: string }): string;
    closeModal(key: string): void;
    closeAllModals(): void;
    ensureUiRoot(): any;
    showToast(message: any, type?: string, options?: { duration?: number; [k: string]: any }): string | number;
    dismissToast(id?: string | number): void;
    ToastType: { MESSAGE: "MESSAGE"; SUCCESS: "SUCCESS"; ERROR: "ERROR"; INFO: "INFO"; WARNING: "WARNING"; LOADING: "LOADING" };
    showNotice(opts: { message: any; type?: string; action?: { label: string; onClick(): void; close?: boolean }; duration?: number }): string | number;
    /** 带标题和点击动作的通知;system 为 true 时同时发系统通知;返回关闭函数 */
    notify(opts: NotifyOptions): () => void;
    getNotificationHistory(): (NotifyOptions & { id: number; at: number })[];
    closeNotice(): void;
    theme(): "light" | "dark";
    // 样式与主题
    registerStyle(name: string, css: string): void;
    enableStyle(name: string): void;
    disableStyle(name: string): void;
    unregisterStyle(name: string): void;
    classNameFactory(prefix?: string): (...names: any[]) => string;
    classes(...names: any[]): string;
    getThemes(): any[];
    addTheme(url: string): Promise<any>;
    addLocalTheme(name: string, css: string): any;
    updateLocalTheme(id: string, data: { name?: string; css?: string }): void;
    removeTheme(id: string): void;
    enableTheme(id: string): Promise<void> | void;
    disableTheme(id: string): void;
    setThemeAllSites(id: string, allSites: boolean): void;
    isThemesEnabled(): boolean;
    setThemesEnabled(b: boolean): void;
    isOnlineThemesEnabled(): boolean;
    setOnlineThemesEnabled(b: boolean): void;
    getQuickCss(): { css: string; enabled: boolean };
    setQuickCss(v: { css?: string; enabled?: boolean }): void;
    // 事件
    subscribe(event: string, handler: (data: any) => void): Unsubscribe;
    dispatch(event: string, data?: any): void;
    Events: { PLUGIN_TOGGLE: "pluginToggle"; PLUGIN_PIN: "pluginPin"; PLUGIN_STAR: "pluginStar"; RELOAD_NEEDED: "reloadNeeded"; SETTINGS_SYNC: "settingsSync"; SITE_READY: "siteReady"; ROUTE_CHANGE: "routeChange" };
    // 工具
    Logger: typeof Logger;
    ErrorBoundary: Component<{ fallback?: Node; label?: string; children?: any }>;
    makeLazy<T>(factory: () => T, attempts?: number): () => T;
    proxyLazy<T>(factory: () => T, shouldRetry?: () => boolean): T;
    fetchExternal(url: string, init?: any): Promise<Response>;
    copyToClipboard(text: string): Promise<void>;
    debounce<T extends (...a: any[]) => void>(fn: T, ms?: number): T & { cancel(): void };
    sleep(ms: number): Promise<void>;
    onlyOnce<T extends (...a: any[]) => any>(fn: T): T;
    escapeRegExp(s: string): string;
    humanizeKey(key: string): string;
    matchesUrl(patterns: string[], url?: string): boolean;
    matchPattern(pattern: string, url?: string): boolean;
    isChromium(): boolean;
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
        | "settingsPages" | "registerSettingsPage" | "exportSettings" | "importSettings" | "parseBackup" | "exportData" | "importData" | "DataStore">>;
    /** 主题、Quick CSS、样式 */
    themes: Readonly<Pick<UsppApi, "getThemes" | "addTheme" | "addLocalTheme" | "updateLocalTheme" | "removeTheme" | "enableTheme" | "disableTheme" | "setThemeAllSites"
        | "isThemesEnabled" | "setThemesEnabled" | "isOnlineThemesEnabled" | "setOnlineThemesEnabled" | "getQuickCss" | "setQuickCss"
        | "registerStyle" | "enableStyle" | "disableStyle" | "unregisterStyle">>;
}

/** 站点适配 / 插件模块的默认导出 */
export type SiteFactory = (U: UsppApi) => SiteDef;
export type PluginFactory = (U: UsppApi) => PluginDef;
