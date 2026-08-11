/* ============ VidForge AI — frontend app ============ */
"use strict";

const $ = (s) => document.querySelector(s);

const state = {
  project: null,
  slideIndex: 0,
  playing: false,
  synth: window.speechSynthesis,
  voice: null,
  utter: null,
  wordTimer: null,
  audioUrl: null,
  audioEl: null,
};

/* ---------------- tabs ---------------- */
let activeTab = "text";
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    activeTab = tab.dataset.tab;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".source-panel").forEach((p) => p.classList.remove("active"));
    $("#panel-" + activeTab).classList.add("active");
  });
});

/* ---------------- pdf dropzone ---------------- */
const dz = $("#dropzone");
dz.addEventListener("click", () => $("#inputPdf").click());
dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.style.borderColor = "var(--accent)"; });
dz.addEventListener("dragleave", () => { dz.style.borderColor = ""; });
dz.addEventListener("drop", (e) => {
  e.preventDefault();
  dz.style.borderColor = "";
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
$("#inputPdf").addEventListener("change", (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); });

function handleFile(file) {
  $("#pdfName").textContent = file.name + " (" + (file.size / 1024).toFixed(0) + " KB)";
}

/* ---------------- theme toggle ---------------- */
$("#themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("light");
  $("#iconMoon").style.display = document.body.classList.contains("light") ? "none" : "";
  $("#iconSun").style.display = document.body.classList.contains("light") ? "" : "none";
  if (document.body.classList.contains("light")) {
    document.documentElement.style.setProperty("--bg", "#f7f7f5");
    document.documentElement.style.setProperty("--bg-soft", "#ffffff");
    document.documentElement.style.setProperty("--surface", "#ffffff");
    document.documentElement.style.setProperty("--surface-2", "#f0f0ec");
    document.documentElement.style.setProperty("--border", "#e2e2da");
    document.documentElement.style.setProperty("--text", "#16161f");
    document.documentElement.style.setProperty("--text-dim", "#6b6b80");
  } else {
    document.documentElement.style.setProperty("--bg", "#0f0f1a");
    document.documentElement.style.setProperty("--bg-soft", "#16162a");
    document.documentElement.style.setProperty("--surface", "#1c1c33");
    document.documentElement.style.setProperty("--surface-2", "#242442");
    document.documentElement.style.setProperty("--border", "#2e2e52");
    document.documentElement.style.setProperty("--text", "#ececf2");
    document.documentElement.style.setProperty("--text-dim", "#9a9ab5");
  }
});

/* ---------------- generate ---------------- */
$("#btnGenerate").addEventListener("click", generate);

async function generate() {
  const style = $("#inputStyle").value;
  let body;
  if (activeTab === "text") {
    body = { source_type: "text", source: $("#inputText").value, style, title: $("#inputTitle").value };
  } else if (activeTab === "url") {
    body = { source_type: "url", source: $("#inputUrl").value, style, title: $("#inputTitle").value };
  } else {
    const file = $("#inputPdf").files[0];
    if (!file) return showError("Choose a PDF or TXT file first.");
    return uploadFile(file, style);
  }
  if (!body.source || body.source.trim().length < 40) {
    return showError("Please provide at least ~40 characters of source content.");
  }
  $("#errorBox").hidden = true;
  showLoading("Analyzing source & generating script…");
  try {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Request failed");
    hideLoading();
    loadProject(data);
  } catch (e) {
    hideLoading();
    showError(e.message);
  }
}

async function uploadFile(file, style) {
  $("#errorBox").hidden = true;
  showLoading("Reading file…");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("style", style);
  try {
    const res = await fetch("/api/projects/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Upload failed");
    hideLoading();
    loadProject(data);
  } catch (e) {
    hideLoading();
    showError(e.message);
  }
}

function showError(msg) {
  const box = $("#errorBox");
  box.textContent = msg;
  box.hidden = false;
}
function showLoading(text) {
  $("#loadingText").textContent = text;
  $("#loading").hidden = false;
}
function hideLoading() { $("#loading").hidden = true; }

