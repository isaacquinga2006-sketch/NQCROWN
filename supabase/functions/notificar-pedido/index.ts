// NQ Crown · envía por Gmail el correo de cada cambio de un pedido (reservado, retirado o cancelado).
// La llama la base (trigger en pedido_estados) con { notificacion_id }. Lee todo lo demás de la base,
// así nadie puede mandar correos con datos inventados, y cada notificación se envía una sola vez.
// Secretos que hay que poner en Supabase (Edge Functions → Secrets): GMAIL_USER y GMAIL_APP_PASSWORD.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
// nodemailer arma bien las cabeceras con tildes (denomailer partía el asunto y Gmail mostraba el correo roto)
import nodemailer from "npm:nodemailer@6.9.16";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TIENDA = "https://isaacquinga2006-sketch.github.io/NQCROWN/";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const money = (n: unknown) => "$" + Number(n).toFixed(2);
const fecha = (iso: string) => new Date(iso + "T12:00:00Z")
  .toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

type Pedido = {
  numero: string; nombre: string; apellido: string; correo: string;
  subtotal: number; descuento: number; total: number; fecha_limite: string;
  codigos_descuento: { codigo: string; porcentaje: number } | null;
  locales: { nombre: string; direccion: string; horario: string; metodos_pago: string[] } | null;
  pedido_items: { nombre_producto: string; precio_unitario: number; cantidad: number; talla: string | null }[];
};

// Asunto, título y párrafo de cada tipo de aviso
function textos(tipo: string, p: Pedido) {
  const limite = fecha(p.fecha_limite);
  if (tipo === "retirado") return {
    asunto: `Gracias por retirar tu pedido ${p.numero}`,
    titulo: "¡Gracias por tu compra!",
    parrafo: `Retiraste tu pedido <strong>${esc(p.numero)}</strong> en el local. Tienes 15 días para devolverlo si la gorra está sin usar y con sus etiquetas.`
  };
  if (tipo === "cancelado") return {
    asunto: `Tu reserva ${p.numero} fue cancelada`,
    titulo: "Tu reserva fue cancelada",
    parrafo: `La reserva <strong>${esc(p.numero)}</strong> se canceló y las gorras volvieron a estar disponibles. Si fue un error, puedes reservar de nuevo en la tienda.`
  };
  return {
    asunto: `Pedido reservado ${p.numero} · retira hasta el ${limite}`,
    titulo: "¡Pedido reservado!",
    parrafo: `Tu pedido <strong>${esc(p.numero)}</strong> ya está apartado para ti. Puedes retirarlo desde ahora y hasta el <strong>${esc(limite)}</strong>: muestra este correo o da tu número de pedido en el local.`
  };
}

