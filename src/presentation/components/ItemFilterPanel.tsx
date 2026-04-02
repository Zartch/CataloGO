import type { ItemListQuery, ItemSortField, SortDirection } from '../../application/dto';
import type { Categoria, NamedEntity } from '../../domain/entities';

interface ItemFilterPanelProps {
  query: ItemListQuery;
  categorias: Categoria[];
  familias: NamedEntity[];
  colecciones: NamedEntity[];
  expanded: boolean;
  onToggle: () => void;
  onChange: (changes: Partial<ItemListQuery>) => void;
}

export function ItemFilterPanel({
  query,
  categorias,
  familias,
  colecciones,
  expanded,
  onToggle,
  onChange,
}: ItemFilterPanelProps) {
  return (
    <section className="filter-panel">
      <button type="button" className="filter-toggle" onClick={onToggle}>
        {expanded ? 'Ocultar filtros' : 'Mostrar filtros'}
      </button>
      {expanded ? (
        <div className="filter-grid">
          <label>
            Nombre o codigo
            <input
              value={query.texto ?? ''}
              onChange={(event) => onChange({ texto: event.target.value, page: 1 })}
            />
          </label>
          <label>
            Categoria
            <select
              value={query.categoriaId ?? ''}
              onChange={(event) =>
                onChange({
                  categoriaId: event.target.value ? Number(event.target.value) : null,
                  page: 1,
                })
              }
            >
              <option value="">Todas</option>
              {categorias.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.familiaNombre} · {categoria.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Familia
            <select
              value={query.familiaId ?? ''}
              onChange={(event) =>
                onChange({
                  familiaId: event.target.value ? Number(event.target.value) : null,
                  page: 1,
                })
              }
            >
              <option value="">Todas</option>
              {familias.map((familia) => (
                <option key={familia.id} value={familia.id}>
                  {familia.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Coleccion
            <select
              value={query.coleccionId ?? ''}
              onChange={(event) =>
                onChange({
                  coleccionId: event.target.value ? Number(event.target.value) : null,
                  page: 1,
                })
              }
            >
              <option value="">Todas</option>
              {colecciones.map((coleccion) => (
                <option key={coleccion.id} value={coleccion.id}>
                  {coleccion.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ordenar por
            <select
              value={query.sortBy}
              onChange={(event) =>
                onChange({ sortBy: event.target.value as ItemSortField, page: 1 })
              }
            >
              <option value="nombre">Nombre</option>
              <option value="codigo">Codigo</option>
              <option value="precio">Precio</option>
              <option value="categoria">Categoria</option>
              <option value="familia">Familia</option>
              <option value="coleccion">Coleccion</option>
            </select>
          </label>
          <label>
            Sentido
            <select
              value={query.sortDir}
              onChange={(event) =>
                onChange({ sortDir: event.target.value as SortDirection, page: 1 })
              }
            >
              <option value="asc">Ascendente</option>
              <option value="desc">Descendente</option>
            </select>
          </label>
        </div>
      ) : null}
    </section>
  );
}
