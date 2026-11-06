// 构建时注入到用了 JSX 的文件里(esbuild inject):<div/> 编译成 __USPP_JSX_H__("div"),这里接到核心的 h / Fragment
export { h as __USPP_JSX_H__, Fragment as __USPP_JSX_FRAGMENT__ } from "./ui/react.js";
