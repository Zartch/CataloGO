import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { prepareItemPhoto, type BinaryImageValue } from '../../infrastructure/services/imageService';
import type { Item } from '../../domain/entities';
import type { SaveItemCommand } from '../../application/dto';
import { BinaryImage } from '../components/BinaryImage';
import { useCatalog } from '../context/CatalogContext';
import { useAsyncResource } from '../hooks/useAsyncResource';

type ReviewState = 'idle' | 'review' | 'retry';

function toSaveItemCommand(item: Item, photo: BinaryImageValue): SaveItemCommand {
  return {
    id: item.id,
    codigo: item.codigo,
    nombre: item.nombre,
    precio: item.precio,
    unidadMedida: item.unidadMedida,
    descripcion: item.descripcion,
    categoriaId: item.categoriaId,
    familiaId: item.familiaId,
    fotografia: photo.bytes,
    fotografiaMime: photo.mime,
    collectionIds: item.colecciones.map((collection) => collection.id),
  };
}

export function ItemsFotosYoloPage() {
  const { service, dataVersion, refreshAll } = useCatalog();
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [skippedIds, setSkippedIds] = useState<number[]>([]);
  const [candidatePhoto, setCandidatePhoto] = useState<BinaryImageValue | null>(null);
  const [reviewState, setReviewState] = useState<ReviewState>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentItemResource = useAsyncResource(
    async () => service?.getNextItemWithoutPhoto(skippedIds) ?? null,
    [service, dataVersion, JSON.stringify(skippedIds)],
  );

  const currentItem = currentItemResource.data;
  const familyAndCategory = useMemo(
    () => [currentItem?.familiaNombre, currentItem?.categoriaNombre].filter(Boolean).join(' · '),
    [currentItem?.categoriaNombre, currentItem?.familiaNombre],
  );

  function resetPhotoReview() {
    setCandidatePhoto(null);
    setReviewState('idle');
  }

  function openCamera() {
    cameraInputRef.current?.click();
  }

  function openGallery() {
    galleryInputRef.current?.click();
  }

  async function handlePhotoSelection(file?: File) {
    if (!file) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const preparedPhoto = await prepareItemPhoto(file);
      setCandidatePhoto(preparedPhoto);
      setReviewState('review');
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : 'No se pudo procesar la foto.');
    } finally {
      setBusy(false);
    }
  }

  async function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    await handlePhotoSelection(selectedFile);
    event.target.value = '';
  }

  async function handleConfirmPhoto() {
    if (!service || !currentItem || !candidatePhoto) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await service.saveItem(toSaveItemCommand(currentItem, candidatePhoto));
      resetPhotoReview();
      await refreshAll();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la foto.');
    } finally {
      setBusy(false);
    }
  }

  function handleSkipItem() {
    if (!currentItem) {
      return;
    }

    resetPhotoReview();
    setSkippedIds((current) => [...current, currentItem.id]);
  }

  function handleRejectPhoto() {
    setReviewState('retry');
  }

  function handleBackToReview() {
    setReviewState('review');
  }

  return (
    <div className="stack-large">
      <section className="section-heading">
        <div>
          <p className="eyebrow">Captura rapida</p>
          <h1>Items Fotos YOLO</h1>
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => void handleInputChange(event)}
        hidden
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={(event) => void handleInputChange(event)}
        hidden
      />

      <section className="form-panel photo-yolo-panel">
        {currentItemResource.loading ? <p>Cargando siguiente item...</p> : null}

        {!currentItemResource.loading && !currentItem ? (
          <div className="empty-state">
            <p>{skippedIds.length > 0 ? 'No quedan items sin fotografia en esta tanda.' : 'No quedan items sin fotografia.'}</p>
            {skippedIds.length > 0 ? (
              <div className="action-row">
                <button type="button" className="secondary-button" onClick={() => setSkippedIds([])}>
                  Reiniciar skips
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {currentItem ? (
          <div className="photo-yolo-layout">
            <div className="photo-yolo-copy">
              <p className="eyebrow">Pendiente</p>
              <h2>{currentItem.nombre}</h2>
              <div className="stack">
                <p className="muted">Codigo: {currentItem.codigo}</p>
                <p className="muted">Unidad: {currentItem.unidadMedida}</p>
                <p className="muted">{familyAndCategory || 'Sin clasificacion'}</p>
                <p className="muted">
                  {currentItem.colecciones.length > 0
                    ? currentItem.colecciones.map((collection) => collection.nombre).join(', ')
                    : 'Sin colecciones'}
                </p>
              </div>

              {reviewState === 'idle' ? (
                <div className="action-row">
                  <button type="button" className="primary-button" onClick={openCamera} disabled={busy}>
                    Hacer foto
                  </button>
                  <button type="button" className="secondary-button" onClick={openGallery} disabled={busy}>
                    Elegir de galeria
                  </button>
                  <button type="button" className="secondary-button" onClick={handleSkipItem} disabled={busy}>
                    Skip
                  </button>
                </div>
              ) : null}

              {reviewState === 'review' && candidatePhoto ? (
                <div className="stack">
                  <p className="muted">Revisa la foto antes de guardarla.</p>
                  <div className="action-row">
                    <button type="button" className="primary-button" onClick={() => void handleConfirmPhoto()} disabled={busy}>
                      {busy ? 'Guardando...' : 'OK'}
                    </button>
                    <button type="button" className="danger-button" onClick={handleRejectPhoto} disabled={busy}>
                      KO
                    </button>
                    <button type="button" className="secondary-button" onClick={handleSkipItem} disabled={busy}>
                      Skip
                    </button>
                  </div>
                </div>
              ) : null}

              {reviewState === 'retry' && candidatePhoto ? (
                <div className="stack">
                  <p className="muted">La foto no convence. Puedes repetirla o elegir otra.</p>
                  <div className="action-row">
                    <button type="button" className="primary-button" onClick={openCamera} disabled={busy}>
                      Retomar foto
                    </button>
                    <button type="button" className="secondary-button" onClick={openGallery} disabled={busy}>
                      Reseleccionar
                    </button>
                    <button type="button" className="secondary-button" onClick={handleBackToReview} disabled={busy}>
                      Volver
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="photo-yolo-preview-shell">
              <BinaryImage
                bytes={candidatePhoto?.bytes ?? null}
                mime={candidatePhoto?.mime ?? null}
                alt={currentItem.nombre}
                className="photo-yolo-preview"
              />
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
