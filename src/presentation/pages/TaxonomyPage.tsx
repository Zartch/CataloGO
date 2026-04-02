import { useState, type DragEvent } from 'react';
import type { Categoria, Familia, NamedEntity } from '../../domain/entities';
import { useCatalog } from '../context/CatalogContext';
import { useAsyncResource } from '../hooks/useAsyncResource';

interface TaxonomyPageProps {
  entityType: 'categoria' | 'familia';
}

interface EditingCategoryState {
  id: number;
  familiaId: number;
  nombre: string;
}

const TAXONOMY_COPY = {
  categoria: {
    title: 'Categorias',
    eyebrow: 'Editor jerarquico',
    description: 'Las categorias siempre pertenecen a una familia. Muevelas arrastrando.',
  },
  familia: {
    title: 'Familias y categorias',
    eyebrow: 'Editor jerarquico',
    description: 'Gestiona familias y sus categorias hijas en una sola vista.',
  },
} as const;

export function TaxonomyPage({ entityType }: TaxonomyPageProps) {
  const { service, dataVersion, refreshAll } = useCatalog();
  const [familyDraft, setFamilyDraft] = useState('');
  const [editingFamily, setEditingFamily] = useState<NamedEntity | null>(null);
  const [categoryDrafts, setCategoryDrafts] = useState<Record<number, string>>({});
  const [editingCategory, setEditingCategory] = useState<EditingCategoryState | null>(null);
  const [draggingCategoryId, setDraggingCategoryId] = useState<number | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const copy = TAXONOMY_COPY[entityType];

  const resource = useAsyncResource(
    async () => (service ? service.listFamiliasConCategorias() : []),
    [service, dataVersion, entityType],
  );

  async function refreshTaxonomy() {
    await refreshAll();
    await resource.refresh();
  }

  async function handleSaveFamily() {
    if (!service || !familyDraft.trim()) {
      return;
    }
    await service.saveFamilia({ id: editingFamily?.id, nombre: familyDraft });
    setFamilyDraft('');
    setEditingFamily(null);
    await refreshTaxonomy();
  }

  async function handleDeleteFamily(id: number) {
    if (!service || !window.confirm('Se eliminara la familia con sus categorias y las asociaciones de items. Confirmar.')) {
      return;
    }
    await service.deleteFamilia(id);
    await refreshTaxonomy();
  }

  async function handleSaveCategory(familiaId: number) {
    const draft = editingCategory?.familiaId === familiaId ? editingCategory.nombre : categoryDrafts[familiaId];
    if (!service || !draft?.trim()) {
      return;
    }
    await service.saveCategoria({
      id: editingCategory?.familiaId === familiaId ? editingCategory.id : undefined,
      nombre: draft,
      familiaId,
    });
    setCategoryDrafts((current) => ({ ...current, [familiaId]: '' }));
    setEditingCategory(null);
    await refreshTaxonomy();
  }

  async function handleDeleteCategory(categoryId: number) {
    if (!service || !window.confirm('Los items asociados perderan esta categoria. Confirmar eliminacion.')) {
      return;
    }
    await service.deleteCategoria(categoryId);
    await refreshTaxonomy();
  }

  async function moveCategory(targetFamilyId: number, targetIndex: number) {
    if (!service || draggingCategoryId === null) {
      return;
    }
    await service.moveCategoria(draggingCategoryId, targetFamilyId, targetIndex);
    setDraggingCategoryId(null);
    setDropTargetKey(null);
    await refreshTaxonomy();
  }

  function handleDrop(targetFamilyId: number, targetIndex: number) {
    return (event: DragEvent) => {
      event.preventDefault();
      void moveCategory(targetFamilyId, targetIndex);
    };
  }

  function handleDragOver(targetFamilyId: number, targetIndex: number) {
    return (event: DragEvent) => {
      event.preventDefault();
      setDropTargetKey(`${targetFamilyId}:${targetIndex}`);
    };
  }

  function renderCategoryRow(family: Familia, category: Categoria, index: number) {
    const isEditing = editingCategory?.id === category.id;
    const draftValue = isEditing ? editingCategory.nombre : '';
    const isDropTarget = dropTargetKey === `${family.id}:${index}`;

    return (
      <div
        key={category.id}
        className={`taxonomy-category-row ${isDropTarget ? 'taxonomy-drop-target' : ''}`}
        onDragOver={handleDragOver(family.id, index)}
        onDrop={handleDrop(family.id, index)}
      >
        <div
          className="taxonomy-category-main"
          draggable
          onDragStart={() => setDraggingCategoryId(category.id)}
          onDragEnd={() => {
            setDraggingCategoryId(null);
            setDropTargetKey(null);
          }}
        >
          <span className="drag-handle" aria-hidden="true">::</span>
          {isEditing ? (
            <input
              value={draftValue}
              onChange={(event) =>
                setEditingCategory((current) =>
                  current
                    ? { ...current, nombre: event.target.value }
                    : current,
                )
              }
            />
          ) : (
            <span>{category.nombre}</span>
          )}
        </div>
        <div className="action-row">
          {isEditing ? (
            <>
              <button type="button" className="primary-button" onClick={() => void handleSaveCategory(family.id)}>
                Guardar
              </button>
              <button type="button" className="secondary-button" onClick={() => setEditingCategory(null)}>
                Cancelar
              </button>
            </>
          ) : (
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setEditingCategory({
                  id: category.id,
                  familiaId: family.id,
                  nombre: category.nombre,
                })
              }
            >
              Editar
            </button>
          )}
          <button type="button" className="danger-button" onClick={() => void handleDeleteCategory(category.id)}>
            Eliminar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack-large">
      <section className="section-heading">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p className="muted">{copy.description}</p>
        </div>
      </section>

      <section className="inline-form">
        <input
          placeholder="Nombre de familia"
          value={familyDraft}
          onChange={(event) => setFamilyDraft(event.target.value)}
        />
        <button type="button" className="primary-button" onClick={() => void handleSaveFamily()}>
          {editingFamily ? 'Guardar cambios' : 'Anadir familia'}
        </button>
        {editingFamily ? (
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setEditingFamily(null);
              setFamilyDraft('');
            }}
          >
            Cancelar
          </button>
        ) : null}
      </section>

      <section className="taxonomy-family-grid">
        {resource.data?.map((family) => {
          const isFamilyDropTarget = dropTargetKey === `${family.id}:${family.categorias.length}`;
          const familyCategoryDraft = editingCategory?.familiaId === family.id
            ? editingCategory.nombre
            : categoryDrafts[family.id] ?? '';
          const isEditingInFamily = editingCategory?.familiaId === family.id;

          return (
            <article key={family.id} className="taxonomy-family-card">
              <div className="taxonomy-family-head">
                <div>
                  <h2>{family.nombre}</h2>
                  <p className="muted">{family.categorias.length} categorias</p>
                </div>
                <div className="action-row">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setEditingFamily(family);
                      setFamilyDraft(family.nombre);
                    }}
                  >
                    Editar familia
                  </button>
                  <button type="button" className="danger-button" onClick={() => void handleDeleteFamily(family.id)}>
                    Eliminar
                  </button>
                </div>
              </div>

              <div className="taxonomy-category-list">
                {family.categorias.map((category, index) => renderCategoryRow(family, category, index))}
                <div
                  className={`taxonomy-dropzone ${isFamilyDropTarget ? 'taxonomy-drop-target' : ''}`}
                  onDragOver={handleDragOver(family.id, family.categorias.length)}
                  onDrop={handleDrop(family.id, family.categorias.length)}
                >
                  Soltar aqui para mover al final
                </div>
              </div>

              <div className="taxonomy-inline-form">
                <input
                  placeholder="Nueva categoria"
                  value={familyCategoryDraft}
                  onChange={(event) => {
                    if (isEditingInFamily) {
                      setEditingCategory((current) =>
                        current
                          ? { ...current, nombre: event.target.value }
                          : current,
                      );
                      return;
                    }
                    setCategoryDrafts((current) => ({ ...current, [family.id]: event.target.value }));
                  }}
                />
                <button type="button" className="primary-button" onClick={() => void handleSaveCategory(family.id)}>
                  {isEditingInFamily ? 'Guardar categoria' : 'Anadir categoria'}
                </button>
                {isEditingInFamily ? (
                  <button type="button" className="secondary-button" onClick={() => setEditingCategory(null)}>
                    Cancelar
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
