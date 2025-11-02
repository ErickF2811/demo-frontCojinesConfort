const filtersForm = document.getElementById("filtersForm");
const refreshButton = document.getElementById("refreshButton");
const resetButton = document.getElementById("resetFilters");
const resultsSummary = document.getElementById("resultsSummary");
const tableBody = document.getElementById("materialsTableBody");
const perPageSelect = document.getElementById("perPage");
const prevPageBtn = document.getElementById("prevPage");
const nextPageBtn = document.getElementById("nextPage");
const pageInput = document.getElementById("pageInput");
const totalPagesEl = document.getElementById("totalPages");

// Dropdown config for checkbox multi-selects
const filtersConfig = {
  material_name: {
    toggle: document.getElementById('dd-material_name'),
    panel: document.getElementById('panel-material_name'),
    options: document.getElementById('opts-material_name')
  },
  color: {
    toggle: document.getElementById('dd-color'),
    panel: document.getElementById('panel-color'),
    options: document.getElementById('opts-color')
  },
  tipo: {
    toggle: document.getElementById('dd-tipo'),
    panel: document.getElementById('panel-tipo'),
    options: document.getElementById('opts-tipo')
  },
  categoria: {
    toggle: document.getElementById('dd-categoria'),
    panel: document.getElementById('panel-categoria'),
    options: document.getElementById('opts-categoria')
  },
  provider_name: {
    toggle: document.getElementById('dd-provider_name'),
    panel: document.getElementById('panel-provider_name'),
    options: document.getElementById('opts-provider_name')
  }
};

function createOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function populateCheckboxes(optionsContainer, values) {
  if (!optionsContainer) return;
  optionsContainer.innerHTML = '';
  values.forEach((val) => {
    const id = `${optionsContainer.id}-${val}`;
    const wrap = document.createElement('label');
    wrap.className = 'option-check';
    wrap.innerHTML = `<input type="checkbox" value="${val}"><span>${val}</span>`;
    optionsContainer.appendChild(wrap);
  });
}

function filterOptions(key, query) {
  const conf = filtersConfig[key];
  if (!conf?.options) return;
  const q = (query || '').toLowerCase();
  conf.options.querySelectorAll('.option-check').forEach(el => {
    const text = el.textContent.toLowerCase();
    el.style.display = q === '' || text.includes(q) ? '' : 'none';
  });
}

async function fetchFilters() {
  try {
    const response = await fetch("/api/filters");
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    Object.entries(filtersConfig).forEach(([key, conf]) => {
      populateCheckboxes(conf.options, data[key] || []);
      updateDropdownLabel(key);
    });
  } catch (error) {
    console.error("Error al cargar filtros", error);
    resultsSummary.textContent = "Error al cargar los filtros.";
  }
}

function selectedValues(key) {
  const conf = filtersConfig[key];
  if (!conf || !conf.options) return [];
  return Array.from(conf.options.querySelectorAll('input[type="checkbox"]:checked')).map(i => i.value);
}

function updateDropdownLabel(key) {
  const conf = filtersConfig[key];
  if (!conf || !conf.toggle) return;
  const count = selectedValues(key).length;
  if (conf.toggle.tagName === 'INPUT') {
    if (!conf.toggle.value) conf.toggle.placeholder = count === 0 ? 'Todos' : `${count} seleccionado(s)`;
  } else {
    conf.toggle.textContent = count === 0 ? 'Todos' : `${count} seleccionado(s)`;
  }
}

function buildQueryParams() {
  const params = new URLSearchParams();
  Object.keys(filtersConfig).forEach((key) => {
    selectedValues(key).forEach(v => params.append(key, v));
  });
  return params.toString();
}

function renderImageCell(url, altText, id) {
  if (!url) return "—";
  const safeAlt = altText || "Material";
  return `<button class="thumb-btn" data-id="${id || ''}" aria-label="Ver detalle"><img src="${url}" alt="${safeAlt}" class="thumb" loading="lazy" referrerpolicy="no-referrer" /></button>`;
}

