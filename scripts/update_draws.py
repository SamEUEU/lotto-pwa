"""Fetch missing lotto draws from dhlottery.co.kr and update draws.json."""

import json
import urllib.request
import time
import pathlib

DRAWS_PATH = pathlib.Path(__file__).resolve().parent.parent / "draws.json"
API_URL = "https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo={}"


def fetch_draw(no: int) -> dict | None:
    url = API_URL.format(no)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        j = json.loads(resp.read())
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

    added = 0
    no = last_no + 1
    while True:
        result = fetch_draw(no)
        if result is None:
            break
        draws.append(result)
        print(f"  Added {result['drwNo']}: {result['nums']} +{result['bonus']}")
        added += 1
        no += 1
        time.sleep(0.5)

    if added:
        with open(DRAWS_PATH, "w", encoding="utf-8") as f:
            json.dump({"draws": draws}, f, ensure_ascii=False)
        print(f"\nDone! Added {added} rounds. Latest: {draws[-1]['drwNo']}")
    else:
        print("Already up to date.")


if __name__ == "__main__":
    main()
