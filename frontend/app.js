/* ============ VidForge AI — frontend app ============ */
"use strict";

const $ = (s) => document.querySelector(s);

// ---------------- API keys (localStorage, sent per-request) ----------------
const KEYS_STORAGE = "vidforge-keys-v1";
const KEY_FIELDS = [
  { group: "OpenCode Zen — Script", fields: [
    ["opencodezen", "API Key", "password"],
    ["opencodezenModel", "Model", "text"],
  ]},
  { group: "ElevenLabs — TTS", fields: [
    ["elevenlabs", "API Key", "password"],
    ["elevenlabsVoice", "Voice ID", "text"],
  ]},
  { group: "NVIDIA NIM — TTS + Avatar", fields: [
    ["nvidiaNim", "API Key", "password"],
  ]},
  { group: "Images — Unsplash · Pexels · Pixabay", fields: [
    ["unsplash", "Unsplash Access Key", "password"],
    ["pexels", "Pexels API Key", "password"],
    ["pixabay", "Pixabay API Key", "password"],
  ]},
  { group: "Article Fetch — Firecrawl", fields: [
    ["firecrawl", "API Key", "password"],
  ]},
  { group: "SFX — Freesound", fields: [
    ["freesound", "API Key", "password"],
  ]},
  { group: "Avatar Lip-Sync — Wav2Lip", fields: [
    ["wav2lip", "Local / API Endpoint", "text"],
  ]},
];

function loadKeys() {
  try { return JSON.parse(localStorage.getItem(KEYS_STORAGE)) || {}; }
  catch { return {}; }
}
function saveKeys(keys) {
  localStorage.setItem(KEYS_STORAGE, JSON.stringify(keys));
}
function getKeys() { return loadKeys(); }

// ---------------- settings modal ----------------
function openSettings() {
  const body = $("#settingsBody");
  const keys = loadKeys();
  body.innerHTML = KEY_FIELDS.map((g) => `
    <div class="setting-group">
      <h4>${g.group}</h4>
      ${g.fields.map(([key, label, type]) => `
        <div class="field">
          <label>${label}</label>
          <input type="${type}" data-key="${key}" value="${(keys[key] || "").replace(/"/g, "&quot;")}" autocomplete="off">
        </div>`).join("")}
    </div>`).join("");
  $("#settingsModal").hidden = false;
}

$("#btnSettings").addEventListener("click", openSettings);
$("#settingsClose").addEventListener("click", () => { $("#settingsModal").hidden = true; });
$("#settingsSave").addEventListener("click", () => {
  const keys = {};
  document.querySelectorAll("#settingsBody input[data-key]").forEach((input) => {
    keys[input.dataset.key] = input.value.trim();
  });
  saveKeys(keys);
  $("#settingsModal").hidden = true;
  const badge = document.querySelector(".badge");
  if (badge) badge.textContent = "Keys saved ✓";
  setTimeout(() => { if (badge) badge.textContent = "100% private · browser TTS"; }, 2500);
});
$("#settingsModal").addEventListener("click", (e) => { if (e.target === e.currentTarget) $("#settingsModal").hidden = true; });

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

/* ---------------- hero buttons ---------------- */
$("#btnHeroAI").addEventListener("click", () => {
  document.getElementById("create").scrollIntoView({ behavior: "smooth" });
  setTimeout(() => document.getElementById("inputText").focus(), 600);
});
$("#btnHeroDemo").addEventListener("click", () => {
  document.getElementById("previewer").scrollIntoView({ behavior: "smooth" });
  setTimeout(() => { if (!state.project) loadDemoProject(); else play(); }, 500);
});

// ---------------- auto demo on load ----------------
window.addEventListener("DOMContentLoaded", () => {
  setTimeout(loadDemoProject, 400);
});

async function loadDemoProject() {
  try {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_type: "text",
        source: "VidForge AI turns research into narrated videos directly in your browser. It extracts the key facts from articles, papers and PDFs. It builds a presentation with slides and bullet points. It writes a creator-style script in the style you choose. It generates a voice and highlights every word as it speaks. And it adds sound effects at the right moments. All processing happens in the browser.",
        style: "educational",
        title: "What is VidForge AI?",
      }),
    });
    const data = await res.json();
    if (!res.ok) return;
    const pid = data.id;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const r2 = await fetch(`/api/projects/${pid}`);
      const d2 = await r2.json();
      if (d2.status === "ready") { renderDemo(d2); return; }
      if (d2.status === "failed") return;
    }
  } catch { /* demo is optional */ }
}

