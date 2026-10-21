// 示例站点(只进开发构建):不用打包器,只用 DOM 工具。演示一个站点适配最少要写什么。
// 测试页:任意本地服务器上路径以 /uspp-example 开头的页面,页面里放一个 <div id="toolbar"></div>
export default U => {
    let host = null;

    /** toolbar 注入点:在页面的 #toolbar 里画按钮;内容变化时重画,找不到位置时什么都不做 */
    function renderToolbar() {
        const bar = document.querySelector("#toolbar");
        if (!bar) return;
        host ??= document.createElement("span");
        host.className = "uspp-example-toolbar";
        const items = U.getSlotItems("toolbar");
        const buttons = items.map(item => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "uspp-btn uspp-btn-sm";
            b.setAttribute("data-uspp-toolbar-item", item.id);
            b.textContent = item.label ?? item.id;
            if (item.tooltip) b.title = item.tooltip;
            b.disabled = typeof item.disabled === "function" ? !!item.disabled() : !!item.disabled;
            b.addEventListener("click", e => { try { (item.onClick ?? item.onSelect)?.(e); } catch (err) { console.error(err); } });
            return b;
        });
        host.replaceChildren(...buttons);
        if (items.length) U.mount(bar, host); else U.unmount(host);
    }

    return U.defineSite({
        id: "example",
        name: "Example",
        matches: ["*://localhost/uspp-example*", "*://127.0.0.1/uspp-example*"],
        // 页面里出现 #toolbar 即视为就绪
        ready: { element: "#toolbar", timeout: 5000 },
        slots: [{ name: "toolbar", kind: "button", context: "点击事件" }],
        start() {
            U.onSlotChange("toolbar", renderToolbar);
            U.waitForElement("#toolbar").then(renderToolbar);
        },
    });
};
