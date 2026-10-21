'use strict';
(window.KANKI_READY||Promise.resolve()).then(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const currency = n => new Intl.NumberFormat('es-CL', {style:'currency',currency:'CLP',maximumFractionDigits:0}).format(n);
  const products = window.KANKI_CATALOG.products;
  const navigation=window.KANKI_NAV||{toElement(element){element?.scrollIntoView({behavior:motion.behavior||'auto',block:'start'});},scrollBy(element,delta){element.scrollBy({left:delta,behavior:motion.behavior||'auto'});}};
  const ui=window.KANKI_UI||{change(_element,mutate){mutate();},enter(){},animate(){},show(element){element.hidden=false;},hide(element){element.hidden=true;return Promise.resolve();},openDialog(dialog){dialog.showModal();},closeDialog(dialog){dialog?.close();return Promise.resolve();},zoom(_dialog,mutate){mutate();},interrupt(){}};
  const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cartStorageKey='kanki_maqueta_cart';
  function restoreCart(serialized) {
    try {
      const saved=JSON.parse(serialized===undefined?localStorage.getItem(cartStorageKey):serialized);
      if(!saved||saved.version!==1||!Array.isArray(saved.items))return [];
      const restored=[];
      for(const item of saved.items.slice(0,150)){
        const p=products.find(p=>p.id===item?.id);
        if(!p||!Number.isInteger(item.quantity)||item.quantity<1)continue;
        const size=item.size;
        if(p.stockBySize?!Object.hasOwn(p.stockBySize,size):size!=='Por confirmar')continue;
        const sizeUsed=restored.filter(x=>x.id===p.id&&x.size===size).reduce((n,x)=>n+x.quantity,0);
        const productUsed=restored.filter(x=>x.id===p.id).reduce((n,x)=>n+x.quantity,0);
        const quantity=Math.min(item.quantity,(p.stockBySize?p.stockBySize[size]:p.stock)-sizeUsed,p.stock-productUsed);
        if(quantity<1)continue;
        const existing=restored.find(x=>x.id===p.id&&x.size===size);
        if(existing)existing.quantity+=quantity;else restored.push({id:p.id,size,quantity});
      }
      return restored;
    }catch{return [];}
  }
  const state = {theme:'coast',view:'improved',filter:'all',brand:'all',cart:restoreCart()};
  let removedCartLine=null,cartOpenTicket=0;
  function saveCart(){try{localStorage.setItem(cartStorageKey,JSON.stringify({version:1,items:state.cart}));}catch{}}

  const brandNames = {all:'Todas las marcas',essentials:'Essentials',grizzly:'Grizzly',stussy:'Stüssy',luked:'Luked'};
  let motion = {register(){},forget(){},refresh(){}};
  const dialogFocus=new WeakMap(),skipFocusRestore=new WeakSet();
  let toastTimer;
  const asset = p => /^https?:/.test(p) ? p : 'assets/' + p;
  const imageClass = p => p.width / p.height < .7 ? 'grizzly-image' : '';
  const previewImage = p => asset(p.previewImage || p.image);
  const imageSources = (p,sizes) => p.imageSources ? `srcset="${p.imageSources.map(source=>`${asset(source.src)} ${source.width}w`).join(', ')}" sizes="${sizes}"` : '';
  function loadOriginalPhoto(p,button) {
    const image=button.querySelector('img');
    if(p.imageUnavailable){button.disabled=true;$('.image-zoom-hint',button).textContent='Foto original pendiente';return;}
    const original=asset(p.image);
    if(image.getAttribute('src')===original)return;
    const full=new Image();full.decoding='async';full.fetchPriority='high';
    full.addEventListener('load',()=>{
      const reveal=()=>{if(image.isConnected){image.src=original;image.dataset.fullResolution='true';}};
      if(full.decode)full.decode().then(reveal,reveal);else reveal();
    },{once:true});
    full.src=original;
  }

  function remainingStock(p,size) {
    if(p.soldOut)return 0;
    const limit=p.stockBySize?(p.stockBySize[size]||0):p.stock;
    const inSize=state.cart.filter(item=>item.id===p.id&&item.size===size).reduce((sum,item)=>sum+item.quantity,0);
    const inProduct=state.cart.filter(item=>item.id===p.id).reduce((sum,item)=>sum+item.quantity,0);
    return Math.max(0,Math.min(limit-inSize,p.stock-inProduct));
  }
  function capacityForCartLine(p,size,line){
    if(p.soldOut)return 0;
    const others=state.cart.filter(item=>item!==line&&item.id===p.id);
    const inSize=others.filter(item=>item.size===size).reduce((n,item)=>n+item.quantity,0);
    const inProduct=others.reduce((n,item)=>n+item.quantity,0);
    return Math.max(0,Math.min((p.stockBySize?.[size]||0)-inSize,p.stock-inProduct));
  }

  function renderProducts(animate=false) {
    if(animate)return ui.change($('#product-grid'),()=>renderProducts(),{duration:360});
    motion.forget($('#product-grid'));
    const shown = products.filter(p => (state.filter === 'all' || p.type === state.filter) && (state.brand === 'all' || p.brandKey === state.brand));
    const order = ['essentials','grizzly','stussy','luked'];
    const brandTitles = {essentials:'FEAR<br>OF GOD<br>ESSENTIALS',grizzly:'GRIZZLY<br>GRIPTAPE',stussy:'STÜSSY',luked:'LUKED<br>APPAREL'};
    const brandLogos = {essentials:'brand-essentials-original.svg',grizzly:'brand-grizzly.png',stussy:'brand-stussy.svg',luked:'brand-luked.jpg'};
    const soldTag = p => p.soldOut ? '<span class="sold-tag">Agotado</span>' : '';
    const badgeTag = p => p.badge && !p.soldOut ? `<span class="badge-tag">${escapeHTML(p.badge)}</span>` : '';
    const card = (p,i) => `<article class="product-card${p.soldOut?' is-soldout':''}" data-reveal style="--reveal-delay:${(i%4)*55}ms"><button class="product-photo" data-product="${p.id}" aria-label="Ver ${escapeHTML(p.name)}${p.soldOut?' (agotado)':''}">${soldTag(p)}${badgeTag(p)}<span class="product-index">${String(products.indexOf(p)+1).padStart(2,'0')} / ${p.type === 'tee' ? 'POLERA' : 'POLERÓN'}</span><img src="${previewImage(p)}" ${imageSources(p,'(max-width: 700px) 44vw, 23vw')} class="${imageClass(p)}" alt="${escapeHTML(p.name)}" width="${p.width}" height="${p.height}" loading="eager" fetchpriority="${shown.indexOf(p)<2?'high':'low'}" decoding="async">${p.soldOut?'':'<span class="quick-add" aria-hidden="true">+</span>'}</button><div class="product-meta"><div><p class="product-brand">${escapeHTML(p.brand)}</p><button class="product-name" data-product="${p.id}">${escapeHTML(p.name)}</button></div><div class="price-stack"><p class="product-price">${currency(p.price)}</p>${p.comparePrice > p.price ? `<s class="compare-price">${currency(p.comparePrice)}</s>` : ''}</div></div></article>`;
    const collections = order.map((key,index)=>{
      const items = shown.filter(p=>p.brandKey===key);
      if (!items.length) return '';
      return `<section class="brand-collection" id="collection-${key}" data-brand-section="${key}" aria-labelledby="brand-title-${key}"><div class="brand-title-layout" data-reveal><div class="brand-title-copy"><p class="brand-collection-label">SELECCIÓN KANKI / 0${index+1}</p><h3 id="brand-title-${key}">${brandTitles[key]}</h3></div><div class="brand-title-mark brand-title-mark--${key}"><img src="assets/${brandLogos[key]}" alt="" aria-hidden="true" loading="lazy"></div></div><div class="brand-collection-heading"><div class="collection-tools"><span>${items.length} ${items.length===1?'prenda':'prendas'}</span>${state.brand==='all'?`<button data-brand="${key}" data-brand-shortcut>Ver marca ↗</button>`:''}</div><div class="shelf-arrows"><button data-shelf="shelf-${key}" data-direction="-1" aria-controls="shelf-${key}" aria-label="Ver productos anteriores de ${brandNames[key]}">←</button><button data-shelf="shelf-${key}" data-direction="1" aria-controls="shelf-${key}" aria-label="Ver más productos de ${brandNames[key]}">→</button></div></div><div class="brand-shelf" id="shelf-${key}" tabindex="0" role="region" aria-label="Productos de ${brandNames[key]}; desplaza para explorar">${items.map(card).join('')}</div></section>`;
    });
    $('#essentials-grid').innerHTML=collections[0];
    $('#other-brand-grid').innerHTML=collections.slice(1).join('');
    const filtered=state.brand!=='all'||state.filter!=='all';
    $('#kanki-banner').hidden=filtered;
    $('#product-showcase').hidden=filtered;
    $('#catalog-empty').hidden=shown.length>0;
    $('#catalog-empty').innerHTML='';
    $$('.brand-shelf').forEach(shelf=>{
      shelf.addEventListener('scroll',()=>updateShelfControls(shelf),{passive:true});
      shelf.addEventListener('keydown',event=>{
        if (event.target!==shelf || !['ArrowLeft','ArrowRight'].includes(event.key)) return;
        event.preventDefault();navigation.scrollBy(shelf,(event.key==='ArrowRight'?1:-1)*shelf.clientWidth*.85);
      });
      updateShelfControls(shelf);
    });
    if (!shown.length) {
      $('#catalog-empty').innerHTML = `<div class="no-products"><span aria-hidden="true">↗</span><h3>ESTA COMBINACIÓN SE FUE AL AGUA.</h3><p>No hay ${state.filter === 'tee' ? 'poleras' : state.filter === 'hoodie' ? 'polerones' : 'prendas'} de ${brandNames[state.brand]} en esta selección de prueba. Prueba con otra marca o ve todas las prendas.</p><button class="button primary" data-reset-filters>Ver toda la selección <span>↗</span></button></div>`;
    }
    $('#product-count').textContent = `${shown.length} ${shown.length === 1 ? 'prenda' : 'prendas'}`;
    $('#filter-description').textContent = filtered ? `${brandNames[state.brand]} · ${state.filter === 'tee' ? 'Poleras' : state.filter === 'hoodie' ? 'Polerones' : 'Todas las prendas'}` : 'Toda la selección';
    $$('[data-reset-filters]').forEach(b=>{ if (!b.closest('.no-products')) b.hidden = !filtered; });
    $$('[data-brand]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.brand === state.brand)));
    $$('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter === state.filter)));
    $('#garment-filter-value').textContent=state.filter==='hoodie'?'Polerones':state.filter==='tee'?'Poleras':'Todas';
    $$('.brand-filters [data-brand]').forEach(button=>{const count=products.filter(p=>(state.filter==='all'||p.type===state.filter)&&(button.dataset.brand==='all'||p.brandKey===button.dataset.brand)).length;button.querySelector('[data-brand-count]').textContent=String(count);});
    motion.register($('#product-grid'));
  }
  function updateShelfControls(shelf) {
    const end = Math.max(0,shelf.scrollWidth-shelf.clientWidth);
    $$(`[data-shelf="${shelf.id}"]`).forEach(button=>{button.disabled = Number(button.dataset.direction)<0 ? shelf.scrollLeft<=2 : shelf.scrollLeft>=end-2;});
  }
  window.addEventListener('resize',()=>$$('.brand-shelf').forEach(updateShelfControls),{passive:true});
  function toast(message) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;ui.show($('#toast'));
    toastTimer = setTimeout(() => { ui.hide($('#toast')); }, 3800);
  }
  function closeMenu() {
    ui.hide($('#mobile-nav'));
    $('#menu-button').setAttribute('aria-expanded','false');
    $('#menu-button').setAttribute('aria-label','Abrir menú');
  }
  function openDialog(id) {
    cartOpenTicket++;
    const dialog = document.getElementById(id);
    if (!dialog) return;
    let trigger=document.activeElement;
    if(dialog.open&&dialog.contains(trigger))trigger=dialogFocus.get(dialog)||trigger;
    $$('dialog[open]').forEach(d=>{if(d===dialog)return;if(d.contains(trigger))trigger=dialogFocus.get(d)||trigger;skipFocusRestore.add(d);ui.closeDialog(d,true);});
    dialogFocus.set(dialog,trigger);
    closeMenu();
    if (id === 'cart-dialog') renderCart();
    if (id === 'school-dialog') { $('#school-result').hidden = true; $('#school-form').hidden = false; }
    ui.openDialog(dialog);
  }
  const soldTagFor = p => p.soldOut ? '<span class="sold-tag">Agotado</span>' : '';
  const galleryUI = p => (p.images||[]).length>1 ? `<div class="detail-thumbs" role="group" aria-label="Fotos de ${escapeHTML(p.name)}">${p.images.map((src,i)=>`<button type="button" class="detail-thumb" data-gallery-src="${escapeHTML(src)}" aria-pressed="${i===0}" aria-label="Ver foto ${i+1} de ${p.images.length}"><img src="${escapeHTML(src)}" alt="" width="44" height="44" loading="lazy" decoding="async"></button>`).join('')}</div>` : '';
  function showProduct(id) {
    const p = products.find(p => p.id === id); if (!p) return;
    $('#product-dialog').classList.remove('is-photo-expanded');
    const sizes = p.stockBySize ? Object.keys(p.stockBySize).sort((a,b)=>['XS','S','M','L','XL','XXL','3XL'].indexOf(a)-['XS','S','M','L','XL','XXL','3XL'].indexOf(b)) : [];
    const sizeUI = p.soldOut ? '<div class="size-unconfirmed">Agotado por ahora. Esta prenda no se puede agregar al carrito.</div>' : sizes.length ? `<fieldset class="sizes"><legend>Elige tu talla</legend><div class="size-options">${sizes.map(size=>`<label class="size-choice"><input type="radio" name="size" value="${size}" required ${remainingStock(p,size)?'':'disabled'} aria-label="Talla ${size}${remainingStock(p,size)?'':' ya añadida al carrito'}"><span>${size}</span></label>`).join('')}</div></fieldset>` : '<div class="size-unconfirmed">Talla por confirmar. La web publica disponibilidad de este modelo, pero no informa tallas.</div><input type="hidden" name="size" value="Por confirmar">';
    $('#product-detail').innerHTML = `<div class="product-detail-layout"><button class="detail-photo" type="button" data-image-zoom aria-expanded="false" aria-label="Ampliar foto de ${escapeHTML(p.name)}">${soldTagFor(p)}<img class="${imageClass(p)}" src="${previewImage(p)}" alt="${escapeHTML(p.name)}" width="${p.width}" height="${p.height}" decoding="async"><span class="image-zoom-hint">Ver foto ampliada ↗</span></button><form class="detail-copy" id="product-form" data-id="${p.id}"${p.soldOut?' data-soldout="true"':''}>${galleryUI(p)}<p class="eyebrow">${escapeHTML(p.brand)}</p><h2>${escapeHTML(p.name)}</h2><p class="detail-price">${currency(p.price)} ${p.comparePrice > p.price ? `<s class="compare-price">${currency(p.comparePrice)}</s>` : ''}</p><p>${escapeHTML(p.description)}</p>${sizeUI}<p id="size-availability" class="size-availability" role="status" aria-live="polite"></p><button class="button primary full" type="submit" aria-describedby="size-availability"${p.soldOut?' disabled':''}>${p.soldOut?'Agotado':'Añadir al carrito <span>+</span>'}</button><p class="small-text" style="margin-top:16px">Precio, fotos y tallas en vivo desde el catálogo de Kanki. Despacho con Starken: el envío se paga al recibir. Este carrito es una maqueta: no compra ni reserva stock.</p></form></div>`;
    loadOriginalPhoto(p,$('.detail-photo'));
    updateProductAvailability();
    openDialog('product-dialog');
  }
  function updateProductAvailability() {
    const form=$('#product-form');if(!form)return;
    const p=products.find(p=>p.id===form.dataset.id),size=new FormData(form).get('size');
    const remaining=size?remainingStock(p,size):0;
    $('button[type=submit]',form).disabled=p.soldOut||!size||remaining===0;
    $('#size-availability').textContent=p.soldOut?'Agotado por ahora.':!size?'Selecciona una talla para continuar.':remaining===0?'Las unidades de esta talla ya están en tu carrito.':p.stockBySize?`${remaining} ${remaining===1?'unidad disponible':'unidades disponibles'} en talla ${size}.`:'Quedan unidades de este modelo; la talla se confirma con Kanki antes de pagar.';
  }
  function renderCart(animate=false) {
    if(animate){ui.change($('#cart-items'),()=>renderCart(),{duration:260});ui.enter($('#cart-total'),{distance:3,duration:240,opacity:.6});$$('[data-cart-count]').forEach(el=>ui.animate(el,[{transform:'scale(.85)'},{transform:'scale(1)'}],{duration:220}));return;}
    saveCart();
    const count=state.cart.reduce((n,x)=>n+x.quantity,0);
    $$('[data-cart-count]').forEach(el=>el.textContent=count);
    $('#cart-floating').hidden=count===0;
    $('#cart-footer').hidden=count===0;
    $('#cart-notice').hidden=true;
    $('#cart-selection').hidden=false;$('#cart-review').hidden=true;$('#demo-checkout').hidden=false;
    $('#cart-items').innerHTML=state.cart.length?state.cart.map((item,i)=>{
      const p=products.find(p=>p.id===item.id),sizes=p.stockBySize?Object.keys(p.stockBySize).sort((a,b)=>['XS','S','M','L','XL','XXL','3XL'].indexOf(a)-['XS','S','M','L','XL','XXL','3XL'].indexOf(b)):['Por confirmar'];
      const sizeOptions=sizes.map(size=>`<option value="${escapeHTML(size)}" ${size===item.size?'selected':''} ${size!==item.size&&capacityForCartLine(p,size,item)<item.quantity?'disabled':''}>${escapeHTML(size)}</option>`).join('');
      return `<article class="cart-row"><button class="cart-photo" data-product="${p.id}" aria-label="Ver ${escapeHTML(p.name)}"><img src="${previewImage(p)}" ${imageSources(p,'90px')} alt="${escapeHTML(p.name)}" width="90" height="112" decoding="async"></button><div class="cart-line"><p class="cart-line-brand">${escapeHTML(p.brand)}</p><div class="cart-line-head"><h3><button class="cart-product-name" data-product="${p.id}">${escapeHTML(p.name)}</button></h3><button class="cart-remove" data-remove="${i}" aria-label="Quitar ${escapeHTML(p.name)}">×</button></div><div class="cart-line-variant"><label class="cart-size-label">Talla <select data-cart-size="${i}" aria-label="Talla de ${escapeHTML(p.name)}" ${p.stockBySize?'':'disabled'}>${sizeOptions}</select></label><span class="cart-unit-price">${currency(p.price)} / u.</span></div><p class="cart-sr-only">Talla ${escapeHTML(item.size)} · Cantidad ${item.quantity}</p><div class="cart-line-bottom"><div class="cart-quantity" role="group" aria-label="Cantidad de ${escapeHTML(p.name)}, talla ${escapeHTML(item.size)}"><button type="button" data-cart-index="${i}" data-cart-adjust="-1" ${item.quantity===1?'disabled':''} aria-label="Restar una unidad de ${escapeHTML(p.name)}">−</button><output aria-label="Cantidad">${item.quantity}</output><button type="button" data-cart-index="${i}" data-cart-adjust="1" ${remainingStock(p,item.size)===0?'disabled':''} aria-label="Sumar una unidad de ${escapeHTML(p.name)}">+</button></div><strong class="cart-line-total">${currency(p.price*item.quantity)}</strong></div></div></article>`;
    }).join(''):`<div class="empty-cart"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M9 13h22l2 23H7l2-23Z"/><path d="M14 14V9a6 6 0 0 1 12 0v5"/></svg><h3>Todavía hay espacio para un buen plan.</h3><p>Encuentra esa prenda que se viene contigo después del agua.</p><button class="button primary" id="empty-cart-browse">Explorar la ropa <span aria-hidden="true">↗</span></button></div>`;
    const subtotal=state.cart.reduce((sum,item)=>sum+products.find(p=>p.id===item.id).price*item.quantity,0);
    const savings=state.cart.reduce((sum,item)=>{const p=products.find(p=>p.id===item.id);return sum+Math.max(0,(p.comparePrice||p.price)-p.price)*item.quantity;},0);
    $('#cart-total').textContent=currency(subtotal);
    $('#cart-savings').hidden=savings===0;$('#cart-savings').textContent=`Ahorras ${currency(savings)} en las prendas seleccionadas.`;
    $('#demo-checkout').disabled=state.cart.length===0;$('#checkout-message').hidden=true;$('#cart-feedback').textContent='';
    $('#cart-undo').hidden=!removedCartLine;
    if(removedCartLine)$('#cart-undo-label').textContent=`Quitaste ${products.find(p=>p.id===removedCartLine.id).name}.`;
    const preferred=products.find(p=>p.id===state.cart.at(-1)?.id)?.brandKey;
    const suggested=products.filter(p=>!p.imageUnavailable&&p.stockBySize&&!p.soldOut&&!state.cart.some(item=>item.id===p.id)).sort((a,b)=>Number(b.brandKey===preferred)-Number(a.brandKey===preferred)).slice(0,2);
    $('#cart-recommendations').innerHTML=suggested.length?`<h3>Para seguir mirando</h3>${suggested.map(p=>`<button class="cart-recommendation" data-product="${p.id}" aria-label="Elegir talla de ${escapeHTML(p.name)}"><img src="${previewImage(p)}" ${imageSources(p,'64px')} alt="" width="64" height="75" decoding="async"><span><strong>${escapeHTML(p.name)}</strong><small>${currency(p.price)} · Ver tallas</small></span><span aria-hidden="true">↗</span></button>`).join('')}`:'';
  }
  function reviewCart(){
    if(!state.cart.length)return;
    $('#cart-review-items').innerHTML=state.cart.map(item=>{const p=products.find(p=>p.id===item.id);return `<li><span>${escapeHTML(p.name)}<small>Talla ${escapeHTML(item.size)} · ${item.quantity} ${item.quantity===1?'unidad':'unidades'}</small></span><strong>${currency(p.price*item.quantity)}</strong></li>`;}).join('');
    $('#checkout-message').textContent='Maqueta — el pago se activa al pasar a kankisurf.cl. Aquí no se crea ningún pedido ni se cobra. El despacho será con Starken y el envío se paga al recibir.';
    ui.change($('#cart-dialog .cart-body'),()=>{$('#cart-selection').hidden=true;$('#cart-review').hidden=false;$('#checkout-message').hidden=false;$('#demo-checkout').hidden=true;},{height:false,duration:320});
    $('#cart-dialog .cart-body').scrollTop=0;$('#cart-review-title').focus({preventScroll:true});
  }
  function createMotion() {
    const viewport = $('#viewport');
    const preference = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : {matches:false};
    const parallaxImages = $$('.hero-photo > img,.story-photo img,.school-photo img');
    const driftTracks = $$('[data-scroll-drift]');
    const seen = new WeakSet();
    const requestFrame = window.requestAnimationFrame.bind(window);
    let enabled = false, observer = null, frame = null;
    const clamp = (n,min,max) => Math.min(max,Math.max(min,n));
    $$('.section-heading h2,.section-heading > p,.story-copy h2,.story-copy > p,.story-copy .text-link,.school-intro h2,.school-intro > p,.school-intro .button,.school-photo,.journal-card,.journal-quote,.last-call h2,.footer-top').forEach(el=>el.setAttribute('data-reveal',''));

    function reveal(el) {
      seen.add(el); el.classList.remove('reveal-pending');
      observer?.unobserve(el);
    }
    function register(scope = document) {
      if (!enabled || !observer) return;
      const targets = [...(scope.matches?.('[data-reveal]') ? [scope] : []),...$$('[data-reveal]',scope)];
      targets.forEach(el=>{
        if (seen.has(el)) return;
        if (el.getBoundingClientRect().bottom < 0) { reveal(el); return; }
        el.classList.add('reveal-pending'); observer.observe(el);
      });
    }
    function update() {
      frame = null;
      if (!enabled) return;
      const height = window.innerHeight || 800;
      const scrollTop = Math.max(0,window.scrollY || 0);
      const scrollRange = Math.max(1,document.documentElement.scrollHeight - height);
      $('.scroll-progress').style.setProperty('--scroll-progress',String(clamp(scrollTop/scrollRange,0,1)));
      const compact = viewport.clientWidth <= 700;
      parallaxImages.forEach(img=>{
        if (img.closest('[hidden]')) return;
        const rect = img.parentElement.getBoundingClientRect();
        if (rect.bottom < -80 || rect.top > height+80) return;
        const limit = compact ? 14 : 28;
        const offset = clamp((height/2 - (rect.top+rect.height/2)) * .075,-limit,limit);
        img.style.setProperty('--parallax-y',`${offset.toFixed(2)}px`);
      });
      driftTracks.forEach(track=>{
        const rect = track.parentElement.getBoundingClientRect();
        if (rect.bottom < -80 || rect.top > height+80) return;
        const progress = clamp((height-rect.top)/(height+rect.height),0,1);
        const distance = Number(track.dataset.scrollDrift) * (compact ? .6 : 1);
        track.style.setProperty('--drift-x',`${(-progress*distance).toFixed(2)}px`);
      });
    }
    function refresh() {
      if (enabled && frame === null) frame = requestFrame(update);
    }
    function sync() {
      enabled = !preference.matches;
      viewport.classList.toggle('motion-enabled',enabled);
      viewport.dataset.motion = enabled ? 'on' : 'off';
      document.documentElement.dataset.kankiMotion = enabled ? 'on' : 'off';
      observer?.disconnect();
      if (enabled) { register(); refresh(); }
      else {
        $$('[data-reveal]').forEach(el=>el.classList.remove('reveal-pending'));
        parallaxImages.forEach(img=>img.style.removeProperty('--parallax-y'));
        driftTracks.forEach(track=>track.style.removeProperty('--drift-x'));
        $('.scroll-progress').style.removeProperty('--scroll-progress');
      }
    }
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries=>{
        entries.forEach(entry=>{ if (entry.isIntersecting) reveal(entry.target); });
      },{threshold:.08,rootMargin:'0px 0px -24px 0px'});
    }
    window.addEventListener('scroll',refresh,{passive:true});
    window.addEventListener('resize',refresh,{passive:true});
    window.addEventListener('load',refresh,{once:true});
    document.addEventListener('focusin',event=>{
      const target = event.target.closest('[data-reveal]');
      if (target) reveal(target);
    });
    if (preference.addEventListener) preference.addEventListener('change',sync);
    else if (preference.addListener) preference.addListener(sync);
    sync();
    return {register,refresh,forget(scope){$$('[data-reveal]',scope).forEach(el=>observer?.unobserve(el));},get behavior(){return enabled?'smooth':'auto';}};
  }
  document.addEventListener('click', e => {
    const drawer=$('#garment-filter-drawer');
    if(drawer.open&&!drawer.contains(e.target))drawer.open=false;
    const button = e.target.closest('button,a');
    if (!button) return;
    if (button.dataset.open) openDialog(button.dataset.open);
    if (button.hasAttribute('data-close')) {
      const closing=ui.closeDialog(button.closest('dialog'));
      if(button.tagName==='A'&&button.getAttribute('href')?.startsWith('#')){e.preventDefault();const target=document.querySelector(button.getAttribute('href'));closing.then(completed=>{if(completed!==false)navigation.toElement(target,{focus:true});});}
    }
    if (button.dataset.filter) {
      state.filter = button.dataset.filter;
      $$('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      renderProducts(true);
      drawer.open=false;drawer.querySelector('summary').focus({preventScroll:true});
    }
    if (button.dataset.brand) {
      state.brand = button.dataset.brand;
      if (button.hasAttribute('data-brand-shortcut')) state.filter = 'all';
      renderProducts(true);
      navigation.toElement($('.catalog-toolbar'));
    }
    if (button.hasAttribute('data-reset-filters')) {
      state.filter = 'all'; state.brand = 'all'; renderProducts(true);
      $('.brand-filters [data-brand=all]').focus({preventScroll:true});
      navigation.toElement($('.catalog-toolbar'));
    }
    if (button.dataset.shelf) { const shelf=document.getElementById(button.dataset.shelf); if(shelf)navigation.scrollBy(shelf,Number(button.dataset.direction)*shelf.clientWidth*.85); }
    if (button.dataset.product) showProduct(button.dataset.product);
    if (button.dataset.gallerySrc) {
      const photo=$('.detail-photo img');if(photo){photo.src=button.dataset.gallerySrc;}
      $$('.detail-thumb').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    }
    if (button.hasAttribute('data-image-zoom')) {
      let expanded;
      ui.zoom($('#product-dialog'),()=>{expanded=$('#product-dialog').classList.toggle('is-photo-expanded');});
      const p=products.find(p=>p.id===$('#product-form').dataset.id);
      button.setAttribute('aria-expanded',String(expanded));
      button.setAttribute('aria-label',`${expanded?'Volver al detalle':'Ampliar foto'} de ${p.name}`);
      $('.image-zoom-hint',button).textContent=expanded?'Volver a la ficha ↙':'Ver foto ampliada ↗';
      $('#product-dialog').scrollTop=0;
    }
    if (button.hasAttribute('data-cart-adjust')) {
      const index=Number(button.dataset.cartIndex),item=state.cart[index],delta=Number(button.dataset.cartAdjust);
      if(!item||![-1,1].includes(delta))return;
      const p=products.find(p=>p.id===item.id);
      if((delta>0&&remainingStock(p,item.size)===0)||(delta<0&&item.quantity===1))return;
      item.quantity+=delta;renderCart(true);
      const next=$(`[data-cart-index="${index}"][data-cart-adjust="${delta}"]`);
      (next?.disabled?$(`[data-cart-index="${index}"][data-cart-adjust="${-delta}"]`):next)?.focus({preventScroll:true});
      $('#cart-feedback').textContent=`Cantidad actualizada: ${item.quantity}. Total de referencia: ${$('#cart-total').textContent}.`;
    }
    if (button.hasAttribute('data-remove')) {
      const index=Number(button.dataset.remove);if(!state.cart[index])return;removedCartLine={...state.cart[index]};state.cart.splice(index,1);renderCart(true);
      ($(`[data-remove="${Math.min(index,state.cart.length-1)}"]`)||$('#empty-cart-browse'))?.focus({preventScroll:true});
      $('#cart-feedback').textContent='Prenda quitada de tu carrito.';
    }
    if (button.id === 'empty-cart-browse'||button.id === 'cart-continue') ui.closeDialog($('#cart-dialog')).then(completed=>{if(completed!==false)navigation.toElement($('#ropa'),{focus:true});});
    if (button.id === 'menu-button') {
      const expanded = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded',String(expanded));
      button.setAttribute('aria-label',expanded?'Cerrar menú':'Abrir menú');
      if(expanded)ui.show($('#mobile-nav'));else ui.hide($('#mobile-nav'));
    }
    if(button.id==='demo-checkout')reviewCart();
    if(button.id==='cart-review-back'){
      ui.change($('#cart-dialog .cart-body'),()=>{$('#cart-selection').hidden=false;$('#cart-review').hidden=true;$('#demo-checkout').hidden=false;},{height:false,duration:320});
      $('#cart-title').focus({preventScroll:true});
    }
    if(button.id==='cart-undo-button'&&removedCartLine){
      const item=removedCartLine,p=products.find(p=>p.id===item.id);
      if(remainingStock(p,item.size)<item.quantity){$('#cart-feedback').textContent='No hay disponibilidad para recuperar esa cantidad.';return;}
      const existing=state.cart.find(x=>x.id===item.id&&x.size===item.size);
      if(existing)existing.quantity+=item.quantity;else state.cart.push({...item});
      removedCartLine=null;renderCart(true);$('#cart-feedback').textContent='Prenda recuperada en tu carrito.';$('#cart-title').focus({preventScroll:true});
    }
    if (button.dataset.story) {
      const beach = button.dataset.story === 'beach';
      const storyPhoto=$('img',button);
      $('#story-image').src = storyPhoto.currentSrc || storyPhoto.src;
      $('#story-image').alt = beach?'Comunidad de Kanki con tablas en la playa':'Look de Kanki fuera del agua';
      $('#story-dialog-title').textContent = beach?'EL RATO SE ALARGÓ.':'SEGUIMOS AFUERA.';
      $('#story-dialog-copy').textContent = beach?'Tablas en la arena, gente con ganas y un rato que se convierte en todo el día. Esa es la parte de Kanki que queremos mostrar más.':'El día no termina cuando sales del agua. Una polera, un polerón y el siguiente plan. La selección de Kanki también tiene ese lado.';
      $('#story-dialog-link').href = beach?'#escuela':'#ropa';
      $('#story-dialog-link').textContent = beach?'Conocer la escuela ↗':'Ver la ropa ↗';
      openDialog('story-dialog');
    }
    if (button.tagName === 'A' && button.hash && button.origin===location.origin && button.pathname===location.pathname) closeMenu();
  });
  document.addEventListener('change',event=>{
    if(event.target.matches('#product-form input[name=size]')){updateProductAvailability();ui.enter($('#size-availability'),{distance:3,duration:240,opacity:.5});}
    if(event.target.matches('[data-cart-size]')){
      const index=Number(event.target.dataset.cartSize),item=state.cart[index],size=event.target.value;
      if(!item)return;const p=products.find(p=>p.id===item.id);
      if(size===item.size)return;
      if(!p.stockBySize||!Object.hasOwn(p.stockBySize,size)||capacityForCartLine(p,size,item)<item.quantity){event.target.value=item.size;$('#cart-feedback').textContent='Esa talla no tiene disponibilidad para esta cantidad.';return;}
      const existing=state.cart.find(x=>x!==item&&x.id===item.id&&x.size===size);
      if(existing){existing.quantity+=item.quantity;state.cart.splice(index,1);}else item.size=size;
      renderCart(true);$('#cart-feedback').textContent=`Talla actualizada a ${size}.`;
      const newIndex=state.cart.findIndex(x=>x.id===p.id&&x.size===size);$(`[data-cart-size="${newIndex}"]`)?.focus({preventScroll:true});
    }
  });
  document.addEventListener('submit', e => {
    if (e.target.id === 'product-form') {
      e.preventDefault();
      const form = e.target, size = new FormData(form).get('size');
      if (form.dataset.submitting==='true'||!size||!form.checkValidity()) return;
      const p = products.find(p=>p.id===form.dataset.id);
      const existing = state.cart.find(x=>x.id===form.dataset.id && x.size===size);
      if (!remainingStock(p,size)) { updateProductAvailability();toast('Ya añadiste todas las unidades disponibles de esa talla.'); return; }
      form.dataset.submitting='true';$('button[type=submit]',form).disabled=true;
      if (existing) existing.quantity++; else state.cart.push({id:form.dataset.id,size,quantity:1});
      removedCartLine=null;renderCart(true);
      const ticket=++cartOpenTicket,productDialog=$('#product-dialog');
      const revealCart=()=>{if(ticket!==cartOpenTicket||$('dialog[open]'))return;openDialog('cart-dialog');$('#cart-notice').textContent=`Añadiste ${p.name} · Talla ${size}.`;$('#cart-notice').hidden=false;$('#cart-title').focus({preventScroll:true});};
      const closing=ui.closeDialog(productDialog);
      if(!productDialog.open)revealCart();else closing.then(completed=>{if(completed!==false)revealCart();});
    }
    if (e.target.id === 'school-form') {
      e.preventDefault();
      if (!e.target.reportValidity()) return;
      const data = new FormData(e.target);
      const description = String(data.get('description') || '').trim().slice(0, 1200);
      const message = [
        '¡Hola Kanki! Quiero agendar una clase de surf en La Boca, Concón.',
        `Tipo de clase: ${data.get('classType')}.`,
        `Mi experiencia: ${data.get('experience')}.`,
        ...(description ? [`Mi plan: ${description}`] : []),
        '¿Podemos coordinar fecha, horario y precio?'
      ].join('\n\n');
      const whatsappUrl = 'https://wa.me/56957807766?text=' + encodeURIComponent(message);
      $('#school-whatsapp-link').href = whatsappUrl;
      $('#school-result').hidden = false;
      // Open synchronously from the client's click, preserving the form if popups are blocked.
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    }
  });
  $$('dialog').forEach(dialog=>{
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)ui.closeDialog(dialog);}});
    dialog.addEventListener('cancel',e=>{e.preventDefault();ui.closeDialog(dialog);});
    dialog.addEventListener('close',()=>{ui.interrupt(dialog);if(skipFocusRestore.has(dialog)){skipFocusRestore.delete(dialog);return;}const trigger=dialogFocus.get(dialog);if(trigger&&document.contains(trigger))trigger.focus({preventScroll:true});});
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenu();const drawer=$('#garment-filter-drawer');if(drawer.open){drawer.open=false;drawer.querySelector('summary').focus({preventScroll:true});}}});
  document.addEventListener('error',event=>{
    const img=event.target;
    if(img.tagName!=='IMG'||!img.closest('.product-photo,.detail-photo,.cart-photo,.showcase-panel,.showcase-card-media')||img.dataset.failed)return;
    img.dataset.failed='true';img.hidden=true;
    const label=document.createElement('span');label.className='product-image-fallback';label.textContent='Foto no disponible';img.parentElement.appendChild(label);
    if(img.parentElement.matches('[data-image-zoom]'))img.parentElement.disabled=true;
  },true);
  window.addEventListener('storage',event=>{
    if(event.key!==cartStorageKey)return;
    state.cart=restoreCart(event.newValue);removedCartLine=null;renderCart();updateProductAvailability();
    if($('#cart-dialog').open)$('#cart-feedback').textContent='Carrito actualizado desde otra pestaña.';
  });
  motion = createMotion();
  renderProducts(); renderCart(); motion.refresh();
  const updated = new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Santiago'}).format(new Date(window.KANKI_CATALOG.updatedAt));
  const available = products.filter(p=>!p.soldOut).length;
  $('#catalog-note').textContent = window.KANKI_CATALOG.live
    ? `${available} prendas con stock de ${products.length} en kankisurf.cl · Catálogo en vivo, consultado ${updated}. Despacho con Starken, envío por pagar. Esta bolsa de maqueta no reserva stock.`
    : `Catálogo de respaldo del ${updated}: no pudimos consultar kankisurf.cl. Precios y tallas pueden haber cambiado. Esta bolsa de maqueta no reserva stock.`;
});
