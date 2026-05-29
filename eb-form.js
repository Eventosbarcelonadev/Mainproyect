function ebSubmit(form){
  var d=Object.fromEntries(new FormData(form));
  var btn=form.querySelector('.eb-submit');
  btn.disabled=true;
  var isEn=(document.documentElement.lang||'').toLowerCase().indexOf('en')===0
    ||/^\/en\//.test(location.pathname);
  btn.textContent=isEn?'Submitting...':'Enviando...';
  var base='https://propuestas.eventosbarcelona.com/';
  var tipo=form.getAttribute('data-form-type')||'cliente';
  var suffix=isEn?'-en.html':'.html';
  var params='?nombre='+encodeURIComponent(d.nombre)+
    '&email='+encodeURIComponent(d.email)+
    '&telefono='+encodeURIComponent(d.telefono)+
    (isEn?'&lang=en':'')+
    '&skip=1';
  if(tipo==='artista'||tipo==='proveedor'){
    // No pasamos &type= para que la primera pantalla del form completo sea
    // siempre el selector artista/proveedor (decisión Phil 2026-05-08).
    // El data-form-type del mini-form solo se usa para clasificar el webhook.
    params+='&genero='+encodeURIComponent(d.genero||'');
    fetch(base+'api/webhook-elementor',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        form_name:tipo+'-web',
        form_fields:{name:d.nombre,field_genero:d.genero,field_7bfecee:d.email,field_016bf1b:d.telefono},
        privacidad_aceptada:'Si',
        lang:isEn?'en':'es'
      })
    }).finally(function(){
      window.location.href=base+'formulario-artistas'+suffix+params;
    });
  } else {
    params+='&empresa='+encodeURIComponent(d.empresa||'')
      +(d.mensaje?'&mensaje='+encodeURIComponent(d.mensaje):'');
    // Origen: captura el slug de la URL (?from=) o el referrer al cargar la
    // página /contacto/. Se manda al webhook como hidden info y se persiste
    // en sessionStorage por si después abandona el wizard.
    var qs=new URLSearchParams(location.search);
    var originSlug=qs.get('from')||qs.get('origin')||'';
    if(!originSlug && document.referrer){
      try{
        var u=new URL(document.referrer);
        if(u.hostname.indexOf('eventosbarcelona.com')>=0){
          originSlug=u.pathname.replace(/^\/+|\/+$/g,'').split('/').filter(Boolean).pop()||'';
        }
      }catch(e){}
    }
    fetch(base+'api/webhook-elementor',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        form_name:'contacto-web',
        form_fields:{
          name:d.nombre,
          email:d.empresa,
          field_7bfecee:d.email,
          field_016bf1b:d.telefono,
          mensaje:d.mensaje||'',
          origen_pagina:originSlug
        },
        page_url:document.referrer||location.href,
        privacidad_aceptada:'Si',
        lang:isEn?'en':'es'
      })
    }).finally(function(){
      window.location.href=base+'formulario-inteligente'+suffix+params;
    });
  }
  return false;
}
