const state = {
  tables: [],
  activeTable: null,
  primaryKey: null,
  columns: [],
  rows: [],
  page: 1,
  perPage: 25,
  total: 0,
  editingRow: null,
  originalRow: null,
  hiddenColumns: [],
  columnLabels: {},
  thumbnailColumns: [],
  uploadFields: {},
  imageFields: [],
  imageField: null,
  primaryImageColumn: null,
  pendingImageRowId: null,
  pendingImageColumn: null,
  pendingUploadConfig: null,
  activeUploadColumn: null,
};

const els = {
  tableSelect: document.getElementById('dataTableSelect'),
  reloadBtn: document.getElementById('dataReloadBtn'),
  exportBtn: document.getElementById('dataExportBtn'),
  importBtn: document.getElementById('dataImportBtn'),
  importInput: document.getElementById('dataImportInput'),
  status: document.getElementById('dataStatus'),
  head: document.getElementById('dataTableHead'),
  body: document.getElementById('dataTableBody'),
  title: document.getElementById('dataTableTitle'),
  meta: document.getElementById('dataTableMeta'),
  prevBtn: document.getElementById('dataPrevPage'),
  nextBtn: document.getElementById('dataNextPage'),
  perPageSelect: document.getElementById('dataPerPageSelect'),
  pageInput: document.getElementById('dataPageInput'),
  pageTotal: document.getElementById('dataPageTotal'),
  tableWrapper: null,
  scrollTop: document.getElementById('dataTableScrollTop'),
  scrollInner: document.getElementById('dataTableScrollInner'),
  modal: document.getElementById('dataEditorModal'),
  form: document.getElementById('dataEditorForm'),
  editorTitle: document.getElementById('dataEditorTitle'),
  editorSubtitle: document.getElementById('dataEditorSubtitle'),
  imageInput: document.getElementById('dataImageInput'),
  lightbox: document.getElementById('dataLightbox'),
  lightboxImg: document.getElementById('dataLightboxImg'),
  lightboxUploadBtn: document.getElementById('dataLightboxUploadBtn'),
  lightboxLink: document.getElementById('dataLightboxLink'),
  lightboxLinkAnchor: document.getElementById('dataLightboxLinkAnchor'),
  lightboxEmpty: document.getElementById('dataLightboxEmpty'),
};

let scrollSyncInitialized = false;
let isSyncingScroll = false;

