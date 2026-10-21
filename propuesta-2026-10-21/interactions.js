'use strict';
(() => {
  const preference=window.matchMedia?window.matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
  const running=new Map(),pending=new Map();
  const ease='cubic-bezier(.22,1,.36,1)';
  const enabled=()=>!preference.matches&&typeof Element.prototype.animate==='function';
  const sync=()=>{document.documentElement.dataset.uiMotion=enabled()?'on':'off';if(!enabled()){for(const [element] of running)stop(element);for(const [element,record] of pending){pending.delete(element);record.finish();}}};
  function stop(element,channel){
    const channels=running.get(element);if(!channels)return;
    for(const [key,animation] of channels){if(channel&&key!==channel)continue;channels.delete(key);animation.cancel();}
    if(!channels.size)running.delete(element);
  }
  function animate(element,keyframes,{channel='content',duration=300,delay=0}={}){
    stop(element,channel);
    if(!element||!enabled())return null;
    const animation=element.animate(keyframes,{duration,delay,easing:ease,fill:'none'});
    if(!running.has(element))running.set(element,new Map());running.get(element).set(channel,animation);
    const clear=()=>{const channels=running.get(element);if(channels?.get(channel)===animation){channels.delete(channel);if(!channels.size)running.delete(element);}};
    animation.finished.then(clear,clear);return animation;
  }
  function enter(element,{distance=10,duration=320,opacity=0,from=null}={}){
    const current=from||(running.get(element)?.has('content')?getComputedStyle(element):null);
    const snapshot=current?{opacity:current.opacity,transform:current.transform}:null;
    stop(element,'content');
    const base=getComputedStyle(element).transform||'none',prefix=base==='none'?'':`${base} `;
    return animate(element,[{opacity:snapshot?.opacity??opacity,transform:snapshot?.transform||`${prefix}translateY(${distance}px)`},{opacity:1,transform:base}],{duration});
  }
  function change(element,mutate,{height=true,fade=true,duration=340}={}){
    const before=element.getBoundingClientRect(),scrollY=window.scrollY||0;stop(element);mutate();
    if(!enabled()||!element.isConnected||element.hidden)return;
    const after=element.getBoundingClientRect();
    if(height&&before.height>0&&after.height>0&&Math.abs(before.height-after.height)>1)animate(element,[{height:`${before.height}px`,overflow:'clip'},{height:`${after.height}px`,overflow:'clip'}],{channel:'layout',duration});
    if(height&&window.scrollY!==scrollY&&before.height>after.height)window.scrollTo({top:scrollY,behavior:'instant'});
    if(fade&&after.height>0)enter(element,{distance:6,duration,opacity:.35});
  }
  function interrupt(element){
    const style=running.has(element)?getComputedStyle(element):null;
    const current=style?{opacity:style.opacity,transform:style.transform}:null;
    pending.delete(element);stop(element);element.classList.remove('is-closing');return current;
  }
  function exit(element,finish,{distance=8,duration=180,axis='y'}={}){
    if(pending.has(element))return pending.get(element).promise;
    const style=running.has(element)?getComputedStyle(element):null;
    const from={opacity:style?.opacity||1,transform:style?.transform||'translateY(0)'};
    stop(element);
    if(!enabled()){finish();return Promise.resolve();}
    const base=getComputedStyle(element).transform||'none',prefix=base==='none'?'':`${base} `;
    if(!style)from.transform=base;
    element.classList.add('is-closing');
    let resolve;const promise=new Promise(done=>resolve=done);
    const record={promise,finish(){element.classList.remove('is-closing');finish();resolve(true);}};
    pending.set(element,record);
    const travel=typeof distance==='number'?`${distance}px`:distance;
    const animation=animate(element,[from,{opacity:0,transform:`${prefix}${axis==='x'?'translateX':'translateY'}(${travel})`}],{channel:'exit',duration});
    const complete=()=>{if(pending.get(element)!==record){resolve(false);return;}pending.delete(element);record.finish();};
    animation.finished.then(complete,complete);return promise;
  }
  function show(element){const from=interrupt(element);element.hidden=false;element.inert=false;enter(element,{distance:-6,duration:280,from});}
  function hide(element){if(element.hidden)return Promise.resolve();element.inert=true;return exit(element,()=>{element.hidden=true;});}
  function openDialog(dialog){const from=interrupt(dialog);if(!dialog.open)dialog.showModal();if(dialog.id==='cart-dialog'){animate(dialog,[from||{opacity:.8,transform:'translateX(100%)'},{opacity:1,transform:'translateX(0)'}],{duration:420});}else enter(dialog,{distance:18,duration:360,from});}
  function closeDialog(dialog,immediate=false){if(!dialog?.open)return Promise.resolve();if(immediate){interrupt(dialog);dialog.close();return Promise.resolve();}return exit(dialog,()=>dialog.close(),dialog.id==='cart-dialog'?{distance:'100%',duration:320,axis:'x'}:{distance:12,duration:200});}
  function zoom(dialog,mutate){
    const image=dialog.querySelector('.detail-photo img'),before=image.getBoundingClientRect();
    stop(image);change(dialog,mutate,{height:true,fade:false,duration:420});
    const after=image.getBoundingClientRect();
    if(before.width>0&&before.height>0&&after.width>0&&after.height>0){const scale=Math.min(before.width/after.width,before.height/after.height);animate(image,[{transformOrigin:'50% 50%',transform:`translate(${before.left+before.width/2-after.left-after.width/2}px,${before.top+before.height/2-after.top-after.height/2}px) scale(${scale})`},{transformOrigin:'50% 50%',transform:'translate(0,0) scale(1)'}],{duration:420});}
    if(!dialog.classList.contains('is-photo-expanded'))enter(dialog.querySelector('.detail-copy'),{distance:8,duration:320});
  }
  window.KANKI_UI={change,enter,show,hide,openDialog,closeDialog,zoom,interrupt,animate};
  document.addEventListener('pointerdown',event=>{
    if(!enabled())return;
    const host=event.target.closest('.button,.cart-quantity button,.size-choice>span');
    if(!host||host.matches(':disabled')||host.closest('.size-choice')?.querySelector('input')?.disabled)return;
    const rect=host.getBoundingClientRect(),size=Math.hypot(rect.width,rect.height)*2;
    if(!size)return;
    const pulse=document.createElement('i');pulse.className='ui-ripple';pulse.setAttribute('aria-hidden','true');
    Object.assign(pulse.style,{width:`${size}px`,height:`${size}px`,left:`${event.clientX-rect.left-size/2}px`,top:`${event.clientY-rect.top-size/2}px`});
    host.append(pulse);const animation=animate(pulse,[{transform:'scale(0)',opacity:.24},{transform:'scale(1)',opacity:0}],{duration:620});
    if(animation)animation.finished.then(()=>pulse.remove(),()=>pulse.remove());else pulse.remove();
  });
  if(preference.addEventListener)preference.addEventListener('change',sync);else if(preference.addListener)preference.addListener(sync);
  sync();
})();
