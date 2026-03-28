# Mapeo de importacion para el CSV de referencia

Archivo preparado:

- [ejemplo-import-catalogogo-mones.csv](C:\Users\Zartch\pythonProjects\catalog_codex\docs\ejemplo-import-catalogogo-mones.csv)

## Mapeo aplicado

CSV original:

- `CODI`
- `NOM`
- `PREU`
- `FAMILIA`
- `CATEGORIA`
- `unitatMesura`
- `Descripcio`

Formato esperado por CataloGo:

- `codigo`
- `nombre`
- `precio`
- `unidad_medida`
- `descripcion`
- `categoria`
- `familia`
- `coleccion`

Transformacion usada:

- `CODI` -> `codigo`
- `NOM` -> `nombre`
- `PREU` -> `precio`
- `unitatMesura` -> `unidad_medida`
- `Descripcio` -> `descripcion`
- `CATEGORIA` -> `categoria`
- `FAMILIA` -> `familia`
- `FAMILIA` -> `coleccion`

## Decision sobre `unidad_medida`

En el origen aparece `u` en todos los registros. Lo he normalizado a `unidad` para que quede mas claro y consistente en CataloGo.

Si prefieres, tambien es valido dejar:

- `u`
- `ud`
- `unidad`

Recomendacion:

- usar `unidad` para piezas individuales

## Decisiones sobre datos conflictivos

- El codigo `643` aparecia dos veces con categorias distintas:
  - `DIBUIXOS TEMPORADA`
  - `CASES`
- Como CataloGo solo admite una categoria por item, en el CSV preparado he dejado `CASES`.

- El codigo `699` aparecia duplicado exactamente igual.
- En el CSV preparado se ha dejado una sola fila.

## Uso recomendado

1. Abre el CSV preparado en Excel.
2. Revisa si quieres mantener `familia` y `coleccion` iguales o separarlas.
3. Si todo esta correcto, guarda como `.xlsx`.
4. Importa ese `.xlsx` desde la pantalla de Configuracion de CataloGo.

## Observacion importante

Con la implementacion actual de CataloGo:

- si repites un mismo `codigo`, el import hace upsert
- la ultima fila importada para ese `codigo` sobrescribe nombre, precio, familia y categoria
- las colecciones se van acumulando si cambian entre filas

Por eso conviene que cada `codigo` aparezca una sola vez salvo que quieras reutilizarlo para asociarlo a varias colecciones.