/* ---------------- load project ---------------- */
async function loadProject(proj) {
  state.project = proj;
  state.slideIndex = 0;
  state.playing = false;

  populateVoices();
  renderSlides();
  renderScript();
  renderTimeline();
  showStep("player");
  $("#playerTitle").textContent = proj.title;
  $("#playerMeta").textContent =
    `${proj.outline.length} slides · ${Math.round(proj.duration)}s narration · script by ${proj.script_provider} · ` +
    `TTS: ${(proj.providers && proj.providers.tts) || "browser"}`;
  $("#styleTag").textContent = proj.style.replace("_", " ");

  // fire-and-forget: try to fetch real audio (elevenlabs/nim) in the background
  try {
    const r = await fetch(`/api/projects/${proj.id}/tts`, { method: "POST" });
    const ttsRes = await r.json();
    state.audioUrl = ttsRes.audio_url || null;
    if (state.audioUrl) {
      state.audioEl = new Audio(state.audioUrl);
      state.audioEl.addEventListener("ended", () => stopPlayback(true));
      const meta = $("#playerMeta");
      meta.textContent = meta.textContent.replace("TTS: browser", "TTS: server audio");
    }
  } catch (e) {
    state.audioUrl = null;
  }
}

/* ---------------- voices ---------------- */
function populateVoices() {
  const sel = $("#voiceSelect");
  sel.innerHTML = "";
  try {
    const voices = state.synth.getVoices();
    const en = voices.filter((v) => v.lang.startsWith("en"));
    (en.length ? en : voices).forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.name;
      opt.textContent = v.name.replace(/Microsoft|Google|Natural|Online/g, "").trim() || v.name;
      sel.appendChild(opt);
    });
    if (en.length) state.voice = en[0];
  } catch (e) {
    // speechSynthesis unavailable (some headless browsers) — degrade gracefully
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Browser voice (unavailable here)";
    sel.appendChild(opt);
  }
}
if (state.synth) {
  try {
    state.synth.onvoiceschanged = populateVoices;
    populateVoices();
  } catch (e) { /* ignore */ }
}

/* ---------------- slides ---------------- */
function renderSlides() {
  const stage = $("#stage");
  stage.innerHTML = "";
  state.project.outline.forEach((slide, i) => {
    const div = document.createElement("div");
    div.className = "slide" + (i === 0 ? " active" : "");
    const bg = slide.bg || "linear-gradient(135deg,#1c1c33,#242442)";
    const img = slide.image && slide.image.url
      ? `<img class="slide-img" src="${slide.image.url}" alt="${slide.image.alt || ""}" loading="lazy">`
      : "";
    div.innerHTML = `
      <div class="slide-bg" style="background:${bg}"></div>
      ${img}
      <div class="slide-kicker">Slide ${i + 1} · ${slide.image ? slide.image.source : "generated"}</div>
      <h2>${escapeHtml(slide.heading)}</h2>
      <ul>${slide.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`;
    stage.appendChild(div);
  });
}

function showSlide(i) {
  state.slideIndex = Math.max(0, Math.min(i, state.project.outline.length - 1));
  document.querySelectorAll(".slide").forEach((s, idx) => s.classList.toggle("active", idx === state.slideIndex));
  updateTimeline();
}

/* ---------------- script + highlighting ---------------- */
function renderScript() {
  const words = state.project.script.split(/\s+/);
  $("#scriptText").innerHTML = words.map((w, i) => `<span class="word" data-i="${i}">${escapeHtml(w)}</span>`).join(" ");
}

function highlightWord(i) {
  document.querySelectorAll(".script-text .word").forEach((w) => w.classList.toggle("active", +w.dataset.i === i));
}

/* ---------------- timeline ---------------- */
function renderTimeline() {
  const tl = $("#timeline");
  tl.innerHTML = "";
  state.project.outline.forEach(() => {
    const seg = document.createElement("div");
    seg.className = "seg";
    tl.appendChild(seg);
  });
}
function updateTimeline() {
  document.querySelectorAll(".timeline .seg").forEach((seg, i) => {
    seg.className = "seg" + (i < state.slideIndex ? " done" : i === state.slideIndex ? " current" : "");
  });
}

