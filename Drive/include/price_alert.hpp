// price_alert.hpp — public API for the Wissen Price Alert Tool
// All parsing, validation, evaluation, and formatting live here so that
// tests can exercise every layer without linking main.cpp.
#pragma once

#include <string>
#include <vector>
#include <map>
#include <stdexcept>
#include <optional>
#include <cstdint>

// ---------------------------------------------------------------------------
// 1. Data model
// ---------------------------------------------------------------------------

/// One row from prices.csv after parsing and validation.
struct PriceRow {
    std::string date;        // YYYY-MM-DD (validated)
    std::string instrument;  // case-sensitive name
    double      close;       // finite; zero/negative are accepted (see README)
};

/// Sorted price history for a single instrument.
/// Outer key = instrument name; inner vector sorted ascending by date.
using PriceDB = std::map<std::string, std::vector<PriceRow>>;

/// Rule type discriminator.
enum class RuleType { Level, MaCross };

/// Crossing direction.
enum class Direction { Above, Below };

/// One validated rule from rules.json.
struct Rule {
    std::string id;
    std::string instrument;
    RuleType    type;
    Direction   direction;
    // Level rule
    double      level = 0.0;
    // MA cross rule
    int         shortWindow = 0;
    int         longWindow  = 0;
};

/// One fired alert, ready for output.
struct Alert {
    std::string date;       // YYYY-MM-DD
    std::string ruleId;
    std::string instrument;
    RuleType    type;
    Direction   direction;
    double      level = 0.0;    // used when type==Level
    int         shortWindow = 0;
    int         longWindow  = 0;
};

// ---------------------------------------------------------------------------
// 2. CSV parsing
// ---------------------------------------------------------------------------

/// Parse prices.csv (binary mode, BOM/CRLF handled).
/// Throws std::runtime_error with a human-readable message on any error.
/// Returns rows in arbitrary order; call buildPriceDB to normalise.
std::vector<PriceRow> parseCSV(const std::string& path);

/// Build and validate the PriceDB from raw rows.
/// Rejects duplicate (instrument, date) pairs.
PriceDB buildPriceDB(std::vector<PriceRow> rows);

// ---------------------------------------------------------------------------
// 3. Rules JSON parsing
// ---------------------------------------------------------------------------

/// Parse and validate rules.json.
/// Throws std::runtime_error on any structural or semantic error.
std::vector<Rule> parseRules(const std::string& path);

// ---------------------------------------------------------------------------
// 4. Alert engine  (pure, independently testable)
// ---------------------------------------------------------------------------

/// Evaluate a single level rule against the full sorted history for its instrument.
/// Returns one Alert per crossing (in date order).
/// "Previous" = previous observation, not previous calendar day.
std::vector<Alert> evalLevelRule(const Rule& rule, const std::vector<PriceRow>& history);

/// Evaluate a single MA-cross rule.
/// SMA computed over the N most-recent observations including the current one.
/// Crossings are identified by comparing consecutive (prev, cur) SMA pairs.
/// Cross-multiplication in long double: shortSum*longWindow vs longSum*shortWindow.
std::vector<Alert> evalMaCrossRule(const Rule& rule, const std::vector<PriceRow>& history);

/// Dispatch to the correct evaluator and collect all alerts from all rules.
/// Sorts result by (date ASC, rule-id ASC, byte-wise).
std::vector<Alert> runAlerts(const std::vector<Rule>& rules, const PriceDB& db);

// ---------------------------------------------------------------------------
// 5. Output formatting
// ---------------------------------------------------------------------------

/// Format a double as the shortest clean decimal string:
///   1500.0 → "1500", 1500.5 → "1500.5", no scientific notation for normal values.
std::string formatNumber(double v);

/// Format one alert as the spec output line (no trailing newline).
std::string formatAlert(const Alert& a);

/// Write all alerts to stdout, one per line, using "\n" line endings.
void printAlerts(const std::vector<Alert>& alerts);

// ---------------------------------------------------------------------------
// 6. Date validation helper (exposed for tests)
// ---------------------------------------------------------------------------

/// Return true iff s is a valid YYYY-MM-DD calendar date
/// (year >= 0001, real calendar day including leap years).
bool isValidDate(const std::string& s);

// ---------------------------------------------------------------------------
// 7. Exceptions used by the tool
// ---------------------------------------------------------------------------

/// Thrown for file-not-found / unreadable / invalid input (exit 1).
class InputError : public std::runtime_error {
public:
    explicit InputError(const std::string& msg) : std::runtime_error(msg) {}
};
