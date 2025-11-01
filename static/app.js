const filtersForm = document.getElementById("filtersForm");
const refreshButton = document.getElementById("refreshButton");
const resetButton = document.getElementById("resetFilters");
const resultsSummary = document.getElementById("resultsSummary");
const tableBody = document.getElementById("stockTableBody");

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

    if (data.error) {
      throw new Error(data.error);
    }

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
    if (element.value) {
      params.set(key, element.value);
    }
  });

  return params.toString();
}

function renderMovementsByType(movements) {
  if (!Array.isArray(movements) || movements.length === 0) {
    return "Sin movimientos";
  }

  return movements
    .map((movement) => {
      const type = movement.tipo_movimiento || "Sin tipo";
      const total = movement.total_por_tipo ?? 0;
      return `<span class="movement"><strong>${type}:</strong> ${Number(total).toLocaleString("es-ES")}</span>`;
    })
    .join("");
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
    row.innerHTML = `
      <td data-label="Material">${item.material_name}</td>
      <td data-label="Color">${item.color}</td>
      <td data-label="Tipo">${item.tipo}</td>
      <td data-label="Categoría">${item.categoria}</td>
      <td data-label="Proveedor">${item.provider_name}</td>
      <td data-label="Entradas" class="text-right">${Number(item.total_entradas || 0).toLocaleString("es-ES")}</td>
      <td data-label="Salidas" class="text-right">${Number(item.total_salidas || 0).toLocaleString("es-ES")}</td>
      <td data-label="Stock" class="text-right ${item.stock_actual < 0 ? "text-danger" : ""}">${Number(item.stock_actual || 0).toLocaleString("es-ES")}</td>
      <td data-label="Detalle" class="movements-cell">${renderMovementsByType(item.movimientos_por_tipo)}</td>
    `;
    tableBody.appendChild(row);
  });
}

async function fetchStock() {
  try {
    resultsSummary.textContent = "Consultando base de datos…";
    tableBody.innerHTML = '<tr><td colspan="9" class="empty">Cargando…</td></tr>';

    const query = buildQueryParams();
    const response = await fetch(`/api/stock${query ? `?${query}` : ""}`);
    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    renderTableRows(data);
    resultsSummary.textContent = `${data.length} material(es) encontrados.`;
  } catch (error) {
    console.error("Error al cargar el resumen de stock", error);
    resultsSummary.textContent = "Hubo un problema al obtener los datos.";
    tableBody.innerHTML = '<tr><td colspan="9" class="empty">No fue posible cargar la información.</td></tr>';
  }
}

filtersForm.addEventListener("submit", (event) => {
  event.preventDefault();
  fetchStock();
});

refreshButton.addEventListener("click", () => {
  fetchFilters().then(fetchStock);
});

resetButton.addEventListener("click", () => {
  Object.values(filterElements).forEach((element) => {
    element.value = "";
  });
  fetchStock();
});

window.addEventListener("DOMContentLoaded", () => {
  fetchFilters().then(fetchStock);
});
