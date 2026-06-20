/** Sync meta description and social tags when language toggles. */
(function () {
  function setMeta(name, content, isProperty) {
    if (!content) return;
    var attr = isProperty ? 'property' : 'name';
    var el = document.querySelector('meta[' + attr + '="' + name + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  window.InvestingMapSeo = {
    sync: function (opts) {
      if (!opts) return;
      if (opts.title) {
        setMeta('og:title', opts.title, true);
        setMeta('twitter:title', opts.title, false);
      }
      if (opts.description) {
        setMeta('description', opts.description, false);
        setMeta('og:description', opts.description, true);
        setMeta('twitter:description', opts.description, false);
      }
    }
  };
})();