const fetchJSON = async (url, options = {}) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed (${response.status})`);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
};

const setStatus = (message, tone = 'muted') => {
  if (!els.status) return;
  els.status.textContent = message;
  els.status.className = `data-admin__status is-${tone}`;
};

const getTotalPages = () => {
  if (!state.perPage) return 1;
  return Math.max(1, Math.ceil((state.total || 0) / state.perPage));
};

const clampPage = (value) => {
  const totalPages = getTotalPages();
  if (Number.isNaN(value) || value < 1) return 1;
  if (value > totalPages) return totalPages;
  return value;
};

const updatePaginationUI = () => {
  const totalPages = getTotalPages();
  if (els.pageInput) {
    els.pageInput.value = state.page;
    els.pageInput.min = 1;
    els.pageInput.max = totalPages;
  }
  if (els.pageTotal) {
    els.pageTotal.textContent = totalPages;
  }
  if (els.perPageSelect) {
    const hasOption = Array.from(els.perPageSelect.options).some(
      (opt) => Number(opt.value) === Number(state.perPage)
    );
    if (!hasOption) {
      const option = document.createElement('option');
      option.value = state.perPage;
      option.textContent = state.perPage;
      els.perPageSelect.appendChild(option);
    }
    els.perPageSelect.value = String(state.perPage);
  }
  if (els.prevBtn) {
    els.prevBtn.disabled = state.page <= 1;
  }
  if (els.nextBtn) {
    els.nextBtn.disabled = state.page >= totalPages;
  }
};

const initScrollSync = () => {
  if (scrollSyncInitialized) return;
  els.tableWrapper = document.querySelector('.data-admin__table-wrapper');
  if (!els.tableWrapper || !els.scrollTop) return;
  scrollSyncInitialized = true;
  const syncPositions = (source, target) => {
    if (!source || !target) return;
    if (isSyncingScroll) return;
    isSyncingScroll = true;
    target.scrollLeft = source.scrollLeft;
    requestAnimationFrame(() => {
      isSyncingScroll = false;
    });
  };
  els.scrollTop.addEventListener('scroll', () => syncPositions(els.scrollTop, els.tableWrapper));
  els.tableWrapper.addEventListener('scroll', () => syncPositions(els.tableWrapper, els.scrollTop));
};

const updateScrollMirror = () => {
  els.tableWrapper = document.querySelector('.data-admin__table-wrapper');
  if (!els.scrollTop || !els.scrollInner || !els.tableWrapper) return;
  const table = document.querySelector('.data-admin__table');
  const totalWidth = table?.scrollWidth || 0;
  const viewport = els.tableWrapper.clientWidth;
  els.scrollInner.style.width = totalWidth ? `${totalWidth}px` : '100%';
  const needsScroll = totalWidth > viewport + 1;
  els.scrollTop.classList.toggle('is-hidden', !needsScroll);
  if (needsScroll) {
    els.scrollTop.scrollLeft = els.tableWrapper.scrollLeft;
  } else {
    els.scrollTop.scrollLeft = 0;
  }
};

const handlePageJump = () => {
  if (!els.pageInput) return;
  const requested = parseInt(els.pageInput.value, 10);
  const nextPage = clampPage(requested);
  if (nextPage !== state.page) {
    state.page = nextPage;
    loadRows();
  } else {
    updatePaginationUI();
  }
};

const getUploadColumnOrder = () => {
  const uploadColumns = Object.keys(state.uploadFields || {});
  if (!uploadColumns.length) {
    return [];
  }
  const prioritized = [];
  state.imageFields.forEach((column) => {
    if (uploadColumns.includes(column) && !prioritized.includes(column)) {
      prioritized.push(column);
    }
  });
  uploadColumns.forEach((column) => {
    if (!prioritized.includes(column)) {
      prioritized.push(column);
    }
  });
  return prioritized;
};

const ensureActiveUploadColumn = () => {
  const ordered = getUploadColumnOrder();
  if (!ordered.length) {
    state.activeUploadColumn = null;
    return null;
  }
  if (!state.activeUploadColumn || !ordered.includes(state.activeUploadColumn)) {
    state.activeUploadColumn = ordered[0];
  }
  return state.activeUploadColumn;
};

const populateTableSelect = () => {
  if (!els.tableSelect) return;
  els.tableSelect.innerHTML = '';
  if (!state.tables.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Sin tablas configuradas';
    els.tableSelect.appendChild(option);
    els.tableSelect.disabled = true;
    return;
  }
  state.tables.forEach((table, index) => {
    const option = document.createElement('option');
    option.value = table.id;
    option.textContent = table.label;
    els.tableSelect.appendChild(option);
    if (index === 0 && !state.activeTable) {
      state.activeTable = table.id;
    }
  });
  els.tableSelect.value = state.activeTable;
  els.tableSelect.disabled = false;
};

const getColumnLabel = (column) => state.columnLabels[column] || column;

const isPdfUrl = (value) =>
  typeof value === 'string' && value.trim().toLowerCase().endsWith('.pdf');

const renderThumbnail = (column, value, row, options = {}) => {
  const { interactive = false } = options;
  const uploadCfg = (column && state.uploadFields[column]) || {};
  const kind = uploadCfg.type || 'image';
  const rowId = row[state.primaryKey];
  const encodedUrl = value ? encodeURI(value) : '';
  const displayLabel = getColumnLabel(column);
  const description = kind === 'file' ? 'archivo' : 'imagen';

  if (!value && !interactive) {
    return '<span class="muted">Sin archivo</span>';
  }

  if (!value && interactive) {
    return `
      <button
        type="button"
        class="data-admin__thumbnail data-admin__thumbnail--empty"
        data-url=""
        data-column="${column}"
        data-id="${rowId}"
        data-interactive="true"
      >
        Cargar ${description}
      </button>
    `;
  }

  if (kind === 'file' || isPdfUrl(value)) {
    if (!interactive) {
      return `<a class="data-admin__pdf-link" href="${encodedUrl}" target="_blank" rel="noopener">Archivo</a>`;
    }
    return `
      <button
        type="button"
        class="data-admin__thumbnail data-admin__thumbnail--pdf"
        data-url="${encodedUrl}"
        data-column="${column}"
        data-id="${rowId}"
        data-interactive="true"
        aria-label="Abrir ${description} (${displayLabel})"
        title="Abrir ${description} (${displayLabel})"
      >
        Archivo
      </button>
    `;
  }
  if (!interactive) {
    return `
      <div class="data-admin__thumbnail is-static">
        <img src="${encodedUrl}" alt="${column}" />
      </div>
    `;
  }
  return `
    <div
      class="data-admin__thumbnail"
      role="button"
      tabindex="0"
      data-url="${encodedUrl}"
      data-column="${column}"
      data-id="${rowId}"
      data-interactive="true"
      aria-label="Abrir ${description} (${displayLabel})"
      title="Abrir ${description} (${displayLabel})"
    >
      <img src="${encodedUrl}" alt="${column}" />
    </div>
  `;
};

const renderCell = (column, rawValue, row, context = 'table') => {
  const value = rawValue ?? '';
  if (state.thumbnailColumns.includes(column)) {
    const hasUploadField = Boolean(state.uploadFields[column]);
    const canPreview = hasUploadField || state.imageFields.includes(column);
    const interactive = context === 'modal' ? canPreview : hasUploadField;
    return renderThumbnail(column, value, row, { interactive });
  }
  if (typeof value === 'string' && value.startsWith('http')) {
    return `<a href="${value}" target="_blank" rel="noopener">${value}</a>`;
  }
  return value === '' ? '<span class="muted">&mdash;</span>' : value;
};

const getVisibleColumns = () => {
  let columns = state.columns.filter((col) => !state.hiddenColumns.includes(col));
  if (state.imageField && columns.includes(state.imageField)) {
    columns = columns.filter((col) => col !== state.imageField);
    const insertIndex = Math.min(2, columns.length);
    columns.splice(insertIndex, 0, state.imageField);
  }
  return columns;
};

const renderTable = () => {
  if (!els.head || !els.body) return;

  if (!state.activeTable) {
    els.head.innerHTML = '';
    els.body.innerHTML =
      '<tr><td class="empty" colspan="1">Selecciona una tabla para comenzar.</td></tr>';
    updatePaginationUI();
    updateScrollMirror();
    return;
  }

  if (!state.rows.length) {
    els.head.innerHTML = '';
    els.body.innerHTML =
      '<tr><td class="empty" colspan="1">Sin datos disponibles.</td></tr>';
    updatePaginationUI();
    updateScrollMirror();
    return;
  }

  const visibleColumns = getVisibleColumns();
  if (!visibleColumns.length) {
    els.head.innerHTML = '';
    els.body.innerHTML =
      '<tr><td class="empty" colspan="1">No hay columnas visibles.</td></tr>';
    updateScrollMirror();
    return;
  }

  const headHtml = `
    <tr>
      <th class="actions sticky">Acciones</th>
      ${visibleColumns.map((col) => `<th>${getColumnLabel(col)}</th>`).join('')}
    </tr>`;
  els.head.innerHTML = headHtml;

  els.body.innerHTML = state.rows
    .map((row) => {
      return `
        <tr data-id="${row[state.primaryKey]}">
          <td class="actions">
            <div class="data-admin__action-buttons">
              <button class="button button-secondary" data-action="edit" data-id="${row[state.primaryKey]}">Editar</button>
              <button class="button button-danger" data-action="delete" data-id="${row[state.primaryKey]}">Eliminar</button>
            </div>
          </td>
          ${visibleColumns
            .map(
              (col) =>
                `<td data-label="${getColumnLabel(col)}">${renderCell(col, row[col], row, 'table')}</td>`
            )
            .join('')}
        </tr>
      `;
    })
    .join('');
  updatePaginationUI();
  updateScrollMirror();
};

const applyDisplayMeta = (display = {}) => {
  state.hiddenColumns = display.hidden || [];
  state.columnLabels = display.labels || {};
  state.thumbnailColumns = display.thumbnail_columns || [];
  state.uploadFields = display.upload_fields || {};
  const imageFields =
    display.image_fields ||
    (display.image_field ? [display.image_field] : []) ||
    Object.keys(state.uploadFields).filter(
      (key) => (state.uploadFields[key]?.type || 'image') === 'image'
    );
  state.imageFields = imageFields;
  state.primaryImageColumn = imageFields[0] || null;
  state.imageField = state.primaryImageColumn;
  state.pendingImageRowId = null;
  state.pendingImageColumn = null;
  state.pendingUploadConfig = null;
  ensureActiveUploadColumn();
};

const renderMeta = () => {
  if (els.meta) {
    const label =
      state.tables.find((table) => table.id === state.activeTable)?.label || 'Tabla seleccionada';
    els.meta.textContent = `${label} · ${state.total} registro(s)`;
  }
  if (els.title) {
    const label =
      state.tables.find((table) => table.id === state.activeTable)?.label || 'Tabla seleccionada';
    els.title.textContent = label;
  }
};

const loadRows = async () => {
  if (!state.activeTable) {
    setStatus('Selecciona una tabla para comenzar.');
    return;
  }
  try {
    setStatus('Cargando información...', 'info');
    const data = await fetchJSON(
      `/api/data/${state.activeTable}?page=${state.page}&per_page=${state.perPage}`
    );
    state.rows = data.rows || [];
    state.columns = data.columns || [];
    state.total = data.total || 0;
    state.primaryKey = data.primary_key;
    applyDisplayMeta(data.display || {});
    const clamped = clampPage(state.page);
    if (clamped !== state.page && state.total > 0) {
      state.page = clamped;
      return loadRows();
    }
    renderMeta();
    renderTable();
    setStatus(
      `Mostrando ${state.rows.length} registro(s) de ${state.total}.`,
      'success'
    );
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'No se pudo cargar la tabla.', 'error');
  }
};

const loadTables = async () => {
  try {
    setStatus('Consultando tablas disponibles...', 'info');
    const data = await fetchJSON('/api/data/tables');
    state.tables = data;
    populateTableSelect();
    if (state.activeTable) {
      const tableMeta = state.tables.find((table) => table.id === state.activeTable);
      applyDisplayMeta(tableMeta?.display || {});
      renderMeta();
      await loadRows();
    } else {
      setStatus('No hay tablas configuradas.', 'error');
    }
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'No se pudieron obtener las tablas.', 'error');
  }
};

const openEditor = (row) => {
  if (!els.modal || !els.form) return;
  state.editingRow = row;
  els.modal.classList.remove('hidden');
  els.modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  els.editorTitle.textContent = `Editar registro (${state.primaryKey}: ${row[state.primaryKey]})`;
  els.editorSubtitle.textContent = `Tabla ${state.activeTable}`;

  const formColumns = state.columns.filter(
    (col) => !state.hiddenColumns.includes(col)
  );
  state.originalRow = { ...row };
  els.form.innerHTML = formColumns
    .map((col) => {
      const value = row[col] ?? '';
      const label = getColumnLabel(col);
      const isLong = String(value).length > 60;
      const uploadCfg = state.uploadFields[col];
      const isUploadField = Boolean(uploadCfg);
      const inputHtml = isUploadField
        ? `<input name="${col}" type="hidden" value="${value}" />`
        : isLong
          ? `<textarea name="${col}" rows="3">${value}</textarea>`
          : `<input name="${col}" type="text" value="${value}" />`;
      const preview =
        isUploadField && value
          ? `<div class="data-admin__image-preview" data-thumbnail-wrapper="${col}">
              ${renderThumbnail(col, value, row, { interactive: true })}
              <small>Haz clic para abrir o reemplazar.</small>
            </div>`
          : '';
      return `
        <div class="data-admin__field-wrapper">
          <label class="data-admin__field${isUploadField ? ' data-admin__field--hidden' : ''}">
            <span>${label}</span>
            ${inputHtml}
          </label>
          ${preview}
        </div>
      `;
    })
    .join('');

  ensureActiveUploadColumn();

};

const closeEditor = () => {
  if (!els.modal) return;
  state.editingRow = null;
  state.originalRow = null;
  els.modal.classList.add('hidden');
  els.modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  closeImageLightbox();
};

const handleEditSubmit = async (event) => {
  event.preventDefault();
  if (!state.activeTable || !state.editingRow) return;
  const formData = new FormData(els.form);
  const changes = {};
  const original = state.originalRow || {};
  const toComparable = (val) => {
    if (val === null || val === undefined || val === '') return null;
    return String(val);
  };
  formData.forEach((value, key) => {
    const normalized = value === '' ? null : value;
    const originalVal = Object.prototype.hasOwnProperty.call(original, key)
      ? original[key]
      : null;
    if (toComparable(normalized) !== toComparable(originalVal)) {
      changes[key] = normalized;
    }
  });
  if (!Object.keys(changes).length) {
    setStatus('No hay cambios para guardar.', 'info');
    return;
  }
  try {
    setStatus('Guardando cambios...', 'info');
    await fetchJSON(`/api/data/${state.activeTable}/${state.editingRow[state.primaryKey]}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes }),
    });
    closeEditor();
    await loadRows();
    setStatus('Registro actualizado correctamente.', 'success');
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'No se pudo guardar el registro.', 'error');
  }
};

