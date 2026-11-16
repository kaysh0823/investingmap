(function (global) {
  'use strict';

  var root = document.getElementById('hub-sector-rankings');
  if (!root) return;
  var heading = document.getElementById('hub-sector-rankings-title');
  var note = document.getElementById('hub-sector-rankings-note');
  var status = document.getElementById('hub-sector-rankings-status');
  var tables = root.querySelector('.hub-sector-rankings-tables');
  var buttons = root.querySelectorAll('[data-period]');
  var weighting = global.InvestingMapSectorWeighting;
  var lang = 'ko';
  var period = 'daily';
  var selectedSector = null;
  var payload;
  var state = 'loading';
  var requestId = 0;
  var copy = {
    ko: {
      title: '섹터 수익률 순위', daily: '일간', weekly: '주간', monthly: '월간', rank: '순위',
      dailyNote: '직전 거래일 종가 대비 · 최신 기간부터',
      weeklyNote: '직전 주 마지막 종가 대비 · 이번 주는 최신 확정 종가까지',
      monthlyNote: '직전 달 마지막 종가 대비 · 이번 달은 최신 확정 종가까지',
      loading: '수익률 순위를 불러오는 중…', empty: '표시할 수익률 데이터가 없습니다.',
      error: '수익률 순위를 불러오지 못했습니다.', retry: '다시 시도',
    },
    en: {
      title: 'Sector return rankings', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', rank: 'Rank',
      dailyNote: 'Previous session close to close · newest first',
      weeklyNote: 'Compared with the previous week’s final close · this week through the latest close',
      monthlyNote: 'Compared with the previous month’s final close · this month through the latest close',
      loading: 'Loading sector rankings…', empty: 'No return data available.',
      error: 'Could not load sector rankings.', retry: 'Retry',
    },
  };

  function addCell(row, tag, value, scope) {
    var cell = document.createElement(tag);
    cell.textContent = value;
    if (scope) cell.scope = scope;
    row.appendChild(cell);
    return cell;
  }

  function render() {
    var labels = copy[lang];
    heading.textContent = labels.title;
    note.textContent = labels[period + 'Note'];
    buttons.forEach(function (button) {
      var active = button.dataset.period === period;
      button.textContent = labels[button.dataset.period];
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-active', active);
    });

    var columns = payload?.[period] || [];
    var rowCount = Math.max(0, ...columns.map(function (column) { return column.returns.length; }));
    tables.hidden = !rowCount;
    status.hidden = !!rowCount;
    status.textContent = rowCount ? '' : labels[state === 'ready' ? 'empty' : state];
    if (state === 'error') {
      var retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'hub-trend-tab';
      retry.textContent = labels.retry;
      retry.addEventListener('click', load);
      status.appendChild(retry);
    }
    renderRankingsTable();
  }

  function updateSelection() {
    tables.querySelectorAll('[data-sector]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.sector === selectedSector));
    });
  }

  function renderRankingsTable() {
    tables.replaceChildren();
    if (tables.hidden) return;

    var labels = copy[lang];
    var columns = payload[period].slice(0, 10);
    var names = new Map(payload.sectors.map(function (sector) { return [sector.id, sector[lang]]; }));
    var number = new Intl.NumberFormat(lang === 'ko' ? 'ko-KR' : 'en', {
      minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero',
    });
    renderTable(columns, labels.rank, names, number);
    updateSelection();
  }

  function renderTable(columns, rankLabel, names, number) {
    var table = document.createElement('table');
    table.setAttribute('aria-labelledby', heading.id);
    var header = table.createTHead().insertRow();
    addCell(header, 'th', rankLabel, 'col');
    columns.forEach(function (column) {
      var date = period === 'weekly' ? column.week : column.date;
      var cell = addCell(header, 'th', '', 'col');
      var time = document.createElement('time');
      time.dateTime = period === 'monthly' ? date.slice(0, 7) : date;
      time.title = date;
      time.textContent = period === 'monthly' ? date.slice(0, 7).replace('-', '/') : date.slice(5).replace('-', '/');
      cell.appendChild(time);
    });
    var body = table.createTBody();
    var rowCount = Math.max(0, ...columns.map(function (column) { return column.returns.length; }));
    for (var index = 0; index < rowCount; index++) {
      var row = body.insertRow();
      addCell(row, 'th', String(index + 1), 'row');
      columns.forEach(function (column) {
        var entry = column.returns[index];
        var cell = addCell(row, 'td', entry ? '' : '—');
        if (!entry) return;
        var button = document.createElement('button');
        button.type = 'button';
        button.dataset.sector = entry.id;
        var name = document.createElement('span');
        var value = document.createElement('strong');
        name.textContent = names.get(entry.id) || entry.id;
        value.textContent = number.format(entry.value) + '%';
        value.className = entry.value > 0 ? 'is-up' : entry.value < 0 ? 'is-down' : '';
        button.append(name, value);
        cell.appendChild(button);
      });
    }
    tables.appendChild(table);
  }

  async function load() {
    var id = ++requestId;
    var mode = weighting ? weighting.get() : 'cap';
    state = 'loading';
    payload = null;
    render();
    try {
      var response = await fetch('/api/hub_sector_rankings?weighting=' + mode);
      if (!response.ok) throw new Error('Rankings unavailable');
      var result = await response.json();
      if (id !== requestId) return;
      payload = result;
      state = 'ready';
    } catch (error) {
      if (id !== requestId) return;
      state = 'error';
    }
    render();
  }

  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      if (button.dataset.period === period) return;
      period = button.dataset.period;
      render();
    });
  });
  tables.addEventListener('click', function (event) {
    var button = event.target.closest('[data-sector]');
    if (!button) return;
    var sector = button.dataset.sector;
    selectedSector = selectedSector === sector ? null : sector;
    updateSelection();
  });
  if (weighting) weighting.subscribe(load);
  global.InvestingMapHubSectorRankings = {
    setLang: function (value) {
      lang = value === 'en' ? 'en' : 'ko';
      if (!requestId) load();
      else render();
    },
  };
})(window);
