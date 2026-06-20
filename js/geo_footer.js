/** Bilingual labels for trust footer (GEO). */
(function () {
  var T = {
    ko: {
      editorial: '편집·검증 정책',
      disclaimer: '면책 고지',
      authors: '편집·데이터 팀',
      faq: '자주 묻는 질문',
      hub: '허브',
      inline:
        '본 콘텐츠는 정보 제공 목적이며 투자 권유·자문이 아닙니다. 투자 결정과 책임은 투자자 본인에게 있습니다.',
    },
    en: {
      editorial: 'Editorial policy',
      disclaimer: 'Disclaimer',
      authors: 'Editorial team',
      faq: 'FAQ',
      hub: 'Hub',
      inline:
        'This content is for information only and is not investment advice or a recommendation. Investment decisions and responsibility rest with the investor.',
    },
  };

  function imLang() {
    try {
      var q = new URLSearchParams(window.location.search).get('lang');
      if (q === 'en' || q === 'ko') return q;
      var s = localStorage.getItem('im_lang');
      if (s === 'en' || s === 'ko') return s;
    } catch (e) {}
    return document.documentElement.lang === 'ko' ? 'ko' : 'en';
  }

  function applyTrustFooter(lang) {
    var t = T[lang] || T.en;
    var ids = ['tf-editorial', 'tf-disclaimer', 'tf-authors', 'tf-faq', 'tf-hub', 'tf-inline-disclaimer'];
    var keys = ['editorial', 'disclaimer', 'authors', 'faq', 'hub', 'inline'];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el) el.textContent = t[keys[i]];
    }
    var sumKo = document.getElementById('geo-summary-ko');
    var sumEn = document.getElementById('geo-summary-en');
    if (sumKo) sumKo.hidden = lang !== 'ko';
    if (sumEn) sumEn.hidden = lang !== 'en';
  }

  window.InvestingMapGeoFooter = { apply: applyTrustFooter };

  document.addEventListener('DOMContentLoaded', function () {
    applyTrustFooter(imLang());
  });
  if (document.readyState !== 'loading') applyTrustFooter(imLang());
})();
