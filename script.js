/**
 * script.js
 * 仕事攻略度診断 — アプリロジック
 *
 * 画面フロー: スタート → 設問（6問）→ 役職選択 → 結果
 */

// ─────────────────────────────────────────
// 外部連携設定（変更時はここだけ修正）
// ─────────────────────────────────────────

/** Google Apps Script の POST 先 URL */
const SHEETS_URL =
  "https://script.google.com/macros/s/AKfycbwlSmL95pr1nNj_74RiHIyJ3qjQ8EVk22WiKpZCKyhA2_2yTUXI9Hf_cUgy-UVIO8NGzw/exec";

// ─────────────────────────────────────────
// 役職選択肢（変更・追加はここだけ修正）
// ─────────────────────────────────────────

const ROLES = [
  "一般社員（非管理職）",
  "係長・リーダークラス",
  "課長クラス",
  "部長クラス",
  "経営層"
];

// ─────────────────────────────────────────
// 設問定義
// ─────────────────────────────────────────

const QUESTIONS = [
  {
    id: 1,
    axis: "expectation", // 期待値
    text: "複数の仕事が同時にあるとき、\n成果が大きそうな仕事や\n将来役立ちそうな仕事を\n優先することが多い。",
    example: null,
    reversed: false
  },
  {
    id: 2,
    axis: "expectation",
    text: "仕事を始める前に、\nこの仕事で\n「何が成果と見なされるか」を\n自分なりに整理してから取り組む。",
    example: null,
    reversed: false
  },
  {
    id: 3,
    axis: "expectation",
    text: "新しい仕事を引き受けるとき、\nその仕事が\n自分の経験やスキルとして\n残る仕事かどうかを\n気にすることが多い。",
    example: null,
    reversed: false
  },
  {
    id: 4,
    axis: "initiative", // 主導権
    text: "仕事の進め方について\n「こちらの方が良いのでは」と\n自分から提案することがある。",
    example: null,
    reversed: false
  },
  {
    id: 5,
    axis: "initiative",
    text: "チーム全体の仕事の進め方や\n方向性について、\n自分から意見を出すことが多い。",
    example: null,
    reversed: false
  },
  {
    id: 6,
    axis: "initiative",
    text: "仕事を任されたとき、\n進め方や段取りは\n上司や周囲の指示に従うことが多い。",
    example: null,
    reversed: true // 逆転項目: 6 - 回答値 で処理
  }
];

// 回答ラベル（値1〜5に対応）
const ANSWER_LABELS = [
  "全く当てはまらない",
  "あまり当てはまらない",
  "どちらとも言えない",
  "やや当てはまる",
  "とても当てはまる"
];

// ─────────────────────────────────────────
// アプリ状態
// ─────────────────────────────────────────

let currentQuestionIndex = 0;
let answers      = []; // 各問の回答値（1〜5）
let selectedRole = ""; // 役職選択結果

// ─────────────────────────────────────────
// スコア計算
// ─────────────────────────────────────────

/**
 * 全回答からスコアを計算する
 * @returns {{ expectation: number, initiative: number }}
 */
function calculateScores() {
  const q1 = answers[0];
  const q2 = answers[1];
  const q3 = answers[2];
  const q4 = answers[3];
  const q5 = answers[4];
  const q6Reversed = 6 - answers[5]; // Q6は逆転処理

  const expectation = (q1 + q2 + q3) / 3;
  const initiative  = (q4 + q5 + q6Reversed) / 3;

  return { expectation, initiative };
}

/**
 * スコアをレベル（1〜3）に変換する
 * 1.0〜2.3 → L1 / 2.4〜3.6 → L2 / 3.7〜5.0 → L3
 */
function getLevel(score) {
  if (score <= 2.3) return 1;
  if (score <= 3.6) return 2;
  return 3;
}

// ─────────────────────────────────────────
// Google Sheets 送信
// ─────────────────────────────────────────

/**
 * 送信ペイロードを組み立てる
 * q6 は逆転処理前のユーザー回答値をそのまま送る
 */
function buildPayload() {
  const { expectation, initiative } = calculateScores();
  const expLevel = getLevel(expectation);
  const iniLevel = getLevel(initiative);
  const zone     = ZONES[`${expLevel}_${iniLevel}`];

  return {
    role:             selectedRole,
    q1:               answers[0],
    q2:               answers[1],
    q3:               answers[2],
    q4:               answers[3],
    q5:               answers[4],
    q6:               answers[5], // 元の回答値（逆転処理前）
    expectancy_score: parseFloat(expectation.toFixed(2)),
    initiative_score: parseFloat(initiative.toFixed(2)),
    zone:             zone.name
  };
}

