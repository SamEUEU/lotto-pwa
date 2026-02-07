const $ = (id) => document.getElementById(id);

// ✅ GitHub raw JSON (CORS OK)
// 1) 네가 직접 업로드한 draws.json이 있으면 그걸 쓰는 게 제일 안정적
// 2) 없으면 아래 예시처럼 공개 repo raw를 사용
const GITHUB_DRAWS_URL =
  "https://raw.githubusercontent.com/happylie/lotto_data/main/draws.json"; // ← 만약 404면 너 repo에 draws.json 올려서 그걸로 교체 권장

function setStatus(msg, type = "") {
  const el = $("status");
  el.className = `status ${type}`.trim();
  el.textContent = msg;
}

function pad2(n) { return String(n).padStart(2, "0"); }
function setLetter(i) { return String.fromCharCode("A".charCodeAt(0) + i); }

function strategyLabel(v) {
  const map = {
    hot: "HOT(자주 나온)",
    cold: "COLD(오래 안 나온)",
    mix: "MIX(자주 + 오래안나옴 혼합)",
    balanced: "BALANCED(균형형 프리셋: 합/홀짝/연속/구간)",
    random: "RANDOM(완전 무작위)",
  };
  return map[v] || v;
}
function rangeLabel(lookback) {
  return lookback > 0 ? `최근 ${lookback}회` : "전체 회차";
}

function loadDraws() {
  try {
    const raw = localStorage.getItem("draws_json");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.draws || [];
  } catch { return []; }
}
function saveDraws(draws) {
  localStorage.setItem("draws_json", JSON.stringify({ draws }));
}
function latestNo(draws) {
  return draws.length ? draws[draws.length - 1].drwNo : 0;
}

async function fetchDrawsFromGithub() {
  const r = await fetch(GITHUB_DRAWS_URL, { cache: "no-store" });
  const text = await r.text();
  if (!r.ok) throw new Error(`Download failed: HTTP ${r.status}`);

  // GitHub가 HTML(404 페이지) 주면 여기서 잡힘
  if (text.trim().startsWith("<")) {
    throw new Error(`NON-JSON from GitHub. head="${text.slice(0, 80).replace(/\s+/g, " ")}"`);
  }

  const j = JSON.parse(text);
  if (!j.draws || !Array.isArray(j.draws)) {
    throw new Error("Invalid draws.json format (missing draws array)");
  }
  return j.draws;
}

function renderReceipt(result) {
  const rBody = $("rBody");
  rBody.innerHTML = "";
  result.forEach((nums, i) => {
    const row = document.createElement("div");
    row.className = "r-row";
    row.innerHTML = `
      <div class="r-set">${setLetter(i)}</div>
      <div class="r-auto">자동</div>
      <div class="r-nums">${nums.map(pad2).join(" ")}</div>
    `;
    rBody.appendChild(row);
  });
  $("rPrice").textContent = (result.length * 1000).toLocaleString("ko-KR");
}

// ✅ 테스트용 추천(랜덤)
// 다음 단계에서 PC 버전 core 로직을 그대로 포팅해도 됨
function randomSampleUnique(k) {
  const s = new Set();
  while (s.size < k) s.add(1 + Math.floor(Math.random() * 45));
  return Array.from(s).sort((a, b) => a - b);
}

function updateExplainHeader() {
  const strategy = $("strategy").value;
  const lookback = Number($("lookback").value);
  $("exStrategy").textContent = strategyLabel(strategy);
  $("exRange").textContent = rangeLabel(lookback);
}

$("strategy").addEventListener("change", () => {
  updateExplainHeader();
  $("explainText").textContent =
    `전략: ${strategyLabel($("strategy").value)}\n` +
    `데이터 범위: ${rangeLabel(Number($("lookback").value))}\n\n` +
    `준비됨. "번호 추천" 실행 후 상세 설명이 표시됩니다.`;
});

$("lookback").addEventListener("change", () => {
  updateExplainHeader();
});

$("update").onclick = async () => {
  try {
    $("update").disabled = true;
    setStatus("데이터 업데이트 중... (GitHub에서 다운로드)", "info");

    const draws = await fetchDrawsFromGithub();
    saveDraws(draws);

    const latest = latestNo(draws);
    setStatus(`업데이트 완료! (최신 회차: ${latest || "-"}회)`, "ok");

    // 화면 상단 회차도 즉시 반영(선택)
    $("rRound").textContent = latest ? `회차: 제 ${latest}회` : "회차: -";
  } catch (e) {
    setStatus("업데이트 실패: " + e.message, "err");
  } finally {
    $("update").disabled = false;
  }
};

$("run").onclick = async () => {
  try {
    setStatus("추천 생성 중...", "info");

    const sets = Number($("sets").value) || 5;
    const strategy = $("strategy").value;
    const lookback = Number($("lookback").value);

    const result = Array.from({ length: sets }, () => randomSampleUnique(6));
    renderReceipt(result);

    const draws = loadDraws();
    const latest = latestNo(draws);

    $("rRound").textContent = latest ? `회차: 제 ${latest}회` : "회차: -";
    $("rIssued").textContent = "발행: " + new Date().toLocaleString();

    updateExplainHeader();
    $("explainText").textContent =
      `전략: ${strategyLabel(strategy)}\n` +
      `데이터 범위: ${rangeLabel(lookback)}\n\n` +
      `※ 현재 PWA 버전은 테스트용으로 추천은 RANDOM으로만 동작합니다.\n` +
      `원하면 PC 버전(HOT/COLD/MIX/BALANCED) 로직을 그대로 포팅해 완성할 수 있습니다.`;

    setStatus("완료", "ok");
  } catch (e) {
    setStatus("오류: " + e.message, "err");
  }
};

$("copy").onclick = async () => {
  try {
    const rows = Array.from(document.querySelectorAll(".r-row")).map((row) =>
      row.textContent.replace(/\s+/g, " ").trim()
    );
    if (!rows.length) {
      setStatus("복사할 결과가 없습니다. 먼저 '번호 추천'을 눌러주세요.", "err");
      return;
    }
    await navigator.clipboard.writeText(rows.join("\n"));
    setStatus("결과를 클립보드에 복사했습니다.", "ok");
  } catch (e) {
    setStatus("복사 실패: " + e.message, "err");
  }
};

// 초기
updateExplainHeader();
$("explainText").textContent =
  `전략: ${strategyLabel($("strategy").value)}\n` +
  `데이터 범위: ${rangeLabel(Number($("lookback").value))}\n\n` +
  `준비됨. 먼저 "데이터 업데이트"를 눌러 데이터를 내려받으세요.`;
setStatus("준비됨");
