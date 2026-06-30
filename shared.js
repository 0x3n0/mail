const ROLE = document.body.dataset.role || "mailtm";
const STORAGE_KEY = `mailtm_${ROLE}_session`;

const $ = (id) => document.getElementById(id);

const els = {
  baseUrl: $("baseUrl"),
  domainSelect: $("domainSelect"),
  loadDomainsBtn: $("loadDomainsBtn"),
  usernamePrefix: $("usernamePrefix"),
  randomUserBtn: $("randomUserBtn"),
  passwordInput: $("passwordInput"),
  createBtn: $("createBtn"),
  restoreBtn: $("restoreBtn"),
  clearBtn: $("clearBtn"),
  emailOutput: $("emailOutput"),
  passwordOutput: $("passwordOutput"),
  copyEmailBtn: $("copyEmailBtn"),
  copyPasswordBtn: $("copyPasswordBtn"),
  refreshBtn: $("refreshBtn"),
  copySessionBtn: $("copySessionBtn"),
  autoRefresh: $("autoRefresh"),
  inboxList: $("inboxList"),
  messageView: $("messageView"),
  linksView: $("linksView"),
  copyLinksBtn: $("copyLinksBtn"),
  statusBadge: $("statusBadge"),
};

let session = null;
let lastLinks = [];
let timer = null;

function setStatus(text, type = "idle") {
  els.statusBadge.textContent = text;
  els.statusBadge.className = `badge ${type}`;
}

function randomString(len = 10) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map((n) => alphabet[n % alphabet.length])
    .join("");
}

function randomPassword() {
  return `Tm-${randomString(10)}!${Math.floor(Math.random() * 90 + 10)}`;
}

function cleanBaseUrl() {
  return els.baseUrl.value.trim().replace(/\/+$/, "");
}

async function api(path, options = {}) {
  const base = cleanBaseUrl();
  const headers = {
    Accept: "application/ld+json",
    ...(options.headers || {}),
  };

  if (session?.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }

  const res = await fetch(`${base}${path}`, {
    ...options,
    headers,
  });

  const text = await res.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const detail = data?.["hydra:description"] || data?.message || data?.detail || text || res.statusText;
    throw new Error(`${res.status} ${res.statusText}: ${detail}`);
  }

  return data;
}

function saveSession() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function loadSession() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function renderSession() {
  els.emailOutput.textContent = session?.address || "not created yet";
  els.passwordOutput.textContent = session?.password || "-";
}

