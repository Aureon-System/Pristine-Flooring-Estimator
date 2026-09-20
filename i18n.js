(function () {
  'use strict';
  if (window.PristineI18n) return;
  const KEY = 'pristine_ui_language_v1';
  const LANGS = Object.freeze({en:'en', pt:'pt-BR', es:'es'});
  const MESSAGES = window.PristineLocaleMessages || {};
  const sources = new WeakMap();
  const attributes = new WeakMap();
  let locale = 'en';
  try { const stored = localStorage.getItem(KEY); if (Object.hasOwn(LANGS, stored)) locale = stored; } catch (_) { /* Session-only preference when storage is unavailable. */ }

  // Only translate trusted UI surfaces. Never walk document previews, customer
  // names, saved project descriptions, brand names, input values or textarea data.
  const UI = [
    '[data-i18n]', '.language-panel p', '.language-panel label > span',
    '.workspace-title span', '.workspace-title strong', '.workspace-nav a',
    '.intro .kicker', '.intro h1', '.intro-copy', '.intro-badges span',
    '.section-heading h2', '.section-heading p', 'label', '.field-title',
    '.internal-tag', '.internal-spacer', '.microcopy', '.crew-formula',
    '.area-index', '[data-derived="meta"]', 'button',
    '.summary-label', '#summaryType', '.summary-lines span', '#materialSell', '#durationView',
    '.internal-badge', '.margin-card h3', '.margin-lines span', '.margin-card p',
    '.brand-card span', '.brand-card p', '.growth-card-head span', '.growth-card-head strong', '.growth-card-head p',
    '.saved-head .kicker', '.saved-head h2', '.saved-head p', '.workspace-stat-card .stat-label',
    '.workspace-stat-card small', '.saved-list .empty', '.saved-item .doc-type',
    '.pristine-cta h2', '.pristine-cta p', '.pristine-cta a.btn',
    '.footer-brand-copy > span', '.footer-legal a', '.mobile-total span',
    '.dialog-head .kicker', '.dialog-head h2', '.dialog-note', '.quote-metric span',
    '.consent-row span', '.pro-price > span', '.pro-price > small', '.pro-benefits div',
    '.pro-tool-btn span'
  ].join(',');
  const PROTECTED = 'script,style,textarea,input,[data-user-content],.doc-head,.client-grid,.doc-meta';
  const DOC_FIELDS = '#clientNotes,#terms,#sendEmailSubject,[data-k="description"],[data-k="name"]';

  function t(value) {
    const text = String(value == null ? '' : value);
    if (locale === 'en') return text;
    if (Object.hasOwn(MESSAGES, text)) return MESSAGES[text][locale === 'pt' ? 0 : 1];
    // Formatting tokens only; stored monetary/quantity values stay unchanged.
    if (/^\+\s+/.test(text)) return '+ ' + t(text.replace(/^\+\s+/, ''));
    let m = text.match(/^(\d+(?:[.,]\d+)?) work days?$/);
    if (m) return m[1] + (locale === 'pt' ? (m[1]==='1'?' dia de trabalho':' dias de trabalho') : (m[1]==='1'?' d\u00eda de trabajo':' d\u00edas de trabajo'));
    m = text.match(/^AREA (\d+)$/);
    if (m) return '\u00c1REA ' + m[1];
    if (/^[\d,\.]+ sqft \u00b7 /.test(text)) return text.split(' \u00b7 ').map(t).join(' \u00b7 ');
    m = text.match(/^Email sent successfully to ([\s\S]+)\.$/);
    if (m) return (locale==='pt'?'E-mail enviado para ':'Correo enviado a ') + m[1] + '.';
    m = text.match(/^Invoice created from ([\s\S]+)\. It is saved and ready to edit, email or download\.$/);
    if (m) return locale==='pt'
      ? 'Fatura criada a partir de '+m[1]+'. Ela est\u00e1 salva para editar, enviar por e-mail ou baixar.'
      : 'Factura creada a partir de '+m[1]+'. Est\u00e1 guardada para editar, enviar por correo o descargar.';
    const quoteError = 'Could not send the quote request online. Please try again. ';
    if (text.startsWith(quoteError)) return (locale==='pt'?'N\u00e3o foi poss\u00edvel enviar a solicita\u00e7\u00e3o online. Tente novamente. ':'No se pudo enviar la solicitud online. Int\u00e9ntelo de nuevo. ') + t(text.slice(quoteError.length));
    const paymentHint = '. If payment was just completed, wait a few seconds and refresh this page.';
    if (text.endsWith(paymentHint)) return t(text.slice(0,-paymentHint.length)) + (locale==='pt'?'. Se acabou de pagar, aguarde alguns segundos e atualize a p\u00e1gina.':'. Si acaba de pagar, espere unos segundos y actualice la p\u00e1gina.');
    return text; // Unknown errors are retained, never hidden or guessed.
  }

  function translateNode(node) {
    if (node.nodeType !== Node.TEXT_NODE || !node.data.trim()) return;
    const previous = sources.get(node);
    const original = previous && node.data === previous.output ? previous.original : node.data;
    const parts = original.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const output = parts[1] + t(parts[2]) + parts[3];
    sources.set(node, {original, output});
    if (node.data !== output) node.data = output;
  }

  function translateAttribute(el, name) {
    if (!el.hasAttribute(name)) return;
    let records = attributes.get(el);
    if (!records) { records = {}; attributes.set(el,records); }
    const current = el.getAttribute(name), old = records[name];
    const original = old && current === old.output ? old.original : current;
    const output = t(original);
    records[name] = {original,output};
    if (current !== output) el.setAttribute(name,output);
  }

  let observer;
  function apply() {
    if (!document.body) return;
    if (observer) observer.disconnect();
    try {
      document.documentElement.lang = LANGS[locale];
      document.documentElement.dataset.uiLanguage = locale;
      // HTML option.value defaults to its text. Freeze the canonical English
      // value BEFORE changing any labels or financial logic can break.
      document.querySelectorAll('select:not(#languageSelect) option').forEach(option => {
        if (!option.hasAttribute('value')) option.setAttribute('value',option.value);
        option.childNodes.forEach(translateNode);
        translateAttribute(option,'label');
      });
      document.querySelectorAll('select:not(#languageSelect) optgroup').forEach(el=>translateAttribute(el,'label'));
      document.querySelectorAll(UI).forEach(el=>{
        if (el.closest(PROTECTED) || el.closest('#languageSelect')) return;
        el.childNodes.forEach(translateNode);
      });
      document.querySelectorAll('input[placeholder],textarea[placeholder],button[aria-label],select[aria-label],a[aria-label],nav[aria-label]').forEach(el=>{
        if (el.closest('[data-user-content]')) return;
        translateAttribute(el,'placeholder');
        translateAttribute(el,'aria-label');
      });
      const brandStatus=document.getElementById('brandStatus');
      if(brandStatus && typeof window.loadBrand==='function' && !window.loadBrand().name) brandStatus.childNodes.forEach(translateNode);
      document.querySelectorAll(DOC_FIELDS).forEach(el=>{
        el.lang='en';
        el.setAttribute('translate','no');
        const describedBy=(el.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean);
        if(!describedBy.includes('documentEnglishHint')) describedBy.push('documentEnglishHint');
        el.setAttribute('aria-describedby',describedBy.join(' '));
      });
      const selector=document.getElementById('languageSelect');
      if(selector) selector.value=locale;
    } finally {
      if(observer) observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    }
  }

  function setLocale(value) {
    locale=Object.hasOwn(LANGS,value)?value:'en';
    try { localStorage.setItem(KEY,locale); } catch (_) { /* Never fail a quote because preference storage is unavailable. */ }
    apply();
    window.dispatchEvent(new CustomEvent('pristine:languagechange',{detail:{locale,documentLanguage:'en'}}));
  }

  // Narrow legacy-dialog bridge. Confirmation return values remain untouched;
  // only messages with registered translations or known templates are localized.
  const nativeAlert=window.alert.bind(window), nativeConfirm=window.confirm.bind(window);
  window.alert=function(message){return nativeAlert(typeof message==='string'?t(message):message);};
  window.confirm=function(message){return nativeConfirm(typeof message==='string'?t(message):message);};

  window.PristineI18n=Object.freeze({t,setLocale,getLocale:()=>locale,apply,documentLanguage:'en'});
  function start() {
    const selector=document.getElementById('languageSelect');
    if(selector) selector.addEventListener('change',event=>setLocale(event.target.value));
    observer=new MutationObserver(apply);
    apply();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
