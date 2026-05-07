/**
 * app.js — メインアプリケーションロジック
 * crop_data.json を読み込み、農場タブ・畝カード・詳細モーダルを生成する
 */

// ===== データ読み込みとアプリ初期化 =====

document.addEventListener('DOMContentLoaded', () => {
  fetch('./data/crop_data.json')
    .then(res => {
      if (!res.ok) throw new Error('データの読み込みに失敗しました');
      return res.json();
    })
    .then(data => initApp(data))
    .catch(err => {
      document.getElementById('app-root').innerHTML =
        `<p style="color:red;padding:2rem;">⚠️ ${err.message}</p>`;
    });
});

/**
 * アプリ全体を初期化する
 * @param {Object[]} data crop_data.json の配列
 */
function initApp(data) {
  // field_id ごとにグループ化
  const fields = groupByFieldId(data);

  renderTabs(fields);
  renderFieldPanels(fields);
  setupModal();
}

// ===== フィールドのグループ化 =====

/**
 * データを field_id でグループ化する
 * @param {Object[]} data
 * @returns {Map<string, {field_name: string, rows: Object[]}>}
 */
function groupByFieldId(data) {
  const map = new Map();
  data.forEach(row => {
    if (!map.has(row.field_id)) {
      map.set(row.field_id, { field_name: row.field_name, rows: [] });
    }
    map.get(row.field_id).rows.push(row);
  });
  return map;
}

// ===== タブ生成 =====

/**
 * 農場タブボタンを生成する
 * @param {Map} fields
 */
function renderTabs(fields) {
  const nav = document.getElementById('tab-nav');
  let first = true;
  fields.forEach((field, fieldId) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (first ? ' active' : '');
    btn.dataset.target = fieldId;
    btn.textContent = field.field_name;
    btn.addEventListener('click', () => switchTab(fieldId));
    nav.appendChild(btn);
    first = false;
  });
}

/**
 * タブを切り替える
 * @param {string} fieldId
 */
function switchTab(fieldId) {
  // タブボタンの active 切り替え
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.target === fieldId);
  });
  // パネルの active 切り替え
  document.querySelectorAll('.field-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.fieldId === fieldId);
  });
}

// ===== 農場パネル・畝カード生成 =====

/**
 * 全農場パネルを生成する
 * @param {Map} fields
 */
function renderFieldPanels(fields) {
  const main = document.getElementById('app-root');
  let first = true;

  fields.forEach((field, fieldId) => {
    const panel = document.createElement('section');
    panel.className = 'field-panel' + (first ? ' active' : '');
    panel.dataset.fieldId = fieldId;

    const heading = document.createElement('h2');
    heading.textContent = `🌱 ${field.field_name}`;
    panel.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'row-grid';

    // 畝番号順にソート
    const sortedRows = [...field.rows].sort((a, b) => a.row_number - b.row_number);
    sortedRows.forEach(row => {
      grid.appendChild(createRowCard(row));
    });

    panel.appendChild(grid);
    main.appendChild(panel);
    first = false;
  });
}

/**
 * 畝カードのDOM要素を生成する
 * @param {Object} row
 * @returns {HTMLElement}
 */
function createRowCard(row) {
  const card = document.createElement('div');
  card.className = `row-card ${row.status}`;

  // カードヘッダー（畝番号 + ステータスバッジ）
  const header = document.createElement('div');
  header.className = 'card-header';

  const rowLabel = document.createElement('span');
  rowLabel.className = 'row-label';
  rowLabel.textContent = `畝 ${row.row_number}`;

  const badge = document.createElement('span');
  badge.className = `status-badge ${row.status}`;
  badge.textContent = statusLabel(row.status);

  header.appendChild(rowLabel);
  header.appendChild(badge);
  card.appendChild(header);

  // 作物名
  const cropName = document.createElement('div');
  cropName.className = 'crop-name';
  cropName.textContent = row.crop_name || '（空き）';
  card.appendChild(cropName);

  // 収穫予定日
  if (row.harvest_expected) {
    const infoRow = document.createElement('div');
    infoRow.className = 'info-row';
    infoRow.innerHTML = `🗓️ 収穫予定：${formatDateJP(row.harvest_expected)}`;
    card.appendChild(infoRow);
  }

  // アラートバッジ
  const alertRow = document.createElement('div');
  alertRow.className = 'alert-row';

  const harvestAlert = getHarvestAlert(row.harvest_expected);
  if (harvestAlert === 'over') {
    const b = document.createElement('span');
    b.className = 'alert-badge harvest-over';
    b.textContent = '⚠️ 収穫超過';
    alertRow.appendChild(b);
  } else if (harvestAlert === 'soon') {
    const b = document.createElement('span');
    b.className = 'alert-badge harvest-soon';
    b.textContent = '🔔 収穫まもなく';
    alertRow.appendChild(b);
  }

  if (isFertilizeDue(row.fertilize_date, row.last_fertilized)) {
    const b = document.createElement('span');
    b.className = 'alert-badge fertilize-due';
    b.textContent = '💧 追肥推奨';
    alertRow.appendChild(b);
  }

  if (alertRow.children.length > 0) card.appendChild(alertRow);

  // クリックで詳細モーダルを開く
  card.addEventListener('click', () => openModal(row));

  return card;
}

// ===== モーダル =====

let currentRow = null;

/** モーダル関連イベントをセットアップする */
function setupModal() {
  const overlay = document.getElementById('modal-overlay');
  const closeBtn = document.getElementById('modal-close');

  // オーバーレイ外クリックで閉じる
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });

  closeBtn.addEventListener('click', closeModal);

  // ESCキーで閉じる
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
}

/**
 * 詳細モーダルを開く
 * @param {Object} row
 */
function openModal(row) {
  currentRow = row;
  const overlay  = document.getElementById('modal-overlay');
  const title    = document.getElementById('modal-title');
  const body     = document.getElementById('modal-body');

  title.textContent =
    `畝${row.row_number}：${row.crop_name || '（空き）'} — ${row.field_name}`;

  body.innerHTML = buildModalBody(row);
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

/** モーダルを閉じる */
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
  currentRow = null;
}

/**
 * モーダル本文HTMLを構築する
 * @param {Object} row
 * @returns {string}
 */
function buildModalBody(row) {
  const fertSchedule = row.fertilize_date.length
    ? row.fertilize_date.map(d => {
        const done = row.last_fertilized.includes(d);
        return `${formatDateJP(d)}${done ? ' ✅' : ''}`;
      }).join('、')
    : '—';

  const lastFert = row.last_fertilized.length
    ? row.last_fertilized.map(formatDateJP).join('、')
    : '—';

  let html = `
    <table class="detail-table">
      <tr><th>ステータス</th><td>${statusLabel(row.status)}</td></tr>
      <tr><th>作物名</th><td>${row.crop_name || '—'}</td></tr>
      <tr><th>植付日</th><td>${formatDateJP(row.planted_date)}</td></tr>
      <tr><th>収穫予定日</th><td>${formatDateJP(row.harvest_expected)}</td></tr>
      <tr><th>追肥予定日</th><td>${fertSchedule}</td></tr>
      <tr><th>追肥実施日</th><td>${lastFert}</td></tr>
    </table>
  `;

  if (row.warning) {
    html += `<div class="warning-box">⚠️ ${row.warning}</div>`;
  }
  if (row.memo) {
    html += `<div class="memo-box">📝 ${row.memo}</div>`;
  }

  return html;
}
