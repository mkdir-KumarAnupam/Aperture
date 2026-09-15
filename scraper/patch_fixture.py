import json

with open("fixtures/linked_contract_fixture.json", "r") as f:
    fixture = json.load(f)

# Extract records and put them in events
events = []
if "platforms" in fixture:
    for plat in ["x", "reddit", "telegram"]:
        if plat in fixture["platforms"]:
            plat_data = fixture["platforms"][plat]
            if "records" in plat_data:
                events.extend(plat_data["records"])
                del plat_data["records"]

fixture["events"] = events

with open("fixtures/linked_contract_fixture.json", "w") as f:
    json.dump(fixture, f, separators=(',', ':'))
print("Fixture patched.")
