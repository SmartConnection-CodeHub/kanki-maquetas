'use strict';
(() => {
  const moving=new Map();
  const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  function sync(){document.documentElement.dataset.scrollMotion=moving.has(window)?'running':'idle';}
  function cancel(container=window){const previous=moving.get(container);if(!previous)return;moving.delete(container);window.cancelAnimationFrame(previous.frame);previous.resolve(false);sync();}
  function position(container,axis){return container===window?(window.scrollY||0):container[axis==='x'?'scrollLeft':'scrollTop'];}
  function limit(container,axis){return container===window?Math.max(0,document.documentElement.scrollHeight-window.innerHeight):Math.max(0,container[axis==='x'?'scrollWidth':'scrollHeight']-container[axis==='x'?'clientWidth':'clientHeight']);}
  function set(container,axis,value){if(container===window)window.scrollTo({top:value,left:window.scrollX||0,behavior:'instant'});else container[axis==='x'?'scrollLeft':'scrollTop']=value;}
  function scrollTo(target,{container=window,axis='y',duration=900,complete=null}={}){
    cancel(container);
    const start=position(container,axis),destination=()=>clamp(Number(typeof target==='function'?target():target)||0,0,limit(container,axis));
    if(Math.abs(destination()-start)<1){set(container,axis,destination());complete?.();return Promise.resolve(true);}
    let resolve;const promise=new Promise(done=>resolve=done),record={frame:null,resolve,started:null};
    moving.set(container,record);sync();
    const step=now=>{
      if(moving.get(container)!==record)return;
      if(record.started===null)record.started=now;
      const progress=clamp((now-record.started)/duration,0,1);
      set(container,axis,start+(destination()-start)*ease(progress));
      if(progress<1)record.frame=window.requestAnimationFrame(step);
      else{moving.delete(container);sync();complete?.();resolve(true);}
    };
    record.frame=window.requestAnimationFrame(step);return promise;
  }
  function toElement(element,{focus=false,hash=null,immediate=false}={}){
    if(!element)return Promise.resolve(false);
    const offset=()=>Math.max(0,document.querySelector('.lab-bar')?.getBoundingClientRect().height||52)+16;
    const target=()=>element.getBoundingClientRect().top+(window.scrollY||0)-offset();
    const complete=()=>{if(hash&&window.location.hash!==hash){try{history.pushState(null,'',hash);}catch{/* Navigation still works if the host restricts history access. */}}if(!focus)return;const original=element.getAttribute('tabindex');if(original===null)element.setAttribute('tabindex','-1');element.focus({preventScroll:true});if(original===null)element.addEventListener('blur',()=>element.removeAttribute('tabindex'),{once:true});};
    if(immediate){cancel();set(window,'y',clamp(target(),0,limit(window,'y')));complete();return Promise.resolve(true);}
    return scrollTo(target,{complete});
  }
  function scrollBy(container,delta){return scrollTo(position(container,'x')+delta,{container,axis:'x',duration:650});}
  const interrupt=()=>{for(const container of [...moving.keys()])cancel(container);};
  window.addEventListener('wheel',interrupt,{passive:true});window.addEventListener('touchstart',interrupt,{passive:true});window.addEventListener('pointerdown',interrupt,{passive:true});
  window.addEventListener('keydown',event=>{if(!event.defaultPrevented&&['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))interrupt();});
  window.addEventListener('click',event=>{
    const link=event.target.closest('a[href]');
    if(!link||link.hasAttribute('data-close')||link.hasAttribute('download')||(link.target&&link.target!=='_self')||event.defaultPrevented||event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    let url;try{url=new URL(link.href,window.location.href);}catch{return;}
    if(url.origin!==location.origin||url.pathname!==location.pathname)return;
    const hash=url.hash;if(hash.length<2)return;
    let id;try{id=decodeURIComponent(hash.slice(1));}catch{return;}
    const target=document.getElementById(id);if(!target)return;
    event.preventDefault();toElement(target,{hash,focus:true,immediate:link.classList.contains('skip')});
  },{capture:true});
  window.KANKI_NAV={scrollTo,toElement,scrollBy,cancel};sync();
})();
