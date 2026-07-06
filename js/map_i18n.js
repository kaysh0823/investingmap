/**
 * Shared i18n helpers for industry map pages.
 */
(function (global) {
  'use strict';

  function entityName(entity, lang) {
    if (!entity) return '';
    if (lang === 'en') return entity.nameEn || entity.name || '';
    return entity.name || entity.nameEn || '';
  }

  function marketLabel(market, lang) {
    if (!market) return '\u2014';
    if (market === 'KOSPI') return 'KOSPI';
    if (market === 'KOSDAQ') return 'KOSDAQ';
    if (market === '\uBE44\uC0C1\uC7A5') return lang === 'en' ? 'Unlisted' : '\uBE44\uC0C1\uC7A5';
    return market;
  }

  function marketCssClass(market) {
    if (market === '\uBE44\uC0C1\uC7A5') return 'unlisted';
    return (market || '').toLowerCase();
  }

  function marketChipLabel(market, t, lang) {
    if (market === 'all') return t.allFilter;
    if (market === 'KOSPI') return t.kosp || 'KOSPI';
    if (market === 'KOSDAQ') return t.kosdaq || 'KOSDAQ';
    if (market === '\uBE44\uC0C1\uC7A5') return t.unlisted || (lang === 'en' ? 'Unlisted' : '\uBE44\uC0C1\uC7A5');
    return marketLabel(market, lang);
  }

  /** Language-specific field; never falls back to the other language. */
  function field(record, koKey, enKey, lang) {
    if (!record) return '\u2014';
    if (lang === 'en') {
      var enVal = record[enKey];
      return enVal != null && enVal !== '' ? enVal : '\u2014';
    }
    var koVal = record[koKey];
    return koVal != null && koVal !== '' ? koVal : '\u2014';
  }

  function chainDisplayLabel(chainKey, t) {
    if (!chainKey || chainKey === 'all') return (t && t.allFilter) || chainKey || '';
    if (!t) return chainKey;
    return (t.chainFilter && t.chainFilter[chainKey])
      || (t.chainLabel && t.chainLabel[chainKey])
      || chainKey;
  }

  global.InvestingMapI18n = {
    entityName: entityName,
    marketLabel: marketLabel,
    marketCssClass: marketCssClass,
    marketChipLabel: marketChipLabel,
    field: field,
    chainDisplayLabel: chainDisplayLabel,
  };
})(typeof window !== 'undefined' ? window : globalThis);
