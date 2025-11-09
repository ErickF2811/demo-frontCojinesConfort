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
  imageField: null,
  pendingImageRowId: null,
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
  indicator: document.getElementById('dataPageIndicator'),
  modal: document.getElementById('dataEditorModal'),
  form: document.getElementById('dataEditorForm'),
  editorTitle: document.getElementById('dataEditorTitle'),
  editorSubtitle: document.getElementById('dataEditorSubtitle'),
  imageInput: document.getElementById('dataImageInput'),
  lightbox: document.getElementById('dataLightbox'),
  lightboxImg: document.getElementById('dataLightboxImg'),
  lightboxUploadBtn: document.getElementById('dataLightboxUploadBtn'),
  imageModalBtn: document.getElementById('dataImageModalBtn'),
  lightboxEmpty: document.getElementById('dataLightboxEmpty'),
};

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
  if (!value) return '<span class="muted">Sin archivo</span>';
  const encodedUrl = encodeURI(value);
  const rowId = row[state.primaryKey];
  if (isPdfUrl(value)) {
    if (!interactive) {
      return `<a class="data-admin__pdf-link" href="${encodedUrl}" target="_blank" rel="noopener">PDF</a>`;
    }
    return `
      <button
        type="button"
        class="data-admin__thumbnail data-admin__thumbnail--pdf"
        data-url="${encodedUrl}"
        data-column="${column}"
        data-id="${rowId}"
        data-interactive="true"
      >
        PDF
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
    >
      <img src="${encodedUrl}" alt="${column}" />
      <span>Ver</span>
    </div>
  `;
};

const renderCell = (column, rawValue, row, context = 'table') => {
  const value = rawValue ?? '';
  if (state.thumbnailColumns.includes(column)) {
    return renderThumbnail(column, value, row, {
      interactive: context === 'modal',
    });
  }
  if (typeof value === 'string' && value.startsWith('http')) {
    return `<a href="${value}" target="_blank" rel="noopener">${value}</a>`;
  }
  return value === '' ? '<span class="muted">—</span>' : value;
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
    return;
  }

  if (!state.rows.length) {
    els.head.innerHTML = '';
    els.body.innerHTML =
      '<tr><td class="empty" colspan="1">Sin datos disponibles.</td></tr>';
    return;
  }

  const visibleColumns = getVisibleColumns();
  if (!visibleColumns.length) {
    els.head.innerHTML = '';
    els.body.innerHTML =
      '<tr><td class="empty" colspan="1">No hay columnas visibles.</td></tr>';
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
            <button class="button button-secondary" data-action="edit" data-id="${row[state.primaryKey]}">Editar</button>
            <button class="button button-danger" data-action="delete" data-id="${row[state.primaryKey]}">Eliminar</button>
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

  if (els.indicator) {
    const totalPages = Math.max(1, Math.ceil(state.total / state.perPage));
    els.indicator.textContent = `${state.page} / ${totalPages}`;
  }
  if (els.prevBtn) {
    els.prevBtn.disabled = state.page <= 1;
  }
  if (els.nextBtn) {
    els.nextBtn.disabled = state.page * state.perPage >= state.total;
  }
};

