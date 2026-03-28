import { describe, expect, it, vi } from 'vitest';
import { CatalogService } from './catalogService';
import type { RepositoryBundle } from '../domain/repositories';

function createRepositories(): RepositoryBundle {
  return {
    items: {
      list: vi.fn(),
      getById: vi.fn(),
      getByCodigo: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(1),
      delete: vi.fn(),
      addItemsToCollection: vi.fn(),
      removeItemFromCollection: vi.fn(),
    },
    categorias: { list: vi.fn(), save: vi.fn(), delete: vi.fn() },
    familias: { list: vi.fn(), save: vi.fn(), delete: vi.fn() },
    colecciones: { list: vi.fn(), listWithCounts: vi.fn(), getById: vi.fn(), save: vi.fn(), delete: vi.fn() },
    configuracion: { get: vi.fn(), save: vi.fn() },
    dashboard: { getSummary: vi.fn() },
    importSupport: {
      ensureCategoria: vi.fn(),
      ensureFamilia: vi.fn(),
      ensureColeccion: vi.fn(),
    },
    database: {
      initialize: vi.fn(),
      exportBinary: vi.fn(),
      importBinary: vi.fn(),
    },
  };
}

describe('CatalogService', () => {
  it('rejects negative prices', async () => {
    const repositories = createRepositories();
    const service = new CatalogService(
      repositories,
      { parse: vi.fn() },
      { generate: vi.fn() },
    );

    await expect(
      service.saveItem({
        codigo: 'A-01',
        nombre: 'Producto',
        precio: -1,
        unidadMedida: 'unidad',
        descripcion: null,
        categoriaId: null,
        familiaId: null,
        fotografia: null,
        fotografiaMime: null,
        collectionIds: [],
      }),
    ).rejects.toThrow('precio');
  });

  it('rejects duplicated codes', async () => {
    const repositories = createRepositories();
    repositories.items.getByCodigo = vi.fn().mockResolvedValue({ id: 2 });
    const service = new CatalogService(
      repositories,
      { parse: vi.fn() },
      { generate: vi.fn() },
    );

    await expect(
      service.saveItem({
        codigo: 'A-01',
        nombre: 'Producto',
        precio: 10,
        unidadMedida: 'unidad',
        descripcion: null,
        categoriaId: null,
        familiaId: null,
        fotografia: null,
        fotografiaMime: null,
        collectionIds: [],
      }),
    ).rejects.toThrow('codigo');
  });
});
