"""Genera las páginas HTML de la tienda a partir de index.html.

Cada pantalla es su propio archivo (catalogo.html, producto.html, carrito.html…) con su título y
descripción; todas comparten el encabezado, el pie, los estilos y el JavaScript de index.html.
Si cambias el encabezado o el pie en index.html, vuelve a correr:  python scripts/generar-paginas.py
"""
import io, re, pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
PAGINAS = {  # archivo: (título de la pestaña, descripción)
    "catalogo": ("Catálogo", "Catálogo de gorras, viseras y buckets de NQ Crown: filtra por equipo, modelo, color y precio."),
    "producto": ("Gorra", "Detalle de la gorra: fotos, tallas, precio y reseñas."),
    "carrito": ("Carrito", "Tu carrito de NQ Crown."),
    "ingresar": ("Ingresar", "Ingresa o crea tu cuenta de NQ Crown."),
    "checkout": ("Reservar pedido", "Reserva tu pedido para retirarlo y pagarlo en el local."),
    "confirmacion": ("Pedido reservado", "Tu pedido de NQ Crown está reservado."),
    "pedidos": ("Mis pedidos", "Tus reservas en NQ Crown."),
    "perfil": ("Mis datos", "Tus datos de cuenta en NQ Crown."),
    "guia": ("Guía de modelos y tallas", "Guía de modelos de gorra y cómo medir tu talla."),
    "nueva-clave": ("Nueva contraseña", "Crea una nueva contraseña para tu cuenta de NQ Crown."),
    "salir": ("Cerrar sesión", "Cerrando tu sesión de NQ Crown."),
    "ayuda": ("Ayuda", "Preguntas frecuentes de NQ Crown."),
    "retiro": ("Retiro en el local", "Cómo retirar y pagar tu pedido en el local."),
    "devoluciones": ("Devoluciones", "Política de devoluciones de NQ Crown."),
    "contacto": ("Contacto", "Contacto de NQ Crown."),
    "accesibilidad": ("Accesibilidad", "Declaración de accesibilidad de NQ Crown."),
}

base = io.open(RAIZ / "index.html", encoding="utf-8").read()
for archivo, (titulo, desc) in PAGINAS.items():
    html = re.sub(r"<title>.*?</title>", f"<title>{titulo} · NQ Crown</title>", base, count=1)
    html = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{desc}">', html, count=1)
    # La página se identifica sola aunque se abra desde otra dirección (por ejemplo, dentro de WAVE)
    html = html.replace('data-pagina="index"', f'data-pagina="{archivo}"', 1)
    html = html.replace("<!-- Página principal: bienvenida -->", f"<!-- Página: {titulo} (generada desde index.html) -->")
    io.open(RAIZ / f"{archivo}.html", "w", encoding="utf-8", newline="\n").write(html)
print(f"{len(PAGINAS)} páginas generadas")