const handleDelete = async (rowId) => {
  if (!state.activeTable || !rowId) return;
  const confirmed = window.confirm('¿Deseas eliminar este registro? Esta acción es permanente.');
  if (!confirmed) return;
  try {
    setStatus('Eliminando registro...', 'info');
    await fetchJSON(`/api/data/${state.activeTable}/${rowId}`, {
      method: 'DELETE',
    });
    await loadRows();
    setStatus('Registro eliminado.', 'success');
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'No se pudo eliminar el registro.', 'error');
  }
};

const handleThumbnailInteraction = (thumbnail) => {
  if (!thumbnail) return;
  const url = thumbnail.getAttribute('data-url') || '';
  const column = thumbnail.getAttribute('data-column');
  const thumbRowId = thumbnail.getAttribute('data-id');
  if (column) {
    state.activeUploadColumn = column;
  }
  const decodedUrl = url ? decodeURI(url) : '';
  const canUpdate =
    column &&
    (state.uploadFields[column] || state.imageFields.includes(column));
  if (canUpdate && thumbRowId) {
    openImageLightbox(decodedUrl, thumbRowId, column);
    return;
  }
  if (decodedUrl) {
    window.open(decodedUrl, '_blank', 'noopener,noreferrer');
  }
};

const getInteractiveThumbnail = (target) => {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest('.data-admin__thumbnail[data-interactive="true"]');
};