function renderDemo(proj) {
  state.project = proj;
  state.slideIndex = 0;
  renderSlides();
  renderTimeline();
  showSlide(0);
  populateVoices();
  $("#stageBadge").hidden = false;
  updateTimeDisplay();
  updateSlideIndicator();
  // auto-play the demo after a moment (speech may be blocked until user interacts)
  setTimeout(() => {
    try { play(); } catch { /* autoplay policy — user clicks play */ }
  }, 800);
}

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
  const keys = getKeys();
  showStatus("Waking up server… first request may take ~60s on free tier");
  try {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, keys }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Request failed");
    // background processing — poll until ready
    const pid = data.id;
    const started = Date.now();
    while (true) {
      const r2 = await fetch(`/api/projects/${pid}`);
      const d2 = await r2.json();
      if (d2.status === "ready") { hideStatus(); loadProject(d2); return; }
      if (d2.status === "failed") { hideStatus(); showError(d2.script ? d2.script : "Processing failed — the source may not have enough readable content."); return; }
      if (Date.now() - started > 180000) { hideStatus(); showError("Timed out — please try again."); return; }
      showStatus(`Analyzing source… (${Math.round((Date.now() - started) / 1000)}s)`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  } catch (e) {
    hideStatus();
    showError(e.message);
  }
}

async function uploadFile(file, style) {
  $("#errorBox").hidden = true;
  showStatus("Reading file…");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("style", style);
  fd.append("keys", JSON.stringify(getKeys()));
  try {
    const res = await fetch("/api/projects/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Upload failed");
    hideStatus();
    // background processing — poll until ready
    const pid = data.id;
    const started = Date.now();
    while (true) {
      const r2 = await fetch(`/api/projects/${pid}`);
      const d2 = await r2.json();
      if (d2.status === "ready") { hideStatus(); loadProject(d2); return; }
      if (d2.status === "failed") { hideStatus(); showError("Processing failed — the file may not have enough readable content."); return; }
      if (Date.now() - started > 180000) { hideStatus(); showError("Timed out — please try again."); return; }
      showStatus(`Analyzing file… (${Math.round((Date.now() - started) / 1000)}s)`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  } catch (e) {
    hideStatus();
    showError(e.message);
  }
}

function showError(msg) {
  const box = $("#errorBox");
  box.textContent = msg;
  box.hidden = false;
}
function showStatus(text, spinner = true) {
  const line = $("#statusLine");
  if (!line) return;
  $("#statusText").textContent = text;
  $("#statusDot").style.animation = spinner ? "pulse 1.1s ease-in-out infinite" : "none";
  $("#statusDot").style.background = spinner ? "var(--accent)" : "var(--success)";
  line.hidden = false;
}
function hideStatus() {
  const line = $("#statusLine");
  if (line) line.hidden = true;
}

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
  updateSlideIndicator();
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

/* ---------------- playback rate / volume state ---------------- */
let playbackRate = 1;
let volumeLevel = 1;
let muted = false;

/* ---------------- play / pause ---------------- */
$("#btnPlay").addEventListener("click", () => (state.playing ? pause() : play()));
$("#btnBigPlay").addEventListener("click", () => { $("#btnBigPlay").style.opacity = 0; state.playing ? pause() : play(); });
$("#btnNext").addEventListener("click", () => { pause(); showSlide(state.slideIndex + 1); });
$("#btnPrev").addEventListener("click", () => { pause(); showSlide(state.slideIndex - 1); });
$("#btnRestart").addEventListener("click", () => { pause(); showSlide(0); setScrubber(0); highlightWord(0); });

/* ---------------- speed ---------------- */
$("#btnSpeed").addEventListener("click", (e) => {
  e.stopPropagation();
  const menu = $("#speedMenu");
  menu.hidden = !menu.hidden;
});
document.querySelectorAll("#speedMenu button").forEach((b) => {
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    playbackRate = parseFloat(b.dataset.rate);
    $("#btnSpeed").textContent = `${playbackRate}×`;
    $("#speedMenu").hidden = true;
  });
});
document.addEventListener("click", () => { $("#speedMenu").hidden = true; });

