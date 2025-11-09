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
const tableCard = document.querySelector(".table-card");
const mobileMediaQuery = window.matchMedia("(max-width: 640px)");
const quoteButton = document.getElementById("quoteButton");
const quoteStatus = document.getElementById("quoteStatus");
const QUOTE_STORAGE_KEY = "cc_quote_items";
let currentQuoteCandidate = null;

function resolveMaterialImage(id) {
  try {
    const entry = window.__materialsById?.get(id);
    return entry?.image_url || entry?.storage_account || "";
  } catch {
    return "";
  }
}

function syncMobileLayoutClass() {
  if (!tableCard) return;
  const isMobile = mobileMediaQuery.matches;
  if (isMobile) {
    tableCard.classList.add('table-card--mobile');
  } else {
    tableCard.classList.remove('table-card--mobile');
  }
}

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

function loadQuoteItems() {
  try {
    const raw = localStorage.getItem(QUOTE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQuoteItems(items) {
  localStorage.setItem(QUOTE_STORAGE_KEY, JSON.stringify(items));
}

function enqueueQuoteItem(item) {
  const list = loadQuoteItems();
  const image = item.image || resolveMaterialImage(item.id);
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index >= 0) {
    const preserved = list[index].added || Date.now();
    list[index] = { ...list[index], ...item, image: image || list[index].image, qty: normalizeQty(item.qty), added: preserved };
    saveQuoteItems(list);
    return { added: false, total: list.length };
  }
  list.push({ ...item, image, qty: normalizeQty(item.qty), added: Date.now() });
  saveQuoteItems(list);
  return { added: true, total: list.length };
}

function setQuoteCandidate(payload) {
  currentQuoteCandidate = { ...payload, image: payload.image || resolveMaterialImage(payload.id) };
  if (quoteButton) {
    quoteButton.disabled = !payload;
  }
  if (quoteStatus) {
    quoteStatus.textContent = "";
  }
}

function normalizeQty(value) {
  const qty = Number(value);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

quoteButton?.addEventListener("click", () => {
  if (!currentQuoteCandidate) return;
  const result = enqueueQuoteItem(currentQuoteCandidate);
  if (quoteStatus) {
    quoteStatus.textContent = result.added
      ? "Material enviado a cotización."
      : "Este material ya está en la lista de cotización.";
  }
});

filtersForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  currentPage = 1;
  fetchMaterials();
});

refreshButton?.addEventListener("click", () => {
  fetchFilters().then(fetchMaterials);
});

resetButton?.addEventListener("click", () => {
  Object.entries(filtersConfig).forEach(([key, conf]) => {
    if (!conf?.options) return;
    conf.options.querySelectorAll('input[type="checkbox"]').forEach(i => (i.checked = false));
    updateDropdownLabel(key);
  });
  currentPage = 1;
  fetchMaterials();
});

window.addEventListener("DOMContentLoaded", () => {
  syncMobileLayoutClass();
  mobileMediaQuery.addEventListener("change", syncMobileLayoutClass);
  fetchFilters().then(fetchMaterials);

  tableBody?.addEventListener("click", (e) => {
    const thumbBtn = e.target.closest(".thumb-btn");
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

  perPageSelect?.addEventListener("change", () => {
    perPage = Number(perPageSelect.value || 5) || 5;
    currentPage = 1;
    fetchMaterials();
  });
  prevPageBtn?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage -= 1;
      fetchMaterials();
    }
  });
  nextPageBtn?.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
    if (currentPage < totalPages) {
      currentPage += 1;
      fetchMaterials();
    }
  });
  pageInput?.addEventListener("change", () => {
    const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
    let p = Number(pageInput.value || 1) || 1;
    p = Math.max(1, Math.min(totalPages, p));
    currentPage = p;
    fetchMaterials();
  });

  attUploadBtn?.addEventListener("click", () => attFile?.click());
  attFile?.addEventListener("change", async () => {
    try {
      if (!attFile.files || !attFile.files.length) return;
      const file = attFile.files[0];
      const dataUrl = await readFileAsDataURL(file);
      const currentId = (detailTitle?.textContent || "").split("�").pop()?.trim() || "";
      const idAttr = window.__lastMaterialId || "";
      const id = currentId || idAttr;
      if (!id) return;
      await fetch(`/api/materiales/${encodeURIComponent(id)}/attachments/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, contentType: file.type, data: dataUrl }),
      });
      await loadAttachments(id);
    } finally {
      attFile.value = "";
    }
  });
  attList?.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-view");
    if (!btn) return;
    const url = btn.getAttribute("data-url");
    const kind = btn.getAttribute("data-kind");
    const name = btn.getAttribute("data-name") || "archivo";
    if (!url || !attViewer) return;
    if (kind === "image") {
      attViewer.innerHTML = `<img src="${url}" alt="${name}" style="max-width:100%; height:auto; border-radius:8px;"/>`;
    } else if (kind === "video") {
      attViewer.innerHTML = `<video src="${url}" controls style="width:100%; max-height:320px; border-radius:8px;"></video>`;
    } else if (kind === "pdf") {
      attViewer.innerHTML = `<p class="muted">El PDF no se previsualiza aqu�. <a href="${url}" target="_blank" rel="noopener">Abrir en nueva pesta�a</a>.</p>`;
    } else {
      attViewer.innerHTML = `<p class="muted">Tipo no soportado. <a href="${url}" target="_blank" rel="noopener">Descargar</a></p>`;
    }
    attViewer.hidden = false;
  });
});

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
    const proveedorTxt = item.provider_name || item.proveedor || "";
    row.innerHTML = `
      <td class="image-cell" data-label="Imagen">${renderImageCell(url, item.imagen_name || item.material_name, item.id_material)}</td>
      <td data-label="ID">${item.id_material || ""}</td>
      <td data-label="Material"><span class="truncate" title="${item.material_name || ""}">${item.material_name || ""}</span></td>
      <td data-label="Color">${item.color || ""}</td>
      <td data-label="Stock" class="text-right ${stock < 0 ? "text-danger" : ""}">${stock.toLocaleString("es-ES")}</td>
      <td data-label="Proveedor"><span class="truncate" title="${proveedorTxt}">${proveedorTxt}</span></td>
      <td data-label="Costo unitario" class="text-right">${cost === null ? "-" : cost.toLocaleString("es-ES", { style: "currency", currency: "USD" })}</td>
      <td data-label="Unidad">${item.unidad || ""}</td>
      <td data-label="Categoría"><span class="truncate" title="${item.categoria || ""}">${item.categoria || ""}</span></td>
      <td data-label="Tipo">${item.tipo || ""}</td>
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
let perPage = Number(perPageSelect?.value || 5) || 5;
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
  // Actions: select-all / apply / clear
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
      if (action === 'apply') {
        // aplicar filtros y cerrar el dropdown
        currentPage = 1;
        fetchMaterials();
        conf.toggle?.parentElement.classList.remove('open');
      }
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
// Attachments elements
const attFile = document.getElementById("attFile");
const attUploadBtn = document.getElementById("attUploadBtn");
const attList = document.getElementById("attList");
const attViewer = document.getElementById("attViewer");

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
  // Evita el scroll de fondo en móvil
  document.body.classList.add('no-scroll');
}
function hideModal() {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  modal.style.display = '';
  document.body.classList.remove('no-scroll');
  if (window.__materialsResizeHandler) {
    window.removeEventListener('resize', window.__materialsResizeHandler);
    window.__materialsResizeHandler = null;
  }
  window.__materialsLastMovs = null;
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
  // remember id for later uploads
  window.__lastMaterialId = idMaterial;
  setQuoteCandidate({
    id: idMaterial,
    material: baseData?.material_name || "Material",
    color: baseData?.color || "",
    proveedor: baseData?.provider_name || baseData?.proveedor || "",
    unidad: baseData?.unidad || "",
    costo: baseData?.costo_unitario ?? null,
    stock: baseData?.stock_actual ?? baseData?.stock ?? null,
    qty: 1,
    image: imgUrl || "",
  });

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
        setQuoteCandidate({
          id: idMaterial,
          material: det.material_name || baseData?.material_name || "Material",
          color: det.color || baseData?.color || "",
          proveedor: det.provider_name || det.proveedor || baseData?.provider_name || baseData?.proveedor || "",
          unidad: det.unidad || baseData?.unidad || "",
          costo: det.costo_unitario ?? baseData?.costo_unitario ?? null,
          stock: det.stock_actual ?? baseData?.stock_actual ?? baseData?.stock ?? null,
          qty: currentQuoteCandidate?.qty || 1,
          image: durl || currentQuoteCandidate?.image || "",
        });
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
          <td data-label="Fecha">${fechaTxt}</td>
          <td data-label="Tipo">${m.tipo || ""}</td>
          <td data-label="Cant.">${cantidadTxt} ${m.unidad || ""}</td>
          <td data-label="Motivo">${m.motivo || ""}</td>
          <td data-label="Obs.">${m.observaciones || ""}</td>
        `;
        obsTable.appendChild(tr);
      });
    } else {
      const tr = document.createElement("tr");
      tr.innerHTML = '<td colspan="5" class="empty">Sin movimientos</td>';
      obsTable.appendChild(tr);
    }

    // Gráficas usando ancho del contenedor (evita overflow en móvil)
    if (chartEl) {
      const cw = Math.max(280, chartEl.clientWidth || 0);
      chartEl.innerHTML = buildMovementsChart(movs, cw);
    }
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

    // Load attachments at the end
    try { await loadAttachments(idMaterial); } catch {}

    // Redibujar al cambiar tamaño (responsive)
    window.__materialsLastMovs = movs;
    window.__materialsResizeHandler = () => {
      if (!window.__materialsLastMovs || !chartEl) return;
      const w = Math.max(280, chartEl.clientWidth || 0);
      chartEl.innerHTML = buildMovementsChart(window.__materialsLastMovs, w);
    };
    window.addEventListener('resize', window.__materialsResizeHandler);
  } catch (err) {
    console.error("Detalle material", err);
    if (chartEl) chartEl.textContent = "No fue posible cargar el detalle.";
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="5" class="empty">No fue posible cargar movimientos</td>';
    obsTable.appendChild(tr);
    if (summaryEl) summaryEl.textContent = "";
  }
}

function detectKind(mime, filename) {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.includes('pdf')) return 'pdf';
  const ext = ((filename || '').split('.').pop() || '').toLowerCase();
  if (['jpg','jpeg','png','gif','webp','bmp','svg','avif','heic'].includes(ext)) return 'image';
  if (['mp4','webm','ogg','mov','m4v'].includes(ext)) return 'video';
  if (ext === 'pdf') return 'pdf';
  return 'file';
}

async function loadAttachments(id) {
  if (!attList) return;
  attList.innerHTML = '<p class="empty">Cargando archivos...</p>';
  const res = await fetch(`/api/materiales/${encodeURIComponent(id)}/attachments`);
  const data = await res.json().catch(() => ({}));
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) {
    attList.innerHTML = '<p class="empty">Sin archivos</p>';
    if (attViewer) { attViewer.hidden = true; attViewer.innerHTML = ''; }
    return;
  }
  const frag = document.createDocumentFragment();
  items.forEach((it) => {
    const row = document.createElement('div');
    row.className = 'att-card';
    const url = it.url || it.url_file || it.urlFile || it.path || '';
    const displayName = it.name || (it.path ? String(it.path).split('/').pop() : '') || (url ? String(url).split('/').pop() : '') || 'archivo';
    const kind = detectKind(it.content_type || '', displayName);
    const thumb = document.createElement('div');
    thumb.className = 'att-thumb';
    if (kind === 'image') {
      thumb.innerHTML = `<img src="${url}" alt="${displayName}" />`;
    } else if (kind === 'video') {
      thumb.innerHTML = `<div class="att-icon">🎞️</div>`;
    } else if (kind === 'pdf') {
      thumb.innerHTML = `<div class="att-icon">PDF</div>`;
    } else {
      thumb.innerHTML = `<div class="att-icon">📄</div>`;
    }

    const meta = document.createElement('div');
    meta.className = 'att-meta';
    const name = document.createElement('div');
    name.className = 'att-name';
    name.title = displayName;
    name.textContent = displayName;
    const actions = document.createElement('div');
    actions.className = 'att-actions';
    const btnDownload = document.createElement('a');
    btnDownload.className = 'button button-secondary';
    btnDownload.href = url; btnDownload.target = '_blank'; btnDownload.rel = 'noopener';
    btnDownload.textContent = 'Descargar';
    const btnView = document.createElement('button');
    btnView.type = 'button'; btnView.className = 'button button-muted btn-view';
    btnView.dataset.url = url; btnView.dataset.kind = kind; btnView.dataset.name = displayName || 'archivo';
    btnView.textContent = 'Ver';
    const btnHide = document.createElement('button');
    btnHide.type = 'button'; btnHide.className = 'button button-muted btn-hide';
    btnHide.dataset.id = String(it.archivo_id || it.id || '');
    btnHide.textContent = 'Ocultar';
    actions.append(btnDownload, btnView, btnHide);
    meta.append(name, actions);
    row.append(thumb, meta);
    frag.appendChild(row);
  });
  attList.innerHTML = '';
  attList.appendChild(frag);
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('No se pudo leer el archivo'));
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(file);
  });
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

function buildMovementsChart(movs, targetWidth) {
  if (!Array.isArray(movs) || movs.length === 0) {
    return '<div class="empty">Sin datos</div>';
  }

  let totalEntradas = 0;
  let totalSalidas = 0;
  movs.forEach((m) => {
    const tipo = (m.tipo || "").toLowerCase();
    const cantidad = Number(m.cantidad || 0);
    if (tipo === "entrada") totalEntradas += cantidad;
    if (tipo === "salida") totalSalidas += cantidad;
  });

  const labels = ["Entradas", "Salidas"];
  const values = [totalEntradas, totalSalidas];
  const colors = ["#10b981", "#ef4444"];

  const width = Math.max(300, targetWidth || 480);
  const height = 220;
  const padX = 48;
  const padY = 32;
  const n = labels.length;
  const maxVal = Math.max(1, ...values);
  const groupW = Math.floor((width - padX * 2) / n);
  const barW = Math.max(28, Math.floor(groupW * 0.55));

  const yScale = (val) => padY + (1 - val / maxVal) * (height - padY * 2);

  let parts = `<line x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}" stroke="#e2e8f0" />`;

  for (let i = 0; i < n; i++) {
    const value = values[i];
    const x = padX + i * groupW + (groupW - barW) / 2;
    const y = yScale(value);
    const h = height - padY - y;
    parts += `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(0, h)}" fill="${colors[i]}" rx="6" />`;
    parts += `<text x="${x + barW / 2}" y="${height - padY + 18}" text-anchor="middle" font-size="12" fill="#64748b">${labels[i]}</text>`;
    parts += `<text x="${x + barW / 2}" y="${y - 8}" text-anchor="middle" font-size="12" font-weight="600" fill="#0f172a">${value.toLocaleString("es-ES")}</text>`;
  }

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


