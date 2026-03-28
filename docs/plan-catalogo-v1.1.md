# Plan de ejecución: CataloGo v1.1

## Resumen
- Crear desde cero una PWA `React + Vite + TypeScript` con arquitectura `DDD + SOLID`, funcionamiento 100% local y persistencia `SQLite WASM` en navegador.
- Guardar este plan en `docs/plan-catalogo-v1.1.md` como documento de referencia técnica antes de tocar la aplicación.
- Implementar en fases: bootstrap, persistencia, dominio/casos de uso, UI principal, import/export, PDF, PWA/offline, pruebas.

## Secuencia de implementación
1. Guardar el plan:
- Crear `docs/plan-catalogo-v1.1.md` con este plan como referencia viva del proyecto.

2. Bootstrap del proyecto:
- Inicializar Vite con React + TypeScript.
- Añadir dependencias base: `react-router-dom`, `react-i18next`, `i18next`, librería SQLite WASM (`sql.js`), `idb`, `xlsx`, `pdf-lib`.
- Crear estructura `src/domain`, `src/application`, `src/infrastructure`, `src/presentation`, `src/shared`.
- Configurar routing SPA, layout base, theming por CSS custom properties e i18n con `es` por defecto.

3. Persistencia local:
- Implementar motor SQLite en cliente con inicialización de esquema y migración base.
- Persistir el binario SQLite en `IndexedDB`.
- Crear tablas `items`, `categorias`, `familias`, `colecciones`, `coleccion_item`, `configuracion`.
- Aplicar integridad referencial:
  - `categoria_id` y `familia_id` con `ON DELETE SET NULL`
  - `coleccion_item` con `ON DELETE CASCADE`
- Exponer import/export de la base completa como `.sqlite`.

4. Dominio y aplicación:
- Definir entidades, value objects y contratos de repositorio.
- Implementar casos de uso para:
  - CRUD de items
  - CRUD de categorías
  - CRUD de familias
  - CRUD de colecciones
  - lectura/escritura de configuración
  - asignación múltiple de items a colecciones
  - importación Excel con upsert por `codigo`
  - exportación/importación SQLite
  - generación de PDF por colección
- Fijar validaciones:
  - `codigo`, `nombre`, `precio`, `unidad_medida` obligatorios
  - `codigo` único
  - `precio` positivo
  - una sola foto por item

5. Presentación y navegación:
- Implementar drawer global con logo, nombre y subtítulo.
- Implementar Home con dashboard visual a pantalla completa.
- Implementar pantallas:
  - `/`
  - `/items`
  - `/items/nuevo`
  - `/items/:id`
  - `/categorias`
  - `/familias`
  - `/colecciones`
  - `/colecciones/:id`
  - `/generar-pdf`
  - `/configuracion`
- En listados de items y colección:
  - paginación fija de 200
  - filtros colapsables cerrados por defecto
  - filtros por nombre, categoría, familia y colección
  - ordenación por nombre, código, precio, categoría, familia, colección
- En crear/editar item:
  - página dedicada
  - selector de foto desde cámara o galería
  - compresión automática antes de guardar
  - checkboxes de colecciones
  - guardar, cancelar y eliminar con confirmación

6. Medios e identidad visual:
- Implementar compresión de fotos de item a objetivo aproximado `800x800`, JPEG `75-80%`.
- Guardar blob y mime type en DB.
- Implementar carga de logo:
  - mantener SVG nativo
  - aceptar PNG/JPG
  - comprimir raster si supera ~500KB
- Aplicar colores primario/secundario en runtime sobre toda la app vía variables CSS.

7. Importación y exportación:
- Importar Excel leyendo la primera hoja y columnas:
  - `codigo`, `nombre`, `precio`, `unidad_medida`, `descripcion`, `categoria`, `familia`, `coleccion`
- Crear automáticamente familias, categorías y colecciones inexistentes.
- Si un `codigo` ya existe, actualizar el item existente.
- Procesar filas válidas aunque existan errores.
- Mostrar informe detallado con número de fila y motivo.
- Exportar `.sqlite` por descarga directa.
- Importar `.sqlite` reemplazando base actual tras confirmación destructiva.

8. Generación de PDF:
- Implementar exportación A4 100% cliente de una colección completa.
- Portada con logo, nombre, subtítulo opcional, contacto opcional y colores configurados.
- Contenido agrupado por familia y luego categoría.
- Enviar items sin familia y/o categoría al final.
- Priorizar la fotografía como elemento principal.
- Incluir numeración en todas las páginas.
- Incluir logo pequeño en pie de página en todas las páginas de contenido.
- Sin tabla de contenidos.

9. PWA y offline:
- Configurar manifest instalable.
- Configurar service worker para app shell offline.
- Verificar funcionamiento tras primera carga sin red.
- Optimizar experiencia responsive para móvil, manteniendo compatibilidad en tablet/escritorio.

## Interfaces y contratos
- `ItemRepository`:
  - listado paginado con filtros y orden
  - obtención por id
  - alta/edición
  - eliminación
  - actualización de asociaciones a colecciones
- `CategoriaRepository`, `FamiliaRepository`, `ColeccionRepository`:
  - CRUD simple y listados
- `ConfiguracionRepository`:
  - lectura/escritura del singleton
- `DatabasePort`:
  - inicialización
  - transacciones
  - exportación binaria
  - importación binaria
- DTOs mínimos:
  - `ItemListQuery`
  - `SaveItemCommand`
  - `GeneratePdfCommand`
  - `ImportExcelResult`
  - `ImportRowError`

## Pruebas y aceptación
- CRUD completo de todas las entidades.
- Unicidad de `codigo`.
- `ON DELETE SET NULL` correcto en categoría/familia.
- `ON DELETE CASCADE` correcto en `coleccion_item`.
- Paginación a 200 y ordenaciones requeridas.
- Import Excel con mezcla de filas válidas e inválidas.
- Upsert de item por `codigo`.
- Generación PDF con agrupación correcta, portada, fotos, pie y paginación.
- Funcionamiento offline tras primera carga.
- Aplicación inmediata del theming.
- Captura/selección de imágenes en entorno móvil.

## Suposiciones fijadas
- Se usará `TypeScript`.
- Se usará `sql.js` + `IndexedDB` para v1 por simplicidad y compatibilidad.
- `configuracion` será singleton con `id = 1`.
- La colección actual en `/colecciones/:id` actuará como contexto activo y del selector de filtros.
- La primera implementación entregará solo traducción `es`, dejando el sistema listo para nuevos JSON de idioma.
