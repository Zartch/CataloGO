# CataloGo

PWA para control de inventario sencillo y generacion de catalogos PDF A4, ejecutada 100% en local y sin backend.

## Objetivo

CataloGo esta pensada para trabajar desde navegador en movil, tablet o escritorio, con foco en:

- inventario visual con fotografia protagonista
- gestion local de items, categorias, familias y colecciones
- exportacion de catalogos PDF por coleccion
- funcionamiento offline tras la primera carga
- importacion y exportacion de datos sin servicios externos

## Stack

- React 19 + Vite + TypeScript
- React Router para navegacion SPA
- SQLite WASM con `sql.js`
- Persistencia del binario SQLite en `IndexedDB`
- `pdf-lib` para generacion de PDF cliente
- `xlsx` para importacion de Excel
- `vite-plugin-pwa` para manifest y service worker
- i18n preparado con `react-i18next`

## Puesta en marcha

Requisitos:

- Node.js 22+
- npm 10+

Instalacion:

```bash
npm install
```

Ejecucion recomendada en Windows:

```bash
npm.cmd run dev
```

Esto levanta el servidor de desarrollo de Vite y muestra una URL local para abrir la app en el navegador.

Ejecucion habitual en otros shells:

```bash
npm run dev
```

Otros comandos utiles:

```bash
npm run build
npm run intranet:install
npm run intranet:serve
npm run test
npm run lint
```

Servidor de desarrollo:

- comando recomendado en PowerShell de Windows: `npm.cmd run dev`
- comando habitual en `cmd`, Git Bash u otros entornos: `npm run dev`
- abre la URL mostrada por Vite

### Nota importante sobre PowerShell en Windows

Si `npm run dev` falla con un error parecido a:

`npm.ps1` / `la ejecucion de scripts esta deshabilitada en este sistema`

el problema no es del proyecto. PowerShell esta bloqueando la ejecucion de `npm.ps1`.

Opciones para arrancar la app:

- usar directamente `npm.cmd run dev`
- abrir el proyecto desde `cmd` en lugar de PowerShell
- permitir scripts solo en la sesion actual y despues ejecutar `npm run dev`:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
npm run dev
```

- permitirlo para tu usuario y despues volver a abrir la terminal:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Build de produccion:

- `npm run build`
- salida en `dist/`

Instalacion por intranet en movil:

- `npm run intranet:install`
- hace build de produccion y levanta un servidor HTTPS en la LAN
- publica la app en `/` y una guia de instalacion en `/install`
- expone el certificado local en `/ca.crt` para que Android/iPhone puedan confiar en la conexion
- pensado para ejecutarse en un PC Windows conectado a la misma red que los moviles

Notas sobre HTTPS local:

- la PWA requiere contexto seguro para poder instalarse bien en movil
- el comando genera un certificado HTTPS local para la IP LAN del PC
- ese certificado se reutiliza en arranques normales
- solo se regenera si falta, caduca o ya no cubre la IP/host actual
- cada movil debe confiar ese certificado una vez antes de instalar la app
- si cambia la IP del PC, usa la nueva URL mostrada en consola

## Funcionalidad implementada

- Home tipo dashboard con identidad visual de la empresa
- Drawer global con navegacion principal
- CRUD de items en pagina dedicada
- CRUD de categorias, familias y colecciones
- Relacion N:M item-coleccion
- Filtros colapsables y paginacion de 200 items
- Configuracion singleton con colores dinamicos
- Captura/seleccion de imagen y compresion automatica
- Importacion Excel con reporte de errores por fila
- Exportacion e importacion completa de la base SQLite
- Generacion de PDF A4 por coleccion
- Preparacion PWA con manifest y service worker
- Servicio HTTPS local para instalacion en intranet con guia `/install`

## Arquitectura

La aplicacion sigue una separacion por capas:

- `src/domain`
  - entidades de negocio
  - contratos de repositorio
- `src/application`
  - DTOs
  - casos de uso a traves de `CatalogService`
- `src/infrastructure`
  - SQLite WASM y esquema
  - repositorios concretos
  - servicios de imagen, Excel y PDF
- `src/presentation`
  - contexto React
  - componentes reutilizables
  - paginas y navegacion
  - traducciones

## Persistencia local

- La base se define en `src/infrastructure/database/schema.ts`
- El acceso principal esta en `src/infrastructure/database/sqliteCatalogRepository.ts`
- SQLite se serializa y guarda en `IndexedDB`
- No existe backend ni sincronizacion remota

Entidades persistidas:

- `items`
- `categorias`
- `familias`
- `colecciones`
- `coleccion_item`
- `configuracion`

Reglas clave:

- `codigo` de item es unico
- `categoria_id` y `familia_id` usan `ON DELETE SET NULL`
- `coleccion_item` usa `ON DELETE CASCADE`
- `configuracion` es singleton con `id = 1`

## Navegacion actual

Rutas principales:

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

## PDF

La generacion de PDF:

- se ejecuta 100% en cliente
- exporta una coleccion completa
- usa portada con identidad de empresa
- agrupa items por familia y categoria
- envia items sin clasificacion al final
- incluye paginacion y logo en pie de pagina de contenido

## Import / Export

Importacion Excel:

- columnas esperadas: `codigo`, `nombre`, `precio`, `unidad_medida`, `descripcion`, `categoria`, `familia`, `coleccion`
- upsert por `codigo`
- crea automaticamente categorias, familias y colecciones no existentes
- conserva filas validas aunque otras fallen

Base de datos:

- exportacion completa a `.sqlite`
- importacion destructiva de `.sqlite` con confirmacion

## Optimizacion de carga

Se redujo el bundle inicial mediante:

- carga diferida de paginas con `React.lazy`
- import dinamico de SQLite, Excel y PDF

Esto deja el codigo pesado fuera del chunk inicial y mejora la carga base de la app.

## Verificacion actual

Ultimo estado validado:

- `npm run lint`: OK
- `npm run test`: OK
- `npm run build`: OK

Nota:

- el build sigue incluyendo assets pesados en chunks diferidos por `sql.js`, `xlsx` y `pdf-lib`, lo cual es esperable en una app 100% cliente

## Documentacion del repo

- [Plan v1.1](C:\Users\Zartch\pythonProjects\catalog_codex\docs\plan-catalogo-v1.1.md)
- [Referencia rapida](C:\Users\Zartch\pythonProjects\catalog_codex\docs\quick-reference.md)
