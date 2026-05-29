# CTAs de WordPress → form con tracking de origen

Cada página de la web tiene que linkear su botón de **"Solicita presupuesto"**
a la URL del form **con `?from=<slug>`**. Eso garantiza que en GHL veas exactamente
de qué página viene cada lead, aunque el navegador no envíe el `Referrer`.

**Cómo se ve en GHL después:**
- `contact.source` = `"Form Cliente · <slug>"`
- Tag = `pagina:<slug>` (filtrable)
- Nota timeline con la URL completa

Total: **52 páginas**

## 🩰 Danza (17 páginas)

| Página WP | CTA debe linkear a |
|---|---|
| https://www.eventosbarcelona.com/danza/bailarinas-barcelona/ | `?from=bailarinas` |
| https://www.eventosbarcelona.com/danza/bailarines-flamenco-barcelona/ | `?from=flamenco-bailarines` |
| https://www.eventosbarcelona.com/danza/bailarines-salsa-barcelona/ | `?from=salsa-bailarines` |
| https://www.eventosbarcelona.com/danza/contratar-bailarinas-burlesque-cabaret-barcelona/ | `?from=burlesque` |
| https://www.eventosbarcelona.com/danza/danza-aerea-barcelona/ | `?from=danza-aerea` |
| https://www.eventosbarcelona.com/danza/espectaculos-brasilenos/ | `?from=show-brasileno` |
| https://www.eventosbarcelona.com/danza/glamm-dancers/ | `?from=glamm-dancers` |
| https://www.eventosbarcelona.com/danza/hula-hoop-dancers/ | `?from=hula-hoop` |
| https://www.eventosbarcelona.com/danza/olympian-odyssey/ | `?from=olympian-odyssey` |
| https://www.eventosbarcelona.com/danza/pulsar-dancers/ | `?from=pulsar` |
| https://www.eventosbarcelona.com/danza/shadows-of-the-future/ | `?from=shadows-future` |
| https://www.eventosbarcelona.com/danza/show-danza-funky/ | `?from=danza-funky` |
| https://www.eventosbarcelona.com/danza/show-de-bollywood/ | `?from=bollywood` |
| https://www.eventosbarcelona.com/danza/shows-de-pole-dance/ | `?from=pole-dance` |
| https://www.eventosbarcelona.com/danza/silk-road-burlesque/ | `?from=silk-road` |
| https://www.eventosbarcelona.com/danza/street-dancers-hip-hop-breakdance-eventos-barcelona/ | `?from=street-dancers-hiphop` |
| https://www.eventosbarcelona.com/danza/street-dancers/ | `?from=street-dancers` |

## 🎵 Música (19 páginas)

| Página WP | CTA debe linkear a |
|---|---|
| https://www.eventosbarcelona.com/musica/arpista-clasica/ | `?from=arpa-clasica` |
| https://www.eventosbarcelona.com/musica/book-hire-dixieland-jazz-band/ | `?from=dixieland-jazz` |
| https://www.eventosbarcelona.com/musica/cantante-jazz-barcelona/ | `?from=cantante-jazz` |
| https://www.eventosbarcelona.com/musica/cantante-opera-barcelona/ | `?from=cantante-opera` |
| https://www.eventosbarcelona.com/musica/contratar-chica-saxofonista/ | `?from=saxofonista` |
| https://www.eventosbarcelona.com/musica/contratar-grupos-de-bossa-nova/ | `?from=bossa-nova` |
| https://www.eventosbarcelona.com/musica/contratar-orquesta-musica-clasica/ | `?from=orquesta-clasica` |
| https://www.eventosbarcelona.com/musica/contratar-percusionistas-batucada-para-eventos/ | `?from=percusionistas-batucada` |
| https://www.eventosbarcelona.com/musica/dj-barcelona/ | `?from=dj` |
| https://www.eventosbarcelona.com/musica/flamenco-instrumental-para-eventos/ | `?from=flamenco-instrumental` |
| https://www.eventosbarcelona.com/musica/grupo-flamenco-chill-out/ | `?from=flamenco-chillout` |
| https://www.eventosbarcelona.com/musica/grupo-jazz-barcelona/ | `?from=jazz-barcelona` |
| https://www.eventosbarcelona.com/musica/grupos-de-flamenco-barcelona/ | `?from=flamenco-barcelona` |
| https://www.eventosbarcelona.com/musica/grupos-de-rumba/ | `?from=rumba` |
| https://www.eventosbarcelona.com/musica/pop-rock-live-band/ | `?from=pop-rock` |
| https://www.eventosbarcelona.com/musica/scarlets-femme-soul-band/ | `?from=soul-femme` |
| https://www.eventosbarcelona.com/musica/souldade-bossa-nova-soul-grupo/ | `?from=bossa-soul` |
| https://www.eventosbarcelona.com/musica/the-gildas-boys/ | `?from=the-gildas-boys` |
| https://www.eventosbarcelona.com/musica/trio-violinistas/ | `?from=trio-violinistas` |

