// 懒求值工具:makeLazy 缓存结果;proxyLazy 返回首次访问才求值的代理

export function makeLazy(factory, attempts = 5) {
    let tries = 0, cache;
    return () => {
        if (cache == null && tries++ < attempts) cache = factory();
        return cache;
    };
}

/**
 * @param factory 返回目标值;返回 null/undefined 表示还没找到
 * @param shouldRetry 返回 true 时允许重新求值(例如模块缓存有变化)
 */
export function proxyLazy(factory, shouldRetry = () => true) {
    let resolved = false, value;
    const resolve = () => {
        if (!resolved && shouldRetry()) {
            value = factory();
            if (value != null) resolved = true;
        }
        return value;
    };
    // 箭头函数没有不可配置的 prototype,避免 Proxy 不变式问题
    const target = () => { };
    return new Proxy(target, {
        get(_, key) {
            if (key === "$$usppResolve") return resolve;
            const real = resolve();
            if (real == null) return undefined;
            return Reflect.get(real, key);
        },
        set(_, key, v) {
            const real = resolve();
            if (real == null) return false;
            return Reflect.set(real, key, v);
        },
        has(_, key) {
            const real = resolve();
            return real != null && Reflect.has(real, key);
        },
        ownKeys() {
            const real = resolve();
            const keys = real == null ? [] : Reflect.ownKeys(real).filter(k => k !== "length" && k !== "name");
            return [...keys, "length", "name"];
        },
        getOwnPropertyDescriptor(_, key) {
            if (key === "length" || key === "name") return Reflect.getOwnPropertyDescriptor(target, key);
            const real = resolve();
            if (real == null) return undefined;
            const d = Reflect.getOwnPropertyDescriptor(real, key);
            if (d) d.configurable = true;
            return d;
        },
        deleteProperty(_, key) {
            const real = resolve();
            return real != null && Reflect.deleteProperty(real, key);
        },
        apply(_, thisArg, args) {
            const real = resolve();
            if (typeof real !== "function") throw new Error("Userscript++: 懒加载的值尚未找到");
            return Reflect.apply(real, thisArg, args);
        },
        getPrototypeOf() {
            const real = resolve();
            return real == null ? Function.prototype : Reflect.getPrototypeOf(real);
        },
    });
}
