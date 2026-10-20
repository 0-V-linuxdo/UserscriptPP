// 示例插件:一个工具栏按钮、一个菜单命令、一个设置项
export default U => {
    const settings = U.definePluginSettings({
        greeting: { type: U.OptionType.STRING, default: "Hello from Userscript++", description: "Text shown when you click the button." },
    });
    const sayHello = () => U.showToast(settings.store.greeting);
    return U.definePlugin({
        name: "ExampleHello",
        description: "Example plugin: adds a toolbar button and a menu command that show a greeting.",
        authors: ["Userscript++"],
        enabledByDefault: true,
        startAt: U.StartAt.SiteReady,
        settings,
        slots: {
            toolbar: { label: "Say hello", tooltip: "Show the greeting", onClick: sayHello },
            menuCommand: { label: "Example: say hello", onSelect: sayHello },
        },
    });
};