function extractLinks(text) {
  const matches = text.match(/https?:\/\/[^\s"'<>()[\]{}]+/g) || [];
  return [...new Set(matches.map((url) => url.replace(/[.,;:!?]+$/, "")))];
}

function stripHtml(html) {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  return doc.body.textContent || "";
}

function renderLinks(links) {
  lastLinks = links;

  if (!links.length) {
    els.linksView.className = "links-view empty";
    els.linksView.textContent = "No links extracted yet.";
    return;
  }

  els.linksView.className = "links-view";
  els.linksView.textContent = "";

  for (const link of links) {
    const row = document.createElement("div");
    row.className = "link-item";

    const a = document.createElement("a");
    a.href = link;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.textContent = link;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Copy";
    btn.addEventListener("click", () => copyText(link));

    row.append(a, btn);
    els.linksView.append(row);
  }
}

function renderMessage(message) {
  const htmlText = Array.isArray(message.html) ? message.html.map(stripHtml).join("\n\n") : stripHtml(message.html || "");
  const body = message.text || htmlText || message.intro || "(empty body)";
  const links = extractLinks(`${message.subject || ""}\n${body}\n${htmlText}`);

  els.messageView.className = "message-view";
  els.messageView.textContent = "";

  const title = document.createElement("h3");
  title.textContent = message.subject || "(no subject)";

  const meta = document.createElement("div");
  meta.className = "message-meta";
  const from = message.from?.address || message.from?.name || "unknown sender";
  const date = message.createdAt || message.updatedAt || "";
  meta.textContent = `From: ${from}${date ? ` • ${date}` : ""}`;

  const pre = document.createElement("div");
  pre.className = "message-body";
  pre.textContent = body;

  els.messageView.append(title, meta, pre);
  renderLinks(links);
}

function renderInbox(messages) {
  if (!messages.length) {
    els.inboxList.className = "inbox-list empty";
    els.inboxList.textContent = "Inbox empty.";
    return;
  }

  els.inboxList.className = "inbox-list";
  els.inboxList.textContent = "";

  for (const msg of messages) {
    const item = document.createElement("div");
    item.className = "message-item";

    const subject = document.createElement("strong");
    subject.textContent = msg.subject || "(no subject)";

    const meta = document.createElement("div");
    meta.className = "message-meta";
    const from = msg.from?.address || msg.from?.name || "unknown sender";
    meta.textContent = `From: ${from}`;

    const intro = document.createElement("div");
    intro.className = "message-meta";
    intro.textContent = msg.intro || "";

    item.append(subject, meta, intro);
    item.addEventListener("click", () => readMessage(msg.id));
    els.inboxList.append(item);
  }
}

async function loadDomains() {
  setStatus("Loading domains", "warn");
  els.domainSelect.innerHTML = "";

  const data = await api("/domains?page=1");
  const domains = data["hydra:member"] || [];

  if (!domains.length) {
    throw new Error("No domains returned from API.");
  }

  for (const item of domains) {
    const opt = document.createElement("option");
    opt.value = item.domain;
    opt.textContent = item.domain;
    els.domainSelect.append(opt);
  }

  setStatus("Domains loaded", "ok");
}

async function createAccount() {
  const domain = els.domainSelect.value;
  if (!domain) throw new Error("Load domains first.");

  const username = `${els.usernamePrefix.value || ROLE}-${Date.now()}-${randomString(5)}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");

  const password = els.passwordInput.value || randomPassword();
  const address = `${username}@${domain}`;

  setStatus("Creating account", "warn");

  await api("/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password }),
  });

  const tokenData = await api("/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password }),
  });

  session = {
    role: ROLE,
    baseUrl: cleanBaseUrl(),
    address,
    password,
    token: tokenData.token,
    createdAt: new Date().toISOString(),
  };

  saveSession();
  renderSession();
  setStatus("Ready", "ok");
}

async function refreshInbox() {
  if (!session?.token) throw new Error("Create or restore an account first.");
  setStatus("Refreshing", "warn");

  const data = await api("/messages?page=1");
  renderInbox(data["hydra:member"] || []);
  setStatus("Ready", "ok");
}

async function readMessage(id) {
  setStatus("Reading message", "warn");
  const data = await api(`/messages/${encodeURIComponent(id)}`);
  renderMessage(data);
  setStatus("Ready", "ok");
}

async function copyText(text) {
  await navigator.clipboard.writeText(text || "");
}

function restoreSaved() {
  const saved = loadSession();
  if (!saved) {
    setStatus("No saved session", "error");
    return;
  }

  session = saved;
  if (session.baseUrl) els.baseUrl.value = session.baseUrl;
  renderSession();
  setStatus("Restored", "ok");
}

function clearLocalData() {
  localStorage.removeItem(STORAGE_KEY);
  session = null;
  renderSession();
  els.inboxList.className = "inbox-list empty";
  els.inboxList.textContent = "No messages loaded yet.";
  els.messageView.className = "message-view empty";
  els.messageView.textContent = "Select a message from inbox.";
  renderLinks([]);
  setStatus("Cleared", "warn");
}

function showError(error) {
  console.error(error);
  setStatus("Error", "error");
  alert(error.message || String(error));
}

function setRandomUsername() {
  els.usernamePrefix.value = `${ROLE}${randomString(4)}`;
}

function setupEvents() {
  els.passwordInput.value = randomPassword();

  els.loadDomainsBtn.addEventListener("click", () => loadDomains().catch(showError));
  els.createBtn.addEventListener("click", () => createAccount().catch(showError));
  els.refreshBtn.addEventListener("click", () => refreshInbox().catch(showError));
  els.restoreBtn.addEventListener("click", restoreSaved);
  els.clearBtn.addEventListener("click", clearLocalData);
  els.randomUserBtn.addEventListener("click", setRandomUsername);

  els.copyEmailBtn.addEventListener("click", () => copyText(session?.address || ""));
  els.copyPasswordBtn.addEventListener("click", () => copyText(session?.password || ""));
  els.copyLinksBtn.addEventListener("click", () => copyText(lastLinks.join("\n")));

  els.copySessionBtn.addEventListener("click", () => {
    copyText(JSON.stringify(session || {}, null, 2));
  });

  els.autoRefresh.addEventListener("change", () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }

    if (els.autoRefresh.checked) {
      refreshInbox().catch(showError);
      timer = setInterval(() => refreshInbox().catch(console.error), 5000);
    }
  });

  restoreSaved();

  loadDomains().catch((err) => {
    console.warn("Initial domain load failed:", err);
    setStatus("Load domains manually", "warn");
  });
}

setupEvents();
