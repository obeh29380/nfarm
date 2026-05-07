/**
 * app.js — メインアプリケーションロジック
 * farms.json / crops.json / crops_finished.json を並行読み込みし、
 * 農場タブ・地図レイアウト・詳細モーダルを生成する
 */

// ===== データ読み込みとアプリ初期化 =====

document.addEventListener('DOMContentLoaded', () => {
  // まず farms.json を取得し、農場一覧に基づいて各農場のJSONを並行取得する
  fetch('./data/farms.json')
    .then(r => { if (!r.ok) throw new Error('farms.json の読み込みに失敗しました'); return r.json(); })
    .then(farms => {
      // 各農場の耕作データ・完了データを並行取得
      const fetchPairs = farms.map(farm => Promise.all([
        fetch(`./data/farms/${farm.field_id}.json`)
          .then(r => r.ok ? r.json() : [])
          .then(rows => rows.map(row => ({ ...row, field_id: farm.field_id, field_name: farm.field_name }))),
        fetch(`./data/farms/${farm.field_id}_finished.json`)
          .then(r => r.ok ? r.json() : [])
          .then(rows => rows.map(row => ({ ...row, field_id: farm.field_id, field_name: farm.field_name, status: 'finished' }))),
      ]));

      return Promise.all(fetchPairs).then(pairs => {
        // [[crops, finished], [crops, finished], ...] を農場順に結合
        const fields = new Map();
        farms.forEach((farm, i) => {
          const [crops, finished] = pairs[i];

          // crops.json 側に存在する row_number のセット
          const activeRowNumbers = new Set(crops.map(r => r.row_number));

          // 同じ row_number が crops 側にある場合、finished 側は表示しない
          const filteredFinished = finished.filter(r => !activeRowNumbers.has(r.row_number));

          fields.set(farm.field_id, {
            field_name: farm.field_name,
            rows: [...crops, ...filteredFinished],
          });
        });
        return fields;
      });
    })
    .then(fields => {
      renderTabs(fields);
      renderFieldPanels(fields);
      setupModal();
    })
    .catch(err => {
      document.getElementById('app-root').innerHTML =
        `<p style="color:red;padding:2rem;">⚠️ ${err.message}</p>`;
    });
});

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
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.target === fieldId);
  });
  document.querySelectorAll('.field-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.fieldId === fieldId);
  });
}

// ===== 農場パネル生成（地図レイアウト） =====

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

    // --- 農場タイトル ---
    const heading = document.createElement('h2');
    heading.textContent = `🌱 ${field.field_name}`;
    panel.appendChild(heading);

    // --- コンパス表示（北固定） ---
    const compass = document.createElement('div');
    compass.className = 'compass';
    compass.innerHTML = `<div class="compass-icon">🧭</div><span>北 ↑ が画面上</span>`;
    panel.appendChild(compass);

    // --- 農場マップ ---
    const map = document.createElement('div');
    map.className = 'field-map';

    // 1mm あたりのピクセル数（全値mm単位で統一：30px/m = 0.03px/mm）
    const PX_PER_MM = 0.03;
    const PADDING = 40; // マップ外周の余白（px）

    // マップサイズを全畝の座標＋長さ（すべてmm単位）から算出
    let maxX = 0, maxY = 0;
    field.rows.forEach(row => {
      const len = (row.row_length || 1000) * PX_PER_MM;
      const wid = (row.row_width  || 600)  * PX_PER_MM; // row_widthもmm単位
      const x = (row.x || 0) * PX_PER_MM;
      const y = (row.y || 0) * PX_PER_MM;
      if (row.direction === 'horizontal') {
        maxX = Math.max(maxX, x + len);
        maxY = Math.max(maxY, y + wid);
      } else {
        maxX = Math.max(maxX, x + wid);
        maxY = Math.max(maxY, y + len);
      }
    });
    map.style.width  = `${maxX + PADDING * 2}px`;
    map.style.height = `${maxY + PADDING * 2}px`;

    // 北ラベル
    const north = document.createElement('div');
    north.className = 'dir-label';
    north.textContent = '↑ 北 (NORTH)';
    map.appendChild(north);

    // 各畝を座標に基づいて絶対配置
    field.rows.forEach(row => {
      const strip = createRowStrip(row, PX_PER_MM, PADDING);
      map.appendChild(strip);
    });

    // 南ラベル
    const south = document.createElement('div');
    south.className = 'dir-label dir-label-bottom';
    south.textContent = '↓ 南 (SOUTH)';
    map.appendChild(south);

    panel.appendChild(map);

    // --- 凡例 ---
    panel.appendChild(createLegend());

    main.appendChild(panel);
    first = false;
  });
}

/**
 * 畝ストライプ（地図上の帯）DOM要素を生成する
 * @param {Object} row
 * @param {number} PX_PER_MM  1mmあたりのピクセル数（全値mm単位）
 * @param {number} PADDING    マップ外周余白px
 * @returns {HTMLElement}
 */
