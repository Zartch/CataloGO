import type { Item } from '../../domain/entities';

function uniqueOrdered(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function formatItemCategorySummary(item: Item) {
  if (item.categorias.length === 0) {
    return 'Sin clasificacion';
  }

  return item.categorias
    .map((categoria) => `${categoria.familiaNombre} · ${categoria.nombre}`)
    .join(', ');
}

export function formatItemFamilySummary(item: Item) {
  const families = uniqueOrdered(item.categorias.map((categoria) => categoria.familiaNombre));
  return families.length > 0 ? families.join(', ') : 'Sin familias';
}
