# LOOKHOME

Marketplace de anuncios de alquiler. El monorepo usa Astro SSR con React islands en `apps/lookHome`, NestJS en `apps/api`, Prisma y PostgreSQL alojado en Neon.

## Producto

LOOKHOME es un marketplace peruano para encontrar, comparar y solicitar alquileres para vivir. Cada anuncio nuevo representa una sola oferta: vivienda completa, habitación privada o cama compartida, con modalidad nocturna o mensual.

- Las ofertas nocturnas se solicitan con check-in, check-out y número de huéspedes.
- Las ofertas mensuales se solicitan con fecha de ingreso, duración en meses y depósito.
- El anfitrión revisa y aprueba o rechaza cada solicitud; los contratos y cobros recurrentes no forman parte de la primera versión mensual.
- La solicitud aprobada no confirma un pago. Desde la fecha de ingreso y hasta la fecha de salida, el huésped puede confirmar el inicio. Un proceso de la API revisa las estancias en curso al iniciar y cada 15 minutos, y las completa el día posterior a la fecha de salida en hora de Perú; el anfitrión también puede marcarlas completadas si terminaron antes. Las reseñas se habilitan solo cuando la solicitud está completada.
- LOOKHOME conecta a huéspedes y anfitriones, pero no cobra, procesa, registra ni liquida pagos. El pago del alquiler se coordina directamente entre ambas partes.
- El desglose guardado con una solicitud conserva sus condiciones estimadas de alquiler; no representa una transacción ni una confirmación de reserva.
- La ubicación exacta de cada anuncio publicado se muestra en el mapa; los datos de contacto del anfitrión y otros datos privados no se muestran públicamente antes de que corresponda.
- El perfil público del anfitrión expone nombre visible, foto y anuncios publicados. Email, teléfono, nombres personales, verificaciones y sesiones pertenecen a la cuenta privada.
- El perfil público del anfitrión muestra su nombre visible, foto y anuncios publicados. Correo, teléfono, nombres personales, verificaciones y sesiones son datos privados de la cuenta.
- Los anfitriones crean una oferta desde el anuncio mediante un flujo guiado: tipo y modalidad, ubicación en Perú, detalles, precio, comodidades, fotos, disponibilidad y revisión.
- Para compatibilidad, las solicitudes, conversaciones, favoritos, reseñas y calendarios existentes conservan su referencia interna a `Room`. Los anuncios nuevos crean exactamente una oferta interna; no se combina ni se reasigna información de anuncios antiguos con varias ofertas.
- Los anuncios heredados con varias ofertas se conservan intactos y se señalan para revisión en el panel del anfitrión. Convertirlos en anuncios separados o elegir una oferta principal requiere una decisión de producto; LOOKHOME no los migra automáticamente.
- La búsqueda pública pagina anuncios `Listing` una sola vez, no una fila por `Room`. Sus totales y marcadores cuentan anuncios; las ofertas heredadas sin una única oferta inequívoca se muestran sin precio o modalidad elegidos automáticamente.

Las decisiones de dominio y los cambios de interfaz deben mantener esta separación estricta entre alquiler mensual y nocturno. Un precio nunca debe mostrarse ni calcularse con una modalidad distinta de la publicada.

## Búsqueda de ubicaciones y mapa

