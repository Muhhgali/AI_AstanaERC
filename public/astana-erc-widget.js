(function () {
  if (window.AstanaErcWidgetLoaded) return;
  window.AstanaErcWidgetLoaded = true;

  var script = document.currentScript;
  var scriptUrl = script && script.src ? new URL(script.src) : null;
  var origin =
    (script && script.getAttribute("data-origin")) ||
    (scriptUrl ? scriptUrl.origin : window.location.origin);
  var title =
    (script && script.getAttribute("data-title")) || "Помощник Астана ЕРЦ";
  var side = (script && script.getAttribute("data-side")) || "right";

  var root = document.createElement("div");
  root.id = "astana-erc-widget-root";

  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", title);
  button.innerHTML =
    '<span class="astana-erc-widget-dot"></span><span>Задать вопрос</span>';

  var frameWrap = document.createElement("div");
  frameWrap.setAttribute("aria-hidden", "true");

  var iframe = document.createElement("iframe");
  iframe.title = title;
  iframe.src = origin.replace(/\/$/, "") + "/widget";
  iframe.loading = "lazy";
  iframe.allow = "clipboard-write";

  frameWrap.appendChild(iframe);
  root.appendChild(button);
  root.appendChild(frameWrap);
  document.body.appendChild(root);

  var style = document.createElement("style");
  style.textContent =
    "#astana-erc-widget-root{position:fixed;z-index:2147483647;bottom:20px;" +
    (side === "left" ? "left:20px;" : "right:20px;") +
    "font-family:Arial,Helvetica,sans-serif}" +
    "#astana-erc-widget-root>button{height:48px;border:0;border-radius:999px;background:#2563eb;color:#fff;padding:0 18px;box-shadow:0 12px 32px rgba(15,23,42,.22);display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700;cursor:pointer}" +
    "#astana-erc-widget-root>button:hover{background:#1d4ed8}" +
    ".astana-erc-widget-dot{width:10px;height:10px;border-radius:999px;background:#34d399;box-shadow:0 0 0 4px rgba(52,211,153,.22)}" +
    "#astana-erc-widget-root>div{position:absolute;bottom:60px;" +
    (side === "left" ? "left:0;" : "right:0;") +
    "width:min(390px,calc(100vw - 32px));height:min(620px,calc(100vh - 96px));border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 24px 70px rgba(15,23,42,.28);border:1px solid rgba(15,23,42,.12);opacity:0;transform:translateY(12px) scale(.98);pointer-events:none;transition:opacity .18s ease,transform .18s ease}" +
    "#astana-erc-widget-root.astana-erc-widget-open>div{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}" +
    "#astana-erc-widget-root iframe{display:block;width:100%;height:100%;border:0;background:#fff}" +
    "@media(max-width:520px){#astana-erc-widget-root{left:12px;right:12px;bottom:12px}#astana-erc-widget-root>button{margin-left:auto}#astana-erc-widget-root>div{position:fixed;left:8px;right:8px;bottom:72px;width:auto;height:min(640px,calc(100vh - 88px));border-radius:12px}}";
  document.head.appendChild(style);

  function setOpen(open) {
    root.classList.toggle("astana-erc-widget-open", open);
    frameWrap.setAttribute("aria-hidden", open ? "false" : "true");
  }

  button.addEventListener("click", function () {
    setOpen(!root.classList.contains("astana-erc-widget-open"));
  });

  window.addEventListener("message", function (event) {
    if (event.origin !== origin) return;
    if (event.data && event.data.type === "ASTANA_ERC_WIDGET_CLOSE") {
      setOpen(false);
    }
  });
})();
