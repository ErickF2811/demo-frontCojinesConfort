const chartEl = document.getElementById("fin-chart");
const resumenIngresos = document.getElementById("fin-ingresos");
const resumenEgresos = document.getElementById("fin-egresos");
const resumenUtilidad = document.getElementById("fin-utilidad");
const resumenCaja = document.getElementById("fin-caja");
const ingresosCount = document.getElementById("fin-ingresos-count");
const egresosCount = document.getElementById("fin-egresos-count");

const tableIngresos = document.querySelector("#fin-table-ingresos tbody");
const tableEgresos = document.querySelector("#fin-table-egresos tbody");

const tagCategorias = document.getElementById("fin-categorias");
const tagImpuestos = document.getElementById("fin-impuestos");
const tagCuentas = document.getElementById("fin-cuentas");
const tagReglas = document.getElementById("fin-reglas");

const inputFrom = document.getElementById("fin-date-from");
const inputTo = document.getElementById("fin-date-to");
const selectTipo = document.getElementById("fin-op-type");
const btnApply = document.getElementById("fin-apply");
const btnReset = document.getElementById("fin-reset");

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("es-ES", { style: "currency", currency: "USD" });
}

function withinRange(dateStr, from, to) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.valueOf())) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function renderSummary(payload) {
  if (!payload) return;
  if (resumenIngresos) resumenIngresos.textContent = formatCurrency(payload.ingresos_total);
  if (resumenEgresos) resumenEgresos.textContent = formatCurrency(payload.egresos_total);
  if (resumenUtilidad) resumenUtilidad.textContent = formatCurrency(payload.utilidad);
  if (resumenCaja) resumenCaja.textContent = formatCurrency(payload.caja);
  if (ingresosCount) ingresosCount.textContent = `${payload.ingresos_count ?? 0} registro(s)`;
  if (egresosCount) egresosCount.textContent = `${payload.egresos_count ?? 0} registro(s)`;
}

