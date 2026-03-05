"""Fetch missing lotto draws from dhlottery.co.kr and update draws.json."""

import json
import urllib.request
import time
import pathlib

DRAWS_PATH = pathlib.Path(__file__).resolve().parent.parent / "draws.json"
API_URL = "https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={}"


def _get_session_cookie() -> str:
    """Visit the main page first to get a session cookie."""
    req = urllib.request.Request(
        "https://www.dhlottery.co.kr/common.do?method=main",
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
    )
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        for header in resp.headers.get_all("Set-Cookie") or []:
            if "JSESSIONID" in header or "DHJSESSIONID" in header:
                return header.split(";")[0]
        return ""
    except Exception:
        return ""


def fetch_draw(no: int, cookie: str = "") -> dict | None:
    url = API_URL.format(no)
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.dhlottery.co.kr/gameResult.do?method=byWin",
    }
    if cookie:
        headers["Cookie"] = cookie
    req = urllib.request.Request(url, headers=headers)
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        raw = resp.read().decode("utf-8", errors="replace").strip()
        # Skip non-JSON responses (HTML redirects, etc.)
        if not raw.startswith("{"):
            print(f"  [{no}] non-JSON response, retrying without cookie...")
            headers.pop("Cookie", None)
            req2 = urllib.request.Request(url, headers=headers)
            resp2 = urllib.request.urlopen(req2, timeout=15)
            raw = resp2.read().decode("utf-8", errors="replace").strip()
            if not raw.startswith("{"):
                print(f"  [{no}] still non-JSON, skipping")
                return None
        j = json.loads(raw)
    except Exception as e:
        print(f"  [{no}] request failed: {e}")
        return None

    if j.get("returnValue") != "success":
        return None

    return {
        "drwNo": j["drwNo"],
        "date": j["drwNoDate"].replace("-", ".") + " ",
        "nums": sorted([
            j["drwtNo1"], j["drwtNo2"], j["drwtNo3"],
            j["drwtNo4"], j["drwtNo5"], j["drwtNo6"],
        ]),
        "bonus": j["bnusNo"],
    }


def main():
    with open(DRAWS_PATH, encoding="utf-8") as f:
        data = json.load(f)

    draws = data["draws"]
    last_no = draws[-1]["drwNo"] if draws else 0
    print(f"Current last round: {last_no}")

    cookie = _get_session_cookie()
    if cookie:
        print(f"Got session cookie: {cookie[:30]}...")

    added = 0
    failures = 0
    no = last_no + 1
    while failures < 3:
        result = fetch_draw(no, cookie)
        if result is None:
            failures += 1
            no += 1
            continue
        draws.append(result)
        print(f"  Added {result['drwNo']}: {result['nums']} +{result['bonus']}")
        added += 1
        failures = 0
        no += 1
        time.sleep(1)

    if added:
        with open(DRAWS_PATH, "w", encoding="utf-8") as f:
            json.dump({"draws": draws}, f, ensure_ascii=False)
        print(f"\nDone! Added {added} rounds. Latest: {draws[-1]['drwNo']}")
    else:
        print("Already up to date.")


if __name__ == "__main__":
    main()
