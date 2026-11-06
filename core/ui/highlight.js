// CSS 语法高亮(给 Quick CSS 和本地主题编辑器用):输出带 class 的 HTML,类名以 uspp-hl- 开头
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const span = (k, t) => `<span class="uspp-hl-${k}">${esc(t)}</span>`;

const TOKEN = /\/\*[\s\S]*?(?:\*\/|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|@[\w-]+|#[\da-fA-F]{3,8}\b|-?(?:\d+\.?\d*|\.\d+)(?:%|[a-zA-Z]+)?|!important\b|--[\w-]+|[\w-]+|[{}:;,()]/g;

/** @returns HTML 字符串;depth 记录花括号层数,用来区分选择器和属性名 */
export function highlightCss(css) {
    let out = "", last = 0, depth = 0, afterColon = false, inParen = 0;
    const src = String(css ?? "");
    for (const m of src.matchAll(TOKEN)) {
        const t = m[0], i = m.index;
        if (i > last) out += esc(src.slice(last, i));
        last = i + t.length;
        const c = t[0];
        if (t.startsWith("/*")) out += span("comment", t);
        else if (c === '"' || c === "'") out += span("string", t);
        else if (c === "@") out += span("at", t);
        else if (t === "{") { depth++; afterColon = false; out += span("punct", t); }
        else if (t === "}") { depth = Math.max(0, depth - 1); afterColon = false; out += span("punct", t); }
        else if (t === ";") { afterColon = false; out += span("punct", t); }
        else if (t === ":") { if (depth > 0 && !inParen) afterColon = true; out += span("punct", t); }
        else if (t === "(") { inParen++; out += span("punct", t); }
        else if (t === ")") { inParen = Math.max(0, inParen - 1); out += span("punct", t); }
        else if (t === ",") out += span("punct", t);
        else if (c === "#" && afterColon) out += span("color", t);
        else if (t === "!important") out += span("important", t);
        else if (/^-?[\d.]/.test(t)) out += span(afterColon || depth === 0 ? "number" : "selector", t);
        else if (t.startsWith("--")) out += span(afterColon ? "value" : "variable", t);
        else if (depth > 0 && !afterColon) out += span(inParen ? "value" : "property", t);
        else if (afterColon) out += span(src[last] === "(" ? "function" : "value", t);
        else out += span("selector", t);
    }
    if (last < src.length) out += esc(src.slice(last));
    return out;
}
