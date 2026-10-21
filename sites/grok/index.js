// Grok 参考适配(示例源码,不发布):只通过工厂参数 U(本脚本的框架实例)使用框架
import { bindApi } from "./u.js";
import { common } from "./common.js";
import { startStreamEvents } from "./stream.js";
import { settingsHost, installSettingsFallbacks } from "./settings-host.js";
import { MENU_SLOTS } from "./plugins/GrokMenus/index.js";
import { GROK_CSS } from "./styles.js";

const asList = v => (v == null ? [] : Array.isArray(v) ? v : [v]);

export default U => {
    bindApi(U);
    const menuSlot = location => {
        const slot = MENU_SLOTS[location];
        if (!slot) throw new Error(`未知的菜单位置:${location}`);
        return slot;
    };
    return U.defineSite({
        id: "grok",
        name: "Grok",
        matches: ["*://grok.com/*"],
        driver: "turbopack",
        driverOptions: { chunkPath: "/_next/static/chunks/" },
        // 路由 store 出现即视为宿主就绪(原"模块稳定")
        ready: { module: m => typeof m?.useRoutingStore === "function", timeout: 15000 },
        // 样式放在 <head> 的容器里,方便在开发者工具里查看
        styleHost: "element",
        theme: () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
        renderer() {
            const React = common.React, client = common.ReactDOMClient, dom = common.ReactDOM;
            if (!React || typeof client?.createRoot !== "function") return null;
            return { React, createRoot: el => client.createRoot(el), createPortal: dom?.createPortal, flushSync: dom?.flushSync ?? (fn => fn()) };
        },
        components: name => (name === "toast" ? common.Toaster : common[name]) ?? null,
        common,
        events: ["streamEnd"],
        slots: [
            { name: "chatBar", kind: "button", context: "点击事件;按钮可用 locations: [\"chat\", \"imagine\"] 选择出现在哪个输入栏" },
            { name: "conversationMenu", kind: "menu", context: "{ conversationId }" },
            { name: "messageMenu", kind: "menu", context: "{ response: { responseId, conversationId, ... } }" },
            { name: "userMenu", kind: "menu", context: "{}" },
        ],
        settingsHost,
        // 旧插件字段 chatBarButton / contextMenuItems 映射到本站注入点
        pluginAliases: {
            chatBarButton: v => ({ chatBar: v }),
            contextMenuItems: v => Object.fromEntries(Object.entries(MENU_SLOTS).map(([loc, slot]) => [slot, asList(v?.[loc])]).filter(([, l]) => l.length)),
        },
        // 旧接口名(只在 Grok 上有实际效果)
        api: {
            common,
            addChatBarButton: (id, def) => U.addSlotItem("chatBar", id, def),
            removeChatBarButton: id => U.removeSlotItem("chatBar", id),
            addContextMenuItem: (location, id, def) => U.addSlotItem(menuSlot(location), id, def),
            removeContextMenuItem: (location, id) => U.removeSlotItem(menuSlot(location), id),
        },
        start() {
            U.registerStyle("uspp-grok", GROK_CSS);
            startStreamEvents();
            installSettingsFallbacks();
        },
    });
};
