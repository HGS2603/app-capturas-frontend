// ===== CONFIG =====
const API_URL = "https://app-capturas-api.h-garay.workers.dev";
const TOKEN_KEY = "acp_token";
const USER_KEY = "acp_user";

// ===== Helpers UI =====
const $ = (id) => document.getElementById(id);

function show(el, yes) { el.hidden = !yes; }
function setAlert(el, msg, type) {
  if (!msg) { el.hidden = true; el.textContent = ""; el.className = "alert"; return; }
  el.hidden = false;
  el.textContent = msg;
  el.className = `alert ${type === "ok" ? "ok" : type === "bad" ? "bad" : ""}`;
}

function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
function getToken() { return localStorage.getItem(TOKEN_KEY); }
function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); }
  catch { return null; }
}

// ===== API =====
async function apiGet(path, token = null) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
  return data;
}

async function apiPost(path, body, token = null) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
  return data;
}

// ===== Views =====
function setView(view) {
  show($("viewLogin"), view === "login");
  show($("viewMenu"), view === "menu");
  show($("viewCapturas"), view === "capturas");
}

function renderTopbar() {
  const user = getUser();
  if (!user) {
    show($("userBox"), false);
    return;
  }
  $("userName").textContent = user.usuario_nombre || user.usuario_id;
  $("userPerms").textContent = `Usuario: ${user.usuario_id}`;
  show($("userBox"), true);
}

function applyMenuPermissions(perms) {
  const canCapturas = !!perms?.capturas;
  const canReportes = !!perms?.reportes;
  $("btnCapturas").disabled = !canCapturas;
  $("btnReportes").disabled = !canReportes;
}

// ===== Login flow =====
async function loadUsersDropdown() {
  setAlert($("loginMsg"), "Cargando usuarios...", "");
  try {
    const data = await apiGet("/api/public/users");
    const sel = $("loginUsuario");
    sel.innerHTML = "";
    const list = data.usuarios || [];
    if (!list.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No hay usuarios activos";
      sel.appendChild(opt);
      sel.disabled = true;
    } else {
      sel.disabled = false;
      for (const u of list) {
        const opt = document.createElement("option");
        opt.value = u.usuario_id;
        opt.textContent = u.usuario_nombre || u.usuario_id;
        sel.appendChild(opt);
      }
    }
    setAlert($("loginMsg"), "", "");
  } catch (e) {
    setAlert($("loginMsg"), e.message, "bad");
  }
}

async function doLogin() {
  const usuario_id = $("loginUsuario").value;
  const password = $("loginPassword").value;

  if (!usuario_id) return setAlert($("loginMsg"), "Selecciona un usuario", "bad");
  if (!password) return setAlert($("loginMsg"), "Escribe tu password", "bad");

  setAlert($("loginMsg"), "Validando...", "");
  try {
    const data = await apiPost("/api/auth/login", { usuario_id, password });
    // Save session
    saveSession(data.token, data.user);
    // Also keep perms in memory (simple)
    window.__perms = data.perms;

    renderTopbar();
    applyMenuPermissions(data.perms);
    $("loginPassword").value = "";
    setView("menu");
    setAlert($("menuMsg"), "Listo ✅", "ok");
    setAlert($("loginMsg"), "", "");
  } catch (e) {
    setAlert($("loginMsg"), e.message, "bad");
  }
}

function doLogout() {
  clearSession();
  window.__perms = null;
  renderTopbar();
  setView("login");
  setAlert($("menuMsg"), "", "");
  setAlert($("capMsg"), "", "");
}

// ===== Init =====
async function init() {
  $("apiUrl").textContent = API_URL;
  $("envInfo").textContent = "Acceso por navegador (responsive)";

  $("btnLogin").addEventListener("click", doLogin);
  $("btnReloadUsers").addEventListener("click", loadUsersDropdown);
  $("btnLogout").addEventListener("click", doLogout);

  $("btnCapturas").addEventListener("click", () => {
    setView("capturas");
    setAlert($("capMsg"), "Siguiente paso: formulario Capturas.", "");
  });
  $("btnReportes").addEventListener("click", () => {
    setAlert($("menuMsg"), "Reportes queda pendiente para la siguiente fase.", "");
  });
  $("btnBackMenu").addEventListener("click", () => setView("menu"));

  // Load users for login
  await loadUsersDropdown();

  // If session exists, go to menu (simple)
  const token = getToken();
  if (token) {
    // We still need perms; ask backend catalogs with token later. For now, keep it simple:
    renderTopbar();
    setView("menu");
    setAlert($("menuMsg"), "Sesión detectada. Si algo falla, vuelve a iniciar sesión.", "");
    // Disable buttons until we confirm perms (next step)
    applyMenuPermissions({ capturas: true, reportes: false });
  } else {
    setView("login");
  }
}
function setSelectOptions(selectEl, items, valueKey, labelKey, placeholder = "Selecciona...") {
  selectEl.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder;
  selectEl.appendChild(opt0);

  for (const it of items || []) {
    const opt = document.createElement("option");
    opt.value = it[valueKey] ?? "";
    opt.textContent = it[labelKey] ?? it[valueKey] ?? "";
    selectEl.appendChild(opt);
  }
}

async function loadCatalogs() {
  const token = getToken();
  if (!token) throw new Error("No hay sesión");

  setAlert($("capMsg"), "Cargando catálogos...", "");

  const data = await apiGet("/api/catalogs", token);

  // Estos nombres dependen de tus encabezados en Sheets.
  // Ajustaremos si algún combo queda vacío.
  setSelectOptions($("capSupervisor"), data.supervisores, "supervisor_id", "supervisor_nombre", "Selecciona supervisor...");
  setSelectOptions($("capTurno"), data.turnos, "turno_id", "turno_nombre", "Selecciona turno...");
  setSelectOptions($("capMaquina"), data.maquinas, "maquina_id", "maquina_nombre", "Selecciona máquina...");
  setSelectOptions($("capEstatusReportar"), data.estatus, "estatus_id", "estatus_nombre", "Selecciona estatus...");
  setSelectOptions($("capEstatusActual"), data.estatus, "estatus_id", "estatus_nombre", "Selecciona estatus...");
  setSelectOptions($("capArea"), data.areas, "area_id", "area_nombre", "Selecciona área...");
  setSelectOptions($("capMotivo"), data.motivos, "motivo_id", "motivo_nombre", "Selecciona motivo...");

  setAlert($("capMsg"), "Catálogos listos ✅", "ok");

  return data;
}

function todayLocalISODate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

init();