- La búsqueda pública de ubicación usa el catálogo geográfico peruano local (departamento, provincia y distrito). `cityId` representa provincia en el esquema actual; no existe un `provinceId`.
- Cada sugerencia pública conserva tipo, ID, nombre, etiqueta y contexto. La URL guarda la selección y sus IDs administrativos. El backend comprueba que tipo, ID y jerarquía coincidan; editar el texto la convierte en `q` libre y descarta la selección estructurada.
- Las sugerencias locales normalizan tildes, mayúsculas, espacios y abreviaturas, y ordenan coincidencias exactas, iniciales, parciales y aproximadas. El catálogo INEI se carga y cachea brevemente en la API. No se habilitó `pg_trgm`: con este catálogo administrativo acotado, la normalización y el ranking en memoria no justifican una extensión ni una migración adicional.
- El catálogo no contiene un inventario fiable de calles o zonas. `Address.line1` es una dirección libre y puede incluir número de puerta, así que no se fragmenta para crear sugerencias ni se expone en el autocompletado público. El campo público de ubicación busca distrito, provincia o departamento; `q` busca anuncios, nombres administrativos y la dirección pública `Address.line1`. `line2` y el código postal no se buscan ni se exponen públicamente.
- La portada no presenta “distritos populares”: no hay una consulta agregada que cuente unidades publicadas por distrito. No se usan ubicaciones estáticas ni cantidades inferidas de una muestra pequeña como si fueran tendencias.
- El mapa muestra marcadores del área visible separados de la lista paginada. “Buscar en esta zona” aplica el rectángulo visible **junto con** los filtros actuales; no elimina la ubicación administrativa ni otros filtros. Se reinicia la página. El endpoint de marcadores limita la respuesta a 200 y MapLibre agrupa los puntos; la interfaz distingue los anuncios devueltos del total del área y `truncated` informa si hay más resultados.
- El rectángulo se consulta con las coordenadas `lat/lng` de PostgreSQL y el índice compuesto existente; no se requiere PostGIS. Es un filtro rectangular, no el polígono oficial de un distrito. Los límites se mantienen en la URL y se combinan mediante intersección con el filtro administrativo.
- La búsqueda de dirección del anfitrión sigue usando MapTiler exclusivamente desde NestJS. El autocompletado usa `autocomplete=true`; la búsqueda explícita, `autocomplete=false`. Ambas consultan en español y restringen por país a Perú, solicitan hasta 10 candidatos y muestran los cinco mejor puntuados. Un centro provincial guardado puede sesgar la proximidad; no se usa la IP.
- Las divisiones elegidas manualmente por el anfitrión se usan como contexto de consulta. Los códigos INEI derivados de MapTiler se muestran como sugerencia y solo se aplican mediante acción explícita; nombres no coincidentes o ambiguos no se resuelven por similitud. No hay polígonos distritales fiables para verificar espacialmente el pin. Una calle o localidad puede ser una referencia aproximada: el pin debe ajustarse y confirmarse; la respuesta de MapTiler no verifica el número de puerta.
- Parámetros vigentes consultados: [API de geocodificación](https://docs.maptiler.com/cloud/api/geocoding/), [parámetros de búsqueda](https://docs.maptiler.com/guides/location-services/geocoding-search/parameters/) y [tipos de resultado](https://docs.maptiler.com/guides/location-services/geocoding-search/place-types-values/).
- Evaluación manual del proveedor: probar `Jr. Huayllaga, Cerro de Pasco 19001`, `Av. Los Próceres 104, Cerro de Pasco 19001` y `Jr. Columna Pasco 300, Cerro de Pasco 19001`, también con el contexto `Yanacancha, Pasco, Perú`. Revisar el contexto devuelto y el pin sin asumir que todas las direcciones pertenecen a Yanacancha. Las pruebas automatizadas de MapTiler usan respuestas simuladas; no sustituyen una consulta real.

## Requisitos

- Node.js 20 o posterior
- pnpm 10
- Una base de datos PostgreSQL Neon
- Una cuenta Resend para correo transaccional
- Almacenamiento de imágenes: local para desarrollo; Backblaze B2 para producción en un único bucket privado. La API emite URLs de descarga temporales solo para imágenes publicadas.
- OpenFreeMap para los mapas vectoriales basados en datos de OpenStreetMap

## Configuración

1. Configura las variables del ejemplo en cada aplicación y completa `DATABASE_URL`, secretos JWT, Resend, `API_PUBLIC_URL` y `PUBLIC_API_URL`. Para desarrollo local, usa `MEDIA_STORAGE_PROVIDER=local`, `UPLOAD_ROOT` y `PRIVATE_UPLOAD_ROOT` (la privada fuera de la pública). En Render usa `MEDIA_STORAGE_PROVIDER=b2` y configura `B2_ENDPOINT`, `B2_REGION`, `B2_BUCKET`, `B2_ACCESS_KEY_ID` y `B2_SECRET_ACCESS_KEY`. Crea un único bucket B2 con acceso `allPrivate`, en la región del endpoint, y una clave de aplicación restringida a ese bucket con lectura, escritura y eliminación. Backblaze puede requerir `Allow List All Bucket Names` para compatibilidad con SDKs. Mantén las claves solo en el servidor; nunca uses variables `PUBLIC_*`. Configura CORS con los orígenes exactos de Vercel, permite `GET` y `PUT` y autoriza `Content-Type` en `PUT`. Agrega una regla de ciclo de vida para retirar cargas bajo `incoming/` y limpiar versiones ocultas: en B2 una eliminación puede ocultar una versión sin borrarla inmediatamente. Los medios publicados siguen guardados en el bucket privado; `GET /api/media/:id/image` entrega una URL B2 prefirmada de 10 minutos solo si la imagen está publicada. `MEDIA_MAX_STORAGE_BYTES_PER_USER` controla la cuota de variantes por anfitrión (2 GiB por defecto) y `MEDIA_CLEANUP_INTERVAL_MS` el intervalo del barrido (15 minutos por defecto). OpenFreeMap no requiere clave ni registro.
2. Para activar los eventos de mensajería en tiempo real, configura `MESSAGE_EVENTS_DATABASE_URL` en la API con una conexión directa a Neon que admita `LISTEN/NOTIFY` (sin pooler transaccional). Si no se configura o la conexión se interrumpe, el chat conserva la actualización automática por sondeo.
3. Instala dependencias con `pnpm install` desde la raíz.
4. Genera Prisma con `pnpm db:generate`.
5. Para una base Neon nueva, aplica el esquema actual con `pnpm --filter api prisma db push` y después aplica la restricción de reservas con `pnpm --filter api prisma db execute --file prisma/migrations/20260726000000_add_booking_overlap_constraint/migration.sql`.
6. Carga datos de referencia con `pnpm db:seed`.

La migración `20261017000100_host_listing_drafts` agrega tablas para recuperar
borradores parciales y sus fotos; no modifica ni reasigna anuncios, habitaciones,
reservas o calendarios existentes. En bases ya gestionadas con migraciones,
aplíquela después de establecer el baseline descrito arriba. Los anuncios
heredados con varias ofertas se conservan para revisión: no se elige precio,
modalidad ni foto principal de manera automática.

La migración `20261018000100_session_token_version` agrega una versión a las
sesiones existentes con valor inicial `1`. La aplicación nueva emite y acepta
sesiones de versión `2`; al desplegarla, las sesiones anteriores requerirán un
nuevo inicio de sesión. Aplique la migración antes de desplegar la versión nueva
y comunique el cierre de sesión de una sola vez a los usuarios.

La migración `20261023000100_private_staged_media` agrega visibilidad para los
medios, variantes WebP de miniatura y la referencia al avatar actual. Aplique la
migración antes de desplegar la API con el nuevo cliente Prisma. El mantenimiento
de medios privatiza las fotos antiguas asociadas exclusivamente a borradores y
retira archivos no referenciados después de 24 horas; conserva medios enlazados
a anuncios, mensajes o perfiles.

Al activar B2, use un único bucket privado (`allPrivate`). El navegador obtiene
de la API una URL PUT prefirmada y sube el original directamente; la API
verifica el objeto, genera WebP y registra los metadatos en Neon. La publicación
solo cambia la visibilidad del registro: los objetos permanecen privados en B2.
Para mostrar imágenes publicadas, `GET /api/media/:id/image` comprueba que el
medio sea una imagen con visibilidad `public` y redirige a una URL GET prefirmada
de 10 minutos. Los borradores no se pueden descargar desde esa ruta. El frontend
nunca recibe las credenciales S3. Para revisar y migrar medios locales asociados
a filas `Media`, ejecute primero
`pnpm --filter api media:migrate-b2` (inventario sin cambios) y luego, tras
verificar el origen y las credenciales, `pnpm --filter api media:migrate-b2 -- --apply`.
El migrador conserva los archivos locales como respaldo; no importa archivos sin
referencias en la base de datos y no mueve objetos entre buckets B2 ni copia
objetos desde R2. Antes de cambiar una instalación que ya haya usado R2 o la
configuración anterior de dos buckets B2, compruebe el inventario con
`SELECT storage_provider, visibility, COUNT(*) FROM "media" GROUP BY storage_provider, visibility;`.
Si existen filas `storage_provider = 'r2'` o medios B2 almacenados en el bucket
anterior, migre los objetos al bucket privado nuevo antes de desplegar esta versión.

El blueprint `render.yaml` prepara NestJS como Web Service en Render, una sola
instancia inicial y un health check en `/api/auth/health`. Complete las variables
secretas en Render antes de desplegar. En Vercel configure `PUBLIC_API_URL` con la
URL de Render y use el adaptador Astro ya incluido; el dominio de Vercel debe
coincidir con `APP_URL` en Render y con los orígenes permitidos por CORS en el
bucket privado de B2.

La API no implementa operaciones de pagos, reembolsos, payouts ni facturas. La
migración `20261021000100_remove_unused_tables` retira esas tablas heredadas y
otras tablas sin consumidores activos. Antes de eliminarlas, comprueba que estén
vacías: la migración incluye una guarda y se aborta si encuentra filas. En un
entorno no vacío, no elimines ni conviertas registros históricos para forzar el
despliegue; inventaría los datos, prepara un respaldo verificado y decide cómo
preservarlos antes de modificar la guarda. No uses `db push` para omitir esta
protección.

No ejecutes `prisma db push` contra producción después de que se gestione mediante migraciones. Antes de adoptar `prisma migrate deploy` en una base existente, crea una migración inicial baselined desde ese esquema.

## Comandos

```bash
pnpm dev
pnpm dev:web
pnpm dev:api
pnpm build
pnpm lint
pnpm test
pnpm db:generate
pnpm db:seed
```

La API escucha en `http://localhost:3000/api` y el frontend en `http://localhost:4321` por defecto.
