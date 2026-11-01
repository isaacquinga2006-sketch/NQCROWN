// NQ Crown · avisa por Gmail que una gorra volvió (estaba agotada) o que llegaron más unidades.
// La llama la base (trigger productos_vuelve_stock) con { aviso_id, agotada }. Lee todo lo demás de la base
// y marca el aviso como enviado, así cada persona recibe un solo correo.
// Usa los mismos secretos que notificar-pedido: GMAIL_USER y GMAIL_APP_PASSWORD.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TIENDA = "https://isaacquinga2006-sketch.github.io/NQCROWN/";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const money = (n: unknown) => "$" + Number(n).toFixed(2);
// Asunto con tildes codificado en una sola línea (RFC 2047, base64). denomailer lo partía en
// varias líneas y Gmail mostraba el correo roto, con las cabeceras y el HTML como texto.
const asuntoMime = (s: string) => /^[ -~]*$/.test(s) ? s
  : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(s)))}?=`;

type Producto = { id: number; nombre: string; precio: number; stock: number; producto_imagenes: { url: string; orden: number }[] };

// Textos según si la gorra estaba agotada (volvió) o solo se repuso (llegaron más)
const textos = (agotada: boolean, p: Producto) => agotada ? {
  asunto: `Volvió ${p.nombre} · NQ Crown`,
  titulo: "¡Volvió la gorra que esperabas!",
  parrafo: `<strong>${esc(p.nombre)}</strong> ya está disponible otra vez. Resérvala antes de que se agote.`,
  pie: "Recibiste este correo porque pediste que te avisáramos cuando esta gorra volviera. Es un aviso único."
} : {
  asunto: `Llegaron más ${p.nombre} · NQ Crown`,
  titulo: "¡Llegaron más unidades!",
  parrafo: `Repusimos <strong>${esc(p.nombre)}</strong>: ahora tenemos ${p.stock} unidades. Ya puedes reservar las que necesitabas.`,
  pie: "Recibiste este correo porque pediste que te avisáramos cuando llegaran más unidades de esta gorra. Es un aviso único."
};
// Las fotos propias de la tienda se guardan como «img/…»: el correo necesita la dirección completa
const fotoURL = (url?: string) => !url ? "" : /^https?:\/\//.test(url) ? url : TIENDA + url.replace(/^\//, "");

function correoHTML(nombre: string, p: Producto, agotada: boolean) {
  const t = textos(agotada, p);
  const foto = fotoURL([...p.producto_imagenes].sort((a, b) => a.orden - b.orden)[0]?.url);
  const enlace = `${TIENDA}#/producto/${p.id}`;
  return `<!doctype html><html lang="es"><body style="margin:0;background:#F3ECE0;font-family:Arial,Helvetica,sans-serif;color:#241812">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3ECE0;padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #B59F7E;border-radius:12px;overflow:hidden">
      <tr><td style="background:#4A2E20;color:#E6DBC8;padding:18px 24px;font-size:20px;font-weight:bold">NQ Crown</td></tr>
      <tr><td style="padding:24px">
        <h1 style="margin:0 0 12px;font-size:24px;color:#4A2E20">${t.titulo}</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.5">Hola, ${esc(nombre)}. ${t.parrafo}</p>
        ${foto ? `<p style="margin:0 0 16px;text-align:center"><img src="${esc(foto)}" alt="${esc(p.nombre)}" width="240" style="max-width:100%;height:auto"></p>` : ""}
        <p style="margin:0 0 4px;font-size:18px;font-weight:bold">${money(p.precio)}</p>
        <p style="margin:24px 0 0"><a href="${enlace}" style="display:inline-block;background:#4A2E20;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:22px">Ver la gorra</a></p>
      </td></tr>
      <tr><td style="background:#000000;color:#B59F7E;padding:14px 24px;font-size:12px">${t.pie}</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

Deno.serve(async req => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  let id: number, agotada = true;
  try { const b = await req.json(); id = b.aviso_id; agotada = b.agotada !== false; } catch { return json({ error: "Cuerpo inválido" }, 400); }
  if (!Number.isInteger(id)) return json({ error: "Falta aviso_id" }, 400);

  // Toma el aviso solo si sigue pendiente: así cada correo sale una sola vez
  const { data: a } = await sb.from("avisos_stock").update({ notificado_en: new Date().toISOString() })
    .eq("id", id).is("notificado_en", null).select("id, correo, usuario_id, producto_id").maybeSingle();
  if (!a) return json({ ok: true, omitido: true });

  const [{ data: p }, { data: perfil }] = await Promise.all([
    sb.from("productos").select("id, nombre, precio, stock, producto_imagenes(url, orden)").eq("id", a.producto_id).single(),
    sb.from("perfiles").select("nombre").eq("id", a.usuario_id).maybeSingle()
  ]);
  const devolver = () => sb.from("avisos_stock").update({ notificado_en: null }).eq("id", a.id);
  if (!p || p.stock <= 0) { await devolver(); return json({ ok: true, sinStock: true }); }

  const user = Deno.env.get("GMAIL_USER"), pass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!user || !pass) { await devolver(); return json({ error: "Correo no configurado" }, 500); }

  try {
    const client = new SMTPClient({
      connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: user, password: pass.replace(/\s/g, "") } }
    });
    const nombre = perfil?.nombre || a.correo.split("@")[0];
    await client.send({
      from: `NQ Crown <${user}>`,
      to: a.correo,
      subject: asuntoMime(textos(agotada, p as Producto).asunto),
      content: `Hola, ${nombre}. ${textos(agotada, p as Producto).parrafo.replace(/<[^>]+>/g, "")} (${money(p.precio)})\nVer la gorra: ${TIENDA}#/producto/${p.id}\n`,
      html: correoHTML(nombre, p as Producto, agotada)
    });
    await client.close();
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    await devolver(); // se reintenta la próxima vez que vuelva el stock
    return json({ error: "No se pudo enviar el correo" }, 502);
  }
});
