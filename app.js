const $ = (id) => document.getElementById(id);

// ✅ 여기에 네 Worker 도메인만 넣어야 함 (끝에 / 붙이지 말기)
const PROXY_BASE = "https://lotto-proxy.simple3210-joo.workers.dev/";
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

// ===== localStorage draws 저장/로드 =====
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

// ===== 동행복권 API(Worker 경유) =====
async function fetchDraw(drwNo) {
  // PROXY_BASE가 Worker가 아니면 여기서 HTML이 떨어지고 JSON parse 에러가 남
  const url = `${PROXY_BASE}/?drwNo=${encodeURIComponent(drwNo)}`;
  const r = await fetch(url, { cache: "no-store" });

  const text = await r.text();
  // JSON이 아닌 HTML이면 여기서 잡아내서 메시지 개선
  if (text.trim().startsWith("<")) {
    throw new Error(`NON-JSON response (check PROXY_BASE). head="${text.slice(0, 60).replace(/\s+/g, " ")}"`);
  }
  const j = JSON.parse(text);

  if (j.returnValue && j.returnValue !== "success") return null;

  return {
    drwNo: Number(j.drwNo),
    date: String(j.drwNoDate || ""),
    nums: [j.drwtNo1, j.drwtNo2, j.drwtNo3, j.drwtNo4, j.drwtNo5, j.drwtNo6].map(Number),
    bonus: Number(j.bnusNo)
  };
}

async function updateData() {
  let draws = loadDraws();
  let cur = latestNo(draws);

  setStatus(`데이터 업데이트 중... (현재 ${cur || "-"}회)`, "info");

  let added = 0;

  // 처음 실행이면 1회부터 시작하되, 너무 오래 걸릴 수 있으니 우선 200회만 받아도 됨
  // 하지만 너는 "전체"를 원하니까 일단 1부터 끝까지 받게 둠.
  if (!cur) cur = 0;

  while (true) {
    const next = cur + 1;
    const d = await fetchDraw(next);
    if (!d) break;
    draws.push(d);
    cur = next;
    added++;

    // 너무 오래 걸리면 브라우저가 멈출 수 있으니 20회마다 저장/상태 업데이트
    if (added % 20 === 0) {
      saveDraws(draws);
      setStatus(`업데이트 중... (+${added}회, 최신 ${cur}회)`, "info");
      await new Promise(r => setTimeout(r, 50));
    }
  }

  saveDraws(draws);
  setStatus(`업데이트 완료! 추가 ${added}회 / 최신 ${cur}회`, "ok");
  return { latest: cur, added };
}

// ===== 추천(지금은 테스트용: random만 동작) =====
// 다음 단계에서 네 데스크톱 로직(HOT/COLD/MIX/BALANCED) 그대로 포팅 가능
function randomSampleUnique(k) {
  const s = new Set();
  while (s.size < k) s.add(1 + Math.floor(Math.random() * 45));
  return Array.from(s).sort((a, b) => a - b);
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

function updateExplainHeader() {
  const strategy = $("strategy").value;
  const lookback = Number($("lookback").value);

  $("exStrategy").textContent = strategyLabel(strategy);
  $("exRange").textContent = rangeLabel(lookback);

  // 하단 설명 프리뷰(최소)
  $("explainText").textContent =
    `전략: ${strategyLabel(strategy)}\n데이터 범위: ${rangeLabel(lookback)}\n\n` +
    `준비됨. "번호 추천" 실행 후 상세 설명이 표시됩니다.`;
}

// ===== 이벤트 연결 =====
$("strategy").addEventListener("change", updateExplainHeader);
$("lookback").addEventListener("change", updateExplainHeader);

$("update").onclick = async () => {
  try {
    $("update").disabled = true;
    await updateData();
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

    // ✅ 현재는 테스트용 random 추천(전략별 로직은 다음 단계에서 포팅)
    const result = Array.from({ length: sets }, () => randomSampleUnique(6));
    renderReceipt(result);

    const draws = loadDraws();
    const latest = latestNo(draws);

    $("rRound").textContent = latest ? `회차: 제 ${latest}회` : "회차: -";
    $("rIssued").textContent = "발행: " + new Date().toLocaleString();

    // 설명 업데이트
    $("exStrategy").textContent = strategyLabel(strategy);
    $("exRange").textContent = rangeLabel(lookback);
    $("explainText").textContent =
      `전략: ${strategyLabel(strategy)}\n데이터 범위: ${rangeLabel(lookback)}\n\n` +
      `※ 현재 PWA 테스트 버전은 추천은 RANDOM으로만 동작합니다.\n` +
      `다음 단계에서 HOT/COLD/MIX/BALANCED 로직을 그대로 포팅해 붙이면 완성됩니다.`;

    setStatus("완료", "ok");
  } catch (e) {
    setStatus("오류: " + e.message, "err");
  }
};

$("copy").onclick = async () => {
  try {
    // UI에 복사 버튼이 이미 있으니 최소 기능
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

// 초기 표시
updateExplainHeader();
setStatus("준비됨");
