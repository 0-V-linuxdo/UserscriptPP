// 小型外部状态:组件之间共享一份可订阅的数据(不依赖站点的状态库)

/** 最简单的可订阅对象:emit() 通知所有订阅者;配合 useExternalStore 让组件跟着刷新 */
export function createExternalStore() {
    const listeners = new Set();
    let version = 0;
    return {
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        emit() { version++; for (const fn of [...listeners]) { try { fn(); } catch (e) { console.error(e); } } },
        getVersion: () => version,
    };
}

/** 选择集:批量勾选列表项(勾选框 + 操作栏)用 */
export function createSelectionStore() {
    const base = createExternalStore();
    const set = new Set();
    const changed = fn => (...a) => { const before = set.size; const r = fn(...a); if (r !== false || set.size !== before) base.emit(); return r; };
    return {
        ...base,
        has: id => set.has(id),
        get size() { return set.size; },
        values: () => [...set],
        add: changed(id => { if (set.has(id)) return false; set.add(id); }),
        delete: changed(id => { if (!set.has(id)) return false; set.delete(id); }),
        toggle: changed(id => { if (set.has(id)) set.delete(id); else set.add(id); }),
        setAll: changed(ids => { set.clear(); for (const id of ids) set.add(id); }),
        clear: changed(() => { if (!set.size) return false; set.clear(); }),
    };
}
