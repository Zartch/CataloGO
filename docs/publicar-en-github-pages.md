# Publicar CataloGo en GitHub Pages

Guia corta para publicar esta app como PWA en GitHub Pages, sin backend y sin dominio personalizado.

## Antes de empezar

Necesitas:

- una cuenta de GitHub
- un repositorio en GitHub con este proyecto
- permisos para cambiar `Settings` del repositorio

Importante:

- la app se publica como web estatica
- funciona offline despues de la primera carga
- los datos siguen siendo locales en cada dispositivo
- no hay sincronizacion entre moviles, tablets o PCs

## Paso 1. Subir el proyecto a GitHub

Si el proyecto aun no esta en GitHub:

1. Crea un repositorio nuevo en GitHub.
2. Sube el contenido del proyecto a ese repositorio.
3. Asegurate de que la rama principal sea `main`.

Si ya esta en GitHub:

1. Confirma que tus cambios estan subidos a `main`.

## Paso 2. Verificar que el repo tiene el workflow

Este proyecto ya incluye el workflow:

- [.github/workflows/deploy-github-pages.yml](/C:/Users/Zartch/pythonProjects/catalog_codex/.github/workflows/deploy-github-pages.yml)

No hace falta crear otro salvo que quieras cambiar el proceso.

## Paso 3. Activar GitHub Pages

En GitHub:

1. Abre el repositorio.
2. Entra en `Settings`.
3. En el menu lateral, abre `Pages`.
4. En `Build and deployment`, selecciona `Source: GitHub Actions`.

Con eso GitHub ya queda preparado para publicar usando el workflow del repo.

Si el primer workflow falla con un error parecido a:

```text
Get Pages site failed
HttpError: Not Found
```

normalmente significa que GitHub todavia no ha terminado de dejar Pages habilitado para ese repo. En ese caso:

1. Vuelve a `Settings -> Pages`.
2. Comprueba otra vez que `Source` sigue en `GitHub Actions`.
3. Espera unos segundos y vuelve a lanzar el workflow desde `Actions`, o haz otro push a `main`.

## Paso 4. Lanzar el despliegue

Haz push a `main`.

Ejemplo:

```bash
git add .
git commit -m "Prepare GitHub Pages deploy"
git push origin main
```

Cuando el push llegue:

1. GitHub ejecutara el workflow automáticamente.
2. El build publicara la carpeta `dist`.
3. Al terminar, GitHub Pages quedara actualizado.

## Paso 5. Comprobar que ha terminado bien

En GitHub:

1. Entra en `Actions`.
2. Abre la ultima ejecucion de `Deploy GitHub Pages`.
3. Comprueba que todos los pasos salen en verde.

Nota:

- el warning sobre acciones antiguas de Node 20 no es el error principal
- el workflow del repo ya usa versiones recientes de `checkout`, `setup-node` y `upload-pages-artifact`

Tambien puedes volver a `Settings -> Pages` y ver la URL publicada.

## URL final

Si el repo se llama, por ejemplo, `catalog_codex`:

```text
https://TU-USUARIO.github.io/catalog_codex/
```

Si el repo se llama exactamente `TU-USUARIO.github.io`:

```text
https://TU-USUARIO.github.io/
```

Ese segundo caso es el mas simple, pero no es obligatorio.

## Instalar como PWA

Una vez publicada:

1. Abre la URL final desde el movil.
2. Espera a que cargue completa.
3. Recarga una vez.
4. Instalala desde el navegador:
   - Android Chrome: `Instalar app` o `Añadir a pantalla de inicio`
   - iPhone Safari: `Compartir -> Añadir a pantalla de inicio`

## Comandos utiles en local

Para comprobar que todo sigue bien antes de subir:

```bash
npm run lint
npm run build
npm run build:github-pages
```

`npm run build:github-pages` genera el build preparado para Pages.

## Problemas tipicos

### La web no se actualiza despues del push

- revisa `Actions`
- comprueba que Pages sigue usando `GitHub Actions`
- vuelve a hacer push a `main`

### La app abre pero no instala como PWA

- asegúrate de abrir la URL publicada por `github.io`
- recarga una vez antes de instalar
- prueba desde Chrome en Android o Safari en iPhone

### La app funciona pero no comparte datos entre dispositivos

Es normal.

La app no tiene backend. Cada dispositivo guarda sus datos localmente.
