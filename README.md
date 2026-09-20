# ProspectoYa — Web mejorada para consultar medicamentos

Web estática (HTML/CSS/JS vanilla, sin frameworks, sin build) que consulta
la API pública de CIMA (AEMPS) para mejorar la experiencia de buscar y leer
fichas técnicas y prospectos de medicamentos autorizados en España.

## Contexto técnico

- **Sin backend.** La API de CIMA responde con `Access-Control-Allow-Origin: *`,
  así que todas las llamadas se hacen directamente desde el navegador con `fetch`.
- **Sin IA integrada.** Se decidió NO incluir un chat con IA dentro de la app
  (evita coste de tokens y complejidad de backend). En su lugar, se ofrece un
  botón para copiar el texto del prospecto/sección en formato limpio, para que
  el usuario lo pegue en la IA que prefiera.
- **Deploy:** Vercel, hosting estático, sin build step.
- **Sin autenticación ni base de datos.** Todo el estado del usuario
  (búsquedas recientes, "mi botiquín") vive en `localStorage`.

## API de CIMA — referencia rápida

Base: `https://cima.aemps.es/cima/rest/`

| Endpoint | Uso |
|---|---|
| `GET /medicamentos?nombre=X` | Búsqueda de medicamentos (también admite `practiv1`, `laboratorio`, `atc`, `cn`, `nregistro`, etc.) |
| `GET /medicamento?nregistro=X` | Ficha completa de un medicamento (incluye `docs[]` con enlaces a PDF de ficha técnica y prospecto) |
| `GET /docSegmentado/secciones/2?nregistro=X` | Lista de secciones disponibles del PROSPECTO (tipoDoc=2) |
| `GET /docSegmentado/contenido/2?nregistro=X&seccion=X` | Contenido HTML de una sección del prospecto |
| `GET /docSegmentado/secciones/1?nregistro=X` | Lista de secciones de la FICHA TÉCNICA (tipoDoc=1) |
| `GET /docSegmentado/contenido/1?nregistro=X&seccion=X` | Contenido HTML de una sección de la ficha técnica |
| `GET /psuministro?cn=X` | Problemas de suministro activos para un Código Nacional |
| `GET /vmpp?nregistro=X` | Equivalentes clínicos (para "medicamentos equivalentes") |
| `GET /maestras?maestra=X` | Catálogos: ATC, principios activos, laboratorios, formas farmacéuticas |

Documentación oficial completa (PDF): `CIMA-REST-API_1_19.pdf` (AEMPS).

## Prioridades del MVP (Fase 1)

1. Buscador con autocompletado en tiempo real (`GET /medicamentos`).
2. Visor del prospecto/ficha técnica por secciones, tipo acordeón/tabs
   (usando `docSegmentado/secciones` + `docSegmentado/contenido`).
3. Resumen rápido arriba de la ficha: dosis, contraindicaciones, alertas
   clave (embarazo, conducción, alcohol) extraídas de las secciones
   correspondientes del prospecto.

## Fase 2 (después del MVP)

4. Badge de "problema de suministro activo" (`GET /psuministro`).
5. "Mi botiquín": guardar medicamentos frecuentes en `localStorage`.
6. Comparador de dos medicamentos lado a lado.
7. Botón "copiar para IA": vuelca el texto de una sección o del prospecto
   completo en un formato limpio (markdown plano) al portapapeles.

## Estructura de archivos

```
index.html        → estructura de la página (buscador, resultados, detalle)
css/styles.css     → estilos
js/api.js          → funciones que llaman a la API de CIMA (fetch)
js/app.js          → lógica de UI: búsqueda, render de resultados, acordeón
```

## Notas para quien continúe el desarrollo

- No añadir ninguna llamada a APIs de IA (OpenAI, Anthropic, etc.) — está
  descartado a propósito para esta fase.
- No añadir dependencias de build (webpack, vite...) ni frameworks. El
  proyecto se sirve tal cual desde Vercel como sitio estático.
- El HTML que devuelve `docSegmentado/contenido` viene ya formateado con
  tags como `<h2>`, `<p>`; se puede inyectar con cuidado (ver comentarios
  en `js/api.js` sobre sanitización básica antes de usar `innerHTML`).