function createRowStrip(row, PX_PER_MM, PADDING) {
  const strip = document.createElement('div');
  // direction: "horizontal"（東西）/ "vertical"（南北）
  const dir = row.direction === 'vertical' ? 'vertical' : 'horizontal';
  strip.className = `row-strip ${row.status} ${dir}`;

  // すべてmm単位で統一済み → px変換
  const lenPx  = Math.round((row.row_length || 1000) * PX_PER_MM);
  const widPx  = Math.round((row.row_width  || 600)  * PX_PER_MM);
  const leftPx = Math.round((row.x || 0) * PX_PER_MM) + PADDING;
  const topPx  = Math.round((row.y || 0) * PX_PER_MM) + PADDING;

  strip.style.left = `${leftPx}px`;
  strip.style.top  = `${topPx}px`;

  if (dir === 'horizontal') {
    // 東西方向：幅 = 長さ、高さ = 畝幅
    strip.style.width  = `${lenPx}px`;
    strip.style.height = `${Math.max(widPx, 48)}px`;
  } else {
    // 南北方向：高さ = 長さ、幅 = 畝幅
    strip.style.width  = `${Math.max(widPx, 48)}px`;
    strip.style.height = `${lenPx}px`;
  }

  // --- 左／上端のラベル帯（畝番号） ---
  const label = document.createElement('div');
  label.className = 'strip-label';
  // path は「道」と表示、finished は取消線付き番号
  if (row.status === 'path') {
    label.innerHTML = `<span>🚶</span>`;
  } else {
    label.innerHTML = `<span>畝</span><span>${row.row_number}</span>`;
  }
  strip.appendChild(label);

  // --- 畝本体 ---
  const body = document.createElement('div');
  body.className = 'strip-body';

  const cropEl = document.createElement('div');
  cropEl.className = 'strip-crop';
  if (row.status === 'path') {
    cropEl.textContent = row.memo || '農道';
  } else {
    cropEl.textContent = row.crop_name || '（空き）';
  }
  body.appendChild(cropEl);

  // horizontal のみサブテキストを表示
  if (dir === 'horizontal' && row.status !== 'path') {
    if (row.harvest_expected) {
      const meta = document.createElement('div');
      meta.className = 'strip-meta';
      meta.textContent = `収穫予定：${formatDateJP(row.harvest_expected)}`;
      body.appendChild(meta);
    }
    if (row.row_length) {
      const lenMeta = document.createElement('div');
      lenMeta.className = 'strip-meta';
      // mm → m に変換して表示
      lenMeta.textContent = `東西 ${(row.row_length / 1000).toFixed(1)}m`;
      body.appendChild(lenMeta);
    }
  }

  strip.appendChild(body);

  // path はアラート不要
  if (row.status !== 'path') {
    // --- アラートアイコン ---
    const alerts = document.createElement('div');
    alerts.className = 'strip-alerts';

    const harvestAlert = getHarvestAlert(row.harvest_expected);
    if (harvestAlert === 'over') {
      const b = document.createElement('span');
      b.className = 'harvest-over';
      b.textContent = '⚠️ 超過';
      alerts.appendChild(b);
    } else if (harvestAlert === 'soon') {
      const b = document.createElement('span');
      b.className = 'harvest-soon';
      b.textContent = '🔔 まもなく';
      alerts.appendChild(b);
    }

    if (isFertilizeDue(row.fertilize_date, row.last_fertilized)) {
      const b = document.createElement('span');
      b.className = 'fertilize-due';
      b.textContent = '💧 追肥';
      alerts.appendChild(b);
    }

    if (alerts.children.length > 0) strip.appendChild(alerts);
  }

  // クリックで詳細モーダルを開く（path はスキップ）
  if (row.status !== 'path') {
    strip.addEventListener('click', () => openModal(row));
  } else {
    strip.style.cursor = 'default';
  }

  return strip;
}

/**
 * 凡例を生成する
 * @returns {HTMLElement}
 */
function createLegend() {
  const legend = document.createElement('div');
  legend.className = 'legend';

  const items = [
    { status: 'growing',    label: '成長中' },
    { status: 'harvesting', label: '収穫期' },
    { status: 'planned',    label: '作付け予定' },
    { status: 'empty',      label: '空き' },
    { status: 'finished',   label: '収穫完了' },
    { status: 'path',       label: '農道' },
  ];

  items.forEach(({ status, label }) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<div class="legend-dot ${status}"></div><span>${label}</span>`;
    legend.appendChild(item);
  });

  return legend;
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
  const overlay = document.getElementById('modal-overlay');
  const title   = document.getElementById('modal-title');
  const body    = document.getElementById('modal-body');

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

  const dirLabel = row.direction === 'horizontal' ? '東西' : '南北';
  // row_length: mm → m、row_width: mm → cm に変換して表示
  const rowSize  = row.row_length
    ? `${dirLabel} ${(row.row_length / 1000).toFixed(1)}m × 幅${Math.round(row.row_width / 10) ?? '—'}cm`
    : '—';

  let html = `
    <table class="detail-table">
      <tr><th>ステータス</th><td>${statusLabel(row.status)}</td></tr>
      <tr><th>作物名</th><td>${row.crop_name || '—'}</td></tr>
      <tr><th>植付日</th><td>${formatDateJP(row.planted_date)}</td></tr>
      <tr><th>収穫目安</th><td>${row.harvest_guideline || '—'}</td></tr>
      <tr><th>収穫予定日</th><td>${formatDateJP(row.harvest_expected)}</td></tr>
      <tr><th>収穫実施日</th><td>${formatDateJP(row.harvested_date)}</td></tr>
      <tr><th>追肥予定日</th><td>${fertSchedule}</td></tr>
      <tr><th>追肥実施日</th><td>${lastFert}</td></tr>
      <tr><th>畝サイズ</th><td>${rowSize}</td></tr>
    </table>
  `;

  if (row.status === 'finished') {
    html += `<div class="warning-box">📦 このデータは crops_finished.json で管理されています。</div>`;
  }
  if (row.warning) {
    html += `<div class="warning-box">⚠️ ${row.warning}</div>`;
  }
  if (row.memo) {
    html += `<div class="memo-box">📝 ${row.memo}</div>`;
  }

  return html;
}