const handleTableAction = (event) => {
  const { target } = event;
  if (!(target instanceof HTMLElement)) return;
  const action = target.getAttribute('data-action');
  const rowId = target.getAttribute('data-id');
  if (action === 'edit' && rowId) {
    const row = state.rows.find(
      (item) => String(item[state.primaryKey]) === String(rowId)
    );
    if (row) {
      openEditor(row);
    }
  }
  if (action === 'delete' && rowId) {
    handleDelete(rowId);
  }

  const thumbnail = getInteractiveThumbnail(target);
  if (thumbnail) {
    handleThumbnailInteraction(thumbnail);
  }
};

const handleFormThumbnailClick = (event) => {
  const thumbnail = getInteractiveThumbnail(event.target);
  if (thumbnail) {
    event.preventDefault();
    handleThumbnailInteraction(thumbnail);
  }
};

const handleThumbnailKeydown = (event) => {
  if ((event.key !== 'Enter' && event.key !== ' ') || !(event.target instanceof HTMLElement)) {
    return;
  }
  const thumbnail = getInteractiveThumbnail(event.target);
  if (thumbnail) {
    event.preventDefault();
    handleThumbnailInteraction(thumbnail);
  }
};

const handleExport = async () => {
  if (!state.activeTable) return;
  try {
    setStatus('Preparando CSV...', 'info');
    const response = await fetch(`/api/data/${state.activeTable}/export`);
    if (!response.ok) {
      throw new Error('No se pudo exportar la tabla.');
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${state.activeTable}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    setStatus('CSV exportado.', 'success');
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'No se pudo exportar la tabla.', 'error');
  }
};

