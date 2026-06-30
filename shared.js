(function () {
  // ======== NAVIGATION ========
  function showSection(hash) {
    var section = hash.replace(/^#/, "") || "home";
    var sections = ["home", "attacker", "victim"];
    for (var i = 0; i < sections.length; i++) {
      var el = document.getElementById("section-" + sections[i]);
      if (el) el.style.display = sections[i] === section ? "" : "none";
    }
    var titles = { home: "Mail.tm Test Accounts", attacker: "Attacker — Mail.tm Inbox", victim: "Victim — Mail.tm Inbox" };
    document.title = titles[section] || "Mail.tm Test Accounts";
  }

  function navigate() {
    showSection(location.hash || "#home");
  }

  window.addEventListener("hashchange", navigate);

  // ======== ROLE APP FACTORY ========
  function createRoleApp(role, prefix) {
    var STORAGE_KEY = "mailtm_" + role + "_session";

    function $(id) { return document.getElementById(prefix + "-" + id); }

    var els = {
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

    var session = null;
    var lastLinks = [];
    var timer = null;

    function setStatus(text, type) {
      if (!type) type = "idle";
      els.statusBadge.textContent = text;
      els.statusBadge.className = "badge " + type;
    }

    function randomString(len) {
      if (!len) len = 10;
      var alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
      var arr = [];
      var bytes = crypto.getRandomValues(new Uint8Array(len));
      for (var i = 0; i < len; i++) {
        arr.push(alphabet[bytes[i] % alphabet.length]);
      }
      return arr.join("");
    }

    function randomPassword() {
      return "Tm-" + randomString(10) + "!" + Math.floor(Math.random() * 90 + 10);
    }

    function cleanBaseUrl() {
      return els.baseUrl.value.trim().replace(/\/+$/, "");
    }

    async function api(path, options) {
      if (!options) options = {};
      var base = cleanBaseUrl();
      var headers = { Accept: "application/ld+json" };
      if (options.headers) {
        for (var k in options.headers) headers[k] = options.headers[k];
      }
      if (session && session.token) {
        headers.Authorization = "Bearer " + session.token;
      }

      var res = await fetch(base + path, Object.assign({}, options, { headers: headers }));
      var text = await res.text();
      var data = null;

      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        data = { raw: text };
      }

      if (!res.ok) {
        var detail = (data && data["hydra:description"]) || (data && data.message) || (data && data.detail) || text || res.statusText;
        throw new Error(res.status + " " + res.statusText + ": " + detail);
      }

      return data;
    }

    function saveSession() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    }

    function loadSession() {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    }

    function renderSession() {
      els.emailOutput.textContent = (session && session.address) || "not created yet";
      els.passwordOutput.textContent = (session && session.password) || "-";
    }

    function extractLinks(text) {
      var matches = (text && text.match(/https?:\/\/[^\s"'<>()[\]{}]+/g)) || [];
      var unique = [];
      for (var i = 0; i < matches.length; i++) {
        var url = matches[i].replace(/[.,;:!?]+$/, "");
        if (unique.indexOf(url) === -1) unique.push(url);
      }
      return unique;
    }

    function stripHtml(html) {
      var doc = new DOMParser().parseFromString(html || "", "text/html");
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

      for (var i = 0; i < links.length; i++) {
        (function (link) {
          var row = document.createElement("div");
          row.className = "link-item";

          var a = document.createElement("a");
          a.href = link;
          a.target = "_blank";
          a.rel = "noreferrer";
          a.textContent = link;

          var btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = "Copy";
          btn.addEventListener("click", function () { copyText(link); });

          row.append(a, btn);
          els.linksView.append(row);
        })(links[i]);
      }
    }

    function renderMessage(message) {
      var htmlText = Array.isArray(message.html) ? message.html.map(stripHtml).join("\n\n") : stripHtml(message.html || "");
      var body = message.text || htmlText || message.intro || "(empty body)";
      var links = extractLinks((message.subject || "") + "\n" + body + "\n" + htmlText);

      els.messageView.className = "message-view";
      els.messageView.textContent = "";

      var title = document.createElement("h3");
      title.textContent = message.subject || "(no subject)";

      var meta = document.createElement("div");
      meta.className = "message-meta";
      var from = (message.from && message.from.address) || (message.from && message.from.name) || "unknown sender";
      var date = message.createdAt || message.updatedAt || "";
      meta.textContent = "From: " + from + (date ? " • " + date : "");

      var pre = document.createElement("div");
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

      for (var i = 0; i < messages.length; i++) {
        (function (msg) {
          var item = document.createElement("div");
          item.className = "message-item";

          var subject = document.createElement("strong");
          subject.textContent = msg.subject || "(no subject)";

          var metaEl = document.createElement("div");
          metaEl.className = "message-meta";
          var from = (msg.from && msg.from.address) || (msg.from && msg.from.name) || "unknown sender";
          metaEl.textContent = "From: " + from;

          var intro = document.createElement("div");
          intro.className = "message-meta";
          intro.textContent = msg.intro || "";

          item.append(subject, metaEl, intro);
          item.addEventListener("click", function () { readMessage(msg.id); });
          els.inboxList.append(item);
        })(messages[i]);
      }
    }

    async function loadDomains() {
      setStatus("Loading domains", "warn");
      els.domainSelect.innerHTML = "";

      var data = await api("/domains?page=1");
      var domains = data["hydra:member"] || [];

      if (!domains.length) {
        throw new Error("No domains returned from API.");
      }

      for (var i = 0; i < domains.length; i++) {
        var opt = document.createElement("option");
        opt.value = domains[i].domain;
        opt.textContent = domains[i].domain;
        els.domainSelect.append(opt);
      }

      setStatus("Domains loaded", "ok");
    }

    async function createAccount() {
      var domain = els.domainSelect.value;
      if (!domain) throw new Error("Load domains first.");

      var username = (els.usernamePrefix.value || role + "-" + Date.now() + "-" + randomString(5))
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "");

      var password = els.passwordInput.value || randomPassword();
      var address = username + "@" + domain;

      setStatus("Creating account", "warn");

      await api("/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address, password: password }),
      });

      var tokenData = await api("/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address, password: password }),
      });

      session = {
        role: role,
        baseUrl: cleanBaseUrl(),
        address: address,
        password: password,
        token: tokenData.token,
        createdAt: new Date().toISOString(),
      };

      saveSession();
      renderSession();
      setStatus("Ready", "ok");
    }

    async function refreshInbox() {
      if (!session || !session.token) throw new Error("Create or restore an account first.");
      setStatus("Refreshing", "warn");

      var data = await api("/messages?page=1");
      renderInbox(data["hydra:member"] || []);
      setStatus("Ready", "ok");
    }

    async function readMessage(id) {
      setStatus("Reading message", "warn");
      var data = await api("/messages/" + encodeURIComponent(id));
      renderMessage(data);
      setStatus("Ready", "ok");
    }

    async function copyText(text) {
      await navigator.clipboard.writeText(text || "");
    }

    function restoreSaved() {
      var saved = loadSession();
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
      els.usernamePrefix.value = role + randomString(4);
    }

    function setupEvents() {
      els.passwordInput.value = randomPassword();

      els.loadDomainsBtn.addEventListener("click", function () { loadDomains().catch(showError); });
      els.createBtn.addEventListener("click", function () { createAccount().catch(showError); });
      els.refreshBtn.addEventListener("click", function () { refreshInbox().catch(showError); });
      els.restoreBtn.addEventListener("click", restoreSaved);
      els.clearBtn.addEventListener("click", clearLocalData);
      els.randomUserBtn.addEventListener("click", setRandomUsername);

      els.copyEmailBtn.addEventListener("click", function () { copyText((session && session.address) || ""); });
      els.copyPasswordBtn.addEventListener("click", function () { copyText((session && session.password) || ""); });
      els.copyLinksBtn.addEventListener("click", function () { copyText(lastLinks.join("\n")); });

      els.copySessionBtn.addEventListener("click", function () {
        copyText(JSON.stringify(session || {}, null, 2));
      });

      els.autoRefresh.addEventListener("change", function () {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
        if (els.autoRefresh.checked) {
          refreshInbox().catch(showError);
          timer = setInterval(function () { refreshInbox().catch(console.error); }, 5000);
        }
      });

      restoreSaved();

      loadDomains().catch(function (err) {
        console.warn("Initial domain load failed:", err);
        setStatus("Load domains manually", "warn");
      });
    }

    setupEvents();
  }

  // Init both roles
  createRoleApp("attacker", "attk");
  createRoleApp("victim", "vic");

  // Initial nav
  navigate();
})();