/**
 * Google Sheets にデータを送信する
 *
 * ※ GAS エンドポイントは application/json での POST に CORS 制約がある場合がある。
 *   CORS エラーが発生する場合は、以下のように mode と Content-Type を変更してください:
 *     mode: "no-cors",
 *     headers: { "Content-Type": "text/plain" }
 *   GAS 側では e.postData.contents を JSON.parse() して受け取ります。
 *
 * 送信失敗時もユーザーへの結果表示はブロックしません（呼び出し側で fire-and-forget）。
 */
async function saveToSheets(payload) {
  try {
    await fetch(SHEETS_URL, {
      method:  "POST",
      mode:    "no-cors",
      headers: { "Content-Type": "text/plain" },
      body:    JSON.stringify(payload)
    });
  } catch (err) {
    // 通信エラー・CORS エラーはここでキャッチ。診断体験には影響させない。
    console.error("[仕事攻略度診断] Google Sheets への保存に失敗しました:", err);
  }
}

// ─────────────────────────────────────────
// 画面レンダリング
// ─────────────────────────────────────────

/** スタート画面 */
function showStart() {
  currentQuestionIndex = 0;
  answers      = [];
  selectedRole = "";

  setHTML(`
    <div class="screen start-screen">
      <p class="app-label">仕事攻略度診断</p>
      <h1 class="start-title">あなたは自律社員？<br>それとも他律社員？</h1>
      <p class="start-desc">
        この診断は性格診断ではありません。<br>
        会社員としての「仕事攻略度」を測るものです。<br>
        全6問、所要時間は約2分です。
      </p>
      <div class="axis-overview">
        <div class="axis-overview-item">
          <span class="axis-badge badge-expectation">期待値</span>
          <span class="axis-overview-text">どんな仕事を選ぶか</span>
        </div>
        <div class="axis-overview-item">
          <span class="axis-badge badge-initiative">主導権</span>
          <span class="axis-overview-text">その仕事をどう進めるか</span>
        </div>
      </div>
      <button class="btn-primary" onclick="showQuestion()">診断をはじめる</button>
    </div>
  `);
}

/** 設問画面 */
function showQuestion() {
  const q       = QUESTIONS[currentQuestionIndex];
  const total   = QUESTIONS.length;
  const current = currentQuestionIndex + 1;
  const pct     = ((current - 1) / total) * 100;

  const axisLabel = q.axis === "expectation" ? "期待値" : "主導権";
  const axisClass = q.axis === "expectation" ? "badge-expectation" : "badge-initiative";

  const exampleHTML = q.example
    ? `<p class="question-example">${q.example}</p>`
    : "";

  const buttonsHTML = ANSWER_LABELS.map((label, i) => `
    <button class="answer-btn" onclick="selectAnswer(${i + 1})">
      <span class="answer-num">${i + 1}</span>
      <span class="answer-label">${label}</span>
    </button>
  `).join("");

  setHTML(`
    <div class="screen question-screen">
      <div class="progress-wrap">
        <div class="progress-bar" style="width: ${pct}%"></div>
      </div>
      <div class="question-meta">
        <span class="question-counter">Q${current} / ${total}</span>
        <span class="axis-badge ${axisClass}">${axisLabel}</span>
      </div>
      <p class="question-text">${escapeNL(q.text)}</p>
      ${exampleHTML}
      <div class="answer-list">
        ${buttonsHTML}
      </div>
    </div>
  `);
}

/** 回答を記録して次へ進む */
function selectAnswer(value) {
  answers.push(value);
  currentQuestionIndex++;

  if (currentQuestionIndex < QUESTIONS.length) {
    showQuestion();
  } else {
    showRoleSelect(); // 6問完了 → 役職選択へ
  }
}

/** 役職選択画面（設問完了後に表示） */
function showRoleSelect() {
  const buttonsHTML = ROLES.map(role => `
    <button class="role-btn" onclick="selectRole('${role}')">${role}</button>
  `).join("");

  setHTML(`
    <div class="screen role-screen">
      <div class="progress-wrap">
        <div class="progress-bar" style="width: 100%"></div>
      </div>
      <p class="role-step-label">最後に1つだけ</p>
      <h2 class="role-title">あなたの役職を<br>教えてください</h2>
      <p class="role-desc">集計・分析のために使用します。診断結果には影響しません。</p>
      <div class="role-list">
        ${buttonsHTML}
      </div>
    </div>
  `);
}

/**
 * 役職を確定し、バックグラウンドで保存してから結果画面へ
 * 保存の成否にかかわらず結果画面を表示する（UX をブロックしない）
 */
