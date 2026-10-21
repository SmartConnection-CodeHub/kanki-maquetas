/* KANKI · "Nuevo aire" — showcase "En foco" (una prenda por marca, con stock).
   Lee las tarjetas .pcard ya hidratadas con el catalogo real; no escribe precios
   ni productos a mano. Si el catalogo no llega, la seccion queda oculta.
   PC: escena sticky ligada al scroll. Celular: carrusel con scroll-snap. */
(function () {
  'use strict';

  var ORDER = ['fog', 'grizzly', 'stussy', 'luked'];
  var root = document.getElementById('aire-showcase');
  if (!root) return;

  var RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  function ready() {
    return !!window.kkStockReal && !document.documentElement.classList.contains('kk-cat-cargando');
  }

  /* Una prenda con stock por marca, tomada de las tarjetas reales */
  function pick() {
    var out = [];
    ORDER.forEach(function (id) {
      var sec = document.getElementById(id);
      if (!sec) return;
      var cards = sec.querySelectorAll('.pcard');
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        if (c.hasAttribute('data-kk-agotado') || c.querySelector('.pcard__agotado')) continue;
        if (c.hidden || c.style.display === 'none' || !c.getClientRects().length) continue;
        var n = c.querySelector('.pcard__name'), p = c.querySelector('.pcard__price');
        var im = c.querySelector('.pcard__wrap img'), b = c.querySelector('.pcard__brand');
        if (!n || !p || !im) continue;
        var src = im.currentSrc || im.getAttribute('src');
        var name = n.textContent.trim(), price = p.textContent.trim();
        if (!src || !name || !price) continue;
        out.push({ card: c, name: name, price: price, img: src, brand: b ? b.textContent.trim() : '' });
        break;
      }
    });
    return out;
  }

  function abrir(item) {
    if (typeof window.openQV === 'function') window.openQV(item.card);
  }

  function boton(item) {
    var b = el('button', 'aire-sc__btn');
    b.type = 'button';
    b.appendChild(document.createTextNode('Ver la prenda'));
    var f = el('span', null, '↗'); f.setAttribute('aria-hidden', 'true');
    b.appendChild(f);
    b.setAttribute('aria-label', 'Ver la prenda: ' + item.name);
    b.addEventListener('click', function () { abrir(item); });
    return b;
  }

  /* ---------- Celular ---------- */
  function buildMobile(items) {
    var mob = el('div', 'aire-sc__mob');
    var head = el('div', 'aire-sc__head');
    head.appendChild(el('p', 'aire-sc__eyebrow', 'En foco / Selección Kanki'));
    var h = el('h2'); h.appendChild(document.createTextNode('Una por marca. '));
    h.appendChild(el('em', null, 'Con stock.')); head.appendChild(h);
    mob.appendChild(head);

    var track = el('div', 'aire-sc__track');
    track.setAttribute('role', 'group');
    track.setAttribute('aria-label', 'Prendas destacadas, desliza para ver más');
    items.forEach(function (it, i) {
      var card = el('article', 'aire-sc__card');
      var fig = el('figure', 'aire-sc__fig');
      var img = el('img'); img.src = it.img; img.alt = it.name; img.loading = 'lazy'; img.decoding = 'async';
      fig.appendChild(img);
      fig.addEventListener('click', function () { abrir(it); });
      var body = el('div', 'aire-sc__cardbody');
      body.appendChild(el('p', 'aire-sc__eyebrow', (i + 1 < 10 ? '0' : '') + (i + 1) + ' / ' + it.brand));
      body.appendChild(el('h3', 'aire-sc__name', it.name));
      body.appendChild(el('p', 'aire-sc__price', it.price));
      body.appendChild(boton(it));
      card.appendChild(fig); card.appendChild(body); track.appendChild(card);
    });
    mob.appendChild(track);

    var count = el('div', 'aire-sc__count');
    var lbl = el('span', null, '01 / 0' + items.length);
    var bars = el('span', 'aire-sc__bars'); bars.setAttribute('aria-hidden', 'true');
    items.forEach(function () { bars.appendChild(el('i')); });
    count.appendChild(lbl); count.appendChild(bars);
    mob.appendChild(count);

    function sync() {
      var first = track.firstElementChild; if (!first) return;
      var step = first.getBoundingClientRect().width + 12;
      var idx = Math.max(0, Math.min(items.length - 1, Math.round(track.scrollLeft / step)));
      lbl.textContent = '0' + (idx + 1) + ' / 0' + items.length;
      for (var i = 0; i < bars.children.length; i++) bars.children[i].classList.toggle('is-on', i === idx);
    }
    var t = 0;
    track.addEventListener('scroll', function () { if (!t) t = requestAnimationFrame(function () { t = 0; sync(); }); }, { passive: true });
    sync();
    return mob;
  }

  /* ---------- PC (sticky) ---------- */
  function buildDesktop(items) {
    var desk = el('div', 'aire-sc__desk');
    var stage = el('div', 'aire-sc__stage');
    var copy = el('div', 'aire-sc__copy');
    var media = el('div', 'aire-sc__media');
    var slides = [], imgs = [], dots = [];

    media.appendChild(el('p', 'aire-sc__brandtag', 'En foco'));
    items.forEach(function (it, i) {
      var s = el('div', 'aire-sc__slide');
      s.appendChild(el('p', 'aire-sc__eyebrow', 'En foco / ' + it.brand));
      s.appendChild(el('h2', 'aire-sc__name', it.name));
      s.appendChild(el('p', 'aire-sc__price', it.price));
      s.appendChild(boton(it));
      copy.appendChild(s); slides.push(s);

      var im = el('img'); im.src = it.img; im.alt = it.name; im.loading = 'lazy'; im.decoding = 'async';
      if (i > 0) im.setAttribute('aria-hidden', 'true');
      media.appendChild(im); imgs.push(im);
    });

    var nav = el('div', 'aire-sc__nav');
    nav.setAttribute('role', 'group'); nav.setAttribute('aria-label', 'Elegir prenda destacada');
    items.forEach(function (it, i) {
      var b = el('button'); b.type = 'button'; b.setAttribute('aria-label', 'Ver ' + it.name);
      b.addEventListener('click', function () { irA(i); });
      nav.appendChild(b); dots.push(b);
    });

    var foot = el('div', 'aire-sc__foot');
    var counter = el('span', null, '01 / 0' + items.length);
    foot.appendChild(counter);
    foot.appendChild(el('span', null, 'Desliza para explorar ↓'));
    var all = el('a', null, 'Todas las marcas ↘'); all.href = '#marcas'; foot.appendChild(all);

    var bar = el('div', 'aire-sc__bar'); bar.setAttribute('aria-hidden', 'true');
    stage.appendChild(copy); stage.appendChild(media); stage.appendChild(nav); stage.appendChild(foot); stage.appendChild(bar);
    desk.appendChild(stage);

    var hdr = document.getElementById('hdr');
    var active = -1, raf = 0;

    function medir() {
      var h = hdr ? Math.round(hdr.getBoundingClientRect().height) : 73;
      root.style.setProperty('--aire-hdr', h + 'px');
      root.style.setProperty('--aire-n', String(items.length));
    }
    function activar(i) {
      if (i === active) return;
      active = i;
      for (var k = 0; k < items.length; k++) {
        var on = k === i;
        slides[k].classList.toggle('is-active', on);
        imgs[k].classList.toggle('is-active', on);
        if (on) dots[k].setAttribute('aria-current', 'true'); else dots[k].removeAttribute('aria-current');
        slides[k].setAttribute('aria-hidden', on ? 'false' : 'true');
      }
      counter.textContent = '0' + (i + 1) + ' / 0' + items.length;
    }
    function update() {
      raf = 0;
      if (!stage.offsetHeight) return; /* oculto (celular) */
      var hh = hdr ? hdr.getBoundingClientRect().height : 73;
      var y = hh - desk.getBoundingClientRect().top;         /* px recorridos dentro de la escena */
      var paso = stage.offsetHeight;                          /* alto de cada escena */
      var idx = Math.max(0, Math.min(items.length - 1, Math.round(y / paso)));
      var total = paso * (items.length - 1);
      root.style.setProperty('--aire-p', String(Math.max(0, Math.min(1, total ? y / total : 0)).toFixed(3)));
      activar(idx);
    }
    function onScroll() { if (!raf) raf = requestAnimationFrame(update); }
    function irA(i) {
      var paso = stage.offsetHeight;
      var hh = hdr ? hdr.getBoundingClientRect().height : 73;
      var top = desk.getBoundingClientRect().top + window.pageYOffset - hh + i * paso;
      window.scrollTo({ top: top, behavior: RM.matches ? 'auto' : 'smooth' });
    }

    medir(); activar(0);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () { medir(); onScroll(); });
    setTimeout(update, 0);
    return desk;
  }

  /* ---------- Arranque: esperar el catalogo real ---------- */
  var intentos = 0;
  function tick() {
    if (ready()) {
      var items = pick();
      if (!items.length) return;               /* sin prendas con stock: queda oculta */
      root.appendChild(buildDesktop(items));
      root.appendChild(buildMobile(items));
      root.hidden = false;
      return;
    }
    if (++intentos < 125) setTimeout(tick, 120); /* ~15 s y se rinde: la seccion sigue oculta */
  }
  tick();
})();
