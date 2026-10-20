// ==UserScript==
// @name         Userscript++ for Grok (dev)
// @namespace    https://userscript-pp.local/
// @version      20261020.0138
// @description  Userscript++ framework with the Grok site adapter.
// @homepageURL  https://github.com/0-V-linuxdo/UserscriptPP
// @supportURL   https://github.com/0-V-linuxdo/UserscriptPP/issues
// @updateURL    https://raw.githubusercontent.com/0-V-linuxdo/UserscriptPP/main/dist/Userscript%2B%2B.grok.dev.meta.js
// @downloadURL  https://raw.githubusercontent.com/0-V-linuxdo/UserscriptPP/main/dist/Userscript%2B%2B.grok.dev.user.js
// @match        *://grok.com/*
// @run-at       document-start
// @inject-into  auto
// @sandbox      JavaScript
// @noframes
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @connect      *
// ==/UserScript==

(() => {
  var __defProp = Object.defineProperty;
  var __export = (target2, all) => {
    for (var name in all)
      __defProp(target2, name, { get: all[name], enumerable: true });
  };

  // <define:__USPP_SITES__>
  var define_USPP_SITES_default = ["grok"];

  // core/env.js
  var W = typeof unsafeWindow !== "undefined" && unsafeWindow ? unsafeWindow : window;
  var GM = {
    get: typeof GM_getValue === "function" ? GM_getValue : null,
    set: typeof GM_setValue === "function" ? GM_setValue : null,
    del: typeof GM_deleteValue === "function" ? GM_deleteValue : null,
    xhr: typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : null,
    addListener: typeof GM_addValueChangeListener === "function" ? GM_addValueChangeListener : null,
    removeListener: typeof GM_removeValueChangeListener === "function" ? GM_removeValueChangeListener : null,
    menu: typeof GM_registerMenuCommand === "function" ? GM_registerMenuCommand : null,
    unmenu: typeof GM_unregisterMenuCommand === "function" ? GM_unregisterMenuCommand : null,
    clipboard: typeof GM_setClipboard === "function" ? GM_setClipboard : null
  };
  var VERSION = true ? "20261020.0138" : "0.0.0";
  var IS_DEV = true ? true : false;
  var BUILD_TYPE = IS_DEV ? "development" : "production";
  var isChromium = () => !!W.chrome;

  // sites/grok/u.js
  var U = null;
  var bindApi = (api) => {
    U = api;
  };
  var R = () => U.findReact();
  var Fragment = Symbol.for("react.fragment");
  function h(type, props, ...children) {
    const React = R();
    return React.createElement(type === Fragment ? React.Fragment : type, props, ...children);
  }
  var hook = (name) => (...args) => R()[name](...args);
  var useState = hook("useState");
  var useEffect = hook("useEffect");
  var useLayoutEffect = hook("useLayoutEffect");
  var useRef = hook("useRef");
  var useReducer = hook("useReducer");
  function useSubscription(subscribe6) {
    const [, force] = useReducer((x4) => x4 + 1, 0);
    useEffect(() => subscribe6(() => force()), []);
  }
  var slotSubscriber = (slot) => (fn2) => U.onSlotChange(slot, fn2);
  var EB = null;
  function boundaryClass() {
    if (EB) return EB;
    const React = R();
    EB = class UsppGrokBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }
      static getDerivedStateFromError(error) {
        return { error };
      }
      componentDidCatch(error, info) {
        console.error("[Userscript++] 组件渲染出错", this.props.label || "", error, info?.componentStack);
      }
      render() {
        if (this.state.error) {
          const fb = this.props.fallback;
          return typeof fb === "function" ? fb(this.state.error) : fb ?? null;
        }
        return this.props.children ?? null;
      }
    };
    return EB;
  }
  var ErrorBoundary = (props) => h(boundaryClass(), props);

  // sites/grok/common.js
  var find = (f3) => U.find(f3);
  var findStore = (n2) => U.findStore(n2);
  var getReact = () => U.findReact();
  var isZustandStore = (v3) => U.isZustandStore(v3);
  var getFiber = (el) => U.getFiber(el);
  var has = (v3, k4) => {
    try {
      return v3[k4] != null;
    } catch {
      return false;
    }
  };
  var moduleFilters = {
    dropdown: (v3) => has(v3, "DROPDOWN_MENU_ICON_CLASSES") && has(v3, "DropdownMenuItem"),
    contextMenu: (v3) => has(v3, "ContextMenuShortcut") && has(v3, "ContextMenuItem"),
    select: (v3) => has(v3, "SelectTrigger") && has(v3, "SelectValue") && !has(v3, "Root"),
    switch: (v3) => typeof v3.Switch === "function" && !has(v3, "Root") && !has(v3, "Thumb"),
    button: (v3) => has(v3, "Button") && has(v3, "IconButton") && has(v3, "buttonVariants"),
    dialog: (v3) => has(v3, "DialogCloseButton") && has(v3, "DialogContent"),
    tooltip: (v3) => has(v3, "TooltipGroup") && has(v3, "TooltipContent"),
    input: (v3) => has(v3, "FIELD_ERROR_CLASSES") && has(v3, "Input"),
    badge: (v3) => typeof v3.Badge === "function" && Object.keys(v3).length <= 3,
    separator: (v3) => typeof v3.Separator === "function" && !has(v3, "Root") && Object.keys(v3).length <= 2,
    textarea: (v3) => typeof v3.Textarea === "function" && Object.keys(v3).length <= 2,
    reactDomClient: (v3) => typeof v3.createRoot === "function" && typeof v3.hydrateRoot === "function",
    reactDom: (v3) => typeof v3.createPortal === "function" && typeof v3.flushSync === "function",
    toast: (v3) => typeof v3 === "function" && typeof v3.success === "function" && typeof v3.dismiss === "function" && typeof v3.getHistory === "function"
  };
  var cache = {};
  var lastVersion = {};
  function resolveModule(key) {
    if (cache[key]) return cache[key];
    U.syncModuleCache();
    const v3 = U.moduleCacheVersion();
    if (lastVersion[key] === v3) return null;
    lastVersion[key] = v3;
    const m3 = find(moduleFilters[key]);
    if (m3) cache[key] = m3;
    return m3 || null;
  }
  var STORE_NAMES = ["ChatPage", "Conversation", "Message", "Response", "Routing", "SettingsDialog", "Settings", "Modes", "Feature", "Session", "Subscriptions"];
  var storeCache = {};
  function resolveStore(name) {
    if (storeCache[name]) return storeCache[name];
    const s3 = findStore(name);
    if (s3 && isZustandStore(s3)) storeCache[name] = s3;
    return s3 || null;
  }
  var common = {};
  var def = (name, get) => Object.defineProperty(common, name, { get, enumerable: true });
  def("React", () => getReact());
  for (const hook3 of ["useState", "useEffect", "useMemo", "useRef", "useCallback", "useContext", "useLayoutEffect", "useReducer", "useId", "useSyncExternalStore", "useTransition", "useDeferredValue", "useImperativeHandle", "memo", "forwardRef", "createContext", "createElement", "Fragment", "cloneElement", "isValidElement", "Children"]) {
    def(hook3, () => getReact()?.[hook3] ?? null);
  }
  def("ReactDOM", () => resolveModule("reactDom"));
  def("ReactDOMClient", () => resolveModule("reactDomClient"));
  var uiMap = {
    Button: ["button", "Button"],
    IconButton: ["button", "IconButton"],
    Dialog: ["dialog", "Dialog"],
    DialogContent: ["dialog", "DialogContent"],
    DialogTitle: ["dialog", "DialogTitle"],
    DialogDescription: ["dialog", "DialogDescription"],
    DialogHeader: ["dialog", "DialogHeader"],
    DialogFooter: ["dialog", "DialogFooter"],
    DialogClose: ["dialog", "DialogClose"],
    DialogCloseButton: ["dialog", "DialogCloseButton"],
    DialogTrigger: ["dialog", "DialogTrigger"],
    DropdownMenu: ["dropdown", "DropdownMenu"],
    DropdownMenuTrigger: ["dropdown", "DropdownMenuTrigger"],
    DropdownMenuContent: ["dropdown", "DropdownMenuContent"],
    DropdownMenuItem: ["dropdown", "DropdownMenuItem"],
    DropdownMenuSub: ["dropdown", "DropdownMenuSub"],
    DropdownMenuSubTrigger: ["dropdown", "DropdownMenuSubTrigger"],
    DropdownMenuSubContent: ["dropdown", "DropdownMenuSubContent"],
    DropdownMenuSeparator: ["dropdown", "DropdownMenuSeparator"],
    DropdownMenuLabel: ["dropdown", "DropdownMenuLabel"],
    DropdownMenuGroup: ["dropdown", "DropdownMenuGroup"],
    DropdownMenuPortal: ["dropdown", "DropdownMenuPortal"],
    ContextMenuItem: ["contextMenu", "ContextMenuItem"],
    ContextMenuSub: ["contextMenu", "ContextMenuSub"],
    ContextMenuSubTrigger: ["contextMenu", "ContextMenuSubTrigger"],
    ContextMenuSubContent: ["contextMenu", "ContextMenuSubContent"],
    ContextMenuSeparator: ["contextMenu", "ContextMenuSeparator"],
    Switch: ["switch", "Switch"],
    Select: ["select", "Select"],
    SelectTrigger: ["select", "SelectTrigger"],
    SelectContent: ["select", "SelectContent"],
    SelectItem: ["select", "SelectItem"],
    SelectValue: ["select", "SelectValue"],
    Input: ["input", "Input"],
    Textarea: ["textarea", "Textarea"],
    Tooltip: ["tooltip", "Tooltip"],
    TooltipTrigger: ["tooltip", "TooltipTrigger"],
    TooltipContent: ["tooltip", "TooltipContent"],
    TooltipProvider: ["tooltip", "TooltipProvider"],
    Separator: ["separator", "Separator"],
    Badge: ["badge", "Badge"]
  };
  for (const [name, [mod, key]] of Object.entries(uiMap)) {
    def(name, () => {
      const m3 = resolveModule(mod);
      try {
        return m3 ? m3[key] ?? null : null;
      } catch {
        return null;
      }
    });
  }
  for (const s3 of STORE_NAMES) def(`${s3}Store`, () => resolveStore(s3));
  def("Toaster", () => resolveModule("toast"));
  var once = (filter) => {
    let hit = null;
    return () => hit || (hit = find(filter) || null);
  };
  var subsModule = once((v3) => has(v3, "useSubscriptions") && has(v3, "getSubscriptionTierName"));
  var isQueryClient = (v3) => typeof v3?.getQueryCache === "function" && typeof v3?.getQueryData === "function" && typeof v3?.setQueryData === "function";
  var exportedQueryClient = once(isQueryClient);
  var fiberQueryClient = null;
  var isOwn = (el) => el?.nodeType === 1 && (el.tagName === "USPP-ROOT" || !!el.closest?.("uspp-root"));
  function reactRootFibers() {
    const out = /* @__PURE__ */ new Set();
    const els = [document, document.documentElement, document.getElementById("__next"), document.getElementById("root"), document.body, ...document.body?.children || []].filter((el) => el && !isOwn(el));
    for (const el of els) {
      for (const k4 of Object.keys(el)) if (k4.startsWith("__reactContainer$")) {
        const f4 = el[k4]?.stateNode?.current ?? el[k4];
        if (f4) out.add(f4);
      }
    }
    const any = [...document.querySelectorAll("body *")].filter((el) => !isOwn(el)).slice(0, 200).map(getFiber).find(Boolean);
    let f3 = any;
    while (f3?.return) f3 = f3.return;
    if (f3) out.add(f3.stateNode?.current ?? f3);
    return [...out];
  }
  function queryClient() {
    const c3 = exportedQueryClient();
    if (c3) return c3;
    if (fiberQueryClient) return fiberQueryClient;
    for (const root2 of reactRootFibers()) {
      const stack = [root2];
      for (let n2 = 0; stack.length && n2 < 5e4; n2++) {
        const f3 = stack.pop();
        const client = f3.memoizedProps?.client;
        if (isQueryClient(client)) return fiberQueryClient = client;
        if (f3.sibling) stack.push(f3.sibling);
        if (f3.child) stack.push(f3.child);
      }
    }
    return null;
  }
  function subscriptionsFromQueryCache() {
    const qc = queryClient();
    if (!qc) return null;
    try {
      const qs = qc.getQueryCache().getAll().filter((q4) => Array.isArray(q4.queryKey) && q4.queryKey[0] === "subscriptions" && q4.state?.data != null);
      qs.sort((a3, b3) => (b3.state.dataUpdatedAt || 0) - (a3.state.dataUpdatedAt || 0));
      return qs[0]?.state.data ?? null;
    } catch {
      return null;
    }
  }
  var pickList = (data) => {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== "object") return [];
    for (const k4 of ["subscriptions", "activeSubscriptions", "items", "data"]) if (Array.isArray(data[k4])) return data[k4];
    return [];
  };
  var tierOf = (s3) => s3?.tier ?? s3?.subscriptionTier ?? s3?.plan ?? s3?.productTier ?? null;
  var INACTIVE = /cancel|expired|inactive|ended|unpaid|incomplete_expired/i;
  var TIER_RANK = [/heavy/i, /pro|plus/i, /super/i, /premium/i, /basic|free/i];
  var rank = (t3) => {
    const s3 = String(t3 ?? "");
    const i3 = TIER_RANK.findIndex((r3) => r3.test(s3));
    return i3 < 0 ? TIER_RANK.length : i3;
  };
  var isX = (s3) => /(^|[^a-z])(x|twitter)([^a-z]|$)/i.test(String(s3?.billingProvider ?? s3?.provider ?? s3?.source ?? s3?.platform ?? "")) || !!s3?.isXSubscription;
  function subscriptionTierName(tier, sub) {
    if (tier == null) return "";
    const m3 = subsModule();
    if (m3) {
      try {
        const n2 = m3.getSubscriptionTierName(tier, sub);
        if (typeof n2 === "string" && n2) return n2;
      } catch {
      }
    }
    return String(tier).replace(/^SUBSCRIPTION_TIER_/i, "").split(/[_\s]+/).filter(Boolean).map((w4) => w4.toLowerCase() === "supergrok" ? "SuperGrok" : w4.charAt(0).toUpperCase() + w4.slice(1).toLowerCase()).join(" ").replace(/^Super Grok/, "SuperGrok").replace(/^X Premium Plus$/, "X Premium+");
  }
  function getSubscriptions() {
    let data = null;
    try {
      data = resolveStore("Subscriptions")?.getState?.() ?? null;
    } catch {
      data = null;
    }
    if (!data || !pickList(data).length) data = subscriptionsFromQueryCache() ?? data;
    if (!data) return {};
    const list = pickList(data);
    const active = list.filter((s3) => !INACTIVE.test(String(s3?.status ?? s3?.state ?? "")));
    const tiers = active.map(tierOf).filter((t3) => t3 != null);
    const best = data.bestSubscription;
    const bestTier = typeof best === "string" ? best : tierOf(best);
    const highest = bestTier ?? (tiers.length ? tiers.slice().sort((a3, b3) => rank(a3) - rank(b3))[0] : data.highestTier ?? data.tier ?? null);
    return {
      highestTier: highest,
      highestTierName: subscriptionTierName(highest, active.find((s3) => tierOf(s3) === highest)),
      isSubscribed: active.length > 0 || highest != null && !/free|basic/i.test(String(highest)),
      isEnterprise: !!(data.isEnterpriseUser ?? data.isEnterprise ?? data.enterprise ?? active.some((s3) => /enterprise|team|business/i.test(String(tierOf(s3))))),
      hasXSubscription: !!(data.hasXSubscription ?? active.some(isX)),
      active,
      raw: data
    };
  }
  def("getSubscriptions", () => getSubscriptions);
  def("subscriptionTierName", () => subscriptionTierName);
  def("useSubscriptions", () => {
    const m3 = subsModule();
    return m3 ? m3.useSubscriptions : null;
  });
  function whenCommon(names, fn2) {
    const ready2 = () => names.every((n2) => common[n2] != null);
    let done = false, timer2 = null, unsub = null;
    const tryRun = () => {
      if (done || !ready2()) return false;
      done = true;
      unsub?.();
      if (timer2) clearInterval(timer2);
      fn2(...names.map((n2) => common[n2]));
      return true;
    };
    if (tryRun()) return;
    unsub = U.onModuleLoad(() => {
      tryRun();
    });
    timer2 = setInterval(tryRun, 1e3);
  }

  // sites/grok/stream.js
  var logger = null;
  var IN_FLIGHT = /* @__PURE__ */ new Set(["queued", "sending", "sent", "optimistic", "streaming", "reconnecting", "pending"]);
  var recent = /* @__PURE__ */ new Map();
  function fire(responseId) {
    if (!responseId) return;
    const now = Date.now();
    const last2 = recent.get(responseId);
    if (last2 && now - last2 < 5e3) return;
    recent.set(responseId, now);
    if (recent.size > 200) recent.delete(recent.keys().next().value);
    U.dispatch("streamEnd", { responseId });
  }
  function watchResponses(store) {
    let prev = /* @__PURE__ */ new Map();
    const snapshot = (state) => {
      const m3 = /* @__PURE__ */ new Map();
      const byId = state?.byId;
      if (byId && typeof byId === "object") {
        for (const id of Object.keys(byId)) {
          const r3 = byId[id];
          const st = r3?.state ?? r3?.status;
          if (typeof st === "string") m3.set(id, { state: st, role: r3.role ?? r3.sender });
        }
      }
      return m3;
    };
    prev = snapshot(store.getState());
    store.subscribe((state) => {
      const next = snapshot(state);
      for (const [id, cur] of next) {
        const old = prev.get(id);
        if (old && IN_FLIGHT.has(old.state) && !IN_FLIGHT.has(cur.state)) {
          const role = String(cur.role ?? "assistant").toLowerCase();
          if (role !== "human" && role !== "user") fire(id);
        }
      }
      prev = next;
    });
  }
  function watchChatPage(store) {
    let last2 = store.getState()?.streamedMessageId;
    store.subscribe((state) => {
      const cur = state?.streamedMessageId;
      if (last2 && !cur) fire(last2);
      last2 = cur;
    });
  }
  var DONE = /* @__PURE__ */ new Set(["complete", "completed", "done", "finished", "success"]);
  var FAILED = /* @__PURE__ */ new Set(["error", "failed", "cancelled", "canceled", "aborted", "stopped"]);
  var nodeStatus = (n2) => {
    const st = n2?.status ?? n2?.state;
    return typeof st === "string" ? st.toLowerCase() : null;
  };
  var isAssistant = (n2) => {
    const r3 = String(n2?.role ?? n2?.sender ?? "").toLowerCase();
    return r3 === "assistant" || r3 === "model" || r3 === "grok";
  };
  function watchMessages(store) {
    const convCache = /* @__PURE__ */ new Map();
    const nodeCache = /* @__PURE__ */ new WeakSet();
    const inFlight = /* @__PURE__ */ new Set();
    const keysOf = (id, n2) => [id, n2.responseId, n2.inflightResponseId, n2.id].filter((k4) => typeof k4 === "string" && k4);
    const scan = (state, initial) => {
      const convs = state?.conversations;
      if (!convs || typeof convs !== "object") return;
      for (const cid of Object.keys(convs)) {
        const nodes = convs[cid]?.nodes;
        if (!nodes || typeof nodes !== "object" || convCache.get(cid) === nodes) continue;
        convCache.set(cid, nodes);
        for (const id of Object.keys(nodes)) {
          const n2 = nodes[id];
          if (!n2 || typeof n2 !== "object" || nodeCache.has(n2)) continue;
          nodeCache.add(n2);
          if (!isAssistant(n2)) continue;
          const st = nodeStatus(n2);
          if (!st) continue;
          const keys = keysOf(id, n2);
          if (DONE.has(st) || FAILED.has(st)) {
            const was = keys.some((k4) => inFlight.has(k4));
            keys.forEach((k4) => inFlight.delete(k4));
            if (was && !initial && DONE.has(st)) fire(n2.responseId || id);
          } else {
            keys.forEach((k4) => inFlight.add(k4));
          }
        }
      }
    };
    scan(store.getState(), true);
    store.subscribe((state) => {
      try {
        scan(state, false);
      } catch (e3) {
        logger.error("处理消息状态出错", e3);
      }
    });
  }
  var started = false;
  function startStreamEvents() {
    if (started) return;
    started = true;
    logger = new U.Logger("Stream", "#bef264");
    const attach = (name, fn2) => {
      const s3 = U.findStore(name);
      if (s3) {
        try {
          fn2(s3);
        } catch (e3) {
          logger.error(`订阅 ${name} 失败`, e3);
        }
        return;
      }
      U.waitFor(U.filters.byStoreName(name), (m3) => {
        try {
          fn2(m3[`use${name}Store`]);
        } catch (e3) {
          logger.error(`订阅 ${name} 失败`, e3);
        }
      });
    };
    attach("Response", watchResponses);
    attach("ChatPage", watchChatPage);
    attach("Message", watchMessages);
  }

  // sites/grok/settings-host.js
  var GROUP_ID = "uspp";
  var GROUP_LABEL = "Userscript++";
  var PLUGINS_TIP = "Toggle features. Some need a reload. Click the sliders icon to configure.";
  var ENTRY_PATH = "plugins.Settings.showSiteEntry";
  var logger2 = null;
  var log = () => logger2 ??= new U.Logger("GrokSettings", "#a5b4fc");
  var pages = () => U.settingsPages;
  var pageById = (id) => pages().find((p3) => p3.id === id);
  var pageId = (key) => (pages().find((p3) => p3.key === key || p3.id === key) || pages()[0]).id;
  var entryShown = () => U.PlainSettings.plugins.Settings?.showSiteEntry !== false;
  function PluginsLabel() {
    const { Tooltip: Tooltip2 } = U.components;
    return h(
      "span",
      { style: { display: "inline-flex", alignItems: "center", gap: 6 } },
      "Plugins",
      h(Tooltip2, { content: PLUGINS_TIP }, h("span", { className: "uspp-tip", "aria-label": PLUGINS_TIP, style: { display: "inline-flex", opacity: 0.7 } }, h(U.icons.InfoIcon, { size: 3.5 })))
    );
  }
  var tabIcon = (Icon) => ({ size = 4 }) => h(Icon, { size });
  var entries = null;
  var registryEntries = () => entries ??= pages().map((p3) => ({
    id: p3.id,
    group: GROUP_ID,
    icon: tabIcon(p3.icon),
    // 团队设置界面里不显示
    visible: (ctx) => !ctx?.isTeamSettingsSession && entryShown(),
    component: p3.component
  }));
  function navGroups(groups) {
    const list = Array.isArray(groups) ? groups : [];
    return list.includes(GROUP_ID) ? list : [...list, GROUP_ID];
  }
  function tabRegistry(reg) {
    const list = Array.isArray(reg) ? reg : [];
    const ids = new Set(pages().map((p3) => p3.id));
    return [...list.filter((t3) => !ids.has(t3?.id)), ...registryEntries()];
  }
  function tabLabel(tab) {
    const p3 = tab && pageById(tab.id);
    if (!p3) return null;
    return p3.key === "plugins" ? h(PluginsLabel) : p3.label;
  }
  function openSettingsTab(tabId) {
    const store = common.SettingsDialogStore;
    if (!store) return false;
    const st = store.getState();
    try {
      if (typeof st.openTab === "function") st.openTab(tabId);
      else {
        st.setTab?.(tabId);
        st.setOpen?.(true);
      }
      return true;
    } catch (e3) {
      log().error("打开设置失败", e3);
      return false;
    }
  }
  function openPluginOverSettings(plugin) {
    const started2 = Date.now();
    const tick = () => {
      const dlg = document.querySelector('[role="dialog"][data-state="open"]');
      if (dlg || Date.now() - started2 > 1500) U.openPluginSettings(plugin);
      else setTimeout(tick, 50);
    };
    setTimeout(tick, 30);
  }
  function open({ tab, plugin } = {}) {
    if (!openSettingsTab(pageId(plugin ? "plugins" : tab || "plugins"))) return false;
    if (plugin) openPluginOverSettings(plugin);
    return true;
  }
  var isOpen = () => !!document.querySelector('[role="dialog"] [data-uspp-page]');
  var pluginsWithSettings = () => Object.values(U.plugins).filter((p3) => !p3.hidden && !(p3.chromiumOnly && !U.isChromium()) && U.getVisibleSettings(p3).length > 0).sort((a3, b3) => a3.name.localeCompare(b3.name));
  var subscribeMenu = (fn2) => {
    const off = U.subscribe(U.Events.PLUGIN_TOGGLE, fn2);
    U.SettingsStore.addChangeListener(ENTRY_PATH, fn2);
    return () => {
      off();
      U.SettingsStore.removeChangeListener?.(ENTRY_PATH, fn2);
    };
  };
  function AvatarMenu() {
    useSubscription(subscribeMenu);
    const { DropdownMenuSub: Sub, DropdownMenuSubTrigger: Trigger, DropdownMenuSubContent: Content, DropdownMenuItem: Item } = common;
    if (!entryShown() || !Sub || !Trigger || !Content || !Item) return null;
    const { icons } = U;
    const icon = (I3, el) => h("span", { className: "inline-flex me-2 text-fg-secondary" }, el ?? h(I3, { size: 4 }));
    const list = pluginsWithSettings();
    const pageItem = (key) => {
      const p3 = pages().find((x4) => x4.key === key);
      return p3 && h(Item, { key, onClick: () => open({ tab: key }), "data-uspp-menu": key.toLowerCase() }, icon(p3.icon), p3.label);
    };
    return h(
      Sub,
      { "data-uspp-avatar-menu": "" },
      h(Trigger, { "data-uspp-menu": "root" }, icon(icons.LogoIcon), GROUP_LABEL),
      h(
        Content,
        null,
        list.length > 0 && h(
          Sub,
          null,
          h(Trigger, { "data-uspp-menu": "plugins" }, icon(icons.PuzzleIcon), "Plugins"),
          // 插件多时在菜单内部滚动,不带动页面
          h(Content, { "data-uspp-menu-list": "plugins", style: { maxHeight: "min(60vh, 420px)", overflowY: "auto", overscrollBehavior: "contain" } }, list.map((p3) => h(
            Item,
            { key: p3.name, onClick: () => open({ plugin: p3 }), "data-uspp-menu-plugin": p3.name },
            icon(null, h(ErrorBoundary, { fallback: h(icons.PlugIcon, { size: 4 }) }, h(p3.icon || icons.PlugIcon, { size: 4 }))),
            p3.name
          )))
        ),
        pageItem("themes"),
        pageItem("quickCss"),
        pageItem("backup")
      )
    );
  }
  function renderAvatarMenu() {
    return h(ErrorBoundary, { key: "uspp-avatar-menu", fallback: null, label: "avatar-menu" }, h(AvatarMenu));
  }
  var fallbacks = /* @__PURE__ */ new Set();
  function whenModule(keys, fn2) {
    const m3 = U.findByProps(...keys);
    if (m3) fn2(m3);
    else U.waitFor((x4) => keys.every((k4) => x4 && k4 in x4), fn2);
  }
  function hookExport(name, fn2) {
    const C4 = U.findExportedComponent(name);
    if (C4) fn2(C4);
    else U.waitFor((m3) => typeof m3[name] === "function" || m3[name] && typeof m3[name] === "object", (m3) => fn2(m3[name]));
  }
  function enableFallback(kind) {
    if (fallbacks.has(kind)) return;
    fallbacks.add(kind);
    if (kind === "registry") {
      whenModule(["NAV_GROUPS", "TAB_REGISTRY"], (m3) => {
        try {
          const groups = m3.NAV_GROUPS, reg = m3.TAB_REGISTRY;
          if (Array.isArray(groups) && !groups.includes(GROUP_ID)) groups.push(GROUP_ID);
          if (Array.isArray(reg)) {
            for (const e3 of registryEntries()) if (!reg.some((x4) => x4?.id === e3.id)) reg.push(e3);
          }
        } catch (e3) {
          log().error("兜底注册设置标签失败", e3);
        }
      });
      U.registerInjectionFallback("Settings", "设置标签注册");
    } else if (kind === "labels") {
      const ids = new Set(pages().map((p3) => p3.id));
      const swap = (props, key, render) => {
        const c3 = props.children;
        if (typeof c3 === "string" && ids.has(c3)) return render({ ...props, children: tabLabel({ id: c3 }) });
        if (Array.isArray(c3) && c3.some((x4) => typeof x4 === "string" && ids.has(x4)))
          return render({ ...props, children: c3.map((x4) => typeof x4 === "string" && ids.has(x4) ? h(Fragment, { key: x4 }, tabLabel({ id: x4 })) : x4) });
      };
      for (const tag of ["span", "div", "p", "h1", "h2", "h3"]) U.addRenderHook(tag, swap);
      hookExport("SettingsContainer", (C4) => U.addRenderHook(C4, (props, key, render) => {
        if (typeof props.title === "string" && ids.has(props.title)) return render({ ...props, title: pageById(props.title).label });
      }));
      whenModule(["navGroupLabelStyle"], (K3) => U.addRenderHook("div", (props, key, render) => {
        if (props.className === K3.navGroupLabelStyle && props.children == null) return render({ ...props, children: GROUP_LABEL });
      }));
      U.registerInjectionFallback("Settings", "设置标签名");
    } else if (kind === "avatar") {
      hookExport("SupportIcon", (Support) => whenCommon(["DropdownMenuSub", "DropdownMenuSubTrigger"], (SubC) => {
        U.addRenderHook(SubC, (props, key, render) => {
          if (props["data-uspp-avatar-menu"] != null) return;
          const first = U.asArray(props.children)[0];
          if (!first || first.type !== common.DropdownMenuSubTrigger || !U.treeHas(first.props?.children, (el) => el.type === Support, 3)) return;
          return h(Fragment, { key }, renderAvatarMenu(), render());
        });
      }));
      U.registerInjectionFallback("Settings", "头像菜单");
    }
  }
  function installSettingsFallbacks() {
    U.onPatchBypassed("Settings", (results) => {
      for (const r3 of results) {
        if (r3.find.includes("TAB_REGISTRY")) enableFallback("registry");
        else if (r3.find.includes("settings-nav-group")) enableFallback("labels");
        else if (r3.find.includes("user-dropdown.help")) enableFallback("avatar");
      }
    });
  }
  var settingsHost = {
    open,
    isOpen,
    // 补丁记在核心 Settings 插件名下,$self 指向本对象
    patches: [
      {
        // 设置标签注册表:追加分组和框架的设置页
        find: '"TAB_REGISTRY",0,',
        replacement: {
          match: /"NAV_GROUPS",0,(\[[^\]]*\]),"TAB_REGISTRY",0,(\i)\]/,
          replace: '"NAV_GROUPS",0,$self.navGroups($1),"TAB_REGISTRY",0,$self.tabRegistry($2)]'
        }
      },
      {
        // 设置对话框:分组名和标签名
        // 翻译词典模块里也有这些字符串,用第二个特征排除
        find: ['"settings-nav-group.general"', '"SettingsDialog:tabLabel"'],
        group: true,
        replacement: [
          {
            match: /(\i=>\{switch\(\i\)\{)(case"general":return \i\("settings-nav-group\.general")/,
            replace: '$1case"uspp":return"Userscript++";$2'
          },
          {
            match: /default:(return\(0,\i\.logError\)\("SettingsDialog:tabLabel",`No label for settings tab \$\{(\i)\.id\}`\))/,
            replace: "default:if($self.tabLabel($2))return $self.tabLabel($2);$1"
          }
        ]
      },
      {
        // 头像菜单:Help 之前插入子菜单
        find: ['"user-dropdown.help"', "DropdownMenuSubTrigger"],
        replacement: {
          match: /(\(0,\i\.jsxs\)\(\i\.DropdownMenuSub,\{children:\[\(0,\i\.jsxs\)\(\i\.DropdownMenuSubTrigger,\{ref:\i,children:\[[^\]]{0,400}?"user-dropdown\.help")/,
          replace: "$self.renderAvatarMenu(),$1"
        }
      }
    ],
    navGroups,
    tabRegistry,
    tabLabel,
    renderAvatarMenu,
    openSettingsTab
  };

  // sites/grok/plugins/GrokMenus/index.js
  var NAME = "GrokMenus";
  var MENU_SLOTS = { conversation: "conversationMenu", message: "messageMenu", user: "userMenu" };
  var logger3 = null;
  var log2 = () => logger3 ??= new U.Logger(NAME, "#fdba74");
  var getContextMenuItems = (location2) => U.getSlotItems(MENU_SLOTS[location2]);
  var subscribeContextMenu = (fn2) => {
    const offs = Object.values(MENU_SLOTS).map((slot) => U.onSlotChange(slot, fn2));
    return () => offs.forEach((o3) => o3());
  };
  var getContextMenuVersion = () => U.getSlotVersion();
  var iconNode = (icon) => icon == null ? null : typeof icon === "function" ? h(icon, { size: 4 }) : icon;
  function run(def2, ctx) {
    try {
      (def2.onSelect ?? def2.onClick)?.(ctx);
    } catch (e3) {
      log2().error(`菜单项 ${def2.id} 出错`, e3);
    }
  }
  function DropdownItems({ location: location2, ctx, getCtx }) {
    useSubscription(subscribeContextMenu);
    const items = getContextMenuItems(location2);
    if (!items.length) return null;
    const Item = common.DropdownMenuItem;
    return h(Fragment, null, items.map((def2) => {
      const c3 = () => (getCtx ? getCtx() : ctx) ?? {};
      let el;
      if (def2.render) el = h(def2.render, c3());
      else if (Item) el = h(
        Item,
        { onClick: () => run(def2, c3()), "data-uspp-menu-item": def2.id },
        def2.icon != null && h("span", { className: "inline-flex me-2 text-fg-secondary" }, iconNode(def2.icon)),
        def2.label
      );
      else el = h("div", { role: "menuitem", tabIndex: -1, className: "uspp-btn uspp-btn-ghost", onClick: () => run(def2, c3()) }, iconNode(def2.icon), def2.label);
      return h(ErrorBoundary, { key: def2.id, fallback: null, label: `menu:${def2.id}` }, el);
    }));
  }
  function MessageItemsFromFiber() {
    const ref = useRef(null);
    const [, setReady] = useState(0);
    useLayoutEffect(() => {
      setReady(1);
    }, []);
    const getCtx = () => {
      const f3 = U.walkFiberUp(U.getFiber(ref.current), (f4) => {
        const p4 = f4.memoizedProps;
        return p4 && (p4.response?.responseId || p4.responseId && p4.conversationId);
      }, 400);
      const p3 = f3?.memoizedProps;
      return { response: p3?.response ?? (p3 ? { responseId: p3.responseId, conversationId: p3.conversationId } : void 0) };
    };
    return h(Fragment, null, h("span", { ref, hidden: true }), h(DropdownItems, { location: "message", getCtx }));
  }
  var extrasCache = /* @__PURE__ */ new Map();
  function conversationExtras(conversationId, base) {
    const ver = getContextMenuVersion();
    const hit = extrasCache.get(conversationId);
    if (hit && hit.base === base && hit.ver === ver) return hit.arr;
    const defs = getContextMenuItems("conversation");
    if (!defs.length) {
      extrasCache.delete(conversationId);
      return base;
    }
    const ctx = { conversationId };
    const mine = defs.map((def2) => ({
      id: `uspp-${def2.id}`,
      icon: def2.icon != null ? h("span", { className: "text-fg-secondary" }, iconNode(def2.icon)) : null,
      label: def2.render ? h(ErrorBoundary, { fallback: null }, h(def2.render, ctx)) : def2.label,
      onSelect: () => run(def2, ctx)
    }));
    const arr = [...Array.isArray(base) ? base : [], ...mine];
    extrasCache.set(conversationId, { base, ver, arr });
    if (extrasCache.size > 500) extrasCache.delete(extrasCache.keys().next().value);
    return arr;
  }
  var fallbacks2 = /* @__PURE__ */ new Set();
  function hookExport2(name, fn2) {
    const C4 = U.findExportedComponent(name);
    if (C4) fn2(C4);
    else U.waitFor((m3) => typeof m3[name] === "function" || m3[name] && typeof m3[name] === "object", (m3) => fn2(m3[name]));
  }
  function enableFallback2(kind) {
    if (fallbacks2.has(kind)) return;
    fallbacks2.add(kind);
    if (kind === "user") {
      hookExport2("SignoutIcon", (Signout) => whenCommon(["DropdownMenuItem"], (Item) => {
        U.addRenderHook(Item, (props, key, render) => {
          if (typeof props.onClick !== "function") return;
          const kids = U.asArray(props.children);
          const first = kids[0];
          if (!first || first.type !== "span" || !U.treeHas(first.props?.children, (el) => el.type === Signout, 2)) return;
          return h(Fragment, { key }, h(DropdownItems, { location: "user", ctx: {}, key: "uspp-user-items" }), render());
        });
      }));
      U.registerInjectionFallback(NAME, "头像菜单");
    } else if (kind === "conversation") {
      hookExport2("AppSidebarRow", (Row2) => U.addRenderHook(Row2, (props, key, render) => {
        const id = props.id;
        if (!id || props.route?.conversationId !== id || props.inset !== "text") return;
        return render({ ...props, menuExtras: conversationExtras(id, props.menuExtras) });
      }));
      U.registerInjectionFallback(NAME, "侧栏会话菜单");
    } else if (kind === "message") {
      hookExport2("MoreDotsHorIcon", (More) => whenCommon(["DropdownMenu", "DropdownMenuContent", "DropdownMenuItem"], (Menu, Content) => {
        U.addRenderHook(Menu, (props, key, render) => {
          const kids = U.asArray(props.children);
          if (kids.length !== 2) return;
          const [trigger, content] = kids;
          if (content?.type !== Content || content.props?.align !== "end") return;
          const items = U.asArray(content.props.children);
          const btn = trigger?.props?.render;
          const extra = h(MessageItemsFromFiber, { key: "uspp-message-items" });
          let nextContent = null;
          if (btn?.props?.icon === More && items.length === 1 && items[0]?.type === common.DropdownMenuItem) {
            nextContent = common.cloneElement(content, null, items[0], extra);
          } else if (content.props.side === "bottom" && Array.isArray(items[0]) && items[0].some((el) => el?.type === common.DropdownMenuItem)) {
            if (items.some((el) => el?.key === "uspp-message-items")) return;
            nextContent = common.cloneElement(content, null, ...items, extra);
          }
          if (!nextContent) return;
          return render({ ...props, children: [trigger, nextContent] });
        });
      }));
      U.registerInjectionFallback(NAME, "消息更多菜单");
    }
  }
  var offLost = null;
  var GrokMenus_default = () => U.definePlugin({
    name: NAME,
    description: "Shows plugin items in Grok's conversation, message and avatar menus.",
    authors: ["Userscript++"],
    required: true,
    hidden: true,
    patches: [
      {
        // 头像菜单:Sign Out 之前
        // 翻译词典模块里也有这个字符串,用第二个特征排除
        find: ['"user-dropdown.sign-out"', ".SignoutIcon"],
        replacement: {
          match: /(\(0,\i\.jsxs\)\(\i\.DropdownMenuItem,\{onClick:\i,children:\[\(0,\i\.jsx\)\("span",\{className:"inline-flex me-2 text-fg-secondary",children:\(0,\i\.jsx\)\(\i\.SignoutIcon)/,
          replace: "$self.renderUserItems(),$1"
        }
      },
      {
        // 侧栏会话的"更多"菜单和右键菜单共用 menuExtras
        find: '"ConversationItem",0,',
        replacement: {
          match: /(\.AppSidebarRow,\{\.\.\.(\i),)(extraRight:)/,
          replace: "$1menuExtras:$self.conversationExtras($2.id,$2.menuExtras),$3"
        }
      },
      {
        // 消息的"更多操作"下拉菜单末尾
        find: ['"response-action.more-actions"', "openReportDialog"],
        replacement: {
          match: /(\(0,\i\.jsx\)\(\i\.DropdownMenuContent,\{align:"end",children:)(\(0,\i\.jsx\)\(\i\.DropdownMenuItem,\{onClick:\(\)=>\{\i\.useReportStore\.getState\(\)\.openReportDialog\(\{responseId:(\i)\.responseId[^]*?\("response-action\.report","Report"\)\}\))\}\)/,
          replace: "$1$self.messageMenuChildren($2,$3)})"
        }
      },
      {
        // 列表版"更多操作"菜单(举报、导出 PDF、朗读等按配置生成)
        find: ['"response-action.more-actions"', '"more-actions-dropdown"'],
        replacement: {
          match: /(\(0,\i\.jsxs\)\(\i\.DropdownMenuContent,\{side:"bottom",align:"end",[^]{0,300}?children:\[)(\i\.map\(\((\i),\i\)=>[^]{0,600}?responseId:(\i)\.responseId)/,
          replace: "$1$self.renderMessageItems($4),$2"
        }
      }
    ],
    renderUserItems() {
      return h(DropdownItems, { key: "uspp-user-items", location: "user", ctx: {} });
    },
    renderMessageItems(response) {
      return h(DropdownItems, { key: "uspp-message-items", location: "message", ctx: { response } });
    },
    // 原菜单只有一个子元素;包进 Fragment,避免数组子元素缺 key
    messageMenuChildren(original, response) {
      return h(Fragment, null, original, this.renderMessageItems(response));
    },
    conversationExtras,
    start() {
      offLost = U.onPatchBypassed(NAME, (results) => {
        for (const r3 of results) {
          if (r3.find.includes("sign-out")) enableFallback2("user");
          else if (r3.find.includes("ConversationItem")) enableFallback2("conversation");
          else if (r3.find.includes("more-actions")) enableFallback2("message");
        }
      });
    },
    stop() {
      offLost?.();
    }
  });

  // sites/grok/styles.js
  var GROK_CSS = `
:root, :root[data-uspp-theme] { --uspp-surface-base:var(--surface-base);--uspp-surface-l1:var(--surface-l1);--uspp-surface-l2:var(--surface-l2);--uspp-surface-l3:var(--surface-l3);--uspp-fg-primary:var(--fg-primary);--uspp-fg-secondary:var(--fg-secondary);--uspp-fg-tertiary:var(--fg-tertiary);--uspp-fg-danger:var(--fg-danger);--uspp-border-l1:var(--border-l1);--uspp-border-l2:var(--border-l2);--uspp-ring:var(--ring);--uspp-button-ghost-hover:var(--button-ghost-hover); }
.uspp-chatbar { display: inline-flex; align-items: center; gap: 2px; }
.uspp-chatbar-btn { display: inline-flex; align-items: center; justify-content: center; min-width: 36px; height: 36px; padding: 0 8px; border-radius: 9999px; border: none; background: transparent; color: var(--uspp-fg-secondary); cursor: pointer; font: inherit; }
.uspp-chatbar-btn:hover:not(:disabled) { background: var(--uspp-button-ghost-hover); color: var(--uspp-fg-primary); }
.uspp-chatbar-btn[data-active="true"] { color: var(--uspp-fg-primary); background: var(--uspp-button-ghost-hover); }
.uspp-chatbar-btn:disabled { opacity: .4; cursor: default; }
.uspp-popover { position: fixed; z-index: 2147483001; min-width: 160px; padding: 8px; border-radius: 14px; background: var(--uspp-surface-l2); color: var(--uspp-fg-primary); border: 1px solid var(--uspp-border-l1); box-shadow: 0 8px 32px rgb(0 0 0 / .25); }
`;

  // sites/grok/index.js
  var asList = (v3) => v3 == null ? [] : Array.isArray(v3) ? v3 : [v3];
  var grok_default = (U4) => {
    bindApi(U4);
    const menuSlot = (location2) => {
      const slot = MENU_SLOTS[location2];
      if (!slot) throw new Error(`未知的菜单位置:${location2}`);
      return slot;
    };
    return U4.defineSite({
      id: "grok",
      name: "Grok",
      matches: ["*://grok.com/*"],
      driver: "turbopack",
      driverOptions: { chunkPath: "/_next/static/chunks/" },
      // 路由 store 出现即视为宿主就绪(原"模块稳定")
      ready: { module: (m3) => typeof m3?.useRoutingStore === "function", timeout: 15e3 },
      // 样式放在 <head> 的容器里,方便在开发者工具里查看
      styleHost: "element",
      // 旧版把主题和 Quick CSS 存在系统数据顶层,它们迁到本站分区
      legacySettings: true,
      theme: () => document.documentElement.classList.contains("dark") ? "dark" : "light",
      renderer() {
        const React = common.React, client = common.ReactDOMClient, dom = common.ReactDOM;
        if (!React || typeof client?.createRoot !== "function") return null;
        return { React, createRoot: (el) => client.createRoot(el), createPortal: dom?.createPortal, flushSync: dom?.flushSync ?? ((fn2) => fn2()) };
      },
      components: (name) => (name === "toast" ? common.Toaster : common[name]) ?? null,
      common,
      events: ["streamEnd"],
      slots: [
        { name: "chatBar", kind: "button", context: '点击事件;按钮可用 locations: ["chat", "imagine"] 选择出现在哪个输入栏' },
        { name: "conversationMenu", kind: "menu", context: "{ conversationId }" },
        { name: "messageMenu", kind: "menu", context: "{ response: { responseId, conversationId, ... } }" },
        { name: "userMenu", kind: "menu", context: "{}" }
      ],
      settingsHost,
      // 旧插件字段 chatBarButton / contextMenuItems 映射到本站注入点
      pluginAliases: {
        chatBarButton: (v3) => ({ chatBar: v3 }),
        contextMenuItems: (v3) => Object.fromEntries(Object.entries(MENU_SLOTS).map(([loc, slot]) => [slot, asList(v3?.[loc])]).filter(([, l3]) => l3.length))
      },
      // 旧接口名(只在 Grok 上有实际效果)
      api: {
        common,
        addChatBarButton: (id, def2) => U4.addSlotItem("chatBar", id, def2),
        removeChatBarButton: (id) => U4.removeSlotItem("chatBar", id),
        addContextMenuItem: (location2, id, def2) => U4.addSlotItem(menuSlot(location2), id, def2),
        removeContextMenuItem: (location2, id) => U4.removeSlotItem(menuSlot(location2), id)
      },
      start() {
        U4.registerStyle("uspp-grok", GROK_CSS);
        startStreamEvents();
        installSettingsFallbacks();
      }
    });
  };

  // sites/grok/plugins/GrokChatBar/index.js
  var NAME2 = "GrokChatBar";
  var SLOT = "chatBar";
  var val = (v3) => typeof v3 === "function" ? v3() : v3;
  var nodeOf = (v3) => v3 == null ? null : typeof v3 === "function" ? v3() : v3;
  function Popover({ anchor, content, onClose }) {
    const ref = useRef(null);
    const [pos, setPos] = useState(null);
    useEffect(() => {
      const r3 = anchor.getBoundingClientRect();
      setPos({ left: Math.max(8, Math.min(r3.left, innerWidth - 260)), bottom: innerHeight - r3.top + 8 });
      const onDown = (e3) => {
        if (!ref.current?.contains(e3.target) && !anchor.contains(e3.target)) onClose();
      };
      const onKey = (e3) => {
        if (e3.key === "Escape") onClose();
      };
      document.addEventListener("pointerdown", onDown, true);
      document.addEventListener("keydown", onKey, true);
      return () => {
        document.removeEventListener("pointerdown", onDown, true);
        document.removeEventListener("keydown", onKey, true);
      };
    }, []);
    const RD = common.ReactDOM;
    const el = h("div", { ref, className: "uspp-popover", style: pos ? { left: pos.left, bottom: pos.bottom } : { visibility: "hidden" } }, content);
    return RD?.createPortal ? RD.createPortal(el, document.body) : el;
  }
  function ChatBarButton({ def: def2 }) {
    const [open2, setOpen] = useState(false);
    const ref = useRef(null);
    const disabled = !!val(def2.disabled);
    const active = !!val(def2.active);
    const icon = nodeOf(def2.icon);
    const tooltip = nodeOf(def2.tooltip);
    const label = def2["aria-label"] ?? (typeof tooltip === "string" ? tooltip : def2.id);
    const onClick = (e3) => {
      try {
        (def2.onClick ?? def2.onSelect)?.(e3);
      } catch (err) {
        console.error("[Userscript++] 聊天栏按钮 onClick 出错", err);
      }
      if (def2.popover) setOpen((o3) => !o3);
    };
    const IB = common.IconButton;
    const fallback = h("button", {
      ref,
      type: "button",
      className: U.classes("uspp-chatbar-btn", def2.className),
      "data-active": String(active),
      "aria-label": label,
      title: typeof tooltip === "string" ? tooltip : void 0,
      disabled,
      onClick
    }, icon ?? def2.label);
    const btn = IB ? h("span", { ref, style: { display: "inline-flex" } }, h(ErrorBoundary, { fallback }, h(IB, {
      variant: def2.variant ?? "ghost",
      size: def2.size ?? "lg",
      shape: def2.shape ?? "circle",
      "aria-label": label,
      tooltip: tooltip ? { content: tooltip } : void 0,
      disabled,
      onClick,
      "aria-pressed": active || void 0,
      className: def2.className,
      "data-uspp-chatbar-button": def2.id
    }, icon ?? def2.label))) : fallback;
    return h(Fragment, null, btn, open2 && ref.current && h(Popover, { anchor: ref.current, content: nodeOf(def2.popover), onClose: () => setOpen(false) }));
  }
  var subscribeChatBar = slotSubscriber(SLOT);
  var buttonsAt = (location2) => U.getSlotItems(SLOT).filter((b3) => (b3.locations && b3.locations.length ? b3.locations : ["chat"]).includes(location2));
  function ChatBarButtons({ location: location2 }) {
    useSubscription(subscribeChatBar);
    const buttons = buttonsAt(location2);
    if (!buttons.length) return null;
    return h(
      "div",
      { className: "uspp-chatbar", "data-uspp-chatbar": location2 },
      buttons.map((b3) => h(ErrorBoundary, { key: b3.id, fallback: null, label: `chatbar:${b3.id}` }, h(ChatBarButton, { def: b3 })))
    );
  }
  var fallbacks3 = { chat: false, imagine: false };
  function enableFallback3(kind) {
    if (fallbacks3[kind]) return;
    fallbacks3[kind] = true;
    if (kind === "chat") {
      const attach = (ModeSelect) => U.addRenderHook(ModeSelect, (props, key, render) => {
        if (props.enableModeSwitchHotkey !== true || props.desktop !== void 0) return;
        return h(Fragment, { key }, render(), h(ChatBarButtons, { location: "chat", key: "uspp-chatbar-chat" }));
      });
      const C4 = U.findExportedComponent("ModeSelect");
      if (C4) attach(C4);
      else U.waitFor((m3) => typeof m3.ModeSelect === "function", (m3) => attach(m3.ModeSelect));
      U.registerInjectionFallback(NAME2, "主输入框");
    } else {
      const attach = (Toolbar) => U.addRenderHook(Toolbar, (props, key, render) => render({ ...props, children: [props.children, h(ChatBarButtons, { location: "imagine", key: "uspp-chatbar-imagine" })] }));
      const C4 = U.findExportedComponent("ImagineToolbar");
      if (C4) attach(C4);
      else U.waitFor((m3) => typeof m3.ImagineToolbar === "function", (m3) => attach(m3.ImagineToolbar));
      U.registerInjectionFallback(NAME2, "Imagine 输入栏");
    }
  }
  var offLost2 = null;
  var GrokChatBar_default = () => U.definePlugin({
    name: NAME2,
    description: "Shows plugin buttons in the Grok composer and the Imagine prompt bar.",
    authors: ["Userscript++"],
    required: true,
    hidden: true,
    patches: [
      {
        find: '"data-query-bar-mode-select":!0',
        replacement: {
          match: /("data-query-bar-mode-select":!0,[^]{0,900}?\},"mode-select"\),)/,
          replace: '$1$self.renderChatBar("chat"),'
        }
      },
      {
        // Imagine 页面的分块只在进入 Imagine 时加载,其他页面找不到属正常
        find: '"ImagineToolbar",0,',
        noWarn: true,
        replacement: {
          match: /(\(0,\i\.jsxs\)\(\i,\{collapsed:\i,children:\[(?:\i,){3,15}\i)\]\}\)/,
          replace: '$1,$self.renderChatBar("imagine")]})'
        }
      }
    ],
    renderChatBar(location2) {
      return h(ErrorBoundary, { key: `uspp-chatbar-${location2}`, fallback: null, label: "chatbar" }, h(ChatBarButtons, { location: location2 }));
    },
    start() {
      U.ensureUiRoot();
      offLost2 = U.onPatchBypassed(NAME2, (results) => {
        for (const r3 of results) enableFallback3(r3.find.includes("ImagineToolbar") ? "imagine" : "chat");
      });
    },
    stop() {
      offLost2?.();
    }
  });

  // uspp:sites
  var sites_default = [{ id: "grok", site: grok_default, plugins: [((U4) => {
    const d3 = typeof GrokChatBar_default === "function" ? GrokChatBar_default(U4) : GrokChatBar_default;
    d3.site = "grok";
    return d3;
  }), ((U4) => {
    const d3 = typeof GrokMenus_default === "function" ? GrokMenus_default(U4) : GrokMenus_default;
    d3.site = "grok";
    return d3;
  })] }];

  // uspp:plugins
  var plugins_default = [];

  // core/lib/logger.js
  var COLORS = { log: "#a78bfa", info: "#38bdf8", warn: "#f59e0b", error: "#ef4444", debug: "#9ca3af" };
  var Logger = class {
    constructor(name, color = "#a78bfa") {
      this.name = name;
      this.color = color;
    }
    _out(level, args) {
      if (level === "debug" && !IS_DEV) return;
      const fn2 = console[level] || console.log;
      fn2.call(
        console,
        `%c Userscript++ %c %c ${this.name} `,
        `background:${COLORS[level]};color:#000;border-radius:4px 0 0 4px;font-weight:bold`,
        "",
        `background:${this.color};color:#000;border-radius:0 4px 4px 0`,
        ...args
      );
    }
    log(...a3) {
      this._out("log", a3);
    }
    info(...a3) {
      this._out("info", a3);
    }
    warn(...a3) {
      this._out("warn", a3);
    }
    error(...a3) {
      this._out("error", a3);
    }
    debug(...a3) {
      this._out("debug", a3);
    }
  };

  // core/lib/utils.js
  var sleep = (ms) => new Promise((r3) => setTimeout(r3, ms));
  function debounce(fn2, ms = 100) {
    let t3;
    const d3 = function(...args) {
      clearTimeout(t3);
      t3 = setTimeout(() => fn2.apply(this, args), ms);
    };
    d3.flush = () => {
      clearTimeout(t3);
      fn2();
    };
    d3.cancel = () => clearTimeout(t3);
    return d3;
  }
  function onlyOnce(fn2) {
    let done = false, result;
    return function(...args) {
      if (done) return result;
      done = true;
      return result = fn2.apply(this, args);
    };
  }
  var escapeRegExp = (s3) => String(s3).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function humanizeKey(key) {
    return String(key).replace(/[-_]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").trim().split(/\s+/).map((w4) => w4.charAt(0).toUpperCase() + w4.slice(1)).join(" ");
  }
  function classNameFactory(prefix = "") {
    return (...names) => names.flat(Infinity).filter(Boolean).map((n2) => prefix + n2).join(" ");
  }
  function classes(...names) {
    const out = [];
    for (const n2 of names.flat(Infinity)) {
      if (!n2) continue;
      if (typeof n2 === "object") {
        for (const k4 in n2) if (n2[k4]) out.push(k4);
      } else out.push(String(n2));
    }
    return out.join(" ");
  }
  async function copyToClipboard(text) {
    if (GM.clipboard) {
      try {
        const r3 = GM.clipboard(String(text), "text");
        if (r3 && typeof r3.then === "function") await r3;
        return true;
      } catch {
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
      }
      ta.remove();
      return ok;
    }
  }

  // core/lib/lazy.js
  function makeLazy(factory, attempts = 5) {
    let tries = 0, cache2;
    return () => {
      if (cache2 == null && tries++ < attempts) cache2 = factory();
      return cache2;
    };
  }
  function proxyLazy(factory, shouldRetry = () => true) {
    let resolved = false, value;
    const resolve = () => {
      if (!resolved && shouldRetry()) {
        value = factory();
        if (value != null) resolved = true;
      }
      return value;
    };
    const target2 = () => {
    };
    return new Proxy(target2, {
      get(_3, key) {
        if (key === "$$usppResolve") return resolve;
        const real = resolve();
        if (real == null) return void 0;
        return Reflect.get(real, key);
      },
      set(_3, key, v3) {
        const real = resolve();
        if (real == null) return false;
        return Reflect.set(real, key, v3);
      },
      has(_3, key) {
        const real = resolve();
        return real != null && Reflect.has(real, key);
      },
      ownKeys() {
        const real = resolve();
        const keys = real == null ? [] : Reflect.ownKeys(real).filter((k4) => k4 !== "length" && k4 !== "name");
        return [...keys, "length", "name"];
      },
      getOwnPropertyDescriptor(_3, key) {
        if (key === "length" || key === "name") return Reflect.getOwnPropertyDescriptor(target2, key);
        const real = resolve();
        if (real == null) return void 0;
        const d3 = Reflect.getOwnPropertyDescriptor(real, key);
        if (d3) d3.configurable = true;
        return d3;
      },
      deleteProperty(_3, key) {
        const real = resolve();
        return real != null && Reflect.deleteProperty(real, key);
      },
      apply(_3, thisArg, args) {
        const real = resolve();
        if (typeof real !== "function") throw new Error("Userscript++: 懒加载的值尚未找到");
        return Reflect.apply(real, thisArg, args);
      },
      getPrototypeOf() {
        const real = resolve();
        return real == null ? Function.prototype : Reflect.getPrototypeOf(real);
      }
    });
  }

  // core/lib/match.js
  var reCache = /* @__PURE__ */ new Map();
  var globToRe = (s3, any) => s3.split("*").map((x4) => x4.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(any);
  function compile(pattern) {
    const p3 = String(pattern || "").trim();
    if (!p3) return null;
    if (p3 === "*" || p3 === "<all_urls>" || p3 === "*://*/*") return /^/;
    const m3 = /^(\*|https?|file):\/\/([^/]*)(\/.*)?$/.exec(p3);
    if (!m3) {
      const h5 = p3.replace(/^\*\./, "");
      return new RegExp(`^https?://([^/]*\\.)?${globToRe(h5, "[^/]*")}(?::\\d+)?(/|$)`, "i");
    }
    const [, scheme, hostPat, path = "/*"] = m3;
    const sch = scheme === "*" ? "https?" : scheme;
    let hostRe;
    if (hostPat === "*") hostRe = "[^/]*";
    else if (hostPat.startsWith("*.")) hostRe = `([^/]*\\.)?${globToRe(hostPat.slice(2), "[^/]*")}`;
    else hostRe = globToRe(hostPat, "[^/]*");
    return new RegExp(`^${sch}://${hostRe}(?::\\d+)?${globToRe(path, ".*")}$`, "i");
  }
  function matchPattern(pattern, url = location.href) {
    let re = reCache.get(pattern);
    if (re === void 0) {
      re = compile(pattern);
      reCache.set(pattern, re);
    }
    return !!re && re.test(url);
  }
  function matchesUrl(patterns, url = location.href) {
    const list = Array.isArray(patterns) ? patterns : typeof patterns === "string" ? [patterns] : [];
    return list.some((p3) => matchPattern(p3, url));
  }
  function specificity(pattern) {
    const p3 = String(pattern || "");
    if (p3 === "*" || p3 === "<all_urls>") return 0;
    const m3 = /^[^:]+:\/\/([^/]*)(\/.*)?$/.exec(p3);
    const host2 = m3 ? m3[1] : p3;
    const path = m3 ? m3[2] || "" : "";
    return (host2.includes("*") ? 0 : 1e4) + host2.replace(/\*/g, "").length * 10 + path.replace(/\*/g, "").length;
  }

  // core/lib/sites.js
  var logger4 = new Logger("Sites", "#5eead4");
  var GENERIC = Object.freeze({ id: "generic", name: "Generic", matches: [], generic: true });
  var registry = /* @__PURE__ */ new Map();
  var current = null;
  var runtimeSwitchListeners = /* @__PURE__ */ new Set();
  var ID_RE = /^[a-z0-9-]+$/;
  function defineSite(def2) {
    if (!def2 || typeof def2 !== "object") throw new Error("defineSite 需要一个对象");
    if (!ID_RE.test(def2.id || "")) throw new Error(`站点 ID 只能是小写字母、数字和 -:${def2.id}`);
    if (def2.id === GENERIC.id) throw new Error("generic 是保留的站点 ID");
    if (!def2.name) throw new Error(`站点 ${def2.id} 缺少 name`);
    if (!Array.isArray(def2.matches) || !def2.matches.length) throw new Error(`站点 ${def2.id} 缺少 matches`);
    return def2;
  }
  function addSite(def2, { runtime: runtime2 = false } = {}) {
    defineSite(def2);
    if (registry.has(def2.id)) {
      logger4.warn(`站点 ${def2.id} 已注册,忽略`);
      return false;
    }
    if (runtime2 && def2.driver) {
      logger4.warn(`运行时注册的站点 ${def2.id} 不能使用打包器驱动,已忽略 driver`);
      def2 = { ...def2, driver: void 0 };
    }
    registry.set(def2.id, def2);
    return true;
  }
  var score = (def2, url) => {
    if (!matchesUrl(def2.matches, url)) return -1;
    if (def2.excludeMatches && matchesUrl(def2.excludeMatches, url)) return -1;
    return Math.max(...def2.matches.filter((p3) => matchesUrl([p3], url)).map(specificity));
  };
  function pickSite(url = location.href, candidates2 = [...registry.values()]) {
    let best = null, bestScore = -1, tie = false;
    for (const def2 of candidates2) {
      const s3 = score(def2, url);
      if (s3 < 0) continue;
      if (s3 > bestScore) {
        best = def2;
        bestScore = s3;
        tie = false;
      } else if (s3 === bestScore) tie = true;
    }
    if (best && tie) logger4.warn(`多个站点同样匹配当前网址,使用 ${best.id}`);
    return best;
  }
  function selectSite(url = location.href) {
    current = pickSite(url) || GENERIC;
    return current;
  }
  var getSite = () => current || GENERIC;
  var isGeneric = () => getSite() === GENERIC;
  var isSite = (id) => getSite().id === id;
  var getSites = () => [...registry.values()];
  var getSiteById = (id) => registry.get(id) || (id === GENERIC.id ? GENERIC : null);
  var siteKey = () => isGeneric() ? location.hostname || "local" : getSite().id;
  function switchTo(def2) {
    if (!isGeneric() || current === def2) return false;
    if (pickSite(location.href, [def2]) !== def2) return false;
    current = def2;
    for (const fn2 of [...runtimeSwitchListeners]) {
      try {
        fn2(def2);
      } catch (e3) {
        logger4.error("站点切换监听者出错", e3);
      }
    }
    return true;
  }

  // core/lib/events.js
  var logger5 = new Logger("Events", "#fde68a");
  var handlers = /* @__PURE__ */ new Map();
  var Events = Object.freeze({
    PLUGIN_TOGGLE: "pluginToggle",
    PLUGIN_PIN: "pluginPin",
    PLUGIN_STAR: "pluginStar",
    RELOAD_NEEDED: "reloadNeeded",
    SETTINGS_SYNC: "settingsSync",
    SITE_READY: "siteReady",
    ROUTE_CHANGE: "routeChange"
  });
  var CORE = new Set(Object.values(Events));
  var siteEvents = /* @__PURE__ */ new Set();
  function setSiteEvents(list) {
    siteEvents = new Set(Array.isArray(list) ? list : []);
  }
  var isKnownEvent = (name) => CORE.has(name) || siteEvents.has(name);
  function subscribe(event, handler) {
    if (!isKnownEvent(event)) logger5.debug(`订阅了当前站点没有声明的事件 ${event}`);
    let set = handlers.get(event);
    if (!set) handlers.set(event, set = /* @__PURE__ */ new Set());
    set.add(handler);
    return () => set.delete(handler);
  }
  function dispatch(event, data) {
    const set = handlers.get(event);
    if (!set) return;
    for (const h5 of [...set]) {
      try {
        h5(data);
      } catch (e3) {
        logger5.error(`事件 ${event} 的处理函数出错`, e3);
      }
    }
  }

  // core/lib/settings.js
  var logger6 = new Logger("Settings", "#86efac");
  var STORAGE_KEY = "UserscriptPPSettings";
  var IDB_NAME = "UserscriptPP";
  var IDB_STORE = "kv";
  var BIGINT_TAG = "$usppBigint";
  var PlainSettings = { plugins: {} };
  var defaultResolver = () => void 0;
  function setDefaultResolver(fn2) {
    defaultResolver = fn2;
  }
  var ready = false;
  var globalListeners = /* @__PURE__ */ new Set();
  var pathListeners = /* @__PURE__ */ new Map();
  var prefixListeners = /* @__PURE__ */ new Map();
  function addTo(map, key, fn2) {
    let s3 = map.get(key);
    if (!s3) map.set(key, s3 = /* @__PURE__ */ new Set());
    s3.add(fn2);
  }
  function callSafe(fn2, ...args) {
    try {
      fn2(...args);
    } catch (e3) {
      logger6.error("设置监听者出错", e3);
    }
  }
  var dirty = /* @__PURE__ */ new Set();
  function emitChange(path, value) {
    for (const fn2 of [...globalListeners]) callSafe(fn2, value, path);
    const exact = pathListeners.get(path);
    if (exact) for (const fn2 of [...exact]) callSafe(fn2, value, path);
    for (const [prefix, set] of prefixListeners) {
      if (path.startsWith(prefix)) {
        for (const fn2 of [...set]) callSafe(fn2, value, path);
      }
    }
  }
  function notify(path, value) {
    emitChange(path, value);
    if (ready) dirty.add(path);
    scheduleSave();
  }
  var SettingsStore = {
    addChangeListener(path, fn2) {
      addTo(pathListeners, path, fn2);
    },
    removeChangeListener(path, fn2) {
      pathListeners.get(path)?.delete(fn2);
    },
    addPrefixChangeListener(prefix, fn2) {
      addTo(prefixListeners, prefix, fn2);
    },
    removePrefixChangeListener(prefix, fn2) {
      prefixListeners.get(prefix)?.delete(fn2);
    },
    addGlobalChangeListener(fn2) {
      globalListeners.add(fn2);
    },
    removeGlobalChangeListener(fn2) {
      globalListeners.delete(fn2);
    },
    markAsChanged() {
      for (const fn2 of [...globalListeners]) callSafe(fn2, PlainSettings, "");
      scheduleSave();
    }
  };
  var RAW = Symbol("uspp.raw");
  var proxyCache = /* @__PURE__ */ new WeakMap();
  function makeProxy(obj, path) {
    let byPath = proxyCache.get(obj);
    if (!byPath) proxyCache.set(obj, byPath = /* @__PURE__ */ new Map());
    const cached = byPath.get(path);
    if (cached) return cached;
    const proxy = new Proxy(obj, {
      get(target2, key, receiver) {
        if (key === RAW) return target2;
        if (typeof key === "symbol") return Reflect.get(target2, key, receiver);
        let v3 = target2[key];
        const full = path ? `${path}.${key}` : key;
        if (v3 === void 0) {
          const parts = full.split(".");
          if (parts.length === 3 && parts[0] === "plugins") {
            const def2 = defaultResolver(parts[1], parts[2]);
            if (def2 !== void 0) {
              target2[key] = def2;
              v3 = def2;
            }
          }
        }
        if (v3 !== null && typeof v3 === "object" && !(v3 instanceof Date)) return makeProxy(v3, full);
        return v3;
      },
      set(target2, key, value) {
        if (typeof key === "symbol") return Reflect.set(target2, key, value);
        if (value && typeof value === "object" && value[RAW]) value = value[RAW];
        if (Object.is(target2[key], value) && key in target2) return true;
        target2[key] = value;
        notify(path ? `${path}.${key}` : key, value);
        return true;
      },
      deleteProperty(target2, key) {
        if (!(key in target2)) return true;
        delete target2[key];
        if (typeof key !== "symbol") notify(path ? `${path}.${key}` : key, void 0);
        return true;
      }
    });
    byPath.set(path, proxy);
    return proxy;
  }
  var Settings = makeProxy(PlainSettings, "");
  function replacer(_3, v3) {
    return typeof v3 === "bigint" ? { [BIGINT_TAG]: v3.toString() } : v3;
  }
  function reviver(_3, v3) {
    if (v3 && typeof v3 === "object" && typeof v3[BIGINT_TAG] === "string" && Object.keys(v3).length === 1) {
      try {
        return BigInt(v3[BIGINT_TAG]);
      } catch {
        return 0n;
      }
    }
    return v3;
  }
  var serialize = (obj) => JSON.stringify(obj, replacer);
  function parseStored(raw2) {
    try {
      let v3 = raw2;
      for (let i3 = 0; i3 < 3 && typeof v3 === "string"; i3++) v3 = JSON.parse(v3, reviver);
      if (v3 && typeof v3 === "object" && !Array.isArray(v3)) {
        v3 = JSON.parse(JSON.stringify(v3), reviver);
        if (v3.plugins && typeof v3.plugins === "object" && Object.keys(v3.plugins).length > 0) return v3;
      }
    } catch {
    }
    return null;
  }
  function idbOpen() {
    return new Promise((resolve, reject) => {
      const idb = W.indexedDB || window.indexedDB;
      if (!idb) return reject(new Error("no indexedDB"));
      const req = idb.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGet(key) {
    const db = await idbOpen();
    try {
      return await new Promise((resolve, reject) => {
        const r3 = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
        r3.onsuccess = () => resolve(r3.result);
        r3.onerror = () => reject(r3.error);
      });
    } finally {
      db.close();
    }
  }
  async function idbSet(key, value) {
    const db = await idbOpen();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }
  function lsGet() {
    try {
      return (W.localStorage || localStorage).getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }
  function replaceContents(data) {
    for (const k4 of Object.keys(PlainSettings)) delete PlainSettings[k4];
    Object.assign(PlainSettings, data);
    if (!PlainSettings.plugins || typeof PlainSettings.plugins !== "object") PlainSettings.plugins = {};
  }
  function mergeMissing(into, from) {
    for (const k4 of Object.keys(from)) {
      if (!(k4 in into)) into[k4] = from[k4];
      else if (into[k4] && from[k4] && typeof into[k4] === "object" && typeof from[k4] === "object" && !Array.isArray(into[k4])) mergeMissing(into[k4], from[k4]);
    }
    return into;
  }
  function loadSync() {
    if (!GM.get) return false;
    try {
      const raw2 = GM.get(STORAGE_KEY);
      if (raw2 && typeof raw2.then === "function") return false;
      const data = parseStored(raw2);
      if (data) {
        replaceContents(data);
        return true;
      }
    } catch (e3) {
      logger6.warn("同步读取设置失败", e3);
    }
    return false;
  }
  function richness(v3, key) {
    if (key === "enabled") return 0;
    if (Array.isArray(v3)) return 1 + v3.reduce((n2, x4) => n2 + richness(x4), 0);
    if (v3 && typeof v3 === "object") return 1 + Object.keys(v3).reduce((n2, k4) => n2 + richness(v3[k4], k4), 0);
    if (v3 === "" || v3 == null) return 0;
    return 1;
  }
  var isEmpty = (v3) => v3 == null || v3 === "" || Array.isArray(v3) && v3.length === 0 || typeof v3 === "object" && !Array.isArray(v3) && Object.keys(v3).length === 0;
  function fillFrom(into, from) {
    for (const k4 of Object.keys(from)) {
      const a3 = into[k4], b3 = from[k4];
      if (!(k4 in into) || isEmpty(a3) && !isEmpty(b3)) into[k4] = b3;
      else if (a3 && b3 && typeof a3 === "object" && typeof b3 === "object" && !Array.isArray(a3) && !Array.isArray(b3)) fillFrom(a3, b3);
    }
    return into;
  }
  var useSiteStorage = () => !isGeneric();
  async function loadAsync() {
    const sources = [["GM", async () => GM.get ? await GM.get(STORAGE_KEY) : null]];
    if (useSiteStorage()) sources.push(["IndexedDB", () => idbGet(STORAGE_KEY)], ["localStorage", lsGet]);
    const found = [];
    for (const [name, read] of sources) {
      try {
        const data = parseStored(await read());
        if (data) found.push({ name, data, score: richness(data) });
      } catch (e3) {
        logger6.debug(`从 ${name} 读取失败`, e3);
      }
    }
    if (found.length) {
      found.sort((a3, b3) => b3.score - a3.score);
      const data = found[0].data;
      for (const f3 of found.slice(1)) fillFrom(data, f3.data);
      const memory = JSON.parse(serialize(PlainSettings), reviver);
      replaceContents(mergeMissing(data, memory));
      logger6.info(`设置已从 ${found.map((f3) => f3.name).join(" + ")} 读取`);
    }
    ready = true;
    return found.length > 0;
  }
  var underDirty = (path) => {
    for (const d3 of dirty) if (d3 === path || d3.startsWith(path + ".") || path.startsWith(d3 + ".")) return true;
    return false;
  };
  function applyRemote(data) {
    if (!ready || !data || typeof data !== "object") return 0;
    const changedPaths = [];
    const walk = (target2, src, path) => {
      for (const k4 of Object.keys(src)) {
        const full = path ? `${path}.${k4}` : k4;
        const a3 = target2[k4], b3 = src[k4];
        if (a3 && b3 && typeof a3 === "object" && typeof b3 === "object" && !Array.isArray(a3) && !Array.isArray(b3)) {
          walk(a3, b3, full);
          continue;
        }
        if (underDirty(full)) continue;
        if (JSON.stringify(a3, replacer) === JSON.stringify(b3, replacer)) continue;
        target2[k4] = b3;
        changedPaths.push(full);
        emitChange(full, b3);
      }
    };
    walk(PlainSettings, data, "");
    if (changedPaths.length) {
      logger6.debug(`已从其他标签页同步 ${changedPaths.length} 项设置`);
      dispatch(Events.SETTINGS_SYNC, { paths: changedPaths });
    }
    return changedPaths.length;
  }
  function replaceAll(data) {
    const before = JSON.parse(serialize(PlainSettings), reviver);
    replaceContents(data);
    const paths = [];
    const diff = (a3, b3, path) => {
      const isObj = (v3) => v3 && typeof v3 === "object" && !Array.isArray(v3);
      if (isObj(a3) && isObj(b3)) {
        for (const k4 of /* @__PURE__ */ new Set([...Object.keys(a3), ...Object.keys(b3)])) diff(a3[k4], b3[k4], path ? `${path}.${k4}` : k4);
        return;
      }
      if (JSON.stringify(a3, replacer) !== JSON.stringify(b3, replacer)) paths.push(path);
    };
    diff(before, PlainSettings, "");
    for (const path of paths) {
      const v3 = path.split(".").reduce((o3, k4) => o3 == null ? void 0 : o3[k4], PlainSettings);
      emitChange(path, v3);
      if (ready) dirty.add(path);
    }
    scheduleSave();
    return paths.length;
  }
  var syncInstalled = false;
  function installCrossTabSync() {
    if (syncInstalled) return;
    syncInstalled = true;
    if (GM.addListener) {
      try {
        GM.addListener(STORAGE_KEY, (_name, _old, value, remote) => {
          if (!remote) return;
          const data = parseStored(value);
          if (data) applyRemote(data);
        });
      } catch (e3) {
        logger6.debug("监听脚本管理器存储失败", e3);
      }
    }
    if (useSiteStorage()) {
      W.addEventListener("storage", (e3) => {
        if (e3.key !== STORAGE_KEY || e3.newValue == null) return;
        const data = parseStored(e3.newValue);
        if (data) applyRemote(data);
      });
    }
  }
  async function saveNow() {
    if (!ready) return;
    if (!PlainSettings.plugins || Object.keys(PlainSettings.plugins).length === 0) return;
    let json;
    try {
      json = serialize(PlainSettings);
    } catch (e3) {
      logger6.warn("设置序列化失败", e3);
      return;
    }
    dirty.clear();
    pendingSave = false;
    if (GM.set) {
      try {
        try {
          const r3 = GM.set(STORAGE_KEY, JSON.parse(json));
          if (r3 && typeof r3.then === "function") await r3;
        } catch {
          const r3 = GM.set(STORAGE_KEY, json);
          if (r3 && typeof r3.then === "function") await r3;
        }
      } catch (e3) {
        logger6.warn("写入设置失败", e3);
      }
    }
    if (!useSiteStorage()) return;
    try {
      (W.localStorage || localStorage).setItem(STORAGE_KEY, json);
    } catch (e3) {
      logger6.debug("写入 localStorage 备份失败", e3);
    }
    try {
      await idbSet(STORAGE_KEY, json);
    } catch (e3) {
      logger6.debug("写入 IndexedDB 备份失败", e3);
    }
  }
  var pendingSave = false;
  var debouncedSave = debounce(() => {
    saveNow();
  }, 100);
  var scheduleSave = Object.assign(() => {
    pendingSave = true;
    debouncedSave();
  }, { cancel: () => debouncedSave.cancel() });
  function installUnloadSave() {
    const flush2 = () => {
      if (!pendingSave) return;
      scheduleSave.cancel();
      saveNow();
    };
    W.addEventListener("beforeunload", flush2);
    W.addEventListener("pagehide", flush2);
  }

  // core/lib/patches.js
  var logger7 = new Logger("Patcher", "#c4b5fd");
  var IDENT = "(?:[A-Za-z_$][\\w$]*)";
  function expandIdent(source) {
    let out = "";
    for (let i3 = 0; i3 < source.length; i3++) {
      const c3 = source[i3];
      if (c3 === "\\") {
        const n2 = source[i3 + 1];
        if (n2 === "i") out += IDENT;
        else out += c3 + (n2 ?? "");
        i3++;
      } else out += c3;
    }
    return out;
  }
  function canonicalizeRegex(re) {
    if (!(re instanceof RegExp)) return re;
    if (re.$$usppCanonical) return re;
    const expanded = new RegExp(expandIdent(re.source), re.flags);
    const original = re.toString();
    Object.defineProperty(expanded, "toString", { value: () => original, configurable: true });
    Object.defineProperty(expanded, "$$usppCanonical", { value: true });
    return expanded;
  }
  function canonicalizeFind(find3) {
    if (Array.isArray(find3)) return find3.map(canonicalizeRegex);
    return canonicalizeRegex(find3);
  }
  function matchesOne(code, f3) {
    if (typeof f3 === "string") return code.includes(f3);
    if (f3 instanceof RegExp) {
      f3.lastIndex = 0;
      return f3.test(code);
    }
    return false;
  }
  function matchesFind(code, find3) {
    if (Array.isArray(find3)) return find3.length > 0 && find3.every((f3) => matchesOne(code, f3));
    return matchesOne(code, find3);
  }
  var describeFind = (find3) => Array.isArray(find3) ? find3.map(String).join(" & ") : String(find3);
  var selfExpr = (name) => `UserscriptPP.plugins[${JSON.stringify(name)}]`;
  function countGroups(re) {
    try {
      return new RegExp(re.source + "|").exec("").length - 1;
    } catch {
      return 0;
    }
  }
  function canonicalizeReplacement(r3, pluginName, self = selfExpr(pluginName)) {
    const match = canonicalizeRegex(r3.match);
    let replace = r3.replace;
    if (typeof replace === "string") {
      if (IS_DEV && match instanceof RegExp) {
        const refs = [...replace.matchAll(/\$(\d+)/g)].map((m3) => +m3[1]);
        const max = refs.length ? Math.max(...refs) : 0;
        if (max > countGroups(match)) logger7.warn(`${pluginName}: 替换引用了 $${max},但 match 只有 ${countGroups(match)} 个捕获组`, String(match));
      }
      replace = replace.replaceAll("$self", self);
    } else if (typeof replace === "function") {
      const fn2 = replace;
      replace = (...args) => String(fn2(...args)).replaceAll("$self", self);
    }
    return { ...r3, match, replace };
  }
  var seq = 0;
  function canonicalizePatch(patch, pluginName, checkOnly = false, self) {
    const reps = Array.isArray(patch.replacement) ? patch.replacement : patch.replacement ? [patch.replacement] : [];
    return {
      id: ++seq,
      plugin: pluginName,
      find: canonicalizeFind(patch.find),
      rawFind: patch.find,
      replacement: reps.map((r3) => canonicalizeReplacement(r3, pluginName, self)),
      all: !!patch.all,
      group: !!patch.group,
      noWarn: !!patch.noWarn,
      predicate: patch.predicate,
      checkOnly,
      consumed: false
    };
  }
  function runPredicate(pred, label) {
    if (typeof pred !== "function") return true;
    try {
      return !!pred();
    } catch (e3) {
      logger7.error(`${label} 的 predicate 抛出异常`, e3);
      return false;
    }
  }
  function applyPatches(moduleId, source, patchList, stats) {
    let code = source;
    const appliedPlugins = /* @__PURE__ */ new Set();
    const results = [];
    const mismatches = [];
    for (const p3 of patchList) {
      if (p3.consumed) continue;
      if (!runPredicate(p3.predicate, p3.plugin)) continue;
      let hit;
      try {
        hit = matchesFind(code, p3.find);
      } catch (e3) {
        logger7.error(`${p3.plugin}: find 出错`, e3);
        continue;
      }
      if (!hit) continue;
      if (!p3.all) p3.consumed = true;
      if (p3.checkOnly) {
        for (const r3 of p3.replacement) {
          if (!matchesOne(code, r3.match)) mismatches.push({ plugin: p3.plugin, find: describeFind(p3.rawFind), match: String(r3.match), moduleId });
        }
        continue;
      }
      const before = code;
      const statuses = [];
      let failed = false;
      for (const r3 of p3.replacement) {
        if (!runPredicate(r3.predicate, p3.plugin)) {
          statuses.push({ match: String(r3.match), status: "skipped" });
          continue;
        }
        try {
          if (r3.match instanceof RegExp) r3.match.lastIndex = 0;
          const next = code.replace(r3.match, r3.replace);
          if (next === code) {
            statuses.push({ match: String(r3.match), status: "noEffect" });
            stats.noEffect++;
            failed = true;
            if (!p3.noWarn && !r3.noWarn) logger7.warn(`${p3.plugin}: 替换无效果(模块 ${moduleId})`, describeFind(p3.rawFind), String(r3.match));
          } else {
            code = next;
            statuses.push({ match: String(r3.match), status: "applied" });
          }
        } catch (e3) {
          statuses.push({ match: String(r3.match), status: "error", error: String(e3) });
          stats.errors++;
          failed = true;
          logger7.error(`${p3.plugin}: 替换出错(模块 ${moduleId})`, describeFind(p3.rawFind), e3);
        }
      }
      if (p3.group && failed) {
        code = before;
        for (const s3 of statuses) if (s3.status === "applied" || s3.status === "noEffect") s3.status = "reverted";
        if (!p3.noWarn) logger7.warn(`${p3.plugin}: 成组补丁未全部生效,已撤销(模块 ${moduleId})`, describeFind(p3.rawFind));
      }
      const appliedCount = statuses.filter((s3) => s3.status === "applied").length;
      if (appliedCount) appliedPlugins.add(p3.plugin);
      results.push({ plugin: p3.plugin, find: describeFind(p3.rawFind), moduleId, replacements: statuses });
    }
    return { code, applied: [...appliedPlugins], results, mismatches };
  }

  // core/lib/turbopack.js
  var logger8 = new Logger("Turbopack", "#93c5fd");
  var fnToString = Function.prototype.toString;
  var META = Symbol.for("uspp.factory");
  var patches = [];
  var patchResults = [];
  var patchStats = { applied: 0, bypassed: 0, noEffect: 0, errors: 0, runtimeFallbacks: 0, patchedModules: /* @__PURE__ */ new Set(), injectionFallbacks: /* @__PURE__ */ new Set() };
  var checkOnlyMismatches = [];
  var moduleCache = /* @__PURE__ */ new Map();
  var factories = /* @__PURE__ */ new Map();
  var chunkPaths = /* @__PURE__ */ new Set();
  var wrapperOf = /* @__PURE__ */ new WeakMap();
  var wrappers = /* @__PURE__ */ new WeakSet();
  var metaById = /* @__PURE__ */ new Map();
  var loadListeners = /* @__PURE__ */ new Set();
  var cacheVersion = 0;
  var getCacheVersion = () => cacheVersion;
  var runtime = { registry: null, cache: null, ctx: null };
  function isForeignWrapper(f3) {
    try {
      if (!Object.prototype.hasOwnProperty.call(f3, "toString")) return false;
      return fnToString.call(f3) !== String(f3.toString());
    } catch {
      return false;
    }
  }
  var lostListeners = /* @__PURE__ */ new Set();
  var lostModules = /* @__PURE__ */ new Set();
  var onPatchLost = (cb) => {
    lostListeners.add(cb);
    for (const id of lostModules) safeLost(cb, id);
    return () => lostListeners.delete(cb);
  };
  function onPatchBypassed(pluginName, cb) {
    return onPatchLost((id, _plugins, results) => {
      const mine = results.filter((r3) => r3.plugin === pluginName);
      if (mine.length) cb(mine, id);
    });
  }
  function safeLost(cb, id) {
    const meta = metaById.get(id);
    try {
      cb(id, meta ? meta.plugins.slice() : [], meta ? meta.results.filter((r3) => r3.replacements.some((x4) => x4.status === "bypassed")) : []);
    } catch (e3) {
      logger8.error("补丁失效监听者出错", e3);
    }
  }
  var appliedEntries = (meta) => meta.results.flatMap((r3) => r3.replacements.filter((x4) => x4.status === "applied"));
  function markRan(meta) {
    if (meta.ranPatched) return;
    meta.ranPatched = true;
    patchStats.applied += appliedEntries(meta).length;
  }
  function markLost(id, why) {
    if (lostModules.has(id)) return;
    lostModules.add(id);
    const meta = metaById.get(id);
    if (meta) {
      const entries2 = appliedEntries(meta);
      for (const e3 of entries2) {
        e3.status = "bypassed";
        e3.reason = why;
      }
      patchStats.bypassed += entries2.length;
    }
    logger8.warn(`模块 ${id} 的补丁没有生效(${why}),相关插件改用运行时兜底:${meta ? meta.plugins.join(", ") : ""}`);
    for (const cb of [...lostListeners]) safeLost(cb, id);
  }
  function registerInjectionFallback(pluginName, detail) {
    if (patchStats.injectionFallbacks.has(pluginName)) return;
    patchStats.injectionFallbacks.add(pluginName);
    logger8.info(`${pluginName} 的补丁被绕过,已启用运行时兜底${detail ? `(${detail})` : ""}`);
  }
  function checkLostPatches() {
    const c3 = runtime.cache;
    if (!c3) return;
    for (const [id, meta] of metaById) {
      if (!meta.patched || meta.ranPatched || lostModules.has(id)) continue;
      const m3 = c3[id];
      if (m3 && m3.exports != null && !meta.executing) markLost(id, "被其他脚本的包装绕过");
    }
  }
  var registeredKeys = /* @__PURE__ */ new Set();
  function addPatch(patch, pluginName, { checkOnly = false, key, self } = {}) {
    if (key) {
      if (registeredKeys.has(key)) return null;
      registeredKeys.add(key);
    }
    if (!runPredicate(patch.predicate, pluginName)) return null;
    const p3 = canonicalizePatch(patch, pluginName, checkOnly, self);
    patches.push(p3);
    return p3;
  }
  function onModuleLoad(cb) {
    loadListeners.add(cb);
    return () => loadListeners.delete(cb);
  }
  function registerExports(id, exports) {
    if (exports == null) return;
    moduleCache.set(id, exports);
    cacheVersion++;
    for (const cb of [...loadListeners]) {
      try {
        cb(exports, id);
      } catch (e3) {
        logger8.error("模块加载监听者出错", e3);
      }
    }
  }
  function rescanRuntimeCache() {
    const c3 = runtime.cache;
    if (!c3) return 0;
    const fresh = [];
    for (const id of Object.keys(c3)) {
      const key = isNaN(+id) ? id : +id;
      if (moduleCache.has(key)) continue;
      const m3 = c3[id];
      if (m3 && !m3.error && m3.exports != null) {
        moduleCache.set(key, m3.exports);
        fresh.push([key, m3.exports]);
      }
    }
    if (fresh.length) cacheVersion++;
    for (const [key, exports] of fresh) {
      for (const cb of [...loadListeners]) {
        try {
          cb(exports, key);
        } catch (e3) {
          logger8.error("模块加载监听者出错", e3);
        }
      }
    }
    return fresh.length;
  }
  var lastRuntimeCount = -1;
  function syncRuntimeCache() {
    const c3 = runtime.cache;
    if (!c3) return 0;
    let n2;
    try {
      n2 = Object.keys(c3).length;
    } catch {
      return 0;
    }
    if (n2 === lastRuntimeCount) return 0;
    lastRuntimeCount = n2;
    return rescanRuntimeCache();
  }
  var COMPILED = Symbol.for("uspp.compiled");
  function getNonce() {
    const s3 = document.querySelector("script[nonce]");
    return s3 ? s3.nonce || s3.getAttribute("nonce") || "" : "";
  }
  function compile2(id, code) {
    const sourceURL = `
//# sourceURL=uspp:///turbopack/module-${String(id).replace(/[^\w.-]/g, "_")}.js`;
    const ns = W.UserscriptPP;
    try {
      if (ns && document.documentElement) {
        const bag = ns[COMPILED] || (Object.defineProperty(ns, COMPILED, { value: /* @__PURE__ */ Object.create(null) }), ns[COMPILED]);
        const key = "m" + String(id).replace(/[^\w]/g, "_");
        delete bag[key];
        const el = document.createElement("script");
        const nonce = getNonce();
        if (nonce) el.nonce = nonce;
        el.textContent = `window.UserscriptPP[Symbol.for("uspp.compiled")][${JSON.stringify(key)}]=(${code}
);${sourceURL}`;
        (document.head || document.documentElement).appendChild(el);
        el.remove();
        const fn2 = bag[key];
        delete bag[key];
        if (typeof fn2 === "function") return fn2;
      }
    } catch (e3) {
      logger8.debug("内联 script 编译失败,改用 Function", e3);
    }
    const F4 = W.Function || Function;
    return new F4(`return (${code}
);${sourceURL}`)();
  }
  function captureRuntime(ctx) {
    if (runtime.registry || !ctx || typeof ctx !== "object") return;
    try {
      const proto = Object.getPrototypeOf(ctx);
      const reg = proto && proto.M;
      const cache2 = proto && proto.c;
      if (!(reg instanceof W.Map || reg instanceof Map) || !cache2 || typeof cache2 !== "object") return;
      runtime.registry = reg;
      runtime.cache = cache2;
      runtime.ctx = ctx;
      hookRegistry(reg);
      rescanRuntimeCache();
    } catch (e3) {
      logger8.error("获取运行时注册表失败", e3);
    }
  }
  function hookRegistry(reg) {
    const prevSet = reg.set;
    for (const [id, f3] of reg) {
      if (typeof f3 !== "function" || wrappers.has(f3)) continue;
      if (runtime.cache && runtime.cache[id]) {
        if (!factories.has(id)) factories.set(id, f3);
        continue;
      }
      try {
        prevSet.call(reg, id, wrapFactory(id, f3));
      } catch {
      }
    }
    reg.set = function(id, f3) {
      if (typeof f3 === "function" && !wrappers.has(f3)) f3 = wrapFactory(id, f3);
      return prevSet.call(this, id, f3);
    };
  }
  function wrapFactory(id, original) {
    if (wrappers.has(original)) return original;
    const existing = wrapperOf.get(original);
    if (existing) return existing;
    if (!factories.has(id)) factories.set(id, original);
    const foreign = isForeignWrapper(original);
    let source = null;
    try {
      source = foreign ? String(original.toString()) : fnToString.call(original);
    } catch {
    }
    const meta = { id, original, patched: false, plugins: [], results: [], code: null, compiled: null, compileFailed: false, deferred: false, ranPatched: false, executing: false };
    if (source) {
      const res = applyPatches(id, source, patches, patchStats);
      if (res.results.length) patchResults.push(...res.results);
      if (res.mismatches.length) checkOnlyMismatches.push(...res.mismatches);
      if (res.code !== source) {
        meta.patched = true;
        meta.results = res.results;
        meta.plugins = res.applied;
        meta.code = res.code;
        patchStats.patchedModules.add(id);
        meta.deferred = foreign;
      }
    }
    const wrapper = function(ctx, mod, exp) {
      captureRuntime(ctx);
      let fn2 = original;
      if (meta.patched && meta.deferred) {
        markLost(id, "内层是其他脚本的包装");
      } else if (meta.patched && !meta.compileFailed) {
        if (!meta.compiled) {
          try {
            meta.compiled = compile2(id, meta.code);
          } catch (e3) {
            meta.compileFailed = true;
            patchStats.errors++;
            logger8.error(`模块 ${id} 补丁后编译失败,改用原始代码(${meta.plugins.join(", ")})`, e3);
          }
        }
        if (meta.compiled) fn2 = meta.compiled;
        else markLost(id, "编译失败");
      }
      let ret;
      meta.executing = true;
      try {
        ret = fn2.apply(this, arguments);
        if (fn2 !== original) markRan(meta);
      } catch (e3) {
        if (fn2 === original) throw e3;
        meta.ranPatched = false;
        markLost(id, "运行出错");
        patchStats.runtimeFallbacks++;
        logger8.error(`模块 ${id} 补丁后运行出错,改用原始代码重新执行(${meta.plugins.join(", ")})`, e3);
        ret = runOriginalFresh(this, original, ctx, mod, exp, arguments);
      } finally {
        meta.executing = false;
      }
      try {
        registerExports(id, mod && mod.exports);
      } catch (e3) {
        logger8.error(e3);
      }
      return ret;
    };
    Object.defineProperty(wrapper, "toString", { value: () => source != null ? source : fnToString.call(original), configurable: true, writable: true });
    Object.defineProperty(wrapper, "name", { value: original.name, configurable: true });
    Object.defineProperty(wrapper, META, { value: meta });
    wrappers.add(wrapper);
    wrapperOf.set(original, wrapper);
    if (!metaById.has(id)) metaById.set(id, meta);
    return wrapper;
  }
  function runOriginalFresh(self, original, ctx, mod, exp, args) {
    try {
      if (mod && ctx && typeof ctx === "object") {
        const fresh = {};
        mod.exports = fresh;
        mod.namespaceObject = void 0;
        mod.error = void 0;
        const Ctor = Object.getPrototypeOf(ctx).constructor;
        const freshCtx = new Ctor(mod, fresh);
        return original.call(self, freshCtx, mod, fresh);
      }
    } catch (e3) {
      if (!(e3 instanceof TypeError)) throw e3;
    }
    return original.apply(self, args);
  }
  function getPatchedCode(id) {
    const meta = metaById.get(id) ?? metaById.get(+id) ?? metaById.get(String(id));
    return meta && meta.patched ? meta.code : null;
  }
  function chunkName(head) {
    try {
      if (typeof head === "string") return head;
      if (head && typeof head.getAttribute === "function") return head.getAttribute("src") || "";
      if (head && typeof head.src === "string") return head.src;
    } catch {
    }
    return "";
  }
  function handleChunk(chunk) {
    if (!Array.isArray(chunk) || chunk.$$usppSeen) return;
    try {
      Object.defineProperty(chunk, "$$usppSeen", { value: true });
    } catch {
    }
    const name = chunkName(chunk[0]);
    if (name) chunkPaths.add(name);
    let ids = [];
    for (let i3 = 1; i3 < chunk.length; i3++) {
      const v3 = chunk[i3];
      if (typeof v3 === "function") {
        if (ids.length) {
          try {
            chunk[i3] = wrapFactory(ids[0], v3);
          } catch (e3) {
            logger8.error("包装工厂失败", e3);
          }
        }
        ids = [];
      } else if (typeof v3 === "number" || typeof v3 === "string") {
        ids.push(v3);
      } else {
        ids = [];
      }
    }
  }
  var instrumented = /* @__PURE__ */ new WeakSet();
  function instrument(value) {
    if (!value || typeof value !== "object" && typeof value !== "function" || instrumented.has(value)) return value;
    if (Array.isArray(value)) {
      for (const c3 of value) handleChunk(c3);
    }
    const origPush = value.push;
    if (typeof origPush === "function") {
      try {
        value.push = function(...chunks) {
          for (const c3 of chunks) {
            try {
              handleChunk(c3);
            } catch (e3) {
              logger8.error("处理分块失败", e3);
            }
          }
          return origPush.apply(this, chunks);
        };
      } catch (e3) {
        logger8.warn("无法包装 TURBOPACK.push", e3);
      }
    }
    instrumented.add(value);
    return value;
  }
  var installed = false;
  function installInterceptor() {
    if (installed) return;
    installed = true;
    const desc = Object.getOwnPropertyDescriptor(W, "TURBOPACK");
    let current2;
    let chainGet = null, chainSet = null;
    if (desc && ("get" in desc || "set" in desc)) {
      chainGet = desc.get;
      chainSet = desc.set;
      try {
        instrument(chainGet ? chainGet.call(W) : void 0);
      } catch (e3) {
        logger8.warn(e3);
      }
    } else if (desc) {
      current2 = instrument(desc.value);
    }
    if (desc && !desc.configurable) {
      logger8.warn("TURBOPACK 不可配置,只能包装其 push");
      try {
        instrument(W.TURBOPACK);
      } catch {
      }
      return;
    }
    Object.defineProperty(W, "TURBOPACK", {
      configurable: true,
      enumerable: desc ? desc.enumerable : true,
      get() {
        if (chainGet) {
          const v3 = chainGet.call(this);
          return instrument(v3);
        }
        return current2;
      },
      set(v3) {
        v3 = instrument(v3);
        if (chainSet) chainSet.call(this, v3);
        else if (!chainGet) current2 = v3;
      }
    });
    logger8.debug("已安装打包器拦截");
  }
  function findInRegistry(test2) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    const consider = (id, f3) => {
      if (seen.has(id) || typeof f3 !== "function") return;
      seen.add(id);
      let src;
      try {
        const o3 = f3[META]?.original ?? f3;
        src = isForeignWrapper(o3) ? String(o3.toString()) : fnToString.call(o3);
      } catch {
        return;
      }
      if (test2(src, id)) out.push([id, f3]);
    };
    if (runtime.registry) for (const [id, f3] of runtime.registry) consider(id, f3);
    for (const [id, f3] of factories) consider(id, f3);
    return out;
  }
  function buildReport() {
    const orphaned = [], pending = [];
    for (const p3 of patches) {
      if (p3.consumed || p3.all || p3.checkOnly) continue;
      const pend = findInRegistry((src) => {
        try {
          return matchesFind(src, p3.find);
        } catch {
          return false;
        }
      });
      const entry = `${p3.plugin}: ${describeFind(p3.rawFind)}`;
      if (pend.length) pending.push(entry);
      else if (!p3.noWarn) orphaned.push(entry);
    }
    return { orphaned, pending };
  }
  function patchReport() {
    const { orphaned, pending } = buildReport();
    return {
      stats: { ...patchStats, patchedModules: [...patchStats.patchedModules], injectionFallbacks: [...patchStats.injectionFallbacks] },
      results: patchResults.slice(),
      orphaned,
      pending
    };
  }
  function logHealthReport() {
    const { orphaned } = buildReport();
    if (orphaned.length) logger8.warn(`以下补丁找不到对应模块(孤儿):
${orphaned.join("\n")}`);
    const noEffect = patchResults.some((r3) => r3.replacements.some((s3) => s3.status === "noEffect"));
    if (patchStats.applied === 0 && (orphaned.length || noEffect)) logger8.warn("本次没有任何补丁生效,站点构建很可能已变化");
    if (IS_DEV && checkOnlyMismatches.length) {
      logger8.warn("已禁用插件中失配的补丁:", checkOnlyMismatches);
    }
    logger8.info(`补丁统计:applied ${patchStats.applied},bypassed ${patchStats.bypassed},noEffect ${patchStats.noEffect},errors ${patchStats.errors},运行时回退 ${patchStats.runtimeFallbacks},被补丁模块 ${patchStats.patchedModules.size}`);
  }
  var lostCheckTimer = 0;
  onModuleLoad(() => {
    if (lostCheckTimer) return;
    lostCheckTimer = setTimeout(() => {
      lostCheckTimer = 0;
      checkLostPatches();
    }, 300);
  });
  function watchInstrumentation(durationMs = 2e4) {
    const until = Date.now() + durationMs;
    const tick = () => {
      try {
        const v3 = W.TURBOPACK;
        if (v3 && !instrumented.has(v3)) {
          logger8.warn("TURBOPACK 被其他脚本替换,重新挂接");
          instrument(v3);
        }
      } catch {
      }
      if (Date.now() < until) setTimeout(tick, 50);
    };
    tick();
  }

  // core/lib/styles.js
  var logger9 = new Logger("Styles", "#f9a8d4");
  var styles = /* @__PURE__ */ new Map();
  var container = null;
  var pendingDom = false;
  var useSheets = /* @__PURE__ */ (() => {
    let v3 = null;
    return () => {
      if (v3 === null) {
        try {
          v3 = getSite().styleHost !== "element" && "adoptedStyleSheets" in Document.prototype && typeof CSSStyleSheet.prototype.replaceSync === "function";
        } catch {
          v3 = false;
        }
      }
      return v3;
    };
  })();
  var ourSheets = /* @__PURE__ */ new WeakSet();
  function syncSheet(name) {
    const s3 = styles.get(name);
    const doc = document;
    if (s3) {
      if (!s3.sheet) {
        s3.sheet = new CSSStyleSheet();
        ourSheets.add(s3.sheet);
      }
      if (s3.sheetCss !== s3.css) {
        try {
          s3.sheet.replaceSync(s3.css);
        } catch (e3) {
          logger9.warn(`样式 ${name} 解析失败`, e3);
        }
        s3.sheetCss = s3.css;
      }
    }
    const others = doc.adoptedStyleSheets.filter((x4) => !ourSheets.has(x4));
    const ours = [...styles.values()].filter((x4) => x4.enabled && x4.sheet).map((x4) => x4.sheet);
    doc.adoptedStyleSheets = [...others, ...ours];
  }
  function ensureContainer() {
    if (!document.head) {
      if (!pendingDom) {
        pendingDom = true;
        const go = () => {
          pendingDom = false;
          rebuild();
        };
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go, { once: true });
        else queueMicrotask(go);
        const mo2 = new MutationObserver(() => {
          if (document.head) {
            mo2.disconnect();
            go();
          }
        });
        mo2.observe(document.documentElement || document, { childList: true, subtree: true });
      }
      return null;
    }
    if (container && container.isConnected) return container;
    container = document.createElement("uspp-styles");
    container.style.display = "none";
    document.head.appendChild(container);
    return container;
  }
  function rebuild() {
    const c3 = ensureContainer();
    if (!c3) return;
    for (const [name, s3] of styles) {
      if (!s3.enabled) {
        s3.el?.remove();
        continue;
      }
      if (!s3.el || s3.el.parentNode !== c3) {
        s3.el = document.createElement("style");
        s3.el.setAttribute("data-uspp", name);
        s3.el.textContent = s3.css;
        c3.appendChild(s3.el);
      }
    }
  }
  function sync(name) {
    if (useSheets()) return syncSheet(name);
    const s3 = styles.get(name);
    if (!s3) return;
    const c3 = ensureContainer();
    if (!c3) return;
    if (!container.isConnected) return rebuild();
    if (!s3.enabled) {
      s3.el?.remove();
      return;
    }
    if (!s3.el || s3.el.parentNode !== c3) {
      if (s3.el && s3.el.parentNode !== c3) return rebuild();
      s3.el = document.createElement("style");
      s3.el.setAttribute("data-uspp", name);
      c3.appendChild(s3.el);
    }
    if (s3.el.textContent !== s3.css) s3.el.textContent = s3.css;
  }
  function registerStyle(name, css, enabled = true) {
    const s3 = styles.get(name);
    if (s3) {
      s3.css = css;
      if (enabled) s3.enabled = true;
    } else styles.set(name, { css, enabled, el: null });
    if (!useSheets() && container && !container.isConnected) {
      container = null;
      rebuild();
    } else sync(name);
  }
  function enableStyle(name) {
    const s3 = styles.get(name);
    if (!s3) {
      logger9.warn(`样式 ${name} 未注册`);
      return false;
    }
    if (s3.enabled) return false;
    s3.enabled = true;
    sync(name);
    return true;
  }
  function disableStyle(name) {
    const s3 = styles.get(name);
    if (!s3 || !s3.enabled) return false;
    s3.enabled = false;
    s3.el?.remove();
    s3.el = null;
    if (useSheets()) syncSheet(name);
    return true;
  }
  function unregisterStyle(name) {
    const s3 = styles.get(name);
    if (!s3) return false;
    s3.el?.remove();
    styles.delete(name);
    if (useSheets()) syncSheet(null);
    return true;
  }

  // core/lib/slots.js
  var logger10 = new Logger("Slots", "#fdba74");
  var slots = /* @__PURE__ */ new Map();
  var listeners = /* @__PURE__ */ new Map();
  var anyListeners = /* @__PURE__ */ new Set();
  var version = 0;
  function emit(slot) {
    version++;
    for (const fn2 of [...listeners.get(slot) || [], ...anyListeners]) {
      try {
        fn2(slot);
      } catch (e3) {
        logger10.error("注入点监听者出错", e3);
      }
    }
  }
  function addSlotItem(slot, id, def2) {
    if (!slot || id == null) throw new Error("addSlotItem 需要注入点名和 ID");
    let m3 = slots.get(slot);
    if (!m3) slots.set(slot, m3 = /* @__PURE__ */ new Map());
    m3.set(String(id), { ...def2, id: String(id) });
    emit(slot);
  }
  function removeSlotItem(slot, id) {
    if (slots.get(slot)?.delete(String(id))) emit(slot);
  }
  function getSlotItems(slot) {
    return [...slots.get(slot)?.values() ?? []].sort((a3, b3) => (a3.order ?? 0) - (b3.order ?? 0));
  }
  function onSlotChange(slot, fn2) {
    const set = slot === "*" ? anyListeners : listeners.get(slot) || (listeners.set(slot, /* @__PURE__ */ new Set()), listeners.get(slot));
    set.add(fn2);
    return () => set.delete(fn2);
  }
  var getSlotVersion = () => version;
  var slotValue = (v3, ctx) => typeof v3 === "function" ? !!v3(ctx) : !!v3;

  // core/lib/finders.js
  var logger11 = new Logger("Finders", "#67e8f9");
  var fnToString2 = Function.prototype.toString;
  var REACT_MEMO = Symbol.for("react.memo");
  var REACT_FORWARD_REF = Symbol.for("react.forward_ref");
  function isSkippable(v3) {
    if (v3 == null) return true;
    const t3 = typeof v3;
    if (t3 !== "object" && t3 !== "function") return true;
    try {
      if (v3 === W || v3 === window || v3 === W.document || v3 === document) return true;
      if (typeof W.Node === "function" && v3 instanceof W.Node) return true;
      if (v3 instanceof Map || v3 instanceof Set || v3 instanceof WeakMap || v3 instanceof WeakSet) return true;
      if (W.Map && (v3 instanceof W.Map || v3 instanceof W.Set || v3 instanceof W.WeakMap || v3 instanceof W.WeakSet)) return true;
      if (v3 instanceof ArrayBuffer || ArrayBuffer.isView(v3)) return true;
      if (W.ArrayBuffer && (v3 instanceof W.ArrayBuffer || W.ArrayBuffer.isView(v3))) return true;
      if (W.WebSocket && v3 instanceof W.WebSocket) return true;
      if (W.MessagePort && v3 instanceof W.MessagePort) return true;
      if (W.EventTarget && v3 instanceof W.EventTarget && !(t3 === "function")) return true;
      if (W.Promise && v3 instanceof W.Promise) return true;
      if (t3 === "function" || t3 === "object") {
        const probe = v3["$$uspp_probe_x"];
        if (probe != null) return true;
      }
    } catch {
      return true;
    }
    return false;
  }
  function quietly(fn2) {
    const c3 = W.console || console;
    const ow = c3.warn, oe = c3.error;
    c3.warn = () => {
    };
    c3.error = () => {
    };
    try {
      return fn2();
    } finally {
      c3.warn = ow;
      c3.error = oe;
    }
  }
  function testSafe(filter, v3) {
    try {
      return !!filter(v3);
    } catch {
      return false;
    }
  }
  var SKIP_KEYS = /* @__PURE__ */ new Set(["default"]);
  function* candidates(exports) {
    yield exports;
    if (isSkippable(exports)) return;
    let keys;
    try {
      keys = Object.keys(exports);
    } catch {
      return;
    }
    for (const k4 of keys) {
      if (k4.startsWith("__") || k4.startsWith("unstable_") || k4.startsWith("UNSAFE_")) continue;
      let v3;
      try {
        v3 = exports[k4];
      } catch {
        continue;
      }
      if (v3 == null || SKIP_KEYS.has(k4) && v3 === exports) continue;
      yield v3;
    }
  }
  function find2(filter, { all = false } = {}) {
    if (typeof filter !== "function") throw new TypeError("filter 必须是函数");
    return quietly(() => {
      const found = [];
      const seen = /* @__PURE__ */ new Set();
      syncRuntimeCache();
      for (const exports of moduleCache.values()) {
        for (const v3 of candidates(exports)) {
          if (v3 == null || typeof v3 !== "object" && typeof v3 !== "function") continue;
          if (seen.has(v3)) continue;
          if (v3 !== exports && isSkippable(v3)) continue;
          if (testSafe(filter, v3)) {
            if (!all) return v3;
            seen.add(v3);
            found.push(v3);
          }
        }
      }
      return all ? found : null;
    });
  }
  var findAll = (filter) => find2(filter, { all: true });
  var codeOf = (f3) => {
    try {
      return fnToString2.call(f3);
    } catch {
      return "";
    }
  };
  var toPatterns = (ps) => ps.map(canonicalizeRegex);
  var isZustandStore2 = (v3) => typeof v3 === "function" && typeof v3.getState === "function" && typeof v3.subscribe === "function" && typeof v3.setState === "function";
  var storeKey = (name) => "use" + (name.startsWith("use") ? name.slice(3) : name).replace(/Store$/, "") + "Store";
  var filters = {
    byProps: (...keys) => (v3) => keys.every((k4) => v3[k4] != null),
    byCode: (...patterns) => {
      const ps = toPatterns(patterns);
      return (v3) => typeof v3 === "function" && ps.every((p3) => matchesOne(codeOf(v3), p3));
    },
    byDisplayName: (name) => (v3) => v3.displayName === name || v3.render?.displayName === name || v3.type?.displayName === name,
    byStoreName: (name) => {
      const key = storeKey(name);
      return (v3) => isZustandStore2(v3[key]);
    },
    componentByCode: (...patterns) => {
      const ps = toPatterns(patterns);
      const check2 = (f3) => typeof f3 === "function" && ps.every((p3) => matchesOne(codeOf(f3), p3));
      return (v3) => {
        if (check2(v3)) return true;
        if (v3.$$typeof === REACT_MEMO) return check2(v3.type) || check2(v3.type?.render);
        if (v3.$$typeof === REACT_FORWARD_REF) return check2(v3.render);
        return false;
      };
    }
  };
  var findByProps = (...keys) => find2(filters.byProps(...keys));
  var findByCode = (...ps) => find2(filters.byCode(...ps));
  var findByDisplayName = (name) => find2(filters.byDisplayName(name));
  var findComponentByCode = (...ps) => find2(filters.componentByCode(...ps));
  function findExportedComponent(...names) {
    const m3 = find2((v3) => names.some((n2) => v3[n2] != null && (typeof v3[n2] === "function" || typeof v3[n2] === "object")));
    if (!m3) return null;
    for (const n2 of names) if (m3[n2] != null) return m3[n2];
    return null;
  }
  function findStore2(name) {
    const key = storeKey(name);
    const m3 = find2((v3) => isZustandStore2(v3[key]));
    return m3 ? m3[key] : null;
  }
  function retryOnChange() {
    let last2 = -1;
    return () => {
      const v3 = getCacheVersion();
      if (v3 === last2) return false;
      last2 = v3;
      return true;
    };
  }
  var lazy = (fn2) => proxyLazy(fn2, retryOnChange());
  function lazyComponent(resolveFn, label) {
    let cached = null, last2 = -1;
    const get = () => {
      if (cached) return cached;
      const v3 = getCacheVersion();
      if (v3 === last2) return null;
      last2 = v3;
      cached = resolveFn();
      return cached;
    };
    const Lazy = (props) => {
      const C4 = get();
      if (!C4) return null;
      const React = getReact2();
      return React ? React.createElement(C4, props) : null;
    };
    Lazy.displayName = `UsppLazy(${label})`;
    Lazy.$$usppResolve = get;
    return Lazy;
  }
  var findLazy = (filter) => lazy(() => find2(filter));
  var findByPropsLazy = (...keys) => lazy(() => findByProps(...keys));
  var findByCodeLazy = (...ps) => lazy(() => findByCode(...ps));
  var findByDisplayNameLazy = (name) => lazyComponent(() => findByDisplayName(name), name);
  var findComponentByCodeLazy = (...ps) => lazyComponent(() => findComponentByCode(...ps), String(ps[0]));
  var findExportedComponentLazy = (...names) => lazyComponent(() => findExportedComponent(...names), names[0]);
  var findStoreLazy = (name) => lazy(() => findStore2(name));
  function srcMatcher(patterns) {
    const ps = toPatterns(patterns);
    return (src) => ps.every((p3) => matchesOne(src, p3));
  }
  function findModuleFactory(...patterns) {
    const hit = findInRegistry(srcMatcher(patterns))[0];
    return hit ?? null;
  }
  function findModuleId(...patterns) {
    const hit = findModuleFactory(...patterns);
    return hit ? hit[0] : null;
  }
  function search(...patterns) {
    const out = {};
    for (const [id, f3] of findInRegistry(srcMatcher(patterns))) out[id] = f3;
    return out;
  }
  function requireModule(id) {
    if (moduleCache.has(id)) return moduleCache.get(id);
    if (moduleCache.has(+id)) return moduleCache.get(+id);
    try {
      const c3 = runtime.cache;
      if (c3 && c3[id] && !c3[id].error) return c3[id].exports;
      if (runtime.ctx && typeof runtime.ctx.r === "function") return runtime.ctx.r(isNaN(+id) ? id : +id);
    } catch (e3) {
      logger11.debug(`加载模块 ${id} 失败`, e3);
    }
    return null;
  }
  function mapMangledModule(patterns, mappers) {
    const out = {};
    const id = findModuleId(...Array.isArray(patterns) ? patterns : [patterns]);
    if (id == null) return out;
    const exports = requireModule(id);
    if (!exports) return out;
    quietly(() => {
      for (const k4 of Object.keys(exports)) {
        let v3;
        try {
          v3 = exports[k4];
        } catch {
          continue;
        }
        if (v3 == null) continue;
        for (const [name, filter] of Object.entries(mappers)) {
          if (out[name] === void 0 && testSafe(filter, v3)) out[name] = v3;
        }
      }
    });
    return out;
  }
  function waitFor(filter, callback, timeoutMs) {
    const existing = find2(filter);
    if (existing) {
      try {
        callback(existing);
      } catch (e3) {
        logger11.error("waitFor 回调出错", e3);
      }
      return () => {
      };
    }
    let timer2;
    const unsub = onModuleLoad((exports) => {
      let hit = null;
      quietly(() => {
        for (const v3 of candidates(exports)) {
          if (v3 == null || typeof v3 !== "object" && typeof v3 !== "function") continue;
          if (v3 !== exports && isSkippable(v3)) continue;
          if (testSafe(filter, v3)) {
            hit = v3;
            break;
          }
        }
      });
      if (hit) {
        cancel();
        try {
          callback(hit);
        } catch (e3) {
          logger11.error("waitFor 回调出错", e3);
        }
      }
    });
    const cancel = () => {
      unsub();
      clearTimeout(timer2);
    };
    if (timeoutMs) timer2 = setTimeout(() => {
      unsub();
      logger11.warn(`waitFor 超时(${timeoutMs} ms)`, filter);
    }, timeoutMs);
    return cancel;
  }
  function getAllStores() {
    const out = /* @__PURE__ */ new Map();
    quietly(() => {
      syncRuntimeCache();
      for (const exports of moduleCache.values()) {
        if (isSkippable(exports)) continue;
        let keys;
        try {
          keys = Object.keys(exports);
        } catch {
          continue;
        }
        for (const k4 of keys) {
          if (!k4.startsWith("use") || out.has(k4)) continue;
          let v3;
          try {
            v3 = exports[k4];
          } catch {
            continue;
          }
          if (isZustandStore2(v3)) out.set(k4, v3);
        }
      }
    });
    return out;
  }
  var reactCache = null;
  function getReact2() {
    if (reactCache) return reactCache;
    reactCache = find2((v3) => typeof v3.createElement === "function" && typeof v3.useState === "function" && typeof v3.Component === "function" && typeof v3.Fragment !== "undefined" && v3.version != null) || null;
    return reactCache;
  }

  // node_modules/preact/compat/dist/compat.module.js
  var compat_module_exports = {};
  __export(compat_module_exports, {
    Children: () => L2,
    Component: () => C,
    Fragment: () => S,
    PureComponent: () => M2,
    StrictMode: () => S,
    Suspense: () => P3,
    SuspenseList: () => B3,
    __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: () => an,
    cloneElement: () => mn,
    createContext: () => X,
    createElement: () => k,
    createFactory: () => sn,
    createPortal: () => $2,
    createRef: () => M,
    default: () => gn,
    findDOMNode: () => yn,
    flushSync: () => bn,
    forwardRef: () => D3,
    hydrate: () => tn,
    isElement: () => Sn,
    isFragment: () => vn,
    isMemo: () => dn,
    isValidElement: () => hn,
    lazy: () => z3,
    memo: () => N2,
    render: () => nn,
    startTransition: () => x3,
    unmountComponentAtNode: () => pn,
    unstable_batchedUpdates: () => _n,
    useCallback: () => q2,
    useContext: () => x2,
    useDebugValue: () => P2,
    useDeferredValue: () => w3,
    useEffect: () => h3,
    useErrorBoundary: () => b2,
    useId: () => g2,
    useImperativeHandle: () => F2,
    useInsertionEffect: () => I2,
    useLayoutEffect: () => _2,
    useMemo: () => T2,
    useReducer: () => y2,
    useRef: () => A2,
    useState: () => d2,
    useSyncExternalStore: () => C3,
    useTransition: () => k3,
    version: () => cn
  });

  // node_modules/preact/dist/preact.module.js
  var n;
  var l;
  var u;
  var t;
  var i;
  var r;
  var o;
  var e;
  var f;
  var c;
  var a;
  var s;
  var h2;
  var p;
  var v;
  var y;
  var d = {};
  var w = [];
  var _ = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;
  var g = Array.isArray;
  function m(n2, l3) {
    for (var u3 in l3) n2[u3] = l3[u3];
    return n2;
  }
  function b(n2) {
    n2 && n2.parentNode && n2.parentNode.removeChild(n2);
  }
  function k(l3, u3, t3) {
    var i3, r3, o3, e3 = {};
    for (o3 in u3) "key" == o3 ? i3 = u3[o3] : "ref" == o3 ? r3 = u3[o3] : e3[o3] = u3[o3];
    if (arguments.length > 2 && (e3.children = arguments.length > 3 ? n.call(arguments, 2) : t3), "function" == typeof l3 && null != l3.defaultProps) for (o3 in l3.defaultProps) void 0 === e3[o3] && (e3[o3] = l3.defaultProps[o3]);
    return x(l3, e3, i3, r3, null);
  }
  function x(n2, t3, i3, r3, o3) {
    var e3 = { type: n2, props: t3, key: i3, ref: r3, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: null == o3 ? ++u : o3, __i: -1, __u: 0 };
    return null == o3 && null != l.vnode && l.vnode(e3), e3;
  }
  function M() {
    return { current: null };
  }
  function S(n2) {
    return n2.children;
  }
  function C(n2, l3) {
    this.props = n2, this.context = l3;
  }
  function $(n2, l3) {
    if (null == l3) return n2.__ ? $(n2.__, n2.__i + 1) : null;
    for (var u3; l3 < n2.__k.length; l3++) if (null != (u3 = n2.__k[l3]) && null != u3.__e) return u3.__e;
    return "function" == typeof n2.type ? $(n2) : null;
  }
  function I(n2) {
    if (n2.__P && n2.__d) {
      var u3 = n2.__v, t3 = u3.__e, i3 = [], r3 = [], o3 = m({}, u3);
      o3.__v = u3.__v + 1, l.vnode && l.vnode(o3), q(n2.__P, o3, u3, n2.__n, n2.__P.namespaceURI, 32 & u3.__u ? [t3] : null, i3, null == t3 ? $(u3) : t3, !!(32 & u3.__u), r3), o3.__v = u3.__v, o3.__.__k[o3.__i] = o3, D(i3, o3, r3), u3.__e = u3.__ = null, o3.__e != t3 && P(o3);
    }
  }
  function P(n2) {
    if (null != (n2 = n2.__) && null != n2.__c) return n2.__e = n2.__c.base = null, n2.__k.some(function(l3) {
      if (null != l3 && null != l3.__e) return n2.__e = n2.__c.base = l3.__e;
    }), P(n2);
  }
  function A(n2) {
    (!n2.__d && (n2.__d = true) && i.push(n2) && !H.__r++ || r != l.debounceRendering) && ((r = l.debounceRendering) || o)(H);
  }
  function H() {
    try {
      for (var n2, l3 = 1; i.length; ) i.length > l3 && i.sort(e), n2 = i.shift(), l3 = i.length, I(n2);
    } finally {
      i.length = H.__r = 0;
    }
  }
  function L(n2, l3, u3, t3, i3, r3, o3, e3, f3, c3, a3) {
    var s3, h5, p3, v3, y3, _3, g4 = t3 && t3.__k || w, m3 = l3.length;
    for (f3 = T(u3, l3, g4, f3, m3), s3 = 0; s3 < m3; s3++) null != (p3 = u3.__k[s3]) && (h5 = -1 != p3.__i && g4[p3.__i] || d, p3.__i = s3, _3 = q(n2, p3, h5, i3, r3, o3, e3, f3, c3, a3), v3 = p3.__e, p3.ref && h5.ref != p3.ref && (h5.ref && J(h5.ref, null, p3), a3.push(p3.ref, p3.__c || v3, p3)), null == y3 && null != v3 && (y3 = v3), 4 & p3.__u ? (f3 = j(p3, f3, n2), h5.__e && (h5.__e = null)) : "function" == typeof p3.type && void 0 !== _3 ? f3 = _3 : v3 && (f3 = v3.nextSibling), p3.__u &= -7);
    return u3.__e = y3, f3;
  }
  function T(n2, l3, u3, t3, i3) {
    var r3, o3, e3, f3, c3, a3 = u3.length, s3 = a3, h5 = 0;
    for (n2.__k = new Array(i3), r3 = 0; r3 < i3; r3++) null != (o3 = l3[r3]) && "boolean" != typeof o3 && "function" != typeof o3 ? ("string" == typeof o3 || "number" == typeof o3 || "bigint" == typeof o3 || o3.constructor == String ? o3 = n2.__k[r3] = x(null, o3, null, null, null) : g(o3) ? o3 = n2.__k[r3] = x(S, { children: o3 }, null, null, null) : void 0 === o3.constructor && o3.__b > 0 ? o3 = n2.__k[r3] = x(o3.type, o3.props, o3.key, o3.ref ? o3.ref : null, o3.__v) : n2.__k[r3] = o3, f3 = r3 + h5, o3.__ = n2, o3.__b = n2.__b + 1, e3 = null, -1 != (c3 = o3.__i = O(o3, u3, f3, s3)) && (s3--, (e3 = u3[c3]) && (e3.__u |= 2)), null == e3 || null == e3.__v ? (-1 == c3 && (i3 > a3 ? h5-- : i3 < a3 && h5++), "function" != typeof o3.type && (o3.__u |= 4)) : c3 != f3 && (c3 == f3 - 1 ? h5-- : c3 == f3 + 1 ? h5++ : (c3 > f3 ? h5-- : h5++, o3.__u |= 4))) : n2.__k[r3] = null;
    if (s3) for (r3 = 0; r3 < a3; r3++) null != (e3 = u3[r3]) && 0 == (2 & e3.__u) && (e3.__e == t3 && (t3 = $(e3)), K(e3, e3));
    return t3;
  }
  function j(n2, l3, u3) {
    var t3, i3;
    if ("function" == typeof n2.type) {
      for (t3 = n2.__k, i3 = 0; t3 && i3 < t3.length; i3++) t3[i3] && (t3[i3].__ = n2, l3 = j(t3[i3], l3, u3));
      return l3;
    }
    n2.__e != l3 && (l3 && n2.type && !l3.parentNode && (l3 = $(n2)), l3 = u3.insertBefore(n2.__e, l3 || null));
    do {
      l3 = l3 && l3.nextSibling;
    } while (null != l3 && 8 == l3.nodeType);
    return l3;
  }
  function F(n2, l3) {
    return l3 = l3 || [], null == n2 || "boolean" == typeof n2 || (g(n2) ? n2.some(function(n3) {
      F(n3, l3);
    }) : l3.push(n2)), l3;
  }
  function O(n2, l3, u3, t3) {
    var i3, r3, o3, e3 = n2.key, f3 = n2.type, c3 = l3[u3], a3 = null != c3 && 0 == (2 & c3.__u);
    if (null === c3 && null == e3 || a3 && e3 == c3.key && f3 == c3.type) return u3;
    if (t3 > (a3 ? 1 : 0)) {
      for (i3 = u3 - 1, r3 = u3 + 1; i3 >= 0 || r3 < l3.length; ) if (null != (c3 = l3[o3 = i3 >= 0 ? i3-- : r3++]) && 0 == (2 & c3.__u) && e3 == c3.key && f3 == c3.type) return o3;
    }
    return -1;
  }
  function z(n2, l3, u3) {
    "-" == l3[0] ? n2.setProperty(l3, null == u3 ? "" : u3) : n2[l3] = null == u3 ? "" : "number" != typeof u3 || _.test(l3) ? u3 : u3 + "px";
  }
  function N(n2, l3, u3, t3, i3) {
    var r3, o3;
    n: if ("style" == l3) if ("string" == typeof u3) n2.style.cssText = u3;
    else {
      if ("string" == typeof t3 && (n2.style.cssText = t3 = ""), t3) for (l3 in t3) u3 && l3 in u3 || z(n2.style, l3, "");
      if (u3) for (l3 in u3) t3 && u3[l3] == t3[l3] || z(n2.style, l3, u3[l3]);
    }
    else if ("o" == l3[0] && "n" == l3[1]) r3 = l3 != (l3 = l3.replace(s, "$1")), o3 = l3.toLowerCase(), l3 = o3 in n2 || "onFocusOut" == l3 || "onFocusIn" == l3 ? o3.slice(2) : l3.slice(2), n2.l || (n2.l = {}), n2.l[l3 + r3] = u3, u3 ? t3 ? u3[a] = t3[a] : (u3[a] = h2, n2.addEventListener(l3, r3 ? v : p, r3)) : n2.removeEventListener(l3, r3 ? v : p, r3);
    else {
      if ("http://www.w3.org/2000/svg" == i3) l3 = l3.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");
      else if ("width" != l3 && "height" != l3 && "href" != l3 && "list" != l3 && "form" != l3 && "tabIndex" != l3 && "download" != l3 && "rowSpan" != l3 && "colSpan" != l3 && "role" != l3 && "popover" != l3 && l3 in n2) try {
        n2[l3] = null == u3 ? "" : u3;
        break n;
      } catch (n3) {
      }
      "function" == typeof u3 || (null == u3 || false === u3 && "-" != l3[4] ? n2.removeAttribute(l3) : n2.setAttribute(l3, "popover" == l3 && 1 == u3 ? "" : u3));
    }
  }
  function V(n2) {
    return function(u3) {
      if (this.l) {
        var t3 = this.l[u3.type + n2];
        if (null == u3[c]) u3[c] = h2++;
        else if (u3[c] < t3[a]) return;
        return t3(l.event ? l.event(u3) : u3);
      }
    };
  }
  function q(n2, u3, t3, i3, r3, o3, e3, f3, c3, a3) {
    var s3, h5, p3, v3, y3, d3, _3, k4, x4, M3, I3, P4, A4, H3, T4, j4, F4 = u3.type;
    if (void 0 !== u3.constructor) return null;
    128 & t3.__u && (c3 = !!(32 & t3.__u), o3 = [f3 = u3.__e = t3.__e]), (s3 = l.__b) && s3(u3);
    n: if ("function" == typeof F4) {
      h5 = e3.length;
      try {
        if (x4 = u3.props, M3 = F4.prototype && F4.prototype.render, I3 = (s3 = F4.contextType) && i3[s3.__c], P4 = s3 ? I3 ? I3.props.value : s3.__ : i3, t3.__c ? k4 = (p3 = u3.__c = t3.__c).__ = p3.__E : (M3 ? u3.__c = p3 = new F4(x4, P4) : (u3.__c = p3 = new C(x4, P4), p3.constructor = F4, p3.render = Q), I3 && I3.sub(p3), p3.state || (p3.state = {}), p3.__n = i3, v3 = p3.__d = true, p3.__h = [], p3._sb = []), M3 && null == p3.__s && (p3.__s = p3.state), M3 && null != F4.getDerivedStateFromProps && (p3.__s == p3.state && (p3.__s = m({}, p3.__s)), m(p3.__s, F4.getDerivedStateFromProps(x4, p3.__s))), y3 = p3.props, d3 = p3.state, p3.__v = u3, v3) M3 && null == F4.getDerivedStateFromProps && null != p3.componentWillMount && p3.componentWillMount(), M3 && null != p3.componentDidMount && p3.__h.push(p3.componentDidMount);
        else {
          if (M3 && null == F4.getDerivedStateFromProps && x4 !== y3 && null != p3.componentWillReceiveProps && p3.componentWillReceiveProps(x4, P4), u3.__v == t3.__v || !p3.__e && null != p3.shouldComponentUpdate && false === p3.shouldComponentUpdate(x4, p3.__s, P4)) {
            u3.__v != t3.__v && (p3.props = x4, p3.state = p3.__s, p3.__d = false), u3.__e = t3.__e, u3.__k = t3.__k, u3.__k.some(function(n3) {
              n3 && (n3.__ = u3);
            }), w.push.apply(p3.__h, p3._sb), p3._sb = [], p3.__h.length && e3.push(p3), f3 = $(t3);
            break n;
          }
          null != p3.componentWillUpdate && p3.componentWillUpdate(x4, p3.__s, P4), M3 && null != p3.componentDidUpdate && p3.__h.push(function() {
            p3.componentDidUpdate(y3, d3, _3);
          });
        }
        if (p3.context = P4, p3.props = x4, p3.__P = n2, p3.__e = false, A4 = l.__r, H3 = 0, M3) p3.state = p3.__s, p3.__d = false, A4 && A4(u3), s3 = p3.render(p3.props, p3.state, p3.context), w.push.apply(p3.__h, p3._sb), p3._sb = [];
        else do {
          p3.__d = false, A4 && A4(u3), s3 = p3.render(p3.props, p3.state, p3.context), p3.state = p3.__s;
        } while (p3.__d && ++H3 < 25);
        p3.state = p3.__s, null != p3.getChildContext && (i3 = m(m({}, i3), p3.getChildContext())), M3 && !v3 && null != p3.getSnapshotBeforeUpdate && (_3 = p3.getSnapshotBeforeUpdate(y3, d3)), T4 = null != s3 && s3.type === S && null == s3.key ? E(s3.props.children) : s3, f3 = L(n2, g(T4) ? T4 : [T4], u3, t3, i3, r3, o3, e3, f3, c3, a3), p3.base = u3.__e, u3.__u &= -161, p3.__h.length && e3.push(p3), k4 && (p3.__E = p3.__ = null);
      } catch (n3) {
        if (e3.length = h5, u3.__v = null, c3 || null != o3) {
          if (n3.then) {
            for (u3.__u |= c3 ? 160 : 128; f3 && 8 == f3.nodeType && f3.nextSibling; ) f3 = f3.nextSibling;
            null != o3 && (o3[o3.indexOf(f3)] = null), u3.__e = f3;
          } else if (null != o3) for (j4 = o3.length; j4--; ) b(o3[j4]);
        } else u3.__e = t3.__e;
        null == u3.__k && (u3.__k = t3.__k || []), n3.then || B(u3), l.__e(n3, u3, t3);
      }
    } else null == o3 && u3.__v == t3.__v ? (u3.__k = t3.__k, u3.__e = t3.__e) : f3 = u3.__e = G(t3.__e, u3, t3, i3, r3, o3, e3, c3, a3);
    return (s3 = l.diffed) && s3(u3), 128 & u3.__u ? void 0 : f3;
  }
  function B(n2) {
    n2 && (n2.__c && (n2.__c.__e = true), n2.__k && n2.__k.some(B));
  }
  function D(n2, u3, t3) {
    for (var i3 = 0; i3 < t3.length; i3++) J(t3[i3], t3[++i3], t3[++i3]);
    l.__c && l.__c(u3, n2), n2.some(function(u4) {
      try {
        n2 = u4.__h, u4.__h = [], n2.some(function(n3) {
          n3.call(u4);
        });
      } catch (n3) {
        l.__e(n3, u4.__v);
      }
    });
  }
  function E(n2) {
    return "object" != typeof n2 || null == n2 || n2.__b > 0 ? n2 : g(n2) ? n2.map(E) : void 0 !== n2.constructor ? null : m({}, n2);
  }
  function G(u3, t3, i3, r3, o3, e3, f3, c3, a3) {
    var s3, h5, p3, v3, y3, w4, _3, m3 = i3.props || d, k4 = t3.props, x4 = t3.type;
    if ("svg" == x4 ? o3 = "http://www.w3.org/2000/svg" : "math" == x4 ? o3 = "http://www.w3.org/1998/Math/MathML" : o3 || (o3 = "http://www.w3.org/1999/xhtml"), null != e3) {
      for (s3 = 0; s3 < e3.length; s3++) if ((y3 = e3[s3]) && "setAttribute" in y3 == !!x4 && (x4 ? y3.localName == x4 : 3 == y3.nodeType)) {
        u3 = y3, e3[s3] = null;
        break;
      }
    }
    if (null == u3) {
      if (null == x4) return document.createTextNode(k4);
      u3 = document.createElementNS(o3, x4, k4.is && k4), c3 && (l.__m && l.__m(t3, e3), c3 = false), e3 = null;
    }
    if (null == x4) m3 === k4 || c3 && u3.data == k4 || (u3.data = k4);
    else {
      if (e3 = "textarea" == x4 && null != k4.defaultValue ? null : e3 && n.call(u3.childNodes), !c3 && null != e3) for (m3 = {}, s3 = 0; s3 < u3.attributes.length; s3++) m3[(y3 = u3.attributes[s3]).name] = y3.value;
      for (s3 in m3) y3 = m3[s3], "dangerouslySetInnerHTML" == s3 ? p3 = y3 : "children" == s3 || s3 in k4 || "value" == s3 && "defaultValue" in k4 || "checked" == s3 && "defaultChecked" in k4 || N(u3, s3, null, y3, o3);
      for (s3 in k4) y3 = k4[s3], "children" == s3 ? v3 = y3 : "dangerouslySetInnerHTML" == s3 ? h5 = y3 : "value" == s3 ? w4 = y3 : "checked" == s3 ? _3 = y3 : c3 && "function" != typeof y3 || m3[s3] === y3 || N(u3, s3, y3, m3[s3], o3);
      if (h5) c3 || p3 && (h5.__html == p3.__html || h5.__html == u3.innerHTML) || (u3.innerHTML = h5.__html), t3.__k = [];
      else if (p3 && (u3.innerHTML = ""), L("template" == t3.type ? u3.content : u3, g(v3) ? v3 : [v3], t3, i3, r3, "foreignObject" == x4 ? "http://www.w3.org/1999/xhtml" : o3, e3, f3, e3 ? e3[0] : i3.__k && $(i3, 0), c3, a3), null != e3) for (s3 = e3.length; s3--; ) b(e3[s3]);
      c3 && "textarea" != x4 || (s3 = "value", "progress" == x4 && null == w4 ? u3.removeAttribute("value") : null != w4 && (w4 !== u3[s3] || "progress" == x4 && !w4 || "option" == x4 && w4 != m3[s3]) && N(u3, s3, w4, m3[s3], o3), s3 = "checked", null != _3 && _3 != u3[s3] && N(u3, s3, _3, m3[s3], o3));
    }
    return u3;
  }
  function J(n2, u3, t3) {
    try {
      if ("function" == typeof n2) {
        var i3 = "function" == typeof n2.__u;
        i3 && n2.__u(), i3 && null == u3 || (n2.__u = n2(u3));
      } else n2.current = u3;
    } catch (n3) {
      l.__e(n3, t3);
    }
  }
  function K(n2, u3, t3) {
    var i3, r3;
    if (l.unmount && l.unmount(n2), (i3 = n2.ref) && (i3.current && i3.current != n2.__e || J(i3, null, u3)), null != (i3 = n2.__c)) {
      if (i3.componentWillUnmount) try {
        i3.componentWillUnmount();
      } catch (n3) {
        l.__e(n3, u3);
      }
      i3.base = i3.__P = i3.__n = null;
    }
    if (i3 = n2.__k) for (r3 = 0; r3 < i3.length; r3++) i3[r3] && K(i3[r3], u3, t3 || "function" != typeof n2.type);
    t3 || b(n2.__e), n2.__c = n2.__ = n2.__e = void 0;
  }
  function Q(n2, l3, u3) {
    return this.constructor(n2, u3);
  }
  function R2(u3, t3, i3) {
    var r3, o3, e3, f3;
    t3 == document && (t3 = document.documentElement), l.__ && l.__(u3, t3), o3 = (r3 = "function" == typeof i3) ? null : i3 && i3.__k || t3.__k, e3 = [], f3 = [], q(t3, u3 = (!r3 && i3 || t3).__k = k(S, null, [u3]), o3 || d, d, t3.namespaceURI, !r3 && i3 ? [i3] : o3 ? null : t3.firstChild ? n.call(t3.childNodes) : null, e3, !r3 && i3 ? i3 : o3 ? o3.__e : t3.firstChild, r3, f3), D(e3, u3, f3), u3.props.children = null;
  }
  function U2(n2, l3) {
    R2(n2, l3, U2);
  }
  function W2(l3, u3, t3) {
    var i3, r3, o3, e3, f3 = m({}, l3.props);
    for (o3 in l3.type && l3.type.defaultProps && (e3 = l3.type.defaultProps), u3) "key" == o3 ? i3 = u3[o3] : "ref" == o3 ? r3 = u3[o3] : f3[o3] = void 0 === u3[o3] && null != e3 ? e3[o3] : u3[o3];
    return arguments.length > 2 && (f3.children = arguments.length > 3 ? n.call(arguments, 2) : t3), x(l3.type, f3, i3 || l3.key, r3 || l3.ref, null);
  }
  function X(n2) {
    function l3(n3) {
      var u3, t3;
      return this.getChildContext || (u3 = /* @__PURE__ */ new Set(), (t3 = {})[l3.__c] = this, this.getChildContext = function() {
        return t3;
      }, this.componentWillUnmount = function() {
        u3 = null;
      }, this.shouldComponentUpdate = function(n4) {
        this.props.value != n4.value && u3.forEach(function(n5) {
          n5.__e = true, A(n5);
        });
      }, this.sub = function(n4) {
        u3.add(n4);
        var l4 = n4.componentWillUnmount;
        n4.componentWillUnmount = function() {
          u3 && u3.delete(n4), l4 && l4.call(n4);
        };
      }), n3.children;
    }
    return l3.__c = "__cC" + y++, l3.__ = n2, l3.Provider = l3.__l = (l3.Consumer = function(n3, l4) {
      return n3.children(l4);
    }).contextType = l3, l3;
  }
  n = w.slice, l = { __e: function(n2, l3, u3, t3) {
    for (var i3, r3, o3; l3 = l3.__; ) if ((i3 = l3.__c) && !i3.__) try {
      if ((r3 = i3.constructor) && null != r3.getDerivedStateFromError && (i3.setState(r3.getDerivedStateFromError(n2)), o3 = i3.__d), null != i3.componentDidCatch && (i3.componentDidCatch(n2, t3 || {}), o3 = i3.__d), o3) return i3.__E = i3;
    } catch (l4) {
      n2 = l4;
    }
    throw n2;
  } }, u = 0, t = function(n2) {
    return null != n2 && void 0 === n2.constructor;
  }, C.prototype.setState = function(n2, l3) {
    var u3;
    u3 = null != this.__s && this.__s != this.state ? this.__s : this.__s = m({}, this.state), "function" == typeof n2 && (n2 = n2(m({}, u3), this.props)), n2 && m(u3, n2), null != n2 && this.__v && (l3 && this._sb.push(l3), A(this));
  }, C.prototype.forceUpdate = function(n2) {
    this.__v && (this.__e = true, n2 && this.__h.push(n2), A(this));
  }, C.prototype.render = S, i = [], o = "function" == typeof Promise ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, e = function(n2, l3) {
    return n2.__v.__b - l3.__v.__b;
  }, H.__r = 0, f = Math.random().toString(8), c = "__d" + f, a = "__a" + f, s = /(PointerCapture)$|Capture$/i, h2 = 0, p = V(false), v = V(true), y = 0;

  // node_modules/preact/hooks/dist/hooks.module.js
  var t2;
  var r2;
  var u2;
  var i2;
  var o2 = 0;
  var f2 = [];
  var c2 = l;
  var e2 = c2.__b;
  var a2 = c2.__r;
  var v2 = c2.diffed;
  var l2 = c2.__c;
  var m2 = c2.unmount;
  var p2 = c2.__;
  function s2(n2, t3) {
    c2.__h && c2.__h(r2, n2, o2 || t3), o2 = 0;
    var u3 = r2.__H || (r2.__H = { __: [], __h: [] });
    return n2 >= u3.__.length && u3.__.push({}), u3.__[n2];
  }
  function d2(n2) {
    return o2 = 1, y2(D2, n2);
  }
  function y2(n2, u3, i3) {
    var o3 = s2(t2++, 2);
    if (o3.t = n2, !o3.__c && (o3.__ = [i3 ? i3(u3) : D2(void 0, u3), function(n3) {
      var t3 = o3.__N ? o3.__N[0] : o3.__[0], r3 = o3.t(t3, n3);
      t3 !== r3 && (o3.__N = [r3, o3.__[1]], o3.__c.setState({}));
    }], o3.__c = r2, !r2.__f)) {
      var f3 = function(n3, t3, r3) {
        if (!o3.__c.__H) return true;
        var u4 = false, i4 = o3.__c.props !== n3;
        if (o3.__c.__H.__.some(function(n4) {
          if (n4.__N) {
            u4 = true;
            var t4 = n4.__[0];
            n4.__ = n4.__N, n4.__N = void 0, t4 !== n4.__[0] && (i4 = true);
          }
        }), c3) {
          var f4 = c3.call(this, n3, t3, r3);
          return u4 ? f4 || i4 : f4;
        }
        return !u4 || i4;
      };
      r2.__f = true;
      var c3 = r2.shouldComponentUpdate, e3 = r2.componentWillUpdate;
      r2.componentWillUpdate = function(n3, t3, r3) {
        if (this.__e) {
          var u4 = c3;
          c3 = void 0, f3(n3, t3, r3), c3 = u4;
        }
        e3 && e3.call(this, n3, t3, r3);
      }, r2.shouldComponentUpdate = f3;
    }
    return o3.__N || o3.__;
  }
  function h3(n2, u3) {
    var i3 = s2(t2++, 3);
    !c2.__s && C2(i3.__H, u3) && (i3.__ = n2, i3.u = u3, r2.__H.__h.push(i3));
  }
  function _2(n2, u3) {
    var i3 = s2(t2++, 4);
    !c2.__s && C2(i3.__H, u3) && (i3.__ = n2, i3.u = u3, r2.__h.push(i3));
  }
  function A2(n2) {
    return o2 = 5, T2(function() {
      return { current: n2 };
    }, []);
  }
  function F2(n2, t3, r3) {
    o2 = 6, _2(function() {
      if ("function" == typeof n2) {
        var r4 = n2(t3());
        return function() {
          n2(null), r4 && "function" == typeof r4 && r4();
        };
      }
      if (n2) return n2.current = t3(), function() {
        return n2.current = null;
      };
    }, null == r3 ? r3 : r3.concat(n2));
  }
  function T2(n2, r3) {
    var u3 = s2(t2++, 7);
    return C2(u3.__H, r3) && (u3.__ = n2(), u3.__H = r3, u3.__h = n2), u3.__;
  }
  function q2(n2, t3) {
    return o2 = 8, T2(function() {
      return n2;
    }, t3);
  }
  function x2(n2) {
    var u3 = r2.context[n2.__c], i3 = s2(t2++, 9);
    return i3.c = n2, u3 ? (null == i3.__ && (i3.__ = true, u3.sub(r2)), u3.props.value) : n2.__;
  }
  function P2(n2, t3) {
    c2.useDebugValue && c2.useDebugValue(t3 ? t3(n2) : n2);
  }
  function b2(n2) {
    var u3 = s2(t2++, 10), i3 = d2();
    return u3.__ = n2, r2.componentDidCatch || (r2.componentDidCatch = function(n3, t3) {
      u3.__ && u3.__(n3, t3), i3[1](n3);
    }), [i3[0], function() {
      i3[1](void 0);
    }];
  }
  function g2() {
    var n2 = s2(t2++, 11);
    if (!n2.__) {
      for (var u3 = r2.__v; null !== u3 && !u3.__m && null !== u3.__; ) u3 = u3.__;
      var i3 = u3.__m || (u3.__m = [0, 0]);
      n2.__ = "P" + i3[0] + "-" + i3[1]++;
    }
    return n2.__;
  }
  function j2() {
    for (var n2; n2 = f2.shift(); ) {
      var t3 = n2.__H;
      if (n2.__P && t3) try {
        t3.__h.some(z2), t3.__h.some(B2), t3.__h = [];
      } catch (r3) {
        t3.__h = [], c2.__e(r3, n2.__v);
      }
    }
  }
  c2.__b = function(n2) {
    r2 = null, e2 && e2(n2);
  }, c2.__ = function(n2, t3) {
    n2 && t3.__k && t3.__k.__m && (n2.__m = t3.__k.__m), p2 && p2(n2, t3);
  }, c2.__r = function(n2) {
    a2 && a2(n2), t2 = 0;
    var i3 = (r2 = n2.__c).__H;
    i3 && (u2 === r2 ? (i3.__h = [], r2.__h = [], i3.__.some(function(n3) {
      n3.__N && (n3.__ = n3.__N), n3.u = n3.__N = void 0;
    })) : (i3.__h.some(z2), i3.__h.some(B2), i3.__h = [], t2 = 0)), u2 = r2;
  }, c2.diffed = function(n2) {
    v2 && v2(n2);
    var t3 = n2.__c;
    t3 && t3.__H && (t3.__H.__h.length && (1 !== f2.push(t3) && i2 === c2.requestAnimationFrame || ((i2 = c2.requestAnimationFrame) || w2)(j2)), t3.__H.__.some(function(n3) {
      n3.u && (n3.__H = n3.u, n3.u = void 0);
    })), u2 = r2 = null;
  }, c2.__c = function(n2, t3) {
    t3.some(function(n3) {
      try {
        n3.__h.some(z2), n3.__h = n3.__h.filter(function(n4) {
          return !n4.__ || B2(n4);
        });
      } catch (r3) {
        t3.some(function(n4) {
          n4.__h && (n4.__h = []);
        }), t3 = [], c2.__e(r3, n3.__v);
      }
    }), l2 && l2(n2, t3);
  }, c2.unmount = function(n2) {
    m2 && m2(n2);
    var t3, r3 = n2.__c;
    r3 && r3.__H && (r3.__H.__.some(function(n3) {
      try {
        z2(n3);
      } catch (n4) {
        t3 = n4;
      }
    }), r3.__H = void 0, t3 && c2.__e(t3, r3.__v));
  };
  var k2 = "function" == typeof requestAnimationFrame;
  function w2(n2) {
    var t3, r3 = function() {
      clearTimeout(u3), k2 && cancelAnimationFrame(t3), setTimeout(n2);
    }, u3 = setTimeout(r3, 35);
    k2 && (t3 = requestAnimationFrame(r3));
  }
  function z2(n2) {
    var t3 = r2, u3 = n2.__c;
    "function" == typeof u3 && (n2.__c = void 0, u3()), r2 = t3;
  }
  function B2(n2) {
    var t3 = r2;
    n2.__c = n2.__(), r2 = t3;
  }
  function C2(n2, t3) {
    return !n2 || n2.length !== t3.length || t3.some(function(t4, r3) {
      return t4 !== n2[r3];
    });
  }
  function D2(n2, t3) {
    return "function" == typeof t3 ? t3(n2) : t3;
  }

  // node_modules/preact/compat/dist/compat.module.js
  function g3(n2, t3) {
    for (var e3 in t3) n2[e3] = t3[e3];
    return n2;
  }
  function E2(n2, t3) {
    for (var e3 in n2) if ("__source" !== e3 && !(e3 in t3)) return true;
    for (var r3 in t3) if ("__source" !== r3 && n2[r3] !== t3[r3]) return true;
    return false;
  }
  function C3(n2, t3) {
    var e3 = t3(), r3 = d2({ t: { __: e3, u: t3 } }), u3 = r3[0].t, o3 = r3[1];
    return _2(function() {
      u3.__ = e3, u3.u = t3, R3(u3) && o3({ t: u3 });
    }, [n2, e3, t3]), h3(function() {
      return R3(u3) && o3({ t: u3 }), n2(function() {
        R3(u3) && o3({ t: u3 });
      });
    }, [n2]), e3;
  }
  function R3(n2) {
    try {
      return !((t3 = n2.__) === (e3 = n2.u()) && (0 !== t3 || 1 / t3 == 1 / e3) || t3 != t3 && e3 != e3);
    } catch (n3) {
      return true;
    }
    var t3, e3;
  }
  function x3(n2) {
    n2();
  }
  function w3(n2) {
    return n2;
  }
  function k3() {
    return [false, x3];
  }
  var I2 = _2;
  function M2(n2, t3) {
    this.props = n2, this.context = t3;
  }
  function N2(n2, e3) {
    function r3(n3) {
      var t3 = this.props.ref;
      return t3 != n3.ref && t3 && ("function" == typeof t3 ? t3(null) : t3.current = null), e3 ? !e3(this.props, n3) || t3 != n3.ref : E2(this.props, n3);
    }
    function u3(e4) {
      return this.shouldComponentUpdate = r3, k(n2, e4);
    }
    return u3.displayName = "Memo(" + (n2.displayName || n2.name) + ")", u3.__f = u3.prototype.isReactComponent = true, u3.type = n2, u3;
  }
  (M2.prototype = new C()).isPureReactComponent = true, M2.prototype.shouldComponentUpdate = function(n2, t3) {
    return E2(this.props, n2) || E2(this.state, t3);
  };
  var T3 = l.__b;
  l.__b = function(n2) {
    n2.type && n2.type.__f && n2.ref && (n2.props.ref = n2.ref, n2.ref = null), T3 && T3(n2);
  };
  var A3 = "undefined" != typeof Symbol && Symbol.for && Symbol.for("react.forward_ref") || 3911;
  function D3(n2) {
    function t3(t4) {
      var e3 = g3({}, t4);
      return delete e3.ref, n2(e3, t4.ref || null);
    }
    return t3.$$typeof = A3, t3.render = n2, t3.prototype.isReactComponent = t3.__f = true, t3.displayName = "ForwardRef(" + (n2.displayName || n2.name) + ")", t3;
  }
  var F3 = function(n2, t3) {
    return null == n2 ? null : F(F(n2).map(t3));
  };
  var L2 = { map: F3, forEach: F3, count: function(n2) {
    return n2 ? F(n2).length : 0;
  }, only: function(n2) {
    var t3 = F(n2);
    if (1 !== t3.length) throw "Children.only";
    return t3[0];
  }, toArray: F };
  var O2 = l.__e;
  l.__e = function(n2, t3, e3, r3) {
    if (n2.then) {
      for (var u3, o3 = t3; o3 = o3.__; ) if ((u3 = o3.__c) && u3.__c) return null == t3.__e && (t3.__e = e3.__e, t3.__k = e3.__k || []), u3.__c(n2, t3);
    }
    O2(n2, t3, e3, r3);
  };
  var U3 = l.unmount;
  function V2(n2, t3, e3) {
    return n2 && (n2.__c && n2.__c.__H && (n2.__c.__H.__.forEach(function(n3) {
      "function" == typeof n3.__c && n3.__c();
    }), n2.__c.__H = null), null != (n2 = g3({}, n2)).__c && (n2.__c.__P === e3 && (n2.__c.__P = t3), n2.__c.__e = true, n2.__c = null), n2.__k = n2.__k && n2.__k.map(function(n3) {
      return V2(n3, t3, e3);
    })), n2;
  }
  function W3(n2, t3, e3) {
    return n2 && e3 && (n2.__v = null, n2.__k = n2.__k && n2.__k.map(function(n3) {
      return W3(n3, t3, e3);
    }), n2.__c && n2.__c.__P === t3 && (n2.__e && e3.appendChild(n2.__e), n2.__c.__e = true, n2.__c.__P = e3)), n2;
  }
  function P3() {
    this.__u = 0, this.o = null, this.__b = null;
  }
  function j3(n2) {
    var t3 = n2.__ && n2.__.__c;
    return t3 && t3.__a && t3.__a(n2);
  }
  function z3(n2) {
    var e3, r3, u3, o3 = null;
    function i3(i4) {
      if (e3 || (e3 = n2()).then(function(n3) {
        n3 && (o3 = n3.default || n3), u3 = true;
      }, function(n3) {
        r3 = n3, u3 = true;
      }), r3) throw r3;
      if (!u3) throw e3;
      return o3 ? k(o3, i4) : null;
    }
    return i3.displayName = "Lazy", i3.__f = true, i3;
  }
  function B3() {
    this.i = null, this.l = null;
  }
  l.unmount = function(n2) {
    var t3 = n2.__c;
    t3 && (t3.__z = true), t3 && t3.__R && t3.__R(), t3 && 32 & n2.__u && (n2.type = null), U3 && U3(n2);
  }, (P3.prototype = new C()).__c = function(n2, t3) {
    var e3 = t3.__c, r3 = this;
    null == r3.o && (r3.o = []), r3.o.push(e3);
    var u3 = j3(r3.__v), o3 = false, i3 = function() {
      o3 || r3.__z || (o3 = true, e3.__R = null, u3 ? u3(f3) : f3());
    };
    e3.__R = i3;
    var l3 = e3.__P;
    e3.__P = null;
    var f3 = function() {
      if (!--r3.__u) {
        if (r3.state.__a) {
          var n3 = r3.state.__a;
          r3.__v.__k[0] = W3(n3, n3.__c.__P, n3.__c.__O);
        }
        var t4;
        for (r3.setState({ __a: r3.__b = null }); t4 = r3.o.pop(); ) t4.__P = l3, t4.forceUpdate();
      }
    };
    r3.__u++ || 32 & t3.__u || r3.setState({ __a: r3.__b = r3.__v.__k[0] }), n2.then(i3, i3);
  }, P3.prototype.componentWillUnmount = function() {
    this.o = [];
  }, P3.prototype.render = function(n2, e3) {
    if (this.__b) {
      if (this.__v.__k) {
        var r3 = document.createElement("div"), o3 = this.__v.__k[0].__c;
        this.__v.__k[0] = V2(this.__b, r3, o3.__O = o3.__P);
      }
      this.__b = null;
    }
    var i3 = e3.__a && k(S, null, n2.fallback);
    return i3 && (i3.__u &= -33), [k(S, null, e3.__a ? null : n2.children), i3];
  };
  var H2 = function(n2, t3, e3) {
    if (++e3[1] === e3[0] && n2.l.delete(t3), n2.props.revealOrder && ("t" !== n2.props.revealOrder[0] || !n2.l.size)) for (e3 = n2.i; e3; ) {
      for (; e3.length > 3; ) e3.pop()();
      if (e3[1] < e3[0]) break;
      n2.i = e3 = e3[2];
    }
  };
  function Z(n2) {
    return this.getChildContext = function() {
      return n2.context;
    }, n2.children;
  }
  function Y(n2) {
    var e3 = this, r3 = n2.h;
    if (e3.componentWillUnmount = function() {
      R2(null, e3.v), e3.v = null, e3.h = null;
    }, e3.h && e3.h !== r3 && e3.componentWillUnmount(), !e3.v) {
      for (var u3 = e3.__v; null !== u3 && !u3.__m && null !== u3.__; ) u3 = u3.__;
      e3.h = r3, e3.v = { nodeType: 1, parentNode: r3, childNodes: [], __k: { __m: u3.__m }, contains: function() {
        return true;
      }, namespaceURI: r3.namespaceURI, insertBefore: function(n3, t3) {
        this.childNodes.push(n3), e3.h.insertBefore(n3, t3);
      }, removeChild: function(n3) {
        this.childNodes.splice(this.childNodes.indexOf(n3) >>> 1, 1), e3.h.removeChild(n3);
      } };
    }
    R2(k(Z, { context: e3.context }, n2.__v), e3.v);
  }
  function $2(n2, e3) {
    var r3 = k(Y, { __v: n2, h: e3 });
    return r3.containerInfo = e3, r3;
  }
  (B3.prototype = new C()).__a = function(n2) {
    var t3 = this, e3 = j3(t3.__v), r3 = t3.l.get(n2);
    return r3[0]++, function(u3) {
      var o3 = function() {
        t3.props.revealOrder ? (r3.push(u3), H2(t3, n2, r3)) : u3();
      };
      e3 ? e3(o3) : o3();
    };
  }, B3.prototype.render = function(n2) {
    this.i = null, this.l = /* @__PURE__ */ new Map();
    var t3 = F(n2.children);
    n2.revealOrder && "b" === n2.revealOrder[0] && t3.reverse();
    for (var e3 = t3.length; e3--; ) this.l.set(t3[e3], this.i = [1, 0, this.i]);
    return n2.children;
  }, B3.prototype.componentDidUpdate = B3.prototype.componentDidMount = function() {
    var n2 = this;
    this.l.forEach(function(t3, e3) {
      H2(n2, e3, t3);
    });
  };
  var q3 = "undefined" != typeof Symbol && Symbol.for && Symbol.for("react.element") || 60103;
  var G2 = /^(?:accent|alignment|arabic|baseline|cap|clip(?!PathU)|color|dominant|fill|flood|font|glyph(?!R)|horiz|image(!S)|letter|lighting|marker(?!H|W|U)|overline|paint|pointer|shape|stop|strikethrough|stroke|text(?!L)|transform|underline|unicode|units|v|vector|vert|word|writing|x(?!C))[A-Z]/;
  var J2 = /^on(Ani|Tra|Tou|BeforeInp|Compo)/;
  var K2 = /[A-Z0-9]/g;
  var Q2 = "undefined" != typeof document;
  var X2 = function(n2) {
    return ("undefined" != typeof Symbol && "symbol" == typeof Symbol() ? /fil|che|rad/ : /fil|che|ra/).test(n2);
  };
  function nn(n2, t3, e3) {
    return null == t3.__k && (t3.textContent = ""), R2(n2, t3), "function" == typeof e3 && e3(), n2 ? n2.__c : null;
  }
  function tn(n2, t3, e3) {
    return U2(n2, t3), "function" == typeof e3 && e3(), n2 ? n2.__c : null;
  }
  C.prototype.isReactComponent = true, ["componentWillMount", "componentWillReceiveProps", "componentWillUpdate"].forEach(function(t3) {
    Object.defineProperty(C.prototype, t3, { configurable: true, get: function() {
      return this["UNSAFE_" + t3];
    }, set: function(n2) {
      Object.defineProperty(this, t3, { configurable: true, writable: true, value: n2 });
    } });
  });
  var en = l.event;
  l.event = function(n2) {
    return en && (n2 = en(n2)), n2.persist = function() {
    }, n2.isPropagationStopped = function() {
      return this.cancelBubble;
    }, n2.isDefaultPrevented = function() {
      return this.defaultPrevented;
    }, n2.nativeEvent = n2;
  };
  var rn;
  var un = { configurable: true, get: function() {
    return this.class;
  } };
  var on = l.vnode;
  l.vnode = function(n2) {
    "string" == typeof n2.type && (function(n3) {
      var t3 = n3.props, e3 = n3.type, u3 = {}, o3 = -1 == e3.indexOf("-");
      for (var i3 in t3) {
        var l3 = t3[i3];
        if (!("value" === i3 && "defaultValue" in t3 && null == l3 || Q2 && "children" === i3 && "noscript" === e3 || "class" === i3 || "className" === i3)) {
          var f3 = i3.toLowerCase();
          "defaultValue" === i3 && "value" in t3 && null == t3.value ? i3 = "value" : "download" === i3 && true === l3 ? l3 = "" : "translate" === f3 && "no" === l3 ? l3 = false : "o" === f3[0] && "n" === f3[1] ? "ondoubleclick" === f3 ? i3 = "ondblclick" : "onchange" !== f3 || "input" !== e3 && "textarea" !== e3 || X2(t3.type) ? "onfocus" === f3 ? i3 = "onfocusin" : "onblur" === f3 ? i3 = "onfocusout" : J2.test(i3) && (i3 = f3) : f3 = i3 = "oninput" : o3 && G2.test(i3) ? i3 = i3.replace(K2, "-$&").toLowerCase() : null === l3 && (l3 = void 0), "oninput" === f3 && u3[i3 = f3] && (i3 = "oninputCapture"), u3[i3] = l3;
        }
      }
      "select" == e3 && (u3.multiple && Array.isArray(u3.value) && (u3.value = F(t3.children).forEach(function(n4) {
        n4.props.selected = -1 != u3.value.indexOf(n4.props.value);
      })), null != u3.defaultValue && (u3.value = F(t3.children).forEach(function(n4) {
        n4.props.selected = u3.multiple ? -1 != u3.defaultValue.indexOf(n4.props.value) : u3.defaultValue == n4.props.value;
      }))), t3.class && !t3.className ? (u3.class = t3.class, Object.defineProperty(u3, "className", un)) : t3.className && (u3.class = u3.className = t3.className), n3.props = u3;
    })(n2), n2.$$typeof = q3, on && on(n2);
  };
  var ln = l.__r;
  l.__r = function(n2) {
    ln && ln(n2), rn = n2.__c;
  };
  var fn = l.diffed;
  l.diffed = function(n2) {
    fn && fn(n2);
    var t3 = n2.props, e3 = n2.__e;
    null != e3 && "textarea" === n2.type && "value" in t3 && t3.value !== e3.value && (e3.value = null == t3.value ? "" : t3.value), rn = null;
  };
  var an = { ReactCurrentDispatcher: { current: { readContext: function(n2) {
    return rn.__n[n2.__c].props.value;
  }, useCallback: q2, useContext: x2, useDebugValue: P2, useDeferredValue: w3, useEffect: h3, useId: g2, useImperativeHandle: F2, useInsertionEffect: I2, useLayoutEffect: _2, useMemo: T2, useReducer: y2, useRef: A2, useState: d2, useSyncExternalStore: C3, useTransition: k3 } } };
  var cn = "18.3.1";
  function sn(n2) {
    return k.bind(null, n2);
  }
  function hn(n2) {
    return !!n2 && n2.$$typeof === q3;
  }
  function vn(n2) {
    return hn(n2) && n2.type === S;
  }
  function dn(n2) {
    return !!n2 && "string" == typeof n2.displayName && 0 == n2.displayName.indexOf("Memo(");
  }
  function mn(n2) {
    return hn(n2) ? W2.apply(null, arguments) : n2;
  }
  function pn(n2) {
    return !!n2.__k && (R2(null, n2), true);
  }
  function yn(n2) {
    return n2 && (n2.base || 1 === n2.nodeType && n2) || null;
  }
  var _n = function(n2, t3) {
    return n2(t3);
  };
  var bn = function(n2, t3) {
    var r3, u3 = l.debounceRendering;
    l.debounceRendering = function(n3) {
      r3 = n3;
    };
    try {
      var o3 = n2(t3);
      return r3 && r3(), o3;
    } finally {
      l.debounceRendering = u3;
    }
  };
  var Sn = hn;
  var gn = { useState: d2, useId: g2, useReducer: y2, useEffect: h3, useLayoutEffect: _2, useInsertionEffect: I2, useTransition: k3, useDeferredValue: w3, useSyncExternalStore: C3, startTransition: x3, useRef: A2, useImperativeHandle: F2, useMemo: T2, useCallback: q2, useContext: x2, useDebugValue: P2, version: "18.3.1", Children: L2, render: nn, hydrate: tn, unmountComponentAtNode: pn, createPortal: $2, createElement: k, createContext: X, createFactory: sn, cloneElement: mn, createRef: M, Fragment: S, isValidElement: hn, isElement: Sn, isFragment: vn, isMemo: dn, findDOMNode: yn, Component: C, PureComponent: M2, memo: N2, forwardRef: D3, flushSync: bn, unstable_batchedUpdates: _n, StrictMode: S, Suspense: P3, SuspenseList: B3, lazy: z3, __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: an };

  // core/ui/react.js
  var bundled = Object.freeze({
    name: "preact",
    site: false,
    React: compat_module_exports,
    createRoot: (container2) => ({ render: (v3) => nn(v3, container2), unmount: () => nn(null, container2) }),
    createPortal: $2,
    flushSync: bn ?? ((fn2) => fn2())
  });
  var locked = null;
  var siteReadyFlag = false;
  function markSiteReady() {
    siteReadyFlag = true;
  }
  function getRenderer() {
    if (locked) return locked;
    const site = getSite();
    if (typeof site.renderer === "function") {
      let r3 = null;
      try {
        r3 = site.renderer();
      } catch {
        r3 = null;
      }
      if (r3 && r3.React && typeof r3.createRoot === "function") return locked = Object.freeze({ name: "site", site: true, flushSync: (fn2) => fn2(), ...r3 });
      if (!siteReadyFlag) return null;
    }
    return locked = bundled;
  }
  var getReact3 = () => getRenderer()?.React ?? null;
  var usingSiteRenderer = () => !!getRenderer()?.site;
  function siteComponent(name) {
    if (!usingSiteRenderer()) return null;
    const c3 = getSite().components;
    try {
      return (typeof c3 === "function" ? c3(name) : c3?.[name]) ?? null;
    } catch {
      return null;
    }
  }
  var Fragment2 = Symbol.for("react.fragment");
  function h4(type, props, ...children) {
    const R4 = getReact3();
    if (!R4) throw new Error("Userscript++: 渲染器尚未就绪");
    if (type === Fragment2) type = R4.Fragment;
    return R4.createElement(type, props, ...children);
  }
  var hook2 = (name) => (...args) => getReact3()[name](...args);
  var useState2 = hook2("useState");
  var useEffect2 = hook2("useEffect");
  var useLayoutEffect2 = hook2("useLayoutEffect");
  var useMemo = hook2("useMemo");
  var useRef2 = hook2("useRef");
  var useCallback = hook2("useCallback");
  var useReducer2 = hook2("useReducer");
  var useContext = hook2("useContext");
  var useId = hook2("useId");
  var useSyncExternalStore = hook2("useSyncExternalStore");
  function useForceUpdate() {
    const [, f3] = useReducer2((x4) => x4 + 1, 0);
    return f3;
  }
  function useSubscription2(subscribe6) {
    const force = useForceUpdate();
    useEffect2(() => subscribe6(() => force()), []);
  }
  var EBs = /* @__PURE__ */ new WeakMap();
  function getErrorBoundary() {
    const R4 = getReact3();
    if (!R4) return null;
    if (EBs.has(R4)) return EBs.get(R4);
    class ErrorBoundary3 extends R4.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }
      static getDerivedStateFromError(error) {
        return { error };
      }
      componentDidCatch(error, info) {
        console.error("[Userscript++] 组件渲染出错", this.props.label || "", error, info?.componentStack);
        this.props.onError?.(error);
      }
      render() {
        if (this.state.error) {
          const fb = this.props.fallback;
          return typeof fb === "function" ? fb(this.state.error) : fb ?? null;
        }
        return this.props.children ?? null;
      }
    }
    EBs.set(R4, ErrorBoundary3);
    return ErrorBoundary3;
  }
  function ErrorBoundary2(props) {
    const C4 = getErrorBoundary();
    return C4 ? h4(C4, props) : props.children;
  }
  ErrorBoundary2.wrap = (Component, fallback = null) => {
    const Wrapped = (props) => h4(ErrorBoundary2, { fallback, label: Component.displayName || Component.name }, h4(Component, props));
    Wrapped.displayName = `UsppBoundary(${Component.displayName || Component.name || "Component"})`;
    return Wrapped;
  };

  // core/lib/plugins.js
  var logger12 = new Logger("PluginManager", "#a5b4fc");
  var StartAt = Object.freeze({
    Init: "Init",
    DOMContentLoaded: "DOMContentLoaded",
    SiteReady: "SiteReady",
    // 旧名:Turbopack 站点上"模块稳定"就是站点就绪
    TurbopackReady: "SiteReady"
  });
  var OptionType = Object.freeze({
    STRING: 0,
    NUMBER: 1,
    BIGINT: 2,
    BOOLEAN: 3,
    SELECT: 4,
    SLIDER: 5,
    COMPONENT: 6,
    CUSTOM: 7
  });
  var plugins = {};
  var depEnabled = /* @__PURE__ */ new Set();
  var runtimeRegistered = /* @__PURE__ */ new Set();
  var otherSites = /* @__PURE__ */ new Set();
  var cleanup = /* @__PURE__ */ new Map();
  var definePlugin = (def2) => def2;
  function definePluginSettings(def2, checks) {
    const ds = {
      def: def2,
      checks: checks ?? {},
      pluginName: null,
      get store() {
        if (!this.pluginName) throw new Error("插件注册前不能访问 settings.store");
        return Settings.plugins[this.pluginName];
      },
      get plain() {
        if (!this.pluginName) throw new Error("插件注册前不能访问 settings.plain");
        return PlainSettings.plugins[this.pluginName] ??= {};
      },
      use(keys) {
        const React = getReact3();
        const [, force] = React.useReducer((x4) => x4 + 1, 0);
        const name = this.pluginName;
        React.useEffect(() => {
          const prefix = `plugins.${name}.`;
          const fn2 = (_3, path) => {
            const key = path.slice(prefix.length).split(".")[0];
            if (!keys || keys.includes(key)) force();
          };
          SettingsStore.addPrefixChangeListener(prefix, fn2);
          return () => SettingsStore.removePrefixChangeListener(prefix, fn2);
        }, [name]);
        return this.store;
      },
      withPrivateSettings() {
        return this;
      }
    };
    return ds;
  }
  function getSettingDefault(setting) {
    if (!setting) return void 0;
    if (setting.type === OptionType.SELECT) return setting.options?.find((o3) => o3.default)?.value;
    return setting.default;
  }
  setDefaultResolver((pluginName, key) => {
    if (key === "enabled") return void 0;
    const s3 = plugins[pluginName]?.settings?.def?.[key];
    return getSettingDefault(s3);
  });
  function isPluginEnabled(name) {
    const p3 = plugins[name];
    if (!p3) return false;
    if (p3.chromiumOnly && !isChromium()) return false;
    if (p3.required || depEnabled.has(name)) return true;
    const stored = PlainSettings.plugins[name]?.enabled;
    if (typeof stored === "boolean") return stored;
    return !!p3.enabledByDefault;
  }
  var isEnabledAsDependency = (name) => depEnabled.has(name);
  var pluginHasPatches = (p3) => Array.isArray(p3.patches) && p3.patches.length > 0;
  var needsRestart = (p3) => pluginHasPatches(p3) && !!getSite().driver || !!p3.requiresRestart;
  function bindMethods(p3) {
    for (const k4 of Object.keys(p3)) {
      if (k4 === "start" || k4 === "stop") continue;
      const v3 = p3[k4];
      if (typeof v3 === "function" && !v3.$$usppBound && !(v3.prototype && v3.prototype.isReactComponent) && k4 !== "icon") {
        const bound = v3.bind(p3);
        Object.defineProperty(bound, "$$usppBound", { value: true });
        p3[k4] = bound;
      }
    }
  }
  function addPlugin(def2, { runtime: runtime2 = false } = {}) {
    if (!def2 || !def2.name) throw new Error("插件必须有 name");
    if (plugins[def2.name]) return false;
    if (def2.dev && !IS_DEV) return false;
    if (def2.site == null) def2.site = runtime2 ? getSite().id : "*";
    if (def2.site !== "*" && def2.site !== getSite().id) {
      otherSites.add(def2.name);
      if (runtime2) logger12.warn(`${def2.name} 属于站点 ${def2.site},不是当前站点,未注册`);
      return false;
    }
    const p3 = def2;
    p3.started = false;
    if (p3.settings) p3.settings.pluginName = p3.name;
    bindMethods(p3);
    PlainSettings.plugins[p3.name] ??= {};
    plugins[p3.name] = p3;
    if (runtime2) runtimeRegistered.add(p3.name);
    return true;
  }
  var patchesNotApplicable = /* @__PURE__ */ new Set();
  var siteHasDriver = () => !!getSite().driver;
  function registerPatches() {
    for (const p3 of Object.values(plugins)) {
      if (!pluginHasPatches(p3) || runtimeRegistered.has(p3.name)) continue;
      if (!siteHasDriver()) {
        patchesNotApplicable.add(p3.name);
        continue;
      }
      const enabled = isPluginEnabled(p3.name);
      if (!enabled && !IS_DEV) continue;
      p3.patches.forEach((patch, i3) => {
        try {
          addPatch(patch, p3.name, { checkOnly: !enabled, key: `${p3.name}#${i3}` });
        } catch (e3) {
          logger12.error(`登记 ${p3.name} 的第 ${i3} 条补丁失败`, e3);
        }
      });
    }
  }
  function pluginSlots(p3) {
    const out = { ...p3.slots || {} };
    const aliases = getSite().pluginAliases || {};
    for (const [field, map] of Object.entries(aliases)) {
      if (p3[field] == null || typeof map !== "function") continue;
      let extra = null;
      try {
        extra = map(p3[field], p3);
      } catch (e3) {
        logger12.error(`${p3.name}.${field} 转换失败`, e3);
      }
      for (const [slot, v3] of Object.entries(extra || {})) {
        if (v3 == null) continue;
        out[slot] = out[slot] ? [].concat(out[slot], v3) : v3;
      }
    }
    return out;
  }
  function track(name, fn2) {
    let list = cleanup.get(name);
    if (!list) cleanup.set(name, list = []);
    list.push(fn2);
  }
  function runCleanup(name) {
    const list = cleanup.get(name) || [];
    cleanup.delete(name);
    for (const fn2 of list.reverse()) {
      try {
        fn2();
      } catch (e3) {
        logger12.error(`${name} 清理出错`, e3);
      }
    }
  }
  function subscribeZustand(p3) {
    for (const [storeName, conf] of Object.entries(p3.zustand || {})) {
      let unsub = null, cancelled = false;
      const attach = (store2) => {
        if (cancelled) return;
        const handler = (cur, prev) => {
          try {
            conf.handler.call(p3, cur, prev);
          } catch (e3) {
            logger12.error(`${p3.name} 的 ${storeName} 处理函数出错`, e3);
          }
        };
        if (conf.selector) {
          if (store2.subscribe.length >= 2) {
            try {
              unsub = store2.subscribe(conf.selector, handler);
              if (typeof unsub === "function") return;
            } catch {
            }
          }
          let last2 = conf.selector(store2.getState());
          unsub = store2.subscribe((state) => {
            const next = conf.selector(state);
            if (Object.is(next, last2)) return;
            const prev = last2;
            last2 = next;
            handler(next, prev);
          });
        } else {
          unsub = store2.subscribe(handler);
        }
      };
      const store = findStore2(storeName);
      let cancelWait = null;
      if (store) attach(store);
      else cancelWait = waitFor(filters.byStoreName(storeName), (m3) => {
        const key = "use" + storeName.replace(/^use/, "").replace(/Store$/, "") + "Store";
        attach(m3[key]);
      });
      track(p3.name, () => {
        cancelled = true;
        cancelWait?.();
        if (typeof unsub === "function") unsub();
      });
    }
  }
  function startPlugin(p3, stack = []) {
    if (typeof p3 === "string") p3 = plugins[p3];
    if (!p3) return false;
    if (p3.started) return true;
    if (stack.includes(p3.name)) {
      logger12.error(`发现循环依赖:${[...stack, p3.name].join(" -> ")}`);
      return false;
    }
    for (const dep of p3.dependencies || []) {
      const d3 = plugins[dep];
      if (!d3) {
        logger12.warn(`${p3.name} 依赖的插件 ${dep} 不存在`);
        return false;
      }
      if (!d3.started) {
        if (!isPluginEnabled(dep)) {
          depEnabled.add(dep);
          Settings.plugins[dep].enabled = true;
        }
        if (!startPlugin(d3, [...stack, p3.name])) return false;
      }
    }
    try {
      if (p3.managedStyle) {
        enableStyle(p3.managedStyle);
        if (!pluginHasPatches(p3)) track(p3.name, () => disableStyle(p3.managedStyle));
      }
      p3.start?.();
      for (const [slot, value] of Object.entries(pluginSlots(p3))) {
        const list = Array.isArray(value) ? value : [value];
        list.forEach((item, i3) => {
          if (!item) return;
          const id = list.length > 1 ? `${p3.name}:${i3}` : p3.name;
          addSlotItem(slot, id, item);
          track(p3.name, () => removeSlotItem(slot, id));
        });
      }
      for (const [ev, handler] of Object.entries(p3.events || {})) {
        const off = subscribe(ev, (data) => handler.call(p3, data));
        track(p3.name, off);
      }
      if (p3.zustand) subscribeZustand(p3);
      if (typeof p3.onSettingsChange === "function") {
        const prefix = `plugins.${p3.name}.`;
        const fn2 = (v3, path) => {
          if (path === `${prefix}enabled`) return;
          try {
            p3.onSettingsChange(v3, path);
          } catch (e3) {
            logger12.error(`${p3.name}.onSettingsChange 出错`, e3);
          }
        };
        SettingsStore.addPrefixChangeListener(prefix, fn2);
        track(p3.name, () => SettingsStore.removePrefixChangeListener(prefix, fn2));
      }
      p3.started = true;
      logger12.debug(`已启动 ${p3.name}`);
      return true;
    } catch (e3) {
      logger12.error(`启动 ${p3.name} 失败`, e3);
      runCleanup(p3.name);
      if (p3.managedStyle && !pluginHasPatches(p3)) disableStyle(p3.managedStyle);
      p3.started = false;
      return false;
    }
  }
  function stopPlugin(p3) {
    if (typeof p3 === "string") p3 = plugins[p3];
    if (!p3) return false;
    if (!p3.started) return true;
    try {
      p3.stop?.();
    } catch (e3) {
      logger12.error(`${p3.name}.stop 出错`, e3);
    }
    runCleanup(p3.name);
    if (p3.managedStyle && !pluginHasPatches(p3)) {
      try {
        disableStyle(p3.managedStyle);
      } catch (e3) {
        logger12.error(e3);
      }
    }
    for (const sel of p3.cleanupSelectors || []) {
      try {
        document.querySelectorAll(sel).forEach((el) => el.remove());
      } catch (e3) {
        logger12.error(`${p3.name} 清理选择器 ${sel} 出错`, e3);
      }
    }
    p3.started = false;
    logger12.debug(`已停止 ${p3.name}`);
    return true;
  }
  function syncEnabled(p3, enabled) {
    if (p3.required || depEnabled.has(p3.name) || isPluginEnabled(p3.name) === enabled) return;
    Settings.plugins[p3.name].enabled = enabled;
    dispatch(Events.PLUGIN_TOGGLE, { name: p3.name, enabled });
  }
  function startPluginApi(p3) {
    if (typeof p3 === "string") p3 = plugins[p3];
    const ok = startPlugin(p3);
    if (ok) syncEnabled(p3, true);
    return ok;
  }
  function stopPluginApi(p3) {
    if (typeof p3 === "string") p3 = plugins[p3];
    const ok = stopPlugin(p3);
    if (ok && p3) syncEnabled(p3, false);
    return ok;
  }
  function togglePlugin(name) {
    const p3 = plugins[name];
    if (!p3) return false;
    if (p3.required || depEnabled.has(name)) return false;
    const next = !isPluginEnabled(name);
    Settings.plugins[name].enabled = next;
    if (next) startPlugin(p3);
    else stopPlugin(p3);
    dispatch(Events.PLUGIN_TOGGLE, { name, enabled: next });
    return needsRestart(p3);
  }
  function registerPlugin(def2) {
    if (!addPlugin(def2, { runtime: true })) return false;
    const known = Settings.plugins.Settings?.knownPlugins;
    if (known && known[def2.name] == null) known[def2.name] = Date.now();
    return true;
  }
  function cleanStaleSettings() {
    for (const name of Object.keys(PlainSettings.plugins)) {
      if (!plugins[name] && !otherSites.has(name)) delete Settings.plugins[name];
    }
  }
  function recordKnownPlugins() {
    const s3 = Settings.plugins.Settings;
    if (!s3) return;
    if (!PlainSettings.plugins.Settings.knownPlugins || typeof PlainSettings.plugins.Settings.knownPlugins !== "object") s3.knownPlugins = {};
    const known = s3.knownPlugins;
    const now = Date.now();
    for (const name of Object.keys(plugins)) if (known[name] == null) known[name] = now;
  }
  function enforceDependencies() {
    for (const p3 of Object.values(plugins)) {
      if (!isPluginEnabled(p3.name)) continue;
      for (const d3 of p3.dependencies || []) {
        const dep = plugins[d3];
        if (!dep) {
          logger12.warn(`${p3.name} 依赖的插件 ${d3} 不在当前站点`);
          continue;
        }
        if (!isPluginEnabled(d3)) {
          depEnabled.add(d3);
          Settings.plugins[d3].enabled = true;
        }
      }
    }
    if (PlainSettings.plugins.Settings && PlainSettings.plugins.Settings.enabled === false) Settings.plugins.Settings.enabled = true;
  }
  function startAllAt(stage) {
    const failed = [];
    for (const p3 of Object.values(plugins)) {
      if ((p3.startAt ?? StartAt.Init) !== stage) continue;
      if (!isPluginEnabled(p3.name) || p3.started) continue;
      if (!startPlugin(p3)) failed.push(p3);
    }
    return failed;
  }
  function sensitiveKeys(name) {
    const def2 = plugins[name]?.settings?.def;
    return def2 ? Object.keys(def2).filter((k4) => def2[k4]?.sensitive) : [];
  }
  function getVisibleSettings(p3) {
    const def2 = p3?.settings?.def;
    if (!def2) return [];
    return Object.entries(def2).filter(([, s3]) => s3 && !s3.hidden && s3.type !== OptionType.CUSTOM);
  }
  function migratePluginSettings(name, ...oldNames) {
    const all = PlainSettings.plugins;
    const cur = all[name];
    if (cur && Object.keys(cur).length) return false;
    for (const old of oldNames) {
      if (old !== name && all[old] && typeof all[old] === "object") {
        Settings.plugins[name] = { ...all[old] };
        delete Settings.plugins[old];
        logger12.info(`已把插件设置 ${old} 迁移到 ${name}`);
        return true;
      }
    }
    return false;
  }
  function migratePluginSetting(pluginName, newKey, oldKey) {
    const s3 = PlainSettings.plugins[pluginName];
    if (!s3 || !(oldKey in s3) || newKey in s3) return false;
    Settings.plugins[pluginName][newKey] = s3[oldKey];
    delete Settings.plugins[pluginName][oldKey];
    return true;
  }

  // core/lib/backup.js
  var logger13 = new Logger("Backup", "#93c5fd");
  var BACKUP_FORMAT = "userscript-pp-settings";
  var clone = (v3) => parseStored(serialize(v3)) ?? JSON.parse(serialize(v3));
  function exportSettings({ includeSensitive = false } = {}) {
    const settings2 = clone(PlainSettings);
    if (!includeSensitive) {
      for (const name of Object.keys(settings2.plugins || {})) {
        for (const k4 of sensitiveKeys(name)) if (settings2.plugins[name] && k4 in settings2.plugins[name]) delete settings2.plugins[name][k4];
      }
    }
    return { format: BACKUP_FORMAT, version: VERSION, exportedAt: (/* @__PURE__ */ new Date()).toISOString(), settings: settings2 };
  }
  function parseBackup(text) {
    let obj;
    try {
      obj = typeof text === "string" ? JSON.parse(text) : text;
    } catch {
      throw new Error("This file is not valid JSON.");
    }
    const settings2 = obj && obj.format === BACKUP_FORMAT ? obj.settings : obj;
    const data = parseStored(settings2);
    if (!data) throw new Error("No Userscript++ settings found in this file.");
    const names = Object.keys(data.plugins);
    const s3 = data.plugins.Settings || {};
    const parts = s3.sites && typeof s3.sites === "object" ? Object.values(s3.sites) : [];
    const themes = parts.reduce((n2, p3) => n2 + (Array.isArray(p3?.themes) ? p3.themes.length : 0), Array.isArray(s3.themes) ? s3.themes.length : 0);
    return {
      settings: data,
      summary: {
        plugins: names.length,
        enabled: names.filter((n2) => data.plugins[n2]?.enabled === true).length,
        themes,
        sites: parts.length,
        quickCss: parts.some((p3) => typeof p3?.customCSS === "string" && p3.customCSS.length > 0) || typeof s3.customCSS === "string" && s3.customCSS.length > 0,
        version: obj?.version ?? null,
        exportedAt: obj?.exportedAt ?? null
      }
    };
  }
  async function importSettings(settings2) {
    const data = clone(settings2);
    data.plugins ??= {};
    for (const name of Object.keys(PlainSettings.plugins)) {
      for (const k4 of sensitiveKeys(name)) {
        const cur = PlainSettings.plugins[name]?.[k4];
        const inc = data.plugins[name]?.[k4];
        if ((inc == null || inc === "") && cur != null && cur !== "") (data.plugins[name] ??= {})[k4] = cur;
      }
    }
    const before = Object.fromEntries(Object.keys(plugins).map((n2) => [n2, isPluginEnabled(n2)]));
    for (const name of Object.keys(plugins)) data.plugins[name] ??= {};
    replaceAll(data);
    let reload = false;
    for (const [name, was] of Object.entries(before)) {
      const p3 = plugins[name];
      const now = isPluginEnabled(name);
      if (was === now) continue;
      if (needsRestart(p3)) reload = true;
      try {
        if (now) startPlugin(p3);
        else stopPlugin(p3);
      } catch (e3) {
        logger13.error(`导入后启停 ${name} 失败`, e3);
      }
      dispatch(Events.PLUGIN_TOGGLE, { name, enabled: now });
    }
    await saveNow();
    if (reload) dispatch(Events.RELOAD_NEEDED, { reason: "import" });
    return reload;
  }
  function downloadJson(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a3 = document.createElement("a");
    a3.href = url;
    a3.download = filename;
    a3.style.display = "none";
    (document.body || document.documentElement).appendChild(a3);
    a3.click();
    setTimeout(() => {
      a3.remove();
      URL.revokeObjectURL(url);
    }, 1e3);
  }
  var backupFilename = () => `userscript-pp-settings-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
  function pickJsonFile() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.style.display = "none";
      input.onchange = () => {
        const f3 = input.files?.[0];
        input.remove();
        if (!f3) return resolve(null);
        f3.text().then(resolve, () => resolve(null));
      };
      (document.body || document.documentElement).appendChild(input);
      input.click();
    });
  }

  // core/lib/net.js
  function fetchExternal(url, { timeout = 3e4 } = {}) {
    if (!GM.xhr) return W.fetch(url);
    return new Promise((resolve, reject) => {
      GM.xhr({
        method: "GET",
        url,
        timeout,
        responseType: "text",
        onload: (r3) => {
          const headers = new Headers();
          for (const line of String(r3.responseHeaders || "").split(/\r?\n/)) {
            const i3 = line.indexOf(":");
            if (i3 > 0) {
              try {
                headers.append(line.slice(0, i3).trim(), line.slice(i3 + 1).trim());
              } catch {
              }
            }
          }
          const status = r3.status || 200;
          const body = status === 204 || status === 304 ? null : r3.responseText ?? r3.response ?? "";
          try {
            resolve(new Response(body, { status: status < 200 || status > 599 ? 200 : status, statusText: r3.statusText || "", headers }));
          } catch (e3) {
            reject(e3);
          }
        },
        onerror: () => reject(new Error("网络错误")),
        ontimeout: () => reject(new Error("请求超时")),
        onabort: () => reject(new Error("请求被中止"))
      });
    });
  }

  // core/lib/themes.js
  var logger14 = new Logger("Themes", "#fcd34d");
  var cssCache = /* @__PURE__ */ new Map();
  var applied = /* @__PURE__ */ new Set();
  var CACHE_KEY = "UserscriptPPThemeCache";
  var REFRESH_MS = 24 * 60 * 60 * 1e3;
  var diskCache = null;
  function readDisk() {
    if (diskCache) return diskCache;
    diskCache = {};
    try {
      const v3 = GM.get ? GM.get(CACHE_KEY) : null;
      if (v3 && typeof v3 === "object" && typeof v3.then !== "function") diskCache = { ...v3 };
      else if (typeof v3 === "string") diskCache = JSON.parse(v3) || {};
    } catch {
      diskCache = {};
    }
    return diskCache;
  }
  function writeDisk() {
    try {
      const r3 = GM.set?.(CACHE_KEY, diskCache || {});
      r3?.catch?.(() => {
      });
    } catch (e3) {
      logger14.debug("写入主题缓存失败", e3);
    }
  }
  function cacheCss(url, css) {
    cssCache.set(url, css);
    readDisk()[url] = { css, at: Date.now() };
    writeDisk();
  }
  function dropCache(url) {
    cssCache.delete(url);
    if (readDisk()[url]) {
      delete diskCache[url];
      writeDisk();
    }
  }
  var SITES_PATH = "plugins.Settings.sites";
  var EMPTY = Object.freeze({});
  function readPartition(key = siteKey()) {
    const p3 = raw().sites?.[key];
    return p3 && typeof p3 === "object" ? p3 : EMPTY;
  }
  function writePartition(key = siteKey()) {
    const r3 = raw();
    if (!r3.sites || typeof r3.sites !== "object" || Array.isArray(r3.sites)) S2().sites = {};
    if (!r3.sites[key] || typeof r3.sites[key] !== "object") S2().sites[key] = {};
    return S2().sites[key];
  }
  var themesOf = (part) => Array.isArray(part?.themes) ? part.themes : [];
  function migrateLegacyLayout() {
    const r3 = raw();
    const keys = ["themes", "customCSS", "customCSSEnabled", "chunkFingerprint"];
    if (!keys.some((k4) => k4 in r3) && !("customCSSMatches" in r3)) return false;
    const target2 = getSites().find((s3) => s3.legacySettings)?.id;
    if (target2) {
      const plain = readPartition(target2);
      const store = writePartition(target2);
      for (const k4 of keys) {
        if (!(k4 in r3) || k4 in plain) continue;
        let v3 = r3[k4];
        if (k4 === "themes" && Array.isArray(v3)) v3 = v3.map((t3) => {
          const { matches, ...rest } = t3 || {};
          return Array.isArray(matches) && matches.some((m3) => m3 === "*" || m3 === "<all_urls>" || m3 === "*://*/*") ? { ...rest, allSites: true } : rest;
        });
        store[k4] = v3;
      }
    }
    for (const k4 of [...keys, "customCSSMatches"]) if (k4 in r3) delete S2()[k4];
    logger14.info(`已把旧版主题与 Quick CSS 搬到${target2 ? `站点分区 ${target2}` : "(没有目标分区,已丢弃)"}`);
    return true;
  }
  var listeners2 = /* @__PURE__ */ new Set();
  var emit2 = () => {
    for (const l3 of [...listeners2]) {
      try {
        l3();
      } catch {
      }
    }
  };
  var subscribeThemes = (fn2) => {
    listeners2.add(fn2);
    return () => listeners2.delete(fn2);
  };
  var S2 = () => Settings.plugins.Settings;
  var raw = () => PlainSettings.plugins.Settings ??= {};
  var styleName = (id) => `theme:${id}`;
  function themesList() {
    return themesOf(readPartition());
  }
  var getThemes = () => themesList().map((t3) => ({ ...t3 }));
  function foreignAllSiteThemes() {
    const key = siteKey(), out = [];
    for (const [k4, part] of Object.entries(raw().sites || {})) if (k4 !== key) {
      for (const t3 of themesOf(part)) if (t3?.allSites) out.push(t3);
    }
    return out;
  }
  var isThemesEnabled = () => raw().themesEnabled !== false;
  var isOnlineThemesEnabled = () => raw().onlineThemesEnabled !== false;
  function saveThemes(list) {
    writePartition().themes = list.map((t3) => ({ ...t3 }));
    emit2();
  }
  function parseThemeMeta(css) {
    const meta = {};
    const m3 = /\/\*\*([\s\S]*?)\*\//.exec(css);
    if (m3) {
      for (const line of m3[1].split(/\r?\n/)) {
        const mm = /@(name|author|description)\s+(.+)$/.exec(line.replace(/^\s*\*?\s*/, ""));
        if (mm) meta[mm[1]] = mm[2].trim();
      }
    }
    return meta;
  }
  function nameFromUrl(url) {
    try {
      const file = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
      return file.replace(/\.css$/i, "").replace(/[-_]+/g, " ").trim() || url;
    } catch {
      return url;
    }
  }
  function validateThemeUrl(url) {
    let u3;
    try {
      u3 = new URL(String(url).trim());
    } catch {
      return "Enter a valid URL.";
    }
    if (u3.protocol !== "https:") return "Enter a valid URL.";
    if (!/\.css$/i.test(u3.pathname)) return "URL must point to a .css file.";
    return null;
  }
  async function fetchCss(url) {
    let res;
    try {
      res = await fetchExternal(url, { timeout: 3e4 });
    } catch (e3) {
      throw new Error(`Failed to fetch theme (${e3?.message || "network error"}).`);
    }
    if (!res.ok) throw new Error(`Failed to fetch theme (${res.status}).`);
    const css = await res.text();
    if (!css.trim()) throw new Error("Theme file is empty.");
    return css;
  }
  function applyTheme(t3) {
    const name = styleName(t3.url);
    if (!isThemesEnabled() || !t3.enabled) {
      disableStyle(name);
      return;
    }
    applied.add(t3.url);
    if (t3.local) {
      registerStyle(name, t3.css || "");
      return;
    }
    if (!isOnlineThemesEnabled()) {
      disableStyle(name);
      return;
    }
    const mem = cssCache.get(t3.url);
    if (mem != null) {
      registerStyle(name, mem);
      return;
    }
    const disk = readDisk()[t3.url];
    if (disk && typeof disk.css === "string") {
      cssCache.set(t3.url, disk.css);
      registerStyle(name, disk.css);
      if (Date.now() - (disk.at || 0) < REFRESH_MS) return;
    }
    fetchCss(t3.url).then((css) => {
      cacheCss(t3.url, css);
      const cur = [...themesList(), ...foreignAllSiteThemes()].find((x4) => x4.url === t3.url);
      if (!cur || !cur.enabled || !isThemesEnabled() || !isOnlineThemesEnabled()) return;
      registerStyle(name, css);
    }).catch((e3) => logger14.warn(`加载在线主题失败${disk ? "(继续使用缓存)" : ""}:${t3.url}`, e3.message));
  }
  function applyAllThemes() {
    const list = [...themesList(), ...foreignAllSiteThemes()];
    const ids = new Set(list.map((t3) => t3.url));
    for (const id of [...applied]) if (!ids.has(id)) {
      unregisterStyle(styleName(id));
      applied.delete(id);
    }
    for (const t3 of list) applyTheme(t3);
  }
  async function addTheme(url) {
    url = String(url || "").trim();
    const err = validateThemeUrl(url);
    if (err) throw new Error(err);
    if (themesList().some((t3) => t3.url === url)) throw new Error("This theme is already added.");
    const css = await fetchCss(url);
    cacheCss(url, css);
    const meta = parseThemeMeta(css);
    const theme = { url, name: meta.name || nameFromUrl(url), author: meta.author || "", description: meta.description || "", enabled: false };
    if (themesList().some((t3) => t3.url === url)) throw new Error("This theme is already added.");
    saveThemes([...themesList(), theme]);
    return { ...theme };
  }
  var randomId = () => "local-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  function addLocalTheme(name, css) {
    const meta = parseThemeMeta(css || "");
    const theme = {
      url: randomId(),
      name: String(name || "").trim() || meta.name || "Untitled",
      author: meta.author || "Local",
      description: meta.description || "",
      enabled: false,
      local: true,
      css: String(css || "")
    };
    saveThemes([...themesList(), theme]);
    return { ...theme };
  }
  function updateLocalTheme(id, { name, css } = {}) {
    const list = themesList().map((t4) => ({ ...t4 }));
    const t3 = list.find((x4) => x4.url === id && x4.local);
    if (!t3) return false;
    if (name != null) t3.name = String(name);
    if (css != null) {
      t3.css = String(css);
      const meta = parseThemeMeta(t3.css);
      if (meta.description != null) t3.description = meta.description;
      if (meta.author) t3.author = meta.author;
    }
    saveThemes(list);
    applyTheme(t3);
    return true;
  }
  function removeTheme(id) {
    const list = themesList();
    if (!list.some((t3) => t3.url === id)) return false;
    unregisterStyle(styleName(id));
    applied.delete(id);
    dropCache(id);
    saveThemes(list.filter((t3) => t3.url !== id));
    return true;
  }
  function setEnabled(id, enabled) {
    const list = themesList().map((t4) => ({ ...t4 }));
    const t3 = list.find((x4) => x4.url === id);
    if (!t3) return false;
    t3.enabled = enabled;
    saveThemes(list);
    if (enabled) applyTheme(t3);
    else disableStyle(styleName(id));
    return true;
  }
  var enableTheme = (id) => setEnabled(id, true);
  var disableTheme = (id) => setEnabled(id, false);
  function setThemeAllSites(id, allSites) {
    const list = themesList().map((t4) => ({ ...t4 }));
    const t3 = list.find((x4) => x4.url === id);
    if (!t3) return false;
    if (allSites) t3.allSites = true;
    else delete t3.allSites;
    saveThemes(list);
    applyTheme(t3);
    return true;
  }
  function setThemesEnabled(b3) {
    S2().themesEnabled = !!b3;
    if (b3) applyAllThemes();
    else for (const t3 of [...themesList(), ...foreignAllSiteThemes()]) disableStyle(styleName(t3.url));
    emit2();
  }
  function setOnlineThemesEnabled(b3) {
    S2().onlineThemesEnabled = !!b3;
    for (const t3 of [...themesList(), ...foreignAllSiteThemes()]) if (!t3.local) {
      if (b3) applyTheme(t3);
      else disableStyle(styleName(t3.url));
    }
    emit2();
  }
  var QUICK_CSS = "quick-css";
  function getQuickCss() {
    const p3 = readPartition();
    return { css: p3.customCSS || "", enabled: p3.customCSSEnabled !== false };
  }
  function setQuickCss({ css, enabled } = {}) {
    const st = writePartition();
    if (css != null) st.customCSS = String(css);
    if (enabled != null) st.customCSSEnabled = !!enabled;
  }
  function applyQuickCss() {
    const { css, enabled } = getQuickCss();
    if (enabled && css) registerStyle(QUICK_CSS, css);
    else disableStyle(QUICK_CSS);
  }

  // core/lib/dom.js
  var logger15 = new Logger("DOM", "#a7f3d0");
  var subs = /* @__PURE__ */ new Set();
  var mo = null;
  var pendingAdded = /* @__PURE__ */ new Set();
  var pendingRemoved = /* @__PURE__ */ new Set();
  var scheduled = false;
  var selfNodes = /* @__PURE__ */ new WeakSet();
  var selfWrites = /* @__PURE__ */ new WeakMap();
  var raf = (cb) => typeof requestAnimationFrame === "function" ? requestAnimationFrame(cb) : setTimeout(cb, 16);
  function isSelfRecord(r3) {
    if (r3.type === "childList") {
      const nodes = [...r3.addedNodes, ...r3.removedNodes];
      return nodes.length > 0 && nodes.every((n2) => selfNodes.has(n2));
    }
    const set = selfWrites.get(r3.target);
    if (!set) return false;
    if (r3.type === "attributes") return set.has(r3.attributeName);
    return set.has("#text");
  }
  function collect(records) {
    for (const r3 of records) {
      if (isSelfRecord(r3)) continue;
      if (r3.type !== "childList") continue;
      for (const n2 of r3.addedNodes) if (n2.nodeType === 1) pendingAdded.add(n2);
      for (const n2 of r3.removedNodes) if (n2.nodeType === 1) pendingRemoved.add(n2);
    }
    if ((pendingAdded.size || pendingRemoved.size) && !scheduled) {
      scheduled = true;
      raf(flush);
    }
  }
  function matchesIn(node, selector) {
    const out = [];
    try {
      if (node.matches?.(selector)) out.push(node);
      if (node.querySelectorAll) out.push(...node.querySelectorAll(selector));
    } catch {
    }
    return out;
  }
  function flush() {
    scheduled = false;
    const added = [...pendingAdded].filter((n2) => n2.isConnected), removed = [...pendingRemoved].filter((n2) => !n2.isConnected);
    pendingAdded = /* @__PURE__ */ new Set();
    pendingRemoved = /* @__PURE__ */ new Set();
    for (const s3 of [...subs]) {
      if (s3.added) {
        const hits = /* @__PURE__ */ new Set();
        for (const n2 of added) for (const m3 of matchesIn(n2, s3.selector)) if (!s3.root || s3.root.contains(m3)) hits.add(m3);
        for (const el of hits) {
          try {
            s3.added(el);
          } catch (e3) {
            logger15.error("observe 回调出错", e3);
          }
        }
      }
      if (s3.removed) {
        const hits = /* @__PURE__ */ new Set();
        for (const n2 of removed) for (const m3 of matchesIn(n2, s3.selector)) hits.add(m3);
        for (const el of hits) {
          try {
            s3.removed(el);
          } catch (e3) {
            logger15.error("observe 回调出错", e3);
          }
        }
      }
    }
  }
  function ensureObserver() {
    if (mo) return;
    const target2 = document.documentElement || document;
    mo = new MutationObserver(collect);
    mo.observe(target2, { childList: true, subtree: true });
  }
  function observe(selector, { added, removed, root: root2 } = {}) {
    const s3 = { selector, added, removed, root: root2 };
    subs.add(s3);
    ensureObserver();
    if (added) raf(() => {
      if (!subs.has(s3)) return;
      for (const el of matchesIn(root2 || document, selector)) {
        try {
          added(el);
        } catch (e3) {
          logger15.error("observe 回调出错", e3);
        }
      }
    });
    return () => subs.delete(s3);
  }
  function waitForElement(selector, { root: root2, timeout = 0 } = {}) {
    const now = (root2 || document).querySelector?.(selector);
    if (now) return Promise.resolve(now);
    return new Promise((resolve) => {
      let timer2 = 0;
      const off = observe(selector, { root: root2, added: (el) => {
        off();
        clearTimeout(timer2);
        resolve(el);
      } });
      if (timeout > 0) timer2 = setTimeout(() => {
        off();
        resolve(null);
      }, timeout);
    });
  }
  function markWrite(el, key) {
    let set = selfWrites.get(el);
    if (!set) selfWrites.set(el, set = /* @__PURE__ */ new Set());
    set.add(key);
    if (mo) collect(mo.takeRecords());
  }
  function setAttr(el, name, value) {
    if (!el) return false;
    if (value == null || value === false) {
      if (!el.hasAttribute(name)) return false;
      el.removeAttribute(name);
    } else {
      const v3 = value === true ? "" : String(value);
      if (el.getAttribute(name) === v3) return false;
      el.setAttribute(name, v3);
    }
    markWrite(el, name);
    return true;
  }
  function setText(el, text) {
    if (!el) return false;
    const v3 = String(text ?? "");
    if (el.textContent === v3) return false;
    el.textContent = v3;
    markWrite(el, "#text");
    for (const n2 of el.childNodes) selfNodes.add(n2);
    return true;
  }
  function toggleClass(el, name, force) {
    if (!el) return false;
    const has2 = el.classList.contains(name);
    const want = force === void 0 ? !has2 : !!force;
    if (has2 === want) return false;
    el.classList.toggle(name, want);
    markWrite(el, "class");
    return true;
  }
  function setStyle(el, prop, value) {
    if (!el) return false;
    const v3 = value == null ? "" : String(value);
    if (el.style.getPropertyValue(prop) === v3) return false;
    if (v3) el.style.setProperty(prop, v3);
    else el.style.removeProperty(prop);
    markWrite(el, "style");
    return true;
  }
  function mount(parent, node, before = null) {
    if (!parent || !node) return node;
    selfNodes.add(node);
    if (node.parentNode === parent && (before == null ? node === parent.lastChild || node.nextSibling == null : node.nextSibling === before)) return node;
    parent.insertBefore(node, before);
    if (mo) collect(mo.takeRecords());
    return node;
  }
  function unmount(node) {
    if (!node?.parentNode) return;
    selfNodes.add(node);
    node.remove();
    if (mo) collect(mo.takeRecords());
  }

  // core/lib/route.js
  var installed2 = false;
  var last = null;
  var parser = null;
  function setRouteParser(fn2) {
    parser = typeof fn2 === "function" ? fn2 : null;
  }
  function check() {
    const url = location.href;
    if (url === last) return;
    const prev = last;
    last = url;
    let info;
    if (parser) {
      try {
        info = parser(new URL(url));
      } catch {
        info = void 0;
      }
    }
    dispatch(Events.ROUTE_CHANGE, { url, previous: prev, info });
  }
  function installRouteWatcher() {
    if (installed2) return;
    installed2 = true;
    last = location.href;
    const H3 = W.history;
    for (const name of ["pushState", "replaceState"]) {
      const orig = H3[name];
      if (typeof orig !== "function") continue;
      const wrapped = function(...args) {
        const r3 = orig.apply(this, args);
        try {
          check();
        } catch {
        }
        return r3;
      };
      try {
        H3[name] = wrapped;
      } catch {
      }
    }
    W.addEventListener("popstate", check);
    W.addEventListener("hashchange", check);
  }
  function onRouteChange(fn2) {
    installRouteWatcher();
    return subscribe(Events.ROUTE_CHANGE, fn2);
  }

  // core/lib/network.js
  var logger16 = new Logger("Network", "#c4b5fd");
  var reqSubs = /* @__PURE__ */ new Set();
  var resSubs = /* @__PURE__ */ new Set();
  var installed3 = false;
  var test = (matcher, url, method) => {
    try {
      if (!matcher) return true;
      if (typeof matcher === "string") return url.includes(matcher);
      if (matcher instanceof RegExp) return matcher.test(url);
      if (typeof matcher === "function") return !!matcher(url, method);
    } catch {
    }
    return false;
  };
  var call = (fn2, ctx) => {
    try {
      const r3 = fn2(ctx);
      r3?.catch?.((e3) => logger16.error("网络回调出错", e3));
    } catch (e3) {
      logger16.error("网络回调出错", e3);
    }
  };
  async function readChunks(res, onChunk) {
    const reader = res.body?.getReader?.();
    if (!reader) {
      onChunk(await res.text(), true);
      return;
    }
    const dec = new TextDecoder();
    for (; ; ) {
      const { value, done } = await reader.read();
      if (done) {
        onChunk("", true);
        break;
      }
      onChunk(dec.decode(value, { stream: true }), false);
    }
  }
  function wrapFetch() {
    const orig = W.fetch;
    if (typeof orig !== "function") return;
    const wrapped = function(input, init) {
      let url = "", method = "GET";
      try {
        url = typeof input === "string" ? input : input?.url ?? String(input);
        method = (init?.method || input?.method || "GET").toUpperCase();
      } catch {
      }
      for (const s3 of reqSubs) if (test(s3.matcher, url, method)) call(s3.handler, { url, method, init, input });
      const p3 = orig.apply(this, arguments);
      if (resSubs.size) p3.then((res) => {
        for (const s3 of resSubs) if (test(s3.matcher, url, method)) {
          call(s3.handler, {
            url,
            method,
            status: res.status,
            headers: res.headers,
            type: "fetch",
            clone: () => res.clone(),
            text: () => res.clone().text(),
            json: () => res.clone().json(),
            onChunk: (cb) => readChunks(res.clone(), cb)
          });
        }
      }, () => {
      });
      return p3;
    };
    try {
      W.fetch = wrapped;
    } catch (e3) {
      logger16.warn("无法包装 fetch", e3);
    }
  }
  function wrapXhr() {
    const X3 = W.XMLHttpRequest;
    if (!X3?.prototype) return;
    const open2 = X3.prototype.open, send = X3.prototype.send;
    X3.prototype.open = function(method, url) {
      this.__usppReq = { method: String(method || "GET").toUpperCase(), url: String(url) };
      return open2.apply(this, arguments);
    };
    X3.prototype.send = function(body) {
      const info = this.__usppReq;
      if (info) {
        for (const s3 of reqSubs) if (test(s3.matcher, info.url, info.method)) call(s3.handler, { ...info, body, type: "xhr" });
        if (resSubs.size) this.addEventListener("load", () => {
          for (const s3 of resSubs) if (test(s3.matcher, info.url, info.method)) {
            const text = () => Promise.resolve(this.responseType === "" || this.responseType === "text" ? this.responseText : "");
            call(s3.handler, { ...info, status: this.status, type: "xhr", text, json: () => text().then(JSON.parse), clone: () => null, onChunk: (cb) => text().then((t3) => cb(t3, true)) });
          }
        });
      }
      return send.apply(this, arguments);
    };
  }
  function installNetworkHooks() {
    if (installed3) return;
    installed3 = true;
    wrapFetch();
    wrapXhr();
  }
  function onRequest(matcher, handler) {
    installNetworkHooks();
    const s3 = { matcher, handler };
    reqSubs.add(s3);
    return () => reqSubs.delete(s3);
  }
  function onResponse(matcher, handler) {
    installNetworkHooks();
    const s3 = { matcher, handler };
    resSubs.add(s3);
    return () => resSubs.delete(s3);
  }

  // core/lib/menu.js
  var logger17 = new Logger("Menu", "#fcd34d");
  var registered = /* @__PURE__ */ new Map();
  function sync2() {
    if (!GM.menu) return;
    const items = getSlotItems("menuCommand");
    const ids = new Set(items.map((d3) => d3.id));
    for (const [id, r3] of registered) {
      if (ids.has(id)) continue;
      try {
        GM.unmenu?.(r3.handle);
      } catch {
      }
      registered.delete(id);
    }
    for (const d3 of items) {
      const label = String(d3.label ?? d3.id);
      const r3 = registered.get(d3.id);
      if (r3 && r3.label === label) {
        r3.def = d3;
        continue;
      }
      if (r3) {
        try {
          GM.unmenu?.(r3.handle);
        } catch {
        }
      }
      const entry = { label, def: d3, handle: null };
      try {
        entry.handle = GM.menu(label, () => {
          try {
            (entry.def.onSelect || entry.def.onClick)?.({});
          } catch (e3) {
            logger17.error(`菜单命令 ${label} 出错`, e3);
          }
        });
      } catch (e3) {
        logger17.debug("注册菜单命令失败", e3);
      }
      registered.set(d3.id, entry);
    }
  }
  var installed4 = false;
  function installMenuCommands() {
    if (installed4) return;
    installed4 = true;
    onSlotChange("menuCommand", sync2);
    sync2();
  }

  // core/lib/fiber.js
  function getFiber2(el) {
    if (!el) return null;
    for (const k4 of Object.keys(el)) {
      if (k4.startsWith("__reactFiber$") || k4.startsWith("__reactInternalInstance$")) return el[k4];
    }
    return null;
  }
  function getProps(el) {
    if (!el) return null;
    for (const k4 of Object.keys(el)) if (k4.startsWith("__reactProps$")) return el[k4];
    return null;
  }
  function walkFiberUp(fiber, predicate, max = 200) {
    for (let f3 = fiber, i3 = 0; f3 && i3 < max; f3 = f3.return, i3++) {
      try {
        if (predicate(f3)) return f3;
      } catch {
      }
    }
    return null;
  }
  function findFiberProps(el, key, max = 200) {
    const f3 = walkFiberUp(getFiber2(el), (f4) => f4.memoizedProps && key in f4.memoizedProps, max);
    return f3 ? f3.memoizedProps : null;
  }

  // core/lib/jsxhook.js
  var logger18 = new Logger("RenderHook", "#fca5a5");
  var hooks = /* @__PURE__ */ new Map();
  var stringHooks = /* @__PURE__ */ new Map();
  var installed5 = false;
  var target = null;
  function isWritableJsx(exp) {
    try {
      if (!exp || typeof exp !== "object") return false;
      const d3 = Object.getOwnPropertyDescriptor(exp, "jsx");
      const d22 = Object.getOwnPropertyDescriptor(exp, "jsxs");
      return !!(d3 && d22 && "value" in d3 && d3.writable && typeof d3.value === "function" && typeof d22.value === "function" && exp.Fragment);
    } catch {
      return false;
    }
  }
  function locate() {
    const c3 = runtime.cache;
    if (c3) for (const id of Object.keys(c3)) {
      const exp = c3[id]?.exports;
      if (isWritableJsx(exp)) return exp;
    }
    for (const exp of moduleCache.values()) if (isWritableJsx(exp)) return exp;
    return null;
  }
  var busy = false;
  function wrap(orig) {
    const wrapped = function(type, props, key) {
      const set = typeof type === "string" ? stringHooks.get(type) : hooks.get(type);
      if (!set || busy || !props) return orig.apply(this, arguments);
      busy = true;
      try {
        for (const fn2 of set) {
          try {
            const out = fn2(props, key, (p3 = props) => orig.call(this, type, p3, key));
            if (out !== void 0) return out;
          } catch (e3) {
            logger18.error("渲染兜底钩子出错", e3);
          }
        }
      } finally {
        busy = false;
      }
      return orig.apply(this, arguments);
    };
    wrapped.$$usppOriginal = orig;
    return wrapped;
  }
  function install() {
    if (installed5) return true;
    target = locate();
    if (!target) return false;
    try {
      target.jsx = wrap(target.jsx);
      target.jsxs = wrap(target.jsxs);
      installed5 = true;
      logger18.debug("已挂接 jsx 运行时");
      return true;
    } catch (e3) {
      logger18.warn("挂接 jsx 运行时失败", e3);
      return false;
    }
  }
  var waiting = false;
  function ensureInstalled() {
    if (install() || waiting) return;
    waiting = true;
    const off = onModuleLoad(() => {
      if (install()) {
        off();
        waiting = false;
      }
    });
  }
  function addRenderHook(type, fn2) {
    if (!type) return () => {
    };
    const map = typeof type === "string" ? stringHooks : hooks;
    let set = map.get(type);
    if (!set) map.set(type, set = /* @__PURE__ */ new Set());
    set.add(fn2);
    ensureInstalled();
    return () => set.delete(fn2);
  }
  var asArray = (c3) => c3 == null ? [] : Array.isArray(c3) ? c3 : [c3];
  function treeHas(node, test2, depth = 6) {
    if (node == null || depth < 0) return false;
    if (Array.isArray(node)) return node.some((n2) => treeHas(n2, test2, depth));
    if (typeof node !== "object") return false;
    if (test2(node)) return true;
    return treeHas(node.props?.children, test2, depth - 1);
  }

  // core/ui/components.js
  var components_exports = {};
  __export(components_exports, {
    Button: () => Button,
    CodeEditor: () => CodeEditor,
    Fragment: () => Fragment2,
    IconButton: () => IconButton,
    Input: () => Input,
    Row: () => Row,
    Select: () => Select,
    Switch: () => Switch,
    Tooltip: () => Tooltip
  });
  function withFallback(nativeRender, fallbackRender, label) {
    return (props) => {
      const fb = fallbackRender(props);
      let g4 = null;
      try {
        g4 = nativeRender(props);
      } catch {
        g4 = null;
      }
      if (!g4) return fb;
      return h4(ErrorBoundary2, { fallback: fb, label }, g4);
    };
  }
  var Button = withFallback(
    ({ variant = "outline", size = "md", onClick, disabled, children, title, className, type = "button" }) => {
      const B4 = siteComponent("Button");
      if (!B4) return null;
      const v3 = variant === "danger" ? "danger" : variant;
      return h4(B4, { variant: v3, size, shape: "pill", onClick, disabled, title, className, type }, children);
    },
    ({ variant = "outline", size, onClick, disabled, children, title, className, type = "button" }) => h4("button", {
      type,
      onClick,
      disabled,
      title,
      className: classes("uspp-btn", variant === "primary" && "uspp-btn-primary", variant === "danger" && "uspp-btn-danger", variant === "ghost" && "uspp-btn-ghost", size === "sm" && "uspp-btn-sm", className)
    }, children),
    "Button"
  );
  function IconButton({ icon: Icon, label, onClick, active, disabled, className, size = 4 }) {
    return h4("button", {
      type: "button",
      "aria-label": label,
      title: label,
      onClick,
      disabled,
      className: classes("uspp-btn", "uspp-btn-icon", active && "uspp-active", className)
    }, h4(Icon, { size }));
  }
  var Switch = withFallback(
    ({ checked, onChange, disabled, label }) => {
      const S3 = siteComponent("Switch");
      if (!S3) return null;
      return h4(S3, { checked: !!checked, onCheckedChange: (v3) => onChange?.(!!v3), disabled: !!disabled, "aria-label": label });
    },
    ({ checked, onChange, disabled, label }) => h4("button", {
      type: "button",
      role: "switch",
      "aria-checked": !!checked,
      "aria-label": label,
      "data-checked": String(!!checked),
      className: "uspp-switch",
      disabled: !!disabled,
      onClick: () => onChange?.(!checked)
    }),
    "Switch"
  );
  var Select = withFallback(
    ({ value, options, onChange, label }) => {
      const [S3, SelectTrigger, SelectValue, SelectContent, SelectItem] = ["Select", "SelectTrigger", "SelectValue", "SelectContent", "SelectItem"].map(siteComponent);
      if (!S3 || !SelectTrigger || !SelectValue || !SelectContent || !SelectItem) return null;
      const idx = options.findIndex((o3) => Object.is(o3.value, value));
      return h4(
        S3,
        { value: idx >= 0 ? String(idx) : void 0, onValueChange: (v3) => onChange?.(options[+v3]?.value) },
        h4(SelectTrigger, { "aria-label": label, style: { minWidth: 140 } }, h4(SelectValue, null)),
        h4(SelectContent, null, options.map((o3, i3) => h4(SelectItem, { key: i3, value: String(i3) }, o3.label)))
      );
    },
    ({ value, options, onChange, label }) => {
      const idx = options.findIndex((o3) => Object.is(o3.value, value));
      return h4(
        "select",
        { className: "uspp-select", "aria-label": label, value: idx >= 0 ? String(idx) : "", onChange: (e3) => onChange?.(options[+e3.target.value]?.value) },
        idx < 0 && h4("option", { value: "" }, ""),
        options.map((o3, i3) => h4("option", { key: i3, value: String(i3) }, o3.label))
      );
    },
    "Select"
  );
  function Input(props) {
    const { className, onEnter, ...rest } = props;
    return h4("input", {
      ...rest,
      className: classes("uspp-input", className),
      onKeyDown: (e3) => {
        if (e3.key === "Enter" && onEnter) {
          e3.preventDefault();
          onEnter(e3);
        }
        rest.onKeyDown?.(e3);
      }
    });
  }
  function CodeEditor({ value, onChange, placeholder, readOnly, minHeight = 240 }) {
    return h4("textarea", {
      className: "uspp-textarea",
      value,
      placeholder,
      readOnly: !!readOnly,
      spellCheck: false,
      style: { minHeight },
      onChange: (e3) => onChange?.(e3.target.value),
      onKeyDown: (e3) => {
        if (e3.key === "Tab" && !readOnly) {
          e3.preventDefault();
          const t3 = e3.target, s3 = t3.selectionStart, en2 = t3.selectionEnd;
          const next = t3.value.slice(0, s3) + "    " + t3.value.slice(en2);
          onChange?.(next);
          requestAnimationFrame(() => {
            t3.selectionStart = t3.selectionEnd = s3 + 4;
          });
        }
      }
    });
  }
  var Tooltip = withFallback(
    ({ content, children }) => {
      const [T4, TooltipTrigger, TooltipContent] = ["Tooltip", "TooltipTrigger", "TooltipContent"].map(siteComponent);
      if (!T4 || !TooltipTrigger || !TooltipContent || !content) return null;
      return h4(T4, null, h4(TooltipTrigger, { asChild: true }, children), h4(TooltipContent, null, content));
    },
    ({ content, children }) => h4("span", { title: typeof content === "string" ? content : void 0, style: { display: "inline-flex" } }, children),
    "Tooltip"
  );
  function Row({ title, description, children }) {
    return h4(
      "div",
      { className: "uspp-row" },
      h4(
        "div",
        { className: "uspp-row-text" },
        h4("div", { className: "uspp-row-title" }, title),
        description && h4("div", { className: "uspp-muted uspp-small" }, description)
      ),
      children
    );
  }

  // core/ui/icons.js
  var icons_exports = {};
  __export(icons_exports, {
    ArchiveIcon: () => ArchiveIcon,
    CheckIcon: () => CheckIcon,
    ChevronRightIcon: () => ChevronRightIcon,
    ChromiumIcon: () => ChromiumIcon,
    CloseIcon: () => CloseIcon,
    CodeIcon: () => CodeIcon,
    CopyIcon: () => CopyIcon,
    EditIcon: () => EditIcon,
    InfoIcon: () => InfoIcon,
    LockIcon: () => LockIcon,
    LogoIcon: () => LogoIcon,
    PaletteIcon: () => PaletteIcon,
    PinFillIcon: () => PinFillIcon,
    PinIcon: () => PinIcon,
    PlugIcon: () => PlugIcon,
    PuzzleIcon: () => PuzzleIcon,
    ReloadIcon: () => ReloadIcon,
    SlidersIcon: () => SlidersIcon,
    StarFillIcon: () => StarFillIcon,
    StarIcon: () => StarIcon,
    TrashIcon: () => TrashIcon,
    WarningIcon: () => WarningIcon,
    WrenchIcon: () => WrenchIcon
  });
  function svg(paths, { viewBox = "0 0 24 24", fill = "none" } = {}) {
    const Icon = ({ size = 4, className, color, style }) => h4("svg", {
      width: size * 4,
      height: size * 4,
      viewBox,
      fill,
      className,
      stroke: fill === "none" ? color || "currentColor" : void 0,
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: { flexShrink: 0, color, ...style },
      "aria-hidden": true
    }, ...paths.map((d3, i3) => typeof d3 === "string" ? h4("path", { d: d3, key: i3 }) : { ...d3, key: i3 }));
    return Icon;
  }
  var PlugIcon = svg(["M9 2v6", "M15 2v6", "M6 8h12v3a6 6 0 0 1-12 0V8z", "M12 17v5"]);
  var PuzzleIcon = svg(["M19.4 13a2 2 0 1 0 0-4H18V6a2 2 0 0 0-2-2h-3v1.6a2 2 0 1 1-4 0V4H6a2 2 0 0 0-2 2v3h1.6a2 2 0 1 1 0 4H4v3a2 2 0 0 0 2 2h3v-1.6a2 2 0 1 1 4 0V18h3a2 2 0 0 0 2-2v-3h1.4z"]);
  var PaletteIcon = svg(["M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2a2 2 0 0 0-1.4 3.4A1.5 1.5 0 0 1 12 22z", "M7.5 10.5h.01", "M10.5 7h.01", "M15 7.5h.01"]);
  var CodeIcon = svg(["M16 18l6-6-6-6", "M8 6l-6 6 6 6"]);
  var InfoIcon = svg(["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 16v-4", "M12 8h.01"]);
  var StarIcon = svg(["M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"]);
  var StarFillIcon = svg(["M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"], { fill: "currentColor" });
  var PinIcon = svg(["M12 17v5", "M9 3h6l-1 6 4 4H6l4-4z"]);
  var PinFillIcon = svg(["M12 17v5", "M9 3h6l-1 6 4 4H6l4-4z"], { fill: "currentColor" });
  var SlidersIcon = svg(["M4 6h10", "M18 6h2", "M4 12h4", "M12 12h8", "M4 18h12", "M20 18h0", "M16 4v4", "M10 10v4", "M18 16v4"]);
  var WarningIcon = svg(["M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z", "M12 9v4", "M12 17h.01"]);
  var LockIcon = svg(["M5 11h14v10H5z", "M8 11V7a4 4 0 0 1 8 0v4"]);
  var CloseIcon = svg(["M18 6L6 18", "M6 6l12 12"]);
  var ChromiumIcon = svg(["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M21.2 8H12", "M3.9 6.1l4.6 7.9", "M10.9 21.9l4.6-7.9"]);
  var WrenchIcon = svg(["M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3 8-8z", "M14.7 6.3L10 2 2 10l4.3 4.7"]);
  var TrashIcon = svg(["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6"]);
  var EditIcon = svg(["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"]);
  var CopyIcon = svg(["M9 9h11v11H9z", "M5 15H4V4h11v1"]);
  var CheckIcon = svg(["M20 6L9 17l-5-5"]);
  var ReloadIcon = svg(["M21 12a9 9 0 1 1-3-6.7", "M21 3v6h-6"]);
  var ChevronRightIcon = svg(["M9 6l6 6-6 6"]);
  var LogoIcon = svg(["M12 3l8 4.5v9L12 21l-8-4.5v-9z", "M12 8v8", "M8 12h8"]);
  var ArchiveIcon = svg(["M3 4h18v4H3z", "M5 8v12h14V8", "M10 12h4"]);

  // core/ui/theme.js
  function luminance(color) {
    const m3 = /rgba?\(([^)]+)\)/.exec(color || "");
    if (!m3) return null;
    const [r3, g4, b3, a3 = 1] = m3[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (!(a3 > 0)) return null;
    return (0.2126 * r3 + 0.7152 * g4 + 0.0722 * b3) / 255;
  }
  function detectTheme() {
    const site = getSite();
    if (typeof site.theme === "function") {
      try {
        const t3 = site.theme();
        if (t3 === "dark" || t3 === "light") return t3;
      } catch {
      }
    }
    for (const el of [document.body, document.documentElement]) {
      if (!el) continue;
      const l3 = luminance(getComputedStyle(el).backgroundColor);
      if (l3 != null) return l3 < 0.5 ? "dark" : "light";
    }
    try {
      return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "light";
    }
  }
  var currentTheme = () => document.documentElement?.getAttribute("data-uspp-theme") || detectTheme();
  var installed6 = false;
  function installThemeWatcher() {
    if (installed6) return;
    installed6 = true;
    const update = () => {
      if (document.documentElement) setAttr(document.documentElement, "data-uspp-theme", detectTheme());
    };
    update();
    try {
      matchMedia("(prefers-color-scheme: dark)").addEventListener("change", update);
    } catch {
    }
    let t3 = 0;
    const later = () => {
      clearTimeout(t3);
      t3 = setTimeout(update, 50);
    };
    const mo2 = new MutationObserver((recs) => {
      if (recs.some((r3) => r3.attributeName !== "data-uspp-theme")) later();
    });
    const watch = () => {
      mo2.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme", "data-color-mode"] });
      if (document.body) mo2.observe(document.body, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    };
    if (document.body) watch();
    else document.addEventListener("DOMContentLoaded", () => {
      watch();
      update();
    }, { once: true });
  }

  // core/ui/root.js
  var logger19 = new Logger("UI", "#fbcfe8");
  var root = null;
  var host = null;
  var retry = 0;
  var layers = /* @__PURE__ */ new Map();
  var listeners3 = /* @__PURE__ */ new Set();
  var emit3 = () => {
    for (const l3 of [...listeners3]) l3();
  };
  var subscribe2 = (fn2) => {
    listeners3.add(fn2);
    return () => listeners3.delete(fn2);
  };
  function addLayer(key, Component) {
    layers.set(key, Component);
    emit3();
  }
  function Root() {
    useSubscription2(subscribe2);
    return h4(Fragment2, null, [...layers].map(([key, C4]) => h4(ErrorBoundary2, { key, label: key }, h4(C4, null))));
  }
  var STOP = ["pointerdown", "mousedown", "touchstart", "focusin", "focusout", "wheel"];
  function ensureRoot() {
    if (root) {
      if (host && !host.isConnected && document.body) document.body.appendChild(host);
      return true;
    }
    const R4 = getRenderer();
    if (!R4 || !document.body) {
      if (!retry) retry = setTimeout(() => {
        retry = 0;
        ensureRoot();
      }, 300);
      return false;
    }
    installThemeWatcher();
    try {
      host = document.createElement("uspp-root");
      for (const t3 of STOP) host.addEventListener(t3, (e3) => e3.stopPropagation());
      document.body.appendChild(host);
      root = R4.createRoot(host);
      root.render(h4(Root, null));
      return true;
    } catch (e3) {
      logger19.error("创建界面根失败", e3);
      host?.remove();
      root = null;
      host = null;
      return false;
    }
  }

  // core/ui/modal.js
  var logger20 = new Logger("Modal", "#fbcfe8");
  var modals = [];
  var listeners4 = /* @__PURE__ */ new Set();
  var emit4 = () => {
    for (const l3 of [...listeners4]) l3();
  };
  var subscribe3 = (fn2) => {
    listeners4.add(fn2);
    return () => listeners4.delete(fn2);
  };
  var seq2 = 0;
  function topHostDialog() {
    const list = [...document.querySelectorAll('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')].filter((el) => !el.closest("uspp-root") && !el.closest(".uspp-overlay"));
    return list[list.length - 1] || null;
  }
  function openModal(render, { modalKey } = {}) {
    const key = modalKey ?? `uspp-modal-${++seq2}`;
    modals = modals.filter((m3) => m3.key !== key);
    modals.push({ key, render, container: topHostDialog() });
    if (!ensureRoot()) logger20.warn("界面根尚未就绪,弹窗会在就绪后显示");
    emit4();
    return key;
  }
  function closeModal(key) {
    const before = modals.length;
    modals = modals.filter((m3) => m3.key !== key);
    if (modals.length !== before) emit4();
  }
  function closeAllModals() {
    if (!modals.length) return;
    modals = [];
    emit4();
  }
  function ModalFrame({ entry, isTop }) {
    const onClose = () => closeModal(entry.key);
    useEffect2(() => {
      if (!isTop) return;
      const onKey = (e3) => {
        if (e3.key !== "Escape") return;
        e3.stopImmediatePropagation();
        e3.preventDefault();
        onClose();
      };
      window.addEventListener("keydown", onKey, true);
      return () => window.removeEventListener("keydown", onKey, true);
    }, [isTop]);
    let content;
    try {
      content = entry.render({ onClose, modalKey: entry.key });
    } catch (e3) {
      logger20.error("弹窗渲染出错", e3);
      content = null;
    }
    const overlay = h4("div", {
      className: "uspp-overlay",
      style: entry.container ? { position: "fixed", zIndex: 2147483e3 } : void 0,
      onMouseDown: (e3) => {
        if (e3.target === e3.currentTarget) e3.currentTarget.dataset.down = "1";
      },
      onClick: (e3) => {
        if (e3.target === e3.currentTarget && e3.currentTarget.dataset.down === "1") onClose();
        e3.currentTarget.dataset.down = "";
      },
      onKeyDown: (e3) => e3.stopPropagation()
    }, h4(ErrorBoundary2, { fallback: null, label: "modal" }, content));
    const R4 = getRenderer();
    if (entry.container && entry.container.isConnected && R4?.createPortal) return R4.createPortal(overlay, entry.container);
    return overlay;
  }
  function ModalHost() {
    useSubscription2(subscribe3);
    return h4(Fragment2, null, modals.map((m3, i3) => h4(ModalFrame, { key: m3.key, entry: m3, isTop: i3 === modals.length - 1 })));
  }
  addLayer("modals", ModalHost);
  function ModalCard({ title, subtitle, children, footer, onClose, width }) {
    return h4(
      "div",
      { className: "uspp-modal", role: "dialog", "aria-modal": "true", style: width ? { width: `min(${width}px, 100%)` } : void 0, onClick: (e3) => e3.stopPropagation() },
      h4("button", { type: "button", className: "uspp-btn uspp-btn-icon uspp-modal-close", "aria-label": "Close", onClick: onClose }, h4(CloseIcon, { size: 4 })),
      (title || subtitle) && h4(
        "div",
        { className: "uspp-modal-header" },
        title && h4("h2", { className: "uspp-modal-title" }, title),
        subtitle && h4("div", { className: "uspp-modal-subtitle" }, subtitle)
      ),
      h4("div", { className: "uspp-modal-body" }, children),
      footer && h4("div", { className: "uspp-modal-footer" }, footer)
    );
  }
  function confirmDialog({ title, body, confirmText = "Confirm", cancelText = "Cancel", danger = false }) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v3) => {
        if (!done) {
          done = true;
          resolve(v3);
        }
      };
      const key = openModal(({ onClose }) => h4(ModalCard, {
        title,
        width: 420,
        onClose: () => {
          finish(false);
          onClose();
        },
        footer: [
          h4("button", { key: "c", type: "button", className: "uspp-btn", onClick: () => {
            finish(false);
            onClose();
          } }, cancelText),
          h4("button", { key: "o", type: "button", className: `uspp-btn ${danger ? "uspp-btn-danger" : "uspp-btn-primary"}`, onClick: () => {
            finish(true);
            onClose();
          } }, confirmText)
        ]
      }, h4("div", { className: "uspp-muted" }, body)));
      const off = subscribe3(() => {
        if (!modals.some((m3) => m3.key === key)) {
          off();
          finish(false);
        }
      });
    });
  }

  // core/ui/toast.js
  var logger21 = new Logger("Toast", "#fbcfe8");
  var ToastType = Object.freeze({
    MESSAGE: "MESSAGE",
    SUCCESS: "SUCCESS",
    ERROR: "ERROR",
    INFO: "INFO",
    WARNING: "WARNING",
    LOADING: "LOADING"
  });
  function showToast(message, type = ToastType.MESSAGE, options = {}) {
    const toast = siteToast();
    if (!toast) return fallbackToast(message, type, options);
    try {
      const fn2 = {
        SUCCESS: toast.success,
        ERROR: toast.error,
        INFO: toast.info,
        WARNING: toast.warning,
        LOADING: toast.loading,
        MESSAGE: toast.message
      }[String(type).toUpperCase()] || toast;
      return fn2.call(toast, message, options);
    } catch (e3) {
      logger21.warn("显示 toast 失败", e3);
      return -1;
    }
  }
  function dismissToast(id) {
    if (id && typeof id === "object" && typeof id.remove === "function") {
      id.remove();
      return;
    }
    try {
      siteToast()?.dismiss?.(id);
    } catch {
    }
  }
  function siteToast() {
    const c3 = getSite().components;
    try {
      return (typeof c3 === "function" ? c3("toast") : c3?.toast) ?? null;
    } catch {
      return null;
    }
  }
  var notice = null;
  var listeners5 = /* @__PURE__ */ new Set();
  var emit5 = () => {
    for (const l3 of [...listeners5]) l3();
  };
  var subscribe4 = (fn2) => {
    listeners5.add(fn2);
    return () => listeners5.delete(fn2);
  };
  var timer = 0;
  function showNotice({ message, type = "INFO", action, duration } = {}) {
    clearTimeout(timer);
    notice = { message, type: String(type).toUpperCase(), action, id: Date.now() };
    ensureRoot();
    emit5();
    if (duration > 0) timer = setTimeout(closeNotice, duration);
  }
  function closeNotice() {
    clearTimeout(timer);
    if (!notice) return;
    notice = null;
    emit5();
  }
  var ICONS = { ERROR: WarningIcon, WARNING: WarningIcon, SUCCESS: CheckIcon };
  function NoticeHost() {
    useSubscription2(subscribe4);
    if (!notice) return null;
    const Icon = ICONS[notice.type] || InfoIcon;
    const { action } = notice;
    return h4(
      "div",
      { className: "uspp-notice", "data-type": notice.type, role: "status" },
      h4(Icon, { size: 4.5 }),
      h4("div", { className: "uspp-notice-msg" }, notice.message),
      action && h4("button", { type: "button", className: "uspp-btn uspp-btn-sm", onClick: () => {
        try {
          action.onClick?.();
        } finally {
          if (action.close !== false) closeNotice();
        }
      } }, action.label),
      h4("button", { type: "button", className: "uspp-btn uspp-btn-icon", "aria-label": "Close", onClick: closeNotice }, h4(CloseIcon, { size: 4 }))
    );
  }
  addLayer("notice", NoticeHost);
  var toastHost = null;
  function fallbackToast(message, type = "MESSAGE", { duration = 3500 } = {}) {
    if (!document.body && !document.documentElement) return -1;
    if (!toastHost || !toastHost.isConnected) {
      toastHost = document.createElement("uspp-toasts");
      const r3 = toastHost.attachShadow({ mode: "open" });
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(`:host{all:initial}.list{position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;flex-direction:column;gap:8px;font:13px/1.4 system-ui,sans-serif}
.t{background:#222;color:#fff;padding:9px 14px;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.3);max-width:360px}.t[data-type=ERROR]{background:#b3261e}.t[data-type=SUCCESS]{background:#1b5e20}`);
        r3.adoptedStyleSheets = [sheet];
      } catch {
      }
      const list = document.createElement("div");
      list.className = "list";
      r3.append(list);
      (document.body || document.documentElement).appendChild(toastHost);
    }
    const t3 = document.createElement("div");
    t3.className = "t";
    t3.dataset.type = String(type).toUpperCase();
    t3.setAttribute("role", "status");
    t3.textContent = String(message);
    toastHost.shadowRoot.querySelector(".list").append(t3);
    setTimeout(() => t3.remove(), duration);
    return t3;
  }

  // core/ui/floating.js
  var subscribe5 = (fn2) => {
    const off = onSlotChange("floating", fn2);
    SettingsStore.addChangeListener("plugins.Settings.floatingPosition", fn2);
    return () => {
      off();
      SettingsStore.removeChangeListener("plugins.Settings.floatingPosition", fn2);
    };
  };
  function FloatingHost() {
    useSubscription2(subscribe5);
    const items = getSlotItems("floating");
    if (!items.length) return null;
    const pos = String(PlainSettings.plugins.Settings?.floatingPosition || "bottom-right");
    return h4("div", { className: "uspp-floating", "data-pos": pos, "data-uspp-floating": "" }, items.map((d3) => {
      const ctx = {};
      return h4(
        ErrorBoundary2,
        { key: d3.id, fallback: null, label: `floating:${d3.id}` },
        d3.render ? h4(d3.render, ctx) : h4("button", {
          type: "button",
          className: "uspp-floating-btn " + (d3.className || ""),
          title: d3.tooltip ?? d3.label,
          "aria-label": d3.label ?? d3.id,
          disabled: slotValue(d3.disabled, ctx),
          "data-active": String(slotValue(d3.active, ctx)),
          "data-uspp-floating-item": d3.id,
          onClick: () => {
            try {
              (d3.onSelect || d3.onClick)?.(ctx);
            } catch (e3) {
              console.error("[Userscript++] 悬浮按钮出错", e3);
            }
          }
        }, typeof d3.icon === "function" ? h4(d3.icon, { size: 4 }) : d3.icon, d3.icon != null && d3.label ? " " : null, d3.icon == null || d3.showLabel ? d3.label : null)
      );
    }));
  }
  var installed7 = false;
  function installFloating() {
    if (installed7) return;
    installed7 = true;
    addLayer("floating", FloatingHost);
    const tryMount = () => {
      if (getSlotItems("floating").length && !ensureRoot()) setTimeout(tryMount, 500);
    };
    onSlotChange("floating", tryMount);
    tryMount();
  }

  // core/ui/styles.css.js
  var LIGHT = `--uspp-surface-base:#fff;--uspp-surface-l1:#fff;--uspp-surface-l2:#f4f4f5;--uspp-surface-l3:#d4d4d8;--uspp-fg-primary:#111;--uspp-fg-secondary:#5f5f66;--uspp-fg-tertiary:#8a8a93;--uspp-fg-danger:#e5484d;--uspp-border-l1:rgb(0 0 0 / .1);--uspp-border-l2:rgb(0 0 0 / .16);--uspp-ring:#888;--uspp-button-ghost-hover:rgb(0 0 0 / .06);`;
  var DARK = `--uspp-surface-base:#151517;--uspp-surface-l1:#1c1c1f;--uspp-surface-l2:#26262a;--uspp-surface-l3:#3f3f46;--uspp-fg-primary:#f4f4f5;--uspp-fg-secondary:#a1a1aa;--uspp-fg-tertiary:#71717a;--uspp-fg-danger:#f06a6e;--uspp-border-l1:rgb(255 255 255 / .1);--uspp-border-l2:rgb(255 255 255 / .16);--uspp-ring:#a1a1aa;--uspp-button-ghost-hover:rgb(255 255 255 / .08);`;
  var UI_CSS = `
:root { ${LIGHT} }
:root[data-uspp-theme="dark"] { ${DARK} }
uspp-root { color-scheme: light dark; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
uspp-root { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; }
uspp-root > * { pointer-events: auto; }
.uspp-overlay { position: fixed; inset: 0; background: rgb(0 0 0 / 0.5); display: flex; align-items: center; justify-content: center; padding: 16px; pointer-events: auto; animation: uspp-fade .12s ease-out; }
.uspp-modal { position: relative; background: var(--uspp-surface-l1); color: var(--uspp-fg-primary); border: 1px solid var(--uspp-border-l1); border-radius: 24px; box-shadow: 0 16px 48px rgb(0 0 0 / .35); width: min(560px, 100%); max-height: min(85vh, 760px); display: flex; flex-direction: column; overflow: hidden; font-size: 14px; animation: uspp-pop .14s ease-out; }
.uspp-modal-header { padding: 20px 56px 8px 24px; }
.uspp-modal-title { font-size: 18px; font-weight: 600; margin: 0; }
.uspp-modal-subtitle { color: var(--uspp-fg-secondary); margin-top: 4px; }
.uspp-modal-body { padding: 8px 24px 16px; overflow-y: auto; }
.uspp-modal-footer { padding: 12px 24px 20px; display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid var(--uspp-border-l1); }
.uspp-modal-close { position: absolute; top: 14px; right: 14px; }
@keyframes uspp-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes uspp-pop { from { opacity: 0; transform: scale(.97) } to { opacity: 1; transform: none } }

.uspp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; padding: 0 14px; border-radius: 9999px; border: 1px solid var(--uspp-border-l2); background: transparent; color: var(--uspp-fg-primary); font: inherit; font-weight: 500; cursor: pointer; white-space: nowrap; }
.uspp-btn:hover:not(:disabled) { background: var(--uspp-button-ghost-hover); }
.uspp-btn:disabled { opacity: .5; cursor: default; }
.uspp-btn-primary { background: var(--uspp-fg-primary); color: var(--uspp-surface-base); border-color: transparent; }
.uspp-btn-primary:hover:not(:disabled) { background: var(--uspp-fg-primary); opacity: .88; }
.uspp-btn-danger { background: var(--uspp-fg-danger); color: #fff; border-color: transparent; }
.uspp-btn-danger:hover:not(:disabled) { background: var(--uspp-fg-danger); opacity: .88; }
.uspp-btn-ghost { border-color: transparent; }
.uspp-btn-icon { width: 32px; height: 32px; padding: 0; border-color: transparent; color: var(--uspp-fg-secondary); }
.uspp-btn-icon:hover:not(:disabled) { color: var(--uspp-fg-primary); }
.uspp-btn-icon.uspp-active { color: var(--uspp-fg-primary); }
.uspp-btn-sm { height: 30px; padding: 0 10px; font-size: 13px; }

.uspp-switch { position: relative; width: 44px; height: 24px; border-radius: 9999px; background: var(--uspp-surface-l3); border: none; cursor: pointer; flex-shrink: 0; padding: 0; transition: background .15s; }
.uspp-switch[data-checked="true"] { background: var(--uspp-fg-primary); }
.uspp-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: var(--uspp-surface-base); transition: transform .15s; }
.uspp-switch[data-checked="true"]::after { transform: translateX(20px); }
.uspp-switch:disabled { opacity: .5; cursor: not-allowed; }

.uspp-input, .uspp-textarea, .uspp-select { width: 100%; box-sizing: border-box; background: var(--uspp-surface-l2); color: var(--uspp-fg-primary); border: 1px solid var(--uspp-border-l1); border-radius: 12px; padding: 8px 12px; font: inherit; outline: none; }
.uspp-input:focus, .uspp-textarea:focus, .uspp-select:focus { border-color: var(--uspp-ring); }
.uspp-select { width: auto; min-width: 140px; }
.uspp-textarea { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; line-height: 1.5; resize: vertical; min-height: 240px; white-space: pre; tab-size: 4; }
.uspp-textarea[readonly] { opacity: .6; }

.uspp-page { display: flex; flex-direction: column; gap: 16px; padding-bottom: 24px; padding-inline-end: 24px; color: var(--uspp-fg-primary); font-size: 14px; }
.uspp-row { display: flex; align-items: center; gap: 12px; justify-content: space-between; }
.uspp-row-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.uspp-row-title { font-weight: 500; }
.uspp-muted { color: var(--uspp-fg-secondary); }
.uspp-small { font-size: 12px; }
.uspp-section { display: flex; flex-direction: column; gap: 10px; padding: 16px; border: 1px solid var(--uspp-border-l1); border-radius: 16px; background: var(--uspp-surface-l1); }
.uspp-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.uspp-chip { height: 30px; padding: 0 12px; border-radius: 9999px; border: 1px solid var(--uspp-border-l1); background: transparent; color: var(--uspp-fg-secondary); font: inherit; font-size: 13px; cursor: pointer; }
.uspp-chip:hover { background: var(--uspp-button-ghost-hover); }
.uspp-chip[aria-selected="true"] { background: var(--uspp-fg-primary); color: var(--uspp-surface-base); border-color: transparent; }
.uspp-toolbar { display: flex; gap: 8px; align-items: center; }
.uspp-toolbar .uspp-input { flex: 1; }
.uspp-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
@media (max-width: 720px) { .uspp-grid { grid-template-columns: 1fr; } }
.uspp-divider { display: flex; align-items: center; gap: 8px; color: var(--uspp-fg-tertiary); font-size: 12px; margin: 4px 0; }
.uspp-divider::before, .uspp-divider::after { content: ""; flex: 1; height: 1px; background: var(--uspp-border-l1); }
.uspp-card { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border: 1px solid var(--uspp-border-l1); border-radius: 16px; background: var(--uspp-surface-l1); min-width: 0; }
.uspp-card[data-failed="true"] { border-color: var(--uspp-fg-danger); background: color-mix(in srgb, var(--uspp-fg-danger) 8%, transparent); }
.uspp-card-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.uspp-card-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uspp-card-controls { margin-left: auto; display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.uspp-card-desc { color: var(--uspp-fg-secondary); font-size: 13px; line-height: 1.4; }
.uspp-card-authors { color: var(--uspp-fg-tertiary); font-size: 12px; }
.uspp-badge { display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: 6px; font-size: 11px; font-weight: 600; background: var(--uspp-fg-primary); color: var(--uspp-surface-base); }
.uspp-icon-badge { display: inline-flex; color: var(--uspp-fg-secondary); }
.uspp-icon-badge.uspp-warn { color: var(--uspp-fg-danger); }
.uspp-empty { padding: 32px 8px; text-align: center; color: var(--uspp-fg-secondary); }
.uspp-banner { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 14px; background: var(--uspp-surface-l2); }
.uspp-backup { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; margin-top: 18px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--uspp-border-l1); }
.uspp-backup-text { flex: 1 1 220px; display: flex; flex-direction: column; gap: 2px; }
.uspp-sites { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.uspp-site-badge { font-size: 11px; padding: 0 6px; border-radius: 6px; color: var(--uspp-fg-secondary); border: 1px solid var(--uspp-border-l1); white-space: nowrap; }
.uspp-panel { display: flex; flex-direction: column; gap: 14px; }
.uspp-panel .uspp-page { padding-inline-end: 0; }
.uspp-floating { position: fixed; z-index: 2147482000; display: flex; flex-direction: column; gap: 8px; pointer-events: auto; }
.uspp-floating[data-pos="bottom-right"] { right: 16px; bottom: 16px; }
.uspp-floating[data-pos="bottom-left"] { left: 16px; bottom: 16px; }
.uspp-floating[data-pos="top-right"] { right: 16px; top: 16px; }
.uspp-floating[data-pos="top-left"] { left: 16px; top: 16px; }
.uspp-floating-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 40px; height: 40px; padding: 0 12px; border-radius: 9999px; border: 1px solid var(--uspp-border-l2); background: var(--uspp-surface-l1); color: var(--uspp-fg-primary); box-shadow: 0 4px 16px rgb(0 0 0 / .18); font: inherit; cursor: pointer; }
.uspp-floating-btn:hover:not(:disabled) { background: var(--uspp-surface-l2); }
.uspp-floating-btn[data-active="true"] { background: var(--uspp-fg-primary); color: var(--uspp-surface-base); }
.uspp-error { color: var(--uspp-fg-danger); font-size: 13px; }
.uspp-setting { display: flex; flex-direction: column; gap: 6px; padding: 12px 0; border-bottom: 1px solid var(--uspp-border-l1); }
.uspp-setting:last-child { border-bottom: none; }
.uspp-slider-row { display: flex; gap: 12px; align-items: center; }
.uspp-slider-row input[type=range] { flex: 1; }
.uspp-tip { display: inline-flex; align-items: center; color: var(--uspp-fg-secondary); cursor: help; margin-left: 4px; }

.uspp-notice { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; max-width: min(640px, calc(100vw - 32px)); padding: 10px 12px 10px 16px; border-radius: 16px; background: var(--uspp-surface-l2); color: var(--uspp-fg-primary); border: 1px solid var(--uspp-border-l2); box-shadow: 0 8px 32px rgb(0 0 0 / .3); font-size: 14px; pointer-events: auto; }
.uspp-notice[data-type="ERROR"] { border-color: var(--uspp-fg-danger); }
.uspp-notice-msg { flex: 1; }

.uspp-menu-icon { display: inline-flex; margin-inline-end: 8px; color: var(--uspp-fg-secondary); }
`;

  // core/settings/index.js
  var NAME3 = "Settings";
  var MENU_COMMAND_ID = "uspp-settings";
  var settings = definePluginSettings({
    showSiteEntry: {
      type: OptionType.BOOLEAN,
      default: true,
      description: "Show the Userscript++ entry in this site's own menus and settings.",
      // 只有声明了 settingsHost 的站点才有站点入口
      get hidden() {
        return !getSite().settingsHost;
      }
    },
    floatingPosition: {
      type: OptionType.SELECT,
      description: "Where floating buttons from plugins appear.",
      options: [
        { label: "Bottom right", value: "bottom-right", default: true },
        { label: "Bottom left", value: "bottom-left" },
        { label: "Top right", value: "top-right" },
        { label: "Top left", value: "top-left" }
      ]
    }
  });
  var openSettings = () => {
  };
  function setSettingsOpener(fn2) {
    openSettings = fn2;
  }
  var settings_default = definePlugin({
    name: NAME3,
    description: "Userscript++ settings panel and menu command, and loads themes and Quick CSS.",
    authors: ["Userscript++"],
    required: true,
    site: "*",
    settings,
    start() {
      migratePluginSetting(NAME3, "showSiteEntry", "showMenu");
      migrateLegacyLayout();
      applyQuickCss();
      if (isThemesEnabled()) applyAllThemes();
      let queued = false;
      this._apply = () => {
        if (queued) return;
        queued = true;
        queueMicrotask(() => {
          queued = false;
          applyQuickCss();
          applyAllThemes();
        });
      };
      for (const k4 of [SITES_PATH, "plugins.Settings.themesEnabled", "plugins.Settings.onlineThemesEnabled"]) SettingsStore.addPrefixChangeListener(k4, this._apply);
      addSlotItem("menuCommand", MENU_COMMAND_ID, { label: "Userscript++ settings", order: -1e3, onSelect: () => openSettings() });
    },
    stop() {
      if (this._apply) for (const k4 of [SITES_PATH, "plugins.Settings.themesEnabled", "plugins.Settings.onlineThemesEnabled"]) SettingsStore.removePrefixChangeListener(k4, this._apply);
      removeSlotItem("menuCommand", MENU_COMMAND_ID);
    }
  });

  // core/settings/PluginModal.js
  function usePluginSettings(name) {
    const force = useForceUpdate();
    useEffect2(() => {
      const prefix = `plugins.${name}.`;
      const fn2 = () => force();
      SettingsStore.addPrefixChangeListener(prefix, fn2);
      return () => SettingsStore.removePrefixChangeListener(prefix, fn2);
    }, [name]);
  }
  function NumberInput({ value, onCommit, bigint }) {
    const shown = value == null ? "" : String(value);
    const [text, setText2] = useState2(shown);
    const focused = useRef2(false);
    useEffect2(() => {
      if (!focused.current) setText2(shown);
    }, [shown]);
    return h4(Input, {
      type: "text",
      inputMode: bigint ? "numeric" : "decimal",
      value: text,
      onFocus: () => {
        focused.current = true;
      },
      onBlur: () => {
        focused.current = false;
        setText2(shown);
      },
      onChange: (e3) => {
        const raw2 = e3.target.value;
        setText2(raw2);
        const t3 = raw2.trim();
        if (bigint) {
          if (t3 === "") return onCommit(0n);
          try {
            onCommit(BigInt(t3));
          } catch {
          }
        } else if (t3 !== "" && !isNaN(Number(t3))) {
          onCommit(Number(t3));
        }
      }
    });
  }
  function SettingControl({ plugin, keyName, setting, onRestartChange }) {
    const store = Settings.plugins[plugin.name];
    const value = store[keyName];
    const set = (v3) => {
      const before = PlainSettings.plugins[plugin.name]?.[keyName];
      store[keyName] = v3;
      try {
        setting.onChange?.(v3);
      } catch (e3) {
        console.error("[Userscript++] 设置 onChange 出错", e3);
      }
      if (setting.restartNeeded) onRestartChange?.(plugin.name, keyName, before, v3);
    };
    const title = humanizeKey(keyName);
    const desc = setting.description && h4("div", { className: "uspp-muted uspp-small" }, setting.description);
    const inline = (control) => h4(
      "div",
      { className: "uspp-setting" },
      h4("div", { className: "uspp-row" }, h4("div", { className: "uspp-row-text" }, h4("div", { className: "uspp-row-title" }, title), desc), control)
    );
    const stacked = (control) => h4(
      "div",
      { className: "uspp-setting" },
      h4("div", { className: "uspp-row-text" }, h4("div", { className: "uspp-row-title" }, title), desc),
      control
    );
    switch (setting.type) {
      case OptionType.BOOLEAN:
        return inline(h4(Switch, { checked: !!value, onChange: set, label: title }));
      case OptionType.SELECT:
        return inline(h4(Select, { value, options: setting.options || [], onChange: set, label: title }));
      case OptionType.SLIDER: {
        const min = setting.min ?? 0, max = setting.max ?? 100;
        return stacked(h4(
          "div",
          { className: "uspp-slider-row" },
          h4("input", { type: "range", min, max, step: 1, value: Number(value ?? min), onChange: (e3) => set(Number(e3.target.value)), "aria-label": title }),
          h4("span", { className: "uspp-muted", style: { minWidth: 36, textAlign: "right" } }, String(value ?? min))
        ));
      }
      case OptionType.NUMBER:
        return stacked(h4(NumberInput, { value, onCommit: set }));
      case OptionType.BIGINT:
        return stacked(h4(NumberInput, { value, onCommit: set, bigint: true }));
      case OptionType.STRING:
        return stacked(h4(Input, { type: "text", value: value ?? "", placeholder: setting.placeholder, onChange: (e3) => set(e3.target.value) }));
      case OptionType.COMPONENT: {
        const C4 = setting.component;
        if (!C4) return null;
        return stacked(h4(ErrorBoundary2, { fallback: null }, h4(C4, { setValue: set, setting, option: setting, value })));
      }
      default:
        return null;
    }
  }
  function PluginModal({ plugin, onClose, onRestartChange }) {
    usePluginSettings(plugin.name);
    const visible = getVisibleSettings(plugin);
    const reset = async () => {
      const ok = await confirmDialog({ title: "Reset settings", body: "Reset this plugin's settings to defaults? This cannot be undone.", confirmText: "Reset", danger: true });
      if (!ok) return;
      const store = Settings.plugins[plugin.name];
      for (const [key, s3] of visible) {
        const before = PlainSettings.plugins[plugin.name]?.[key];
        delete store[key];
        const after = store[key];
        try {
          s3.onChange?.(after);
        } catch {
        }
        if (s3.restartNeeded) onRestartChange?.(plugin.name, key, before, after);
      }
    };
    return h4(
      ModalCard,
      {
        title: plugin.name,
        subtitle: plugin.description,
        onClose,
        footer: visible.length ? h4(Button, { variant: "danger", onClick: reset }, "Reset") : null
      },
      h4("div", { className: "uspp-muted uspp-small", style: { marginBottom: 8 } }, "Authors: ", (plugin.authors || []).join(", ") || "Unknown"),
      visible.length ? visible.map(([key, s3]) => h4(ErrorBoundary2, { key, fallback: null }, h4(SettingControl, { plugin, keyName: key, setting: s3, onRestartChange }))) : h4("div", { className: "uspp-empty" }, "No configurable settings.")
    );
  }

  // core/settings/site-label.js
  var siteLabel = () => isGeneric() ? location.hostname || "this site" : getSite().name;
  var pluginSiteLabel = (p3) => p3.site === "*" ? "All sites" : getSiteById(p3.site)?.name ?? p3.site;

  // core/settings/shared.js
  var TAB_IDS = { plugins: "uspp_plugins_tab", themes: "uspp_themes_tab", quickCss: "uspp_quickcss_tab", backup: "uspp_backup_tab" };
  var sys = () => Settings.plugins.Settings;
  var sysPlain = () => PlainSettings.plugins.Settings ??= {};
  function listSetting(key) {
    const v3 = sysPlain()[key];
    return Array.isArray(v3) ? v3.slice() : [];
  }

  // core/settings/PluginsTab.js
  var TAGS = [
    ["composer", "Composer"],
    ["messages", "Messages"],
    ["chats", "Chats"],
    ["media", "Media"],
    ["navigation", "Navigation"],
    ["notifications", "Notifications"],
    ["appearance", "Appearance"],
    ["declutter", "Declutter"],
    ["privacy", "Privacy"],
    ["developer", "Developer"]
  ];
  var DAY = 864e5;
  function visiblePlugins() {
    return Object.values(plugins).filter((p3) => !p3.hidden && !(p3.chromiumOnly && !isChromium()));
  }
  function useLive() {
    const force = useForceUpdate();
    useEffect2(() => {
      const offs = [Events.PLUGIN_TOGGLE, Events.PLUGIN_PIN, Events.PLUGIN_STAR].map((e3) => subscribe(e3, () => force()));
      const fn2 = () => force();
      SettingsStore.addPrefixChangeListener("plugins.", fn2);
      const offSlot = onSlotChange("settings.pluginActions", fn2);
      return () => {
        offs.forEach((o3) => o3());
        offSlot();
        SettingsStore.removePrefixChangeListener("plugins.", fn2);
      };
    }, []);
  }
  function useReloadTracker() {
    const ref = useRef2(null);
    if (!ref.current) {
      ref.current = {
        initial: Object.fromEntries(Object.keys(plugins).map((n2) => [n2, isPluginEnabled(n2)])),
        settings: /* @__PURE__ */ new Map(),
        // "插件.键" -> 初始值
        dismissed: false
      };
    }
    const [, setTick] = useState2(0);
    const t3 = ref.current;
    const dirty2 = () => Object.values(plugins).some((p3) => needsRestart(p3) && (t3.initial[p3.name] ?? false) !== isPluginEnabled(p3.name)) || [...t3.settings].some(([k4, init]) => {
      const [n2, key] = k4.split(".");
      return !Object.is(Settings.plugins[n2]?.[key], init);
    });
    const prompt = async () => {
      setTick((x4) => x4 + 1);
      if (!dirty2()) {
        t3.dismissed = false;
        return;
      }
      dispatch(Events.RELOAD_NEEDED, null);
      if (t3.dismissed) return;
      const ok = await confirmDialog({ title: "Reload required", body: "This plugin changes the site's code, so you need to reload the page.", confirmText: "Reload", cancelText: "Later" });
      if (ok) location.reload();
      else {
        t3.dismissed = true;
        setTick((x4) => x4 + 1);
      }
    };
    return {
      get showBanner() {
        return t3.dismissed && dirty2();
      },
      onToggled: (p3) => {
        if (needsRestart(p3)) prompt();
        else setTick((x4) => x4 + 1);
      },
      onSettingRestart: (name, key, before) => {
        const k4 = `${name}.${key}`;
        if (!t3.settings.has(k4)) t3.settings.set(k4, before);
        prompt();
      }
    };
  }
  function Badges({ p: p3 }) {
    const out = [];
    const failed = !p3.required && isPluginEnabled(p3.name) && !p3.started;
    if (p3.required) out.push(h4(Tooltip, { key: "req", content: "This plugin is required for Userscript++ to work" }, h4("span", { className: "uspp-icon-badge" }, h4(LockIcon, { size: 3.5 }))));
    if (failed) out.push(h4(Tooltip, { key: "fail", content: "This plugin failed to start" }, h4("span", { className: "uspp-icon-badge uspp-warn" }, h4(WarningIcon, { size: 3.5 }))));
    if (p3.chromiumOnly) out.push(h4(Tooltip, { key: "chr", content: "Chromium only" }, h4("span", { className: "uspp-icon-badge" }, h4(ChromiumIcon, { size: 3.5 }))));
    if (p3.dev) out.push(h4(Tooltip, { key: "dev", content: "Development build only" }, h4("span", { className: "uspp-icon-badge" }, h4(WrenchIcon, { size: 3.5 }))));
    const seen = sys().knownPlugins?.[p3.name];
    if (seen && Date.now() - seen < 2 * DAY) out.push(h4("span", { key: "new", className: "uspp-badge" }, "New"));
    return out;
  }
  function PluginCard({ p: p3, tracker }) {
    const enabled = isPluginEnabled(p3.name);
    const starred = listSetting("starredPlugins").includes(p3.name);
    const pinned = listSetting("pinnedPlugins").includes(p3.name);
    const failed = !p3.required && enabled && !p3.started;
    const hasSettings = getVisibleSettings(p3).length > 0;
    const Icon = p3.icon || PlugIcon;
    const toggleStar = () => {
      const list = listSetting("starredPlugins").filter((n2) => n2 !== p3.name);
      if (!starred) list.push(p3.name);
      sys().starredPlugins = list;
      dispatch(Events.PLUGIN_STAR, { name: p3.name, starred: !starred });
    };
    const togglePin = () => {
      const list = listSetting("pinnedPlugins").filter((n2) => n2 !== p3.name);
      if (!pinned) list.unshift(p3.name);
      sys().pinnedPlugins = list;
      dispatch(Events.PLUGIN_PIN, { name: p3.name, pinned: !pinned });
    };
    const openConfig = () => openModal(({ onClose }) => h4(PluginModal, { plugin: p3, onClose, onRestartChange: tracker.onSettingRestart }), { modalKey: `uspp-plugin-${p3.name}` });
    return h4(
      "div",
      { className: "uspp-card", "data-failed": String(failed), "data-uspp-plugin": p3.name },
      h4(
        "div",
        { className: "uspp-card-head" },
        h4("span", { className: "uspp-icon-badge" }, h4(ErrorBoundary2, { fallback: h4(PlugIcon, { size: 4.5 }) }, h4(Icon, { size: 4.5 }))),
        h4("span", { className: "uspp-card-name" }, p3.name),
        h4(Badges, { p: p3 }),
        h4("span", { className: "uspp-site-badge", "data-uspp-plugin-site": p3.site ?? "*" }, pluginSiteLabel(p3)),
        h4(
          "div",
          { className: "uspp-card-controls" },
          h4(PluginActions, { p: p3 }),
          h4(IconButton, { icon: starred ? StarFillIcon : StarIcon, label: starred ? "Unstar" : "Star", active: starred, onClick: toggleStar }),
          !p3.required && h4(IconButton, { icon: pinned ? PinFillIcon : PinIcon, label: pinned ? "Unpin" : "Pin", active: pinned, onClick: togglePin }),
          hasSettings && h4(IconButton, { icon: SlidersIcon, label: "config", onClick: openConfig }),
          h4(Switch, {
            checked: enabled,
            disabled: p3.required || isEnabledAsDependency(p3.name),
            label: p3.name,
            onChange: () => {
              togglePlugin(p3.name);
              tracker.onToggled(p3);
            }
          })
        )
      ),
      h4("div", { className: "uspp-card-desc" }, p3.description),
      h4("div", { className: "uspp-card-authors" }, (p3.authors || []).join(", "))
    );
  }
  function PluginActions({ p: p3 }) {
    const items = getSlotItems("settings.pluginActions").filter((d3) => !d3.plugin || d3.plugin === p3.name);
    const ctx = { plugin: p3 };
    return items.map((d3) => h4(
      ErrorBoundary2,
      { key: d3.id, fallback: null },
      d3.render ? h4(d3.render, ctx) : h4("button", {
        type: "button",
        className: "uspp-btn uspp-btn-icon " + (d3.className || ""),
        title: d3.tooltip ?? d3.label,
        "aria-label": d3.label ?? d3.id,
        disabled: slotValue(d3.disabled, ctx),
        "data-active": String(slotValue(d3.active, ctx)),
        onClick: () => {
          try {
            (d3.onSelect || d3.onClick)?.(ctx);
          } catch (e3) {
            console.error("[Userscript++] 插件卡片按钮出错", e3);
          }
        }
      }, typeof d3.icon === "function" ? h4(d3.icon, { size: 4 }) : d3.icon ?? d3.label)
    ));
  }
  function sortPinned(list) {
    const pins = listSetting("pinnedPlugins");
    const pinned = pins.map((n2) => list.find((p3) => p3.name === n2)).filter(Boolean);
    return [...pinned, ...list.filter((p3) => !pins.includes(p3.name)).sort((a3, b3) => a3.name.localeCompare(b3.name))];
  }
  function PluginsTab() {
    useLive();
    const tracker = useReloadTracker();
    const [cat, setCat] = useState2("favorites");
    const [query, setQuery] = useState2("");
    const [filter, setFilter] = useState2("all");
    const all = visiblePlugins();
    const hasRecent = all.some((p3) => p3.updatedAt);
    const cats = [["favorites", "Favorites"], ...hasRecent ? [["recent", "Recent"]] : [], ["all", "All"], ...TAGS.filter(([t3]) => all.some((p3) => p3.tags?.includes(t3)))];
    const q4 = query.trim().toLowerCase();
    const pass = (p3) => (!q4 || `${p3.name} ${p3.description}`.toLowerCase().includes(q4)) && (filter === "all" || filter === "enabled" === isPluginEnabled(p3.name));
    let body;
    const grid = (list) => h4("div", { className: "uspp-grid" }, list.map((p3) => h4(ErrorBoundary2, { key: p3.name, fallback: null }, h4(PluginCard, { p: p3, tracker }))));
    const empty = (text) => h4("div", { className: "uspp-empty" }, text);
    if (cat === "favorites") {
      const stars = listSetting("starredPlugins").slice().reverse();
      const list = stars.map((n2) => all.find((p3) => p3.name === n2)).filter(Boolean).filter(pass);
      body = list.length ? grid(list) : empty(stars.length && q4 ? "No plugins match your search." : "No favorites yet. Star a plugin to see it here.");
    } else if (cat === "recent") {
      const list = all.filter((p3) => p3.updatedAt && Date.now() - p3.updatedAt < 7 * DAY).sort((a3, b3) => b3.updatedAt - a3.updatedAt).filter(pass);
      body = list.length ? grid(list) : empty(q4 ? "No plugins match your search." : "No plugins updated in the last 7 days.");
    } else if (cat === "all") {
      const normal = sortPinned(all.filter((p3) => !p3.required)).filter(pass);
      const req = all.filter((p3) => p3.required).sort((a3, b3) => a3.name.localeCompare(b3.name)).filter(pass);
      body = normal.length + req.length === 0 ? empty("No plugins match your search.") : h4(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 10 } },
        normal.length > 0 && grid(normal),
        req.length > 0 && h4("div", { className: "uspp-divider" }, "Required"),
        req.length > 0 && grid(req)
      );
    } else {
      const list = sortPinned(all.filter((p3) => p3.tags?.includes(cat))).filter(pass);
      body = list.length ? grid(list) : empty("No plugins match your search.");
    }
    return h4(
      "div",
      { className: "uspp-page", "data-uspp-page": "plugins" },
      tracker.showBanner && h4(
        "div",
        { className: "uspp-banner" },
        h4("span", { style: { flex: 1 } }, "Reload the page to apply plugin changes."),
        h4(Button, { variant: "primary", size: "sm", onClick: () => location.reload() }, "Reload")
      ),
      h4("div", { className: "uspp-tabs", role: "tablist" }, cats.map(([id, label]) => h4("button", {
        key: id,
        type: "button",
        role: "tab",
        className: "uspp-chip",
        "aria-selected": String(cat === id),
        onClick: () => setCat(id)
      }, label))),
      h4(
        "div",
        { className: "uspp-toolbar" },
        h4(Input, { type: "search", placeholder: `Search ${all.length} plugins...`, value: query, onChange: (e3) => setQuery(e3.target.value) }),
        h4(Select, { value: filter, label: "Filter", onChange: setFilter, options: [{ label: "All", value: "all" }, { label: "Enabled", value: "enabled" }, { label: "Disabled", value: "disabled" }] })
      ),
      body
    );
  }

  // core/settings/ThemesTab.js
  function OnlineThemeModal({ onClose }) {
    const [url, setUrl] = useState2("");
    const [busy2, setBusy] = useState2(false);
    const [error, setError] = useState2(null);
    const submit = async () => {
      if (busy2) return;
      setBusy(true);
      setError(null);
      try {
        await addTheme(url);
        onClose();
      } catch (e3) {
        setError(e3?.message || String(e3));
        setBusy(false);
      }
    };
    return h4(
      ModalCard,
      {
        title: "Add online theme",
        subtitle: "Paste a link to a .css file.",
        onClose,
        width: 480,
        footer: [
          h4(Button, { key: "c", onClick: onClose }, "Cancel"),
          h4(Button, { key: "i", variant: "primary", onClick: submit, disabled: busy2 || !url.trim() }, busy2 ? "Importing..." : "Import")
        ]
      },
      h4(Input, { autoFocus: true, type: "url", placeholder: "https://example.com/theme.css", value: url, onChange: (e3) => setUrl(e3.target.value), onEnter: submit, disabled: busy2 }),
      error && h4("div", { className: "uspp-error", role: "alert", style: { marginTop: 8 } }, error)
    );
  }
  function LocalThemeModal({ onClose, theme }) {
    const [name, setName] = useState2(theme?.name || "");
    const [css, setCss] = useState2(theme?.css || "");
    const ok = name.trim() && css.trim();
    const save = () => {
      if (!ok) return;
      if (theme) updateLocalTheme(theme.url, { name: name.trim(), css });
      else addLocalTheme(name.trim(), css);
      onClose();
    };
    return h4(
      ModalCard,
      {
        title: theme ? "Edit local theme" : "New local theme",
        onClose,
        width: 640,
        footer: [
          h4(Button, { key: "c", onClick: onClose }, "Cancel"),
          h4(Button, { key: "s", variant: "primary", onClick: save, disabled: !ok }, theme ? "Save" : "Create")
        ]
      },
      h4(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 10 } },
        h4("label", { className: "uspp-row-title" }, "Name"),
        h4(Input, { autoFocus: true, placeholder: "My theme", value: name, onChange: (e3) => setName(e3.target.value) }),
        h4("label", { className: "uspp-row-title" }, "CSS"),
        h4(CodeEditor, { value: css, onChange: setCss, placeholder: "/* your CSS */", minHeight: 260 })
      )
    );
  }
  function ThemeCard({ t: t3 }) {
    const remove = async () => {
      const ok = await confirmDialog({ title: "Remove theme", body: `Are you sure you want to remove "${t3.name}"?`, confirmText: "Remove", danger: true });
      if (ok) removeTheme(t3.url);
    };
    const copy = async () => {
      const ok = await copyToClipboard(t3.url);
      showToast(ok ? "Copied URL" : "Couldn't copy URL", ok ? ToastType.SUCCESS : ToastType.ERROR);
    };
    return h4(
      "div",
      { className: "uspp-card", "data-uspp-theme": t3.url },
      h4(
        "div",
        { className: "uspp-card-head" },
        h4("span", { className: "uspp-card-name" }, t3.name),
        h4("span", { className: "uspp-badge" }, t3.local ? "Local" : "Online"),
        h4(
          "div",
          { className: "uspp-card-controls" },
          t3.local ? h4(IconButton, { icon: EditIcon, label: "Edit", onClick: () => openModal(({ onClose }) => h4(LocalThemeModal, { onClose, theme: t3 }), { modalKey: "uspp-local-theme" }) }) : h4(IconButton, { icon: CopyIcon, label: "Copy URL", onClick: copy }),
          h4(IconButton, { icon: TrashIcon, label: "Delete", onClick: remove }),
          h4(Switch, { checked: t3.enabled, label: t3.name, onChange: (v3) => (v3 ? enableTheme : disableTheme)(t3.url) })
        )
      ),
      t3.description && h4("div", { className: "uspp-card-desc" }, t3.description),
      h4("div", { className: "uspp-card-authors" }, t3.author || ""),
      h4(
        "label",
        { className: "uspp-sites uspp-muted uspp-small" },
        h4("input", { type: "checkbox", checked: !!t3.allSites, onChange: (e3) => setThemeAllSites(t3.url, e3.target.checked), "data-uspp-theme-all": t3.url }),
        "Use on all sites"
      )
    );
  }
  function ThemesTab() {
    const force = useForceUpdate();
    useEffect2(() => subscribeThemes(() => force()), []);
    const [query, setQuery] = useState2("");
    const [filter, setFilter] = useState2("all");
    const themes = getThemes();
    const q4 = query.trim().toLowerCase();
    const list = themes.filter((t3) => (!q4 || `${t3.name} ${t3.author || ""} ${t3.description || ""}`.toLowerCase().includes(q4)) && (filter === "all" || filter === "enabled" && t3.enabled || filter === "disabled" && !t3.enabled || filter === "online" && !t3.local || filter === "local" && t3.local));
    const section = (title, desc, onManage) => h4(
      "div",
      { className: "uspp-section" },
      h4(
        "div",
        { className: "uspp-row" },
        h4(
          "div",
          { className: "uspp-row-text" },
          h4("div", { className: "uspp-row-title" }, title),
          h4("div", { className: "uspp-muted uspp-small" }, desc)
        ),
        h4(Button, { onClick: onManage }, "Manage")
      )
    );
    return h4(
      "div",
      { className: "uspp-page", "data-uspp-page": "themes" },
      h4("div", { className: "uspp-muted uspp-small" }, `Themes for ${siteLabel()}. Turn on "Use on all sites" to apply a theme everywhere.`),
      section(
        "Online Themes",
        "Load themes from a URL. They're cached on this device and checked for updates once a day.",
        () => openModal(({ onClose }) => h4(OnlineThemeModal, { onClose }), { modalKey: "uspp-online-theme" })
      ),
      section(
        "Local Themes",
        "Custom CSS that only lives on this device.",
        () => openModal(({ onClose }) => h4(LocalThemeModal, { onClose }), { modalKey: "uspp-local-theme" })
      ),
      themes.length > 0 && h4(
        "div",
        { className: "uspp-toolbar" },
        h4(Input, { type: "search", placeholder: `Search ${themes.length} themes...`, value: query, onChange: (e3) => setQuery(e3.target.value) }),
        h4(Select, {
          value: filter,
          label: "Filter",
          onChange: setFilter,
          options: [["all", "All"], ["enabled", "Enabled"], ["disabled", "Disabled"], ["online", "Online"], ["local", "Local"]].map(([value, label]) => ({ value, label }))
        })
      ),
      themes.length > 0 && (list.length ? h4("div", { className: "uspp-grid" }, list.map((t3) => h4(ErrorBoundary2, { key: t3.url, fallback: null }, h4(ThemeCard, { t: t3 })))) : h4("div", { className: "uspp-empty" }, "No themes match your search."))
    );
  }

  // core/settings/QuickCssTab.js
  function QuickCssTab() {
    const force = useForceUpdate();
    useEffect2(() => {
      const fn2 = () => force();
      SettingsStore.addPrefixChangeListener(SITES_PATH, fn2);
      return () => SettingsStore.removePrefixChangeListener(SITES_PATH, fn2);
    }, []);
    const { css, enabled } = getQuickCss();
    return h4(
      "div",
      { className: "uspp-page", "data-uspp-page": "quickcss" },
      h4(
        Row,
        { title: "Enable Quick CSS", description: `Applies as you type, only on ${siteLabel()}. Turning it off keeps your code but stops applying it.` },
        h4(Switch, { checked: enabled, label: "Enable Quick CSS", onChange: (v3) => setQuickCss({ enabled: v3 }) })
      ),
      h4(CodeEditor, { value: css, readOnly: !enabled, placeholder: "Paste your CSS here...", minHeight: 360, onChange: (v3) => setQuickCss({ css: v3 }) })
    );
  }

  // core/settings/BackupTab.js
  async function runImport() {
    const text = await pickJsonFile();
    if (text == null) return false;
    let parsed;
    try {
      parsed = parseBackup(text);
    } catch (e3) {
      showToast(e3.message, ToastType.ERROR);
      return false;
    }
    const s3 = parsed.summary;
    const ok = await confirmDialog({
      title: "Import settings?",
      body: `This replaces all current Userscript++ settings with the file's: ${s3.plugins} plugins (${s3.enabled} enabled), ${s3.themes} themes in ${s3.sites} site${s3.sites === 1 ? "" : "s"}${s3.exportedAt ? `, exported ${s3.exportedAt.slice(0, 10)}` : ""}.`,
      confirmText: "Import",
      danger: true
    });
    if (!ok) return false;
    const reload = await importSettings(parsed.settings);
    showToast("Settings imported.", ToastType.SUCCESS);
    if (reload && await confirmDialog({ title: "Reload required", body: "Some imported plugin changes need a page reload.", confirmText: "Reload", cancelText: "Later" })) location.reload();
    return true;
  }
  function BackupTab() {
    const [secrets, setSecrets] = useState2(false);
    return h4(
      "div",
      { className: "uspp-page", "data-uspp-page": "backup" },
      h4(
        "div",
        { className: "uspp-section" },
        h4(
          Row,
          { title: "Export settings", description: "Saves all Userscript++ settings, for every site, to a JSON file." },
          h4(Button, { onClick: () => downloadJson(exportSettings({ includeSensitive: secrets }), backupFilename()) }, "Export")
        ),
        h4(
          Row,
          { title: "Include sensitive values", description: "Plugin settings marked sensitive (such as keys) are left out unless this is on." },
          h4(Switch, { checked: secrets, label: "Include sensitive values", onChange: setSecrets })
        )
      ),
      h4(
        "div",
        { className: "uspp-section" },
        h4(
          Row,
          { title: "Import settings", description: "Replaces all current settings with a file you exported before. You'll be asked to confirm." },
          h4(Button, { onClick: () => {
            runImport();
          } }, "Import")
        )
      )
    );
  }

  // core/settings/pages.js
  var page = (C4, label) => {
    const P4 = () => h4(ErrorBoundary2, { fallback: h4("div", { className: "uspp-page uspp-error" }, `${label} failed to render.`) }, h4(C4));
    P4.displayName = `Uspp${label.replace(/\s/g, "")}Page`;
    return P4;
  };
  var SETTINGS_PAGES = Object.freeze([
    { id: TAB_IDS.plugins, key: "plugins", label: "Plugins", icon: PuzzleIcon, component: page(PluginsTab, "Plugins") },
    { id: TAB_IDS.themes, key: "themes", label: "Themes", icon: PaletteIcon, component: page(ThemesTab, "Themes") },
    { id: TAB_IDS.quickCss, key: "quickCss", label: "Quick CSS", icon: CodeIcon, component: page(QuickCssTab, "Quick CSS") },
    { id: TAB_IDS.backup, key: "backup", label: "Backup", icon: ArchiveIcon, component: page(BackupTab, "Backup") }
  ]);
  var pageByKey = (key) => SETTINGS_PAGES.find((p3) => p3.key === key || p3.id === key) || SETTINGS_PAGES[0];

  // core/settings/SettingsPanel.js
  var PANEL_KEY = "uspp-settings-panel";
  function SettingsPanel({ tab, onClose }) {
    const [cur, setCur] = useState2(pageByKey(tab).key);
    const page2 = pageByKey(cur);
    return h4(
      ModalCard,
      { title: "Userscript++", subtitle: `${VERSION} · ${siteLabel()}`, onClose, width: 860 },
      h4(
        "div",
        { className: "uspp-panel", "data-uspp-panel": "" },
        h4("div", { className: "uspp-tabs", role: "tablist" }, SETTINGS_PAGES.map((p3) => h4("button", {
          key: p3.key,
          type: "button",
          role: "tab",
          className: "uspp-chip",
          "aria-selected": String(p3.key === cur),
          "data-uspp-panel-tab": p3.key,
          onClick: () => setCur(p3.key)
        }, p3.label))),
        h4(page2.component, { key: page2.key })
      )
    );
  }
  function openSettingsPanel({ tab = "plugins", plugin } = {}) {
    openModal(({ onClose }) => h4(SettingsPanel, { tab, onClose }), { modalKey: PANEL_KEY });
    const p3 = typeof plugin === "string" ? plugins[plugin] : plugin;
    if (p3) openModal(({ onClose }) => h4(PluginModal, { plugin: p3, onClose }), { modalKey: `uspp-plugin-${p3.name}` });
  }
  var closeSettingsPanel = () => closeModal(PANEL_KEY);

  // core/index.js
  var logger22 = new Logger("Core", "#c4b5fd");
  var DEFAULT_READY_TIMEOUT = 15e3;
  var BUILD_SITES = typeof define_USPP_SITES_default !== "undefined" ? define_USPP_SITES_default : [];
  function step(label, fn2) {
    try {
      return fn2();
    } catch (e3) {
      logger22.error(`${label} 失败`, e3);
    }
  }
  function openPluginSettings(plugin) {
    const p3 = typeof plugin === "string" ? plugins[plugin] : plugin;
    if (!p3) return false;
    openModal(({ onClose }) => h4(PluginModal, { plugin: p3, onClose }), { modalKey: `uspp-plugin-${p3.name}` });
    return true;
  }
  function openSettings2(opts = {}) {
    const host2 = getSite().settingsHost;
    if (host2 && typeof host2.open === "function" && PlainSettings.plugins.Settings?.showSiteEntry !== false) {
      let ok = false;
      try {
        ok = !!host2.open(opts);
      } catch (e3) {
        logger22.warn("站点设置界面打开失败", e3);
      }
      if (ok) {
        setTimeout(() => {
          const shown = typeof host2.isOpen === "function" ? host2.isOpen() : !!document.querySelector("[data-uspp-page]");
          if (!shown) openSettingsPanel(opts);
        }, 800);
        return "site";
      }
    }
    openSettingsPanel(opts);
    return "panel";
  }
  function countIdleMutations(ms = 8e3) {
    const ours = (n2) => n2 && n2.nodeType === 1 && (/^USPP-/.test(n2.tagName) || [...n2.attributes].some((a3) => a3.name.startsWith("data-uspp")) || [...n2.classList].some((c3) => c3.startsWith("uspp-")) || !!n2.querySelector?.("[data-uspp],[class*='uspp-'],uspp-root"));
    return new Promise((resolve) => {
      let count = 0;
      const samples = [];
      const mo2 = new MutationObserver((list) => {
        for (const m3 of list) {
          const hit = [...m3.addedNodes, ...m3.removedNodes].some(ours) || m3.type === "attributes" && (ours(m3.target) || m3.attributeName?.includes("uspp"));
          if (hit) {
            count++;
            if (samples.length < 10) samples.push(m3.target?.nodeName);
          }
        }
      });
      mo2.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      setTimeout(() => {
        mo2.disconnect();
        resolve({ count, samples });
      }, ms);
    });
  }
  function installAliases(api) {
    const names = /* @__PURE__ */ new Set();
    for (const s3 of getSites()) for (const k4 of Object.keys(s3.api || {})) names.add(k4);
    for (const name of names) {
      if (name in api) continue;
      Object.defineProperty(api, name, {
        enumerable: true,
        get() {
          const own = getSite().api;
          if (own && name in own) return own[name];
          const sample = getSites().map((s3) => s3.api?.[name]).find((v3) => v3 != null);
          if (typeof sample === "function") return (...args) => {
            logger22.debug(`${name} 只在 ${siteNamesWith(name)} 上可用,当前站点忽略`, args[0]);
          };
          return {};
        }
      });
    }
  }
  var siteNamesWith = (name) => getSites().filter((s3) => s3.api && name in s3.api).map((s3) => s3.name).join("、");
  function registerHostPatches() {
    const host2 = getSite().settingsHost;
    (host2?.patches || []).forEach((patch, i3) => {
      try {
        addPatch(patch, "Settings", { key: `Settings#host${i3}`, self: "UserscriptPP.site.settingsHost" });
      } catch (e3) {
        logger22.error(`登记站点设置入口的第 ${i3} 条补丁失败`, e3);
      }
    });
  }
  function waitSiteReady(site, cb) {
    let fired = false;
    const r3 = site.ready;
    const timeoutMs = r3 && typeof r3 === "object" && r3.timeout || site.readyTimeout || DEFAULT_READY_TIMEOUT;
    const offs = [];
    const fire2 = () => {
      if (fired) return;
      fired = true;
      offs.forEach((o3) => {
        try {
          o3();
        } catch {
        }
      });
      clearTimeout(timer2);
      cb();
    };
    const timer2 = setTimeout(fire2, r3 ? timeoutMs : 0);
    if (!r3) return;
    if (typeof r3 === "function") {
      const check2 = () => {
        try {
          if (r3()) fire2();
        } catch {
        }
      };
      const iv = setInterval(check2, 200);
      offs.push(() => clearInterval(iv), onModuleLoad(check2));
      check2();
      return;
    }
    if (typeof r3.module === "function") {
      offs.push(waitFor(r3.module, () => setTimeout(fire2, 0)));
      step("扫描模块缓存", rescanRuntimeCache);
    }
    if (r3.element) waitForElement(r3.element).then((el) => {
      if (el) fire2();
    });
  }
  function checkFingerprint(site) {
    const chunkPath = site.driverOptions?.chunkPath;
    const base = (s3) => {
      try {
        return new URL(s3, location.href).pathname.split("/").pop();
      } catch {
        return String(s3).split("/").pop();
      }
    };
    const names = /* @__PURE__ */ new Set();
    if (chunkPath) for (const s3 of document.querySelectorAll(`script[src*="${chunkPath}"]`)) names.add(base(s3.src));
    for (const p3 of chunkPaths) names.add(base(p3));
    const now = [...names].filter(Boolean).sort();
    if (!now.length) return;
    const prev = Array.isArray(readPartition().chunkFingerprint) ? readPartition().chunkFingerprint : null;
    if (prev && prev.length) {
      const set = new Set(prev);
      const overlap = now.filter((n2) => set.has(n2)).length;
      if (overlap / Math.max(now.length, prev.length) < 0.5) logger22.warn(`${site.name} 的构建已变化(分块文件重合不到一半),部分补丁可能失效`);
    }
    if (!prev || prev.join("\n") !== now.join("\n")) writePartition().chunkFingerprint = now;
  }
  function retryFailed(list) {
    let pending = list.slice();
    const attempt = () => {
      rescanRuntimeCache();
      pending = pending.filter((p3) => isPluginEnabled(p3.name) && !p3.started && !startPlugin(p3));
    };
    const tick = debounce(() => {
      attempt();
      if (!pending.length) {
        off();
        clearTimeout(last2);
        logger22.info("之前启动失败的插件已全部启动");
      }
    }, 200);
    const off = onModuleLoad(tick);
    const last2 = setTimeout(() => {
      off();
      tick.cancel?.();
      attempt();
      if (pending.length) logger22.warn(`以下插件启动失败:${pending.map((p3) => p3.name).join(", ")}`);
      else logger22.info("之前启动失败的插件已全部启动");
    }, DEFAULT_READY_TIMEOUT);
  }
  var materialize = (entry, api) => typeof entry === "function" ? entry(api) : entry;
  function main() {
    if (W.top !== W.self) return;
    if ("UserscriptPP" in W) return;
    let resolveReady;
    const onceReady = new Promise((r3) => {
      resolveReady = r3;
    });
    let siteReadyDone = false;
    const api = {
      version: VERSION,
      buildType: BUILD_TYPE,
      buildSites: BUILD_SITES.slice(),
      // 站点
      defineSite,
      registerSite: (def2) => registerSiteRuntime(def2),
      get site() {
        return getSite();
      },
      get sites() {
        return Object.fromEntries(getSites().map((s3) => [s3.id, s3]));
      },
      isSite,
      siteKey,
      // 插件
      plugins,
      registerPlugin,
      startPlugin: startPluginApi,
      stopPlugin: stopPluginApi,
      isPluginEnabled,
      togglePlugin,
      definePlugin,
      definePluginSettings,
      migratePluginSettings,
      migratePluginSetting,
      getVisibleSettings,
      OptionType,
      StartAt,
      // 设置
      Settings,
      PlainSettings,
      SettingsStore,
      openSettings: openSettings2,
      openSettingsPanel,
      closeSettingsPanel,
      openPluginSettings,
      settingsPages: SETTINGS_PAGES,
      exportSettings,
      importSettings,
      parseBackup,
      // 打包器(只在使用打包器驱动的站点上有内容)
      addPatch: (patch, pluginName) => addPatch(patch, pluginName),
      patches,
      patchStats,
      patchResults,
      patchReport: () => ({ ...patchReport(), notApplicable: [...patchesNotApplicable] }),
      getPatchedCode,
      onPatchBypassed,
      registerInjectionFallback,
      // 模块查找
      filters,
      find: find2,
      findAll,
      findByProps,
      findByCode,
      findByDisplayName,
      findComponentByCode,
      findExportedComponent,
      findStore: findStore2,
      findLazy,
      findByPropsLazy,
      findByCodeLazy,
      findByDisplayNameLazy,
      findComponentByCodeLazy,
      findExportedComponentLazy,
      findStoreLazy,
      findModuleId,
      findModuleFactory,
      mapMangledModule,
      requireModule,
      waitFor,
      search,
      onModuleLoad,
      onceReady,
      getAllStores,
      isZustandStore: isZustandStore2,
      findReact: getReact2,
      // 被其他脚本包装执行的模块只在运行时缓存里:并入本系统的缓存;版本号在缓存变化时递增
      syncModuleCache: () => {
        try {
          syncRuntimeCache();
        } catch {
        }
      },
      moduleCacheVersion: getCacheVersion,
      // DOM / fiber / JSX
      waitForElement,
      observe,
      setAttr,
      setText,
      toggleClass,
      setStyle,
      mount,
      unmount,
      getFiber: getFiber2,
      getProps,
      walkFiberUp,
      findFiberProps,
      addRenderHook,
      asArray,
      treeHas,
      // 路由 / 网络
      onRouteChange,
      onRequest,
      onResponse,
      // 注入点
      addSlotItem,
      removeSlotItem,
      getSlotItems,
      onSlotChange,
      getSlotVersion,
      // 界面
      react: {
        h: h4,
        Fragment: Fragment2,
        getReact: getReact3,
        getRenderer,
        usingSiteRenderer,
        useState: useState2,
        useEffect: useEffect2,
        useLayoutEffect: useLayoutEffect2,
        useMemo,
        useRef: useRef2,
        useCallback,
        useReducer: useReducer2,
        useContext,
        useId,
        useSyncExternalStore,
        useForceUpdate,
        useSubscription: useSubscription2
      },
      components: { ...components_exports, ModalCard, confirmDialog },
      icons: icons_exports,
      openModal,
      closeModal,
      closeAllModals,
      ensureUiRoot: ensureRoot,
      showToast,
      dismissToast,
      ToastType,
      showNotice,
      closeNotice,
      theme: currentTheme,
      // 样式与主题(作用于当前站点分区)
      registerStyle: (name, css) => registerStyle(name, css),
      enableStyle,
      disableStyle,
      unregisterStyle,
      classNameFactory,
      classes,
      getThemes,
      addTheme,
      addLocalTheme,
      updateLocalTheme,
      removeTheme,
      enableTheme,
      disableTheme,
      setThemeAllSites,
      isThemesEnabled,
      setThemesEnabled,
      isOnlineThemesEnabled,
      setOnlineThemesEnabled,
      getQuickCss,
      setQuickCss,
      // 事件
      subscribe,
      dispatch,
      Events,
      // 工具
      Logger,
      ErrorBoundary: ErrorBoundary2,
      makeLazy,
      proxyLazy,
      fetchExternal,
      copyToClipboard,
      debounce,
      sleep,
      onlyOnce,
      escapeRegExp,
      humanizeKey,
      matchesUrl,
      matchPattern,
      isChromium,
      countIdleMutations
    };
    Object.defineProperty(W, "UserscriptPP", { value: api, writable: false, configurable: true, enumerable: false });
    step("同步读取设置", loadSync);
    step("注册核心插件", () => addPlugin(settings_default));
    setSettingsOpener(() => openSettings2());
    const sitePlugins = [];
    for (const entry of sites_default) {
      step(`载入站点 ${entry?.id ?? ""}`, () => {
        const def2 = materialize(entry.site, api);
        if (!def2) return;
        addSite(def2);
        for (const pe of entry.plugins || []) {
          const pd = materialize(pe, api);
          if (pd) {
            pd.site = def2.id;
            sitePlugins.push(pd);
          }
        }
        for (const pd of def2.plugins || []) {
          pd.site ??= def2.id;
          sitePlugins.push(pd);
        }
      });
    }
    const site = selectSite();
    step("站点事件", () => setSiteEvents(site.events));
    step("站点别名", () => installAliases(api));
    const genericPlugins = plugins_default.map((e3) => step("载入通用插件", () => materialize(e3, api))).filter(Boolean);
    for (const def2 of genericPlugins) {
      def2.site ??= "*";
      step(`注册插件 ${def2.name}`, () => addPlugin(def2));
    }
    for (const def2 of sitePlugins) step(`注册插件 ${def2.name}`, () => addPlugin(def2));
    step("菜单命令", installMenuCommands);
    step("悬浮按钮", installFloating);
    step("注册界面样式", () => registerStyle("uspp-ui", UI_CSS));
    if (typeof site.routeInfo === "function") setRouteParser(site.routeInfo);
    if (site.network) step("网络旁路", installNetworkHooks);
    if (site.route) step("路由工具", installRouteWatcher);
    if (site.driver === "turbopack") {
      step("登记补丁", registerPatches);
      step("登记站点设置入口补丁", registerHostPatches);
      step("安装打包器拦截", installInterceptor);
      step("监视打包器", () => watchInstrumentation(2e4));
    } else if (site.driver) {
      logger22.warn(`不支持的打包器驱动:${site.driver}`);
    }
    logger22.info(`Userscript++ ${VERSION}(${BUILD_TYPE}),当前站点 ${site.id},已注册 ${Object.keys(plugins).length} 个插件`);
    (async () => {
      try {
        await loadAsync();
      } catch (e3) {
        logger22.error("读取设置失败", e3);
      }
      step("安装卸载保存", installUnloadSave);
      step("多标签页同步", installCrossTabSync);
      step("清理旧设置", cleanStaleSettings);
      step("记录插件", recordKnownPlugins);
      step("强制依赖", enforceDependencies);
      if (site.driver === "turbopack") step("登记补丁", registerPatches);
      step("启动 Init 插件", () => startAllAt(StartAt.Init));
      const onDom = () => {
        step("启动 DOMContentLoaded 插件", () => startAllAt(StartAt.DOMContentLoaded));
        step("站点启动", () => site.start?.call(site, api));
        waitSiteReady(site, () => onSiteReady(site));
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", onDom, { once: true });
      else onDom();
    })();
    function onSiteReady(s3) {
      if (siteReadyDone) return;
      siteReadyDone = true;
      markSiteReady();
      if (s3.driver === "turbopack") step("扫描模块缓存", rescanRuntimeCache);
      step("onceReady", () => resolveReady());
      dispatch(Events.SITE_READY, { site: s3.id });
      const failed = step("启动 SiteReady 插件", () => startAllAt(StartAt.SiteReady)) || [];
      if (failed.length) retryFailed(failed);
      if (s3.driver === "turbopack") {
        logger22.info(`站点已就绪,已加载 ${moduleCache.size} 个模块`);
        setInterval(() => {
          try {
            syncRuntimeCache();
          } catch {
          }
        }, 2e3);
        setTimeout(() => step("补丁健康报告", logHealthReport), 5e3);
        setTimeout(() => step("构建指纹", () => checkFingerprint(s3)), 0);
      }
    }
    function registerSiteRuntime(entry) {
      const def2 = typeof entry === "function" ? entry(api) : entry;
      if (!addSite(def2, { runtime: true })) return false;
      const stored = getSiteById(def2.id);
      if (!switchTo(stored)) return true;
      logger22.info(`已切换到运行时注册的站点 ${stored.id}`);
      setSiteEvents(stored.events);
      installAliases(api);
      if (typeof stored.routeInfo === "function") setRouteParser(stored.routeInfo);
      if (stored.route) installRouteWatcher();
      for (const pd of stored.plugins || []) {
        pd.site ??= stored.id;
        addPlugin(pd, { runtime: true });
      }
      enforceDependencies();
      for (const stage of [StartAt.Init, StartAt.DOMContentLoaded]) startAllAt(stage);
      step("站点启动", () => stored.start?.call(stored, api));
      siteReadyDone = false;
      waitSiteReady(stored, () => onSiteReady(stored));
      return true;
    }
  }
  try {
    main();
  } catch (e3) {
    console.error("[Userscript++] 启动失败", e3);
  }
})();
