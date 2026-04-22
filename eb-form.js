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
  if(tipo==='artista'){
    params+='&genero='+encodeURIComponent(d.genero||'');
    fetch(base+'api/webhook-elementor',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        form_name:'artista-web',
        form_fields:{name:d.nombre,field_genero:d.genero,field_7bfecee:d.email,field_016bf1b:d.telefono},
        privacidad_aceptada:'Si',
        lang:isEn?'en':'es'
      })
    }).finally(function(){
      window.location.href=base+'formulario-artistas'+suffix+params;
    });
  } else {
    params+='&empresa='+encodeURIComponent(d.empresa||'');
    fetch(base+'api/webhook-elementor',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        form_name:'contacto-web',
        form_fields:{name:d.nombre,email:d.empresa,field_7bfecee:d.email,field_016bf1b:d.telefono},
        privacidad_aceptada:'Si',
        lang:isEn?'en':'es'
      })
    }).finally(function(){
      window.location.href=base+'formulario-inteligente'+suffix+params;
    });
  }
  return false;
}
