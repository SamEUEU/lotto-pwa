"""Fetch missing lotto draws from superkts.com and update draws.json."""

import json
import re
import time
import pathlib

import requests

DRAWS_PATH = pathlib.Path(__file__).resolve().parent.parent / "draws.json"
LIST_URL = "https://superkts.com/lotto/list/"
DETAIL_URL = "https://superkts.com/lotto/{}"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}


def parse_list_page(html: str) -> list[dict]:
    """Parse draw results from the superkts list page HTML table."""
    results = []
    # Each row: <tr><td>1213</td><td><span class="n1">5</span></td>...(6 nums)...<td><span>bonus</span></td><td>...</td></tr>
    row_pattern = re.compile(
        r'<tr><td>(\d+)</td>'  # draw number
        r'<td><span[^>]*>(\d+)</span></td>'  # num1
        r'<td><span[^>]*>(\d+)</span></td>'  # num2
        r'<td><span[^>]*>(\d+)</span></td>'  # num3
        r'<td><span[^>]*>(\d+)</span></td>'  # num4
        r'<td><span[^>]*>(\d+)</span></td>'  # num5
        r'<td><span[^>]*>(\d+)</span></td>'  # num6
        r'<td><span[^>]*>(\d+)</span></td>'  # bonus
    )
    for m in row_pattern.finditer(html):
        drw_no = int(m.group(1))
        nums = sorted(int(m.group(i)) for i in range(2, 8))
        bonus = int(m.group(8))
        results.append({"drwNo": drw_no, "nums": nums, "bonus": bonus})
    return results


def fetch_draw_date(session: requests.Session, drw_no: int) -> str:
    """Fetch individual draw page to get the date."""
    try:
        resp = session.get(DETAIL_URL.format(drw_no), headers=HEADERS, timeout=15)
        # Look for date pattern like 2026-01-03 or 2026.01.03
        m = re.search(r'(\d{4})[.\-](\d{2})[.\-](\d{2})', resp.text)
        if m:
            return f"{m.group(1)}.{m.group(2)}.{m.group(3)} "
    except Exception:
        pass
    return ""


def main():
    with open(DRAWS_PATH, encoding="utf-8") as f:
        data = json.load(f)

    draws = data["draws"]
    existing = {d["drwNo"] for d in draws}
    last_no = max(existing) if existing else 0
    print(f"Current last round: {last_no}")

    session = requests.Session()

    # Fetch the first page (most recent draws)
    try:
        resp = session.get(LIST_URL, headers=HEADERS, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        print(f"Failed to fetch list page: {e}")
        return

    page_results = parse_list_page(resp.text)
    if not page_results:
        print("Could not parse any draws from list page.")
        return

    print(f"Parsed {len(page_results)} draws from list page")

    new_draws = [r for r in page_results if r["drwNo"] not in existing]
    if not new_draws:
        print("Already up to date.")
        return

    # Fetch dates for new draws
    for draw in new_draws:
        date = fetch_draw_date(session, draw["drwNo"])
        draw["date"] = date
        print(f"  Added {draw['drwNo']}: {draw['nums']} +{draw['bonus']} ({date.strip()})")
        time.sleep(0.5)

    draws.extend(new_draws)
    draws.sort(key=lambda x: x["drwNo"])

    with open(DRAWS_PATH, "w", encoding="utf-8") as f:
        json.dump({"draws": draws}, f, ensure_ascii=False)

    print(f"\nDone! Added {len(new_draws)} rounds. Latest: {draws[-1]['drwNo']}")


if __name__ == "__main__":
    main()
