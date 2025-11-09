const QUOTE_STORAGE_KEY = "cc_quote_items";
const pendingImageFetch = new Set();
const quoteTableBody = document.getElementById("quoteTableBody");
const quoteSummary = document.getElementById("quoteSummary");
const quoteClearBtn = document.getElementById("quoteClear");
const quoteTotalEl = document.getElementById("quoteTotal");
const quoteActionStatus = document.getElementById("quoteActionStatus");
const submitQuoteBtn = document.getElementById("quoteSubmit");

function loadQuotes() {
  try {
    const data = JSON.parse(localStorage.getItem(QUOTE_STORAGE_KEY) || "[]");
    if (!Array.isArray(data)) return [];
    return data.map((item) => ({
      ...item,
      image: item.image || item.image_url || item.storage_account || "",
    }));
  } catch {
    return [];
  }
}

function saveQuotes(items) {
  localStorage.setItem(QUOTE_STORAGE_KEY, JSON.stringify(items));
}

function clearQuotes() {
  localStorage.removeItem(QUOTE_STORAGE_KEY);
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return "-";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString("es-ES", { style: "currency", currency: "USD" });
}

function normalizePositive(value, fallback = 1) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num;
}

function renderQuotes() {
  const items = loadQuotes();
  quoteTableBody.innerHTML = "";
  let total = 0;

  if (!items.length) {
    quoteTableBody.innerHTML = '<tr><td colspan="8" class="empty">No hay materiales en la lista.</td></tr>';
    if (quoteSummary) quoteSummary.textContent = "Sin materiales seleccionados.";
    if (quoteTotalEl) quoteTotalEl.textContent = "0,00 US$";
    return;
  }

  if (quoteSummary) {
    quoteSummary.textContent = `${items.length} material(es) listos para cotizar.`;
  }

  items
    .sort((a, b) => (b.added || 0) - (a.added || 0))
    .forEach((item) => {
      const qty = normalizePositive(item.qty, 1);
      const price = normalizePositive(item.costo, 0);
      const subtotal = qty * price;
      total += subtotal;
      if (!item.image && item.id) {
        fetchAndCacheQuoteImage(item.id);
      }
      const thumbHtml = item.image
        ? `<a href="${item.image}" target="_blank" rel="noopener" class="quote-thumb-link"><img src="${item.image}" alt="${item.material || item.id}" loading="lazy" referrerpolicy="no-referrer"></a>`
        : `<div class="quote-thumb quote-thumb--empty">Sin imagen</div>`;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td data-label="Imagen" class="quote-thumb-cell">${thumbHtml}</td>
        <td data-label="ID">${item.id || ""}</td>
        <td data-label="Material"><span class="truncate" title="${item.material || ""}">${item.material || ""}</span></td>
        <td data-label="Unidad">${item.unidad || "-"}</td>
        <td data-label="Unitario">
          <input type="number" class="quote-input" data-action="price" data-id="${item.id}" min="0" step="0.01" value="${price.toFixed(2)}">
        </td>
        <td data-label="Cant.">
          <input type="number" class="quote-input" data-action="qty" data-id="${item.id}" min="0.01" step="0.01" value="${qty}">
        </td>
        <td data-label="Subtotal">${formatCurrency(subtotal)}</td>
        <td data-label="Acciones">
          <button class="link" data-action="remove" data-id="${item.id}">Quitar</button>
        </td>
      `;
      quoteTableBody.appendChild(tr);
    });

  if (quoteTotalEl) {
    quoteTotalEl.textContent = total.toLocaleString("es-ES", { style: "currency", currency: "USD" });
  }
}

function setStatus(message, tone = "info") {
  if (!quoteActionStatus) return;
  quoteActionStatus.textContent = message;
  quoteActionStatus.style.color =
    tone === "error" ? "#b91c1c" : tone === "success" ? "#16a34a" : "#475569";
}

quoteTableBody?.addEventListener("click", (event) => {
  const removeBtn = event.target.closest("[data-action='remove']");
  if (!removeBtn) return;
  const id = removeBtn.getAttribute("data-id");
  if (!id) return;
  const updated = loadQuotes().filter((item) => item.id !== id);
  saveQuotes(updated);
  renderQuotes();
  setStatus("Material eliminado.", "success");
});

quoteTableBody?.addEventListener("change", (event) => {
  const qtyInput = event.target.closest("[data-action='qty']");
  const priceInput = event.target.closest("[data-action='price']");
  if (!qtyInput && !priceInput) return;
  const id = (qtyInput || priceInput).getAttribute("data-id");
  if (!id) return;
  const list = loadQuotes().map((item) => {
    if (item.id !== id) return item;
    if (qtyInput) {
      const qty = normalizePositive(qtyInput.value, 1);
      qtyInput.value = qty;
      return { ...item, qty };
    }
    const price = normalizePositive(priceInput.value, 0);
    priceInput.value = price.toFixed(2);
    return { ...item, costo: price };
  });
  saveQuotes(list);
  renderQuotes();
});

quoteClearBtn?.addEventListener("click", () => {
  clearQuotes();
  renderQuotes();
  setStatus("Lista vaciada.", "success");
});

async function fetchAndCacheQuoteImage(id) {
  if (!id || pendingImageFetch.has(id)) return;
  pendingImageFetch.add(id);
  try {
    const response = await fetch(`/api/materiales/${encodeURIComponent(id)}`);
    const data = await response.json().catch(() => ({}));
    const image = data.image_url || data.storage_account || "";
    if (!image) return;
    const list = loadQuotes().map((item) =>
      item.id === id ? { ...item, image } : item
    );
    saveQuotes(list);
    renderQuotes();
  } catch (error) {
    console.warn("No fue posible obtener imagen para", id, error);
  } finally {
    pendingImageFetch.delete(id);
  }
}

submitQuoteBtn?.addEventListener("click", () => {
  const items = loadQuotes();
  if (!items.length) {
    setStatus("Agrega materiales antes de enviar la cotización.", "error");
    return;
  }
  const total = items.reduce(
    (acc, item) => acc + normalizePositive(item.qty, 1) * normalizePositive(item.costo, 0),
    0
  );
  console.info("Cotización preparada", { items, total });
  setStatus("Cotización preparada. (Integración pendiente)", "success");
});

window.addEventListener("storage", (event) => {
  if (event.key === QUOTE_STORAGE_KEY) {
    renderQuotes();
  }
});

window.addEventListener("DOMContentLoaded", () => {
  renderQuotes();
});
