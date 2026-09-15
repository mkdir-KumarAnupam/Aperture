import json

with open("sample_collection_response.json", "r") as f:
    sample = json.load(f)

events = []
if "platforms" in sample:
    for plat in ["x", "reddit", "telegram"]:
        if plat in sample["platforms"]:
            plat_data = sample["platforms"][plat]
            if "records" in plat_data:
                events.extend(plat_data["records"])
                del plat_data["records"]

sample["events"] = events

with open("sample_collection_response.json", "w") as f:
    json.dump(sample, f, indent=4)
print("Sample patched.")