function renderTable(tbody, rows, kind) {
  if (!tbody) return;
  tbody.innerHTML = "";
  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="empty">Sin ${kind}</td>`;
    tbody.appendChild(tr);
    return;
  }
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    if (kind === "ingresos") {
      tr.innerHTML = `
        <td data-label="Fecha">${r.fecha}</td>
        <td data-label="Cliente">${r.cliente || ""}</td>
        <td data-label="Tipo">${r.tipo || ""}</td>
        <td data-label="Total">${formatCurrency(r.total)}</td>
        <td data-label="Estado">${r.estado || ""}</td>
      `;
    } else {
      tr.innerHTML = `
        <td data-label="Fecha">${r.fecha}</td>
        <td data-label="Proveedor">${r.proveedor || ""}</td>
        <td data-label="Tipo">${r.tipo || ""}</td>
        <td data-label="Total">${formatCurrency(r.total)}</td>
        <td data-label="Método">${r.metodo || ""}</td>
      `;
    }
    tbody.appendChild(tr);
  });
}

function buildMonthlySeries(rows) {
  const agg = {};
  rows.forEach((r) => {
    const d = new Date(r.fecha);
    if (Number.isNaN(d.valueOf())) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    agg[key] = (agg[key] || 0) + Number(r.total || 0);
  });
  return Object.entries(agg)
    .sort()
    .map(([k, v]) => ({ mes: k, total: v }));
}

function renderChartFromSerie(serie) {
  if (!chartEl) return;
  const labels = Array.from(new Set((serie || []).map((i) => i.mes))).sort();
  if (!labels.length) {
    chartEl.textContent = "Sin datos";
    return;
  }
  const width = Math.max(320, chartEl.clientWidth || 320);
  const height = 240;
  const padX = 50;
  const padY = 32;
  const barW = 18;
  const gap = 12;
  const values = labels.map((mes) => {
    const row = (serie || []).find((x) => x.mes === mes) || {};
    return {
      mes,
      ingreso: row.ingresos || row.ingreso || 0,
      egreso: row.egresos || row.egreso || 0,
    };
  });
  const maxVal = Math.max(1, ...values.map((v) => Math.max(v.ingreso, v.egreso)));

  const svg = [];
  const yScale = (val) => padY + (1 - val / maxVal) * (height - padY * 2);

  values.forEach((v, idx) => {
    const groupX = padX + idx * ((barW * 2) + gap);
    const yIng = yScale(v.ingreso);
    const hIng = height - padY - yIng;
    const yEgr = yScale(v.egreso);
    const hEgr = height - padY - yEgr;
    svg.push(`<rect x="${groupX}" y="${yIng}" width="${barW}" height="${Math.max(0, hIng)}" fill="#10b981" rx="5" />`);
    svg.push(`<rect x="${groupX + barW + 4}" y="${yEgr}" width="${barW}" height="${Math.max(0, hEgr)}" fill="#ef4444" rx="5" />`);
    svg.push(`<text x="${groupX + barW}" y="${height - padY + 18}" text-anchor="middle" font-size="12" fill="#64748b">${v.mes}</text>`);
  });

  svg.push(`<line x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}" stroke="#e2e8f0" />`);

  chartEl.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="100%">${svg.join("")}</svg>`;
}

function renderTags(target, items) {
  if (!target) return;
  target.innerHTML = "";
  if (!Array.isArray(items) || !items.length) {
    target.innerHTML = '<li class="muted">Vacío</li>';
    return;
  }
  items.forEach((it) => {
    const li = document.createElement("li");
    li.className = "tag";
    li.textContent = typeof it === "string" ? it : it.nombre || "";
    target.appendChild(li);
  });
}

async function applyFilters() {
  const params = new URLSearchParams();
  if (inputFrom?.value) params.append("from", inputFrom.value);
  if (inputTo?.value) params.append("to", inputTo.value);
  const tipoVal = (selectTipo?.value || "all").toLowerCase();
  if (tipoVal !== "all") params.append("tipo", tipoVal);

  const qs = params.toString();
  const urlResumen = `/api/finanzas/resumen${qs ? `?${qs}` : ""}`;
  const urlIngresos = `/api/finanzas/ingresos${qs ? `?${qs}` : ""}`;
  const urlEgresos = `/api/finanzas/egresos${qs ? `?${qs}` : ""}`;

  try {
    const [resResumen, resIng, resEgr] = await Promise.all([
      fetch(urlResumen),
      fetch(urlIngresos),
      fetch(urlEgresos),
    ]);
    const dataResumen = await resResumen.json();
    const dataIng = await resIng.json();
    const dataEgr = await resEgr.json();

    renderSummary(dataResumen);
    renderTable(tableIngresos, dataIng.items || [], "ingresos");
    renderTable(tableEgresos, dataEgr.items || [], "egresos");
    renderChartFromSerie(dataResumen.serie || []);
  } catch (err) {
    console.error("finanzas fetch", err);
    renderSummary({ ingresos_total: 0, egresos_total: 0, utilidad: 0, caja: 0, ingresos_count: 0, egresos_count: 0 });
    renderTable(tableIngresos, [], "ingresos");
    renderTable(tableEgresos, [], "egresos");
    if (chartEl) chartEl.textContent = "No fue posible cargar datos.";
  }
}

async function loadConfig() {
  try {
    const res = await fetch("/api/finanzas/config");
    const data = await res.json();
    renderTags(tagCategorias, data.categorias || []);
    renderTags(tagImpuestos, data.impuestos || []);
    renderTags(tagCuentas, data.cuentas || []);
    renderTags(tagReglas, data.reglas || []);
  } catch (err) {
    console.error("finanzas config", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadConfig();
  applyFilters();

  btnApply?.addEventListener("click", applyFilters);
  btnReset?.addEventListener("click", () => {
    if (inputFrom) inputFrom.value = "";
    if (inputTo) inputTo.value = "";
    if (selectTipo) selectTipo.value = "all";
    applyFilters();
  });
});