function renderTableRows(data) {
  tableBody.innerHTML = "";
  if (!Array.isArray(data) || data.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="10" class="empty">No se encontraron materiales con los filtros seleccionados.</td>';
    tableBody.appendChild(row);
    return;
  }

  // Map by id for later detail lookup
  window.__materialsById = window.__materialsById || new Map();

  data.forEach((item) => {
    const row = document.createElement("tr");
    const cost = item.costo_unitario != null ? Number(item.costo_unitario) : null;
    const stock = item.stock_actual != null ? Number(item.stock_actual) : 0;
    row.dataset.idMaterial = item.id_material || "";
    try { window.__materialsById.set(item.id_material, item); } catch {}
    const url = item.image_url || item.storage_account;
    row.innerHTML = `
      <td class="image-cell" data-label="Imagen">${renderImageCell(url, item.imagen_name || item.material_name, item.id_material)}</td>
      <td data-label="ID">${item.id_material || ""}</td>
      <td data-label="Material">${item.material_name}</td>
      <td data-label="Color">${item.color}</td>
      <td data-label="Categoría">${item.categoria}</td>
      <td data-label="Proveedor">${item.provider_name || item.proveedor || ""}</td>
      <td data-label="Unidad">${item.unidad || ""}</td>
      <td data-label="Costo unitario" class="text-right">${cost === null ? "—" : cost.toLocaleString("es-ES", { style: "currency", currency: "USD" })}</td>
      <td data-label="Stock" class="text-right ${stock < 0 ? "text-danger" : ""}">${stock.toLocaleString("es-ES")}</td>
      <td data-label="Tipo">${item.tipo}</td>
    `;
    tableBody.appendChild(row);
    // Click handler to open detail modal (row itself)
    row.style.cursor = "pointer";
    row.addEventListener("click", () => openDetail(item.id_material, item));
  });
}

let sortBy = "id";
let sortDir = "asc"; // asc | desc
let currentPage = 1;
let perPage = 20;
let totalItems = 0;

