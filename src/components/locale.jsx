// Locale configuration for FitMind AI — Default: Australia

export const LOCALES = {
  AU: { code: "AU", name: "Australia", flag: "🇦🇺", units: "metric", weightUnit: "kg", heightUnit: "cm", dateShortFormat: "d MMM", dateLongFormat: "d MMMM yyyy", nutritionSource: "Food Standards Australia New Zealand (FSANZ) AUSNUT database", nutritionCountry: "Australia" },
  US: { code: "US", name: "United States", flag: "🇺🇸", units: "imperial", weightUnit: "lbs", heightUnit: "in", dateShortFormat: "MMM d", dateLongFormat: "MMMM d, yyyy", nutritionSource: "USDA FoodData Central database", nutritionCountry: "United States" },
  UK: { code: "UK", name: "United Kingdom", flag: "🇬🇧", units: "metric", weightUnit: "kg", heightUnit: "cm", dateShortFormat: "d MMM", dateLongFormat: "d MMMM yyyy", nutritionSource: "Public Health England UK food composition tables (McCance & Widdowson)", nutritionCountry: "United Kingdom" },
  CA: { code: "CA", name: "Canada", flag: "🇨🇦", units: "metric", weightUnit: "kg", heightUnit: "cm", dateShortFormat: "MMM d", dateLongFormat: "MMMM d, yyyy", nutritionSource: "Health Canada Canadian Nutrient File (CNF)", nutritionCountry: "Canada" },
  NZ: { code: "NZ", name: "New Zealand", flag: "🇳🇿", units: "metric", weightUnit: "kg", heightUnit: "cm", dateShortFormat: "d MMM", dateLongFormat: "d MMMM yyyy", nutritionSource: "New Zealand FOODfiles database (Plant & Food Research NZ)", nutritionCountry: "New Zealand" },
};

export const DEFAULT_LOCALE = "AU";
export function getLocale(code) { return LOCALES[code] || LOCALES[DEFAULT_LOCALE]; }
export function kgToLbs(kg) { return Math.round(kg * 2.2046 * 10) / 10; }
export function lbsToKg(lbs) { return Math.round((lbs / 2.2046) * 10) / 10; }
export function cmToIn(cm) { return Math.round(cm / 2.54); }
export function inToCm(inches) { return Math.round(inches * 2.54); }
export function displayWeight(kg, localeCode) { const locale = getLocale(localeCode); if (!kg) return `— ${locale.weightUnit}`; if (locale.units === "imperial") return `${kgToLbs(kg)} lbs`; return `${kg} kg`; }
export function parseWeightToKg(value, localeCode) { const num = parseFloat(value); if (isNaN(num)) return 0; const locale = getLocale(localeCode); return locale.units === "imperial" ? lbsToKg(num) : num; }
export function parseHeightToCm(value, localeCode) { const num = parseFloat(value); if (isNaN(num)) return 0; const locale = getLocale(localeCode); return locale.units === "imperial" ? inToCm(num) : num; }
export function getWeightPlaceholder(localeCode) { return getLocale(localeCode).units === "imperial" ? "165" : "75"; }
export function getHeightPlaceholder(localeCode) { return getLocale(localeCode).units === "imperial" ? "69" : "175"; }
export function getHeightLabel(localeCode) { return getLocale(localeCode).units === "imperial" ? "in" : "cm"; }
