// NQ Crown · avisa por Gmail que una gorra agotada volvió a tener stock.
// La llama la base (trigger productos_vuelve_stock) con { aviso_id }. Lee todo lo demás de la base
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

type Producto = { id: number; nombre: string; precio: number; stock: number; producto_imagenes: { url: string; orden: number }[] };

function correoHTML(nombre: string, p: Producto) {
  const foto = [...p.producto_imagenes].sort((a, b) => a.orden - b.orden)[0]?.url;
  const enlace = `${TIENDA}#/producto/${p.id}`;
  return `<!doctype html><html lang="es"><body style="margin:0;background:#F3ECE0;font-family:Arial,Helvetica,sans-serif;color:#241812">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3ECE0;padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #B59F7E;border-radius:12px;overflow:hidden">
      <tr><td style="background:#4A2E20;color:#E6DBC8;padding:18px 24px;font-size:20px;font-weight:bold">NQ Crown</td></tr>
      <tr><td style="padding:24px">
        <h1 style="margin:0 0 12px;font-size:24px;color:#4A2E20">¡Volvió la gorra que esperabas!</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.5">Hola, ${esc(nombre)}. <strong>${esc(p.nombre)}</strong> ya está disponible otra vez. Quedan pocas unidades: resérvala antes de que se agote.</p>
        ${foto ? `<p style="margin:0 0 16px;text-align:center"><img src="${esc(foto)}" alt="${esc(p.nombre)}" width="240" style="max-width:100%;height:auto"></p>` : ""}
        <p style="margin:0 0 4px;font-size:18px;font-weight:bold">${money(p.precio)}</p>
        <p style="margin:24px 0 0"><a href="${enlace}" style="display:inline-block;background:#4A2E20;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:22px">Ver la gorra</a></p>
      </td></tr>
      <tr><td style="background:#000000;color:#B59F7E;padding:14px 24px;font-size:12px">Recibiste este correo porque pediste que te avisáramos cuando esta gorra volviera. Es un aviso único.</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

Deno.serve(async req => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  let id: number;
  try { id = (await req.json()).aviso_id; } catch { return json({ error: "Cuerpo inválido" }, 400); }
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
      subject: `Volvió ${p.nombre} · NQ Crown`,
      content: `Hola, ${nombre}. ${p.nombre} ya está disponible otra vez (${money(p.precio)}).\nVer la gorra: ${TIENDA}#/producto/${p.id}\n`,
      html: correoHTML(nombre, p as Producto)
    });
    await client.close();
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    await devolver(); // se reintenta la próxima vez que vuelva el stock
    return json({ error: "No se pudo enviar el correo" }, 502);
  }
});
