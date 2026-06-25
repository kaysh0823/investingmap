import fs from 'fs';
import path from 'path';

const root = process.cwd();

const MAPS = [
  'semiconductor/korea_semiconductor_map.html',
  'bio/korea_bio_map.html',
  'ship/korea_ship_map.html',
  'defense/korea_defense_map.html',
  'robot/korea_robot_map.html',
  'energy/korea_energy_map.html',
  'kculture/korea_kculture_map.html',
];

const EDITORIAL_BLOCK = `
  <section class="geo-summary" id="map-editorial" aria-labelledby="map-editorial-title">
    <h2 id="map-editorial-title"></h2>
    <div id="map-editorial-body"></div>
  </section>
`;

const EDITORIAL_CSS = `
    .geo-summary h2 {
      font-size: 15px;
      font-weight: 700;
      color: var(--text);
      margin: 0 0 8px
    }

    .geo-summary p {
      margin: 0 0 10px
    }

    .geo-summary a {
      color: var(--accent)
    }
`;

const TRUST_PAGES = [
  'editorial-policy.html',
  'disclaimer.html',
  'authors.html',
  'faq.html',
  'about.html',
  'privacy.html',
];

for (const rel of MAPS) {
  const fp = path.join(root, rel);
  let c = fs.readFileSync(fp, 'utf8');
  if (!c.includes('id="map-editorial"')) {
    c = c.replace(
      /(\s*)<div class="tabs">/,
      EDITORIAL_BLOCK + '\n  <div class="tabs">'
    );
    if (!c.includes('.geo-summary h2')) {
      c = c.replace('.geo-summary p {', EDITORIAL_CSS + '\n    .geo-summary p {');
    }
    c = c.replace(
      '<script src="../js/sector_nav.js"></script>',
      '<script src="../js/sector_nav.js"></script>\n  <script src="../js/map_editorial.js"></script>'
    );
    const applyLangNeedle = 'if (window.InvestingMapSectorNav) InvestingMapSectorNav.render';
    if (c.includes(applyLangNeedle) && !c.includes('InvestingMapEditorial')) {
      c = c.replace(
        applyLangNeedle,
        'if (window.InvestingMapEditorial) InvestingMapEditorial.render(lang);\n      ' + applyLangNeedle
      );
    }
    fs.writeFileSync(fp, c);
    console.log('editorial block:', rel);
  } else {
    console.log('skip:', rel);
  }
}

for (const rel of TRUST_PAGES) {
  const fp = path.join(root, rel);
  if (!fs.existsSync(fp)) continue;
  let c = fs.readFileSync(fp, 'utf8');
  if (c.includes('privacy.html')) continue;
  c = c.replace(
    '<a href="faq.html" id="tf-faq">',
    '<a href="privacy.html" id="tf-privacy">개인정보처리방침</a>\n      <a href="about.html" id="tf-about">소개</a>\n      <a href="faq.html" id="tf-faq">'
  );
  fs.writeFileSync(fp, c);
  console.log('footer links:', rel);
}

// bio inline
const bioTail = path.join(root, 'bio/bio_inline_tail.js');
if (fs.existsSync(bioTail)) {
  let bc = fs.readFileSync(bioTail, 'utf8');
  if (!bc.includes('map_editorial.js')) {
    // bio html gets script via separate check
  }
  if (!bc.includes('InvestingMapEditorial') && bc.includes('InvestingMapSectorNav')) {
    bc = bc.replace(
      'if (window.InvestingMapSectorNav) InvestingMapSectorNav.render',
      'if (window.InvestingMapEditorial) InvestingMapEditorial.render(lang);\n      if (window.InvestingMapSectorNav) InvestingMapSectorNav.render'
    );
    fs.writeFileSync(bioTail, bc);
    console.log('bio applyLang editorial hook');
  }
}

for (const rel of MAPS) {
  const fp = path.join(root, rel);
  let c = fs.readFileSync(fp, 'utf8');
  if (!c.includes('tf-privacy')) {
    c = c.replace(
      '<a href="../faq.html" id="tf-faq">',
      '<a href="../privacy.html" id="tf-privacy">개인정보처리방침</a>\n      <a href="../about.html" id="tf-about">소개</a>\n      <a href="../faq.html" id="tf-faq">'
    );
    fs.writeFileSync(fp, c);
    console.log('map footer:', rel);
  }
}
