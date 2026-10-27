// NQ Crown · envía por Gmail el correo de cada cambio de un pedido (reservado, retirado o cancelado).
// La llama la base (trigger en pedido_estados) con { notificacion_id }. Lee todo lo demás de la base,
// así nadie puede mandar correos con datos inventados, y cada notificación se envía una sola vez.
// Secretos que hay que poner en Supabase (Edge Functions → Secrets): GMAIL_USER y GMAIL_APP_PASSWORD.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TIENDA = "https://isaacquinga2006-sketch.github.io/NQCROWN/";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const money = (n: unknown) => "$" + Number(n).toFixed(2);
const fecha = (iso: string) => new Date(iso + "T12:00:00Z")
  .toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

type Pedido = {
  numero: string; nombre: string; subtotal: number; descuento: number; total: number; fecha_limite: string;
  codigos_descuento: { codigo: string; porcentaje: number } | null;
  locales: { nombre: string; direccion: string; horario: string } | null;
  pedido_items: { nombre_producto: string; precio_unitario: number; cantidad: number }[];
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
    asunto: `Tu reserva ${p.numero} está confirmada · retira hasta el ${limite}`,
    titulo: "¡Pedido reservado!",
    parrafo: `Tu pedido <strong>${esc(p.numero)}</strong> está reservado. Retíralo y págalo en el local <strong>hasta el ${esc(limite)}</strong>; si no te acercas hasta esa fecha, la reserva se cancelará.`
  };
}

function correoHTML(tipo: string, p: Pedido) {
  const t = textos(tipo, p);
  const local = p.locales;
  const filas = p.pedido_items.map(i => `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #E6DBC8">${esc(i.nombre_producto)} × ${i.cantidad}</td>
      <td style="padding:8px 0;border-bottom:1px solid #E6DBC8;text-align:right">${money(i.precio_unitario * i.cantidad)}</td></tr>`).join("");
  const desc = Number(p.descuento) > 0
    ? `<tr><td style="padding:4px 0;color:#2F6B4F">Descuento${p.codigos_descuento ? ` (${esc(p.codigos_descuento.codigo)}, ${p.codigos_descuento.porcentaje} %)` : ""}</td><td style="padding:4px 0;text-align:right;color:#2F6B4F">−${money(p.descuento)}</td></tr>` : "";
  return `<!doctype html><html lang="es"><body style="margin:0;background:#F3ECE0;font-family:Arial,Helvetica,sans-serif;color:#241812">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3ECE0;padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #B59F7E;border-radius:12px;overflow:hidden">
      <tr><td style="background:#4A2E20;color:#E6DBC8;padding:18px 24px;font-size:20px;font-weight:bold">NQ Crown</td></tr>
      <tr><td style="padding:24px">
        <h1 style="margin:0 0 12px;font-size:24px;color:#4A2E20">${t.titulo}</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.5">Hola, ${esc(p.nombre)}. ${t.parrafo}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">
          ${filas}
          <tr><td style="padding:8px 0 4px">Subtotal</td><td style="padding:8px 0 4px;text-align:right">${money(p.subtotal)}</td></tr>
          ${desc}
          <tr><td style="padding:10px 0;font-size:18px;font-weight:bold;border-top:2px solid #B59F7E">Total a pagar en el local</td>
              <td style="padding:10px 0;font-size:18px;font-weight:bold;border-top:2px solid #B59F7E;text-align:right">${money(p.total)}</td></tr>
        </table>
        ${local ? `<p style="margin:16px 0 0;padding:12px 14px;background:#E6DBC8;border-left:5px solid #6B3FA0;border-radius:8px;font-size:14px;line-height:1.5">
          <strong>Retiro:</strong> ${esc([local.nombre, local.direccion].filter(Boolean).join(" · "))}<br>${esc(local.horario)}<br>Pagas al retirar. Lleva tu número de pedido <strong>${esc(p.numero)}</strong>.</p>` : ""}
        <p style="margin:24px 0 0"><a href="${TIENDA}#/pedidos" style="display:inline-block;background:#4A2E20;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:22px">Ver mis pedidos</a></p>
      </td></tr>
      <tr><td style="background:#000000;color:#B59F7E;padding:14px 24px;font-size:12px">Recibiste este correo porque hiciste una reserva en NQ Crown.</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function correoTexto(tipo: string, p: Pedido) {
  const t = textos(tipo, p);
  const items = p.pedido_items.map(i => `- ${i.nombre_producto} x ${i.cantidad}: ${money(i.precio_unitario * i.cantidad)}`).join("\n");
  return `${t.titulo}\n\nHola, ${p.nombre}. ${t.parrafo.replace(/<[^>]+>/g, "")}\n\n${items}\nSubtotal: ${money(p.subtotal)}\n`
    + (Number(p.descuento) > 0 ? `Descuento: -${money(p.descuento)}\n` : "")
    + `Total a pagar en el local: ${money(p.total)}\n\nVer mis pedidos: ${TIENDA}#/pedidos\n`;
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
    .select("numero, nombre, subtotal, descuento, total, fecha_limite, codigos_descuento(codigo, porcentaje), locales(nombre, direccion, horario), pedido_items(nombre_producto, precio_unitario, cantidad)")
    .eq("id", n.pedido_id).single();
  if (error || !p) { await marcar(n.id, "error", "No se encontró el pedido"); return json({ error: "Pedido no encontrado" }, 404); }

  const user = Deno.env.get("GMAIL_USER"), pass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!user || !pass) {
    await marcar(n.id, "error", "Faltan los secretos GMAIL_USER y GMAIL_APP_PASSWORD en Supabase");
    return json({ error: "Correo no configurado" }, 500);
  }

  try {
    const client = new SMTPClient({
      connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: user, password: pass.replace(/\s/g, "") } }
    });
    await client.send({
      from: `NQ Crown <${user}>`,
      to: n.correo,
      subject: textos(n.tipo, p as Pedido).asunto,
      content: correoTexto(n.tipo, p as Pedido),
      html: correoHTML(n.tipo, p as Pedido)
    });
    await client.close();
    await marcar(n.id, "enviado");
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    await marcar(n.id, "error", String(e).slice(0, 500));
    return json({ error: "No se pudo enviar el correo" }, 502);
  }
});
