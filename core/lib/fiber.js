// React fiber 小工具
export function getFiber(el) {
    if (!el) return null;
    for (const k of Object.keys(el)) {
        if (k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")) return el[k];
    }
    return null;
}

export function getProps(el) {
    if (!el) return null;
    for (const k of Object.keys(el)) if (k.startsWith("__reactProps$")) return el[k];
    return null;
}

/** 向上遍历 fiber,predicate 返回 true 时返回该 fiber */
export function walkFiberUp(fiber, predicate, max = 200) {
    for (let f = fiber, i = 0; f && i < max; f = f.return, i++) {
        try { if (predicate(f)) return f; } catch { /* 忽略 */ }
    }
    return null;
}

export function findFiberProps(el, key, max = 200) {
    const f = walkFiberUp(getFiber(el), f => f.memoizedProps && key in f.memoizedProps, max);
    return f ? f.memoizedProps : null;
}
