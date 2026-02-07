const $ = (id) => document.getElementById(id);

const PROXY_BASE = "https://lotto-proxy.simple3210-joo.workers.dev/"; // <-- 여기만 너 Worker 주소로 교체

function setStatus(msg, type="") {
  const el = $("status");
  el.className = `status ${type}`.trim();
  el.textContent = msg;
}

function pad2(n){ return String(n).padStart(2,"0"); }
function setLetter(i){ return String.fromCharCode("A".charCodeAt(0)+i); }

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

async function fetchDraw(drwNo) {
  const url = `${PROXY_BASE}/?drwNo=${drwNo}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (j.returnValue && j.returnValue !== "success") return null;
  // 동행복권 응답 필드: drwtNo1..6, bnusNo, drwNoDate 등 :contentReference[oaicite:5]{index=5}
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

  setStatus(`업데이트 중... (현재 ${cur}회)`, "info");

  // 다음 회차부터 success 나오는 동안 추가
  let added = 0;
  while (true) {
    const next = cur + 1;
    const d = await fetchDraw(next);
    if (!d) break;
    draws.push(d);
    cur = next;
    added++;
    // 과도한 루프 방지(테스트용)
    if (added > 5000) break;
  }

  saveDraws(draws);
  setStatus(`업데이트 완료! 추가 ${added}회 / 최신 ${cur}회`, "ok");
  return { latest: cur, added };
}

// ===== 추천(너의 기존 core 로직을 그대로 JS로 옮기면 됨) =====
// 테스트 단계라면: 지금은 "랜덤"만이라도 먼저 연결해 PWA 동작 확인.
function randomSampleUnique(k){
  const s = new Set();
  while (s.size < k) s.add(1 + Math.floor(Math.random()*45));
  return Array.from(s).sort((a,b)=>a-b);
}

function renderReceipt(result){
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
  $("rPrice").textContent = (result.length*1000).toLocaleString("ko-KR");
}

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
  const sets = Number($("sets").value);
  // 일단 PWA 동작 확인용 랜덤 추천
  const result = Array.from({length: sets}, () => randomSampleUnique(6));
  renderReceipt(result);

  const draws = loadDraws();
  const latest = latestNo(draws);
  $("rRound").textContent = latest ? `회차: 제 ${latest}회` : "회차: -";
  $("rIssued").textContent = "발행: " + new Date().toLocaleString();

  setStatus("완료", "ok");
};

setStatus("준비됨");