/* ---------------- play / pause ---------------- */
$("#btnPlay").addEventListener("click", () => (state.playing ? pause() : play()));
$("#btnNext").addEventListener("click", () => { pause(); showSlide(state.slideIndex + 1); });
$("#btnPrev").addEventListener("click", () => { pause(); showSlide(state.slideIndex - 1); });

async function play() {
  if (!state.project) return;
  state.playing = true;
  $("#iconPlay").style.display = "none";
  $("#iconPause").style.display = "";

  // real audio path (elevenlabs / nim)
  if (state.audioUrl && state.audioEl) {
    try {
      state.audioEl.currentTime = 0;
      await state.audioEl.play();
      // highlight via timeline positions (approximate slide mapping)
      const step = (state.project.duration || 20) / (state.project.words.length || 1);
      let i = 0;
      state.wordTimer = setInterval(() => {
        highlightWord(i);
        const slideIdx = state.project.words[i] ? state.project.words[i].slide : 0;
        if (slideIdx !== state.slideIndex) showSlide(slideIdx);
        i++;
        if (i >= state.project.words.length) clearInterval(state.wordTimer);
      }, step * 1000);
      return;
    } catch (e) { /* fall through to browser TTS */ }
  }

  // browser TTS path (speechSynthesis)
  const words = state.project.script.split(/\s+/);
  state.utter = new SpeechSynthesisUtterance(state.project.script);
  if (state.voice) state.utter.voice = state.voice;
  state.utter.rate = { educational: 1.0, fast_youtube: 1.2, documentary: 0.92, research: 0.95, explainer: 1.05, news: 1.1 }[state.project.style] || 1.0;
  state.utter.pitch = 1.0;

  let i = 0;
  const wordMs = (state.project.duration || words.length * 0.3) / words.length * 1000;
  state.wordTimer = setInterval(() => {
    if (!state.playing) return;
    highlightWord(i);
    const slideIdx = state.project.words[i] ? state.project.words[i].slide : 0;
    if (slideIdx !== state.slideIndex) showSlide(slideIdx);
    if ($("#sfxToggle").checked) playSfx();
    i++;
    if (i >= words.length) { clearInterval(state.wordTimer); stopPlayback(true); }
  }, wordMs);

  state.utter.onend = () => stopPlayback(true);
  state.synth.cancel();
  state.synth.speak(state.utter);
}

function pause() {
  state.playing = false;
  $("#iconPlay").style.display = "";
  $("#iconPause").style.display = "none";
  if (state.wordTimer) clearInterval(state.wordTimer);
  if (state.utter) state.synth.cancel();
  if (state.audioEl) state.audioEl.pause();
}

function stopPlayback(finished) {
  pause();
  if (finished) {
    document.querySelectorAll(".script-text .word").forEach((w) => w.classList.remove("active"));
    showSlide(0);
  }
}

/* ---------------- sound effects (Web Audio, synthesized = copyright-free) ---------------- */
let audioCtx = null;
function playSfx() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.08);
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.15);
  } catch (e) { /* audio blocked */ }
}

/* ---------------- misc ---------------- */
$("#btnNewVideo").addEventListener("click", () => {
  pause();
  showStep("source");
  $("#errorBox").hidden = true;
});
$("#btnRestyle").addEventListener("click", restyle);

async function restyle() {
  if (!state.project) return;
  showLoading("Re-styling script…");
  try {
    const res = await fetch(`/api/projects/${state.project.id}/script?style=${$("#inputStyle").value}`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail);
    hideLoading();
    loadProject(data);
  } catch (e) {
    hideLoading();
    showError(e.message);
  }
}

function showStep(id) {
  document.querySelectorAll(".step").forEach((s) => s.classList.remove("active"));
  $("#step-" + id).classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