## ✨ Espectáculos (16 páginas)

| Página WP | CTA debe linkear a |
|---|---|
| https://www.eventosbarcelona.com/espectaculos/artista-de-la-arena/ | `?from=arena` |
| https://www.eventosbarcelona.com/espectaculos/barcelona-video-mapping/ | `?from=mapping` |
| https://www.eventosbarcelona.com/espectaculos/contratar-arpa-laser-barcelona/ | `?from=arpa-laser` |
| https://www.eventosbarcelona.com/espectaculos/contratar-espectaculo-bailarines-led/ | `?from=bailarines-led` |
| https://www.eventosbarcelona.com/espectaculos/contratar-espectaculo-baile-mapping-flamenco/ | `?from=mapping-flamenco` |
| https://www.eventosbarcelona.com/espectaculos/contratar-percusionistas-led-eventos/ | `?from=percusionistas-led` |
| https://www.eventosbarcelona.com/espectaculos/holovortex-mapping-holografico/ | `?from=holovortex` |
| https://www.eventosbarcelona.com/espectaculos/laser-show/ | `?from=laser` |
| https://www.eventosbarcelona.com/espectaculos/light-art-show/ | `?from=light-art` |
| https://www.eventosbarcelona.com/espectaculos/light-boxes-show/ | `?from=light-boxes` |
| https://www.eventosbarcelona.com/espectaculos/light-painting-eventos-barcelona/ | `?from=light-painting` |
| https://www.eventosbarcelona.com/espectaculos/malabaristas-led-barcelona/ | `?from=malabaristas-led` |
| https://www.eventosbarcelona.com/espectaculos/percusionistas-agua-proyecciones/ | `?from=percusionistas-agua` |
| https://www.eventosbarcelona.com/espectaculos/show-de-fire-painting/ | `?from=fire-painting` |
| https://www.eventosbarcelona.com/espectaculos/shows-espectaculos-acuaticos-agua-bailarinas-natacion-sincronizada/ | `?from=natacion-sincronizada` |
| https://www.eventosbarcelona.com/espectaculos/violin-laser-show-eventos-barcelona/ | `?from=violin-laser` |

## Cómo aplicarlo en WordPress

**Opción rápida (Elementor / page builder):**
En cada página, abrí el botón "Solicita presupuesto" y cambiá el link:

- **Antes:** `https://propuestas.eventosbarcelona.com/formulario-inteligente.html`
- **Después:** `https://propuestas.eventosbarcelona.com/formulario-inteligente.html?from=jazz-barcelona` (con el slug correspondiente)

**Opción global (theme functions.php):**
Si el botón usa un template compartido, podés inyectar el `?from=` dinámicamente leyendo el slug de la página actual.

```php
function eb_cta_url() {
  $slug = get_post_field('post_name');
  return 'https://propuestas.eventosbarcelona.com/formulario-inteligente.html?from=' . $slug;
}
```

Esto cubre todas las páginas sin tener que editarlas una por una. El backend usa
el último segmento del path del referrer como fallback si el `?from=` no llega,
así que cualquiera de las dos vías funciona.

---

Generado automáticamente desde el catálogo de shows del repo.
