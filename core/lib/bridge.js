// 页面桥:挂在 window[Symbol.for("uspp:<脚本ID>")] 上、页面脚本也能拿到的那个对象。
// 完整的公开接口 U 只留在脚本闭包里,不挂到页面上(第 30 条):页面上的任何脚本(包括网站自己的、XSS)
// 都能读这个 Symbol,U 里有走 GM_xmlhttpRequest 的 fetchExternal、全部设置、GM 存储,不能交出去。
// 页面上只留补丁代码运行时真正要用的两样:
//   - 编译用的临时槽(turbopack.js 的 compile)
//   - 补丁里 $self 指向的对象:每个插件一个"门面",只放行补丁源码里出现过的 $self.<名字>,不给整个插件定义
import { INSTANCE_KEY, SCRIPT_ID, VERSION } from "../env.js";

const allowed = new Map(); // 门面键 -> Set<属性名>
const resolvers = new Map(); // 门面键 -> () => 目标对象
let pluginResolver = () => null;
const facades = new Map();
const boundCache = new WeakMap(); // 目标 -> Map<函数, 绑定后的函数>(同一个方法每次拿到同一个函数,当组件用时不重挂)

const SELF_REF = /\$self\.([A-Za-z_$][\w$]*)/g;

/** 门面键:插件用 plugin:<名>,站点设置入口用 settingsHost */
export const pluginSelfKey = name => `plugin:${name}`;

/** 记下补丁替换文本里引用到的 $self.<名字>;只有这些名字能经页面桥拿到 */
export function allowSelfRefs(key, code) {
    if (typeof code !== "string") return;
    let set = allowed.get(key);
    for (const m of code.matchAll(SELF_REF)) {
        if (!set) allowed.set(key, set = new Set());
        set.add(m[1]);
    }
}

export const allowedSelfRefs = key => [...(allowed.get(key) || [])];

/** 插件门面的目标:按名字现查(热替换插件后自动指向新定义) */
export function setPluginResolver(fn) { pluginResolver = typeof fn === "function" ? fn : () => null; }
export function setSelfTarget(key, getTarget) { resolvers.set(key, getTarget); }

const targetOf = key => key.startsWith("plugin:") ? pluginResolver(key.slice(7)) : resolvers.get(key)?.() ?? null;

function bound(target, fn) {
    let byFn = boundCache.get(target);
    if (!byFn) boundCache.set(target, byFn = new Map());
    let b = byFn.get(fn);
    if (!b) byFn.set(fn, b = function (...a) { return fn.apply(target, a); });
    return b;
}

export function selfFacade(key) {
    let f = facades.get(key);
    if (f) return f;
    f = new Proxy(Object.freeze(Object.create(null)), {
        get(_, prop) {
            if (typeof prop !== "string" || !allowed.get(key)?.has(prop)) return undefined;
            const t = targetOf(key);
            if (!t) return undefined;
            const v = t[prop];
            return typeof v === "function" ? bound(t, v) : v;
        },
        has(_, prop) { return typeof prop === "string" && !!allowed.get(key)?.has(prop); },
        set() { return false; },
        defineProperty() { return false; },
        deleteProperty() { return false; },
        setPrototypeOf() { return false; },
    });
    facades.set(key, f);
    return f;
}

/** 页面上可见的对象本身:只读,没有任何框架能力 */
export const bridge = Object.create(null);
Object.defineProperties(bridge, {
    scriptId: { value: SCRIPT_ID, enumerable: true },
    version: { value: VERSION, enumerable: true },
    // bridge.plugins[名字] -> 该插件的门面(补丁里 $self 展开成这个)
    plugins: { enumerable: true, value: new Proxy(Object.freeze(Object.create(null)), { get: (_, name) => typeof name === "string" ? selfFacade(pluginSelfKey(name)) : undefined, set: () => false, defineProperty: () => false }) },
    site: { enumerable: true, value: Object.freeze({ get settingsHost() { return selfFacade("settingsHost"); } }) },
    // 编译用的临时槽:内联 <script> 把编译结果放进来,compile() 立刻取走
    [Symbol.for("uspp.compiled")]: { value: Object.create(null) },
});

/** 把页面桥挂到 window 上(不可写、不可枚举) */
export function installBridge(W, api) {
    // 只给冒烟测试用:构建时设了 USPP_TEST_EXPOSE=1 才把完整接口挂在桥上,正常构建里这个分支被整段去掉
    if (typeof __USPP_TEST_EXPOSE__ !== "undefined" && __USPP_TEST_EXPOSE__) Object.defineProperty(bridge, "api", { value: api });
    Object.preventExtensions(bridge);
    Object.defineProperty(W, INSTANCE_KEY, { value: bridge, writable: false, configurable: true, enumerable: false });
}
