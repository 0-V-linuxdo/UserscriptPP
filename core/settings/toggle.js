// 插件卡片、失败列表共用的"关掉插件":别的插件还要用它时先问是否一起关。
// 对话框是异步的,确认之后按当时的状态重新计算(期间可能被熔断、别的标签页可能又开了依赖它的插件),并且只发"设成关",不发"取反"
import { plugins, dependentsOf, isEnabledAsDependency, setPluginEnabled } from "../lib/plugins.js";
import { confirmDialog } from "../ui/modal.js";

const userDependents = name => dependentsOf(name).filter(n => !isEnabledAsDependency(n));

/** 关掉 name(连同依赖它的插件,先问);onToggled 对每个被关掉的插件调用。取消时返回 false */
export async function turnOffPlugin(name, onToggled = () => { }) {
    if (userDependents(name).length) {
        const needs = userDependents(name);
        const ok = await confirmDialog({ title: `Turn off ${name}?`, body: `${needs.join(", ")} ${needs.length === 1 ? "needs" : "need"} it. Turn ${needs.length === 1 ? "it" : "them"} off too?`, confirmText: "Turn off all", danger: true });
        if (!ok) return false;
        for (const n of userDependents(name)) { setPluginEnabled(n, false); onToggled(plugins[n]); }
    }
    setPluginEnabled(name, false);
    onToggled(plugins[name]);
    return true;
}
