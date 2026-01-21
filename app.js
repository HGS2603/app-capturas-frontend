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

 $("btnCapturas").addEventListener("click", async () => {
  setView("capturas");
  $("capFecha").value = todayLocalISODate();

  try {
    window.__catalogs = await loadCatalogs();
    applyHoraFinMaxFromTurno();

    
  } catch (e) {
    setAlert($("capMsg"), e.message, "bad");
  }
});

  $("btnReportes").addEventListener("click", () => {
    setAlert($("menuMsg"), "Reportes queda pendiente para la siguiente fase.", "");
  });
  $("btnBackMenu").addEventListener("click", () => setView("menu"));

$("capEstatusReportar").addEventListener("change", () => {
  updateDynamicFields();
  $("capEstatusActual").value = $("capEstatusReportar").value;
});



  $("capFecha").addEventListener("change", () => maybeSuggestHoraInicio());
$("capTurno").addEventListener("change", () => {
  applyHoraFinMaxFromTurno();
  maybeSuggestHoraInicio();
});
$("capMaquina").addEventListener("change", () => maybeSuggestHoraInicio());

$("capHoraInicio").addEventListener("change", () => validateHorasLive());
 $("capHoraFin").addEventListener("change", () => validateHorasLive());

  
$("btnGuardar").disabled = false;
$("btnGuardar").addEventListener("click", saveCaptura);
  clearCapturasForm();
  setAlert($("capMsg"), "Formulario limpio", "");

  
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
  setSelectOptions($("capOperador"), data.operadores, "operador_id", "operador_nombre", "Selecciona operador...");

  setAlert($("capMsg"), "Catálogos listos ✅", "ok");
  updateDynamicFields();
  return data;
}


function getTurnoById(turno_id) {
  const turnos = window.__catalogs?.turnos || [];
  return turnos.find(t => String(t.turno_id) === String(turno_id)) || null;
}

