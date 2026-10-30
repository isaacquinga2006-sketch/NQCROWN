/* NQ Crown · tienda de una sola página con rutas por hash (#/catalogo, #/producto/3 …).
   Catálogo, cuentas, favoritos, carrito, reservas y reseñas viven en Supabase (js/db.js).
   Sin sesión se puede mirar y llenar el carrito (queda en el navegador); para reservar hay que ingresar.
   No hay pagos en línea. */
(() => {
  "use strict";

  const DB = window.DB;
  let PRODUCTS = window.PRODUCTS; // se reemplaza por el catálogo de la base al iniciar
  let TIPOS = [], TALLAS = {};    // guía de modelos y tablas de tallas (de la base)
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
  const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

  // Sin sesión el carrito queda en el navegador; con sesión, carrito y favoritas vienen de la base.
  const state = {
    cart: load("cart", {}),          // { "idProducto" o "idProducto|talla": cantidad }
    favs: [],                        // [idProducto], solo con sesión
    avisos: [],                      // [idProducto] agotadas con «Avísame cuando vuelva»
    user: null,                      // { id, nombre, apellido, email, telefono }
    coupon: (c => c && c.pct ? c : null)(load("coupon", null)), // { code, pct } validado en la base
    lastOrder: load("lastOrder", null), // última reserva (para la pantalla de confirmación)
    ratings: {}                      // { idProducto: { promedio, total } }
  };
  const persist = () => {
    save("cart", state.user ? {} : state.cart);
    save("coupon", state.coupon); save("lastOrder", state.lastOrder);
  };
  // Cualquier error de la base se muestra en un aviso (nunca falla en silencio)
  const dbError = (e, msg = "No pudimos guardar el cambio. Revisa tu conexión e intenta de nuevo.") => { console.error(e); toast(msg, null, "error"); };

  const cartItems = () => Object.entries(state.cart)
    .map(([key, qty]) => { const [id, talla] = DB.splitKey(key); return { key, p: byId(id), talla, qty }; })
    .filter(i => i.p && i.qty > 0);
  const inCartOf = id => cartItems().filter(i => i.p.id === id).reduce((n, i) => n + i.qty, 0);
  const tallaTexto = t => t ? ` · talla ${t}` : "";
  // Todas las fotos de la gorra (las del catálogo de respaldo solo tienen una)
  const fotos = p => p.imgs?.length ? p.imgs : [{ url: p.img, alt: p.alt }];
  const cartCount = () => cartItems().reduce((n, i) => n + i.qty, 0);

  function totals() {
    const subtotal = cartItems().reduce((s, i) => s + i.p.precio * i.qty, 0);
    const rate = state.coupon ? state.coupon.pct / 100 : 0;
    const descuento = +(subtotal * rate).toFixed(2);
    return { subtotal, descuento, total: +(subtotal - descuento).toFixed(2) };
  }
  const localTexto = () => [STORE.local.nombre, STORE.local.direccion].filter(Boolean).join(" · ");
  const limiteTexto = iso => fmtDate(new Date(iso + "T12:00:00")); // «viernes, 30 de octubre»

  // Datos de la cuenta: perfil, favoritas y carrito. El carrito armado sin sesión se suma al de la cuenta.
  async function loadUser(session) {
    if (!session) { state.user = null; state.favs = []; state.avisos = []; return; }
    const u = session.user;
    const [perfil, favs, cart, avisos] = await Promise.all([DB.perfil(u.id), DB.favoritos(), DB.carrito(), DB.misAvisos()]);
    state.user = { id: u.id, email: u.email, nombre: perfil?.nombre || u.email.split("@")[0], apellido: perfil?.apellido || "", telefono: perfil?.telefono || "" };
    state.favs = favs;
    state.avisos = avisos;
    const local = load("cart", {});
    Object.entries(local).forEach(([id, q]) => { cart[id] = Math.min(10, (cart[id] || 0) + q); });
    if (Object.keys(local).length) await DB.guardarCarrito(u.id, cart);
    state.cart = cart;
    persist();
  }

  /* ---------- Respuesta del sistema (microinteracciones) ---------- */
  // Aviso abajo a la derecha (abajo a lo ancho en el celular), sin tapar la página. El color y el ícono
  // cambian según el tipo: «ok» (verde, se hizo), «info» (café, dato o algo que falta) y «error» (rojo).
  // Si es de una gorra muestra su foto, un título corto y el detalle. Dura 3 s (la barra de abajo
  // muestra el tiempo), se pausa con el mouse o el foco y se cierra con «Esc» o con ✕.
  let toastTimer, toastAction = null, toastMs = 3000;
  const TOAST_ICON = { ok: "check", info: "alert", error: "alert" };
  function toast(msg, action, type = "ok", extra = {}) { // extra: { detalle, img }
    const t = $("#toast");
    t.className = `toast toast--${type}`;
    t.setAttribute("role", type === "error" ? "alert" : "status");
    $("#toastIcon").innerHTML = extra.img ? `<img src="${extra.img}" alt="">` : ICON[TOAST_ICON[type]];
    $("#toastIcon").classList.toggle("toast__icon--img", !!extra.img);
    $("#toastMsg").textContent = msg;
    $("#toastDetail").textContent = extra.detalle || "";
    $("#toastDetail").hidden = !extra.detalle;
    toastAction = action || null;
    $("#toastActions").innerHTML = (action ? `<button type="button" class="toast__btn" data-toast="run">${esc(action.label)}</button>` : "")
      + `<button type="button" class="toast__close" data-toast="close" aria-label="Cerrar aviso" title="Cerrar aviso">✕</button>`;
    void t.offsetWidth; // reinicia la animación si ya estaba visible
    t.classList.add("show");
    restartToast();
  }
  // Aviso de una gorra: foto + título + «nombre · talla · precio»
  const toastGorra = (titulo, p, talla, action, type = "ok") =>
    toast(titulo, action, type, { img: p.img, detalle: `${p.nombre}${tallaTexto(talla)} · ${money(p.precio)}` });
  function hideToast() {
    clearTimeout(toastTimer);
    const t = $("#toast");
    if (t.contains(document.activeElement)) app.focus({ preventScroll: true });
    t.classList.remove("show");
    $("#toastActions").innerHTML = ""; // sin botones vacíos ni ocultos en el aviso cerrado
  }
  // La barra de tiempo vuelve a empezar con el reloj y se congela mientras está en pausa
  function restartToast() {
    clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, toastMs);
    const t = $("#toast"); t.classList.remove("is-paused", "is-timing"); void t.offsetWidth; t.classList.add("is-timing");
  }
  const pauseToast = () => { clearTimeout(toastTimer); $("#toast").classList.add("is-paused"); };
  $("#toast").addEventListener("mouseenter", pauseToast);
  $("#toast").addEventListener("mouseleave", () => { if (!$("#toast").contains(document.activeElement)) restartToast(); });
  $("#toast").addEventListener("focusin", pauseToast);
  $("#toast").addEventListener("focusout", e => { if (!$("#toast").contains(e.relatedTarget) && $("#toast").classList.contains("show")) restartToast(); });
  $("#toast").addEventListener("click", e => {
    const b = e.target.closest("[data-toast]");
    if (!b) return;
    const a = toastAction; hideToast();
    if (b.dataset.toast === "run" && a) a.run();
  });
  // Anuncio solo para lectores de pantalla (cambios que no tienen aviso visible).
  const announce = msg => { const r = $("#srLive"); r.textContent = ""; setTimeout(() => { r.textContent = msg; }, 60); };

  function addToCart(id, qty = 1, btn, talla = "") {
    const p = byId(id), key = DB.cartKey(id, talla);
    const before = state.cart[key] || 0;
    state.cart[key] = Math.min(10, before + qty);
    persist(); updateHeader(); syncItem(key);
    const bump = () => { const b = $("#cartBtn"); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); };
    flyToCart(btn && (btn.closest(".card")?.querySelector(".card__img img") || $(".gallery__main img")), bump);
    if (btn) { // el botón confirma la acción por un momento
      const old = btn.innerHTML;
      btn.classList.add("is-done"); btn.innerHTML = `${ICON.check} Agregada`;
      setTimeout(() => { if (btn.isConnected) { btn.classList.remove("is-done"); btn.innerHTML = old; } }, 1400);
    }
    const ver = { label: "Ver carrito", run: () => go("#/carrito") };
    if (before + qty > 10) toastGorra("Máximo 10 unidades por gorra", p, talla, ver, "info");
    else toastGorra(`Agregada al carrito · ${plural(cartCount(), "producto")}`, p, talla, ver);
  }
  // Una copia de la foto viaja hasta el carrito; sin foto o con «reducir movimiento» solo salta el carrito
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  function flyToCart(img, done) {
    const cart = $("#cartBtn");
    if (!img || reduceMotion.matches || !img.animate) return done();
    const from = img.getBoundingClientRect(), to = cart.getBoundingClientRect();
    const fly = img.cloneNode(); fly.className = "fly"; fly.alt = ""; fly.setAttribute("aria-hidden", "true");
    const size = Math.min(from.width, 120);
    Object.assign(fly.style, { left: `${from.left + (from.width - size) / 2}px`, top: `${from.top + (from.height - size) / 2}px`, width: `${size}px`, height: `${size}px` });
    document.body.append(fly);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
    fly.animate([
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * .5}px, ${dy * .5 - 60}px) scale(.6)`, opacity: .9, offset: .5 },
      { transform: `translate(${dx}px, ${dy}px) scale(.15)`, opacity: .4 }
    ], { duration: 550, easing: "ease-in" }).finished.then(() => { fly.remove(); done(); });
  }
  // key = línea del carrito («12» o «12|7 1/4»)
  function setQty(key, qty) {
    if (qty <= 0) delete state.cart[key]; else state.cart[key] = Math.min(10, qty);
    persist(); updateHeader(); syncItem(key);
  }
  // Con sesión, cada cambio del carrito se guarda en la base
  const syncItem = key => state.user && DB.guardarItem(state.user.id, key, state.cart[key] || 0).catch(e => dbError(e));
  const lineName = key => { const [id, talla] = DB.splitKey(key); return byId(id).nombre + tallaTexto(talla); };
  function removeItem(key) {
    const name = lineName(key), qty = state.cart[key], [id, talla] = DB.splitKey(key);
    setQty(key, 0); viewCart();
    toastGorra("Quitada del carrito", byId(id), talla, { label: "Deshacer", run: () => { setQty(key, qty); viewCart(); announce(`${name} volvió al carrito`); } }, "info");
  }
  // Avísame cuando vuelva: con sesión se guarda en la base y llega un correo cuando hay stock
  async function toggleAviso(id, btn) {
    id = Number(id);
    const p = byId(id);
    if (!state.user) {
      toast("Ingresa a tu cuenta para que te avisemos por correo", { label: "Ingresar", run: () => go("#/ingresar?next=" + encodeURIComponent(location.hash.replace(/^#\/?/, "") || "catalogo")) }, "info");
      return;
    }
    const on = !state.avisos.includes(id);
    btn.disabled = true;
    try {
      if (on) await DB.pedirAviso(id, state.user.email); else await DB.quitarAviso(state.user.id, id);
      state.avisos = on ? [...state.avisos, id] : state.avisos.filter(a => a !== id);
      $$(`[data-action="notify"][data-id="${id}"]`).forEach(b => { b.outerHTML = notifyBtn(p, b.classList.contains("btn--block")); });
      toast(on ? "Te avisaremos cuando vuelva" : "Quitaste el aviso", null, on ? "ok" : "info", { img: p.img, detalle: on ? `${p.nombre} · correo a ${state.user.email}` : p.nombre });
    } catch (e) { btn.disabled = false; dbError(e, "No pudimos guardar tu aviso. Intenta de nuevo."); }
  }
  const notifyBtn = (p, block = true) => {
    const on = state.avisos.includes(p.id);
    return `<button type="button" class="btn ${on ? "btn--borde" : "btn--beige"} ${block ? "btn--block" : ""}" data-action="notify" data-id="${p.id}">${on ? `${ICON.check} Te avisaremos<span class="sr-only">. Presiona para quitar el aviso de ${esc(p.nombre)}</span>` : `Avísame cuando vuelva<span class="sr-only">: ${esc(p.nombre)}</span>`}</button>`;
  };
  // Las favoritas se guardan en la cuenta: sin sesión se pide ingresar (no se pierden en otro dispositivo).
  function toggleFav(id) {
    id = Number(id);
    if (!state.user) {
      toast("Ingresa a tu cuenta para guardar favoritas", { label: "Ingresar", run: () => go("#/ingresar?next=" + encodeURIComponent(location.hash.replace(/^#\/?/, "") || "catalogo")) }, "info");
      return null;
    }
    const on = !state.favs.includes(id);
    state.favs = on ? [...state.favs, id] : state.favs.filter(f => f !== id);
    toastGorra(on ? "Guardada en tus favoritas" : "Quitada de tus favoritas", byId(id), "", null, on ? "ok" : "info");
    DB.marcarFavorito(state.user.id, id, on).catch(e => {
      state.favs = on ? state.favs.filter(f => f !== id) : [...state.favs, id];
      paintFav(id, !on);
      dbError(e, "No pudimos guardar tu favorita. Intenta de nuevo.");
    });
    return on;
  }
  function paintFav(id, on) {
    const p = byId(id);
    $$(`.fav[data-id="${id}"]`).forEach(b => { b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); b.setAttribute("aria-label", favLabel(p, on)); b.title = on ? "Quitar de favoritas" : "Guardar en favoritas"; });
  }
  const favLabel = (p, on) => on ? `Quitar ${p.nombre} de favoritas` : `Guardar ${p.nombre} en favoritas${state.user ? "" : " (necesitas ingresar)"}`;

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
    "nueva-clave": viewNewPassword,
    guia: viewGuide,
    perfil: viewProfile,
    salir: async () => {
      try { await DB.salir(); } catch (e) { return dbError(e, "No pudimos cerrar tu sesión. Intenta de nuevo."); }
      state.user = null; state.favs = []; state.cart = {}; persist();
      toast("Cerraste sesión", null, "info"); go("#/catalogo");
    }
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
    // Con sesión: botón con el nombre que abre el menú (Mis datos, Mis pedidos, Mis favoritas, Cerrar sesión)
    $("#accountLink").hidden = !!state.user;
    $("#accountBtn").hidden = !state.user;
    if (state.user) {
      $("#accountName").textContent = "Hola, " + state.user.nombre.split(" ")[0];
      $("#accountAvatar").textContent = (state.user.nombre[0] || "?").toUpperCase();
    } else closeAccountMenu();
    const navKey = r.name === "catalogo" && r.q.get("f") === "fav" ? "favoritos" : r.name;
    $$(".mainnav a").forEach(a => {
      const on = a.dataset.nav === navKey;
      a.classList.toggle("on", on);
      on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
    });
    const s = $("#searchInput");
    if (document.activeElement !== s) s.value = r.name === "catalogo" ? (r.q.get("q") || "") : "";
  }

  // Menú de la cuenta (patrón «disclosure»: botón con aria-expanded + lista de enlaces)
  function openAccountMenu() {
    $("#accountMenu").hidden = false; $("#accountBtn").setAttribute("aria-expanded", "true");
    $("#accountMenu a").focus();
  }
  function closeAccountMenu(returnFocus = false) {
    if ($("#accountMenu").hidden) return;
    $("#accountMenu").hidden = true; $("#accountBtn").setAttribute("aria-expanded", "false");
    if (returnFocus) $("#accountBtn").focus();
  }
  $("#accountBtn").addEventListener("click", () => $("#accountMenu").hidden ? openAccountMenu() : closeAccountMenu());
  $("#account").addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("#accountMenu").hidden) { e.stopPropagation(); closeAccountMenu(true); }
    if (["ArrowDown", "ArrowUp"].includes(e.key) && !$("#accountMenu").hidden) { // flechas para moverse por el menú
      e.preventDefault();
      const links = $$("#accountMenu a"), i = links.indexOf(document.activeElement);
      links[(i + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length].focus();
    }
  });
  $("#account").addEventListener("focusout", e => { if (e.relatedTarget && !$("#account").contains(e.relatedTarget)) closeAccountMenu(); });
  document.addEventListener("click", e => { if (!e.target.closest("#account")) closeAccountMenu(); });

  // Pinta la pantalla, cambia el título de la pestaña y lleva el foco al título (lectores de pantalla).
  let lastPage = "";
  function mount(html, title) {
    app.innerHTML = html;
    // Entrada suave solo al cambiar de pantalla (no al filtrar o paginar); tarjetas en cascada
    const page = location.hash.split("?")[0];
    if (page !== lastPage) { lastPage = page; app.classList.remove("page-in"); void app.offsetWidth; app.classList.add("page-in"); }
    $$(".card", app).forEach((c, i) => c.style.setProperty("--i", Math.min(i, 12)));
    document.title = title ? `${title} · NQ Crown` : "NQ Crown · Gorras con carácter";
    if (document.activeElement === $("#searchInput")) return; // escribiendo en el buscador
    window.scrollTo(0, 0);
    const h1 = $("h1", app);
    if (h1) { h1.setAttribute("tabindex", "-1"); h1.focus({ preventScroll: true }); }
    else app.focus({ preventScroll: true });
  }

  /* ---------- Piezas reutilizables ---------- */
  const pctOff = p => Math.round((1 - p.precio / p.antes) * 100);
  const priceHTML = p => p.antes
    ? `<span class="price"><span class="sr-only">Precio de oferta </span>${money(p.precio)} <del><span class="sr-only">antes </span>${money(p.antes)}</del> <span class="save">Ahorras ${money(p.antes - p.precio)}</span></span>`
    : `<span class="price">${money(p.precio)}</span>`;

  function cardHTML(p, headingLevel = 3) {
    const fav = state.favs.includes(p.id);
    const tag = !p.stock ? '<span class="tag tag--agotada">Agotada</span>' : p.antes ? `<span class="tag tag--oferta"><span class="sr-only">Oferta: </span>−${pctOff(p)} %</span>` : p.nuevo ? '<span class="tag">Nueva</span>' : "";
    const otra = fotos(p)[1]; // al pasar el mouse se ve otro ángulo
    const action = !p.stock ? notifyBtn(p)
      : p.talla ? `<a class="btn btn--cafe btn--block" href="#/producto/${p.id}" aria-label="Elegir talla de ${esc(p.nombre)}">Elegir talla</a>`
      : `<button type="button" class="btn btn--cafe btn--block" data-action="add" data-id="${p.id}" aria-label="Agregar ${esc(p.nombre)} al carrito">Agregar al carrito</button>`;
    return `<article class="card ${p.stock ? "" : "card--agotada"}" aria-labelledby="c${p.id}-${headingLevel}">
      <div class="card__img ${otra ? "card__img--swap" : ""}">
        <a href="#/producto/${p.id}" tabindex="-1"><img src="${p.img}" alt="${esc(p.alt)}" loading="lazy">${otra ? `<img class="card__img2" src="${otra.url}" alt="" loading="lazy">` : ""}</a>
        ${tag}
        ${p.logo ? `<img class="card__team" src="${p.logo}" alt="" title="${esc(p.equipo)}" loading="lazy">` : ""}
        <button type="button" class="fav ${fav ? "on" : ""}" data-action="fav" data-id="${p.id}" aria-pressed="${fav}" aria-label="${esc(favLabel(p, fav))}" title="${fav ? "Quitar de favoritas" : "Guardar en favoritas"}">${ICON.heart}</button>
      </div>
      <div class="card__body">
        <h${headingLevel} class="card__title" id="c${p.id}-${headingLevel}"><a class="card__name" href="#/producto/${p.id}">${esc(p.nombre)}</a></h${headingLevel}>
        <span class="card__meta">${esc(p.tipo)} · ${esc(p.color)}</span>
        ${cardRating(p.id)}
        ${priceHTML(p)}
        ${action}
      </div>
    </article>`;
  }

  // Calificación corta en la tarjeta (solo si la gorra tiene reseñas)
  function cardRating(id) {
    const r = state.ratings[id];
    if (!r || !r.total) return "";
    return `<span class="card__rating"><span aria-hidden="true">★</span> ${r.promedio.toFixed(1)}<span class="sr-only"> de 5 estrellas,</span> (${plural(r.total, "reseña")})</span>`;
  }

  function summaryRows(t) {
    return `<dl class="sum">
      <div class="row"><dt>Subtotal</dt><dd>${money(t.subtotal)}</dd></div>
      ${t.descuento ? `<div class="row row--desc"><dt>Descuento (${esc(state.coupon.code)}, ${state.coupon.pct} %)</dt><dd>−${money(t.descuento)}</dd></div>` : ""}
      <div class="row row--total"><dt>Total a pagar en el local</dt><dd>${money(t.total)}</dd></div>
    </dl>`;
  }
  // Ilustración de las pantallas vacías: la gorra de NQ Crown con un ícono según el caso
  const ART_ICON = {
    cart: '<path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2"/><circle cx="9.5" cy="20" r="1.3"/><circle cx="17.5" cy="20" r="1.3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    bag: '<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
    question: '<path d="M9 9a3 3 0 1 1 4 2.8c-.7.3-1 .9-1 1.7V15M12 18.5v.01"/>',
    alert: '<path d="M12 7.5v6M12 17v.01"/><circle cx="12" cy="12" r="9"/>'
  };
  const emptyArt = icon => `<svg class="empty__art" viewBox="0 0 200 140" aria-hidden="true" focusable="false">
    <ellipse cx="104" cy="126" rx="74" ry="8" fill="#E6DBC8"/>
    <path d="M40 94C40 52 68 28 102 28s62 24 62 66z" fill="#4A2E20"/>
    <path d="M102 28c-8 20-10 42-8 66M102 28c14 18 22 40 24 66" fill="none" stroke="#6b4a37" stroke-width="2"/>
    <path d="M84 70l8 7 10-12 10 12 8-7-3 16H87z" fill="#B59F7E"/>
    <circle cx="102" cy="28" r="5" fill="#B59F7E"/>
    <rect x="38" y="88" width="128" height="9" rx="4.5" fill="#2e1b12"/>
    <path d="M40 96c40 2 100 6 150 18-10 10-60 10-120-2-18-4-30-9-30-16z" fill="#6b4a37"/>
    <circle cx="164" cy="34" r="24" fill="#fff" stroke="#6B3FA0" stroke-width="3"/>
    <g transform="translate(152 22)" fill="none" stroke="#6B3FA0" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ART_ICON[icon]}</g>
  </svg>`;
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
  // Muestra del color real junto al nombre (camuflado y multicolor con mezcla de tonos)
  const SWATCH_MIX = { Camuflado: "conic-gradient(#5B6B47 0 25%, #8a7a52 0 50%, #3b3a2a 0 75%, #6f8a5a 0)", Multicolor: "conic-gradient(#b22234 0 25%, #1f4fa3 0 50%, #e0701f 0 75%, #3e6b48 0)" };
  const swatch = color => { const hex = PRODUCTS.find(p => p.color === color)?.hex; return hex ? `<span class="swatch" style="background:${SWATCH_MIX[color] || hex}" aria-hidden="true"></span>` : ""; };
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
    const group = (key, title, options) => `<fieldset class="facet ${key === "c" ? "facet--colors" : ""}"><legend>${title}</legend>${options.map(([value, label, count]) => {
      const id = `fl${n++}`, on = sel[key].includes(value);
      return `<label class="facet__opt ${count || on ? "" : "is-empty"}" for="${id}"><input type="checkbox" id="${id}" data-facet="${key}" value="${esc(value)}" ${on ? "checked" : ""} ${count || on ? "" : "disabled"}>${key === "c" ? swatch(value) : ""}<span>${esc(label)}</span><span class="sm" aria-label="${plural(count, "gorra")}">${count}</span></label>`;
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
    } else if (f === "fav" && !state.user) {
      body = `<div class="empty">${emptyArt("heart")}<h3>Ingresa para ver tus favoritas</h3><p>Tus favoritas se guardan en tu cuenta, así las ves en cualquier dispositivo.</p><a class="btn btn--cafe" href="#/ingresar?next=${encodeURIComponent("catalogo?f=fav")}">Ingresar</a></div>`;
    } else if (f === "fav" && !term && !nSel) {
      body = `<div class="empty">${emptyArt("heart")}<h3>Aún no tienes favoritas</h3><p>Toca el corazón ${ICON.heart} de una gorra para guardarla aquí.</p><button type="button" class="btn btn--cafe" data-action="filter" data-f="all">Ver todas las gorras</button></div>`;
    } else {
      body = `<div class="empty">${emptyArt("search")}<h3>No encontramos gorras${term ? ` para «${esc(term)}»` : ""} con esos filtros</h3><p>Prueba con otra palabra, un equipo (por ejemplo «Yankees») o quita algún filtro.</p>${nSel ? `<button type="button" class="btn btn--cafe" data-action="clearfacets">Quitar filtros</button>` : `<a class="btn btn--cafe" href="#/catalogo">Ver todo el catálogo</a>`}</div>`;
    }

    const openPanel = load("filtrosAbiertos", false);
    const showHero = f === "all" && !term && page === 1 && !nSel;
    mount(`
      ${showHero ? heroHTML() + coleccionesHTML() : ""}
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
            <p class="hint filters__hint">Marca una opción con <kbd>Enter</kbd> o <kbd>Espacio</kbd>.</p>
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
    // Enter también marca la casilla (por defecto solo la barra espaciadora lo hace)
    $("#filtros").addEventListener("keydown", e => {
      if (e.key === "Enter" && e.target.matches('input[type="checkbox"]')) { e.preventDefault(); e.target.click(); }
    });
  }

  /* ---------- Portada del catálogo ---------- */
  // Gorras destacadas, accesos rápidos a Nuevas / En oferta / equipos y cómo funciona la compra.
  function heroHTML() {
    const picks = [...PRODUCTS.filter(p => p.nuevo), ...PRODUCTS.filter(p => !p.nuevo && p.antes)].slice(0, 3);
    const teams = Object.entries(PRODUCTS.reduce((m, p) => { if (p.equipo !== "Sin equipo") m[p.equipo] = (m[p.equipo] || 0) + 1; return m; }, {}))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es")).slice(0, 4);
    const nNuevas = PRODUCTS.filter(p => p.nuevo).length, nOferta = PRODUCTS.filter(p => p.antes).length;
    return `<section class="hero" aria-labelledby="heroTitle"><div class="wrap hero__in">
      <div class="hero__text">
        <p class="hero__eyebrow">Gorras originales · Retiro en el local</p>
        <h1 id="heroTitle">Corona para cada estilo</h1>
        <p class="hero__lead">Gorras, viseras y buckets de tus equipos favoritos. Reserva en línea en un minuto, retira y paga en el local.</p>
        <div class="hero__ctas">
          <button type="button" class="btn btn--negro btn--lg" data-action="scroll">Ver catálogo</button>
          <a class="btn btn--borde btn--lg" href="#/catalogo?f=oferta">Ver ofertas (${nOferta})</a>
        </div>
        <ul class="hero__steps" aria-label="Cómo comprar">
          <li><span class="hero__num" aria-hidden="true">1</span><span><strong>Reserva en línea</strong><span class="sm">con tu cuenta o con Google</span></span></li>
          <li><span class="hero__num" aria-hidden="true">2</span><span><strong>Retira en el local</strong><span class="sm">en máximo 3 días</span></span></li>
          <li><span class="hero__num" aria-hidden="true">3</span><span><strong>Paga al retirar</strong><span class="sm">sin pagos en línea</span></span></li>
        </ul>
      </div>
      <ul class="hero__picks" aria-label="Gorras destacadas">${picks.map((p, i) => `<li class="hero__pick hero__pick--${i}">
        <a href="#/producto/${p.id}"><img src="${p.img}" alt="${esc(p.alt)}"><span class="hero__pickname">${esc(p.nombre)}<span class="sm">${money(p.precio)}${p.nuevo ? " · Nueva" : " · Oferta"}</span></span></a>
      </li>`).join("")}</ul>
    </div>
    <div class="wrap hero__quick">
      <h2 class="hero__quicktitle">Explora rápido</h2>
      <ul class="hero__chips">
        <li><a class="qchip qchip--nueva" href="#/catalogo?f=nuevo">Nuevas <span class="sm">(${nNuevas})</span></a></li>
        <li><a class="qchip qchip--oferta" href="#/catalogo?f=oferta">En oferta <span class="sm">(${nOferta})</span></a></li>
        ${teams.map(([t, c]) => `<li><a class="qchip" href="#/catalogo?e=${encodeURIComponent(t)}">${esc(t)} <span class="sm">(${c})</span></a></li>`).join("")}
      </ul>
    </div></section>`;
  }

  /* ---------- Menús desplegables: equipos por liga y modelos ---------- */
  const LIGAS = ["MLB", "NBA", "NFL", "Fútbol", "Fórmula 1", "Rugby", "Otra"];
  const LIGA_NOMBRE = { MLB: "MLB · Béisbol", NBA: "NBA · Básquet", NFL: "NFL · Fútbol americano", Otra: "Otros equipos" };
  const initials = s => s.split(/\s+/).map(w => w[0]).join("").slice(0, 3).toUpperCase();
  const teamLogo = (logo, name) => logo
    ? `<img class="tlogo" src="${logo}" alt="" width="28" height="28" loading="lazy">`
    : `<span class="tlogo tlogo--txt" aria-hidden="true">${esc(initials(name))}</span>`;

  function buildMega() {
    const equipos = {};
    PRODUCTS.forEach(p => {
      if (p.equipo === "Sin equipo") return;
      const e = equipos[p.equipo] ||= { nombre: p.equipo, liga: p.liga || "Otra", logo: p.logo, n: 0 };
      e.n++;
    });
    const porLiga = LIGAS.map(l => [l, Object.values(equipos).filter(e => e.liga === l).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))]).filter(([, t]) => t.length);
    $("#megaEquipos").innerHTML = `<div class="wrap mega__in">
      <h2 class="sr-only">Equipos por liga</h2>
      <div class="mega__cols">${porLiga.map(([liga, teams]) => `<section class="mega__col" aria-labelledby="liga-${initials(liga)}">
        <h3 id="liga-${initials(liga)}">${esc(LIGA_NOMBRE[liga] || liga)}</h3>
        <ul>${teams.map(t => `<li><a href="#/catalogo?e=${encodeURIComponent(t.nombre)}">${teamLogo(t.logo, t.nombre)}<span>${esc(t.nombre)}</span><span class="sm" aria-label="${plural(t.n, "gorra")}">${t.n}</span></a></li>`).join("")}</ul>
      </section>`).join("")}</div></div>`;
    const tipos = TIPOS.length ? TIPOS : [...new Set(PRODUCTS.map(p => p.tipo))].map(nombre => ({ nombre, descripcion: "" }));
    $("#megaModelos").innerHTML = `<div class="wrap mega__in">
      <h2 class="sr-only">Modelos de gorra</h2>
      <ul class="mega__models">${tipos.map(t => { const n = PRODUCTS.filter(p => p.tipo === t.nombre).length; return n ? `<li><a href="#/catalogo?t=${encodeURIComponent(t.nombre)}"><strong>${esc(t.nombre)} <span class="sm">(${n})</span></strong>${t.descripcion ? `<span class="sm">${esc(t.descripcion)}</span>` : ""}</a></li>` : ""; }).join("")}
        <li class="mega__guide"><a href="#/guia"><strong>Guía de modelos y tallas →</strong><span class="sm">Diferencias entre modelos y cómo medir tu cabeza</span></a></li>
      </ul></div>`;
  }
  function closeMega(returnFocus = false) {
    $$('[data-action="megamenu"][aria-expanded="true"]').forEach(b => {
      b.setAttribute("aria-expanded", "false"); $("#" + b.getAttribute("aria-controls")).hidden = true;
      if (returnFocus) b.focus();
    });
  }
  function toggleMega(btn) {
    const open = btn.getAttribute("aria-expanded") !== "true";
    closeMega();
    if (!open) return;
    btn.setAttribute("aria-expanded", "true"); $("#" + btn.getAttribute("aria-controls")).hidden = false;
  }
  // Se cierra con Esc, al hacer clic fuera o al elegir una opción
  document.addEventListener("keydown", e => { if (e.key === "Escape" && $('[data-action="megamenu"][aria-expanded="true"]')) closeMega(true); });
  document.addEventListener("click", e => { if (!e.target.closest(".mega, [data-action='megamenu']") || e.target.closest(".mega a")) closeMega(); });

  /* ---------- Guía de modelos y tallas ---------- */
  function viewGuide(r) {
    const tipos = TIPOS.filter(t => PRODUCTS.some(p => p.tipo === t.nombre));
    const tabla = (sistema, titulo, nota) => TALLAS[sistema] ? `<table class="sizetable">
        <caption>${titulo}<span class="sm">${nota}</span></caption>
        <thead><tr><th scope="col">Talla</th><th scope="col">Contorno de cabeza</th></tr></thead>
        <tbody>${TALLAS[sistema].map(t => `<tr><th scope="row">${esc(t.etiqueta)}</th><td>${esc(t.medida)}</td></tr>`).join("")}</tbody>
      </table>` : "";
    mount(`<div class="wrap">${crumbs([["Catálogo", "#/catalogo"], ["Guía de modelos y tallas"]])}
      <article class="guide">
        <h1>Guía de modelos y tallas</h1>
        <p class="lead">Cada modelo calza distinto. Aquí ves en qué se diferencian y cómo saber tu talla antes de reservar.</p>
        <section aria-labelledby="gModelos">
          <h2 id="gModelos">Modelos de gorra</h2>
          <ul class="guide__models">${tipos.map(t => { const ej = PRODUCTS.find(p => p.tipo === t.nombre && p.stock) || PRODUCTS.find(p => p.tipo === t.nombre); const n = PRODUCTS.filter(p => p.tipo === t.nombre).length; return `<li class="gmodel">
            <img src="${ej.img}" alt="" loading="lazy">
            <div><h3>${esc(t.nombre)}</h3><p>${esc(t.descripcion || "")}</p>
            <a class="link" href="#/catalogo?t=${encodeURIComponent(t.nombre)}">Ver ${plural(n, "gorra")}<span class="sr-only"> del modelo ${esc(t.nombre)}</span></a></div>
          </li>`; }).join("")}</ul>
        </section>
        <section aria-labelledby="gMedir" id="tallas">
          <h2 id="gMedir" tabindex="-1">Cómo saber tu talla</h2>
          <p>Solo las gorras cerradas (<strong>59FIFTY</strong> y <strong>39THIRTY</strong>) se venden por talla. Las demás tienen ajuste atrás y le quedan a casi todos.</p>
          <ol class="guide__steps">
            <li><strong>Usa una cinta métrica de costura</strong> o un hilo y una regla.</li>
            <li><strong>Rodea tu cabeza</strong> a 1 cm sobre las cejas y las orejas, por la parte más ancha de atrás.</li>
            <li><strong>Lee la medida en centímetros</strong> y búscala en la tabla.</li>
            <li><strong>Si quedas entre dos tallas,</strong> elige la más grande.</li>
          </ol>
          <div class="sizetables">
            ${tabla("fitted", "59FIFTY · adultos", "Gorra cerrada, en octavos de pulgada")}
            ${tabla("juvenil", "59FIFTY · niños", "Para niños de 4 a 12 años aprox.")}
            ${tabla("stretch", "39THIRTY · elástica", "Se estira un poco: cubre un rango")}
          </div>
          <p class="notice notice--small">${ICON.store}<span>¿Dudas? Pruébatela al retirar: si no te queda, la cambias en el local por otra talla.</span></p>
        </section>
      </article></div>`, "Guía de modelos y tallas");
    if (r.q.get("s") === "tallas") { $("#tallas").scrollIntoView(); $("#gMedir").focus({ preventScroll: true }); }
  }

  /* ---------- Colecciones de la portada (prueba) ---------- */
  // Cada colección es una búsqueda o un filtro del catálogo; la portada muestra 3 gorras de cada una.
  const COLECCIONES = [
    { titulo: "Campeones 2026", texto: "Knicks, Brewers y Rays celebran", href: "#/catalogo?q=champ", test: p => /champ/i.test(p.nombre + " " + p.modelo), tono: "morado" },
    { titulo: "NFL Sideline 2026", texto: "Lo que usan en la banca", href: "#/catalogo?q=sideline", test: p => /sideline/i.test(p.modelo), tono: "cafe" },
    { titulo: "Hardwood Classic", texto: "59FIFTY café de la NBA", href: "#/catalogo?q=hardwood", test: p => /hardwood/i.test(p.modelo), tono: "beige" },
    { titulo: "Fórmula 1", texto: "Red Bull Racing y Williams", href: "#/catalogo?e=Red%20Bull%20Racing%7CWilliams%20Racing", test: p => p.liga === "Fórmula 1", tono: "negro" }
  ];
  function coleccionesHTML() {
    const cols = COLECCIONES.map(c => ({ ...c, items: PRODUCTS.filter(c.test) })).filter(c => c.items.length);
    if (!cols.length) return "";
    return `<section class="wrap colls" aria-labelledby="collsTitle">
      <h2 class="section__title" id="collsTitle">Colecciones</h2>
      <ul class="colls__list">${cols.map(c => `<li><a class="coll coll--${c.tono}" href="${c.href}">
        <span class="coll__pics" aria-hidden="true">${c.items.slice(0, 3).map(p => `<img src="${p.img}" alt="" loading="lazy">`).join("")}</span>
        <span class="coll__txt"><strong>${esc(c.titulo)}</strong><span>${esc(c.texto)} · ${plural(c.items.length, "gorra")}</span></span>
        <span class="coll__go" aria-hidden="true">→</span>
      </a></li>`).join("")}</ul>
    </section>`;
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
  // Gorras con varias fotos: un ángulo por foto. Gorras con una sola foto: 4 acercamientos de esa foto.
  const VIEWS = [
    { z: 1, ox: "50%", oy: "50%", label: "Vista completa" },
    { z: 1.8, ox: "45%", oy: "35%", label: "Acercamiento al logo" },
    { z: 1.7, ox: "20%", oy: "65%", label: "Acercamiento a la visera" },
    { z: 1.7, ox: "85%", oy: "55%", label: "Acercamiento al costado" }
  ];
  const viewStyle = v => `--z:${v.z};--ox:${v.ox};--oy:${v.oy}`;
  const capital = s => s.charAt(0).toUpperCase() + s.slice(1);
  function galleryOf(p) {
    const list = fotos(p);
    if (list.length < 2) return VIEWS.map(v => ({ url: p.img, label: v.label, alt: `${v.label}: ${p.alt}`, style: viewStyle(v) }));
    return list.map((f, i) => {
      const angulo = i && f.alt.includes(": ") ? capital(f.alt.split(": ").pop()) : "Vista principal";
      return { url: f.url, label: angulo, alt: i ? f.alt : p.alt, style: "" };
    });
  }
  const SISTEMA = { fitted: "Gorra cerrada 59FIFTY: se vende por talla", juvenil: "59FIFTY de niño: se vende por talla", stretch: "Gorra elástica 39THIRTY: se vende por talla" };

  /* ---------- Reseñas (en la base) ---------- */
  const starIcons = n => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));
  function starsLine(id) {
    const r = state.ratings[id];
    if (!r || !r.total) return `<span aria-hidden="true">☆☆☆☆☆</span> Sin reseñas todavía · <a class="link" href="#reviews" data-action="toReviews">Sé el primero en opinar</a>`;
    return `<span aria-hidden="true">${starIcons(r.promedio)}</span><span class="sr-only">Calificación: ${r.promedio} de 5 estrellas,</span> ${r.promedio.toFixed(1)} · <a class="link" href="#reviews" data-action="toReviews">${plural(r.total, "reseña")}</a>`;
  }

  async function loadReviews(p, announceIt = false) {
    let list;
    try { list = await DB.resenas(p.id); }
    catch (e) { console.error(e); if ($("#reviews")) $("#reviews").innerHTML = `<p class="hint err">No pudimos cargar las reseñas. <button type="button" class="link" data-action="retryReviews">Reintentar</button></p>`; app.retryReviews = () => loadReviews(p); return; }
    const box = $("#reviews");
    if (!box || parseHash().arg !== String(p.id)) return; // el usuario ya cambió de pantalla
    const total = list.length, promedio = total ? Math.round(list.reduce((s, r) => s + r.calificacion, 0) / total * 10) / 10 : 0;
    state.ratings[p.id] = { promedio, total };
    $("#starsLine").innerHTML = starsLine(p.id);
    const mine = state.user && list.find(r => r.usuario_id === state.user.id);

    let form;
    if (!state.user) {
      form = `<p class="notice notice--small">${ICON.alert} <span><a class="link" href="#/ingresar?next=${encodeURIComponent("producto/" + p.id)}">Ingresa a tu cuenta</a> para escribir una reseña.</span></p>`;
    } else {
      const cur = mine?.calificacion || 0;
      form = `<form class="box review-form" id="reviewForm" novalidate>
        <h3>${mine ? "Edita tu reseña" : "Escribe tu reseña"}</h3>
        <div class="errsum" id="errSum" tabindex="-1" hidden></div>
        <fieldset class="rate field" data-f="calificacion" aria-describedby="m_calificacion">
          <legend>Tu calificación <span class="req" aria-hidden="true">*</span><span class="sr-only">(obligatorio)</span></legend>
          <div class="rate__opts">${[1, 2, 3, 4, 5].map(n => `<label class="rate__opt" ${n === 1 ? 'for="f_calificacion" data-label="Calificación"' : ""}><input type="radio" name="calificacion" value="${n}" ${n === 1 ? 'id="f_calificacion"' : ""} ${n === cur ? "checked" : ""}><span aria-hidden="true">${"★".repeat(n)}</span><span class="sr-only">${plural(n, "estrella")}</span></label>`).join("")}</div>
          <span class="msg" id="m_calificacion"></span>
        </fieldset>
        <div class="field" data-f="comentario">
          <label for="f_comentario">Comentario</label>
          <textarea id="f_comentario" name="comentario" rows="3" maxlength="500" aria-describedby="h_comentario m_comentario">${esc(mine?.comentario || "")}</textarea>
          <span class="hint" id="h_comentario">Opcional. Máximo 500 caracteres.</span>
          <span class="msg" id="m_comentario"></span>
        </div>
        <button class="btn btn--cafe" id="reviewBtn">${mine ? "Guardar cambios" : "Publicar reseña"}</button>
      </form>`;
    }
    box.innerHTML = `${form}
      ${total ? `<ul class="revlist">${list.map(r => `<li class="rev">
        <div class="rev__head"><strong>${esc(r.autor || "Cliente")}</strong>
          <span class="stars"><span aria-hidden="true">${starIcons(r.calificacion)}</span><span class="sr-only">${plural(r.calificacion, "estrella")} de 5</span></span>
          <span class="sm">${fmtShort(new Date(r.creado_en))}</span></div>
        ${r.comentario ? `<p>${esc(r.comentario)}</p>` : ""}
        ${mine && r.id === mine.id ? `<button type="button" class="link" data-action="delReview" data-rid="${r.id}">Borrar mi reseña</button>` : ""}
      </li>`).join("")}</ul>` : `<p class="hint">Esta gorra todavía no tiene reseñas.</p>`}`;
    if (announceIt) announce(`${plural(total, "reseña")}, promedio ${promedio} de 5`);

    $("#reviewForm")?.addEventListener("submit", async e => {
      e.preventDefault();
      const f = e.target, cal = Number(f.calificacion.value), com = f.comentario.value.trim();
      if (showErrors(f, cal ? {} : { calificacion: "Elige de 1 a 5 estrellas." })) return;
      const btn = $("#reviewBtn"); btn.disabled = true; btn.textContent = "Guardando…";
      try {
        await DB.guardarResena(state.user.id, p.id, cal, com);
        toast(mine ? "Guardaste los cambios de tu reseña" : "¡Gracias! Tu reseña se publicó");
        loadReviews(p, true);
      } catch (err) {
        dbError(err, "No pudimos publicar tu reseña. Intenta de nuevo.");
        btn.disabled = false; btn.textContent = mine ? "Guardar cambios" : "Publicar reseña";
      }
    });
  }

  function viewProduct(r) {
    const p = byId(r.arg);
    if (!p) return viewNotFound();
    let qty = 1, view = 0;
    const fav = state.favs.includes(p.id);
    const inCart = inCartOf(p.id);
    const max = Math.min(10, p.stock);
    const gal = galleryOf(p);
    const tallas = p.talla ? TALLAS[p.talla] || [] : [];
    const related = PRODUCTS.filter(x => x.id !== p.id && x.stock && x.tipo === p.tipo)
      .concat(PRODUCTS.filter(x => x.id !== p.id && x.stock && x.tipo !== p.tipo)).slice(0, 4);
    const qtyHint = () => `Máximo ${plural(max, "unidad", "unidades")} por gorra${p.stock <= 3 ? ` (quedan ${p.stock} en el local)` : ""}.${inCartOf(p.id) ? ` Ya tienes ${inCartOf(p.id)} en tu carrito.` : ""}`;
    const favBtn = `<button type="button" class="fav ${fav ? "on" : ""}" data-action="fav" data-id="${p.id}" aria-pressed="${fav}" aria-label="${esc(favLabel(p, fav))}" title="${fav ? "Quitar de favoritas" : "Guardar en favoritas"}">${ICON.heart}</button>`;

    const sizeHTML = tallas.length ? `<fieldset class="sizes field" data-f="talla" aria-describedby="h_talla m_talla">
        <legend>Talla <span class="req" aria-hidden="true">*</span><span class="sr-only">(obligatorio)</span></legend>
        <p class="hint" id="h_talla">${SISTEMA[p.talla]}. ¿No sabes tu talla? <a class="link" href="#/guia?s=tallas">Mira la guía de tallas</a>.</p>
        <div class="sizes__opts">${tallas.map((t, i) => `<label class="size"><input type="radio" name="talla" value="${esc(t.etiqueta)}" ${i ? "" : 'id="f_talla"'}><span>${esc(t.etiqueta)}<span class="sm">${esc(t.medida)}</span></span></label>`).join("")}</div>
        <span class="msg" id="m_talla"></span>
      </fieldset>` : "";
    const buyHTML = p.stock ? `${sizeHTML}
          <span class="label" id="qtyLabel">Cantidad</span>
          <div class="qty" role="group" aria-labelledby="qtyLabel">
            <button type="button" data-action="dqty" data-d="-1" aria-label="Quitar una unidad" disabled>−</button>
            <output id="dqty" aria-live="polite" aria-label="Cantidad">1</output>
            <button type="button" data-action="dqty" data-d="1" aria-label="Agregar una unidad" ${max <= 1 ? "disabled" : ""}>+</button>
          </div>
          <p class="hint ${p.stock <= 3 ? "hint--low" : ""}" id="qtyHint">${qtyHint()}</p>
          <div class="buyrow">
            <button type="button" class="btn btn--cafe" data-action="addDetail" data-id="${p.id}">${ICON.cart} Agregar al carrito</button>
            ${favBtn}
          </div>`
      : `<p class="notice">${ICON.alert}<span><strong>Agotada por ahora.</strong> Te mandamos un correo apenas vuelva al local.</span></p>
          <div class="buyrow">${notifyBtn(p, false)}${favBtn}</div>`;

    mount(`<div class="wrap">
      ${crumbs([["Catálogo", "#/catalogo"], [esc(p.nombre)]])}
      <div class="detail">
        <section class="gallery" aria-label="Fotos de ${esc(p.nombre)}">
          <div class="gallery__main">
            <img id="mainImg" src="${gal[0].url}" alt="${esc(gal[0].alt)}" style="${gal[0].style}">
            <button type="button" class="gallery__nav gallery__nav--prev" data-action="step" data-d="-1" aria-label="Foto anterior">‹</button>
            <button type="button" class="gallery__nav gallery__nav--next" data-action="step" data-d="1" aria-label="Foto siguiente">›</button>
            <span class="gallery__count" id="galCount" aria-live="polite">1 de ${gal.length}</span>
          </div>
          <div class="thumbs" role="group" aria-label="Elegir vista">${gal.map((v, i) => `<button type="button" class="thumb ${i ? "" : "on"}" data-action="view" data-v="${i}" aria-pressed="${!i}" aria-label="${esc(v.label)}" title="${esc(v.label)}"><img src="${v.url}" alt="" style="${v.style}" loading="lazy"></button>`).join("")}</div>
        </section>
        <div class="info">
          <h1>${esc(p.nombre)}</h1>
          <p class="brandline">${esc(p.marca)} · ${esc(p.modelo)}</p>
          <p class="stars" id="starsLine">${starsLine(p.id)}</p>
          <p class="bigprice">${priceHTML(p)}</p>
          <p class="desc">${esc(p.desc)}</p>
          ${buyHTML}
          <ul class="perks" aria-label="Beneficios">
            <li class="perk"><strong>Retiro en el local</strong><span class="sm">sin costo</span></li>
            <li class="perk"><strong>Devolución</strong><span class="sm">en 15 días</span></li>
            <li class="perk"><strong>Pagas al retirar</strong><span class="sm">en el local</span></li>
          </ul>
          <div class="specs">
            <h2>Detalles del producto</h2>
            <ul>${p.detalles.map(d => `<li>${esc(d)}</li>`).join("")}<li>Color: ${esc(p.color)}</li></ul>
          </div>
        </div>
      </div>
      <section class="reviews" aria-labelledby="revTitle">
        <h2 class="section__title" id="revTitle">Reseñas</h2>
        <div id="reviews"><p class="hint" role="status">Cargando reseñas…</p></div>
      </section>
      <section class="related" aria-labelledby="relTitle">
        <h2 class="section__title" id="relTitle">También te puede gustar</h2>
        <div class="grid">${related.map(x => cardHTML(x, 3)).join("")}</div>
      </section>
    </div>`, p.nombre);
    loadReviews(p);

    app.onclickDetail = action => {
      if (action.dataset.action === "dqty") {
        qty = Math.min(max, Math.max(1, qty + Number(action.dataset.d)));
        $("#dqty").textContent = qty;
        const [minus, plus] = $$('[data-action="dqty"]');
        minus.disabled = qty === 1; plus.disabled = qty === max;
        if (document.activeElement.disabled || !document.activeElement.isConnected) (qty === 1 ? plus : minus).focus();
      } else if (action.dataset.action === "addDetail") {
        const talla = $('input[name="talla"]:checked')?.value || "";
        if (tallas.length && !talla) { // sin talla no se puede agregar una gorra cerrada
          showErrors($(".info", app), { talla: "Elige tu talla antes de agregar la gorra al carrito." }, null); // sin resumen: el foco va a la primera talla
          return;
        }
        if (tallas.length) showErrors($(".info", app), {}, null);
        addToCart(p.id, qty, action, talla); // se queda en el detalle: botón «✓ Agregada» + aviso con «Ver carrito»
        $("#qtyHint").textContent = qtyHint();
      } else if (action.dataset.action === "step") {
        $(`.thumb[data-v="${(view + Number(action.dataset.d) + gal.length) % gal.length}"]`).click();
      } else if (action.dataset.action === "delReview") {
        if (!confirm("¿Borrar tu reseña de esta gorra?")) return;
        DB.borrarResena(Number(action.dataset.rid))
          .then(() => { toast("Borraste tu reseña"); loadReviews(p, true); })
          .catch(e => dbError(e, "No pudimos borrar tu reseña. Intenta de nuevo."));
      } else if (action.dataset.action === "view") {
        view = Number(action.dataset.v);
        const v = gal[view];
        $$(".thumb").forEach(t => { t.classList.toggle("on", t === action); t.setAttribute("aria-pressed", t === action); });
        const img = $("#mainImg");
        img.src = v.url; img.setAttribute("style", v.style); img.alt = v.alt;
        $("#galCount").textContent = `${view + 1} de ${gal.length}`;
      }
    };
    // Al elegir talla se quita el error
    $(".sizes")?.addEventListener("change", () => showErrors($(".info", app), {}, null));
    // Flechas ← → cambian de foto cuando el foco está en la galería
    $(".gallery").addEventListener("keydown", e => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault();
      const next = $(`.thumb[data-v="${(view + (e.key === "ArrowRight" ? 1 : -1) + gal.length) % gal.length}"]`);
      next.click(); if (e.target.classList.contains("thumb")) next.focus();
    });
  }

  /* ---------- 04 Carrito ---------- */
  function viewCart() {
    const items = cartItems();
    const n = cartCount();
    const head = `<div class="pagehead">${ICON.cart}<h1>Tu carrito (${plural(n, "producto")})</h1></div>`;
    const cr = crumbs([["Catálogo", "#/catalogo"], ["Carrito"]]);
    if (!items.length) {
      return mount(`<div class="wrap">${cr}${head}
        <div class="empty">${emptyArt("cart")}<h2>Tu carrito está vacío</h2><p>Agrega una gorra desde el catálogo para empezar tu pedido.</p><a class="btn btn--cafe" href="#/catalogo">Ver catálogo</a></div></div>`, "Carrito");
    }
    const t = totals();
    const active = document.activeElement?.dataset;
    mount(`<div class="wrap">${cr}${head}
      <div class="layout">
        <section aria-label="Productos en el carrito">
          <div class="cols" aria-hidden="true"><span>Producto</span><span>Cantidad</span><span>Precio</span></div>
          <ul class="lines">
          ${items.map(({ key, p, talla, qty }) => { const name = esc(p.nombre + tallaTexto(talla)); return `<li class="line">
            <div class="line__prod">
              <img src="${p.img}" alt="${esc(p.alt)}">
              <div><a href="#/producto/${p.id}">${esc(p.nombre)}</a>
                ${talla ? `<span class="line__size">Talla ${esc(talla)}</span>` : ""}
                <span class="sm">${esc(p.tipo)} · ${esc(p.color)} · ${money(p.precio)} c/u</span>
                <button type="button" class="link" data-action="remove" data-id="${esc(key)}" aria-label="Eliminar ${name} del carrito">Eliminar</button></div>
            </div>
            <div class="qty" role="group" aria-label="Cantidad de ${name}">
              <button type="button" data-action="qty" data-id="${esc(key)}" data-d="-1" aria-label="Quitar una unidad de ${name}" ${qty <= 1 ? "disabled" : ""}>−</button>
              <span>${qty}</span>
              <button type="button" data-action="qty" data-id="${esc(key)}" data-d="1" aria-label="Agregar una unidad de ${name}" ${qty >= Math.min(10, p.stock) ? "disabled" : ""}>+</button>
            </div>
            <div class="line__total"><span class="sr-only">Precio: </span>${money(p.precio * qty)}</div>
          </li>`; }).join("")}
          </ul>
          <a class="link back" href="#/catalogo">←  Seguir comprando</a>
        </section>
        <aside class="panel" aria-labelledby="sumTitle">
          <h2 id="sumTitle">Resumen del pedido</h2>
          ${summaryRows(t)}
          <p class="notice notice--small">${ICON.store}<span>No hacemos envíos: retiras tu pedido y pagas en ${esc(localTexto())}.</span></p>
          <form class="coupon" id="couponForm" novalidate>
            <label class="label" for="couponInput">Código de descuento</label>
            <div class="coupon__row">
              <input id="couponInput" placeholder="Ej.: CROWN10" value="${esc(state.coupon?.code || "")}" autocomplete="off" aria-describedby="couponMsg" ${state.coupon ? "readonly" : ""}>
              <button class="btn btn--beige" id="couponBtn">${state.coupon ? "Quitar" : "Aplicar"}</button>
            </div>
            <p class="hint ${state.coupon ? "ok" : ""}" id="couponMsg">${state.coupon ? `✓ Código ${esc(state.coupon.code)} aplicado: ${state.coupon.pct} % de descuento.` : "Si tienes un código, escríbelo aquí. Para probar: CROWN10."}</p>
          </form>
          <button type="button" class="btn btn--verde btn--block btn--lg" data-action="pay">Reservar pedido</button>
          <p class="secure">${state.user ? "En el siguiente paso confirmas tus datos de contacto." : "En el siguiente paso ingresas a tu cuenta o entras con Google."}</p>
        </aside>
      </div></div>`, "Carrito");

    // Mantener el foco en el mismo botón tras cambiar la cantidad (no perder la posición con teclado).
    if (active?.action === "qty") {
      const same = $(`[data-action="qty"][data-id="${CSS.escape(active.id)}"][data-d="${active.d}"]`);
      const other = $(`[data-action="qty"][data-id="${CSS.escape(active.id)}"]:not([data-d="${active.d}"])`);
      (same && !same.disabled ? same : other)?.focus();
    }

    // El código se revisa en la base (los códigos no se pueden ver desde el navegador)
    $("#couponForm").addEventListener("submit", async e => {
      e.preventDefault();
      if (state.coupon) { state.coupon = null; persist(); viewCart(); toast("Quitaste el código de descuento", null, "info"); return; }
      const code = $("#couponInput").value.trim().toUpperCase();
      const m = $("#couponMsg"), i = $("#couponInput"), b = $("#couponBtn");
      const fail = msg => { m.textContent = msg; m.className = "hint err"; i.setAttribute("aria-invalid", "true"); i.focus(); };
      if (!code) return fail("Escribe un código antes de presionar Aplicar.");
      b.disabled = true; b.textContent = "Revisando…";
      let pct;
      try { pct = await DB.validarCodigo(code); }
      catch (err) { console.error(err); b.disabled = false; b.textContent = "Aplicar"; return fail("No pudimos revisar el código. Revisa tu conexión e intenta de nuevo."); }
      if (!$("#couponForm")) return; // cambió de pantalla mientras revisaba
      if (pct) { state.coupon = { code, pct }; persist(); viewCart(); toast(`Código ${code} aplicado: ${pct} % de descuento`); }
      else { b.disabled = false; b.textContent = "Aplicar"; fail(`El código «${code}» no existe o ya venció. Revisa cómo está escrito.`); }
    });
  }

  /* ---------- 05 Login ---------- */
  function viewLogin(r) {
    const next = r.q.get("next") || "catalogo";
    let tab = r.q.get("tab") === "crear" ? "crear" : "ingresar";
    const draw = (focusTab = false) => {
      const isIn = tab === "ingresar";
      mount(`<div class="wrap"><div class="auth">
        ${next === "checkout" ? `<p class="notice">${ICON.alert}<span>Para reservar tu pedido, ingresa a tu cuenta, crea una o entra con Google. Tu carrito se mantiene.</span></p>` : ""}
        <div class="tabs" role="tablist" aria-label="Tipo de acceso">
          <button type="button" role="tab" id="tab-ingresar" aria-controls="authPanel" class="${isIn ? "on" : ""}" aria-selected="${isIn}" tabindex="${isIn ? 0 : -1}" data-action="tab" data-t="ingresar">Ingresar</button>
          <button type="button" role="tab" id="tab-crear" aria-controls="authPanel" class="${!isIn ? "on" : ""}" aria-selected="${!isIn}" tabindex="${!isIn ? 0 : -1}" data-action="tab" data-t="crear">Crear cuenta</button>
        </div>
        <div class="auth__box" role="tabpanel" id="authPanel" aria-labelledby="tab-${tab}">
          <h1>${isIn ? "Bienvenido de nuevo" : "Crea tu cuenta"}</h1>
          <p class="req-note">Los campos marcados con <span class="req" aria-hidden="true">*</span> son obligatorios.</p>
          <div class="errsum" id="errSum" tabindex="-1" hidden></div>
          <form id="authForm" novalidate>
            ${!isIn ? `<div class="grid2">${field("nombre", "Nombre", { auto: "given-name", req: true, hint: "Como quieres que te saludemos." })}${field("apellido", "Apellido", { auto: "family-name", req: true })}</div>` : ""}
            ${field("email", "Correo electrónico", { type: "email", ph: "correo@ejemplo.com", auto: "email", req: true })}
            ${field("pass", "Contraseña", { type: "password", auto: isIn ? "current-password" : "new-password", req: true, hint: isIn ? "" : "Mínimo 6 caracteres.", reveal: true })}
            ${!isIn ? field("pass2", "Repite la contraseña", { type: "password", auto: "new-password", req: true, reveal: true }) : ""}
            ${isIn ? '<p><button type="button" class="link" data-action="forgot">¿Olvidaste tu contraseña?</button></p>' : ""}
            <button class="btn btn--cafe btn--block" id="authBtn">${isIn ? "Ingresar" : "Crear cuenta"}</button>
          </form>
          <div class="or" aria-hidden="true">o</div>
          <button type="button" class="btn btn--google btn--block" data-action="google" id="googleBtn"><svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 2.9-2.2 5.4-4.7 7.1l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17.5z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.2-13.5-10l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg> Continuar con Google</button>
          <p class="fine">Usamos tu cuenta de Google solo para ingresar: tu nombre y tu correo. No vemos tu contraseña.</p>
        </div>
      </div></div>`, isIn ? "Ingresar" : "Crear cuenta");
      if (focusTab) $(`#tab-${tab}`).focus();

      $(".tabs").addEventListener("keydown", e => { // flechas para cambiar de pestaña (patrón ARIA de pestañas)
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) { e.preventDefault(); tab = tab === "ingresar" ? "crear" : "ingresar"; draw(true); }
      });
      $("#authForm").addEventListener("submit", async e => {
        e.preventDefault();
        const form = e.target;
        if (form.dataset.busy) return; // evita enviar dos veces
        const v = formValues(form);
        const errs = {};
        if (!isIn && v.nombre.length < 2) errs.nombre = "Escribe tu nombre.";
        if (!isIn && v.apellido.length < 2) errs.apellido = "Escribe tu apellido.";
        if (!v.email) errs.email = "Escribe tu correo electrónico.";
        else if (!EMAIL.test(v.email)) errs.email = "El correo debe tener la forma nombre@dominio.com.";
        if (!v.pass) errs.pass = "Escribe tu contraseña.";
        else if (v.pass.length < 6) errs.pass = "La contraseña debe tener al menos 6 caracteres.";
        if (!isIn && v.pass !== v.pass2) errs.pass2 = "Las dos contraseñas no son iguales.";
        if (showErrors(form, errs)) return;

        // Supabase Auth guarda la contraseña cifrada; la tienda nunca la ve.
        const btn = $("#authBtn");
        form.dataset.busy = "1"; btn.disabled = true; btn.classList.add("is-loading");
        btn.textContent = isIn ? "Ingresando…" : "Creando cuenta…";
        announce(btn.textContent);
        const fail = msg => {
          delete form.dataset.busy; btn.disabled = false; btn.classList.remove("is-loading"); btn.textContent = isIn ? "Ingresar" : "Crear cuenta";
          const sum = $("#errSum"); sum.hidden = false;
          sum.innerHTML = `<h2>${ICON.alert} ${esc(msg)}</h2>`; sum.focus();
        };
        try {
          const res = isIn ? await DB.ingresar(v.email, v.pass) : await DB.crearCuenta(v.email, v.pass, v.nombre, v.apellido);
          if (!res.session) { // el proyecto pide confirmar el correo antes de entrar
            delete form.dataset.busy; btn.disabled = false; btn.classList.remove("is-loading"); btn.textContent = "Crear cuenta";
            // Supabase no avisa si el correo ya tenía cuenta: devuelve un usuario sin identidades
            if (res.user && !res.user.identities?.length) return fail("Ya existe una cuenta con ese correo. Ingresa con tu contraseña.");
            const sum = $("#errSum"); sum.hidden = false; sum.classList.add("errsum--ok");
            sum.innerHTML = `<h2>${ICON.check} Revisa tu correo</h2><p>Te enviamos un enlace de confirmación a <strong>${esc(v.email)}</strong>. Ábrelo para activar tu cuenta y después ingresa con tu contraseña. Si no llega en unos minutos, revisa la carpeta de spam.</p><p><button type="button" class="link" data-action="resend" data-email="${esc(v.email)}">Reenviar el correo</button></p>`;
            sum.focus();
            return;
          }
          await loadUser(res.session);
        } catch (err) {
          console.error(err);
          if (isIn && /email not confirmed/i.test(err?.message || "")) {
            fail(DB.authMessage(err));
            $("#errSum").insertAdjacentHTML("beforeend", `<p>¿No te llegó? <button type="button" class="link" data-action="resend" data-email="${esc(v.email)}">Reenviar el correo de confirmación</button></p>`);
            return;
          }
          return fail(DB.authMessage(err));
        }
        toast(!isIn ? `¡Listo, ${state.user.nombre.split(" ")[0]}! Tu cuenta fue creada.` : `Hola de nuevo, ${state.user.nombre.split(" ")[0]}`);
        go("#/" + next);
      });
    };
    app.onclickDetail = async a => {
      if (a.dataset.action === "tab" && a.dataset.t !== tab) { tab = a.dataset.t; draw(true); }
      if (a.dataset.action === "google") {
        a.disabled = true; a.classList.add("is-loading");
        try { sessionStorage.setItem("nqc_next", next); } catch { /* sin almacenamiento */ }
        try { await DB.ingresarConGoogle(); } // la página se va a Google y vuelve con la sesión
        catch (err) { console.error(err); a.disabled = false; a.classList.remove("is-loading"); toast(DB.authMessage(err), null, "error"); }
      }
      if (a.dataset.action === "resend") {
        a.disabled = true;
        try { await DB.reenviarConfirmacion(a.dataset.email); toast(`Te reenviamos el correo de confirmación a ${a.dataset.email}`); }
        catch (err) { console.error(err); toast(DB.authMessage(err), null, "error"); }
        a.disabled = false;
      }
      if (a.dataset.action === "forgot") {
        const email = $("#f_email").value.trim();
        if (!EMAIL.test(email)) return showErrors($("#authForm"), { email: "Escribe tu correo para enviarte el enlace." });
        a.disabled = true;
        try { await DB.recuperarClave(email); toast(`Te enviamos un enlace a ${email} para crear una nueva contraseña`); }
        catch (err) { console.error(err); toast(DB.authMessage(err), null, "error"); }
        a.disabled = false;
      }
    };
    draw();
  }

  /* ---------- Nueva contraseña (enlace del correo de recuperación) ---------- */
  function viewNewPassword() {
    if (!state.user) {
      return mount(`<div class="wrap section"><div class="empty">${emptyArt("alert")}<h1>El enlace ya no sirve</h1><p>Pide otro enlace desde «¿Olvidaste tu contraseña?» en la pantalla de ingreso.</p><a class="btn btn--cafe" href="#/ingresar">Ir a Ingresar</a></div></div>`, "Nueva contraseña");
    }
    mount(`<div class="wrap"><div class="auth"><div class="auth__box">
      <h1>Crea una nueva contraseña</h1>
      <p class="req-note">Los campos marcados con <span class="req" aria-hidden="true">*</span> son obligatorios.</p>
      <div class="errsum" id="errSum" tabindex="-1" hidden></div>
      <form id="passForm" novalidate>
        ${field("pass", "Nueva contraseña", { type: "password", auto: "new-password", req: true, hint: "Mínimo 6 caracteres.", reveal: true })}
        ${field("pass2", "Repite la contraseña", { type: "password", auto: "new-password", req: true, reveal: true })}
        <button class="btn btn--cafe btn--block" id="passBtn">Guardar contraseña</button>
      </form>
    </div></div></div>`, "Nueva contraseña");
    $("#passForm").addEventListener("submit", async e => {
      e.preventDefault();
      const v = formValues(e.target), errs = {};
      if (v.pass.length < 6) errs.pass = "La contraseña debe tener al menos 6 caracteres.";
      if (v.pass !== v.pass2) errs.pass2 = "Las dos contraseñas no son iguales.";
      if (showErrors(e.target, errs)) return;
      const btn = $("#passBtn"); btn.disabled = true; btn.textContent = "Guardando…";
      try { await DB.cambiarClave(v.pass); toast("Listo, tu contraseña se cambió"); go("#/catalogo"); }
      catch (err) { console.error(err); btn.disabled = false; btn.textContent = "Guardar contraseña"; toast(DB.authMessage(err), null, "error"); }
    });
  }

  /* ---------- Mis datos (perfil en la base) ---------- */
  function viewProfile() {
    if (!state.user) return go("#/ingresar?next=perfil");
    const u = state.user;
    mount(`<div class="wrap">
      ${crumbs([["Catálogo", "#/catalogo"], ["Mis datos"]])}
      <div class="pagehead"><span class="account__avatar account__avatar--lg" aria-hidden="true">${esc((u.nombre[0] || "?").toUpperCase())}</span><h1>Mis datos</h1></div>
      <div class="profile">
        <form class="box" id="profileForm" novalidate>
          <h2 class="box__title">Información personal</h2>
          <p class="req-note">Los campos marcados con <span class="req" aria-hidden="true">*</span> son obligatorios.</p>
          <div class="errsum" id="errSum" tabindex="-1" hidden></div>
          <div class="grid2">
            ${field("nombre", "Nombre", { auto: "given-name", value: u.nombre, req: true, hint: "Así te saludamos en la tienda." })}
            ${field("apellido", "Apellido", { auto: "family-name", value: u.apellido, req: true })}
          </div>
          ${field("telefono", "Celular", { type: "tel", auto: "tel", value: u.telefono, hint: "Opcional. 10 números que empiezan con 09. Lo usamos para llenar tus reservas.", extra: 'inputmode="numeric" maxlength="12"' })}
          <div class="field"><span class="label" id="emailLabel">Correo electrónico</span><p class="readonly" aria-labelledby="emailLabel">${esc(u.email)}</p><span class="hint">Con este correo ingresas a tu cuenta.</span></div>
          <button class="btn btn--cafe" id="profileBtn">Guardar cambios</button>
        </form>
        <form class="box" id="passForm" novalidate>
          <h2 class="box__title">Cambiar contraseña</h2>
          <div class="errsum" id="errSum2" tabindex="-1" hidden></div>
          ${field("pass", "Nueva contraseña", { type: "password", auto: "new-password", req: true, hint: "Mínimo 6 caracteres.", reveal: true })}
          ${field("pass2", "Repite la contraseña", { type: "password", auto: "new-password", req: true, reveal: true })}
          <button class="btn btn--borde" id="passBtn">Cambiar contraseña</button>
        </form>
        <nav class="box profile__links" aria-label="Mi cuenta">
          <h2 class="box__title">Mi cuenta</h2>
          <ul>
            <li><a class="link" href="#/pedidos">Mis pedidos</a></li>
            <li><a class="link" href="#/catalogo?f=fav">Mis favoritas (${state.favs.length})</a></li>
            <li><a class="link" href="#/salir">Cerrar sesión</a></li>
          </ul>
        </nav>
      </div>
    </div>`, "Mis datos");

    const pf = $("#profileForm");
    pf.addEventListener("submit", async e => {
      e.preventDefault();
      if (pf.dataset.busy) return;
      const v = formValues(pf), errs = {}, tel = v.telefono.replace(/[\s-]/g, "");
      if (v.nombre.length < 2) errs.nombre = "Escribe tu nombre.";
      if (v.apellido.length < 2) errs.apellido = "Escribe tu apellido.";
      if (tel && !/^09\d{8}$/.test(tel)) errs.telefono = "El celular debe tener 10 números y empezar con 09, por ejemplo 0991234567.";
      if (showErrors(pf, errs)) return;
      const btn = $("#profileBtn");
      pf.dataset.busy = "1"; btn.disabled = true; btn.classList.add("is-loading"); btn.textContent = "Guardando…";
      try {
        await DB.actualizarPerfil(u.id, { nombre: v.nombre, apellido: v.apellido, telefono: tel || null });
        Object.assign(state.user, { nombre: v.nombre, apellido: v.apellido, telefono: tel });
        updateHeader();
        toast("Guardamos tus datos");
      } catch (err) { dbError(err, "No pudimos guardar tus datos. Intenta de nuevo."); }
      delete pf.dataset.busy; btn.disabled = false; btn.classList.remove("is-loading"); btn.textContent = "Guardar cambios";
    });

    const pw = $("#passForm");
    pw.addEventListener("submit", async e => {
      e.preventDefault();
      const v = formValues(pw), errs = {};
      if (v.pass.length < 6) errs.pass = "La contraseña debe tener al menos 6 caracteres.";
      if (v.pass !== v.pass2) errs.pass2 = "Las dos contraseñas no son iguales.";
      if (showErrors(pw, errs, "#errSum2")) return;
      const btn = $("#passBtn"); btn.disabled = true; btn.textContent = "Cambiando…";
      try { await DB.cambiarClave(v.pass); pw.reset(); toast("Listo, tu contraseña se cambió"); }
      catch (err) { console.error(err); toast(DB.authMessage(err), null, "error"); }
      btn.disabled = false; btn.textContent = "Cambiar contraseña";
    });
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
  function showErrors(form, errs, sumSel = "#errSum") {
    $$(".field[data-f]", form).forEach(f => {
      const msg = errs[f.dataset.f] || "";
      f.classList.toggle("bad", !!msg);
      $(".msg", f).innerHTML = msg ? `${ICON.alert} ${esc(msg)}` : "";
      $("input", f)?.setAttribute("aria-invalid", msg ? "true" : "false");
    });
    const keys = Object.keys(errs);
    const sum = sumSel && $(sumSel);
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
    if (!cartItems().length) { toast("Tu carrito está vacío; agrega una gorra primero", null, "info"); return go("#/carrito"); }
    if (!state.user) return go("#/ingresar?next=checkout");
    let sending = false;
    const u = state.user || {};
    const t = totals();

    mount(`<div class="wrap">
      ${crumbs([["Catálogo", "#/catalogo"], ["Carrito", "#/carrito"], ["Reservar pedido"]])}
      <h1 class="section__title">Reservar pedido</h1>
      <ol class="steps" aria-label="Pasos de la reserva">
        <li class="step" data-step="0"><strong>1</strong>Tus datos</li><li class="step" data-step="1"><strong>2</strong>Retiro y pago</li>
      </ol>
      <p class="req-note">Los campos marcados con <span class="req" aria-hidden="true">*</span> son obligatorios.</p>
      <div class="layout">
        <div>
          <div class="errsum" id="errSum" tabindex="-1" hidden></div>
          <form id="checkoutForm" novalidate>
            <fieldset class="box" data-step="0"><legend>Tus datos</legend>
              <div class="grid2">
                ${field("nombre", "Nombre", { auto: "given-name", value: u.nombre, req: true })}
                ${field("apellido", "Apellido", { auto: "family-name", value: u.apellido, req: true, hint: "Lo pediremos al retirar el pedido." })}
              </div>
              ${field("email", "Correo electrónico", { type: "email", ph: "correo@ejemplo.com", auto: "email", value: u.email, req: true, hint: "Te avisaremos aquí cuando tu pedido esté listo para retirar." })}
              ${field("telefono", "Celular", { type: "tel", auto: "tel", value: u.telefono, req: true, hint: "10 números que empiezan con 09. Ej.: 0991234567.", extra: 'inputmode="numeric" maxlength="12"' })}
              <label class="check"><input type="checkbox" name="ofertas"> Quiero recibir ofertas por correo</label>
            </fieldset>
            <fieldset class="box" data-step="1"><legend>Retiro y pago</legend>
              <div class="pickup">
                <span class="pickup__icon">${ICON.store}</span>
                <div>
                  <strong>${esc(STORE.local.nombre)}</strong>
                  ${STORE.local.direccion ? `<p>${esc(STORE.local.direccion)}</p>` : ""}
                  ${STORE.local.enlace_mapa ? `<p><a class="link" href="${esc(STORE.local.enlace_mapa)}" target="_blank" rel="noopener">Cómo llegar<span class="sr-only"> (se abre en otra pestaña)</span></a></p>` : ""}
                  <p>${esc(STORE.local.horario)}</p>
                </div>
              </div>
              <ul class="pickup__steps">
                <li>Te enviamos un correo cuando tu pedido esté listo.</li>
                <li>Vas al local, das tu número de pedido y tu nombre.</li>
                <li>Pagas ahí al retirar. No pagas nada en línea.</li>
                <li><strong>Si no te acercas en máximo 3 días después de tu reservación, se cancelará.</strong> Si reservas hoy, tienes hasta el ${esc(limiteTexto(isoDate(addDays(new Date(), 3))))}.</li>
              </ul>
              <label class="check check--box" for="f_acepto" data-label="Confirmación de retiro"><input type="checkbox" name="acepto" id="f_acepto" aria-describedby="m_acepto"> Entiendo que debo retirar y pagar el pedido en el local.</label>
              <div class="field" data-f="acepto"><span class="msg" id="m_acepto"></span></div>
            </fieldset>
            <a class="link" href="#/carrito">←  Volver al carrito</a>
          </form>
        </div>
        <aside class="panel" id="resumen" aria-labelledby="sumTitle">
          <h2 id="sumTitle">Resumen del pedido</h2>
          <ul class="minis">${cartItems().map(({ p, talla, qty }) => `<li class="mini"><img src="${p.img}" alt="${esc(p.alt)}"><div><strong>${esc(p.nombre)}</strong><span class="sm">${esc(p.color)}${esc(tallaTexto(talla))} · ${plural(qty, "unidad", "unidades")}</span></div><span>${money(p.precio * qty)}</span></li>`).join("")}</ul>
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
      $("strong", s).innerHTML = i < n ? `${ICON.check}<span class="sr-only">completado:</span>` : i + 1;
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

    form.addEventListener("submit", async e => {
      e.preventDefault();
      if (sending) return; // evita reservar dos veces
      const v = formValues(form);
      const errs = {};
      if (v.nombre.length < 2) errs.nombre = "Escribe tu nombre.";
      if (v.apellido.length < 2) errs.apellido = "Escribe tu apellido.";
      if (!v.email) errs.email = "Escribe tu correo."; else if (!EMAIL.test(v.email)) errs.email = "El correo debe tener la forma nombre@dominio.com.";
      const tel = v.telefono.replace(/[\s-]/g, "");
      if (!tel) errs.telefono = "Escribe tu número de celular.";
      else if (!/^09\d{8}$/.test(tel)) errs.telefono = "El celular debe tener 10 números y empezar con 09, por ejemplo 0991234567.";
      if (!form.acepto.checked) errs.acepto = "Marca la casilla para confirmar que retirarás y pagarás en el local.";
      if (showErrors(form, errs)) return;

      // Microinteracción: el botón muestra que se está procesando
      sending = true;
      const btn = $("#confirmBtn");
      btn.disabled = true; btn.classList.add("is-loading"); btn.textContent = "Reservando pedido…";
      announce("Reservando tu pedido, espera un momento");
      // La base calcula precios, descuento y stock; el navegador solo manda qué gorras y cuántas.
      try {
        const r = await DB.reservar({ ...v, telefono: tel }, state.cart, state.coupon?.code, STORE.local.id);
        state.lastOrder = {
          numero: r.numero, subtotal: Number(r.subtotal), descuento: Number(r.descuento), total: Number(r.total),
          codigo: state.coupon, fecha_limite: r.fecha_limite, cliente: `${v.nombre} ${v.apellido}`, email: v.email
        };
        if (state.user && !state.user.telefono) {
          state.user.telefono = tel;
          DB.guardarTelefono(state.user.id, tel).catch(e => console.error(e)); // para la próxima reserva
        }
        state.cart = {}; state.coupon = null; persist(); updateHeader();
        go("#/confirmacion/" + r.numero);
      } catch (e) {
        console.error(e);
        sending = false;
        btn.disabled = false; btn.classList.remove("is-loading"); btn.textContent = `Confirmar reserva · ${money(totals().total)}`;
        const sum = $("#errSum"); sum.hidden = false;
        sum.innerHTML = `<h2>${ICON.alert} No pudimos reservar tu pedido</h2><p>${esc(/fetch|network/i.test(e.message) ? "Revisa tu conexión a internet e intenta de nuevo." : e.message)}</p>`;
        sum.focus();
      }
    });
  }

  /* ---------- 07 Confirmación ---------- */
  // Los datos vienen de la reserva recién hecha (así no hay que volver a pedirlos a la base)
  function viewConfirm(r) {
    const o = state.lastOrder;
    if (!o || o.numero !== r.arg) return viewNotFound();
    mount(`<div class="wrap"><div class="done">
      <svg class="crowncap" viewBox="0 0 220 170" aria-hidden="true" focusable="false">
        <ellipse cx="110" cy="156" rx="78" ry="8" fill="#E6DBC8"/>
        <g class="crowncap__cap">
          <path d="M42 124C42 82 72 58 108 58s64 24 64 66z" fill="#4A2E20"/>
          <path d="M108 58c-8 20-10 42-8 66M108 58c14 18 22 40 24 66" fill="none" stroke="#6b4a37" stroke-width="2"/>
          <circle cx="108" cy="58" r="5" fill="#B59F7E"/>
          <rect x="40" y="118" width="134" height="9" rx="4.5" fill="#2e1b12"/>
          <path d="M42 126c42 2 104 6 156 18-10 10-62 10-124-2-19-4-32-9-32-16z" fill="#6b4a37"/>
          <path d="M92 98l7 6 9-11 9 11 7-6-3 15H95z" fill="#B59F7E"/>
        </g>
        <g class="crowncap__crown">
          <path d="M80 50l-6-30 20 16 14-24 14 24 20-16-6 30z" fill="#E2B33C" stroke="#9c7414" stroke-width="2" stroke-linejoin="round"/>
          <rect x="79" y="48" width="58" height="8" rx="3" fill="#c9971f"/>
          <circle cx="74" cy="20" r="4" fill="#E2B33C"/><circle cx="108" cy="12" r="4" fill="#E2B33C"/><circle cx="142" cy="20" r="4" fill="#E2B33C"/>
          <circle cx="108" cy="36" r="4" fill="#6B3FA0"/>
        </g>
        <g class="crowncap__spark" fill="#E2B33C">
          <path d="M40 40l3 8 8 3-8 3-3 8-3-8-8-3 8-3z"/><path d="M180 30l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/><path d="M190 90l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>
        </g>
      </svg>
      <h1>¡Pedido reservado!</h1>
      <p>Tu pedido <strong>${esc(o.numero)}</strong> está reservado. Te escribiremos a <strong>${esc(o.email)}</strong> cuando esté listo para retirar.</p>
      <section class="panel" aria-labelledby="resTitle">
        <h2 id="resTitle">Resumen</h2>
        <dl class="sum">
          <div class="row"><dt>A nombre de</dt><dd>${esc(o.cliente)}</dd></div>
          <div class="row"><dt>Retiro</dt><dd style="text-align:right">${esc(localTexto())}<br><span class="sm">${esc(STORE.local.horario)}</span></dd></div>
          <div class="row"><dt>Retira hasta el</dt><dd>${esc(limiteTexto(o.fecha_limite))}</dd></div>
          <div class="row"><dt>Pago</dt><dd>Al retirar, en el local</dd></div>
          ${o.subtotal != null ? `<div class="row"><dt>Subtotal</dt><dd>${money(o.subtotal)}</dd></div>` : ""}
          ${o.descuento ? `<div class="row row--desc"><dt>Descuento${o.codigo ? ` (${esc(o.codigo.code)}, ${o.codigo.pct} %)` : ""}</dt><dd>−${money(o.descuento)}</dd></div>` : ""}
          <div class="row row--total"><dt>Total a pagar</dt><dd>${money(o.total)}</dd></div>
        </dl>
        <p class="notice notice--small">${ICON.store}<span>Lleva tu número de pedido <strong>${esc(o.numero)}</strong> al local. Si no te acercas hasta el ${esc(limiteTexto(o.fecha_limite))}, tu reserva se cancelará.</span></p>
      </section>
      <div class="actions">
        <a class="btn btn--cafe" href="#/catalogo">Seguir comprando</a>
        ${state.user ? `<a class="btn btn--borde" href="#/pedidos">Ver mis pedidos</a>` : ""}
      </div>
    </div></div>`, "Pedido reservado");
  }

  /* ---------- Mis pedidos (en la base, solo con sesión) ---------- */
  const ESTADO = { reservado: "Reservado", retirado: "Retirado", cancelado: "Cancelado" };
  async function viewOrders() {
    const head = `${crumbs([["Catálogo", "#/catalogo"], ["Mis pedidos"]])}
      <div class="pagehead" style="justify-content:space-between;flex-wrap:wrap">
        <h1>Mis pedidos</h1>
        ${state.user ? `<p>${esc(state.user.nombre)} ${esc(state.user.apellido)} · ${esc(state.user.email)} · <a class="link" href="#/salir">Cerrar sesión</a></p>` : ""}
      </div>`;
    if (!state.user) {
      return mount(`<div class="wrap">${head}<div class="empty">${emptyArt("user")}<h2>Ingresa para ver tus pedidos</h2><p>Tus reservas se guardan en tu cuenta.</p><a class="btn btn--cafe" href="#/ingresar?next=pedidos">Ingresar</a></div></div>`, "Mis pedidos");
    }
    mount(`<div class="wrap">${head}<p class="hint" role="status" id="ordersStatus">Cargando tus pedidos…</p><div id="ordersList"></div></div>`, "Mis pedidos");
    let list;
    try { list = await DB.pedidos(); }
    catch (e) {
      console.error(e);
      if ($("#ordersStatus")) $("#ordersStatus").innerHTML = `No pudimos cargar tus pedidos. <a class="link" href="#/pedidos" data-action="reloadOrders">Reintentar</a>`;
      return;
    }
    if (!$("#ordersList")) return; // cambió de pantalla
    $("#ordersStatus").textContent = list.length ? `Tienes ${plural(list.length, "pedido")}.` : "";
    $("#ordersList").innerHTML = list.length ? `<ul class="orders">${list.map(o => {
      const n = o.pedido_items.reduce((s, i) => s + i.cantidad, 0);
      const hist = [...o.pedido_estados].sort((a, b) => a.cambiado_en.localeCompare(b.cambiado_en));
      return `<li class="order">
        <div class="order__head"><h2>Pedido ${esc(o.numero)}</h2><span class="badge badge--${o.estado}">${ESTADO[o.estado]}</span><span>${fmtShort(new Date(o.creado_en))} · <strong>${money(Number(o.total))}</strong></span></div>
        <div class="pics">${o.pedido_items.map(i => { const p = byId(i.producto_id); return p ? `<a href="#/producto/${p.id}"><img src="${p.img}" alt="${esc(i.nombre_producto)}${i.talla ? `, talla ${esc(i.talla)}` : ""}, ${plural(i.cantidad, "unidad", "unidades")}"></a>` : ""; }).join("")}</div>
        <p class="hint">${plural(n, "producto")}${o.codigos_descuento ? ` · código ${esc(o.codigos_descuento.codigo)} (−${money(Number(o.descuento))})` : ""} · pagas al retirar · ${esc(localTexto())}</p>
        ${o.estado === "reservado" ? `<p class="hint"><strong>Retira hasta el ${esc(limiteTexto(o.fecha_limite))}.</strong></p>` : ""}
        <ol class="timeline" aria-label="Historial del pedido ${esc(o.numero)}">${hist.map(h => `<li class="timeline__item timeline__item--${h.estado}">${ESTADO[h.estado]} · ${fmtShort(new Date(h.cambiado_en))}</li>`).join("")}</ol>
        ${o.estado === "reservado" ? `<button type="button" class="btn btn--borde btn--sm" data-action="cancelOrder" data-oid="${o.id}" data-num="${esc(o.numero)}">Cancelar reserva</button>` : ""}
      </li>`;
    }).join("")}</ul>`
      : `<div class="empty">${emptyArt("bag")}<h2>Todavía no tienes pedidos</h2><p>Cuando reserves, tus pedidos aparecerán aquí.</p><a class="btn btn--cafe" href="#/catalogo">Ver catálogo</a></div>`;

    app.onclickDetail = async a => {
      if (a.dataset.action !== "cancelOrder") return;
      if (!confirm(`¿Cancelar la reserva ${a.dataset.num}? Las gorras vuelven a estar disponibles para otras personas.`)) return;
      a.disabled = true; a.textContent = "Cancelando…";
      try { await DB.cancelarReserva(Number(a.dataset.oid)); toast(`Cancelaste la reserva ${a.dataset.num}`); viewOrders(); }
      catch (e) { a.disabled = false; a.textContent = "Cancelar reserva"; dbError(e, "No pudimos cancelar la reserva. Intenta de nuevo."); }
    };
  }

  /* ---------- Información ---------- */
  // Función: el local llega de la base después de cargar la página
  const INFO = () => ({
    ayuda: ["Ayuda", `<h2>Preguntas frecuentes</h2>
      <dl class="faq">
        <dt>¿Cómo compro?</dt><dd>Elige una gorra, presiona «Agregar al carrito», abre el carrito y presiona «Reservar pedido». Para reservar necesitas una cuenta (puedes crearla o entrar con Google). Te enviamos la confirmación a tu correo y luego retiras y pagas en el local.</dd>
        <dt>¿Qué talla es?</dt><dd>Las gorras cerradas (59FIFTY y 39THIRTY) se venden por talla: la eliges en la página de la gorra. Las demás son talla única con ajuste atrás. Mira la <a class="link" href="#/guia?s=tallas">guía de tallas</a> para medir tu cabeza.</dd>
        <dt>¿Puedo cambiar mi pedido?</dt><dd>Antes de confirmar, sí: vuelve al carrito y cambia las cantidades. Después, escríbenos a isaacquinga2006@gmail.com.</dd>
        <dt>¿Hacen envíos?</dt><dd>No. Todas las compras se retiran y se pagan en el local.</dd>
        <dt>¿Se guarda mi carrito?</dt><dd>Sí. Con tu cuenta, tu carrito y tus favoritas se guardan y los ves en cualquier dispositivo. Si todavía no ingresas, el carrito queda guardado en este navegador y se suma a tu cuenta al ingresar.</dd>
        <dt>¿Puedo cancelar una reserva?</dt><dd>Sí. Ingresa a tu cuenta, abre «Mis pedidos» y presiona «Cancelar reserva».</dd>
      </dl>`],
    retiro: ["Retiro en el local", `<p>No hacemos envíos. Reservas en línea y retiras en <strong>${esc(localTexto())}</strong>.</p>
      <ul><li><strong>Horario:</strong> ${esc(STORE.local.horario)}.</li><li>Te avisamos por correo cuando tu pedido está listo.</li><li>Al retirar, das tu número de pedido y tu nombre, y pagas ahí.</li><li><strong>Si no te acercas en máximo 3 días después de tu reservación, se cancelará.</strong></li></ul>`],
    devoluciones: ["Devoluciones", "<p>Tienes 15 días desde que retiras tu pedido para devolverlo en el local. La gorra debe estar sin usar y con sus etiquetas.</p>"],
    contacto: ["Contacto", "<p>Correo: <strong>isaacquinga2006@gmail.com</strong></p><p>Horario: lunes a sábado, de 9:00 a 18:00.</p>"],
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
  });
  function viewInfo(r) {
    const i = INFO()[r.arg];
    if (!i) return viewNotFound();
    mount(`<div class="wrap">${crumbs([["Catálogo", "#/catalogo"], [i[0]]])}<article class="prose"><h1>${i[0]}</h1>${i[1]}</article></div>`, i[0]);
  }

  function viewNotFound() {
    mount(`<div class="wrap section"><div class="empty">${emptyArt("question")}<h1>No encontramos esta página</h1><p>Puede que el enlace esté mal escrito o que el pedido ya no exista.</p><a class="btn btn--cafe" href="#/catalogo">Ir al catálogo</a></div></div>`, "No encontrada");
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
        const on = toggleFav(id);
        if (on === null) break;
        paintFav(id, on);
        if (on) { a.classList.remove("beat"); void a.offsetWidth; a.classList.add("beat"); }
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
        toast("Quitaste todos los filtros", null, "info");
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
      case "qty": setQty(id, (state.cart[id] || 0) + Number(a.dataset.d)); viewCart(); announce(`${lineName(id)}: ${plural(state.cart[id], "unidad", "unidades")}. Total ${money(totals().total)}`); break;
      case "notify": toggleAviso(id, a); break;
      case "megamenu": toggleMega(a); break;
      case "remove": removeItem(id); break;
      case "pay": go(state.user ? "#/checkout" : "#/ingresar?next=checkout"); break;
      case "reveal": {
        const input = $("#" + a.dataset.for), show = input.type === "password";
        input.type = show ? "text" : "password";
        a.setAttribute("aria-pressed", show); a.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña"); a.title = a.getAttribute("aria-label");
        break;
      }
      case "focusField": e.preventDefault(); $("#" + a.dataset.target)?.focus(); break;
      case "toReviews": e.preventDefault(); $("#revTitle")?.scrollIntoView({ block: "start" }); $("#revTitle")?.setAttribute("tabindex", "-1"); $("#revTitle")?.focus({ preventScroll: true }); break;
      case "retryReviews": app.retryReviews && app.retryReviews(); break;
      case "reloadOrders": e.preventDefault(); viewOrders(); break;
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

  let ready = false; // no pintar pantallas hasta tener el catálogo de la base
  window.addEventListener("hashchange", () => { app.onclickDetail = null; if (ready) render(); });
  // Carrito sin sesión al día entre pestañas (con sesión vive en la base)
  window.addEventListener("storage", e => {
    if (e.key === "nqc_cart" && !state.user) { state.cart = load("cart", {}); render(); }
  });

  /* ---------- Barra de anuncios (prueba) ---------- */
  // Rota cada 5 s; se detiene con el botón de pausa, con el mouse encima o con el foco dentro.
  const ANUNCIOS = [
    () => `Reserva en línea y retira en el local · <strong>sin costo de envío</strong>`,
    () => `<strong>10 % de descuento</strong> con el código CROWN10`,
    () => `${PRODUCTS.filter(p => p.antes).length} gorras en oferta · <a href="#/catalogo?f=oferta">Ver ofertas</a>`,
    () => `¿No sabes tu talla? <a href="#/guia?s=tallas">Mira la guía de tallas</a>`
  ];
  let anuncio = 0, anuncioTimer = null, anuncioPausa = false, anuncioHover = false;
  function showAnuncio(i) {
    const m = $("#announceMsg");
    anuncio = (i + ANUNCIOS.length) % ANUNCIOS.length;
    m.classList.remove("is-in"); void m.offsetWidth; m.classList.add("is-in");
    m.innerHTML = ANUNCIOS[anuncio]();
  }
  function tickAnuncios() {
    clearInterval(anuncioTimer);
    if (!anuncioPausa && !anuncioHover) anuncioTimer = setInterval(() => showAnuncio(anuncio + 1), 5000);
  }
  function initAnuncios() {
    const bar = $("#announce"), btn = $("#announcePause");
    showAnuncio(0); tickAnuncios();
    btn.addEventListener("click", () => {
      anuncioPausa = !anuncioPausa;
      btn.setAttribute("aria-pressed", anuncioPausa);
      btn.textContent = anuncioPausa ? "▶" : "❚❚";
      btn.setAttribute("aria-label", anuncioPausa ? "Reanudar anuncios" : "Pausar anuncios"); btn.title = btn.getAttribute("aria-label");
      tickAnuncios();
    });
    bar.addEventListener("mouseenter", () => { anuncioHover = true; tickAnuncios(); });
    bar.addEventListener("mouseleave", () => { anuncioHover = false; tickAnuncios(); });
    bar.addEventListener("focusin", () => { anuncioHover = true; tickAnuncios(); });
    bar.addEventListener("focusout", () => { anuncioHover = false; tickAnuncios(); });
  }

  /* ---------- Inicio: catálogo, local y sesión desde la base ---------- */
  async function init() {
    // Tarjetas grises con brillo mientras llega el catálogo
    app.innerHTML = `<div class="wrap section"><p class="sr-only" role="status">Cargando la tienda…</p>
      <div class="grid" aria-hidden="true">${'<div class="skel"><span></span><span></span><span></span><span></span></div>'.repeat(8)}</div></div>`;
    try {
      const [productos, local, ratings, tipos, tallas] = await Promise.all([DB.productos(), DB.local(), DB.calificaciones(), DB.tipos(), DB.tallas()]);
      if (productos.length) PRODUCTS = productos;
      TIPOS = tipos; TALLAS = tallas;
      if (local) STORE.local = local;
      state.ratings = ratings;
      await loadUser(await DB.sesion());
    } catch (e) {
      console.error(e);
      app.innerHTML = `<div class="wrap section"><div class="empty">${emptyArt("alert")}<h1 tabindex="-1">No pudimos conectar con la tienda</h1><p>Revisa tu conexión a internet e intenta de nuevo.</p><button type="button" class="btn btn--cafe" id="retryInit">Reintentar</button></div></div>`;
      $("h1", app).focus();
      $("#retryInit").addEventListener("click", init);
      return;
    }
    ready = true;
    buildMega();
    initAnuncios();
    // Vuelta desde Google: ir a donde estaba (p. ej. la reserva) y saludar, o avisar si Google falló
    let next = null;
    try { next = sessionStorage.getItem("nqc_next"); sessionStorage.removeItem("nqc_next"); } catch { /* sin almacenamiento */ }
    const oauthError = DB.enlace.error;
    // Vuelta desde el enlace de confirmación del correo: no viene de Google ni del cambio de contraseña,
    // y si abrió sesión, la confirmación es de hace pocos minutos
    const sesion = state.user ? await DB.sesion() : null;
    const recien = !sesion || Date.now() - new Date(sesion.user.email_confirmed_at || 0) < 15 * 60 * 1000;
    const confirmo = !next && parseHash().name !== "nueva-clave" && recien && (DB.enlace.code || oauthError);
    if (oauthError || next || DB.enlace.code) {
      const hash = next && state.user ? "#/" + next : confirmo && !state.user && !oauthError ? "#/ingresar" : location.hash;
      history.replaceState(null, "", location.pathname + hash);
    }
    render();
    if (confirmo && oauthError) toast("El enlace de confirmación ya venció o ya se usó. Ingresa, y si hace falta te reenviamos otro.", null, "error");
    else if (confirmo && state.user) toast(`¡Correo confirmado! Bienvenido, ${state.user.nombre.split(" ")[0]}.`);
    else if (confirmo) toast("¡Correo confirmado! Ahora ingresa con tu correo y contraseña.");
    else if (oauthError) toast("No pudimos ingresar con Google. Intenta de nuevo o usa tu correo y contraseña.", null, "error");
    else if (next && state.user) toast(`Hola, ${state.user.nombre.split(" ")[0]}. Ingresaste con Google.`);
  }

  // Avisos de Supabase Auth: sesión cerrada en otra pestaña o enlace para cambiar la contraseña.
  // Se usa setTimeout para no llamar a la base dentro del aviso (Supabase lo recomienda).
  DB.sb.auth.onAuthStateChange((event, session) => setTimeout(async () => {
    if (event === "SIGNED_OUT" && state.user) { state.user = null; state.favs = []; state.cart = {}; persist(); if (ready) render(); }
    if (event === "PASSWORD_RECOVERY") { try { await loadUser(session); } catch (e) { console.error(e); } go("#/nueva-clave"); }
  }, 0));

  init();
})();
