# README Tecnico

Documento tecnico de CataloGo para desarrollo, build y despliegue.

## Stack

- React 19 + Vite + TypeScript
- React Router
- SQLite WASM con `sql.js`
- persistencia local en `IndexedDB`
- `pdf-lib` para PDF cliente
- `xlsx` para importacion Excel
- `vite-plugin-pwa` para manifest y service worker

## Requisitos

- Node.js 22+
- npm 10+

## Puesta en marcha

Instalacion:

```bash
npm install
```

Desarrollo en Windows PowerShell:

```bash
npm.cmd run dev
```

Desarrollo en otros shells:

```bash
npm run dev
```

Otros comandos utiles:

```bash
npm run build
npm run build:github-pages
npm run test
npm run lint
```

- `npm run build`: genera el build de produccion en `dist/`
- `npm run build:github-pages`: genera el build ajustado para GitHub Pages
- `npm run test`: ejecuta los tests con Vitest
- `npm run lint`: revisa el codigo con ESLint

## Nota sobre PowerShell

Si `npm run dev` falla con un error de `npm.ps1`, usa:

```bash
npm.cmd run dev
```

O bien permite scripts en la sesion actual:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
npm run dev
```

## Despliegue en GitHub Pages

- el repo incluye el workflow [deploy-github-pages.yml](../.github/workflows/deploy-github-pages.yml)
- el build de Pages usa `HashRouter` para evitar problemas de rutas profundas
- en GitHub, activa `Settings -> Pages -> Build and deployment -> Source: GitHub Actions`
- haz push a `main`

Guia paso a paso:

- [Publicar en GitHub Pages](publicar-en-github-pages.md)

## Funcionalidad actual

- dashboard principal
- CRUD de items
- CRUD de categorias, familias y colecciones
- relacion item-coleccion
- configuracion con colores dinamicos
- captura o seleccion de imagen
- `Items Fotos YOLO`
- importacion Excel
- exportacion e importacion completa de la base SQLite
- generacion de PDF A4 por coleccion
- PWA con service worker

## Arquitectura

### `src/domain`

- entidades de negocio
- contratos de repositorio

### `src/application`

- DTOs
- `CatalogService` como fachada de casos de uso

### `src/infrastructure`

- esquema SQLite
- repositorios concretos
- servicios de imagen, Excel y PDF

### `src/presentation`

- contexto React
- componentes reutilizables
- paginas y navegacion
- traducciones

## Persistencia local

- la base se define en [schema.ts](../src/infrastructure/database/schema.ts)
- el acceso principal esta en [sqliteCatalogRepository.ts](../src/infrastructure/database/sqliteCatalogRepository.ts)
- SQLite se serializa y se guarda en `IndexedDB`
- no existe backend ni sincronizacion remota

Reglas clave:

- `codigo` de item es unico
- `categoria_id` y `familia_id` usan `ON DELETE SET NULL`
- `coleccion_item` usa `ON DELETE CASCADE`
- `configuracion` es singleton con `id = 1`

## Navegacion principal

- `/`
- `/items`
- `/items/nuevo`
- `/items/:id`
- `/items-fotos-yolo`
- `/categorias`
- `/familias`
- `/colecciones`
- `/colecciones/:id`
- `/generar-pdf`
- `/configuracion`

## Verificacion actual

Ultimo estado validado:

- `npm run lint`: OK
- `npm run test`: OK
- `npm run build`: OK
- `npm run build:github-pages`: OK

## Documentacion relacionada

- [README de usuario](../README.md)
- [Publicar en GitHub Pages](publicar-en-github-pages.md)
- [Referencia rapida](quick-reference.md)
- [Plan v1.1](plan-catalogo-v1.1.md)
