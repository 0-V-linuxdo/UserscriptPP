// 方法补丁器:给任意对象的方法加 before / instead / after。
// 守"串联、不独占":包装时保存当时的方法(可能已被别的脚本包过),调用时一律调用它;
// 撤销只是把自己的钩子拿掉,钩子都撤完时,只有对象上的方法还是本层才还原,否则本层改为透传,不破坏后来者
import { Logger } from "./logger.js";

const logger = new Logger("Patcher", "#f9a8d4");
const records = new WeakMap(); // 对象 -> Map<方法名, 记录>

const safe = (label, fn) => { try { return fn(); } catch (e) { logger.error(`${label} 出错`, e); return undefined; } };

function install(obj, name) {
    const orig = obj[name];
    if (typeof orig !== "function") throw new TypeError(`patchMethod:${String(name)} 不是函数`);
    const own = Object.prototype.hasOwnProperty.call(obj, name);
    const desc = own ? Object.getOwnPropertyDescriptor(obj, name) : null;
    const rec = { orig, own, desc, hooks: [], wrapper: null, installed: true };
    const wrapper = function (...args) {
        const self = this;
        const call = a => (new.target ? Reflect.construct(rec.orig, a, new.target) : rec.orig.apply(self, a));
        if (!rec.hooks.length) return call(args);
        let skip = false;
        for (const hk of rec.hooks) {
            if (!hk.before) continue;
            const r = safe(`before 补丁(${hk.label})`, () => hk.before(args, self));
            if (r === false) skip = true;
        }
        let result;
        if (!skip) {
            // instead 由先到后层层包裹:后登记的在外层,next 调用里一层,最内层是原方法
            let next = call;
            for (const hk of rec.hooks) {
                if (!hk.instead) continue;
                const inner = next;
                next = a => {
                    try { return hk.instead(a, (...x) => inner(x.length ? x : a), self); } catch (e) { logger.error(`instead 补丁(${hk.label})出错,改用原方法`, e); return inner(a); }
                };
            }
            result = next(args);
        }
        for (const hk of rec.hooks) {
            if (!hk.after) continue;
            const r = safe(`after 补丁(${hk.label})`, () => hk.after(args, result, self));
            if (r !== undefined) result = r;
        }
        return result;
    };
    try {
        Object.defineProperty(wrapper, "name", { value: orig.name, configurable: true });
        Object.defineProperty(wrapper, "length", { value: orig.length, configurable: true });
        Object.defineProperty(wrapper, "toString", { value: function toString() { return Function.prototype.toString.call(rec.orig); }, configurable: true, writable: true });
        if (orig.prototype) wrapper.prototype = orig.prototype;
    } catch { /* 只是外观,失败不影响 */ }
    rec.wrapper = wrapper;
    if (desc && !desc.writable && !desc.set && !desc.configurable) throw new TypeError(`patchMethod:${String(name)} 只读,无法补丁`);
    if (desc && "value" in desc) Object.defineProperty(obj, name, { ...desc, value: wrapper });
    else obj[name] = wrapper;
    return rec;
}

/**
 * 补丁一个方法。hooks:
 *   before(args, self)            可以修改 args 数组;返回 false 时不调用原方法(after 仍执行,结果为 undefined)
 *   instead(args, next, self)     替换调用;next(...参数) 调用原方法(不传参数时沿用 args)
 *   after(args, result, self)     返回非 undefined 时替换结果
 * 返回撤销函数。
 */
export function patchMethod(obj, name, hooks = {}, label = "") {
    if (!obj || (typeof obj !== "object" && typeof obj !== "function")) throw new TypeError("patchMethod 需要对象");
    let map = records.get(obj);
    if (!map) records.set(obj, map = new Map());
    let rec = map.get(name);
    if (!rec || !rec.installed) { rec = install(obj, name); map.set(name, rec); }
    const hk = { before: hooks.before, instead: hooks.instead, after: hooks.after, label: label || hooks.label || String(name) };
    rec.hooks.push(hk);
    let done = false;
    return () => {
        if (done) return;
        done = true;
        const i = rec.hooks.indexOf(hk);
        if (i >= 0) rec.hooks.splice(i, 1);
        if (rec.hooks.length || !rec.installed) return;
        // 对象上还是本层:还原;否则(别人在后面又包了一层)保留本层作透传
        let currentValue;
        try { currentValue = obj[name]; } catch { return; }
        if (currentValue !== rec.wrapper) return;
        try {
            if (rec.own) Object.defineProperty(obj, name, { ...rec.desc, value: rec.orig });
            else delete obj[name];
            rec.installed = false;
            map.delete(name);
        } catch (e) { logger.debug("还原方法失败,保留透传", e); }
    };
}

/** 这个方法当前有没有本脚本的补丁 */
export const isPatched = (obj, name) => !!records.get(obj)?.get(name)?.hooks.length;
