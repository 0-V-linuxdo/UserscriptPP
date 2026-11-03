// 示例插件:一个工具栏按钮、一个菜单命令、一个设置项
export default U => {
    const settings = U.definePluginSettings({
        greeting: { type: U.OptionType.STRING, default: "Hello from Userscript++", description: "Text shown when you click the button." },
    });
    const sayHello = () => U.showToast(settings.store.greeting);
    const { h, useState } = U.react;
    // 设置弹窗里的效果预览:模拟工具栏按钮,点一下显示当前问候语(改设置时跟着变)
    const Preview = ({ settings: s }) => {
        const [shown, setShown] = useState(false);
        return h("div", { style: { display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" } },
            h("button", { type: "button", className: "uspp-btn uspp-btn-sm", onClick: () => setShown(v => !v) }, "Say hello"),
            shown && h("div", { className: "uspp-preview-chip" }, s.greeting));
    };
    return U.definePlugin({
        name: "ExampleHello",
        description: "Example plugin: adds a toolbar button and a menu command that show a greeting.",
        authors: ["Userscript++"],
        enabledByDefault: true,
        startAt: U.StartAt.SiteReady,
        settings,
        preview: { component: Preview, caption: "Click the button to see the greeting." },
        slots: {
            toolbar: { label: "Say hello", tooltip: "Show the greeting", onClick: sayHello },
            menuCommand: { label: "Example: say hello", onSelect: sayHello },
        },
    });
};