const handleImport = async (event) => {
  if (!state.activeTable || !event.target.files?.length) return;
  const file = event.target.files[0];
  const formData = new FormData();
  formData.append('file', file);
  try {
    setStatus('Importando CSV...', 'info');
    await fetchJSON(`/api/data/${state.activeTable}/import`, {
      method: 'POST',
      body: formData,
    });
    event.target.value = '';
    await loadRows();
    setStatus('Importación finalizada.', 'success');
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'No se pudo importar el archivo.', 'error');
  }
};

const handleImageUpload = async (event) => {
  const file = event.target.files?.[0];
  const rowId = state.pendingImageRowId;
  const column =
    state.pendingImageColumn ||
    state.imageFields[0] ||
    Object.keys(state.uploadFields || {})[0];
  event.target.value = '';
  if (!file || !rowId || !state.activeTable || !column) {
    return;
  }
  const formData = new FormData();
  formData.append('file', file);
  formData.append('column', column);
  try {
    setStatus('Subiendo archivo...', 'info');
    const result = await fetchJSON(`/api/data/${state.activeTable}/${rowId}/image`, {
      method: 'POST',
      body: formData,
    });
    const newUrl = result?.url;
    const usedColumn = result?.column || column;
    if (usedColumn) {
      state.activeUploadColumn = usedColumn;
    }
    if (newUrl) {
      state.rows = state.rows.map((row) =>
        String(row[state.primaryKey]) === String(rowId)
          ? { ...row, [usedColumn]: newUrl }
          : row
      );
      if (state.editingRow && String(state.editingRow[state.primaryKey]) === String(rowId)) {
        state.editingRow[usedColumn] = newUrl;
        if (state.originalRow) {
          state.originalRow[usedColumn] = newUrl;
        }
        const hiddenInput = els.form?.querySelector(`input[name="${usedColumn}"]`);
        if (hiddenInput) hiddenInput.value = newUrl;
        const wrapper = els.form?.querySelector(`[data-thumbnail-wrapper="${usedColumn}"]`);
        if (wrapper) {
          wrapper.innerHTML = `
            ${renderThumbnail(usedColumn, newUrl, state.editingRow, { interactive: true })}
            <small>Haz clic para abrir o reemplazar.</small>
          `;
        }
      }
    }
    setStatus('Archivo actualizado.', 'success');
    await loadRows();
    closeImageLightbox();
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'No se pudo actualizar el archivo.', 'error');
  }
};