// Mismo contenido que la pantalla de confirmación de la tienda: resumen, retiro, fecha límite, pago y total
function correoHTML(tipo: string, p: Pedido) {
  const t = textos(tipo, p);
  const local = p.locales;
  const limite = fecha(p.fecha_limite);
  const reservado = tipo === "reservado";
  const fila = (k: string, v: string, extra = "") => `<tr>
      <td style="padding:9px 0;color:#241812;vertical-align:top">${k}</td>
      <td style="padding:9px 0;text-align:right;vertical-align:top">${v}${extra ? `<br><span style="font-size:13px;color:#6b5a4e">${extra}</span>` : ""}</td></tr>`;
  const gorras = p.pedido_items.map(i => `<tr>
      <td style="padding:7px 0;border-top:1px solid #E6DBC8;font-size:14px">${esc(i.nombre_producto)}${i.talla ? ` · talla ${esc(i.talla)}` : ""} × ${i.cantidad}</td>
      <td style="padding:7px 0;border-top:1px solid #E6DBC8;font-size:14px;text-align:right">${money(i.precio_unitario * i.cantidad)}</td></tr>`).join("");
  const desc = Number(p.descuento) > 0
    ? fila(`Descuento${p.codigos_descuento ? ` (${esc(p.codigos_descuento.codigo)})` : ""}`, `<span style="color:#2F6B4F">−${money(p.descuento)}</span>`) : "";
  return `<!doctype html><html lang="es"><body style="margin:0;background:#F3ECE0;font-family:Arial,Helvetica,sans-serif;color:#241812">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3ECE0;padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
      <tr><td style="background:#4A2E20;border-radius:12px 12px 0 0;padding:14px 24px">
        <img src="${TIENDA}img/logo-nq-crown.png" alt="" width="32" height="32" style="vertical-align:middle;border-radius:6px">
        <span style="vertical-align:middle;color:#E6DBC8;font-size:20px;font-weight:bold;margin-left:8px">NQ Crown</span></td></tr>
      <tr><td style="padding:28px 24px 8px;text-align:center;background:#F3ECE0">
        <div style="font-size:44px;line-height:1">${reservado ? "👑" : tipo === "retirado" ? "🧢" : "↩"}</div>
        <h1 style="margin:12px 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:30px;color:#4A2E20">${t.titulo}</h1>
        <p style="margin:0 auto;max-width:460px;font-size:15px;line-height:1.55;color:#4a3a30">Hola, ${esc(p.nombre)}. ${t.parrafo}</p>
      </td></tr>
      <tr><td style="padding:18px 0 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1.5px solid #B59F7E;border-radius:14px">
          <tr><td style="padding:22px 24px">
            <h2 style="margin:0 0 8px;font-size:19px;color:#241812">Resumen</h2>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">
              ${fila("Número de pedido", `<strong>${esc(p.numero)}</strong>`)}
              ${fila("A nombre de", esc(`${p.nombre} ${p.apellido}`))}
              ${local ? fila("Retiro", esc(local.nombre), esc([local.direccion, local.horario].filter(Boolean).join(" · "))) : ""}
              ${reservado ? fila("Retira hasta el", esc(limite)) : ""}
              ${fila("Pago", "Al retirar, en el local", esc((local?.metodos_pago || []).join(" · ")))}
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${gorras}</table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;margin-top:4px">
              ${fila("Subtotal", money(p.subtotal))}
              ${desc}
              <tr><td style="padding:14px 0 0;border-top:2px solid #B59F7E;font-size:21px;font-weight:bold">Total a pagar</td>
                  <td style="padding:14px 0 0;border-top:2px solid #B59F7E;font-size:21px;font-weight:bold;text-align:right">${money(p.total)}</td></tr>
            </table>
            ${reservado ? `<p style="margin:18px 0 0;padding:12px 14px;background:#E6DBC8;border-left:5px solid #6B3FA0;border-radius:8px;font-size:14px;line-height:1.5">
              Lleva tu número de pedido <strong>${esc(p.numero)}</strong> al local. Si no te acercas hasta el ${esc(limite)}, tu reserva se cancelará.</p>` : ""}
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:22px 0;text-align:center">
        <a href="${TIENDA}catalogo.html" style="display:inline-block;margin:4px;background:#4A2E20;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:22px">Seguir comprando</a>
        <a href="${TIENDA}pedidos.html" style="display:inline-block;margin:4px;background:#ffffff;color:#4A2E20;border:1.5px solid #4A2E20;text-decoration:none;font-weight:bold;padding:11px 22px;border-radius:22px">Ver mis pedidos</a>
      </td></tr>
      <tr><td style="background:#000000;color:#B59F7E;padding:14px 24px;font-size:12px;border-radius:0 0 12px 12px">Recibiste este correo porque hiciste una reserva en NQ Crown con ${esc(p.correo)}.</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function correoTexto(tipo: string, p: Pedido) {
  const t = textos(tipo, p);
  const l = p.locales;
  const items = p.pedido_items.map(i => `- ${i.nombre_producto}${i.talla ? ` (talla ${i.talla})` : ""} x ${i.cantidad}: ${money(i.precio_unitario * i.cantidad)}`).join("\n");
  return `${t.titulo}\n\nHola, ${p.nombre}. ${t.parrafo.replace(/<[^>]+>/g, "")}\n\n`
    + `Número de pedido: ${p.numero}\nA nombre de: ${p.nombre} ${p.apellido}\n`
    + (l ? `Retiro: ${[l.nombre, l.direccion, l.horario].filter(Boolean).join(" · ")}\n` : "")
    + (tipo === "reservado" ? `Retira hasta el: ${fecha(p.fecha_limite)}\n` : "")
    + `Pago: al retirar, en el local${l?.metodos_pago?.length ? ` (${l.metodos_pago.join(", ")})` : ""}\n\n${items}\nSubtotal: ${money(p.subtotal)}\n`
    + (Number(p.descuento) > 0 ? `Descuento: -${money(p.descuento)}\n` : "")
    + `Total a pagar: ${money(p.total)}\n\nVer mis pedidos: ${TIENDA}pedidos.html\n`;
}

const marcar = (id: number, estado: string, detalle: string | null = null) =>
  sb.from("notificaciones").update({ estado, detalle, enviado_en: estado === "enviado" ? new Date().toISOString() : null }).eq("id", id);

Deno.serve(async req => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  let id: number;
  try { id = (await req.json()).notificacion_id; } catch { return json({ error: "Cuerpo inválido" }, 400); }
  if (!Number.isInteger(id)) return json({ error: "Falta notificacion_id" }, 400);

  // Toma la notificación solo si sigue pendiente: así cada correo sale una sola vez
  const { data: n } = await sb.from("notificaciones").update({ estado: "enviando" })
    .eq("id", id).eq("estado", "pendiente").select("id, tipo, correo, pedido_id").maybeSingle();
  if (!n) return json({ ok: true, omitida: true });

  const { data: p, error } = await sb.from("pedidos")
    .select("numero, nombre, apellido, correo, subtotal, descuento, total, fecha_limite, codigos_descuento(codigo, porcentaje), locales(nombre, direccion, horario, metodos_pago), pedido_items(nombre_producto, precio_unitario, cantidad, talla)")
    .eq("id", n.pedido_id).single();
  if (error || !p) { await marcar(n.id, "error", "No se encontró el pedido"); return json({ error: "Pedido no encontrado" }, 404); }

  const user = Deno.env.get("GMAIL_USER"), pass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!user || !pass) {
    await marcar(n.id, "error", "Faltan los secretos GMAIL_USER y GMAIL_APP_PASSWORD en Supabase");
    return json({ error: "Correo no configurado" }, 500);
  }

  try {
    const gmail = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass: pass.replace(/\s/g, "") }
    });
    await gmail.sendMail({
      from: `NQ Crown <${user}>`,
      to: n.correo,
      subject: textos(n.tipo, p as Pedido).asunto,
      text: correoTexto(n.tipo, p as Pedido),
      html: correoHTML(n.tipo, p as Pedido)
    });
    await marcar(n.id, "enviado");
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    await marcar(n.id, "error", String(e).slice(0, 500));
    return json({ error: "No se pudo enviar el correo" }, 502);
  }
});
