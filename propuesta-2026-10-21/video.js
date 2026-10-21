'use strict';
/* Video de portada: autoplay con reintentos (en Windows/Chrome a veces queda como imagen fija),
   botón de pausa y respeto a prefers-reduced-motion (no se esconde: solo deja de autoreproducir). */
(() => {
  const video = document.getElementById('hero-video');
  const toggle = document.getElementById('video-toggle');
  const fallback = document.getElementById('video-fallback');
  const reducedQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : {matches: false};
  let userPaused = reducedQuery.matches; // con movimiento reducido parte en pausa, el usuario decide
  let retries = 0;

  video.muted = true; video.defaultMuted = true; video.loop = true; video.playsInline = true;
  video.controls = false; video.disablePictureInPicture = true;
  video.autoplay = !userPaused;
  if (userPaused) video.pause();

  function paint() {
    const playing = !video.paused && !video.ended;
    toggle.dataset.playing = String(playing);
    toggle.setAttribute('aria-label', playing ? 'Pausar video de portada' : 'Reproducir video de portada');
    toggle.setAttribute('aria-pressed', String(!playing));
  }
  function play() {
    if (userPaused || document.hidden || !video.paused) return;
    const attempt = video.play();
    if (attempt && attempt.catch) attempt.catch(() => {});
  }
  function retryLoop() {
    // Reintenta unos segundos: cubre políticas de autoplay y descargas lentas.
    if (userPaused || !video.paused || retries >= 8) return;
    retries++; play();
    setTimeout(retryLoop, 400 * retries);
  }

  toggle.addEventListener('click', () => {
    if (video.paused) { userPaused = false; fallback.hidden = true; video.play().catch(() => { fallback.hidden = false; }); }
    else { userPaused = true; video.pause(); }
    paint();
  });
  ['play', 'pause', 'playing', 'ended'].forEach(name => video.addEventListener(name, paint));
  ['loadeddata', 'canplay'].forEach(name => video.addEventListener(name, play));
  video.addEventListener('error', () => { fallback.hidden = false; paint(); });
  document.addEventListener('visibilitychange', play);
  // Primer gesto del usuario desbloquea el autoplay bloqueado por el navegador.
  ['pointerdown', 'touchstart', 'keydown', 'scroll'].forEach(name =>
    window.addEventListener(name, play, {once: true, passive: true}));
  if (reducedQuery.addEventListener) reducedQuery.addEventListener('change', event => {
    if (event.matches) { userPaused = true; video.pause(); } paint();
  });

  paint();
  retryLoop();
})();