const openImageLightbox = (url, rowId, column = null) => {
  if (!els.lightbox || !els.lightboxImg) {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    return;
  }
  const fallbackColumn =
    column ||
    Object.keys(state.uploadFields || {})[0] ||
    state.imageFields[0] ||
    null;
  const uploadCfg = (fallbackColumn && state.uploadFields[fallbackColumn]) || {};
  const kind = uploadCfg.type || 'image';
  const hasUrl = Boolean(url);

  state.pendingUploadConfig = uploadCfg;
  els.lightbox.hidden = false;
  els.lightbox.setAttribute('aria-hidden', 'false');

  if (kind === 'image' && hasUrl) {
    els.lightboxImg.hidden = false;
    els.lightboxImg.src = url;
    els.lightboxImg.alt = `Vista previa (${rowId})`;
  } else {
    els.lightboxImg.hidden = true;
    els.lightboxImg.removeAttribute('src');
  }

  if (els.lightboxLink && els.lightboxLinkAnchor) {
    if (kind === 'file' && hasUrl) {
      els.lightboxLinkAnchor.href = url;
      els.lightboxLink.removeAttribute('hidden');
    } else {
      els.lightboxLink.setAttribute('hidden', 'hidden');
      els.lightboxLinkAnchor.removeAttribute('href');
    }
  }

  if (els.lightboxEmpty) {
    if (!hasUrl) {
      els.lightboxEmpty.textContent =
        kind === 'file'
          ? 'Este registro no tiene archivo. Sube uno nuevo.'
          : 'Este registro no tiene imagen. Sube una nueva.';
      els.lightboxEmpty.hidden = false;
    } else {
      els.lightboxEmpty.hidden = true;
    }
  }

  if (els.lightboxUploadBtn) {
    els.lightboxUploadBtn.textContent =
      kind === 'file' ? 'Cargar nuevo archivo' : 'Cargar nueva imagen';
  }

  state.pendingImageRowId = rowId;
  state.pendingImageColumn = fallbackColumn;
  if (fallbackColumn) {
    state.activeUploadColumn = fallbackColumn;
  } else {
    ensureActiveUploadColumn();
  }
  document.body.classList.add('modal-open');
};

