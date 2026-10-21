'use strict';
(window.KANKI_READY||Promise.resolve()).then(() => {
  const root=document.getElementById('product-showcase');
  const stage=root.querySelector('.showcase-stage');
  const viewport=document.getElementById('viewport');
  const reduced=window.matchMedia?window.matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
  const copy=['Saliste del agua. El plan sigue.','Para el rato que viene después de la playa.','Una polera. El resto del día se arma solo.','Cuando baja el sol y todavía no quieres volver.'];
  // 4 prendas con stock, una por marca si se puede (la de más stock de cada marca), el resto completa.
  const inStock=window.KANKI_CATALOG.products.filter(p=>!p.soldOut&&p.stock>0);
  const picks=['essentials','grizzly','stussy','luked'].map(key=>inStock.filter(p=>p.brandKey===key).sort((a,b)=>b.stock-a.stock)[0]).filter(Boolean);
  inStock.forEach(p=>{if(picks.length<4&&!picks.includes(p))picks.push(p);});
  const items=picks.slice(0,4);
  if(items.length<2){root.hidden=true;root.dataset.empty='true';return;}
  const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(value);
  const asset=path=>/^https?:/.test(path)?path:`assets/${path}`;
  const sources=(p,sizes)=>p.imageSources?`srcset="${p.imageSources.map(source=>`${asset(source.src)} ${source.width}w`).join(', ')}" sizes="${sizes}"`:'';
  const preview=p=>asset(p.previewImage||p.image);
  const image=p=>`<img class="showcase-main-image ${p.width/p.height<.7?'portrait-product':''}" src="${preview(p)}" ${sources(p,'(max-width: 700px) 100vw, 50vw')} alt="" width="${p.width}" height="${p.height}" loading="lazy" decoding="async">`;
  root.querySelector('#showcase-slides').innerHTML=`<div class="showcase-content-track swiper"><div class="swiper-wrapper">${items.map((p,i)=>`<article class="showcase-slide swiper-slide" data-index="${i}"><div class="showcase-copy"><p class="eyebrow">EN FOCO / ${escapeHTML(p.brand)}</p><h2>${escapeHTML(p.name)}</h2><p>${copy[i]}</p><button class="button primary" data-product="${p.id}">Ver la prenda <span>↗</span></button></div></article>`).join('')}</div></div><div class="showcase-media-track swiper" aria-hidden="true"><div class="swiper-wrapper">${items.map(p=>`<div class="showcase-media-slide swiper-slide"><div class="showcase-panel">${image(p)}</div></div>`).join('')}</div></div><div class="showcase-cards">${items.map((p,i)=>`<button class="showcase-floating-card" data-index="${i}" data-product="${p.id}" aria-label="Ver ${escapeHTML(p.name)}"><span class="showcase-card-media"><img class="${p.width/p.height<.7?'portrait-product':''}" src="${preview(p)}" ${sources(p,'(max-width: 700px) 70vw, 28vw')} alt="${escapeHTML(p.name)}" width="${p.width}" height="${p.height}" loading="lazy"></span><span class="showcase-card-name">${escapeHTML(p.name)}</span><span class="showcase-card-price">${money(p.price)}</span></button>`).join('')}</div>`;
  root.querySelector('.showcase-nav').innerHTML=items.map((p,i)=>`<button data-showcase-index="${i}" aria-label="Destacar ${escapeHTML(p.name)}" aria-pressed="${i===0}"></button>`).join('');
  const slides=[...root.querySelectorAll('.showcase-slide')],cards=[...root.querySelectorAll('.showcase-floating-card')],buttons=[...root.querySelectorAll('[data-showcase-index]')];
  let active=0,frame=null,stickyTop=52,reduceMotion=false,displayedProgress=0,lastTime=null,snapNext=true;
  const mediaElement=root.querySelector('.showcase-media-track'),contentElement=root.querySelector('.showcase-content-track');
  const common={direction:'vertical',slidesPerView:1,effect:'creative',speed:600,allowTouchMove:false,simulateTouch:false,touchStartPreventDefault:false,resizeObserver:false,updateOnWindowResize:false,a11y:false};
  let media=null,content=null;
  if(typeof window.Swiper==='function') {
    media=new window.Swiper(mediaElement,{...common,creativeEffect:{prev:{shadow:true,translate:[0,'-20%',-1]},next:{shadow:true,translate:[0,'100%',0]}}});
    content=new window.Swiper(contentElement,{...common,creativeEffect:{prev:{shadow:true,translate:[0,0,-1]},next:{shadow:true,translate:[0,'-100%',0]}}});
    media.controller.control=content;content.controller.control=media;
    root.dataset.effect='swiper-creative';
  } else root.dataset.effect='fallback';
  function select(index,instant=false) {
    active=Math.min(items.length-1,Math.max(0,index));
    root.dataset.activeIndex=String(active);root.dataset.instant=String(instant||reduceMotion);
    slides.forEach((slide,i)=>{slide.dataset.position=i===active?'current':i<active?'previous':'next';slide.setAttribute('aria-hidden',String(i!==active));slide.inert=i!==active;});
    cards.forEach((card,i)=>{card.classList.remove('is-leaving');card.classList.toggle('is-active',i===active);card.setAttribute('aria-hidden',String(i!==active));card.inert=i!==active;card.tabIndex=i===active?0:-1;});
    buttons.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===active)));
    if(!media)[...root.querySelectorAll('.showcase-media-slide')].forEach((slide,i)=>slide.hidden=i!==active);
  }
  function render(progress) {
    root.dataset.progress=progress.toFixed(4);
    const index=Math.round(progress);
    if(index!==active)select(index,true);
    if(media)media.setProgress(progress/Math.max(1,items.length-1),0);
    cards.forEach((card,i)=>{
      const distance=i-progress,weight=Math.max(0,1-Math.abs(distance));
      const opacity=weight*weight*(3-2*weight);
      card.style.visibility=weight>0?'visible':'hidden';
      card.style.setProperty('--card-opacity',opacity.toFixed(4));
      card.style.setProperty('--card-y',`${(distance<0?Math.max(-100,distance*100):0).toFixed(4)}%`);
    });
  }
  function update(now) {
    frame=null;if(root.hidden){lastTime=null;return;}
    const rect=root.getBoundingClientRect(),step=Math.max(1,stage.clientHeight);
    const target=Math.min(items.length-1,Math.max(0,(stickyTop-rect.top)/step));
    root.dataset.scrollProgress=target.toFixed(4);
    const elapsed=lastTime===null?16.667:Math.max(1,Math.min(64,now-lastTime));
    const outside=rect.bottom<stickyTop||rect.top>window.innerHeight;
    if(reduceMotion||snapNext||outside)displayedProgress=target;
    else displayedProgress+=(target-displayedProgress)*(1-Math.exp(-elapsed/120));
    snapNext=false;
    if(Math.abs(target-displayedProgress)<.0001)displayedProgress=target;
    render(displayedProgress);
    if(Math.abs(target-displayedProgress)>=.0001){lastTime=now;frame=window.requestAnimationFrame(update);}
    else lastTime=null;
  }
  function refresh(){if(frame===null)frame=window.requestAnimationFrame(update);}
  function syncLayout() {
    reduceMotion=reduced.matches;
    root.dataset.mode='scroll';root.dataset.direction='vertical';root.dataset.reduced=String(reduceMotion);
    root.dataset.flow='continuous';
    stickyTop=0; // el header es absoluto sobre la portada: nada fijo arriba que descontar
    root.style.setProperty('--sticky-top',`${stickyTop}px`);
    const stableHeight=window.CSS?.supports?.('height','100svh')?'max(240px, calc(100svh - var(--sticky-top)))':`${Math.max(240,window.innerHeight-stickyTop)}px`;
    root.style.setProperty('--stage-height',stableHeight);
    root.style.setProperty('--scene-count',String(items.length));
    document.getElementById('showcase-instruction').textContent='DESLIZA PARA EXPLORAR ↓';
    if(!root.hidden){media?.update();content?.update();}
    snapNext=true;lastTime=null;
    refresh();
  }
  buttons.forEach((button,index)=>button.addEventListener('click',()=>{
    const rect=root.getBoundingClientRect();
    const target=(window.scrollY||0)+rect.top-stickyTop+index*stage.clientHeight;
    if(window.KANKI_NAV)window.KANKI_NAV.scrollTo(target);else window.scrollTo({top:target,behavior:reduceMotion?'auto':'smooth'});
  }));
  root.querySelector('.showcase-nav').addEventListener('keydown',event=>{
    if(!['ArrowDown','ArrowUp'].includes(event.key))return;
    event.preventDefault();const next=(active+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
    buttons[next].click();buttons[next].focus({preventScroll:true});
  });
  window.addEventListener('scroll',refresh,{passive:true});window.addEventListener('resize',syncLayout,{passive:true});
  new MutationObserver(syncLayout).observe(viewport,{attributes:true,attributeFilter:['class']});
  new MutationObserver(syncLayout).observe(root,{attributes:true,attributeFilter:['hidden']});
  if('ResizeObserver' in window) {
    let lastWidth=-1;
    new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(Math.abs(width-lastWidth)>.5){lastWidth=width;syncLayout();}}).observe(viewport);
  }
  if(reduced.addEventListener)reduced.addEventListener('change',syncLayout);else if(reduced.addListener)reduced.addListener(syncLayout);
  select(0,true);syncLayout();
});