function selectRole(role) {
  selectedRole = role;
  saveToSheets(buildPayload()); // fire-and-forget（await しない）
  showResult();
}

/** 結果画面 */
function showResult() {
  const { expectation, initiative } = calculateScores();
  const expLevel = getLevel(expectation);
  const iniLevel = getLevel(initiative);
  const zone     = ZONES[`${expLevel}_${iniLevel}`];

  const expPct = (expectation / 5) * 100;
  const iniPct = (initiative  / 5) * 100;

  setHTML(`
    <div class="screen result-screen">
      <p class="result-label">診断結果</p>
      <h2 class="zone-name">${zone.name}</h2>

      <div class="score-section">
        ${renderScoreBar("期待値", expectation, expPct, "badge-expectation")}
        ${renderScoreBar("主導権", initiative,  iniPct, "badge-initiative")}
      </div>

      ${renderMap(expLevel, iniLevel)}

      <div class="zone-card">
        <h3 class="zone-card-title">現在地について</h3>
        <p class="zone-card-text">${zone.description}</p>
      </div>

      <div class="prescription-card">
        <h3 class="prescription-title">次の一歩</h3>
        <p class="prescription-text">${zone.prescription}</p>
      </div>

      <button class="btn-x-share" onclick="shareToX('${zone.name}')">
        <svg class="x-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L2.03 2.25h6.844l4.262 5.633 5.108-5.633zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></svg>
        結果をXでシェアする
      </button>
      <button class="btn-secondary" onclick="showStart()">もう一度診断する</button>
      <p class="result-footnote">これはあなたの「現在地」です。仕事の攻略度は変えられます。</p>
    </div>
  `);
}

// ─────────────────────────────────────────
// 2軸マップ描画
// ─────────────────────────────────────────

/**
 * 3×3グリッドのポジションマップを返す
 * Y軸：期待値（上が高い）/ X軸：主導権（右が高い）
 */
function renderMap(expLevel, iniLevel) {
  // [行][列] = [期待値L3→L1][主導権L1→L3]
  const grid = [
    [{ key:"3_1", short:"静かな<br>野心" }, { key:"3_2", short:"覚醒<br>前夜" },     { key:"3_3", short:"仕事を<br>遊ぶ人" }],
    [{ key:"2_1", short:"忠実<br>ソルジャー" }, { key:"2_2", short:"優等生<br>の罠" }, { key:"2_3", short:"組織<br>エース" }],
    [{ key:"1_1", short:"言われた<br>まま" }, { key:"1_2", short:"こだわり<br>職人" }, { key:"1_3", short:"暴走<br>プレイヤー" }]
  ];

  const currentKey = `${expLevel}_${iniLevel}`;

  const rowsHTML = grid.map(row => {
    const cellsHTML = row.map(cell => {
      const active = cell.key === currentKey;
      return `
        <div class="map-cell ${active ? "map-cell-active" : ""}">
          <span class="map-cell-name">${cell.short}</span>
          ${active ? '<span class="map-cell-marker">現在地</span>' : ""}
        </div>
      `;
    }).join("");
    return `<div class="map-row">${cellsHTML}</div>`;
  }).join("");

  return `
    <div class="map-section">
      <h3 class="map-title">現在地マップ</h3>
      <div class="map-layout">
        <div class="map-y-label">
          <span>期待値</span>
          <span class="map-axis-arrow">↑ 高</span>
        </div>
        <div class="map-grid-wrap">
          <div class="map-grid">${rowsHTML}</div>
          <div class="map-x-label">主導権 → 高</div>
        </div>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────

/** スコアバーHTMLを返す */
function renderScoreBar(label, score, pct, badgeClass) {
  return `
    <div class="score-item">
      <span class="axis-badge ${badgeClass} score-badge">${label}</span>
      <div class="score-bar-wrap">
        <div class="score-bar-fill" style="width: ${pct}%"></div>
      </div>
      <span class="score-value">${score.toFixed(1)} / 5.0</span>
    </div>
  `;
}

/** X（Twitter）のシェア画面を新しいタブで開く */
function shareToX(zoneName) {
  const text =
    `仕事攻略度診断の結果は「${zoneName}」でした。\nあなたは自律社員？それとも他律社員？`;
  const url = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text);
  window.open(url, "_blank", "noopener,noreferrer");
}

/** #app の innerHTML を置き換える */
function setHTML(html) {
  document.getElementById("app").innerHTML = html;
}

/** \n を <br> に変換する */
function escapeNL(str) {
  return str.replace(/\n/g, "<br>");
}

// ─────────────────────────────────────────
// 起動
// ─────────────────────────────────────────

document.addEventListener("DOMContentLoaded", showStart);
