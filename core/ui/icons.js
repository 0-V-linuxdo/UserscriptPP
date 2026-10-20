import { h } from "./react.js";

// 图标尺寸以 4px 为单位(size: 4 => 16px)
function svg(paths, { viewBox = "0 0 24 24", fill = "none" } = {}) {
    const Icon = ({ size = 4, className, color, style }) => h("svg", {
        width: size * 4, height: size * 4, viewBox, fill, className,
        stroke: fill === "none" ? (color || "currentColor") : undefined,
        strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round",
        style: { flexShrink: 0, color, ...style }, "aria-hidden": true,
    }, ...paths.map((d, i) => typeof d === "string" ? h("path", { d, key: i }) : { ...d, key: i }));
    return Icon;
}

export const PlugIcon = svg(["M9 2v6", "M15 2v6", "M6 8h12v3a6 6 0 0 1-12 0V8z", "M12 17v5"]);
export const PuzzleIcon = svg(["M19.4 13a2 2 0 1 0 0-4H18V6a2 2 0 0 0-2-2h-3v1.6a2 2 0 1 1-4 0V4H6a2 2 0 0 0-2 2v3h1.6a2 2 0 1 1 0 4H4v3a2 2 0 0 0 2 2h3v-1.6a2 2 0 1 1 4 0V18h3a2 2 0 0 0 2-2v-3h1.4z"]);
export const PaletteIcon = svg(["M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2a2 2 0 0 0-1.4 3.4A1.5 1.5 0 0 1 12 22z", "M7.5 10.5h.01", "M10.5 7h.01", "M15 7.5h.01"]);
export const CodeIcon = svg(["M16 18l6-6-6-6", "M8 6l-6 6 6 6"]);
export const InfoIcon = svg(["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 16v-4", "M12 8h.01"]);
export const StarIcon = svg(["M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"]);
export const StarFillIcon = svg(["M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"], { fill: "currentColor" });
export const PinIcon = svg(["M12 17v5", "M9 3h6l-1 6 4 4H6l4-4z"]);
export const PinFillIcon = svg(["M12 17v5", "M9 3h6l-1 6 4 4H6l4-4z"], { fill: "currentColor" });
export const SlidersIcon = svg(["M4 6h10", "M18 6h2", "M4 12h4", "M12 12h8", "M4 18h12", "M20 18h0", "M16 4v4", "M10 10v4", "M18 16v4"]);
export const WarningIcon = svg(["M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z", "M12 9v4", "M12 17h.01"]);
export const LockIcon = svg(["M5 11h14v10H5z", "M8 11V7a4 4 0 0 1 8 0v4"]);
export const CloseIcon = svg(["M18 6L6 18", "M6 6l12 12"]);
export const ChromiumIcon = svg(["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M21.2 8H12", "M3.9 6.1l4.6 7.9", "M10.9 21.9l4.6-7.9"]);
export const WrenchIcon = svg(["M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3 8-8z", "M14.7 6.3L10 2 2 10l4.3 4.7"]);
export const TrashIcon = svg(["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6"]);
export const EditIcon = svg(["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"]);
export const CopyIcon = svg(["M9 9h11v11H9z", "M5 15H4V4h11v1"]);
export const CheckIcon = svg(["M20 6L9 17l-5-5"]);
export const ReloadIcon = svg(["M21 12a9 9 0 1 1-3-6.7", "M21 3v6h-6"]);
export const ChevronRightIcon = svg(["M9 6l6 6-6 6"]);
export const LogoIcon = svg(["M12 3l8 4.5v9L12 21l-8-4.5v-9z", "M12 8v8", "M8 12h8"]);
export const ArchiveIcon = svg(["M3 4h18v4H3z", "M5 8v12h14V8", "M10 12h4"]);
