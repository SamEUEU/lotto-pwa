"""Fetch missing lotto draws from dhlottery.co.kr and update draws.json.

Strategy: GET the result page HTML and parse winning numbers from it,
since the JSON API endpoint is blocked for bot requests.
"""

import json
import re
import time
import pathlib

import requests

DRAWS_PATH = pathlib.Path(__file__).resolve().parent.parent / "draws.json"
RESULT_URL = "https://www.dhlottery.co.kr/gameResult.do?method=byWin&drwNo={}"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
}


def parse_draw_from_html(html: str, expected_no: int) -> dict | None:
    """Parse winning numbers from the dhlottery result page HTML."""
    # Extract draw number: <h4>제 1205 회</h4> or similar
    m = re.search(r'<h4[^>]*>\s*제\s*(\d+)\s*회', html)
    if not m:
        return None
    drw_no = int(m.group(1))
    if drw_no != expected_no:
        return None

    # Extract date: (2026년 01월 03일 추첨)
    date_match = re.search(r'\((\d{4})년\s*(\d{2})월\s*(\d{2})일\s*추첨\)', html)
    date_str = ""
    if date_match:
        date_str = f"{date_match.group(1)}.{date_match.group(2)}.{date_match.group(3)} "

    # Extract 6 main numbers from <span class="ball_645 lrg ball1">1</span> etc.
    ball_pattern = re.findall(r'<span\s+class="ball_645\s+lrg\s+ball\d+"[^>]*>\s*(\d+)\s*</span>', html)
    if len(ball_pattern) < 7:
        # Fallback: try win_ball_645 class
        ball_pattern = re.findall(r'class="[^"]*ball_645[^"]*"[^>]*>\s*(\d+)\s*</span>', html)

    if len(ball_pattern) < 7:
        print(f"  [{expected_no}] could not parse balls (found {len(ball_pattern)})")
        return None

    nums = sorted(int(x) for x in ball_pattern[:6])
    bonus = int(ball_pattern[6])

    return {
        "drwNo": drw_no,
        "date": date_str,
        "nums": nums,
        "bonus": bonus,
    }


def fetch_draw(session: requests.Session, no: int) -> dict | None:
    url = RESULT_URL.format(no)
    try:
        resp = session.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        html = resp.text
        if len(html) < 1000:
            print(f"  [{no}] response too short ({len(html)} bytes)")
            return None
        return parse_draw_from_html(html, no)
    except Exception as e:
        print(f"  [{no}] request failed: {e}")
        return None


def main():
    with open(DRAWS_PATH, encoding="utf-8") as f:
        data = json.load(f)

    draws = data["draws"]
    last_no = draws[-1]["drwNo"] if draws else 0
    print(f"Current last round: {last_no}")

    session = requests.Session()

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
        print(f"  Added {result['drwNo']}: {result['nums']} +{result['bonus']} ({result['date'].strip()})")
        added += 1
        failures = 0
        no += 1
        time.sleep(1)

    if added:
        # Sort by drwNo to ensure order
        draws.sort(key=lambda x: x["drwNo"])
        with open(DRAWS_PATH, "w", encoding="utf-8") as f:
            json.dump({"draws": draws}, f, ensure_ascii=False)
        print(f"\nDone! Added {added} rounds. Latest: {draws[-1]['drwNo']}")
    else:
        print("Already up to date (or site unreachable).")


if __name__ == "__main__":
    main()