const applyDisplayMeta = (display = {}) => {
  state.hiddenColumns = display.hidden || [];
  state.columnLabels = display.labels || {};
  state.thumbnailColumns = display.thumbnail_columns || [];
  state.imageField = display.image_field || null;
  state.pendingImageRowId = null;
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
      const isImageField = col === state.imageField;
      const inputHtml = isImageField
        ? `<input name="${col}" type="hidden" value="${value}" />`
        : isLong
          ? `<textarea name="${col}" rows="3">${value}</textarea>`
          : `<input name="${col}" type="text" value="${value}" />`;
      const preview =
        state.thumbnailColumns.includes(col) && value
          ? `<div class="data-admin__image-preview" data-thumbnail-wrapper="${col}">
              ${renderThumbnail(col, value, row, { interactive: true })}
              ${isImageField ? '<small>Haz clic para abrir o reemplazar.</small>' : ''}
            </div>`
          : '';
      return `
        <div class="data-admin__field-wrapper">
          <label class="data-admin__field${isImageField ? ' data-admin__field--hidden' : ''}">
            <span>${label}</span>
            ${inputHtml}
          </label>
          ${preview}
        </div>
      `;
    })
    .join('');

  if (els.imageModalBtn) {
    if (state.imageField) {
      els.imageModalBtn.hidden = false;
      els.imageModalBtn.disabled = false;
      els.imageModalBtn.dataset.rowId = row[state.primaryKey];
    } else {
      els.imageModalBtn.hidden = true;
    }
  }
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
  const url = thumbnail.getAttribute('data-url');
  const column = thumbnail.getAttribute('data-column');
  const thumbRowId = thumbnail.getAttribute('data-id');
  if (!url) return;
  const decodedUrl = decodeURI(url);
  if (state.imageField && column === state.imageField && thumbRowId) {
    openImageLightbox(decodedUrl, thumbRowId);
    return;
  }
  window.open(decodedUrl, '_blank', 'noopener,noreferrer');
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

  const thumbnail = target.closest('.data-admin__thumbnail[data-interactive="true"]');
  if (thumbnail) {
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
  event.target.value = '';
  if (!file || !rowId || !state.activeTable) {
    return;
  }
  const formData = new FormData();
  formData.append('file', file);
  try {
    setStatus('Subiendo imagen...', 'info');
    const result = await fetchJSON(`/api/data/${state.activeTable}/${rowId}/image`, {
      method: 'POST',
      body: formData,
    });
    const newUrl = result?.url;
    if (newUrl) {
      state.rows = state.rows.map((row) =>
        String(row[state.primaryKey]) === String(rowId)
          ? { ...row, [state.imageField]: newUrl }
          : row
      );
      if (
        state.editingRow &&
        String(state.editingRow[state.primaryKey]) === String(rowId) &&
        state.imageField
      ) {
        state.editingRow[state.imageField] = newUrl;
        if (state.originalRow) {
          state.originalRow[state.imageField] = newUrl;
        }
        const hiddenInput = els.form?.querySelector(
          `input[name="${state.imageField}"]`
        );
        if (hiddenInput) hiddenInput.value = newUrl;
        const wrapper = els.form?.querySelector(
          `[data-thumbnail-wrapper="${state.imageField}"]`
        );
        if (wrapper) {
          wrapper.innerHTML = `
            ${renderThumbnail(state.imageField, newUrl, state.editingRow)}
            <small>Haz clic para abrir o reemplazar.</small>
          `;
        }
      }
    }
    setStatus('Imagen actualizada.', 'success');
    await loadRows();
    closeImageLightbox();
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'No se pudo actualizar la imagen.', 'error');
  }
};

const openImageLightbox = (url, rowId) => {
  if (!els.lightbox || !els.lightboxImg) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  els.lightbox.hidden = false;
  els.lightbox.setAttribute('aria-hidden', 'false');
  if (url) {
    els.lightboxImg.hidden = false;
    els.lightboxImg.src = url;
    els.lightboxImg.alt = `Vista previa (${rowId})`;
    if (els.lightboxEmpty) {
      els.lightboxEmpty.hidden = true;
    }
  } else {
    els.lightboxImg.hidden = true;
    if (els.lightboxEmpty) {
      els.lightboxEmpty.hidden = false;
    }
  }
  state.pendingImageRowId = rowId;
  document.body.classList.add('modal-open');
};

const closeImageLightbox = () => {
  if (!els.lightbox || !els.lightboxImg) return;
  els.lightbox.hidden = true;
  els.lightbox.setAttribute('aria-hidden', 'true');
  els.lightboxImg.src = '';
  els.lightboxImg.hidden = false;
  if (els.lightboxEmpty) {
    els.lightboxEmpty.hidden = true;
  }
  state.pendingImageRowId = null;
  document.body.classList.remove('modal-open');
};

const initDataAdmin = () => {
  if (!els.tableSelect) return;
  loadTables();

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
    if (state.page * state.perPage < state.total) {
      state.page += 1;
      loadRows();
    }
  });

  els.exportBtn?.addEventListener('click', handleExport);

  els.importBtn?.addEventListener('click', () => els.importInput?.click());
  els.importInput?.addEventListener('change', handleImport);
  els.imageInput?.addEventListener('change', handleImageUpload);

  els.body?.addEventListener('click', handleTableAction);
  els.body?.addEventListener('keydown', (event) => {
    if (
      (event.key === 'Enter' || event.key === ' ') &&
      event.target instanceof HTMLElement
    ) {
      const thumb = event.target.closest('.data-admin__thumbnail');
      if (thumb) {
        event.preventDefault();
        handleThumbnailInteraction(thumb);
      }
    }
  });

  els.form?.addEventListener('submit', handleEditSubmit);
  document.querySelectorAll('[data-close-editor]').forEach((element) => {
    element.addEventListener('click', closeEditor);
  });

  els.imageModalBtn?.addEventListener('click', () => {
    if (!state.imageField || !state.editingRow) {
      setStatus('No hay imagen asociada a este registro.', 'error');
      return;
    }
    const url = state.editingRow[state.imageField] || '';
    const rowId = state.editingRow[state.primaryKey];
    openImageLightbox(url, rowId);
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
    els.imageInput.value = '';
    els.imageInput.click();
  });
};

document.addEventListener('DOMContentLoaded', initDataAdmin);



