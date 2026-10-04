/* NQ Crown · tienda de una sola página con rutas por hash (#/catalogo, #/producto/3 …).
   Todo se guarda en el navegador (localStorage); no hay servidor ni pagos reales. */
(() => {
  "use strict";

  const PRODUCTS = window.PRODUCTS;
  const STORE = window.STORE;
  const byId = id => PRODUCTS.find(p => p.id === Number(id));
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const app = $("#app");

  /* ---------- Utilidades ---------- */
  const money = n => "$" + n.toFixed(2);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = d => d.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
  const fmtShort = d => d.toLocaleDateString("es", { day: "2-digit", month: "2-digit", year: "numeric" });
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const plural = (n, s, p = s + "s") => `${n} ${n === 1 ? s : p}`;
  const ICON = {
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    cart: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2"/><circle cx="9.5" cy="20" r="1.3"/><circle cx="17.5" cy="20" r="1.3"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    store: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9h16l-1.5-5h-13zM5 9v11h14V9M9 20v-6h6v6"/></svg>',
    alert: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>'
  };

  /* ---------- Estado guardado ---------- */
  const load = (k, def) => { try { const v = localStorage.getItem("nqc_" + k); return v ? JSON.parse(v) : def; } catch { return def; } };
  const save = (k, v) => { try { localStorage.setItem("nqc_" + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

  const state = {
    cart: load("cart", {}),          // { idProducto: cantidad }
    favs: load("favs", []),          // [idProducto]
    user: load("user", null),        // { nombre, email } (sin contraseña)
    guest: load("guest", false),     // compra como invitado
    coupon: load("coupon", ""),
    orders: load("orders", [])
  };
  const persist = () => Object.entries(state).forEach(([k, v]) => save(k, v));

  const cartItems = () => Object.entries(state.cart)
    .map(([id, qty]) => ({ p: byId(id), qty }))
    .filter(i => i.p && i.qty > 0);
  const cartCount = () => cartItems().reduce((n, i) => n + i.qty, 0);

  function totals() {
    const subtotal = cartItems().reduce((s, i) => s + i.p.precio * i.qty, 0);
    const rate = STORE.cupones[state.coupon] || 0;
    const descuento = +(subtotal * rate).toFixed(2);
    return { subtotal, descuento, total: +(subtotal - descuento).toFixed(2) };
  }
  const localTexto = () => [STORE.local.nombre, STORE.local.direccion].filter(Boolean).join(" · ");

  /* ---------- Respuesta del sistema (microinteracciones) ---------- */
  let toastTimer, toastAction = null;
  // Aviso que dura 5 s, se pausa con el mouse o el foco y puede tener un botón (Deshacer, Ver carrito).
  function toast(msg, action) {
    const t = $("#toast"), b = $("#toastBtn");
    $("#toastMsg").textContent = msg;
    toastAction = action || null;
    b.hidden = !action;
    if (action) b.textContent = action.label;
    t.classList.add("show");
    restartToast();
  }
  function restartToast() { clearTimeout(toastTimer); toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 5000); }
  $("#toast").addEventListener("mouseenter", () => clearTimeout(toastTimer));
  $("#toast").addEventListener("mouseleave", restartToast);
  $("#toast").addEventListener("focusin", () => clearTimeout(toastTimer));
  $("#toast").addEventListener("focusout", restartToast);
  $("#toastBtn").addEventListener("click", () => { const a = toastAction; $("#toast").classList.remove("show"); a && a.run(); });
  // Anuncio solo para lectores de pantalla (cambios que no tienen aviso visible).
  const announce = msg => { const r = $("#srLive"); r.textContent = ""; setTimeout(() => { r.textContent = msg; }, 60); };

  function addToCart(id, qty = 1, btn) {
    const p = byId(id);
    const before = state.cart[id] || 0;
    state.cart[id] = Math.min(10, before + qty);
    persist(); updateHeader();
    const b = $("#cartBtn"); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump");
    if (btn) { // el botón confirma la acción por un momento
      const old = btn.innerHTML;
      btn.classList.add("is-done"); btn.innerHTML = `${ICON.check} Agregada`;
      setTimeout(() => { if (btn.isConnected) { btn.classList.remove("is-done"); btn.innerHTML = old; } }, 1400);
    }
    const msg = before + qty > 10 ? `Máximo 10 unidades de ${p.nombre}` : `${p.nombre} se agregó al carrito (${plural(cartCount(), "producto")})`;
    toast(msg, { label: "Ver carrito", run: () => go("#/carrito") });
  }
  function setQty(id, qty) {
    if (qty <= 0) delete state.cart[id]; else state.cart[id] = Math.min(10, qty);
    persist(); updateHeader();
  }
  function removeItem(id) {
    const p = byId(id), qty = state.cart[id];
    setQty(id, 0); viewCart();
    toast(`Quitaste ${p.nombre} del carrito`, { label: "Deshacer", run: () => { setQty(id, qty); viewCart(); announce(`${p.nombre} volvió al carrito`); } });
  }
  function toggleFav(id) {
    id = Number(id);
    const on = !state.favs.includes(id);
    state.favs = on ? [...state.favs, id] : state.favs.filter(f => f !== id);
    persist();
    toast(on ? `${byId(id).nombre} se guardó en tus favoritas` : `${byId(id).nombre} se quitó de tus favoritas`);
    return on;
  }
  const favLabel = (p, on) => on ? `Quitar ${p.nombre} de favoritas` : `Guardar ${p.nombre} en favoritas`;

  /* ---------- Rutas ---------- */
  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, "");
    const [path, qs = ""] = raw.split("?");
    const parts = path.split("/").filter(Boolean);
    return { name: parts[0] || (load("visto", false) ? "catalogo" : "bienvenida"), arg: parts[1], q: new URLSearchParams(qs) };
  }
  const go = h => { location.hash = h; };

  const routes = {
    bienvenida: viewWelcome,
    catalogo: viewCatalog,
    producto: viewProduct,
    carrito: viewCart,
    ingresar: viewLogin,
    checkout: viewCheckout,
    confirmacion: viewConfirm,
    pedidos: viewOrders,
    info: viewInfo,
    salir: () => { state.user = null; state.guest = false; persist(); toast("Cerraste sesión"); go("#/catalogo"); }
  };

  function render() {
    const r = parseHash();
    const view = routes[r.name] || viewNotFound;
    document.body.classList.toggle("is-welcome", r.name === "bienvenida");
    view(r);
    updateHeader(r);
  }

  function updateHeader(r = parseHash()) {
    const n = cartCount();
    $("#cartCount").textContent = n;
    $("#cartSr").textContent = ", " + plural(n, "producto");
    const acc = $("#accountLink");
    if (state.user) { acc.textContent = "Hola, " + state.user.nombre.split(" ")[0]; acc.href = "#/pedidos"; }
    else { acc.textContent = "Ingresar"; acc.href = "#/ingresar"; }
    const navKey = r.name === "catalogo" && r.q.get("f") === "fav" ? "favoritos" : r.name;
    $$(".mainnav a").forEach(a => {
      const on = a.dataset.nav === navKey;
      a.classList.toggle("on", on);
      on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
    });
    const s = $("#searchInput");
    if (document.activeElement !== s) s.value = r.name === "catalogo" ? (r.q.get("q") || "") : "";
  }

  // Pinta la pantalla, cambia el título de la pestaña y lleva el foco al título (lectores de pantalla).
  function mount(html, title) {
    app.innerHTML = html;
    document.title = title ? `${title} · NQ Crown` : "NQ Crown · Gorras con carácter";
    if (document.activeElement === $("#searchInput")) return; // escribiendo en el buscador
    window.scrollTo(0, 0);
    const h1 = $("h1", app);
    if (h1) { h1.setAttribute("tabindex", "-1"); h1.focus({ preventScroll: true }); }
    else app.focus({ preventScroll: true });
  }

  /* ---------- Piezas reutilizables ---------- */
  const priceHTML = p => p.antes
    ? `<span class="price"><span class="sr-only">Precio de oferta </span>${money(p.precio)} <s><span class="sr-only">antes </span>${money(p.antes)}</s></span>`
    : `<span class="price">${money(p.precio)}</span>`;

  function cardHTML(p, headingLevel = 3) {
    const fav = state.favs.includes(p.id);
    const tag = p.antes ? '<span class="tag tag--oferta">Oferta</span>' : p.nuevo ? '<span class="tag">Nueva</span>' : "";
    return `<article class="card" aria-labelledby="c${p.id}-${headingLevel}">
      <div class="card__img">
        <a href="#/producto/${p.id}" tabindex="-1"><img src="${p.img}" alt="${esc(p.alt)}" loading="lazy"></a>
        ${tag}
        <button type="button" class="fav ${fav ? "on" : ""}" data-action="fav" data-id="${p.id}" aria-pressed="${fav}" aria-label="${esc(favLabel(p, fav))}" title="${fav ? "Quitar de favoritas" : "Guardar en favoritas"}">${ICON.heart}</button>
      </div>
      <div class="card__body">
        <h${headingLevel} class="card__title" id="c${p.id}-${headingLevel}"><a class="card__name" href="#/producto/${p.id}">${esc(p.nombre)}</a></h${headingLevel}>
        <span class="card__meta">${esc(p.tipo)} · ${esc(p.color)}</span>
        ${priceHTML(p)}
        <button type="button" class="btn btn--cafe btn--block" data-action="add" data-id="${p.id}" aria-label="Agregar ${esc(p.nombre)} al carrito">Agregar al carrito</button>
      </div>
    </article>`;
  }

  function summaryRows(t) {
    return `<dl class="sum">
      <div class="row"><dt>Subtotal</dt><dd>${money(t.subtotal)}</dd></div>
      ${t.descuento ? `<div class="row row--desc"><dt>Descuento (${esc(state.coupon)})</dt><dd>−${money(t.descuento)}</dd></div>` : ""}
      <div class="row row--total"><dt>Total a pagar en el local</dt><dd>${money(t.total)}</dd></div>
    </dl>`;
  }
  const crumbs = items => `<nav class="crumbs" aria-label="Estás aquí"><ol>${items.map(([label, href], i) =>
    `<li>${href ? `<a href="${href}">${label}</a>` : `<span aria-current="page">${label}</span>`}</li>`).join("")}</ol></nav>`;

  /* ---------- 01 Bienvenida ---------- */
  // Solo aparece la primera vez que alguien abre la página; después «/» va directo al catálogo.
  function viewWelcome() {
    save("visto", true);
    mount(`<section class="welcome" aria-labelledby="wTitle">
      <div>
        <img src="img/logo-nq-crown.png" alt="Logo de NQ Crown: las letras NQ con una gorra con corona encima">
        <h1 id="wTitle">NQ Crown</h1>
        <p>Gorras con carácter, hechas para quien lleva la corona.</p>
        <a class="btn btn--beige" href="#/catalogo">Entrar a la tienda</a>
      </div>
    </section>`);
  }

  /* ---------- 02 Catálogo ---------- */
  // Grupos del panel de filtros: clave en la URL, título y cómo se obtiene el valor de cada gorra.
  const FACETS = [
    { key: "t", title: "Tipo", get: p => p.tipo },
    { key: "e", title: "Equipo", get: p => p.equipo },
    { key: "c", title: "Color", get: p => p.color },
    { key: "m", title: "Marca", get: p => p.marca }
  ];
  const listParam = (q, k) => (q.get(k) || "").split("|").filter(Boolean);
  const inPrice = (p, ids) => !ids.length || ids.some(id => { const r = STORE.precios.find(x => x.id === id); return r && p.precio >= r.min && p.precio <= r.max; });

  function matches(p, sel, skip) {
    return FACETS.every(fc => fc.key === skip || !sel[fc.key].length || sel[fc.key].includes(fc.get(p)))
      && (skip === "pr" || inPrice(p, sel.pr));
  }

  function viewCatalog(r) {
    const f = r.q.get("f") || "all", o = r.q.get("o") || "d", term = (r.q.get("q") || "").trim().toLowerCase();
    let page = Math.max(1, parseInt(r.q.get("p")) || 1);
    const sel = { pr: listParam(r.q, "pr") };
    FACETS.forEach(fc => { sel[fc.key] = listParam(r.q, fc.key); });
    const nSel = Object.values(sel).reduce((n, v) => n + v.length, 0);

    // base = gorras que cumplen el filtro rápido y la búsqueda (los conteos del panel parten de aquí)
    const base = PRODUCTS.filter(p =>
      (f === "all" || (f === "nuevo" && p.nuevo) || (f === "oferta" && p.antes) || (f === "fav" && state.favs.includes(p.id))) &&
      (!term || [p.nombre, p.modelo, p.tipo, p.color, p.marca, p.equipo].join(" ").toLowerCase().includes(term)));
    let list = base.filter(p => matches(p, sel));
    if (o === "a") list.sort((a, b) => a.precio - b.precio);
    if (o === "z") list.sort((a, b) => b.precio - a.precio);
    if (o === "n") list.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

    const pages = Math.max(1, Math.ceil(list.length / STORE.porPagina));
    page = Math.min(page, pages);
    const from = (page - 1) * STORE.porPagina;
    const shown = list.slice(from, from + STORE.porPagina);
    const QUICK = { all: "Todas", nuevo: "Nuevas", oferta: "En oferta", fav: "Mis favoritas" };
    const chip = k => `<button type="button" class="chip ${f === k ? "on" : ""}" data-action="filter" data-f="${k}" aria-pressed="${f === k}">${QUICK[k]}</button>`;
    const opt = (k, label) => `<option value="${k}" ${o === k ? "selected" : ""}>${label}</option>`;
    const status = shown.length
      ? `Mostrando ${from + 1}–${from + shown.length} de ${plural(list.length, "gorra")}${term ? ` para «${esc(term)}»` : ""}${nSel ? ` · ${plural(nSel, "filtro")}` : ""}`
      : "";

    // Panel de filtros: cada opción muestra cuántas gorras quedarían al marcarla
    let n = 0;
    const group = (key, title, options) => `<fieldset class="facet"><legend>${title}</legend>${options.map(([value, label, count]) => {
      const id = `fl${n++}`, on = sel[key].includes(value);
      return `<label class="facet__opt ${count || on ? "" : "is-empty"}" for="${id}"><input type="checkbox" id="${id}" data-facet="${key}" value="${esc(value)}" ${on ? "checked" : ""} ${count || on ? "" : "disabled"}><span>${esc(label)}</span><small aria-label="${plural(count, "gorra")}">${count}</small></label>`;
    }).join("")}</fieldset>`;
    const facetsHTML = FACETS.map(fc => {
      const values = [...new Set(PRODUCTS.map(fc.get))].sort((a, b) => a === "Sin equipo" ? 1 : b === "Sin equipo" ? -1 : a.localeCompare(b, "es"));
      return group(fc.key, fc.title, values.map(v => [v, v, base.filter(p => fc.get(p) === v && matches(p, sel, fc.key)).length]));
    }).join("") + group("pr", "Precio", STORE.precios.map(rg => [rg.id, rg.label, base.filter(p => inPrice(p, [rg.id]) && matches(p, sel, "pr")).length]));
    const pills = [...FACETS.flatMap(fc => sel[fc.key].map(v => [fc.key, v, v])), ...sel.pr.map(id => ["pr", id, STORE.precios.find(x => x.id === id)?.label || id])]
      .map(([k, v, label]) => `<button type="button" class="pill" data-action="unfacet" data-facet="${k}" data-value="${esc(v)}" aria-label="Quitar filtro ${esc(label)}">${esc(label)} <span aria-hidden="true">×</span></button>`).join("");

    let body;
    if (shown.length) {
      body = `<div class="grid grid--3">${shown.map(p => cardHTML(p)).join("")}</div>`;
      if (pages > 1) body += `<nav class="pager" aria-label="Páginas del catálogo">
        <button type="button" data-action="page" data-p="${page - 1}" ${page === 1 ? "disabled" : ""} aria-label="Página anterior">‹</button>
        ${Array.from({ length: pages }, (_, i) => `<button type="button" class="${i + 1 === page ? "on" : ""}" data-action="page" data-p="${i + 1}" aria-label="Página ${i + 1}" ${i + 1 === page ? 'aria-current="page"' : ""}>${i + 1}</button>`).join("")}
        <button type="button" data-action="page" data-p="${page + 1}" ${page === pages ? "disabled" : ""} aria-label="Página siguiente">›</button>
      </nav>`;
    } else if (f === "fav" && !term && !nSel) {
      body = `<div class="empty"><h3>Aún no tienes favoritas</h3><p>Toca el corazón ${ICON.heart} de una gorra para guardarla aquí.</p><button type="button" class="btn btn--cafe" data-action="filter" data-f="all">Ver todas las gorras</button></div>`;
    } else {
      body = `<div class="empty"><h3>No encontramos gorras${term ? ` para «${esc(term)}»` : ""} con esos filtros</h3><p>Prueba con otra palabra, un equipo (por ejemplo «Yankees») o quita algún filtro.</p>${nSel ? `<button type="button" class="btn btn--cafe" data-action="clearfacets">Quitar filtros</button>` : `<a class="btn btn--cafe" href="#/catalogo">Ver todo el catálogo</a>`}</div>`;
    }

    const openPanel = load("filtrosAbiertos", false);
    const showHero = f === "all" && !term && page === 1 && !nSel;
    mount(`
      ${showHero ? `<section class="hero" aria-labelledby="heroTitle"><div class="wrap">
        <h1 id="heroTitle">Corona para cada estilo</h1>
        <p>Gorras, viseras y buckets de tus equipos favoritos. Reserva en línea, retira y paga en el local.</p>
        <button type="button" class="btn btn--negro" data-action="scroll">Ver catálogo</button>
      </div></section>` : ""}
      <section class="wrap section" id="catalogo-lista" aria-labelledby="catTitle">
        ${showHero ? `<h2 class="section__title" id="catTitle" tabindex="-1">Catálogo</h2>` : `<h1 class="section__title" id="catTitle">${f === "fav" ? "Mis favoritas" : term ? "Resultados de búsqueda" : "Catálogo"}</h1>`}
        <div class="toolbar">
          <div class="chips" role="group" aria-label="Mostrar">${chip("all")}${chip("nuevo")}${chip("oferta")}${chip("fav")}</div>
          <button type="button" class="btn btn--borde filters-toggle" data-action="togglefilters" aria-expanded="${openPanel}" aria-controls="filtros">Filtros${nSel ? ` (${nSel})` : ""}</button>
          <label class="sortlabel" for="sort"><span>Ordenar por</span>
          <select id="sort">${opt("d", "Destacadas")}${opt("a", "Precio: menor a mayor")}${opt("z", "Precio: mayor a menor")}${opt("n", "Nombre: A a Z")}</select></label>
        </div>
        <div class="catalog">
          <aside class="filters ${openPanel ? "is-open" : ""}" id="filtros" aria-labelledby="filtersTitle">
            <div class="filters__head"><h2 id="filtersTitle">Filtrar gorras</h2>${nSel ? `<button type="button" class="link" data-action="clearfacets">Limpiar todo</button>` : ""}</div>
            ${facetsHTML}
          </aside>
          <div class="catalog__results">
            ${pills ? `<div class="pills" aria-label="Filtros activos">${pills}<button type="button" class="link" data-action="clearfacets">Limpiar filtros</button></div>` : ""}
            <p class="results" id="results">${status}</p>
            ${body}
          </div>
        </div>
      </section>`, f === "fav" ? "Favoritas" : "Catálogo");

    $("#sort").addEventListener("change", e => setCatalogQuery({ o: e.target.value, p: 1 }));
    $("#filtros").addEventListener("change", e => {
      const cb = e.target.closest("[data-facet]");
      if (!cb) return;
      const vals = listParam(parseHash().q, cb.dataset.facet).filter(v => v !== cb.value);
      if (cb.checked) vals.push(cb.value);
      const id = cb.id;
      setCatalogQuery({ [cb.dataset.facet]: vals.join("|"), p: 1 }, true);
      $("#" + id)?.focus(); // el foco se queda en la misma casilla
    });
  }

  function setCatalogQuery(changes, replace = false) {
    const r = parseHash();
    const q = r.name === "catalogo" ? r.q : new URLSearchParams();
    Object.entries(changes).forEach(([k, v]) => {
      if (v === "" || v == null || (k === "f" && v === "all") || (k === "o" && v === "d") || (k === "p" && v === 1)) q.delete(k); else q.set(k, v);
    });
    const h = "#/catalogo" + (q.toString() ? "?" + q : "");
    if (replace && r.name === "catalogo") {
      history.replaceState(null, "", h); render();
      announce($("#results")?.textContent || "No encontramos gorras con esos filtros");
    } else go(h);
  }

  /* ---------- 03 Detalle ---------- */
  // Las 4 vistas son acercamientos de la misma foto (no hay fotos de otros ángulos).
  const VIEWS = [
    { z: 1, ox: "50%", oy: "50%", label: "Vista completa" },
    { z: 1.8, ox: "45%", oy: "35%", label: "Acercamiento al logo" },
    { z: 1.7, ox: "20%", oy: "65%", label: "Acercamiento a la visera" },
    { z: 1.7, ox: "85%", oy: "55%", label: "Acercamiento al costado" }
  ];
  const viewStyle = v => `--z:${v.z};--ox:${v.ox};--oy:${v.oy}`;

  function viewProduct(r) {
    const p = byId(r.arg);
    if (!p) return viewNotFound();
    let qty = 1;
    const fav = state.favs.includes(p.id);
    const inCart = state.cart[p.id] || 0;
    const related = PRODUCTS.filter(x => x.id !== p.id && x.tipo === p.tipo)
      .concat(PRODUCTS.filter(x => x.id !== p.id && x.tipo !== p.tipo)).slice(0, 4);

    mount(`<div class="wrap">
      ${crumbs([["Catálogo", "#/catalogo"], [esc(p.nombre)]])}
      <div class="detail">
        <section class="gallery" aria-label="Fotos de ${esc(p.nombre)}">
          <div class="gallery__main"><img id="mainImg" src="${p.img}" alt="${esc(VIEWS[0].label + ": " + p.alt)}" style="${viewStyle(VIEWS[0])}"></div>
          <div class="thumbs" role="group" aria-label="Elegir vista">${VIEWS.map((v, i) => `<button type="button" class="thumb ${i ? "" : "on"}" data-action="view" data-v="${i}" aria-pressed="${!i}" aria-label="${v.label}" title="${v.label}"><img src="${p.img}" alt="" style="${viewStyle(v)}"></button>`).join("")}</div>
        </section>
        <div class="info">
          <h1>${esc(p.nombre)}</h1>
          <p class="brandline">${esc(p.marca)} · ${esc(p.modelo)}</p>
          <p class="stars"><span aria-hidden="true">★★★★☆</span><span class="sr-only">Calificación: 4 de 5 estrellas,</span> (24 reseñas)</p>
          <p class="bigprice">${priceHTML(p)}</p>
          <p class="desc">${esc(p.desc)}</p>
          <span class="label" id="qtyLabel">Cantidad</span>
          <div class="qty" role="group" aria-labelledby="qtyLabel">
            <button type="button" data-action="dqty" data-d="-1" aria-label="Quitar una unidad" disabled>−</button>
            <output id="dqty" aria-live="polite" aria-label="Cantidad">1</output>
            <button type="button" data-action="dqty" data-d="1" aria-label="Agregar una unidad">+</button>
          </div>
          <p class="hint" id="qtyHint">Máximo 10 unidades por gorra.${inCart ? ` Ya tienes ${inCart} en tu carrito.` : ""}</p>
          <div class="buyrow">
            <button type="button" class="btn btn--cafe" data-action="addDetail" data-id="${p.id}">${ICON.cart} Agregar al carrito</button>
            <button type="button" class="fav ${fav ? "on" : ""}" data-action="fav" data-id="${p.id}" aria-pressed="${fav}" aria-label="${esc(favLabel(p, fav))}" title="${fav ? "Quitar de favoritas" : "Guardar en favoritas"}">${ICON.heart}</button>
          </div>
          <ul class="perks" aria-label="Beneficios">
            <li class="perk"><strong>Retiro en el local</strong><small>sin costo</small></li>
            <li class="perk"><strong>Devolución</strong><small>en 15 días</small></li>
            <li class="perk"><strong>Pagas al retirar</strong><small>en el local</small></li>
          </ul>
          <div class="specs">
            <h2>Detalles del producto</h2>
            <ul>${p.detalles.map(d => `<li>${esc(d)}</li>`).join("")}<li>Color: ${esc(p.color)}</li></ul>
          </div>
        </div>
      </div>
      <section class="related" aria-labelledby="relTitle">
        <h2 class="section__title" id="relTitle">También te puede gustar</h2>
        <div class="grid">${related.map(x => cardHTML(x, 3)).join("")}</div>
      </section>
    </div>`, p.nombre);

    app.onclickDetail = action => {
      if (action.dataset.action === "dqty") {
        qty = Math.min(10, Math.max(1, qty + Number(action.dataset.d)));
        $("#dqty").textContent = qty;
        const [minus, plus] = $$('[data-action="dqty"]');
        minus.disabled = qty === 1; plus.disabled = qty === 10;
        if (document.activeElement.disabled || !document.activeElement.isConnected) (qty === 1 ? plus : minus).focus();
      } else if (action.dataset.action === "addDetail") {
        addToCart(p.id, qty, action); // se queda en el detalle: botón «✓ Agregada» + aviso con «Ver carrito»
        $("#qtyHint").textContent = `Máximo 10 unidades por gorra. Ya tienes ${state.cart[p.id]} en tu carrito.`;
      } else if (action.dataset.action === "view") {
        const v = VIEWS[action.dataset.v];
        $$(".thumb").forEach(t => { t.classList.toggle("on", t === action); t.setAttribute("aria-pressed", t === action); });
        const img = $("#mainImg");
        img.setAttribute("style", viewStyle(v));
        img.alt = `${v.label}: ${p.alt}`;
      }
    };
  }

  /* ---------- 04 Carrito ---------- */
  function viewCart() {
    const items = cartItems();
    const n = cartCount();
    const head = `<div class="pagehead">${ICON.cart}<h1>Tu carrito (${plural(n, "producto")})</h1></div>`;
    const cr = crumbs([["Catálogo", "#/catalogo"], ["Carrito"]]);
    if (!items.length) {
      return mount(`<div class="wrap">${cr}${head}
        <div class="empty"><h2>Tu carrito está vacío</h2><p>Agrega una gorra desde el catálogo para empezar tu pedido.</p><a class="btn btn--cafe" href="#/catalogo">Ver catálogo</a></div></div>`, "Carrito");
    }
    const t = totals();
    const active = document.activeElement?.dataset;
    mount(`<div class="wrap">${cr}${head}
      <div class="layout">
        <section aria-label="Productos en el carrito">
          <div class="cols" aria-hidden="true"><span>Producto</span><span>Cantidad</span><span>Precio</span></div>
          <ul class="lines">
          ${items.map(({ p, qty }) => `<li class="line">
            <div class="line__prod">
              <img src="${p.img}" alt="${esc(p.alt)}">
              <div><a href="#/producto/${p.id}">${esc(p.nombre)}</a>
                <small>${esc(p.tipo)} · ${esc(p.color)} · ${money(p.precio)} c/u</small>
                <button type="button" class="link" data-action="remove" data-id="${p.id}" aria-label="Eliminar ${esc(p.nombre)} del carrito">Eliminar</button></div>
            </div>
            <div class="qty" role="group" aria-label="Cantidad de ${esc(p.nombre)}">
              <button type="button" data-action="qty" data-id="${p.id}" data-d="-1" aria-label="Quitar una unidad de ${esc(p.nombre)}" ${qty <= 1 ? "disabled" : ""}>−</button>
              <span>${qty}</span>
              <button type="button" data-action="qty" data-id="${p.id}" data-d="1" aria-label="Agregar una unidad de ${esc(p.nombre)}" ${qty >= 10 ? "disabled" : ""}>+</button>
            </div>
            <div class="line__total"><span class="sr-only">Precio: </span>${money(p.precio * qty)}</div>
          </li>`).join("")}
          </ul>
          <a class="link back" href="#/catalogo">←  Seguir comprando</a>
        </section>
        <aside class="panel" aria-labelledby="sumTitle">
          <h2 id="sumTitle">Resumen del pedido</h2>
          ${summaryRows(t)}
          <p class="notice notice--small">${ICON.store} No hacemos envíos: retiras tu pedido y pagas en ${esc(localTexto())}.</p>
          <form class="coupon" id="couponForm" novalidate>
            <label class="label" for="couponInput">Código de descuento</label>
            <div class="coupon__row">
              <input id="couponInput" placeholder="Ej.: CROWN10" value="${esc(state.coupon)}" autocomplete="off" aria-describedby="couponMsg" ${state.coupon ? "readonly" : ""}>
              <button class="btn btn--beige">${state.coupon ? "Quitar" : "Aplicar"}</button>
            </div>
            <p class="hint ${state.coupon ? "ok" : ""}" id="couponMsg">${state.coupon ? `✓ Código ${esc(state.coupon)} aplicado: ${STORE.cupones[state.coupon] * 100}% de descuento.` : "Si tienes un código, escríbelo aquí. Para probar: CROWN10."}</p>
          </form>
          <button type="button" class="btn btn--verde btn--block btn--lg" data-action="pay">Reservar pedido</button>
          <p class="secure">En el siguiente paso puedes ingresar o continuar como invitado.</p>
        </aside>
      </div></div>`, "Carrito");

    // Mantener el foco en el mismo botón tras cambiar la cantidad (no perder la posición con teclado).
    if (active?.action === "qty") {
      const same = $(`[data-action="qty"][data-id="${active.id}"][data-d="${active.d}"]`);
      const other = $(`[data-action="qty"][data-id="${active.id}"]:not([data-d="${active.d}"])`);
      (same && !same.disabled ? same : other)?.focus();
    }

    $("#couponForm").addEventListener("submit", e => {
      e.preventDefault();
      if (state.coupon) { state.coupon = ""; persist(); viewCart(); toast("Quitaste el código de descuento"); return; }
      const code = $("#couponInput").value.trim().toUpperCase();
      if (STORE.cupones[code]) { state.coupon = code; persist(); viewCart(); toast(`Código ${code} aplicado: ${STORE.cupones[code] * 100}% de descuento`); }
      else {
        const m = $("#couponMsg"), i = $("#couponInput");
        m.textContent = code ? `El código «${code}» no existe o ya venció. Revisa cómo está escrito.` : "Escribe un código antes de presionar Aplicar.";
        m.className = "hint err"; i.setAttribute("aria-invalid", "true"); i.focus();
      }
    });
  }

  /* ---------- 05 Login ---------- */
  function viewLogin(r) {
    const next = r.q.get("next") || "catalogo";
    let tab = r.q.get("tab") === "crear" ? "crear" : "ingresar";
    const draw = (focusTab = false) => {
      const isIn = tab === "ingresar";
      mount(`<div class="wrap"><div class="auth">
        ${next === "checkout" ? `<p class="notice">${ICON.alert} Para terminar tu compra, ingresa a tu cuenta o continúa como invitado.</p>` : ""}
        <div class="tabs" role="tablist" aria-label="Tipo de acceso">
          <button type="button" role="tab" id="tab-ingresar" aria-controls="authPanel" class="${isIn ? "on" : ""}" aria-selected="${isIn}" tabindex="${isIn ? 0 : -1}" data-action="tab" data-t="ingresar">Ingresar</button>
          <button type="button" role="tab" id="tab-crear" aria-controls="authPanel" class="${!isIn ? "on" : ""}" aria-selected="${!isIn}" tabindex="${!isIn ? 0 : -1}" data-action="tab" data-t="crear">Crear cuenta</button>
        </div>
        <div class="auth__box" role="tabpanel" id="authPanel" aria-labelledby="tab-${tab}">
          <h1>${isIn ? "Bienvenido de nuevo" : "Crea tu cuenta"}</h1>
          <p class="req-note">Los campos marcados con <span class="req" aria-hidden="true">*</span> son obligatorios.</p>
          <div class="errsum" id="errSum" tabindex="-1" hidden></div>
          <form id="authForm" novalidate>
            ${!isIn ? field("nombre", "Nombre completo", { auto: "name", req: true, hint: "Como quieres que te saludemos." }) : ""}
            ${field("email", "Correo electrónico", { type: "email", ph: "correo@ejemplo.com", auto: "email", req: true })}
            ${field("pass", "Contraseña", { type: "password", auto: isIn ? "current-password" : "new-password", req: true, hint: isIn ? "" : "Mínimo 6 caracteres.", reveal: true })}
            ${!isIn ? field("pass2", "Repite la contraseña", { type: "password", auto: "new-password", req: true, reveal: true }) : ""}
            ${isIn ? '<p><button type="button" class="link" data-action="forgot">¿Olvidaste tu contraseña?</button></p>' : ""}
            <button class="btn btn--cafe btn--block">${isIn ? "Ingresar" : "Crear cuenta"}</button>
          </form>
          <div class="or" aria-hidden="true">o</div>
          <button type="button" class="btn btn--borde btn--block" data-action="guest">Continuar como invitado</button>
          <p class="fine">Como invitado no necesitas contraseña; solo te pediremos tus datos de contacto para la reserva.</p>
        </div>
      </div></div>`, isIn ? "Ingresar" : "Crear cuenta");
      if (focusTab) $(`#tab-${tab}`).focus();

      $(".tabs").addEventListener("keydown", e => { // flechas para cambiar de pestaña (patrón ARIA de pestañas)
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) { e.preventDefault(); tab = tab === "ingresar" ? "crear" : "ingresar"; draw(true); }
      });
      $("#authForm").addEventListener("submit", e => {
        e.preventDefault();
        const v = formValues(e.target);
        const errs = {};
        if (!isIn && v.nombre.length < 2) errs.nombre = "Escribe tu nombre.";
        if (!v.email) errs.email = "Escribe tu correo electrónico.";
        else if (!EMAIL.test(v.email)) errs.email = "El correo debe tener la forma nombre@dominio.com.";
        if (!v.pass) errs.pass = "Escribe tu contraseña.";
        else if (v.pass.length < 6) errs.pass = "La contraseña debe tener al menos 6 caracteres.";
        if (!isIn && v.pass !== v.pass2) errs.pass2 = "Las dos contraseñas no son iguales.";
        if (showErrors(e.target, errs)) return;
        // Demo sin servidor: no se guarda la contraseña, solo el nombre y el correo.
        const nombre = !isIn ? v.nombre : v.email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        state.user = { nombre, email: v.email };
        state.guest = false; persist();
        toast(!isIn ? `¡Listo, ${nombre.split(" ")[0]}! Tu cuenta fue creada.` : `Hola de nuevo, ${nombre.split(" ")[0]}`);
        go("#/" + next);
      });
    };
    app.onclickDetail = a => {
      if (a.dataset.action === "tab" && a.dataset.t !== tab) { tab = a.dataset.t; draw(true); }
      if (a.dataset.action === "guest") { state.guest = true; persist(); toast("Continúas como invitado"); go("#/" + next); }
      if (a.dataset.action === "forgot") toast("Te enviaríamos un enlace a tu correo para crear una nueva contraseña (demo).");
    };
    draw();
  }

  /* ---------- Formularios accesibles ---------- */
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  // Campo con etiqueta, ayuda y mensaje de error enlazados por aria-describedby.
  function field(name, label, o = {}) {
    const desc = [o.hint ? `h_${name}` : "", `m_${name}`].filter(Boolean).join(" ");
    return `<div class="field" data-f="${name}">
      <label for="f_${name}">${label}${o.req ? ' <span class="req" aria-hidden="true">*</span>' : ""}</label>
      <div class="field__in">
        <input id="f_${name}" name="${name}" type="${o.type || "text"}" placeholder="${esc(o.ph || "")}" autocomplete="${o.auto || "off"}" value="${esc(o.value || "")}" aria-describedby="${desc}" ${o.req ? 'aria-required="true"' : ""} ${o.extra || ""}>
        ${o.reveal ? `<button type="button" class="reveal" data-action="reveal" data-for="f_${name}" aria-pressed="false" aria-label="Mostrar contraseña" title="Mostrar contraseña">${ICON.eye}</button>` : ""}
      </div>
      ${o.hint ? `<span class="hint" id="h_${name}">${o.hint}</span>` : ""}
      <span class="msg" id="m_${name}"></span>
    </div>`;
  }
  const formValues = form => Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v).trim()]));
  // Marca los campos con error, muestra un resumen arriba con enlaces y lleva el foco al resumen.
  function showErrors(form, errs) {
    $$(".field", form).forEach(f => {
      const msg = errs[f.dataset.f] || "";
      f.classList.toggle("bad", !!msg);
      $(".msg", f).innerHTML = msg ? `${ICON.alert} ${esc(msg)}` : "";
      $("input", f)?.setAttribute("aria-invalid", msg ? "true" : "false");
    });
    const keys = Object.keys(errs);
    const sum = $("#errSum");
    if (!keys.length) { if (sum) sum.hidden = true; return false; }
    if (sum) {
      sum.hidden = false;
      sum.innerHTML = `<h2>${ICON.alert} Revisa ${plural(keys.length, "campo")} antes de continuar:</h2>
        <ul>${keys.map(k => `<li><a href="#f_${k}" data-action="focusField" data-target="f_${k}">${esc((l => l?.dataset.label || l?.firstChild.textContent.trim())($(`label[for="f_${k}"]`)) || k)}: ${esc(errs[k])}</a></li>`).join("")}</ul>`;
      sum.focus();
    } else $(`[name="${keys[0]}"]`, form)?.focus();
    return true;
  }

  /* ---------- 06 Checkout (reserva para retirar) ---------- */
  function viewCheckout() {
    if (!cartItems().length) { toast("Tu carrito está vacío; agrega una gorra primero"); return go("#/carrito"); }
    if (!state.user && !state.guest) return go("#/ingresar?next=checkout");
    let sending = false;
    const u = state.user || {};
    const [nom = "", ...ape] = (u.nombre || "").split(" ");
    const t = totals();

    mount(`<div class="wrap">
      ${crumbs([["Catálogo", "#/catalogo"], ["Carrito", "#/carrito"], ["Reservar pedido"]])}
      <h1 class="section__title">Reservar pedido</h1>
      <ol class="steps" aria-label="Pasos de la reserva">
        <li class="step" data-step="0"><b>1</b>Tus datos</li><li class="step" data-step="1"><b>2</b>Retiro y pago</li>
      </ol>
      <p class="req-note">${state.guest && !state.user ? "Reservas como invitado. " : ""}Los campos marcados con <span class="req" aria-hidden="true">*</span> son obligatorios.</p>
      <div class="layout">
        <div>
          <div class="errsum" id="errSum" tabindex="-1" hidden></div>
          <form id="checkoutForm" novalidate>
            <fieldset class="box" data-step="0"><legend>Tus datos</legend>
              <div class="grid2">
                ${field("nombre", "Nombre", { auto: "given-name", value: nom, req: true })}
                ${field("apellido", "Apellido", { auto: "family-name", value: ape.join(" "), req: true, hint: "Lo pediremos al retirar el pedido." })}
              </div>
              ${field("email", "Correo electrónico", { type: "email", ph: "correo@ejemplo.com", auto: "email", value: u.email, req: true, hint: "Te avisaremos aquí cuando tu pedido esté listo para retirar." })}
              ${field("telefono", "Teléfono", { type: "tel", auto: "tel", req: true, hint: "Ej.: 0991234567. Por si necesitamos contactarte." })}
              <label class="check"><input type="checkbox" name="ofertas"> Quiero recibir ofertas por correo</label>
            </fieldset>
            <fieldset class="box" data-step="1"><legend>Retiro y pago</legend>
              <div class="pickup">
                <span class="pickup__icon">${ICON.store}</span>
                <div>
                  <strong>${esc(STORE.local.nombre)}</strong>
                  ${STORE.local.direccion ? `<p>${esc(STORE.local.direccion)}</p>` : ""}
                  <p>${esc(STORE.local.horario)}</p>
                </div>
              </div>
              <ul class="pickup__steps">
                <li>Te enviamos un correo cuando tu pedido esté listo.</li>
                <li>Vas al local, das tu número de pedido y tu nombre.</li>
                <li>Pagas ahí al retirar. No pagas nada en línea.</li>
                <li><b>Si no te acercas en máximo 3 días después de tu reservación, se cancelará.</b></li>
              </ul>
              <label class="check check--box" for="f_acepto" data-label="Confirmación de retiro"><input type="checkbox" name="acepto" id="f_acepto" aria-describedby="m_acepto"> Entiendo que debo retirar y pagar el pedido en el local.</label>
              <div class="field" data-f="acepto"><span class="msg" id="m_acepto"></span></div>
            </fieldset>
            <a class="link" href="#/carrito">←  Volver al carrito</a>
          </form>
        </div>
        <aside class="panel" id="resumen" aria-labelledby="sumTitle">
          <h2 id="sumTitle">Resumen del pedido</h2>
          <ul class="minis">${cartItems().map(({ p, qty }) => `<li class="mini"><img src="${p.img}" alt="${esc(p.alt)}"><div><strong>${esc(p.nombre)}</strong><small>${esc(p.color)} · ${plural(qty, "unidad", "unidades")}</small></div><span>${money(p.precio * qty)}</span></li>`).join("")}</ul>
          <a class="link small" href="#/carrito">Cambiar productos</a>
          <div style="margin-top:12px">${summaryRows(t)}</div>
          <button class="btn btn--verde btn--block btn--lg" form="checkoutForm" id="confirmBtn">Confirmar reserva · ${money(t.total)}</button>
          <p class="secure">Pagas ${money(t.total)} al retirar en el local.</p>
        </aside>
      </div></div>`, "Reservar pedido");

    const form = $("#checkoutForm");
    // Pasos: el actual se marca y el anterior queda con check (visibilidad del estado del sistema).
    const setStep = n => $$(".step").forEach((s, i) => {
      s.classList.toggle("is-current", i === n); s.classList.toggle("is-done", i < n);
      i === n ? s.setAttribute("aria-current", "step") : s.removeAttribute("aria-current");
      $("b", s).innerHTML = i < n ? `${ICON.check}<span class="sr-only">completado:</span>` : i + 1;
    });
    setStep(0);
    form.addEventListener("focusin", e => { const fs = e.target.closest("[data-step]"); if (fs) setStep(+fs.dataset.step); });
    form.addEventListener("input", e => {
      const f = e.target.closest(".field.bad");
      if (f) { f.classList.remove("bad"); $(".msg", f).textContent = ""; e.target.setAttribute("aria-invalid", "false"); }
    });
    form.addEventListener("change", e => {
      if (e.target.name === "acepto" && e.target.checked) { const f = $('[data-f="acepto"]', form); f.classList.remove("bad"); $(".msg", f).textContent = ""; }
    });

    form.addEventListener("submit", e => {
      e.preventDefault();
      if (sending) return; // evita reservar dos veces
      const v = formValues(form);
      const errs = {};
      if (v.nombre.length < 2) errs.nombre = "Escribe tu nombre.";
      if (v.apellido.length < 2) errs.apellido = "Escribe tu apellido.";
      if (!v.email) errs.email = "Escribe tu correo."; else if (!EMAIL.test(v.email)) errs.email = "El correo debe tener la forma nombre@dominio.com.";
      if (v.telefono.replace(/\D/g, "").length < 7) errs.telefono = "Escribe un teléfono de al menos 7 números.";
      if (!form.acepto.checked) errs.acepto = "Marca la casilla para confirmar que retirarás y pagarás en el local.";
      if (showErrors(form, errs)) return;

      // Microinteracción: el botón muestra que se está procesando
      sending = true;
      const btn = $("#confirmBtn");
      btn.disabled = true; btn.classList.add("is-loading"); btn.textContent = "Reservando pedido…";
      announce("Reservando tu pedido, espera un momento");
      setTimeout(() => {
        const order = {
          num: String(Math.floor(100000 + Math.random() * 900000)),
          fecha: new Date().toISOString(),
          items: cartItems().map(({ p, qty }) => ({ id: p.id, qty, precio: p.precio })),
          ...totals(), cupon: state.coupon,
          cliente: `${v.nombre} ${v.apellido}`, email: v.email, telefono: v.telefono,
          retiro: localTexto()
        };
        state.orders.unshift(order);
        state.cart = {}; state.coupon = ""; persist();
        go("#/confirmacion/" + order.num);
      }, 900);
    });
  }

  /* ---------- 07 Confirmación ---------- */
  function viewConfirm(r) {
    const o = state.orders.find(x => x.num === r.arg);
    if (!o) return viewNotFound();
    mount(`<div class="wrap"><div class="done">
      <div class="done__check">${ICON.check}</div>
      <h1>¡Pedido reservado!</h1>
      <p>Tu pedido <b>#${o.num}</b> está reservado. Te escribiremos a <b>${esc(o.email)}</b> cuando esté listo para retirar.</p>
      <section class="panel" aria-labelledby="resTitle">
        <h2 id="resTitle">Resumen</h2>
        <dl class="sum">
          <div class="row"><dt>A nombre de</dt><dd>${esc(o.cliente)}</dd></div>
          <div class="row"><dt>Retiro</dt><dd style="text-align:right">${esc(o.retiro || STORE.local.nombre)}<br><small>${esc(STORE.local.horario)}</small></dd></div>
          <div class="row"><dt>Pago</dt><dd>Al retirar, en el local</dd></div>
          <div class="row row--total"><dt>Total a pagar</dt><dd>${money(o.total)}</dd></div>
        </dl>
        <p class="notice notice--small">${ICON.store} Lleva tu número de pedido <b>#${o.num}</b> al local. Si no te acercas en máximo 3 días después de tu reservación, se cancelará.</p>
      </section>
      <div class="actions">
        <a class="btn btn--cafe" href="#/catalogo">Seguir comprando</a>
        <a class="btn btn--borde" href="#/pedidos">Ver mis pedidos</a>
      </div>
    </div></div>`, "Pedido reservado");
  }

  /* ---------- Mis pedidos ---------- */
  function viewOrders() {
    const list = state.orders;
    mount(`<div class="wrap">
      ${crumbs([["Catálogo", "#/catalogo"], ["Mis pedidos"]])}
      <div class="pagehead" style="justify-content:space-between;flex-wrap:wrap">
        <h1>Mis pedidos</h1>
        ${state.user ? `<p>${esc(state.user.nombre)} · ${esc(state.user.email)} · <a class="link" href="#/salir">Cerrar sesión</a></p>` : ""}
      </div>
      ${list.length ? `<ul class="orders">${list.map(o => `<li class="order">
        <div class="order__head"><h2>Pedido #${o.num}</h2><span class="badge">Retiro en el local</span><span>${fmtShort(new Date(o.fecha))} · <b>${money(o.total)}</b></span></div>
        <div class="pics">${o.items.map(i => { const p = byId(i.id); return p ? `<a href="#/producto/${p.id}"><img src="${p.img}" alt="${esc(p.nombre)}, ${plural(i.qty, "unidad", "unidades")}"></a>` : ""; }).join("")}</div>
        <p class="hint">${plural(o.items.reduce((n, i) => n + i.qty, 0), "producto")} · pagas al retirar · ${esc(o.retiro || STORE.local.nombre)}</p>
      </li>`).join("")}</ul>`
        : `<div class="empty"><h2>Todavía no tienes pedidos</h2><p>Cuando reserves, tus pedidos aparecerán aquí.</p><a class="btn btn--cafe" href="#/catalogo">Ver catálogo</a></div>`}
    </div>`, "Mis pedidos");
  }

  /* ---------- Información ---------- */
  const INFO = {
    ayuda: ["Ayuda", `<h2>Preguntas frecuentes</h2>
      <dl class="faq">
        <dt>¿Cómo compro?</dt><dd>Elige una gorra, presiona «Agregar al carrito», abre el carrito y presiona «Reservar pedido». Puedes hacerlo con cuenta o como invitado. Luego retiras y pagas en el local.</dd>
        <dt>¿Qué talla es?</dt><dd>Todas son talla única con ajuste atrás, salvo las marcadas como «Niño».</dd>
        <dt>¿Puedo cambiar mi pedido?</dt><dd>Antes de confirmar, sí: vuelve al carrito y cambia las cantidades. Después, escríbenos a hola@nqcrown.com.</dd>
        <dt>¿Hacen envíos?</dt><dd>No. Todas las compras se retiran y se pagan en el local.</dd>
        <dt>¿Se guarda mi carrito?</dt><dd>Sí, en este navegador. Si cierras la página, tu carrito y tus favoritas siguen ahí.</dd>
      </dl>`],
    retiro: ["Retiro en el local", `<p>No hacemos envíos. Reservas en línea y retiras en <b>${esc(localTexto())}</b>.</p>
      <ul><li><b>Horario:</b> ${esc(STORE.local.horario)}.</li><li>Te avisamos por correo cuando tu pedido está listo.</li><li>Al retirar, das tu número de pedido y tu nombre, y pagas ahí.</li><li><b>Si no te acercas en máximo 3 días después de tu reservación, se cancelará.</b></li></ul>`],
    devoluciones: ["Devoluciones", "<p>Tienes 15 días desde que retiras tu pedido para devolverlo en el local. La gorra debe estar sin usar y con sus etiquetas.</p>"],
    contacto: ["Contacto", "<p>Correo: <b>hola@nqcrown.com</b></p><p>Horario: lunes a sábado, de 9:00 a 18:00.</p>"],
    accesibilidad: ["Accesibilidad", `<p>Queremos que todas las personas puedan comprar en NQ Crown.</p>
      <h2>Usar la tienda con teclado</h2>
      <ul>
        <li><kbd>Tab</kbd> y <kbd>Shift</kbd> + <kbd>Tab</kbd>: moverse entre enlaces, botones y campos. El elemento activo se marca con un borde morado.</li>
        <li><kbd>Enter</kbd> o <kbd>Espacio</kbd>: activar un botón.</li>
        <li><kbd>/</kbd>: ir directo al buscador. <kbd>Esc</kbd>: borrar la búsqueda.</li>
        <li>Primer <kbd>Tab</kbd> de cada página: «Saltar al contenido principal».</li>
        <li>En «Ingresar / Crear cuenta», las flechas <kbd>←</kbd> <kbd>→</kbd> cambian de pestaña.</li>
      </ul>
      <h2>Lectores de pantalla</h2>
      <ul>
        <li>Cada foto tiene una descripción de la gorra.</li>
        <li>Los botones de solo ícono (corazón, carrito, mostrar contraseña) tienen nombre.</li>
        <li>Los avisos (agregado al carrito, errores, total nuevo) se leen en voz alta automáticamente.</li>
      </ul>`]
  };
  function viewInfo(r) {
    const i = INFO[r.arg];
    if (!i) return viewNotFound();
    mount(`<div class="wrap">${crumbs([["Catálogo", "#/catalogo"], [i[0]]])}<article class="prose"><h1>${i[0]}</h1>${i[1]}</article></div>`, i[0]);
  }

  function viewNotFound() {
    mount(`<div class="wrap section"><div class="empty"><h1>No encontramos esta página</h1><p>Puede que el enlace esté mal escrito o que el pedido ya no exista.</p><a class="btn btn--cafe" href="#/catalogo">Ir al catálogo</a></div></div>`, "No encontrada");
  }

  /* ---------- Eventos globales ---------- */
  document.addEventListener("click", e => {
    const a = e.target.closest("[data-action]");
    if (!a) return;
    const id = a.dataset.id;
    switch (a.dataset.action) {
      case "skip": (($("h1", app)) || app).focus(); break;
      case "add": addToCart(Number(id), 1, a); break;
      case "fav": {
        const on = toggleFav(id), p = byId(id);
        $$(`.fav[data-id="${id}"]`).forEach(b => { b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); b.setAttribute("aria-label", favLabel(p, on)); b.title = on ? "Quitar de favoritas" : "Guardar en favoritas"; });
        const r = parseHash();
        if (r.name === "catalogo" && r.q.get("f") === "fav") render();
        break;
      }
      case "filter": setCatalogQuery({ f: a.dataset.f, p: 1 }); break;
      case "unfacet": {
        const vals = listParam(parseHash().q, a.dataset.facet).filter(v => v !== a.dataset.value);
        setCatalogQuery({ [a.dataset.facet]: vals.join("|"), p: 1 }, true);
        ($(".pill") || $("#results"))?.focus?.();
        break;
      }
      case "clearfacets": {
        const ch = { p: 1, pr: "" }; FACETS.forEach(fc => { ch[fc.key] = ""; });
        setCatalogQuery(ch, true); $("#catTitle")?.focus();
        toast("Quitaste todos los filtros");
        break;
      }
      case "togglefilters": {
        const panel = $("#filtros"), open = !panel.classList.contains("is-open");
        panel.classList.toggle("is-open", open); a.setAttribute("aria-expanded", open); save("filtrosAbiertos", open);
        if (open) $("input:not(:disabled)", panel)?.focus();
        break;
      }
      case "page": setCatalogQuery({ p: Number(a.dataset.p) }); break;
      case "scroll": $("#catalogo-lista").scrollIntoView(); $("#catTitle").focus({ preventScroll: true }); break;
      case "qty": setQty(id, (state.cart[id] || 0) + Number(a.dataset.d)); viewCart(); announce(`${byId(id).nombre}: ${plural(state.cart[id], "unidad", "unidades")}. Total ${money(totals().total)}`); break;
      case "remove": removeItem(id); break;
      case "pay": go(state.user || state.guest ? "#/checkout" : "#/ingresar?next=checkout"); break;
      case "reveal": {
        const input = $("#" + a.dataset.for), show = input.type === "password";
        input.type = show ? "text" : "password";
        a.setAttribute("aria-pressed", show); a.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña"); a.title = a.getAttribute("aria-label");
        break;
      }
      case "focusField": e.preventDefault(); $("#" + a.dataset.target)?.focus(); break;
      default: app.onclickDetail && app.onclickDetail(a);
    }
  });

  $("#searchForm").addEventListener("submit", e => { e.preventDefault(); setCatalogQuery({ q: $("#searchInput").value.trim(), f: "all", p: 1 }); });
  $("#searchInput").addEventListener("input", e => {
    if (parseHash().name === "catalogo") setCatalogQuery({ q: e.target.value.trim(), p: 1 }, true);
  });
  // Atajos: «/» enfoca el buscador; «Esc» lo borra (flexibilidad y eficiencia de uso).
  document.addEventListener("keydown", e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (e.key === "/" && !typing && !document.body.classList.contains("is-welcome")) { e.preventDefault(); $("#searchInput").focus(); }
    if (e.key === "Escape" && document.activeElement === $("#searchInput") && e.target.value) {
      e.target.value = ""; if (parseHash().name === "catalogo") setCatalogQuery({ q: "" }, true);
    }
  });

  window.addEventListener("hashchange", () => { app.onclickDetail = null; render(); });
  // Mantener el carrito al día entre pestañas
  window.addEventListener("storage", e => { if (e.key?.startsWith("nqc_")) { Object.keys(state).forEach(k => state[k] = load(k, state[k])); render(); } });

  render();
})();