/* ---------------- volume / mute ---------------- */
$("#volumeSlider").addEventListener("input", (e) => {
  volumeLevel = parseFloat(e.target.value);
  muted = volumeLevel === 0;
  updateVolumeUI();
});
$("#btnMute").addEventListener("click", () => {
  muted = !muted;
  if (muted) { volumeLevel = parseFloat($("#volumeSlider").value) || 1; $("#volumeSlider").value = 0; }
  else { $("#volumeSlider").value = volumeLevel || 1; }
  updateVolumeUI();
});
function updateVolumeUI() {
  const mutedNow = muted || parseFloat($("#volumeSlider").value) === 0;
  $("#iconVolOn").style.display = mutedNow ? "none" : "";
  $("#iconVolOff").style.display = mutedNow ? "" : "none";
  if (state.utter) state.utter.volume = mutedNow ? 0 : (parseFloat($("#volumeSlider").value) || 1);
  if (state.audioEl) state.audioEl.volume = mutedNow ? 0 : (parseFloat($("#volumeSlider").value) || 1);
}

/* ---------------- fullscreen ---------------- */
$("#btnFullscreen").addEventListener("click", () => {
  const stage = $("#stage");
  if (!document.fullscreenElement) {
    stage.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.();
  }
});

/* ---------------- scrubber ---------------- */
const scrubTrack = $("#scrubTrack");
function setScrubber(pct) {
  const clamped = Math.max(0, Math.min(100, pct));
  $("#scrubFill").style.width = `${clamped}%`;
  $("#scrubThumb").style.left = `${clamped}%`;
}
function scrubberPctFromEvent(e) {
  const rect = scrubTrack.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  return (x / rect.width) * 100;
}
let scrubbing = false;
function scrubTo(e) {
  const pct = scrubberPctFromEvent(e);
  setScrubber(pct);
  const total = state.project ? state.project.duration || 0 : 0;
  const t = (pct / 100) * total;
  state.currentTime = t;
  updateTimeDisplay();
  // jump to the slide at that time
  const words = state.project?.words || [];
  let slideIdx = 0;
  for (const w of words) { if (w.start <= t) slideIdx = w.slide; else break; }
  showSlide(slideIdx);
}
scrubTrack.addEventListener("mousedown", (e) => { scrubbing = true; pause(); scrubTo(e); });
document.addEventListener("mousemove", (e) => { if (scrubbing) scrubTo(e); });
document.addEventListener("mouseup", () => { scrubbing = false; });
scrubTrack.addEventListener("touchstart", (e) => { scrubbing = true; pause(); scrubTo(e); }, { passive: true });
document.addEventListener("touchmove", (e) => { if (scrubbing) scrubTo(e); }, { passive: true });
document.addEventListener("touchend", () => { scrubbing = false; });
scrubTrack.addEventListener("mousemove", (e) => {
  const rect = scrubTrack.getBoundingClientRect();
  const pct = ((e.clientX - rect.left) / rect.width) * 100;
  $("#scrubHover").style.width = `${Math.max(0, Math.min(100, pct))}%`;
});

/* ---------------- time display ---------------- */
function fmtTime(sec) { sec = Math.max(0, sec || 0); return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`; }
function updateTimeDisplay() {
  const total = state.project ? state.project.duration || 0 : 0;
  $("#timeCurrent").textContent = fmtTime(state.currentTime);
  $("#timeTotal").textContent = fmtTime(total);
  if (total > 0) setScrubber((state.currentTime / total) * 100);
}
setInterval(updateTimeDisplay, 200);

/* ---------------- slide indicator ---------------- */
function updateSlideIndicator() {
  const total = state.project?.outline?.length || 0;
  if (total) $("#slideIndicator").textContent = `${state.slideIndex + 1} / ${total}`;
}

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
  const baseRate = { educational: 1.0, fast_youtube: 1.2, documentary: 0.92, research: 0.95, explainer: 1.05, news: 1.1 }[state.project.style] || 1.0;
  state.utter.rate = baseRate * playbackRate;
  state.utter.pitch = 1.0;
  updateVolumeUI();

  let i = 0;
  const wordMs = (state.project.duration || words.length * 0.3) / words.length * 1000 / playbackRate;
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
  showStatus("Re-styling script…");
  try {
    const res = await fetch(`/api/projects/${state.project.id}/script?style=${$("#inputStyle").value}`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail);
    hideStatus();
    loadProject(data);
  } catch (e) {
    hideStatus();
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
