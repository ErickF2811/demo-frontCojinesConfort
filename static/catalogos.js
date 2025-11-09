// Catálogos: lógica separada
// Este módulo controla el formulario de subida de catálogos (PDF + carátula)
// y el listado con miniaturas. Requiere el markup dedicado en templates/catalogos.html

(function () {

  const $ = (id) => document.getElementById(id);
  const catalogUploadForm = $("catalogUploadForm");
  const catalogFileInput = $("catalogFile");
  const catalogFileLabel = $("catalogFileLabel");
  const catalogStatus = $("catalogStatus");
  const catalogListEl = $("catalogList");
  const catalogRefreshBtn = $("catalogRefresh");
  const catalogClearBtn = $("catalogClear");
  const catalogNameInput = $("catalogName");
  const catalogDescriptionInput = $("catalogDescription");
  const catalogCollectionInput = $("catalogCollection");
  const catalogStackInput = $("catalogStack");
  const catalogCoverInput = $("catalogCover");
  const catalogCaratulaInput = document.getElementById("catalogCaratula");
  const catalogCaratulaLabel = document.getElementById("catalogCaratulaLabel");
  const catalogCoverLabel = document.getElementById("catalogCoverLabel");
  const defaultPdfLabel = "Selecciona un archivo PDF…";
  const defaultCoverLabel = "Adjunta una portada (opcional)…";
  const defaultCaratulaLabel = "Adjuntar carátula (opcional)…";

  let catalogsLoaded = false;

  function formatBytes(bytes) {
    if (bytes == null) return "";
    if (bytes === 0) return "0 KB";
    const units = ["bytes", "KB", "MB", "GB"]; let v = bytes; let i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
    return i === 0 ? `${v} ${units[i]}` : `${v.toFixed(1)} ${units[i]}`;
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("es-ES");
  }

  async function fetchCatalogs() {
    if (!catalogListEl) return;
    catalogListEl.innerHTML = '<p class="empty">Cargando catálogos…</p>';
    try {
      const resp = await fetch('/api/catalogs');
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'No se pudo obtener la lista de catálogos.');
      const list = Array.isArray(data.catalogs) ? data.catalogs : [];
      if (!list.length) {
        catalogListEl.innerHTML = '<p class="empty">No hay catálogos disponibles.</p>';
        catalogsLoaded = true; return;
      }
      const frag = document.createDocumentFragment();
      list.forEach((item) => {
        const card = document.createElement('article'); card.className = 'catalog-item';
        const info = document.createElement('div'); info.className = 'catalog-item__info';
        if (item.cover_url) {
          const mediaRow = document.createElement('div'); mediaRow.style.display = 'flex'; mediaRow.style.alignItems = 'flex-start'; mediaRow.style.marginBottom = '8px';
          const img = document.createElement('img'); img.src = item.cover_url; img.alt = `Portada · ${item.catalog_name || item.display_name || 'catálogo'}`; img.style.width = '72px'; img.style.height = '72px'; img.style.objectFit = 'cover'; img.style.borderRadius = '8px'; img.style.boxShadow = '0 1px 2px rgba(0,0,0,0.06)'; img.style.marginRight = '12px';
          mediaRow.appendChild(img);
          const mediaText = document.createElement('div'); mediaRow.appendChild(mediaText); info.appendChild(mediaRow);
          info.__target = mediaText;
        }
        const title = document.createElement('span'); title.className = 'catalog-item__title'; title.textContent = item.catalog_name || item.display_name || item.name;
        if (item.stack) { const badge = document.createElement('span'); badge.className = 'catalog-item__badge'; badge.textContent = 'Destacado'; title.appendChild(document.createTextNode(' ')); title.appendChild(badge); }
        const meta = document.createElement('span'); meta.className = 'catalog-item__meta';
        const parts = []; const sizeTxt = item.size != null ? formatBytes(item.size) : ''; const dateTxt = formatDate(item.created_at || item.last_modified);
        if (item.collection) parts.push(`Colección: ${item.collection}`); if (sizeTxt) parts.push(sizeTxt); if (dateTxt) parts.push(dateTxt); meta.textContent = parts.join(' · ');
        (info.__target || info).appendChild(title); (info.__target || info).appendChild(meta);
        if (item.description) { const p = document.createElement('p'); p.className = 'catalog-item__desc'; p.textContent = item.description; (info.__target || info).appendChild(p); }
        const actions = document.createElement('div'); actions.className = 'catalog-item__actions';
        const link = document.createElement('a'); link.className = 'catalog-item__link'; link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Ver PDF';
        const stackLabel = document.createElement('label'); stackLabel.className = 'catalog-item__stack'; stackLabel.innerHTML = `<input type="checkbox" class="catalog-stack" data-id="${item.catalog_id}" ${item.stack ? 'checked' : ''}> Destacar`;
        actions.appendChild(link); actions.appendChild(stackLabel); card.appendChild(info); card.appendChild(actions); frag.appendChild(card);
      });
      catalogListEl.innerHTML = ''; catalogListEl.appendChild(frag); catalogsLoaded = true;
    } catch (e) {
      console.error('Catálogos', e); catalogListEl.innerHTML = '<p class="empty">No se pudieron cargar los catálogos.</p>'; catalogsLoaded = false;
    }
  }

  async function handleCatalogUpload(ev) {
    ev.preventDefault();
    const name = catalogNameInput?.value.trim() || '';
    const description = catalogDescriptionInput?.value.trim() || '';
    const collection = catalogCollectionInput?.value.trim() || '';
    const stackSelected = !!catalogStackInput?.checked;
    if (!name || !description) {
      if (catalogStatus) { catalogStatus.textContent = !name ? 'Ingresa un nombre para el catálogo.' : 'Ingresa una descripción para el catálogo.'; catalogStatus.style.color = '#b91c1c'; catalogStatus.dataset.state = 'error'; }
      return;
    }
    if (!catalogFileInput?.files?.length) {
      if (catalogStatus) { catalogStatus.textContent = 'Selecciona un archivo PDF.'; catalogStatus.style.color = '#b91c1c'; catalogStatus.dataset.state = 'error'; }
      return;
    }
    const file = catalogFileInput.files[0];
    if (file.type && !file.type.toLowerCase().includes('pdf')) {
      if (catalogStatus) { catalogStatus.textContent = 'Solo se permiten archivos PDF.'; catalogStatus.style.color = '#b91c1c'; catalogStatus.dataset.state = 'error'; }
      return;
    }
    const form = new FormData();
    form.append('catalog_name', name);
    form.append('description', description);
    form.append('collection', collection);
    form.append('stack', stackSelected ? '1' : '0');
    form.append('file', file);
    if (catalogCoverInput?.files?.length) {
      const cover = catalogCoverInput.files[0];
      if (!cover.type || cover.type.toLowerCase().startsWith('image/')) {
        form.append('cover', cover);
      }
    }
    if (catalogCaratulaInput?.files?.length) {
      const car = catalogCaratulaInput.files[0];
      if (!car.type || car.type.toLowerCase().startsWith('image/')) {
        form.append('caratula', car);
      }
    }
    if (catalogStatus) { catalogStatus.textContent = 'Subiendo catálogo…'; catalogStatus.style.color = '#475569'; catalogStatus.dataset.state = 'info'; }
    try {
      const resp = await fetch('/api/catalogs', { method: 'POST', body: form });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'No se pudo subir el catálogo.');
      if (catalogStatus) { catalogStatus.textContent = data.message || 'Catálogo subido correctamente.'; catalogStatus.style.color = '#16a34a'; catalogStatus.dataset.state = 'success'; }
      if (catalogNameInput) catalogNameInput.value = '';
      if (catalogDescriptionInput) catalogDescriptionInput.value = '';
      if (catalogCollectionInput) catalogCollectionInput.value = '';
      if (catalogStackInput) catalogStackInput.checked = false;
      if (catalogFileInput) catalogFileInput.value = '';
      if (catalogFileLabel) catalogFileLabel.textContent = 'Selecciona un archivo PDF…';
      if (catalogCoverInput) catalogCoverInput.value = '';
      if (catalogCaratulaInput) catalogCaratulaInput.value = '';
      await fetchCatalogs();
    } catch (e) {
      console.error('Upload catálogo', e); if (catalogStatus) { catalogStatus.textContent = e.message || 'No se pudo subir el catálogo.'; catalogStatus.style.color = '#b91c1c'; catalogStatus.dataset.state = 'error'; }
    }
  }

  function bindEvents() {
    catalogUploadForm?.addEventListener('submit', handleCatalogUpload);
    catalogFileInput?.addEventListener('change', () => {
      if (!catalogFileInput.files?.length) { if (catalogFileLabel) catalogFileLabel.textContent = defaultPdfLabel; return; }
      const file = catalogFileInput.files[0]; if (catalogFileLabel) catalogFileLabel.textContent = file.name;
    });
    catalogCoverInput?.addEventListener('change', () => {
      if (!catalogCoverInput.files?.length) { if (catalogCoverLabel) catalogCoverLabel.textContent = defaultCoverLabel; return; }
      const file = catalogCoverInput.files[0]; if (catalogCoverLabel) catalogCoverLabel.textContent = file.name;
    });
    catalogCaratulaInput?.addEventListener('change', () => {
      if (!catalogCaratulaInput.files?.length) { if (catalogCaratulaLabel) catalogCaratulaLabel.textContent = defaultCaratulaLabel; return; }
      const file = catalogCaratulaInput.files[0]; if (catalogCaratulaLabel) catalogCaratulaLabel.textContent = file.name;
    });
    catalogRefreshBtn?.addEventListener('click', () => { catalogsLoaded = false; fetchCatalogs(); });
    catalogClearBtn?.addEventListener('click', () => {
      if (catalogNameInput) catalogNameInput.value = '';
      if (catalogDescriptionInput) catalogDescriptionInput.value = '';
      if (catalogCollectionInput) catalogCollectionInput.value = '';
      if (catalogStackInput) catalogStackInput.checked = false;
      if (catalogFileInput) catalogFileInput.value = '';
      if (catalogFileLabel) catalogFileLabel.textContent = defaultPdfLabel;
      if (catalogCoverInput) catalogCoverInput.value = '';
      if (catalogCoverLabel) catalogCoverLabel.textContent = defaultCoverLabel;
      if (catalogCaratulaInput) catalogCaratulaInput.value = '';
      if (catalogCaratulaLabel) catalogCaratulaLabel.textContent = defaultCaratulaLabel;
      if (catalogStatus) { catalogStatus.textContent = ''; catalogStatus.style.color = '#475569'; delete catalogStatus.dataset.state; }
    });
    catalogListEl?.addEventListener('change', async (ev) => {
      const input = ev.target; if (!(input instanceof HTMLInputElement) || !input.classList.contains('catalog-stack')) return;
      const id = input.dataset.id; if (!id) return;
      try {
        const resp = await fetch(`/api/catalogs/${id}/stack`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: !!input.checked }) });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || 'No se pudo actualizar el destacado.');
        if (catalogStatus) { catalogStatus.textContent = input.checked ? 'Marcado como destacado.' : 'Destacado desactivado.'; catalogStatus.style.color = '#16a34a'; catalogStatus.dataset.state = 'success'; }
      } catch (e) {
        console.error('Actualizar stack catálogo', e); if (catalogStatus) { catalogStatus.textContent = e.message || 'No se pudo actualizar el catálogo destacado.'; catalogStatus.style.color = '#b91c1c'; catalogStatus.dataset.state = 'error'; }
        input.checked = !input.checked;
      }
    });
  }

  function init() {
    bindEvents();
    fetchCatalogs();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
