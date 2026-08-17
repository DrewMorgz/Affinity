/* Headless render check. Parse-clean is not enough — both shipped crashes
   (undefined NAVY, REGISTERS["breaches"]) compiled fine and died at render.
   This mounts each module, then clicks through every internal tab/view button
   it can find, failing on the first uncaught error. */
const { JSDOM } = require("jsdom");
const babel = require("@babel/core");
const fs = require("fs");
const path = require("path");

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>",
  { url: "http://localhost/", pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = clearTimeout;
global.localStorage = dom.window.localStorage;
global.Blob = dom.window.Blob;
global.URL.createObjectURL = () => "blob:x";
global.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
dom.window.matchMedia = global.matchMedia;
class RO { observe(){} unobserve(){} disconnect(){} }
global.ResizeObserver = RO; dom.window.ResizeObserver = RO;
global.IntersectionObserver = RO; dom.window.IntersectionObserver = RO;
// swallow async errors so one module can't kill the run
process.on("uncaughtException", (e)=>{ errsGlobal.push(String(e && e.message)); });
process.on("unhandledRejection", (e)=>{ errsGlobal.push(String(e && e.message)); });
const errsGlobal = [];
global.__errsGlobal = errsGlobal;
process.env.NODE_ENV = "development";

// compile .jsx on require
const SRC = path.join(__dirname, "src");
require.extensions[".jsx"] = require.extensions[".js"] = function (mod, filename) {
  let code = fs.readFileSync(filename, "utf8");
  if (filename.indexOf("node_modules") === -1) {
    code = babel.transformSync(code, {
      filename,
      sourceType: "unambiguous",
      presets: [[require("@babel/preset-env"), { targets:{ node:"current" }, modules:"commonjs" }],
                [require("@babel/preset-react"), { runtime:"automatic" }]],
    }).code;
  }
  return mod._compile(code, filename);
};

// resolve extensionless relative imports (./foo -> ./foo.js|.jsx)
const Module = require("module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  try { return origResolve.call(this, request, parent, ...rest); }
  catch (e) {
    if (request.startsWith(".")) {
      const base = path.resolve(path.dirname(parent.filename), request);
      for (const ext of [".js", ".jsx"]) {
        if (fs.existsSync(base + ext)) return base + ext;
      }
    }
    throw e;
  }
};

const React = require("react");
const { createRoot } = require("react-dom/client");
global.IS_REACT_ACT_ENVIRONMENT = true;

const TARGETS = [
  ["System Admin",   "affinity_core_system_admin.jsx",   { isSuperAdmin:true, onNav(){} }],
  ["Compliance",     "affinity_core_compliance.jsx",     { entityCtx:"" }],
  ["Entity Admin",   "affinity_core_entity_admin.jsx",   { role:"system_admin", onNav(){} }],
  ["Report builder", "affinity_core_report_builder.jsx", { isAdmin:true, role:"system_admin" }],
  ["Reporting",      "affinity_core_reporting_v2.jsx",   { role:"system_admin", onNav(){} }],
  ["Tasks",          "affinity_core_tasks.jsx",          { onNav(){} }],
  ["Documents",      "affinity_core_documents_v2.jsx",   { entityCtx:"" }],
  ["Timesheets",     "affinity_core_timesheets_v2.jsx",  {}],
  ["Bookkeeping",    "affinity_core_bookkeeping_v2.jsx", {}],
  ["Generate doc",   "affinity_core_generate_document.jsx", {}],
  ["Accounting",     "affinity_core_accounting.jsx",     { module:"acc_txn" }],
];

let failures = 0;
const errs = [];
const origError = console.error;
console.error = (...a) => {
  const m = String(a[0] || "");
  if (m.includes("not wrapped in act") || m.includes("ReactDOM.render")) return;
  errs.push(m.slice(0, 300));
};

(async () => {
  for (const [name, file, props] of TARGETS) {
    errs.length = 0;
    const host = document.createElement("div");
    document.body.appendChild(host);
    let clicked = 0;
    try {
      const Comp = require(path.join(SRC, file)).default;
      const root = createRoot(host);
      await new Promise((res) => { root.render(React.createElement(Comp, props)); setTimeout(res, 90); });

      // click every button that looks like a view/tab switcher, then re-settle
      // buttons AND clickable divs/spans — Compliance's sidebar is divs with
      // cursor:pointer, which is exactly how a crash slipped past an earlier run.
      const clickable = Array.from(host.querySelectorAll("button, [style*='cursor:pointer'], [style*='cursor: pointer']"));
      const buttons = clickable;
      for (const b of buttons.slice(0, 60)) {
        try {
          b.dispatchEvent(new dom.window.MouseEvent("click", { bubbles:true }));
          clicked++;
          await new Promise((r) => setTimeout(r, 8));
        } catch (e) { errs.push("click: " + e.message); }
      }
      // and every <select>: fire through each option
      for (const sel of Array.from(host.querySelectorAll("select")).slice(0, 30)) {
        for (const opt of Array.from(sel.options).slice(0, 25)) {
          try {
            sel.value = opt.value;
            sel.dispatchEvent(new dom.window.Event("change", { bubbles:true }));
            await new Promise((r) => setTimeout(r, 6));
          } catch (e) { errs.push("select: " + e.message); }
        }
      }
      await new Promise((r) => setTimeout(r, 60));
      errsGlobal.forEach(e=>errs.push(e)); errsGlobal.length=0;
      const hard = errs.filter((e) => /is not defined|Cannot read|undefined is not|is not a function|Minified React/.test(e));
      if (hard.length) { failures++; console.log("FAIL  " + name + "  (" + clicked + " clicks)"); hard.slice(0,3).forEach(e=>console.log("        " + e.split("\n")[0])); }
      else console.log("ok    " + name + "  (" + clicked + " buttons, " + host.querySelectorAll("select").length + " selects exercised)");
    } catch (e) {
      failures++;
      console.log("FAIL  " + name + "  :: " + e.message.split("\n")[0]);
    }
  }
  console.error = origError;
  console.log(failures ? "\n" + failures + " module(s) failing" : "\nall modules render and survive interaction");
  process.exit(failures ? 1 : 0);
})();