async function fetchMaterials() {
  try {
    resultsSummary.textContent = "Consultando base de datos…";
    tableBody.innerHTML = '<tr><td colspan="10" class="empty">Cargando…</td></tr>';
    const qp = buildQueryParams();
    const extra = new URLSearchParams({ sort_by: sortBy, sort_dir: sortDir, page: String(currentPage), per_page: String(perPage) });
    const qs = [qp, extra.toString()].filter(Boolean).join("&");
    const response = await fetch(`/api/materiales${qs ? `?${qs}` : ""}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    const rows = Array.isArray(data) ? data : (data.data || []);
    totalItems = Array.isArray(data) ? rows.length : (data.total ?? rows.length);
    const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
    renderTableRows(rows);
    resultsSummary.textContent = `${totalItems} material(es) encontrados.`;
    // Update pager
    if (pageInput) pageInput.value = String(currentPage);
    if (totalPagesEl) totalPagesEl.textContent = `/ ${totalPages}`;
    if (prevPageBtn) prevPageBtn.disabled = currentPage <= 1;
    if (nextPageBtn) nextPageBtn.disabled = currentPage >= totalPages;
  } catch (error) {
    console.error("Error al cargar materiales", error);
    resultsSummary.textContent = "Hubo un problema al obtener los datos.";
    tableBody.innerHTML = '<tr><td colspan="9" class="empty">No fue posible cargar la información.</td></tr>';
  }
}

filtersForm.addEventListener("submit", (event) => {
  event.preventDefault();
  fetchMaterials();
});

refreshButton.addEventListener("click", () => {
  fetchFilters().then(fetchMaterials);
});

resetButton.addEventListener("click", () => {
  // Limpiar checkboxes de todos los dropdowns y actualizar etiqueta
  Object.entries(filtersConfig).forEach(([key, conf]) => {
    if (!conf?.options) return;
    conf.options.querySelectorAll('input[type="checkbox"]').forEach(i => i.checked = false);
    updateDropdownLabel(key);
  });
  fetchMaterials();
});

window.addEventListener("DOMContentLoaded", () => {
  fetchFilters().then(fetchMaterials);
  // Event delegation to ensure clicks on image/text trigger the same
  tableBody.addEventListener("click", (e) => {
    const thumbBtn = e.target.closest('.thumb-btn');
    if (thumbBtn && thumbBtn.dataset.id) {
      const id = thumbBtn.dataset.id;
      const base = (window.__materialsById && window.__materialsById.get(id)) || {};
      openDetail(id, base);
      return;
    }
    const tr = e.target.closest("tr");
    if (!tr || !tr.dataset.idMaterial) return;
    const id = tr.dataset.idMaterial;
    const base = (window.__materialsById && window.__materialsById.get(id)) || {};
    openDetail(id, base);
  });
  // Pager handlers
  perPageSelect?.addEventListener('change', () => {
    perPage = Number(perPageSelect.value || 20) || 20;
    currentPage = 1;
    fetchMaterials();
  });
  prevPageBtn?.addEventListener('click', () => {
    if (currentPage > 1) { currentPage -= 1; fetchMaterials(); }
  });
  nextPageBtn?.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
    if (currentPage < totalPages) { currentPage += 1; fetchMaterials(); }
  });
  pageInput?.addEventListener('change', () => {
    const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
    let p = Number(pageInput.value || 1) || 1;
    p = Math.max(1, Math.min(totalPages, p));
    currentPage = p;
    fetchMaterials();
  });
  // Dropdown toggles
  Object.entries(filtersConfig).forEach(([key, conf]) => {
    // Abrir al click o al enfocar
    conf.toggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      // cerrar otros primero
      Object.values(filtersConfig).forEach(c => c.toggle?.parentElement.classList.remove('open'));
      conf.toggle.parentElement.classList.toggle('open');
    });
    conf.toggle?.addEventListener('focus', (e) => {
      e.stopPropagation();
      Object.values(filtersConfig).forEach(c => c.toggle?.parentElement.classList.remove('open'));
      conf.toggle.parentElement.classList.add('open');
    });
    // Buscar mientras escribe
    conf.toggle?.addEventListener('input', () => {
      filterOptions(key, conf.toggle.value || '');
    });
    conf.panel?.addEventListener('click', (e) => e.stopPropagation());
    conf.options?.addEventListener('change', () => updateDropdownLabel(key));
  });
  document.addEventListener('click', (e) => {
    Object.values(filtersConfig).forEach(conf => conf.toggle?.parentElement.classList.remove('open'));
  });
  // Actions: select-all / clear
  document.querySelectorAll('.dropdown-actions .link').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const key = btn.getAttribute('data-key');
      const action = btn.getAttribute('data-action');
      const conf = filtersConfig[key];
      if (!conf) return;
      const inputs = Array.from(conf.options.querySelectorAll('input[type="checkbox"]'));
      if (action === 'select-all') inputs.forEach(i => i.checked = true);
      if (action === 'clear') inputs.forEach(i => i.checked = false);
      updateDropdownLabel(key);
      // si se limpió, también limpiamos el texto de búsqueda
      if (action === 'clear' && conf.toggle?.tagName === 'INPUT') {
        conf.toggle.value = '';
        filterOptions(key, '');
      }
    });
  });
});

// ---------- Detail Modal ----------
const modal = document.getElementById("detailModal");
const modalClose = document.getElementById("detailClose");
const detailTitle = document.getElementById("detailTitle");
const detailSub = document.getElementById("detailSub");
const detailImage = document.getElementById("detailImage");
const obsTable = document.getElementById("obsTable");
const chartEl = document.getElementById("chart");
const chartCompactEl = document.getElementById("chartCompact");
const summaryEl = document.getElementById("summary");
const kpisEl = document.getElementById("kpis");
const imgLightbox = document.getElementById("imgLightbox");
const lightboxImg = document.getElementById("lightboxImg");
const detailPreview = document.getElementById("detailPreview");

modalClose?.addEventListener("click", () => hideModal());
// Cerrar al hacer clic fuera de la tarjeta (en el fondo) o en el contenedor modal
modal?.addEventListener("click", (e) => {
  const t = e.target;
  if (t === modal || (t?.classList && t.classList.contains("modal__backdrop"))) {
    hideModal();
  }
});
// Cerrar con tecla Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.classList.contains("hidden")) hideModal();
});

function showModal() {
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  // Fallback display in case of stale CSS state
  modal.style.display = 'block';
}
function hideModal() {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  modal.style.display = '';
}

async function openDetail(idMaterial, baseData) {
  // Siempre mostrar el modal primero; luego cargar datos
  // Header info
  detailTitle.textContent = `${baseData?.material_name || "Material"} · ${idMaterial}`;
  detailSub.textContent = `${baseData?.proveedor || baseData?.provider_name || ""} · ${baseData?.categoria || ""}`;
  const imgUrl = baseData?.image_url || baseData?.storage_account || "";
  if (imgUrl) {
    if (detailImage) {
      detailImage.src = imgUrl;
      detailImage.alt = baseData?.imagen_name || baseData?.material_name || "Material";
      detailImage.referrerPolicy = "no-referrer";
    }
    if (detailPreview) {
      detailPreview.src = imgUrl;
      detailPreview.alt = baseData?.imagen_name || baseData?.material_name || "Material";
      detailPreview.referrerPolicy = "no-referrer";
    }
  } else {
    if (detailImage) detailImage.removeAttribute("src");
    if (detailPreview) detailPreview.removeAttribute("src");
  }
  if (chartEl) chartEl.innerHTML = "Cargando movimientos…";
  if (chartCompactEl) chartCompactEl.innerHTML = "";
  if (obsTable) obsTable.innerHTML = "";
  if (summaryEl) summaryEl.textContent = "Cargando…";
  if (kpisEl) kpisEl.innerHTML = "";
  showModal();

  try {
    // Fetch detail to ensure we have image_url/provider/category fresh from DB
    try {
      const dres = await fetch(`/api/materiales/${encodeURIComponent(idMaterial)}`);
      const det = await dres.json();
      if (!det.error) {
        detailTitle.textContent = `${det.material_name || baseData?.material_name || 'Material'} · ${idMaterial}`;
        detailSub.textContent = `${det.provider_name || det.proveedor || ''} · ${det.categoria || ''}`;
        const durl = det.image_url || det.storage_account;
        if (durl) {
          if (detailImage) {
            detailImage.src = durl;
            detailImage.alt = det.imagen_name || det.material_name || 'Material';
            detailImage.referrerPolicy = 'no-referrer';
          }
          if (detailPreview) {
            detailPreview.src = durl;
            detailPreview.alt = det.imagen_name || det.material_name || 'Material';
            detailPreview.referrerPolicy = 'no-referrer';
          }
        }
      }
    } catch {}

    const res = await fetch(`/api/materiales/${encodeURIComponent(idMaterial)}/movimientos?limit=5`);
    const movimientos = await res.json();
    if (movimientos.error) throw new Error(movimientos.error);

    // De-dup movements (avoid repeated rows)
    const movs = Array.isArray(movimientos) ? (() => {
      const seen = new Set();
      const out = [];
      for (const m of movimientos) {
        const key = m.id_movimiento || `${m.fecha}|${m.tipo}|${m.cantidad}|${m.unidad}|${m.motivo||''}|${m.observaciones||''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(m);
      }
      return out;
    })() : [];

    // Observaciones (clear to avoid duplicates)
    if (obsTable) obsTable.innerHTML = "";
    // Observaciones
    if (Array.isArray(movs) && movs.length) {
      movs.forEach((m) => {
        const tr = document.createElement("tr");
        const fechaTxt = m.fecha ? new Date(m.fecha).toLocaleString("es-ES") : "";
        const cantidadTxt = (m.cantidad != null ? Number(m.cantidad) : 0).toLocaleString("es-ES");
        tr.innerHTML = `
          <td>${fechaTxt}</td>
          <td>${m.tipo || ""}</td>
          <td>${cantidadTxt} ${m.unidad || ""}</td>
          <td>${m.motivo || ""}</td>
          <td>${m.observaciones || ""}</td>
        `;
        obsTable.appendChild(tr);
      });
    } else {
      const tr = document.createElement("tr");
      tr.innerHTML = '<td colspan="5" class="empty">Sin movimientos</td>';
      obsTable.appendChild(tr);
    }

    // Gráficas
    if (chartEl) chartEl.innerHTML = buildMovementsChart(movs);
    if (chartCompactEl) chartCompactEl.innerHTML = buildCompactChart(movs);

    // KPIs
    const totalSalidas = (movs || []).filter(m => (m.tipo || "").toLowerCase() === "salida")
      .reduce((acc, m) => acc + Number(m.cantidad || 0), 0);
    const totalEntradas = (movs || []).filter(m => (m.tipo || "").toLowerCase() === "entrada")
      .reduce((acc, m) => acc + Number(m.cantidad || 0), 0);
    if (summaryEl) summaryEl.textContent = `Últimos 5 · Entradas: ${totalEntradas.toLocaleString("es-ES")} · Salidas: ${totalSalidas.toLocaleString("es-ES")}`;
    if (kpisEl) kpisEl.innerHTML = `
      <li>Últimos 5</li>
      <li>Entradas: <strong>${totalEntradas.toLocaleString("es-ES")}</strong></li>
      <li>Salidas: <strong>${totalSalidas.toLocaleString("es-ES")}</strong></li>
    `;

    // Fundas (únicas en últimos 5)
    const fundasList = document.getElementById("fundasList");
    if (fundasList) {
      fundasList.innerHTML = '';
      const fundas = Array.from(new Set((movs || []).map(m => (m.funda || '').trim()).filter(Boolean)));
      if (fundas.length === 0) {
        const span = document.createElement('span');
        span.className = 'muted';
        span.textContent = 'Sin fundas';
        fundasList.appendChild(span);
      } else {
        fundas.forEach(f => {
          const tag = document.createElement('span');
          tag.className = 'tag';
          tag.textContent = f;
          fundasList.appendChild(tag);
        });
      }
    }
  } catch (err) {
    console.error("Detalle material", err);
    if (chartEl) chartEl.textContent = "No fue posible cargar el detalle.";
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="5" class="empty">No fue posible cargar movimientos</td>';
    obsTable.appendChild(tr);
    if (summaryEl) summaryEl.textContent = "";
  }
}

