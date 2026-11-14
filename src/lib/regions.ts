// Choices for Settings → Server → Money and dates.
export const CURRENCIES = [
  { id: "USD", label: "US dollar ($)" }, { id: "CAD", label: "Canadian dollar ($)" }, { id: "EUR", label: "Euro (€)" },
  { id: "GBP", label: "British pound (£)" }, { id: "AUD", label: "Australian dollar ($)" }, { id: "NZD", label: "New Zealand dollar ($)" },
  { id: "MXN", label: "Mexican peso ($)" }, { id: "BRL", label: "Brazilian real (R$)" }, { id: "CHF", label: "Swiss franc" },
  { id: "SEK", label: "Swedish krona (kr)" }, { id: "NOK", label: "Norwegian krone (kr)" }, { id: "DKK", label: "Danish krone (kr)" },
  { id: "PLN", label: "Polish złoty (zł)" }, { id: "JPY", label: "Japanese yen (¥)" }, { id: "INR", label: "Indian rupee (₹)" },
  { id: "ZAR", label: "South African rand (R)" }, { id: "SGD", label: "Singapore dollar ($)" }, { id: "PHP", label: "Philippine peso (₱)" },
] as const;

export const LOCALES = [
  { id: "en-US", label: "United States (12/25/2026, 1,234.50)" }, { id: "en-CA", label: "Canada, English" }, { id: "fr-CA", label: "Canada, French" },
  { id: "en-GB", label: "United Kingdom (25 Dec 2026)" }, { id: "en-IE", label: "Ireland" }, { id: "en-AU", label: "Australia" },
  { id: "en-NZ", label: "New Zealand" }, { id: "en-IN", label: "India" }, { id: "en-ZA", label: "South Africa" }, { id: "en-SG", label: "Singapore" },
  { id: "en-PH", label: "Philippines" }, { id: "de-DE", label: "Germany (25.12.2026, 1.234,50)" }, { id: "de-AT", label: "Austria" },
  { id: "de-CH", label: "Switzerland" }, { id: "fr-FR", label: "France" }, { id: "es-ES", label: "Spain" }, { id: "es-MX", label: "Mexico" },
  { id: "it-IT", label: "Italy" }, { id: "nl-NL", label: "Netherlands" }, { id: "pt-BR", label: "Brazil" }, { id: "pt-PT", label: "Portugal" },
  { id: "sv-SE", label: "Sweden" }, { id: "nb-NO", label: "Norway" }, { id: "da-DK", label: "Denmark" }, { id: "pl-PL", label: "Poland" },
  { id: "ja-JP", label: "Japan" },
] as const;
