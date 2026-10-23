# LOOKHOME — Sistema de diseño base

**Versión 1.0 · Fuente de verdad para las interfaces web**

Esta guía define los valores base de color, tipografía, espaciado, layout, elevación, estados, movimiento y accesibilidad de LOOKHOME. Se apoya en la identidad del logo, en las referencias visuales y en las convenciones ya presentes en el proyecto: Open Sans Variable, Varela Round, Tailwind 4 y las variables existentes en `apps/lookHome/src/styles/global.css`.

## Tabla de contenidos

- [Alcance y reglas de dominio](#alcance-y-reglas-de-dominio)
- [1. Principios de diseño](#1-principios-de-diseño)
- [2. Sistema de color](#2-sistema-de-color)
- [3. Tipografía](#3-tipografía)
- [4. Espaciado](#4-espaciado)
- [5. Layout y grid](#5-layout-y-grid)
- [6. Radios de borde](#6-radios-de-borde)
- [7. Elevación y sombras](#7-elevación-y-sombras)
- [8. Iconografía](#8-iconografía)
- [9. Estados de componentes](#9-estados-de-componentes)
- [10. Movimiento y animación](#10-movimiento-y-animación)
- [11. Accesibilidad](#11-accesibilidad)
- [12. Design tokens](#12-design-tokens)
- [13. Do’s & Don’ts](#13-dos--donts)

## Alcance y reglas de dominio

Estas reglas de producto son obligatorias al aplicar el sistema visual:

- Cada anuncio nuevo representa **una oferta y una modalidad**: nocturna o mensual. No presentar ambas como opciones intercambiables del mismo precio.
- Mostrar siempre la unidad del precio: **S/ 180 por noche** o **S/ 1,200 al mes**. No convertir precios entre modalidades.
- Una solicitud enviada no es una reserva confirmada. Usar etiquetas precisas como **“Solicitud enviada”**, **“Pendiente de respuesta”** o **“Aprobada por el anfitrión”** según corresponda.
- La ubicación exacta del anuncio publicado es pública y puede mostrarse en el mapa. El contacto del anfitrión y otros datos privados tienen reglas de acceso diferentes.
- Los errores de formularios deben conservar los valores ingresados y señalar cómo corregir cada campo.
- La paleta de esta guía define el **tema claro**. Un futuro tema oscuro requiere sus propias superficies, textos, estados y pruebas de contraste.

## 1. Principios de diseño

1. **La búsqueda va primero.** Ubicación, modalidad y precio deben ser fáciles de encontrar y comparar. Las fotografías dan contexto, pero no deben competir con los datos de la oferta.
2. **Una acción principal por vista.** Reducir acciones simultáneas y agrupar las secundarias. En publicación, dividir el trabajo en pasos comprensibles, con avance y errores visibles.
3. **Calidez contenida.** Usar crema, grises cálidos y el terracota de marca en dosis medidas. Las fotos de las viviendas aportan la mayor parte del color.
4. **Información de estado explícita.** Estados de publicación, disponibilidad, mensajes y solicitudes se expresan con texto, icono y color; nunca dependen solo del color.
5. **Sin ambigüedad de precio o confirmación.** Mostrar modalidad y unidad junto al precio, y distinguir con claridad solicitud, aprobación y estancia confirmada.

## 2. Sistema de color

### 2.1 Paleta de marca

| Token | HEX | HSL | Uso |
|---|---|---|---|
| Terracota | `#E78B6C` | `hsl(15 72% 66%)` | Acentos decorativos, ilustraciones, áreas amplias de marca con texto oscuro. |
| Terracota intenso | `#A84F32` | `hsl(15 54% 43%)` | Acción primaria, enlaces, texto de acento, selección y foco. |
| Coral suave | `#F0A892` | `hsl(14 76% 76%)` | Acento secundario, fondos decorativos e ilustraciones. |
| Gris cálido | `#504C4A` | `hsl(20 4% 30%)` | Texto secundario, iconos y controles sobre fondos claros. |
| Crema | `#FDF9F3` | `hsl(36 71% 97%)` | Fondo principal de página. |

**Contraste:** Terracota `#E78B6C` sobre Crema tiene una relación de **2,41:1**; Coral suave `#F0A892` sobre blanco, **1,96:1**. Ninguno debe usarse como texto pequeño ni como único indicador de un control. El Terracota intenso sí alcanza AA sobre Crema.

Conservar los colores y proporciones del archivo oficial del logo. No recrear ni recolorear el logo para adaptarlo a una superficie.

### 2.2 Neutros, textos y superficies

| Token | HEX | HSL | Uso |
|---|---|---|---|
| Texto principal | `#393432` | `hsl(17 7% 21%)` | Títulos, precios y contenido de máxima prioridad. |
| Texto secundario | `#504C4A` | `hsl(20 4% 30%)` | Texto de lectura, etiquetas e iconos. |
| Texto atenuado | `#6D6560` | `hsl(23 6% 40%)` | Ayuda, metadatos y texto secundario de baja jerarquía. |
| Fondo de página | `#FDF9F3` | `hsl(36 71% 97%)` | Fondo general cálido. |
| Superficie | `#FFFEFC` | `hsl(40 100% 99%)` | Tarjetas, formularios y paneles. Evitar usar blanco puro en grandes superficies. |
| Superficie suave | `#F5EFE8` | `hsl(32 39% 94%)` | Secciones secundarias, hover neutro y fondos de control. |
| Superficie de marca | `#FAE9E2` | `hsl(18 71% 93%)` | Selección, hover de acento y fondos de etiquetas de marca. |
| Borde sutil | `#E8DED4` | `hsl(30 30% 87%)` | Separadores decorativos que no sean el único límite de un control. |
| Borde de control | `#8C7F77` | `hsl(23 8% 51%)` | Borde visible de campos, selectores y controles interactivos. |
| Fondo deshabilitado | `#F1ECE6` | `hsl(33 28% 92%)` | Fondo de controles deshabilitados. |

### 2.3 Colores semánticos

Los colores semánticos se reservan para comunicar estados, no para ampliar la paleta de marca.

| Estado | Texto / icono | Fondo | Borde | Contraste texto/fondo |
|---|---|---|---|---:|
| Éxito | `#256642` · `hsl(147 47% 27%)` | `#EDF8F1` · `hsl(142 44% 95%)` | `#B7DEC5` · `hsl(142 37% 79%)` | 6,31:1 |
| Advertencia | `#765116` · `hsl(37 69% 27%)` | `#FFF7E5` · `hsl(42 100% 95%)` | `#E8CF99` · `hsl(41 63% 75%)` | 6,65:1 |
| Error | `#9E332D` · `hsl(3 56% 40%)` | `#FFF0ED` · `hsl(10 100% 96%)` | `#E9B9B3` · `hsl(7 55% 81%)` | 6,39:1 |
| Información | `#31566E` · `hsl(204 38% 31%)` | `#EFF5F8` · `hsl(200 39% 95%)` | `#C2D5E0` · `hsl(202 33% 82%)` | 7,10:1 |

### 2.4 Estados de color e interacciones

| Estado | Valor | Aplicación |
|---|---|---|
| Acción por defecto | `#A84F32` | Botón primario, enlace y selección. |
| Hover de acción | `#93482F` · `hsl(15 52% 38%)` | Fondo de acción al pasar el puntero; conserva texto blanco. |
| Active / pressed | `#77341F` · `hsl(14 59% 29%)` | Acción presionada. |
| Foco | `#A84F32` | Anillo de foco de 2 px, con separación de 2 px. |
| Hover neutro | `#F5EFE8` | Superficies neutras interactivas. |
| Selección de marca | `#FAE9E2` | Fondo seleccionado con texto `#A84F32`. |
| Deshabilitado | Fondo `#F1ECE6`, texto `#6D6560` | Sin hover, acción ni elevación. |

Contrastes de referencia:

| Combinación | Relación |
|---|---:|
| `#393432` sobre Crema `#FDF9F3` | 11,70:1 |
| `#504C4A` sobre Crema `#FDF9F3` | 8,09:1 |
| `#6D6560` sobre Crema `#FDF9F3` | 5,44:1 |
| Terracota intenso `#A84F32` sobre Crema `#FDF9F3` | 5,23:1 |
| Blanco sobre acción `#A84F32` | 5,48:1 |
| Blanco sobre hover `#93482F` | 6,54:1 |
| Texto `#A84F32` sobre superficie de marca `#FAE9E2` | 4,65:1 |
| Borde `#8C7F77` sobre superficie `#FFFEFC` | 3,85:1 |

Los pares de texto superan WCAG AA para texto normal. Los colores semánticos no sustituyen una etiqueta visible. El borde sutil sirve para separación decorativa; para delinear un control, usar el borde de control.

## 3. Tipografía

Usar las familias ya cargadas en el proyecto:

- **Títulos:** `Varela Round`, peso 400. Mantiene la personalidad amable del logo y del sistema actual.
- **Texto e interfaz:** `Open Sans Variable`. Peso 400 para lectura, 500 para controles, 600 para énfasis y 700 para énfasis fuerte.
- No simular pesos gruesos en Varela Round. La jerarquía de botones, precios y etiquetas se crea con Open Sans Variable.
- Mantener el texto de interfaz en español y en estilo oración; evitar etiquetas innecesarias en mayúsculas.
- Para párrafos largos, limitar la medida a **68 caracteres por línea** aproximadamente.

| Nivel | Tamaño / interlineado | Peso y familia | Letter-spacing | Uso |
|---|---|---|---|---|
| Display | 56 / 64 px | Varela Round 400 | `-0.02em` | Encabezado excepcional de portada. |
| H1 | 44 / 52 px; móvil 36 / 44 px | Varela Round 400 | `-0.02em` | Título principal de página. |
| H2 | 34 / 42 px | Varela Round 400 | `-0.01em` | Secciones principales. |
| H3 | 28 / 36 px | Varela Round 400 | `-0.01em` | Subsecciones. |
| H4 | 22 / 30 px | Varela Round 400 | `0` | Paneles y tarjetas destacadas. |
| H5 | 18 / 26 px | Varela Round 400 | `0` | Encabezados compactos. |
| H6 | 16 / 24 px | Varela Round 400 | `0` | Nivel de encabezado más bajo. |
| Body large | 18 / 28 px | Open Sans 400 | `0` | Introducciones y descripciones breves. |
| Body | 16 / 24 px | Open Sans 400 | `0` | Lectura general y formularios. |
| Body small | 14 / 20 px | Open Sans 400 | `0` | Metadatos con importancia secundaria. |
| Label | 13 / 18 px | Open Sans 600 | `0` | Etiquetas, tabs y controles. |
| Caption | 12 / 16 px | Open Sans 400 o 600 | `0` | Ayuda breve, fechas y notas. |
| Precio destacado | 20 / 28 px | Open Sans 700 | `-0.01em` | Precio principal con unidad próxima. |

**H1 móvil:** bajar a 36 px hasta 639 px de viewport. No reducir texto informativo por debajo de 12 px.

## 4. Espaciado

Usar una escala de **4 px**. La escala mantiene ritmo entre campos, tarjetas, paneles y secciones sin introducir valores arbitrarios.

| Token | Valor |
|---|---:|
| `space-0` | 0 px |
| `space-1` | 4 px |
| `space-2` | 8 px |
| `space-3` | 12 px |
| `space-4` | 16 px |
| `space-5` | 20 px |
| `space-6` | 24 px |
| `space-8` | 32 px |
| `space-10` | 40 px |
| `space-12` | 48 px |
| `space-16` | 64 px |
| `space-20` | 80 px |
| `space-24` | 96 px |
| `space-32` | 128 px |

Aplicación base:

- **8–12 px:** separación interna compacta entre icono y texto, o elementos relacionados.
- **16–24 px:** padding de controles, tarjetas y grupos de campos.
- **24–40 px:** separación entre bloques relacionados.
- **48–80 px:** separación de secciones.
- **96–128 px:** pausas de composición en páginas públicas extensas.
- Padding horizontal de página: **16 px** en móvil, **24 px** en tablet, **32 px** en escritorio y **40 px** en pantallas desde 1280 px.
- Usar `gap` de 8, 12, 16 o 24 px según cercanía; no resolver jerarquía con separadores repetidos.

## 5. Layout y grid

### 5.1 Breakpoints

| Nombre | Ancho |
|---|---:|
| Base | 0–479 px |
| XS | 480 px |
| SM | 640 px |
| MD | 768 px |
| LG | 1024 px |
| XL | 1280 px |
| 2XL | 1536 px |

Usar los breakpoints globales para cambios estructurales. Un ajuste local de CSS puede conservar un umbral intermedio si resuelve un cambio real de composición.

### 5.2 Contenedores y columnas

- Contenedor de páginas públicas: **máximo 1280 px**, centrado.
- Workspace de la aplicación: **máximo 1600 px**.
- Sidebar de anfitrión: **264 px** en escritorio.
- Grid principal: **12 columnas** desde 1024 px, **8 columnas** entre 640 y 1023 px y flujo de una columna en móvil.
- Gutter de grid: **24 px** en escritorio, **20 px** en tablet y **16 px** en móvil.
- Grilla de anuncios: **1 columna** hasta 639 px, **2 columnas** entre 640 y 1023 px y **3 columnas** desde 1024 px.
- Detalle de anuncio: contenido principal de 8 columnas y panel auxiliar de 4 columnas a partir de 1024 px; apilar en pantallas menores.
- Mantener controles de ancho legible: formularios de publicación con máximo de **720 px**, centrados en su área de trabajo.

### 5.3 Casos que requieren estructura propia

- **Mapa de búsqueda:** el mapa ocupa el área disponible. En escritorio, el panel de resultados mide **320–360 px**; en móvil se transforma en una hoja inferior, sin tapar las opciones de mapa ni el estado de búsqueda. La ubicación exacta del anuncio publicado puede ser visible.
- **Previsualización de mapa:** proporción **16:10**, radios de 16 px. Pin normal de **24 × 32 px**; seleccionado de **32 × 40 px**, con relleno Terracota intenso, centro claro y halo de 3 px. Las etiquetas de precio deben tener texto y contraste; el pin no debe ser la única referencia.
- **Bandeja de chat:** a partir de 1024 px, rail de conversaciones de **352 px** y área de mensajes flexible. En móvil, usar navegación de una sola vista entre bandeja y conversación.
- **Calendarios:** semana de siete columnas de igual ancho. Cada fecha interactiva conserva un área táctil mínima de 44 × 44 px y estados distinguibles por icono o texto además del color.
- **Colas de automatización:** conservar orden y jerarquía estable; una fila de actividad tiene una altura mínima de **52 px**. Mostrar estado, fecha y acción sin depender de hover.

## 6. Radios de borde

| Token | Valor | Uso |
|---|---:|---|
| `radius-none` | 0 px | Imágenes o divisiones que deban alinearse al borde. |
| `radius-xs` | 4 px | Elementos geométricos pequeños. |
| `radius-sm` | 8 px | Etiquetas compactas y controles densos. |
| `radius-md` | 12 px | Campos, botones y menús. |
| `radius-lg` | 16 px | Tarjetas y previsualizaciones de mapa. |
| `radius-xl` | 20 px | Paneles de contenido. |
| `radius-2xl` | 24 px | Diálogos y superficies flotantes principales. |
| `radius-full` | 9999 px | Avatares, chips y badges tipo píldora. |

Un mismo elemento mantiene el mismo radio en todos sus estados. No aplicar un único radio a todas las superficies: controles, tarjetas y diálogos tienen jerarquías distintas.

## 7. Elevación y sombras

Usar sombras cálidas y en capas. Una tarjeta sobre la superficie no necesita sombra si un borde sutil basta; reservar sombras para distinguir niveles de interacción.

| Nivel | Valor CSS | Uso |
|---|---|---|
| `shadow-1` | `0 1px 2px rgba(48,43,41,.06), 0 1px 1px rgba(48,43,41,.04)` | Tarjeta elevada levemente o foco de hover. |
| `shadow-2` | `0 4px 12px rgba(48,43,41,.08), 0 1px 3px rgba(48,43,41,.04)` | Menús pequeños, selector o tarjeta interactiva destacada. |
| `shadow-3` | `0 12px 28px rgba(48,43,41,.10), 0 4px 10px rgba(48,43,41,.04)` | Panel flotante o diálogo compacto. |
| `shadow-4` | `0 24px 48px rgba(48,43,41,.14), 0 8px 18px rgba(48,43,41,.06)` | Superposición sobre mapa o diálogo principal. |

No usar sombra para simular un borde de formulario. No asignar la misma sombra elevada a todas las tarjetas.

## 8. Iconografía

- **Estilo:** iconos vectoriales lineales, sencillos, con terminaciones redondeadas.
- **Librería recomendada:** Lucide, usando el mismo estilo en toda la interfaz. Las vistas Astro pueden usar SVG inline; en islas React, `lucide-react` es una opción.
- **Grosor de trazo:** **1,75 px**. Mantenerlo constante dentro del sistema.
- **Tamaños:** 16 px para metadatos compactos, 20 px para controles y listas, 24 px para acciones principales, 32 px para elementos destacados de estado.
- **Color:** `currentColor`. Para iconos significativos, usar una pareja con contraste de al menos 3:1.
- Los controles solo-icono tienen nombre accesible y área táctil mínima de 44 × 44 px.
- No usar emojis como iconos de navegación, estado, acción o característica.
- En mapas, badges y estados, el icono acompaña a una etiqueta; no la reemplaza.

## 9. Estados de componentes

| Estado | Tratamiento base |
|---|---|
| Default | Superficie `#FFFEFC`, texto `#393432`, borde según jerarquía. Acción primaria en Terracota intenso. |
| Hover | Cambiar fondo, color o elevación de forma sutil. No cambiar el tamaño ni la posición del elemento. |
| Focus visible | Contorno `2 px solid #A84F32`, offset de `2 px`. Debe verse también en controles dentro de paneles y overlays. |
| Active / pressed | Acción primaria `#77341F`; mostrar feedback sin mover el contenido adyacente. |
| Disabled | Fondo `#F1ECE6`, texto `#6D6560`, sin hover ni acción. Exponer el estado semánticamente con `disabled` o `aria-disabled`. |
| Loading | Conservar dimensiones y texto accesible; añadir indicador junto a la acción. No permitir doble envío. |

### Estados de publicación

| Estado visible | Color | Presentación |
|---|---|---|
| Borrador | Neutro: texto `#625B56`, fondo `#F1ECE6` | Etiqueta “Borrador”. |
| Publicado | Éxito | Etiqueta “Publicado” con icono de confirmación. |
| Cancelado | Neutro | Etiqueta “Cancelado”; no tratarlo como fallo. |
| Error / fallido | Error | Etiqueta “Error” o “Fallido”, explicación y acción de recuperación cuando exista. |

Los badges usan texto de **12 px / 16 px**, peso 600, padding vertical de 4 px y horizontal de 8 px, con radio completo. Para solicitudes de alquiler, usar estados propios: “Pendiente de respuesta” y “Aprobada por el anfitrión” no son etiquetas intercambiables con “Reserva confirmada”.

### Formularios, calendario, chat y colas

- **Formularios:** etiqueta persistente sobre el campo; ayuda o error debajo, con icono opcional. En error, el borde y el texto usan el token de error; conservar el valor que escribió la persona.
- **Calendarios:** representar con forma o texto los días disponibles, ocupados, seleccionados y fuera del mes. La fecha actual lleva anillo; la fecha seleccionada tiene fondo de marca y texto contrastado. No comunicar disponibilidad solo con un color.
- **Chat:** mensajes propios y recibidos se distinguen por alineación y superficie, no solo por color. Mensajes no leídos usan indicador más texto o recuento; fallo de envío permite reintentar.
- **Colas:** diferenciar programado, en proceso, completado, pausado y fallido con etiqueta textual, icono y color semántico. Evitar acciones que dependan solo de pasar el cursor.

## 10. Movimiento y animación

| Token | Duración | Uso |
|---|---:|---|
| `motion-fast` | 120 ms | Hover, foco y feedback corto. |
| `motion-standard` | 160 ms | Cambio de color, borde o estado de control. |
| `motion-panel` | 220 ms | Menú, hoja inferior y apertura de panel. |
| `motion-dialog` | 260 ms | Entrada y salida de diálogo principal. |

- **Easing estándar:** `cubic-bezier(0.2, 0, 0, 1)`.
- **Easing de salida:** `cubic-bezier(0.4, 0, 1, 1)`. Las salidas deben sentirse más rápidas que las entradas.
- Animar `opacity`, `transform`, `color`, `background-color`, `border-color` y `box-shadow`; no animar propiedades que reorganicen el layout.
- Las animaciones explican una acción —abrir, seleccionar, confirmar—; no se usan como decoración continua.
- En `prefers-reduced-motion: reduce`, eliminar desplazamientos y animaciones no esenciales. Mantener el contenido y su estado final visibles.

## 11. Accesibilidad

- Cumplir **WCAG 2.2 AA**: contraste mínimo de **4,5:1** para texto normal y **3:1** para texto grande. Considerar texto grande como 24 px regular o 18,66 px en negrita.
- Controles, límites significativos e iconos informativos: contraste mínimo de **3:1** frente a superficies adyacentes.
- Indicador de teclado visible: contorno de al menos **2 px**, separación de **2 px** y contraste suficiente en cada superficie.
- Área táctil recomendada: mínimo **44 × 44 px** para botones, iconos interactivos, navegación del mapa y celdas del calendario.
- No codificar estados exclusivamente con color. Acompañarlos con texto, forma, icono o patrón.
- Los campos tienen etiqueta, instrucciones cuando hagan falta y errores asociados programáticamente. Tras un envío inválido, enfocar el resumen o el primer error según el flujo.
- Los cambios de estado del chat y de las colas se anuncian a tecnologías de asistencia cuando corresponda.
- Proporcionar alternativas de teclado y botones para interacciones de arrastre o gestos en mapas, calendarios y paneles.
- Respetar el orden de foco y evitar que paneles fijos u overlays oculten el elemento enfocado.
- El texto de apoyo no debe bajar de 12 px; los datos esenciales, precios y estados no se relegan a tamaños de caption.

## 12. Design tokens

La paleta existente de `apps/lookHome/src/styles/global.css` conserva sus nombres. Las variables semánticas amplían el sistema; los breakpoints se expresan en `rem` para coincidir con el sistema web.

```css
@theme {
  /* Marca */
  --color-terracotta: #e78b6c;
  --color-terracotta-strong: #a84f32;
  --color-soft-coral: #f0a892;
  --color-warm-gray: #504c4a;
  --color-cream: #fdf9f3;

  /* Superficies y texto */
  --color-text-primary: #393432;
  --color-text-secondary: #504c4a;
  --color-text-muted: #6d6560;
  --color-canvas: #fdf9f3;
  --color-surface: #fffefc;
  --color-surface-muted: #f5efe8;
  --color-surface-brand: #fae9e2;
  --color-border-subtle: #e8ded4;
  --color-border-control: #8c7f77;

  /* Acción y foco */
  --color-action: #a84f32;
  --color-action-hover: #93482f;
  --color-action-active: #77341f;
  --color-on-action: #ffffff;
  --color-focus: #a84f32;
  --color-disabled-bg: #f1ece6;
  --color-disabled-text: #6d6560;

  /* Estados semánticos */
  --color-success: #256642;
  --color-success-bg: #edf8f1;
  --color-success-border: #b7dec5;
  --color-warning: #765116;
  --color-warning-bg: #fff7e5;
  --color-warning-border: #e8cf99;
  --color-error: #9e332d;
  --color-error-bg: #fff0ed;
  --color-error-border: #e9b9b3;
  --color-info: #31566e;
  --color-info-bg: #eff5f8;
  --color-info-border: #c2d5e0;

  /* Tipografía */
  --font-sans: "Open Sans Variable", "Open Sans", sans-serif;
  --font-heading: "Varela Round", "Open Sans Variable", sans-serif;

  /* Espaciado: unidad base de 4 px */
  --spacing: 0.25rem;

  /* Breakpoints */
  --breakpoint-xs: 30rem;
  --breakpoint-sm: 40rem;
  --breakpoint-md: 48rem;
  --breakpoint-lg: 64rem;
  --breakpoint-xl: 80rem;
  --breakpoint-2xl: 96rem;

  /* Radios */
  --radius-xs: 4px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-2xl: 24px;
  --radius-full: 9999px;

  /* Elevación */
  --shadow-1:
    0 1px 2px rgba(48, 43, 41, 0.06),
    0 1px 1px rgba(48, 43, 41, 0.04);
  --shadow-2:
    0 4px 12px rgba(48, 43, 41, 0.08),
    0 1px 3px rgba(48, 43, 41, 0.04);
  --shadow-3:
    0 12px 28px rgba(48, 43, 41, 0.10),
    0 4px 10px rgba(48, 43, 41, 0.04);
  --shadow-4:
    0 24px 48px rgba(48, 43, 41, 0.14),
    0 8px 18px rgba(48, 43, 41, 0.06);
}

:root {
  color-scheme: light;

  /* Escala de espacio */
  --lh-space-0: 0;
  --lh-space-1: 4px;
  --lh-space-2: 8px;
  --lh-space-3: 12px;
  --lh-space-4: 16px;
  --lh-space-5: 20px;
  --lh-space-6: 24px;
  --lh-space-8: 32px;
  --lh-space-10: 40px;
  --lh-space-12: 48px;
  --lh-space-16: 64px;
  --lh-space-20: 80px;
  --lh-space-24: 96px;
  --lh-space-32: 128px;

  /* Tipografía */
  --lh-type-display: 56px;
  --lh-type-h1: 44px;
  --lh-type-h1-mobile: 36px;
  --lh-type-h2: 34px;
  --lh-type-h3: 28px;
  --lh-type-h4: 22px;
  --lh-type-h5: 18px;
  --lh-type-h6: 16px;
  --lh-type-body-large: 18px;
  --lh-type-body: 16px;
  --lh-type-body-small: 14px;
  --lh-type-label: 13px;
  --lh-type-caption: 12px;

  --lh-leading-display: 64px;
  --lh-leading-h1: 52px;
  --lh-leading-h1-mobile: 44px;
  --lh-leading-h2: 42px;
  --lh-leading-h3: 36px;
  --lh-leading-h4: 30px;
  --lh-leading-h5: 26px;
  --lh-leading-h6: 24px;
  --lh-leading-body-large: 28px;
  --lh-leading-body: 24px;
  --lh-leading-body-small: 20px;
  --lh-leading-label: 18px;
  --lh-leading-caption: 16px;

  /* Layout */
  --lh-layout-public-max: 1280px;
  --lh-layout-app-max: 1600px;
  --lh-layout-host-sidebar: 264px;
  --lh-layout-chat-rail: 352px;

  /* Movimiento */
  --lh-motion-fast: 120ms;
  --lh-motion-standard: 160ms;
  --lh-motion-panel: 220ms;
  --lh-motion-dialog: 260ms;
  --lh-ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --lh-ease-exit: cubic-bezier(0.4, 0, 1, 1);

  /* Foco */
  --lh-focus-outline: 2px solid #a84f32;
  --lh-focus-offset: 2px;
}
```

## 13. Do’s & Don’ts

| Do | Don’t |
|---|---|
| Usar Crema como fondo general y superficies casi blancas para tarjetas. | Usar blanco puro como fondo de toda la aplicación. |
| Usar Terracota intenso para CTA, enlaces y texto de acento. | Usar Terracota o Coral suave como texto pequeño sobre fondos claros. |
| Mostrar “S/ 180 por noche” o “S/ 1,200 al mes”. | Mostrar un precio sin unidad ni convertirlo entre modalidades. |
| Marcar “Solicitud enviada” y “Aprobada por el anfitrión” como estados distintos. | Comunicar una solicitud enviada como reserva confirmada. |
| Acompañar el estado de un anuncio con etiqueta e icono. | Usar solo verde, rojo o gris para explicar un estado. |
| Usar imágenes claras, tipografía legible y superficies con elevación medida. | Añadir sombras pesadas a todas las tarjetas o bordes oscuros a cada panel. |
| Mantener una familia de iconos, grosor y escala coherentes. | Mezclar emojis, pictogramas sólidos e iconos lineales en la misma jerarquía. |
| Conservar los valores del formulario y explicar cómo corregir errores. | Vaciar campos o mostrar un mensaje genérico después de un error. |
| Hacer controles alcanzables con teclado, tacto y puntero. | Ocultar acciones importantes detrás de hover o gestos sin alternativa. |
| Mantener el logo original y aplicar sus colores como acentos del sistema. | Estirar, recolorear o añadir gradientes decorativos al logo o a los controles. |
