/* Catálogo de NQ Crown. Datos de 47 Brand y New Era (oct. 2026), ver Notas/07.
   precio y antes en USD; antes > 0 significa que está en oferta. */
window.PRODUCTS = [
  { id: 1, alt: "Gorra café de seis paneles con el logo NY de los Yankees bordado en blanco",  nombre: "Yankees 9FORTY Café",         marca: "New Era",  modelo: "9FORTY NY Yankees",                    tipo: "Gorra",        color: "Café",          precio: 30,    antes: 0,  nuevo: true,
    desc: "Gorra clásica de seis paneles con el logo NY bordado en blanco sobre un café profundo. Visera curva y ajuste trasero.",
    detalles: ["Corona estructurada de perfil medio", "Logo bordado en 3D", "Cierre ajustable de tela", "100 % algodón"] },
  { id: 2, alt: "Gorra azul marino desgastada con el logo NY blanco",  nombre: "Yankees Clean Up Navy",       marca: "'47",      modelo: "New York Yankees '47 Clean Up",        tipo: "Gorra",        color: "Azul marino",   precio: 35,    antes: 0,  nuevo: false,
    desc: "La Clean Up de '47: corona suave, lavado vintage y visera curva. Cómoda desde el primer día.",
    detalles: ["Corona sin estructura", "Lavado vintage", "Correa ajustable con hebilla", "100 % algodón"] },
  { id: 3, alt: "Gorra color crema con visera azul marino y la palabra Yankees en letra cursiva",  nombre: "Yankees Assemble Hitch",      marca: "'47",      modelo: "New York Yankees Assemble '47 Hitch",  tipo: "Gorra",        color: "Natural",       precio: 42,    antes: 0,  nuevo: true,
    desc: "Estilo retro de dos tonos con el script de los Yankees al frente. Corona alta y visera azul marino.",
    detalles: ["Corona estructurada alta", "Bordado script al frente", "Cierre snapback", "Algodón y poliéster"] },
  { id: 4, alt: "Gorra color crema con visera azul marino y la palabra Patriots en letra cursiva",  nombre: "Patriots Assemble Hitch",     marca: "'47",      modelo: "New England Patriots Assemble '47 Hitch RF", tipo: "Gorra",  color: "Natural",       precio: 42,    antes: 0,  nuevo: false,
    desc: "La Hitch de dos tonos con el script de los Patriots. Ajuste relajado para usarla todo el día.",
    detalles: ["Ajuste relajado (RF)", "Bordado script al frente", "Cierre snapback", "Algodón y poliéster"] },
  { id: 5, alt: "Gorra trucker café con malla negra atrás y el logo LA de los Dodgers en blanco",  nombre: "Dodgers Carhartt Trucker",    marca: "'47",      modelo: "Los Angeles Dodgers Carhartt '47 Trucker", tipo: "Trucker",  color: "Café",          precio: 40,    antes: 0,  nuevo: false,
    desc: "Colaboración Carhartt × '47: lona resistente al frente, malla atrás y el logo LA de los Dodgers.",
    detalles: ["Frente de lona Carhartt", "Panel trasero de malla", "Cierre snapback", "Etiqueta Carhartt al costado"] },
  { id: 6, alt: "Gorra blanca con el texto NBA Champions 2026 y el logo de los Knicks en naranja y azul",  nombre: "Knicks Campeones Clean Up",   marca: "'47",      modelo: "New York Knicks 2026 NBA Champions '47 Clean Up", tipo: "Gorra", color: "Blanco",   precio: 38,    antes: 0,  nuevo: true,
    desc: "Edición de campeones NBA 2026 de los Knicks. Corona suave blanca con bordado naranja y azul.",
    detalles: ["Edición conmemorativa", "Corona sin estructura", "Correa ajustable", "100 % algodón"] },
  { id: 7, alt: "Gorro tejido azul y blanco con pompón, la palabra Patriots y el logo NE",  nombre: "Patriots Bone Chill (gorro)", marca: "'47",      modelo: "New England Patriots Rivalry Bone Chill '47 Cuff Knit", tipo: "Gorro tejido", color: "Azul", precio: 35, antes: 0, nuevo: false,
    desc: "Gorro tejido con doblez, pompón y el logo NE de los Patriots. Para los días fríos.",
    detalles: ["Tejido con doblez", "Pompón arriba", "Parche bordado", "Acrílico suave"] },
  { id: 8, alt: "Sombrero bucket color arena con logos P de los Phillies y limones estampados",  nombre: "Phillies Bucket Arena",       marca: "'47",      modelo: "Philadelphia Phillies Scatter '47 Bucket", tipo: "Bucket",   color: "Arena",         precio: 38.25, antes: 45, nuevo: false,
    desc: "Bucket hat con estampado Scatter de los Phillies en tono arena. Ligero y fresco.",
    detalles: ["Estampado en toda la tela", "Ala corta alrededor", "Talla única", "100 % algodón"] },
  { id: 9, alt: "Sombrero bucket verde con logos P de los Phillies estampados",  nombre: "Phillies Bucket Edén",        marca: "'47",      modelo: "Philadelphia Phillies Scatter '47 Bucket", tipo: "Bucket",   color: "Verde",         precio: 38.25, antes: 45, nuevo: false,
    desc: "El bucket Scatter de los Phillies en verde Eden, con logos repartidos por toda la tela.",
    detalles: ["Estampado en toda la tela", "Ala corta alrededor", "Talla única", "100 % algodón"] },
  { id: 10, alt: "Sombrero bucket rosado claro con logos LA de los Dodgers estampados", nombre: "Dodgers Bucket Rosa",   marca: "'47",      modelo: "Los Angeles Dodgers Scatter '47 Bucket", tipo: "Bucket",     color: "Rosado", precio: 38.25, antes: 45, nuevo: false,
    desc: "Bucket Scatter de los Dodgers en tono rosado claro. Ideal para verano.",
    detalles: ["Estampado en toda la tela", "Ala corta alrededor", "Talla única", "100 % algodón"] },
  { id: 11, alt: "Gorra azul rey para niño con estampado de los Buffalo Bills", nombre: "Bills Clean Up Niño",         marca: "'47",      modelo: "Buffalo Bills Stomping Ground '47 Kid's Clean Up", tipo: "Gorra", color: "Azul rey",   precio: 32,    antes: 0,  nuevo: false,
    desc: "Clean Up para niños con el estampado Stomping Ground de los Buffalo Bills.",
    detalles: ["Talla infantil", "Corona sin estructura", "Correa ajustable", "100 % algodón"] },
  { id: 12, alt: "Visera negra sin corona con el escudo de los Raiders", nombre: "Raiders Visera Clean Up",     marca: "'47",      modelo: "Las Vegas Raiders '47 Clean Up Visor", tipo: "Visera",       color: "Negro",         precio: 35,    antes: 0,  nuevo: false,
    desc: "Visera Clean Up negra con el escudo de los Raiders. Sin corona, para el sol y el deporte.",
    detalles: ["Visera sin corona", "Escudo bordado", "Correa ajustable", "Algodón"] },
  { id: 13, alt: "Visera negra sin corona con el logo de los Jaguars", nombre: "Jaguars Visera Clean Up",     marca: "'47",      modelo: "Jacksonville Jaguars '47 Clean Up Visor", tipo: "Visera",     color: "Negro",         precio: 35,    antes: 0,  nuevo: false,
    desc: "Visera Clean Up negra con el logo de los Jaguars.",
    detalles: ["Visera sin corona", "Logo bordado", "Correa ajustable", "Algodón"] },
  { id: 14, alt: "Visera negra sin corona con el gráfico Brrr de New Balance", nombre: "New Balance Visera Brrr",     marca: "New Balance × '47", modelo: "New Balance Brrr '47 Visor",     tipo: "Visera",       color: "Negro",         precio: 32,    antes: 0,  nuevo: true,
    desc: "Visera de la colaboración New Balance × '47 con el gráfico Brrr. Ligera y técnica.",
    detalles: ["Visera sin corona", "Gráfico Brrr al frente", "Correa ajustable", "Tela de secado rápido"] }
].map(p => ({
  ...p,
  img: `img/gorras/foto-${String(p.id).padStart(2, "0")}.jpg`,
  // equipo para el filtro: primera palabra del nombre (New Balance no es un equipo)
  equipo: p.marca.startsWith("New Balance") ? "Sin equipo" : p.nombre.split(" ")[0]
}));

/* Reglas de la tienda (valores propuestos; cambiarlos aquí). */
window.STORE = {
  // Las compras se retiran y se pagan en el local (no hay envíos).
  local: {
    nombre: "Local NQ Crown",
    direccion: "",            // escribe aquí la dirección del local
    horario: "Lunes a sábado, de 9:00 a 18:00"
  },
  cupones: { CROWN10: 0.10 },
  porPagina: 8,
  // Rangos del filtro de precio (USD)
  precios: [
    { id: "0-35", label: "Hasta $35", min: 0, max: 35 },
    { id: "35-40", label: "$35 a $40", min: 35.01, max: 40 },
    { id: "40-", label: "Más de $40", min: 40.01, max: Infinity }
  ]
};