const closeImageLightbox = () => {
  if (!els.lightbox || !els.lightboxImg) return;
  els.lightbox.hidden = true;
  els.lightbox.setAttribute('aria-hidden', 'true');
  els.lightboxImg.removeAttribute('src');
  els.lightboxImg.hidden = false;
  if (els.lightboxLink) {
    els.lightboxLink.setAttribute('hidden', 'hidden');
  }
  if (els.lightboxLinkAnchor) {
    els.lightboxLinkAnchor.removeAttribute('href');
  }
  if (els.lightboxEmpty) {
    els.lightboxEmpty.hidden = true;
  }
  state.pendingImageRowId = null;
  state.pendingImageColumn = null;
  state.pendingUploadConfig = null;
  if (els.imageInput) {
    els.imageInput.accept = '*/*';
  }
  document.body.classList.remove('modal-open');
};

const initDataAdmin = () => {
  if (!els.tableSelect) return;
  initScrollSync();
  updateScrollMirror();
  loadTables();
  window.addEventListener('resize', updateScrollMirror);

  els.tableSelect.addEventListener('change', (event) => {
    const value = event.target.value;
    state.activeTable = value || null;
    state.page = 1;
    const tableMeta = state.tables.find((table) => table.id === state.activeTable);
    applyDisplayMeta(tableMeta?.display || {});
    loadRows();
  });

  els.reloadBtn?.addEventListener('click', () => {
    state.page = 1;
    loadRows();
  });

  els.prevBtn?.addEventListener('click', () => {
    if (state.page > 1) {
      state.page -= 1;
      loadRows();
    }
  });

  els.nextBtn?.addEventListener('click', () => {
    if (state.page < getTotalPages()) {
      state.page += 1;
      loadRows();
    }
  });

  els.perPageSelect?.addEventListener('change', (event) => {
    const value = parseInt(event.target.value, 10);
    if (Number.isNaN(value) || value <= 0) {
      event.target.value = state.perPage;
      return;
    }
    if (value === state.perPage) {
      return;
    }
    state.perPage = value;
    state.page = 1;
    loadRows();
  });

  const pageInputHandler = () => handlePageJump();
  els.pageInput?.addEventListener('change', pageInputHandler);
  els.pageInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      pageInputHandler();
    }
  });

  els.exportBtn?.addEventListener('click', handleExport);

  els.importBtn?.addEventListener('click', () => els.importInput?.click());
  els.importInput?.addEventListener('change', handleImport);
  els.imageInput?.addEventListener('change', handleImageUpload);

  els.body?.addEventListener('click', handleTableAction);
  els.body?.addEventListener('keydown', handleThumbnailKeydown);
  els.form?.addEventListener('click', handleFormThumbnailClick);
  els.form?.addEventListener('keydown', handleThumbnailKeydown);

  els.form?.addEventListener('submit', handleEditSubmit);
  document.querySelectorAll('[data-close-editor]').forEach((element) => {
    element.addEventListener('click', closeEditor);
  });


  els.lightbox?.addEventListener('click', (event) => {
    if (event.target === els.lightbox || event.target.hasAttribute('data-close-lightbox')) {
      closeImageLightbox();
    }
  });
  els.lightboxUploadBtn?.addEventListener('click', () => {
    if (!els.imageInput) {
      setStatus('No se encontró el selector de archivos para subir imagen.', 'error');
      return;
    }
    const cfg = state.pendingUploadConfig || {};
    const accept = cfg.accept || (cfg.type === 'file' ? '*/*' : 'image/*');
    els.imageInput.accept = accept;
    els.imageInput.value = '';
    els.imageInput.click();
  });
};

document.addEventListener('DOMContentLoaded', initDataAdmin);