// Expose opener globally for inline usage if needed
window.openMaterialDetail = openDetail;

// Lightbox open/close
detailImage?.addEventListener("click", () => {
  if (!detailImage.src) return;
  lightboxImg.src = detailImage.src;
  imgLightbox.classList.remove("hidden");
  imgLightbox.setAttribute("aria-hidden", "false");
});
detailPreview?.addEventListener("click", () => {
  if (!detailPreview.src) return;
  lightboxImg.src = detailPreview.src;
  imgLightbox.classList.remove("hidden");
  imgLightbox.setAttribute("aria-hidden", "false");
});
imgLightbox?.addEventListener("click", () => {
  imgLightbox.classList.add("hidden");
  imgLightbox.setAttribute("aria-hidden", "true");
});

function buildCompactChart(movs) {
  if (!Array.isArray(movs) || movs.length === 0) {
    return '<div class="empty">Sin datos</div>';
  }
  const data = [...movs].reverse().slice(0, 5).reverse();
  const entradas = data.map(m => (m.tipo || "").toLowerCase() === "entrada" ? Number(m.cantidad || 0) : 0);
  const salidas = data.map(m => (m.tipo || "").toLowerCase() === "salida" ? Number(m.cantidad || 0) : 0);
  const width = 200, height = 160, pad = 16;
  const n = data.length;
  const maxVal = Math.max(1, ...entradas, ...salidas);
  const barW = Math.floor((width - pad*2) / (n));

  let rects = '';
  for (let i = 0; i < n; i++) {
    const eH = (entradas[i] / maxVal) * (height - pad*2);
    const sH = (salidas[i] / maxVal) * (height - pad*2);
    const x = pad + i * (barW + 6);
    rects += `<rect x="${x}" y="${height - pad - eH}" width="${barW/2}" height="${Math.max(0,eH)}" fill="#10b981" rx="3" />`;
    rects += `<rect x="${x + barW/2}" y="${height - pad - sH}" width="${barW/2}" height="${Math.max(0,sH)}" fill="#ef4444" rx="3" />`;
  }
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="100%">${rects}</svg>`;
}

function buildMovementsChart(movs) {
  if (!Array.isArray(movs) || movs.length === 0) {
    return '<div class="empty">Sin datos</div>';
  }
  // Order asc by date
  const data = [...movs].sort((a,b) => new Date(a.fecha) - new Date(b.fecha));
  const labels = data.map(m => new Date(m.fecha));
  const entradas = data.map(m => (m.tipo || "").toLowerCase() === "entrada" ? Number(m.cantidad || 0) : 0);
  const salidas = data.map(m => (m.tipo || "").toLowerCase() === "salida" ? Number(m.cantidad || 0) : 0);

  // Vertical bars (fecha en X)
  const width = 680, height = 300, padX = 40, padY = 30;
  const n = data.length;
  const maxVal = Math.max(1, ...entradas, ...salidas);
  const groupW = Math.floor((width - padX*2) / n);
  const barW = Math.max(10, Math.floor((groupW - 8) / 2));

  const yScale = (val) => padY + (1 - val / maxVal) * (height - padY*2);
  const xFor = (i, seriesIdx) => padX + i * groupW + seriesIdx * (barW + 4);
  const fmtDate = (d) => d.toLocaleDateString("es-ES", { month: "2-digit", day: "2-digit" });

  let parts = '';
  for (let i = 0; i < n; i++) {
    const eH = height - padY - yScale(entradas[i]);
    const sH = height - padY - yScale(salidas[i]);
    const ex = xFor(i, 0);
    const sx = xFor(i, 1);
    const baseY = height - padY;
    parts += `<rect x="${ex}" y="${yScale(entradas[i])}" width="${barW}" height="${Math.max(0,eH)}" fill="#10b981" rx="4" />`;
    parts += `<rect x="${sx}" y="${yScale(salidas[i])}" width="${barW}" height="${Math.max(0,sH)}" fill="#ef4444" rx="4" />`;
    const lx = padX + i * groupW + barW;
    parts += `<text x="${lx}" y="${height - 8}" text-anchor="middle" font-size="11" fill="#64748b">${fmtDate(labels[i])}</text>`;
  }
  // Axis line
  parts += `<line x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}" stroke="#cbd5e1" />`;
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="100%">${parts}</svg>`;
}

// Sorting handlers
const thSortId = document.getElementById("thSortId");
const thSortStock = document.getElementById("thSortStock");

function toggleSort(target) {
  const sort = target.dataset.sort;
  if (sortBy === sort) {
    sortDir = sortDir === "asc" ? "desc" : "asc";
  } else {
    sortBy = sort;
    sortDir = "asc";
  }
  // Update visual indicators
  [thSortId, thSortStock].forEach(th => {
    if (!th) return;
    th.classList.remove('sorted-asc','sorted-desc');
    if (th.dataset.sort === sortBy) th.classList.add(sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
  });
  fetchMaterials();
}

thSortId?.addEventListener("click", () => toggleSort(thSortId));
thSortStock?.addEventListener("click", () => toggleSort(thSortStock));

// Initialize sort indicators on load
if (thSortId) thSortId.classList.add('sorted-asc');