function toMinutes(hhmm) {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

function setTimeInputValue(el, hhmm) {
  // input type="time" espera HH:MM
  el.value = hhmm || "";
}

async function maybeSuggestHoraInicio() {
  const fecha = $("capFecha").value;
  const turno_id = $("capTurno").value;
  const maquina_id = $("capMaquina").value;

  // Solo cuando están los 3
  if (!fecha || !turno_id || !maquina_id) return;

  const token = getToken();
  if (!token) return;

  setAlert($("capMsg"), "Calculando hora inicio...", "");

  try {
    const data = await apiPost("/api/capturas/suggest-start", { fecha, turno_id, maquina_id }, token);
    setTimeInputValue($("capHoraInicio"), data.hora_inicio);
    setAlert($("capMsg"), `Hora inicio sugerida: ${data.hora_inicio} (${data.source})`, "ok");

    // Si hora fin está vacía, la ponemos igual a hora inicio (opcional)
    //if (!$("capHoraFin").value) setTimeInputValue($("capHoraFin"), data.hora_inicio);

    // Ajustar límite de hora fin al fin de turno (solo guía UX)
    applyHoraFinMaxFromTurno();
  } catch (e) {
    setAlert($("capMsg"), e.message, "bad");
  }
}

function applyHoraFinMaxFromTurno() {
  const turno_id = $("capTurno").value;
  const turno = getTurnoById(turno_id);
  if (!turno) return;

  // Max guía UX: no deja seleccionar más allá (en la mayoría de browsers)
  $("capHoraFin").max = turno.hora_fin || "";

  // Si ya hay hora fin y está fuera, la recortamos
  const fin = toMinutes($("capHoraFin").value);
  const finTurno = toMinutes(turno.hora_fin);
  if (fin !== null && finTurno !== null && fin > finTurno) {
    $("capHoraFin").value = turno.hora_fin;
  }
}

function validateHorasLive() {
  const ini = toMinutes($("capHoraInicio").value);
  const fin = toMinutes($("capHoraFin").value);

  // Si no están ambas, no molestamos
  if (ini === null || fin === null) {
    setAlert($("capMsg"), "", "");
    return true;
  }

  if (fin <= ini) {
    setAlert($("capMsg"), "Hora fin debe ser mayor que hora inicio", "bad");
    return false;
  }

  // Validar contra fin de turno si existe
  const turno = getTurnoById($("capTurno").value);
  const finTurno = toMinutes(turno?.hora_fin);
  if (finTurno !== null && fin > finTurno) {
    setAlert($("capMsg"), "Hora fin no puede superar la hora fin del turno", "bad");
    return false;
  }

  setAlert($("capMsg"), "", "");
  return true;
}


function getValue(id) {
  return $(id)?.value ?? "";
}

function clearCapturasForm() {
  // Campos base
  $("capFecha").value = todayLocalISODate();
  $("capSupervisor").value = "";
  $("capTurno").value = "";
  $("capMaquina").value = "";
  $("capOperador").value = "";
  $("capHoraInicio").value = "";
  $("capHoraFin").value = "";
  $("capOrden").value = "";

  // Estatus
  $("capEstatusReportar").value = "";
  $("capEstatusActual").value = "";

  // Dinámicos
  $("capProdOk").value = "";
  $("capScrap").value = "";
  $("capArea").value = "";
  $("capMotivo").value = "";

  updateDynamicFields();
}

async function saveCaptura() {
  const token = getToken();
  if (!token) return setAlert($("capMsg"), "Sesión no válida", "bad");

  // Validación mínima frontend
  const required = [
    ["capFecha", "Fecha"],
    ["capSupervisor", "Supervisor"],
    ["capTurno", "Turno"],
    ["capMaquina", "Máquina"],
    ["capOperador", "Operador"],
    ["capHoraInicio", "Hora inicio"],
    ["capHoraFin", "Hora fin"],
    ["capOrden", "Orden"],
    ["capEstatusReportar", "Estatus a reportar"],
    ["capEstatusActual", "Estatus actual"]
  ];

  for (const [id, label] of required) {
    if (!getValue(id)) {
      return setAlert($("capMsg"), `Falta ${label}`, "bad");
    }
  }

  // Validación horas (reusar)
  if (!validateHorasLive()) return;

  const payload = {
    fecha: getValue("capFecha"),
    supervisor_id: getValue("capSupervisor"),
    turno_id: getValue("capTurno"),
    maquina_id: getValue("capMaquina"),
    operador: getValue("capOperador"),
    hora_inicio: getValue("capHoraInicio"),
    hora_fin: getValue("capHoraFin"),
    orden: Number(getValue("capOrden")),
    estatus_reportar: getValue("capEstatusReportar"),
    estatus_actual: getValue("capEstatusActual"),

    // Opcionales / dinámicos
    produccion_ok: getValue("capProdOk"),
    scrap: getValue("capScrap"),
    area_responsable_id: getValue("capArea"),
    motivo_paro_id: getValue("capMotivo")
  };

  setAlert($("capMsg"), "Guardando...", "");

  try {
    await apiPost("/api/capturas/save", payload, token);
    setAlert($("capMsg"), "Registro guardado ✅", "ok");
    clearCapturasForm();
  } catch (e) {
    setAlert($("capMsg"), e.message, "bad");
  }
}



function normalize(s) {
  // compatible en todos los navegadores modernos
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos (BOM-safe)
    .trim();
}

function hideFieldById(inputId, hide) {
  const el = $(inputId);
  if (!el) return;
  const field = el.parentElement; // en tu HTML, el <select>/<input> está dentro de <label class="field">
  if (field) field.hidden = !!hide;
}

function updateDynamicFields() {
  const sel = $("capEstatusReportar");
  if (!sel || sel.selectedIndex < 0) return;

  const text = sel.options[sel.selectedIndex]?.textContent || "";
  const v = normalize(text);

  // Bloques
  const prodBlock = $("prodFields");
  const paroBlock = $("paroFields");

  // 1) Ocultar todo por default
  show(prodBlock, false);
  show(paroBlock, false);

  // 2) Asegurar visibilidad base de los campos dentro de prodFields
  // (por si vienes de "cambio" donde ocultamos Producción OK)
   hideFieldById("capScrap", true);   // asegura Scrap visible
   hideFieldById("capProdOk", true);   // asegura Producción OK
   hideFieldById("capArea", true);   // asegura Scrap visible
   hideFieldById("capMotivo", true);   // asegura Scrap visible

  // 3) Limpiar valores cuando se ocultan (para no mandar basura al guardar después)
  $("capProdOk").value = "";
  $("capScrap").value = "";
  $("capArea").value = "";
  $("capMotivo").value = "";

  // 4) Reglas por estatus
  if (v.includes("produccion")) {
   hideFieldById("capScrap", false);   // asegura Scrap visible
   hideFieldById("capProdOk", false);   // asegura Producción OK
   hideFieldById("capArea", true);   // asegura Scrap visible
   hideFieldById("capMotivo", true);   // asegura Scrap visible

  } else if (v.includes("cambio")) {
    // Cambio: mostrar SOLO Scrap
   hideFieldById("capScrap", false);   // asegura Scrap visible
   hideFieldById("capProdOk", true);   // asegura Producción OK
   hideFieldById("capArea", true);   // asegura Scrap visible
   hideFieldById("capMotivo", true);   // asegura Scrap visible

  } else if (v.includes("paro")) {
    // Paro: mostrar Área + Motivo
   hideFieldById("capScrap", true);   // asegura Scrap visible
   hideFieldById("capProdOk", true);   // asegura Producción OK
   hideFieldById("capArea", false);   // asegura Scrap visible
   hideFieldById("capMotivo", false);   // asegura Scrap visible
  }
}


function todayLocalISODate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

init();
