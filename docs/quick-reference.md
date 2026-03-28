# CataloGo Quick Reference

Documento de referencia rapida para retomar el proyecto en futuras sesiones sin tener que reexplorar todo el repo.

## Estado actual

- Proyecto bootstrappeado y funcional
- Repo aun sin commits
- App implementada sobre React + Vite + TypeScript
- Persistencia local con SQLite WASM (`sql.js`) + `IndexedDB`
- PWA configurada con `vite-plugin-pwa`
- Build, lint y tests en verde

## Comandos utiles

```bash
npm install
npm run dev
npm run build
npm run test
npm run lint
```

## Estructura clave

### Entrada

- `src/main.tsx`
  - arranque React
  - `BrowserRouter`
  - registro del service worker PWA
  - `CatalogProvider`

- `src/App.tsx`
  - rutas de la SPA
  - paginas cargadas con `React.lazy`

### Dominio y casos de uso

- `src/domain/entities.ts`
  - tipos principales: `Item`, `Configuracion`, `NamedEntity`

- `src/domain/repositories.ts`
  - contratos de persistencia
  - `RepositoryBundle`

- `src/application/dto.ts`
  - queries, commands y resultados

- `src/application/catalogService.ts`
  - facade principal de casos de uso
  - validaciones de negocio
  - orquestacion de importacion, PDF y CRUD

### Persistencia e infraestructura

- `src/infrastructure/database/schema.ts`
  - esquema SQLite
  - configuracion por defecto

- `src/infrastructure/database/sqliteCatalogRepository.ts`
  - inicializacion de `sql.js`
  - persistencia del binario en `IndexedDB`
  - implementacion concreta de repositorios

- `src/infrastructure/services/imageService.ts`
  - compresion de foto de item
  - tratamiento del logo
  - URLs temporales para renderizar blobs

- `src/infrastructure/services/excelImportService.ts`
  - parseo de `.xlsx`
  - validacion basica de columnas y filas

- `src/infrastructure/services/pdfService.ts`
  - generacion del catalogo A4

### Presentacion

- `src/presentation/context/CatalogContext.tsx`
  - composition root React
  - carga dinamica de infraestructura pesada
  - estado global de configuracion

- `src/presentation/components/AppLayout.tsx`
  - layout general
  - drawer + topbar

- `src/presentation/pages/HomePage.tsx`
- `src/presentation/pages/ItemsPage.tsx`
- `src/presentation/pages/ItemFormPage.tsx`
- `src/presentation/pages/TaxonomyPage.tsx`
- `src/presentation/pages/CollectionsPage.tsx`
- `src/presentation/pages/CollectionDetailPage.tsx`
- `src/presentation/pages/PdfPage.tsx`
- `src/presentation/pages/SettingsPage.tsx`

## Modelo de datos actual

### Tablas

- `categorias(id, nombre unique)`
- `familias(id, nombre unique)`
- `colecciones(id, nombre unique)`
- `items(id, codigo unique, nombre, precio, unidad_medida, descripcion, categoria_id, familia_id, fotografia, fotografia_mime)`
- `coleccion_item(coleccion_id, item_id, primary key(coleccion_id, item_id))`
- `configuracion(id=1, nombre_compania, subtitulo, logo, logo_mime, email, telefono, color_primario, color_secundario, moneda)`

### Reglas

- `categoria_id` y `familia_id`: `ON DELETE SET NULL`
- `coleccion_item`: `ON DELETE CASCADE`
- una sola foto por item
- configuracion singleton con `id = 1`

## Rutas de la app

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

## Flujos implementados

### Items

- listado con filtros colapsables
- ordenacion por nombre, codigo, precio, categoria, familia, coleccion
- paginacion a 200
- formulario dedicado crear/editar
- asociacion multiple a colecciones

### Taxonomias

- CRUD basico de categorias
- CRUD basico de familias

### Colecciones

- listado de colecciones con contador
- detalle con items asociados
- alta multiple de items por checkbox
- eliminacion de asociacion individual

### Configuracion

- nombre, subtitulo, contacto
- logo
- color primario y secundario
- moneda
- import Excel
- export/import SQLite

### PDF

- selector de coleccion
- opciones para precio/unidad, descripcion, subtitulo y contacto
- portada + contenido agrupado + paginacion

## Decisiones tecnicas importantes

- No hay backend ni API externa
- i18n preparado pero solo existe `es`
- SQLite, Excel y PDF cargan de forma diferida para bajar el bundle inicial
- El service worker se registra en `src/main.tsx`
- La shell inicial ya esta optimizada, pero aun se puede mejorar la primera inicializacion de SQLite si hace falta

## Limitaciones o deuda tecnica actual

- Hay pocos tests; ahora mismo cubren solo validaciones base de `CatalogService`
- No hay suite de tests de repositorios SQLite
- No hay tests de UI
- La importacion Excel valida lo esencial, pero puede endurecerse mas
- El PDF funciona, pero su maquetacion aun es v1 y se puede refinar visualmente
- La carga offline esta configurada, pero no se ha documentado un proceso manual de QA offline

## Siguientes mejoras razonables

- ampliar tests de repositorio y casos de uso
- añadir seeds o datos demo opcionales
- mejorar composicion visual del PDF
- separar aun mas chunks si aparecen nuevas dependencias pesadas
- añadir mas idiomas en `src/presentation/i18n/locales`
- crear migraciones versionadas si el esquema empieza a evolucionar

## Documentos de referencia

- `docs/plan-catalogo-v1.1.md`
- `README.md`
