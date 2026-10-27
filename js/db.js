/* Conexión con la base de datos de NQ Crown (Supabase).
   La clave publicable puede estar en el navegador: lo que cada persona ve o cambia
   lo controla la seguridad por filas (RLS) de la base. */
(() => {
  "use strict";

  const URL = "https://nrvfrmehaudwpikbwznm.supabase.co";
  const KEY = "sb_publishable_WHBScLKZTom79NI6EMwBNg_Y9LEDJdX";

  const sb = window.supabase.createClient(URL, KEY, {
    auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true }
  });

  // Lanza el error de Supabase para que la pantalla lo muestre
  const ok = ({ data, error }) => { if (error) throw error; return data; };

  // Fila de la base → misma forma que usaba data.js
  const toProduct = r => {
    const foto = [...(r.producto_imagenes || [])].sort((a, b) => a.orden - b.orden)[0] || {};
    return {
      id: r.id,
      nombre: r.nombre,
      modelo: r.modelo,
      desc: r.descripcion,
      detalles: r.detalles || [],
      tipo: r.tipos.nombre,
      marca: r.marcas.nombre,
      equipo: r.equipos ? r.equipos.nombre : "Sin equipo",
      color: r.colores.nombre,
      precio: Number(r.precio),
      antes: r.precio_antes ? Number(r.precio_antes) : 0,
      nuevo: r.es_nueva,
      stock: r.stock,
      img: foto.url,
      alt: foto.texto_alt || r.nombre
    };
  };

  // Mensajes de Supabase Auth en español
  const AUTH_MSG = [
    [/invalid login credentials/i, "El correo o la contraseña no son correctos."],
    [/email not confirmed/i, "Todavía no confirmas tu correo. Revisa tu bandeja de entrada."],
    [/already registered|already been registered/i, "Ya existe una cuenta con ese correo. Ingresa con tu contraseña."],
    [/password should be at least/i, "La contraseña debe tener al menos 6 caracteres."],
    [/rate limit|too many/i, "Hiciste demasiados intentos. Espera un minuto y vuelve a probar."],
    [/failed to fetch|network/i, "No pudimos conectar con la tienda. Revisa tu internet."],
    [/provider is not enabled|unsupported provider/i, "El ingreso con Google todavía no está activado. Ingresa con tu correo y contraseña."]
  ];
  const authMessage = e => (AUTH_MSG.find(([re]) => re.test(e?.message || "")) || [, e?.message || "Algo salió mal. Intenta de nuevo."])[1];

  window.DB = {
    sb,
    authMessage,

    /* ---------- Catálogo y tienda ---------- */
    async productos() {
      const rows = ok(await sb.from("productos")
        .select("id, nombre, modelo, descripcion, detalles, precio, precio_antes, es_nueva, stock, tipos(nombre), marcas(nombre), equipos(nombre), colores(nombre), producto_imagenes(url, texto_alt, orden)")
        .order("id"));
      return rows.map(toProduct);
    },
    async local() {
      const rows = ok(await sb.from("locales").select("id, nombre, direccion, enlace_mapa, horario").order("id").limit(1));
      return rows[0] || null;
    },
    async validarCodigo(codigo) {
      return ok(await sb.rpc("validar_codigo", { p_codigo: codigo })); // % o null
    },

    /* ---------- Sesión ---------- */
    async sesion() {
      return ok(await sb.auth.getSession()).session;
    },
    async ingresar(email, password) {
      return ok(await sb.auth.signInWithPassword({ email, password }));
    },
    async crearCuenta(email, password, nombre, apellido) {
      return ok(await sb.auth.signUp({
        email, password,
        options: { data: { nombre, apellido }, emailRedirectTo: location.origin + location.pathname }
      }));
    },
    // Lleva a la pantalla de Google y vuelve a la tienda con la sesión iniciada
    async ingresarConGoogle() {
      // Si Google no está activado en Supabase, avisar aquí en vez de ir a una página de error
      const ajustes = await fetch(URL + "/auth/v1/settings", { headers: { apikey: KEY } }).then(r => r.json());
      if (!ajustes?.external?.google) throw new Error("provider is not enabled");
      ok(await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: "select_account" } }
      }));
    },
    async salir() {
      ok(await sb.auth.signOut());
    },
    async recuperarClave(email) {
      ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
    },
    async cambiarClave(password) {
      ok(await sb.auth.updateUser({ password }));
    },
    async perfil(id) {
      return ok(await sb.from("perfiles").select("nombre, apellido, telefono").eq("id", id).maybeSingle());
    },
    async guardarTelefono(id, telefono) {
      ok(await sb.from("perfiles").update({ telefono }).eq("id", id));
    },
    async actualizarPerfil(id, datos) { // { nombre, apellido, telefono }
      ok(await sb.from("perfiles").update(datos).eq("id", id));
    },

    /* ---------- Favoritos ---------- */
    async favoritos() {
      return ok(await sb.from("favoritos").select("producto_id")).map(r => r.producto_id);
    },
    async marcarFavorito(usuario_id, producto_id, on) {
      ok(on
        ? await sb.from("favoritos").upsert({ usuario_id, producto_id })
        : await sb.from("favoritos").delete().eq("usuario_id", usuario_id).eq("producto_id", producto_id));
    },

    /* ---------- Carrito (solo con sesión; el invitado lo guarda en el navegador) ---------- */
    async carrito() {
      const rows = ok(await sb.from("carrito_items").select("producto_id, cantidad"));
      return Object.fromEntries(rows.map(r => [r.producto_id, r.cantidad]));
    },
    async guardarItem(usuario_id, producto_id, cantidad) {
      ok(cantidad > 0
        ? await sb.from("carrito_items").upsert({ usuario_id, producto_id, cantidad, actualizado_en: new Date().toISOString() })
        : await sb.from("carrito_items").delete().eq("usuario_id", usuario_id).eq("producto_id", producto_id));
    },
    async guardarCarrito(usuario_id, cart) {
      const rows = Object.entries(cart).map(([producto_id, cantidad]) => ({ usuario_id, producto_id: Number(producto_id), cantidad }));
      if (rows.length) ok(await sb.from("carrito_items").upsert(rows));
    },

    /* ---------- Reservas ---------- */
    async reservar(datos, cart, codigo, localId) {
      const items = Object.entries(cart).map(([producto_id, cantidad]) => ({ producto_id: Number(producto_id), cantidad }));
      const rows = ok(await sb.rpc("crear_reserva", {
        p_nombre: datos.nombre, p_apellido: datos.apellido, p_correo: datos.email, p_telefono: datos.telefono,
        p_local_id: localId, p_items: items, p_codigo: codigo || null
      }));
      return rows[0]; // { pedido_id, numero, total, fecha_limite }
    },
    async pedidos() {
      return ok(await sb.from("pedidos")
        .select("id, numero, nombre, apellido, correo, subtotal, descuento, total, estado, fecha_limite, creado_en, codigos_descuento(codigo), pedido_items(producto_id, nombre_producto, precio_unitario, cantidad), pedido_estados(estado, cambiado_en)")
        .order("creado_en", { ascending: false }));
    },
    async cancelarReserva(pedidoId) {
      ok(await sb.rpc("cancelar_reserva", { p_pedido_id: pedidoId }));
    },

    /* ---------- Reseñas ---------- */
    async resenas(productoId) {
      return ok(await sb.from("resenas").select("id, usuario_id, autor, calificacion, comentario, creado_en")
        .eq("producto_id", productoId).order("creado_en", { ascending: false }));
    },
    async calificaciones() {
      const rows = ok(await sb.from("productos_calificacion").select("producto_id, promedio, total_resenas"));
      return Object.fromEntries(rows.map(r => [r.producto_id, { promedio: Number(r.promedio) || 0, total: r.total_resenas }]));
    },
    async guardarResena(usuario_id, producto_id, calificacion, comentario) {
      ok(await sb.from("resenas").upsert({ usuario_id, producto_id, calificacion, comentario }, { onConflict: "producto_id,usuario_id" }));
    },
    async borrarResena(id) {
      ok(await sb.from("resenas").delete().eq("id", id));
    }
  };
})();
