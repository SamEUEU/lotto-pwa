"""Fetch missing lotto draws from dhlottery.co.kr and update draws.json."""

import json
import time
import pathlib

import requests

DRAWS_PATH = pathlib.Path(__file__).resolve().parent.parent / "draws.json"
API_URL = "https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={}"
MAIN_URL = "https://www.dhlottery.co.kr/gameResult.do?method=byWin"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://www.dhlottery.co.kr/gameResult.do?method=byWin",
    "X-Requested-With": "XMLHttpRequest",
}


def fetch_draw(session: requests.Session, no: int) -> dict | None:
    url = API_URL.format(no)
    try:
        resp = session.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        raw = resp.text.strip()
        if not raw.startswith("{"):
            print(f"  [{no}] non-JSON response (len={len(raw)}), skipping")
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

    # Create session and visit main page to get cookies
    session = requests.Session()
    try:
        session.get(MAIN_URL, headers={
            "User-Agent": HEADERS["User-Agent"],
        }, timeout=15)
        print(f"Session cookies: {list(session.cookies.keys())}")
    except Exception as e:
        print(f"Warning: could not get session cookie: {e}")

    added = 0
    failures = 0
    no = last_no + 1
    while failures < 3:
        result = fetch_draw(session, no)
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
        print("Already up to date (or API blocked).")


if __name__ == "__main__":
    main()
