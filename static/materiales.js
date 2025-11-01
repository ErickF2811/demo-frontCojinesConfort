const filtersForm = document.getElementById("filtersForm");
const refreshButton = document.getElementById("refreshButton");
const resetButton = document.getElementById("resetFilters");
const resultsSummary = document.getElementById("resultsSummary");
const tableBody = document.getElementById("materialsTableBody");

const filterElements = {
  material_name: document.getElementById("materialFilter"),
  color: document.getElementById("colorFilter"),
  tipo: document.getElementById("tipoFilter"),
  categoria: document.getElementById("categoriaFilter"),
  provider_name: document.getElementById("proveedorFilter"),
};

function createOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function populateFilter(select, values) {
  select.innerHTML = "";
  select.appendChild(createOption("", "Todos"));
  values.forEach((value) => {
    select.appendChild(createOption(value, value));
  });
}

async function fetchFilters() {
  try {
    const response = await fetch("/api/filters");
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    Object.entries(filterElements).forEach(([key, element]) => {
      populateFilter(element, data[key] || []);
    });
  } catch (error) {
    console.error("Error al cargar filtros", error);
    resultsSummary.textContent = "Error al cargar los filtros.";
  }
}

function buildQueryParams() {
  const params = new URLSearchParams();
  Object.entries(filterElements).forEach(([key, element]) => {
    if (element.value) params.set(key, element.value);
  });
  return params.toString();
}

function renderImageCell(url, altText) {
  if (!url) return "—";
  const safeAlt = altText || "Material";
  return `<img src="${url}" alt="${safeAlt}" class="thumb" loading="lazy" referrerpolicy="no-referrer" />`;
}

function renderTableRows(data) {
  tableBody.innerHTML = "";
  if (!Array.isArray(data) || data.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="9" class="empty">No se encontraron materiales con los filtros seleccionados.</td>';
    tableBody.appendChild(row);
    return;
  }

  data.forEach((item) => {
    const row = document.createElement("tr");
    const cost = item.costo_unitario != null ? Number(item.costo_unitario) : null;
    const stock = item.stock_actual != null ? Number(item.stock_actual) : 0;
    row.innerHTML = `
      <td class="image-cell" data-label="Imagen">${renderImageCell(item.storage_account, item.imagen_name || item.material_name)}</td>
      <td data-label="Material">${item.material_name}</td>
      <td data-label="Color">${item.color}</td>
      <td data-label="Tipo">${item.tipo}</td>
      <td data-label="Categoría">${item.categoria}</td>
      <td data-label="Proveedor">${item.provider_name || item.proveedor || ""}</td>
      <td data-label="Unidad">${item.unidad || ""}</td>
      <td data-label="Costo unitario" class="text-right">${cost === null ? "—" : cost.toLocaleString("es-ES", { style: "currency", currency: "USD" })}</td>
      <td data-label="Stock" class="text-right ${stock < 0 ? "text-danger" : ""}">${stock.toLocaleString("es-ES")}</td>
    `;
    tableBody.appendChild(row);
  });
}

async function fetchMaterials() {
  try {
    resultsSummary.textContent = "Consultando base de datos…";
    tableBody.innerHTML = '<tr><td colspan="9" class="empty">Cargando…</td></tr>';
    const query = buildQueryParams();
    const response = await fetch(`/api/materiales${query ? `?${query}` : ""}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    renderTableRows(data);
    resultsSummary.textContent = `${data.length} material(es) encontrados.`;
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
  Object.values(filterElements).forEach((element) => {
    element.value = "";
  });
  fetchMaterials();
});

window.addEventListener("DOMContentLoaded", () => {
  fetchFilters().then(fetchMaterials);
});

