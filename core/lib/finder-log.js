// 查找器登记(只在开发构建里):记下站点适配和插件通过 U 调用过的每个查找器,
// 之后汇总"解析为空"的那些。站点改版后,它们通常就是最先失效的地方。
/* global __USPP_DEV__ */

const log = new Map(); // key -> { type, args, lazy, ok, calls, resolve }

const label = a => {
    if (typeof a === "function") return `fn:${String(a).slice(0, 60)}`;
    if (a instanceof RegExp) return String(a);
    if (Array.isArray(a)) return `[${a.map(label).join(", ")}]`;
    if (a && typeof a === "object") return `{${Object.keys(a).join(",")}}`;
    return JSON.stringify(a);
};
const empty = v => v == null || (Array.isArray(v) ? !v.length : typeof v === "object" && !Object.keys(v).length);

/**
 * 把接口对象里的查找器换成登记版本(只在开发构建里)。
 * @param api 接口对象
 * @param names 要登记的名字;名字以 Lazy 结尾的,检查时用去掉 Lazy 的同名函数重新求值
 */
export function trackFinders(api, names) {
    if (!__USPP_DEV__) return;
    for (const name of names) {
        const fn = api[name];
        if (typeof fn !== "function") continue;
        const lazy = /Lazy$/.test(name);
        const direct = lazy ? name.slice(0, -4) : name;
        api[name] = function (...args) {
            const out = fn.apply(this, args);
            const key = `${direct}(${args.map(label).join(", ")})`;
            let rec = log.get(key);
            if (!rec) log.set(key, rec = { key, type: direct, lazy, ok: false, calls: 0, resolve: null });
            rec.calls++;
            if (lazy) rec.resolve = () => api[`__direct_${direct}`]?.(...args);
            else rec.ok = !empty(out instanceof Promise ? 1 : out);
            return out;
        };
        // 检查时用未登记的原函数求值,不把检查本身记进去
        if (!lazy) Object.defineProperty(api, `__direct_${direct}`, { value: fn, enumerable: false, configurable: true });
    }
}

/** 解析为空的查找器:懒查找器现在重新求一次;直接调用的看最近一次结果 */
export function failedFinders() {
    const out = [];
    for (const rec of log.values()) {
        let ok = rec.ok;
        if (rec.lazy && rec.resolve) {
            try { ok = !empty(rec.resolve()); } catch { ok = false; }
        }
        if (!ok) out.push({ finder: rec.key, lazy: rec.lazy, calls: rec.calls });
    }
    return out;
}

export const finderLogSize = () => log.size;
