import re

with open("tests/test_raw_contract.py", "r") as f:
    content = f.read()

content = content.replace(
    """def payload(record):
    return {"schemaVersion": "1.0.0", "platforms": {name: {"status": "success_empty", "pagination": {}, "records": []} for name in ("x", "reddit", "telegram")} | {"reddit": {"status": "success_with_results", "pagination": {"primaryResultsReturned": 1, "recordsCollected": 1}, "records": [record]}}, "authorProfiles": [], "quality": {"warnings": [], "errors": [], "recordsCollected": 0}}""",
    """def payload(record):
    return {"schemaVersion": "1.0.0", "platforms": {name: {"status": "success_empty", "pagination": {}} for name in ("x", "reddit", "telegram")} | {"reddit": {"status": "success_with_results", "pagination": {"primaryResultsReturned": 1, "recordsCollected": 1}}}, "events": [record], "authorProfiles": [], "quality": {"warnings": [], "errors": [], "recordsCollected": 0}}"""
)

content = content.replace(
    'assert len(checked["platforms"]["reddit"]["records"]) == 1',
    'assert len(checked["events"]) == 1'
)

with open("tests/test_raw_contract.py", "w") as f:
    f.write(content)
print("Test patched.")
