(function (global) {
  'use strict';

  const periods = [5, 10, 20, 50];
  const copy = {
    ko: {
      title: '수급 매트릭스', period: '누적 거래일', days: '일',
      x: '외국인 순매수 / 시총', y: '기관 순매수 / 시총',
      loading: '수급 데이터를 불러오는 중…', error: '수급 데이터를 불러오지 못했습니다.',
      empty: '선택 기간의 수급과 시가총액이 모두 있는 종목이 없습니다.',
      asOf: '수급 기준일', retry: '다시 시도',
      rsLegend: '색상 = 시장 대비 RS · 초록: 강세 · 빨강: 약세 · 회색: RS 미확인',
    },
    en: {
      title: 'Supply matrix', period: 'Trading-day window', days: 'D',
      x: 'Foreign net buying / Market cap', y: 'Institutional net buying / Market cap',
      loading: 'Loading investor flow…', error: 'Could not load investor flow.',
      empty: 'No companies have complete flow and market-cap data for this window.',
      asOf: 'Flow through', retry: 'Retry',
      rsLegend: 'Color = RS vs. market · green: stronger · red: weaker · gray: unavailable',
    },
  };
  let options;
  let selected = 5;
  let data;
  let pending;
  let failed = false;

  function ratios(flow, mcap) {
    if (!flow || !Number.isFinite(mcap) || mcap <= 0) return null;
    return { x: flow.foreign / mcap * 100, y: flow.institution / mcap * 100 };
  }

  function load(tickers) {
    const batches = [];
    for (let i = 0; i < tickers.length; i += 50) batches.push(tickers.slice(i, i + 50));
    return Promise.all(batches.map(async (batch) => {
      const response = await fetch('/api/supply_matrix?codes=' + batch.join(','));
      if (!response.ok) throw new Error('Supply request failed');
      return response.json();
    })).then((parts) => {
      const asOf = parts[0]?.asOf || null;
      if (parts.some((part) => part.asOf !== asOf)) throw new Error('Supply dates changed');
      return { asOf, totals: Object.assign({}, ...parts.map((part) => part.totals)) };
    });
  }

  function drawChart(root, items, labels, onSelect) {
    const d3 = global.d3;
    const width = root.clientWidth;
    const height = root.clientHeight;
    if (!width || !height) return;
    const margin = { top: 22, right: 20, bottom: 57, left: 65 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    if (plotWidth <= 0 || plotHeight <= 0) return;
    const extent = Math.max(0.01, d3.max(items, (item) => Math.max(Math.abs(item.x), Math.abs(item.y)))) * 1.12;
    const x = d3.scaleLinear().domain([-extent, extent]).range([0, plotWidth]);
    const y = x.copy().range([plotHeight, 0]);
    const axisPct = (n) => d3.format('.3~g')(n) + '%';
    const valuePct = (n) => d3.format('+.3~g')(n) + '%';
    const svg = d3.select(root).append('svg').attr('width', width).attr('height', height)
      .attr('role', 'group').attr('aria-label', labels.title);
    const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    plot.append('g').attr('transform', `translate(0,${plotHeight})`)
      .call(d3.axisBottom(x).ticks(width < 500 ? 4 : 8).tickFormat(axisPct));
    plot.append('g').call(d3.axisLeft(y).ticks(6).tickFormat(axisPct));
    plot.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y2', plotHeight).attr('class', 'supply-zero');
    plot.append('line').attr('y1', y(0)).attr('y2', y(0)).attr('x2', plotWidth).attr('class', 'supply-zero');
    plot.append('text').attr('x', plotWidth / 2).attr('y', plotHeight + 42)
      .attr('text-anchor', 'middle').attr('class', 'supply-axis').text(labels.x);
    plot.append('text').attr('transform', `translate(-50,${plotHeight / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle').attr('class', 'supply-axis').text(labels.y);

    const nodes = plot.selectAll('g.supply-point').data(items).join('g').attr('class', 'supply-point')
      .attr('transform', (item) => `translate(${x(item.x)},${y(item.y)})`)
      .attr('role', 'button').attr('tabindex', 0).attr('data-ticker', (item) => item.company.ticker)
      .attr('aria-label', (item) => `${item.name} · ${labels.x} ${valuePct(item.x)} · ${labels.y} ${valuePct(item.y)}`)
      .on('click', (_, item) => onSelect(item.company))
      .on('keydown', (event, item) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onSelect(item.company);
      });
    nodes.append('title').text((item) => `${item.name}\n${labels.x} ${valuePct(item.x)}\n${labels.y} ${valuePct(item.y)}`);
    const rsColor = global.InvestingMapRsColor;
    nodes.append('circle').attr('r', 6).attr('fill', ({ company }) =>
      rsColor ? rsColor.colorForRs(company.rs, rsColor.marketRsFor(company)) : '#9aa3ad');
    // Show names on wider plots, skipping labels that would collide.
    const occupied = [];
    nodes.filter((item) => {
      if (width < 600 && !item.focused) return false;
      const left = x(item.x) + 9;
      const top = y(item.y) - 8;
      const right = left + item.name.length * 11;
      if (!item.focused && (right > plotWidth || occupied.some((box) =>
        left < box.right && right > box.left && Math.abs(top - box.top) < 15))) return false;
      occupied.push({ left, right, top });
      return true;
    }).append('text').attr('x', 9).attr('dy', '0.32em').text((item) => item.name);
    nodes.filter((item) => item.focused).classed('supply-focused', true).raise();
  }

  function paint() {
    const { companies, container, lang, onSelect } = options;
    const labels = copy[lang] || copy.ko;
    const filters = container.querySelector('.supply-filters');
    const root = container.querySelector('.supply-chart');
    const status = container.querySelector('.supply-status');
    filters.setAttribute('aria-label', labels.period);
    filters.querySelectorAll('button').forEach((button) => {
      button.textContent = button.dataset.days + labels.days;
      button.setAttribute('aria-pressed', Number(button.dataset.days) === selected);
    });
    status.replaceChildren();
    root.replaceChildren();
    root.hidden = true;
    if (!data) {
      status.textContent = failed ? labels.error + ' ' : labels.loading;
      if (failed) {
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = labels.retry;
        retry.onclick = () => { failed = false; render(options); };
        status.append(retry);
      }
      return;
    }
    const focused = new URLSearchParams(global.location.search).get('ticker');
    const items = companies.flatMap((company) => {
      const point = ratios(data.totals[company.ticker]?.[selected], company.mcapWon);
      if (!point) return [];
      return [{
        ...point, company, focused: company.ticker === focused,
        name: (lang === 'en' && company.nameEn) || company.name || company.nameKo || company.ticker,
      }];
    });
    status.textContent = items.length ? `${labels.asOf} ${data.asOf} · ${items.length}/${new Set(companies.map((company) => company.ticker).filter(Boolean)).size} · ${labels.rsLegend}` : labels.empty;
    root.hidden = !items.length;
    if (items.length && global.d3) drawChart(root, items, labels, onSelect);
  }

  function render(next) {
    options = next;
    const { container, companies } = next;
    if (!container.querySelector('.supply-chart')) {
      container.innerHTML = '<div class="supply-filters" role="group"></div>' +
        '<p class="supply-status" role="status"></p><div class="supply-chart" hidden></div>';
      const filters = container.querySelector('.supply-filters');
      for (const days of periods) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.days = days;
        button.onclick = () => { selected = days; paint(); };
        filters.append(button);
      }
      if (global.ResizeObserver) {
        new ResizeObserver(() => { if (container.clientWidth && data) paint(); }).observe(container.querySelector('.supply-chart'));
      }
    }
    if (!data && !pending && !failed) {
      const tickers = [...new Set(companies.map((company) => company.ticker).filter((ticker) => /^[A-Z0-9]{6}$/.test(ticker)))].sort();
      pending = load(tickers).then((result) => { data = result; }, () => { failed = true; })
        .finally(() => { pending = null; paint(); });
    }
    paint();
  }

  global.InvestingMapSupplyMatrix = { render };
  global.addEventListener?.('im:market-rs', () => {
    if (options?.container.clientWidth && data) paint();
  });
})(window);
