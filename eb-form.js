// Inyecta el textarea "mensaje" en cada form .eb-form (de cliente) si todavía
// no lo tiene. Permite agregar el campo sin tocar el HTML de Elementor en WP.
// Se ejecuta inmediato al cargar el script + watcher por si el form aparece
// después (lazy load).
(function ebInjectMensaje(){
  function inject(){
    var forms = document.querySelectorAll('form.eb-form, form#eb-contact-form');
    forms.forEach(function(form){
      var tipo = form.getAttribute('data-form-type') || 'cliente';
      // Solo para form cliente — para artista/proveedor no aplica
      if (tipo !== 'cliente') return;
      // El formulario completo tiene 3 pasos (reunión 7-oct-2026). Las plantillas
      // de WP ya pintan 3 puntos; esto corrige las páginas que sigan en caché con 5.
      var steps = form.querySelector('.eb-steps');
      if (steps) {
        var dots = steps.querySelectorAll('.eb-step');
        for (var i = dots.length - 1; i >= 3; i--) {
          var prev = dots[i].previousElementSibling;
          if (prev && prev.classList.contains('eb-step-line')) prev.remove();
          dots[i].remove();
        }
      }
      var check = form.querySelector('.eb-check, .eb-submit, button[type="submit"]');
      if (!check) return;
      // Idioma detectado: la landing EN vive en /en/, o el <html lang="en">
      var isEn = (document.documentElement.lang || '').toLowerCase().indexOf('en') === 0
        || /^\/en(\/|$)/.test(location.pathname);
      // Fecha, lugar y nº de invitados en el paso 1 (Philippe, 20-nov-2026).
      // Opcionales. Mismo marcado que los demás campos (fila .eb-row con
      // input[type=text]), así heredan el estilo de cada variante del form.
      // Si la plantilla de WP ya los trae, no se duplican.
      if (!form.querySelector('[name="fecha_evento"]')) {
        var ev = document.createElement('div');
        ev.className = 'eb-row eb-row-evento';
        ev.innerHTML = isEn
          ? '<input type="text" name="fecha_evento" placeholder="Event date" autocomplete="off">'
            + '<input type="text" name="ciudad_evento" placeholder="Venue or city">'
            + '<input type="text" name="numero_asistentes" placeholder="Number of guests" inputmode="numeric" autocomplete="off">'
          : '<input type="text" name="fecha_evento" placeholder="Fecha del evento" autocomplete="off">'
            + '<input type="text" name="ciudad_evento" placeholder="Lugar o ciudad">'
            + '<input type="text" name="numero_asistentes" placeholder="Nº de invitados" inputmode="numeric" autocomplete="off">';
        // Tres por fila; si no caben (formularios estrechos, 481-560 px) pasan
        // a dos + uno en vez de cortar el texto. Sin hueco extra entre líneas.
        ev.style.flexWrap = 'wrap';
        ev.style.rowGap = '0';
        for (var k = 0; k < ev.children.length; k++) ev.children[k].style.minWidth = '150px';
        var msgEl = form.querySelector('textarea[name="mensaje"]');
        var anchor = msgEl ? (msgEl.closest('.eb-row') || msgEl) : check;
        anchor.parentNode.insertBefore(ev, anchor);
      }
      if (form.querySelector('textarea[name="mensaje"]')) return;
      var row = document.createElement('div');
      row.className = 'eb-row';
      row.style.marginTop = '8px';
      var placeholder = isEn
        ? 'Tell us briefly about your event (optional)'
        : 'Cuéntanos brevemente sobre tu evento (opcional)';
      // Estilo que matchea los otros inputs del .eb-form: sin caja, solo
      // border-bottom gris, fondo transparente, texto color del theme.
      row.innerHTML = '<textarea name="mensaje" placeholder="' + placeholder + '" rows="3" style="width:100%!important;padding:16px 0!important;border:none!important;border-bottom:1px solid #ddd!important;background:transparent!important;color:inherit!important;font-family:inherit!important;font-size:inherit!important;resize:vertical;outline:none;min-height:80px;box-sizing:border-box;"></textarea>';
      check.parentNode.insertBefore(row, check);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
  // Watcher por si el form aparece después (Elementor lazy load)
  var tries = 0;
  var iv = setInterval(function(){
    tries++;
    inject();
    if (tries > 20) clearInterval(iv);
  }, 500);
})();

// Fecha del paso 1 (texto libre) → YYYY-MM-DD si se puede leer sin dudas.
// Acepta 15/03/2027, 15-3-27, 2027-03-15, "15 de marzo de 2027", "March 15, 2027".
// Si no (p. ej. "marzo 2027"), devuelve '' y se conserva el texto tal cual.
function ebFechaISO(t){
  t=String(t||'').trim().toLowerCase();
  if(!t) return '';
  var y,m,d,r;
  var MES={ene:1,jan:1,feb:2,mar:3,abr:4,apr:4,may:5,jun:6,jul:7,ago:8,aug:8,sep:9,set:9,oct:10,nov:11,dic:12,dec:12};
  if((r=t.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/))){ y=+r[1]; m=+r[2]; d=+r[3]; }
  else if((r=t.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2}|\d{4})$/))){
    d=+r[1]; m=+r[2]; y=+r[3];
    if(m>12&&d<=12){ var x=d; d=m; m=x; } // formato US (03/15/2027)
  }
  else if((r=t.match(/^(\d{1,2})(?:st|nd|rd|th|º)?\s*(?:de\s+)?([a-záéíóú]{3,})\.?,?\s*(?:de[l]?\s+)?(\d{4})$/))){
    d=+r[1]; m=MES[r[2].slice(0,3)]; y=+r[3];
  }
  else if((r=t.match(/^([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/))){
    m=MES[r[1].slice(0,3)]; d=+r[2]; y=+r[3];
  }
  else return '';
  if(y<100) y+=2000;
  if(!m||!d||y<2020||y>2100) return '';
  var dt=new Date(Date.UTC(y,m-1,d));
  if(dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d) return '';
  return y+'-'+(m<10?'0':'')+m+'-'+(d<10?'0':'')+d;
}
// Nº de invitados → entero ("150", "1.500", "unos 200") o '' si no hay número.
function ebInvitados(t){
  var r=String(t||'').match(/\d[\d.\s]*/);
  if(!r) return '';
  var n=parseInt(r[0].replace(/[.\s]/g,''),10);
  return n>0?String(n):'';
}

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
  // UTMs: el formulario completo vive en otro subdominio y no ve el
  // sessionStorage.eb_utm de la web, así que se los pasamos en la URL.
  // Vienen de los hidden que inyecta el snippet WP EB-UTM-TRACKING, o de
  // sessionStorage si el form se pintó antes de que el snippet corriera.
  var utm={};
  try{ utm=JSON.parse(sessionStorage.getItem('eb_utm')||'{}'); }catch(e){}
  ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function(k){
    var v=d[k]||utm[k];
    if(v) params+='&'+k+'='+encodeURIComponent(v);
  });
  // Primera página de la web en esta visita (el snippet la guarda en eb_utm):
  // sin ella el form completo solo ve su propia URL.
  var landing=d.landing_page||utm.landing_page;
  if(landing) params+='&landing_page='+encodeURIComponent(landing);
  if(tipo==='artista'||tipo==='proveedor'){
    // No pasamos &type= para que la primera pantalla del form completo sea
    // siempre el selector artista/proveedor (decisión Phil 2026-05-08).
    // El data-form-type del mini-form solo se usa para clasificar el webhook.
    params+='&genero='+encodeURIComponent(d.genero||'');
    // Origen del artista: la página de la web donde está este mini-form
    // (sin el prefijo de idioma: /en/ sola no es una página).
    var pageSlug=location.pathname.split('/').filter(function(s){return s&&s!=='en'&&s!=='es';}).pop()||'';
    if(pageSlug) params+='&from='+encodeURIComponent(pageSlug);
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
    // Show pedido desde una ficha (campos ocultos show/show_titulo del snippet
    // WP EB-PEDIR-SHOW). El snippet ya escribe "Me interesa: <show>" en el
    // mensaje; si el usuario lo borró, se vuelve a poner delante para que el
    // show llegue siempre a comentarios_adicionales (no hay campo propio en GHL).
    var showTitulo=(d.show_titulo||d.show||'').trim();
    var mensaje=(d.mensaje||'').trim();
    if(showTitulo && mensaje.toLowerCase().indexOf(showTitulo.toLowerCase())<0){
      mensaje=(isEn?"I'm interested in: ":'Me interesa: ')+showTitulo+(mensaje?'\n\n'+mensaje:'');
    }
    // Fecha, lugar e invitados del paso 1: el formulario completo los carga
    // en f-fecha / f-ubicacion / f-asistentes para no volver a pedirlos.
    var fechaTxt=(d.fecha_evento||'').trim();
    var fechaIso=ebFechaISO(fechaTxt);
    var ciudad=(d.ciudad_evento||'').trim();
    var invitadosTxt=(d.numero_asistentes||'').trim();
    var invitados=ebInvitados(invitadosTxt);
    params+='&empresa='+encodeURIComponent(d.empresa||'')
      +(mensaje?'&mensaje='+encodeURIComponent(mensaje):'')
      +(fechaTxt?'&fecha='+encodeURIComponent(fechaIso||fechaTxt):'')
      +(ciudad?'&ubicacion='+encodeURIComponent(ciudad):'')
      +(invitados?'&asistentes='+invitados:'');
    // Origen: captura el slug de la URL (?from=) o el referrer al cargar la
    // página /contacto/. Se manda al webhook como hidden info y se persiste
    // en sessionStorage por si después abandona el wizard.
    var qs=new URLSearchParams(location.search);
    var originSlug=qs.get('from')||qs.get('origin')||'';
    if(!originSlug && document.referrer){
      try{
        var u=new URL(document.referrer);
        if(u.hostname.indexOf('eventosbarcelona.com')>=0){
          originSlug=u.pathname.split('/').filter(function(s){return s&&s!=='en'&&s!=='es';}).pop()||'';
        }
      }catch(e){}
    }
    // El form completo no puede leer este referrer (otro subdominio): se lo
    // pasamos para que el contacto lleve también pagina:<slug>.
    if(originSlug) params+='&from='+encodeURIComponent(originSlug);
    fetch(base+'api/webhook-elementor',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        form_name:'contacto-web',
        form_fields:{
          name:d.nombre,
          email:d.empresa,
          // La clave "email" lleva la empresa por herencia del form de Elementor
          // y el webhook la descartaba: con "empresa" llega a companyName.
          empresa:d.empresa||'',
          field_7bfecee:d.email,
          field_016bf1b:d.telefono,
          mensaje:mensaje,
          fecha_evento:fechaTxt,
          fecha_evento_iso:fechaIso,
          ciudad_evento:ciudad,
          numero_asistentes:invitadosTxt,
          show_solicitado:showTitulo,
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
