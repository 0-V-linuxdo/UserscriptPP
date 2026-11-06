// 示例插件(TypeScript + JSX):JSX 直接写,构建时编译成 U.react.h;类型来自 types/index.d.ts(只去掉类型,不做检查)
import type { UsppApi } from "../../../../types";

export default (U: UsppApi) => {
    const { useState } = U.react;

    function Counter({ label }: { label: string }) {
        const [n, setN] = useState(0);
        return (
            <>
                <button type="button" className="uspp-btn uspp-btn-sm" data-uspp-tsx-counter onClick={() => setN(n + 1)}>
                    {label}: {n}
                </button>
            </>
        );
    }

    return U.definePlugin({
        name: "ExampleTsx",
        description: "Example plugin written in TypeScript with JSX: renders a counter under the example page's message.",
        authors: ["Userscript++"],
        enabledByDefault: true,
        preview: { component: () => <Counter label="Clicks" />, caption: "A component written in JSX." },
        startAt: U.StartAt.SiteReady,
        start(ctx) {
            const host = document.createElement("div");
            host.setAttribute("data-uspp-tsx-host", "");
            document.body.appendChild(host);
            const root = U.react.getRenderer()!.createRoot(host);
            root.render(<Counter label="Clicks" />);
            ctx.register(() => { root.unmount(); host.remove(); });
        },
    });
};
