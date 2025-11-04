(() => {
  const chatFab = document.getElementById("chatFab");
  const chatPanel = document.getElementById("chatPanel");
  const chatClose = document.getElementById("chatClose");
  const chatMessages = document.getElementById("chatMessages");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const chatUpload = document.getElementById("chatUpload");
  const chatPreview = document.getElementById("chatPreview");
  const chatStatus = document.getElementById("chatStatus");
  const chatRecordBtn = document.getElementById("chatRecord");

  const CHAT_WEBHOOK_URL =
    (typeof window !== "undefined" && window.CHAT_WEBHOOK_URL) ||
    "error: no webhook configured";
  const CHAT_SESSION_STORAGE_KEY = "cojines-chat-session-id";
  const CHAT_INBOX_URL = "/api/chat/messages";
  const CHAT_UPLOAD_URL = "/api/chat/upload";
  const chatAttachmentLimit = 2; // máx 1 imagen + 1 audio
  const CHAT_POLL_INTERVAL = 5000;

  let chatSessionId = localStorage.getItem(CHAT_SESSION_STORAGE_KEY) || (crypto.randomUUID?.() ?? `chat-${Date.now()}`);
  localStorage.setItem(CHAT_SESSION_STORAGE_KEY, chatSessionId);
  let pendingAttachments = [];
  let mediaRecorder;
  let audioChunks = [];
  let isRecording = false;
  let chatPollTimer;

  function generateId() {
    return crypto.randomUUID?.() ?? `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function detectMediaKind(mimeType, declared) {
    const declaredLower = (declared || "").toLowerCase();
    const mimeLower = (mimeType || "").toLowerCase();
    if (declaredLower === "image" || mimeLower.startsWith("image/")) return "image";
    if (declaredLower === "video" || mimeLower.startsWith("video/")) return "video";
    if (declaredLower === "audio" || declaredLower === "voice" || mimeLower.startsWith("audio/")) return "voice";
    return "file";
  }

  function toggleChatPanel(open) {
    if (!chatPanel) return;
    const shouldOpen = typeof open === "boolean" ? open : !chatPanel.classList.contains("open");
    chatPanel.classList.toggle("open", shouldOpen);
    chatPanel.setAttribute("aria-hidden", shouldOpen ? "false" : "true");
    // En móvil, al abrir ocupa toda la pantalla y ocultamos la burbuja
    try {
      const isMobile = window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
      if (shouldOpen) {
        if (isMobile) {
          document.body.classList.add('chat-open');
          const fab = document.getElementById('chatFab');
          if (fab) fab.style.display = 'none';
        }
        chatInput?.focus();
      } else {
        if (isMobile) {
          document.body.classList.remove('chat-open');
          const fab = document.getElementById('chatFab');
          if (fab) fab.style.display = '';
        }
      }
    } catch {}
  }

  function appendChatMessage(role, text, attachments = [], timestamp = new Date()) {
    if (!chatMessages) return;
    const msg = document.createElement("div");
    msg.className = `chat-message ${role === "user" ? "chat-message--user" : "chat-message--bot"}`;

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    if (text) {
      const p = document.createElement("p");
      p.textContent = text;
      bubble.appendChild(p);
    }

    attachments.forEach((att) => {
      const kind = (att.media_kind || att.type || "").toLowerCase();
      const wrapper = document.createElement("div");
      wrapper.className = "chat-attachment";
      if (kind === "image") {
        const img = document.createElement("img");
        img.src = att.url || att.dataUrl;
        img.alt = att.name || "Imagen";
        wrapper.appendChild(img);
      } else if (kind === "audio" || kind === "voice") {
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.src = att.url || att.dataUrl;
        wrapper.appendChild(audio);
      } else if (kind === "video") {
        const video = document.createElement("video");
        video.controls = true;
        video.src = att.url || att.dataUrl;
        wrapper.appendChild(video);
      } else if (att.type === "file") {
        const link = document.createElement("a");
        link.href = att.url || att.dataUrl;
        link.textContent = att.name || "Archivo adjunto";
        link.target = "_blank";
        wrapper.appendChild(link);
      }
      bubble.appendChild(wrapper);
    });

    const meta = document.createElement("small");
    meta.className = "chat-meta";
    meta.textContent = timestamp.toLocaleString("es-ES");

    msg.appendChild(bubble);
    msg.appendChild(meta);
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function updateChatStatus(message = "", isError = false) {
    if (!chatStatus) return;
    chatStatus.textContent = message;
    chatStatus.style.color = isError ? "#b91c1c" : "var(--muted)";
  }

  function renderAttachmentPreview() {
    if (!chatPreview) return;
    if (!pendingAttachments.length) {
      chatPreview.hidden = true;
      chatPreview.innerHTML = "";
      return;
    }
    chatPreview.hidden = false;
    chatPreview.innerHTML = "";
    pendingAttachments.forEach((att, index) => {
      const chip = document.createElement("div");
      chip.className = "chat-attachment-preview";
      const kind = (att.media_kind || att.type || "").toLowerCase();
      if (kind === "image") {
        const img = document.createElement("img");
        img.src = att.dataUrl || att.url;
        img.alt = att.name || "imagen";
        chip.appendChild(img);
      } else if (kind === "voice" || kind === "audio") {
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.preload = "metadata";
        audio.src = att.dataUrl || att.url;
        audio.style.height = "28px";
        audio.style.maxWidth = "180px";
        chip.appendChild(audio);
      } else {
        const label = document.createElement("span");
        label.textContent = att.name || att.type || "archivo";
        chip.appendChild(label);
      }
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "✕";
      removeBtn.className = "chat-attachment-remove";
      removeBtn.addEventListener("click", () => {
        pendingAttachments.splice(index, 1);
        renderAttachmentPreview();
      });
      chip.appendChild(removeBtn);
      chatPreview.appendChild(chip);
    });
  }

  function clearChatInput() {
    if (chatInput) chatInput.value = "";
    pendingAttachments = [];
    renderAttachmentPreview();
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function countByKind(kind) {
    return pendingAttachments.filter(a => (a.media_kind || a.type) === kind).length;
  }

  function replaceOrAdd(att) {
    const kind = att.media_kind || att.type;
    const idx = pendingAttachments.findIndex(a => (a.media_kind || a.type) === kind);
    if (idx >= 0) {
      pendingAttachments.splice(idx, 1, att);
    } else {
      // Si ya hay 2 adjuntos, elimina el primero que no sea de este tipo
      if (pendingAttachments.length >= chatAttachmentLimit) {
        const otherIdx = pendingAttachments.findIndex(a => (a.media_kind || a.type) !== kind);
        if (otherIdx >= 0) pendingAttachments.splice(otherIdx, 1);
        else pendingAttachments.shift();
      }
      pendingAttachments.push(att);
    }
  }

  async function handleChatFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    for (const file of files) {
      try {
        const mediaKind = detectMediaKind(file.type, undefined);
        if (mediaKind !== "image" && mediaKind !== "voice" && mediaKind !== "audio") {
          updateChatStatus("Solo se permite adjuntar una imagen. El audio se agrega con 'Voz'.", true);
          continue;
        }
        const normalizedKind = mediaKind === "audio" ? "voice" : mediaKind;
        // Limitar: 1 imagen y 1 audio. Si ya existe, alerta y no agrega.
        if (normalizedKind === "voice" && countByKind("voice") >= 1) {
          updateChatStatus("Solo puedes adjuntar un audio por mensaje.", true);
          continue;
        }
        if (normalizedKind === "image" && countByKind("image") >= 1) {
          updateChatStatus("Solo puedes adjuntar una imagen por mensaje.", true);
          continue;
        }
        const dataUrl = await fileToDataUrl(file);
        const att = {
          id: generateId(),
          name: file.name,
          size: file.size,
          mimeType: file.type,
          type: normalizedKind,
          media_kind: normalizedKind,
          dataUrl,
          uploadedUrl: null,
        };
        replaceOrAdd(att);
      } catch (err) {
        console.error("Error leyendo archivo", err);
        updateChatStatus("No pudimos cargar uno de los archivos.", true);
      }
    }
    renderAttachmentPreview();
  }

  async function ensureAttachmentsUploaded() {
    if (!pendingAttachments.length) return pendingAttachments;
    const prepared = [];
    for (const att of pendingAttachments) {
      if (att.uploadedUrl && att.url) {
        prepared.push(att);
        continue;
      }
      try {
        const response = await fetch(CHAT_UPLOAD_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: att.name,
            contentType: att.mimeType,
            type: att.media_kind || att.type,
            data: att.dataUrl,
          }),
        });
        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(errorBody.error || `Carga falló (${response.status})`);
        }
        const uploaded = await response.json();
        att.url = uploaded.url;
        att.uploadedUrl = uploaded.url;
        att.media_kind = uploaded.media_kind || att.media_kind || att.type;
        prepared.push(att);
      } catch (error) {
        console.error("Upload error", error);
        updateChatStatus(error.message || "Error subiendo adjunto.", true);
        throw error;
      }
    }
    return prepared;
  }

  function serializeAttachments(source = pendingAttachments) {
    return source
      .filter((att) => att.url || att.uploadedUrl)
      .map((att) => ({
        id: att.id,
        name: att.name,
        type: att.media_kind || att.type,
        media_kind: att.media_kind || att.type,
        contentType: att.mimeType,
        url: att.url || att.uploadedUrl,
        size: att.size,
      }));
  }

  async function sendChatMessage(messageText) {
    const uploadedAttachments = await ensureAttachmentsUploaded();
    const payload = {
      sessionId: chatSessionId,
      message: messageText,
      attachments: serializeAttachments(uploadedAttachments),
      timestamp: new Date().toISOString(),
    };
    updateChatStatus("Enviando mensaje...");
    try {
      const response = await fetch(CHAT_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") || "";
      let data = null;
      if (contentType.includes("application/json")) {
        data = await response.json().catch(() => null);
      }
      if (data) handleChatResponse(data);
      updateChatStatus("Mensaje enviado.");
      setTimeout(() => {
        void pollChatInbox();
      }, 1200);
    } catch (error) {
      console.error("Chat webhook error:", error);
      updateChatStatus(`Error: ${error.message}`, true);
      throw error;
    } finally {
      renderAttachmentPreview();
    }
    return true;
  }

  function handleChatResponse(data) {
    if (!data) return;
    const replies = Array.isArray(data)
      ? data
      : Array.isArray(data.messages)
      ? data.messages
      : data.reply
      ? [{ role: "bot", content: data.reply }]
      : [];

    replies.forEach((msg) => {
      const attachments = (msg.attachments || []).map((att) => ({
        id: att.id || generateId(),
        name: att.name || att.fileName || att.type || "adjunto",
        type: att.media_kind || att.type || "file",
        media_kind: att.media_kind || att.type || "file",
        dataUrl: att.dataUrl || att.url,
        url: att.url,
      }));
      appendChatMessage(
        msg.role === "user" ? "user" : "bot",
        msg.content || msg.text || "",
        attachments,
        msg.timestamp ? new Date(msg.timestamp) : new Date()
      );
    });
  }

  async function pollChatInbox() {
    if (!chatSessionId) return;
    try {
      const url = `${CHAT_INBOX_URL}?sessionId=${encodeURIComponent(chatSessionId)}`;
      const response = await fetch(url, {
        method: "GET",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!response.ok) return;
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) return;
      const data = await response.json().catch(() => null);
      if (data) handleChatResponse(data);
    } catch (error) {
      console.debug("Chat inbox polling error", error);
    }
  }

  async function submitChatForm(event) {
    event.preventDefault();
    const text = chatInput?.value.trim() || "";
    if (!text && pendingAttachments.length === 0) {
      chatInput?.focus();
      updateChatStatus("Escribe un mensaje o adjunta archivos.", true);
      return;
    }

    const attachmentsSnapshot = pendingAttachments.map((att) => ({ ...att }));
    appendChatMessage("user", text, attachmentsSnapshot);
    try {
      await sendChatMessage(text);
      clearChatInput();
    } catch (error) {
      console.error("No se pudo enviar el mensaje", error);
      updateChatStatus(
        (error && error.message) || "No pudimos enviar el mensaje, intenta nuevamente.",
        true
      );
    }
  }

  async function toggleRecording() {
    if (!chatRecordBtn) return;
    if (countByKind('voice') >= 1) {
      updateChatStatus("Ya tienes un audio adjunto. Solo uno por mensaje.", true);
      return;
    }
    if (isRecording) {
      mediaRecorder?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = (ev) => ev.data.size && audioChunks.push(ev.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        const file = new File([blob], `nota-${Date.now()}.webm`, { type: blob.type });
        // Solo un audio: reemplaza si ya existe
        await handleChatFiles([file]);
        chatRecordBtn.classList.remove("is-recording");
        isRecording = false;
        updateChatStatus("");
      };
      mediaRecorder.start();
      chatRecordBtn.classList.add("is-recording");
      isRecording = true;
      updateChatStatus("Grabando… toca de nuevo para detener.");
    } catch (error) {
      console.error("Micrófono no disponible", error);
      updateChatStatus("No se pudo acceder al micrófono.", true);
    }
  }

  function initChatWidget() {
    if (!chatFab || !chatPanel || !chatForm) return;

    chatPanel.classList.remove("open");
    chatPanel.setAttribute("aria-hidden", "true");

    // Toggle: si está abierto, lo minimiza; si está cerrado, lo abre
    chatFab.addEventListener("click", () => toggleChatPanel());
    chatClose?.addEventListener("click", () => toggleChatPanel(false));
    chatForm.addEventListener("submit", submitChatForm);
    chatUpload?.addEventListener("change", async (event) => {
      // Si ya hay una imagen adjunta, alerta y no agrega otra
      if (countByKind('image') >= 1 && event.target?.files?.length) {
        updateChatStatus("Solo puedes adjuntar una imagen por mensaje.", true);
        event.target.value = "";
        return;
      }
      await handleChatFiles(event.target.files);
      event.target.value = "";
    });
    chatRecordBtn?.addEventListener("click", toggleRecording);

    window.postChatMessage = function postChatMessage(payload) {
      const { role = "bot", text = "", attachments = [], timestamp } = payload || {};
      appendChatMessage(role, text, attachments, timestamp ? new Date(timestamp) : new Date());
    };

    void pollChatInbox();
    if (chatPollTimer) {
      clearInterval(chatPollTimer);
    }
    chatPollTimer = window.setInterval(pollChatInbox, CHAT_POLL_INTERVAL);
    window.addEventListener("beforeunload", () => {
      if (chatPollTimer) clearInterval(chatPollTimer);
    });
  }

  window.addEventListener("DOMContentLoaded", initChatWidget);
})();
