# Steg och sträcka – webbparitet till iOS #124

Casper förtydligade 2026-09-13: antal steg är huvudvärdet, sträcka sekundärt.

- Samma `daily.steps` för metricRow och ring, plus inbyggd yta när dashboardkonfiguration saknas.
- Faktisk `health.distance_km` visas sekundärt i kilometer. Ingen härledd sträcka, browser-pedometer, ny sensorbehörighet eller separat nutidsmätning.
- `steps_measured_at` styr skillnaden mellan noll och saknad stegmätning. Äldre svar/cacher fungerar fortfarande; andra hälsovärden får inte bevisa noll steg.
- Båda värdena följer den valda dagen, med befintligt skydd mot sena svar och fel datum. Inga dashboardval skrivs automatiskt över.
- Backendkontraktet och ny standardkonfiguration levereras separat av Claude. Redan personligt konfigurerade ytor utan steg lämnas oförändrade; befintlig dashboardredigering kan lägga till `daily.steps`.

## Verifiering

- Full Vitest: 444/444 gröna. TypeScript och produktionsbygge gröna.
- Nya prover täcker rad/ring, null/noll/äldre kontrakt, oberoende sträcka, ogiltiga värden, saknat mål samt verklig TodayView: fallback, personlig konfiguration utan steg, ingen dubblering och datumbyte under pågående svar.
- Även en sparad tom dashboard respekteras i reservytan. Regressionstestet var rött före rättningen (steg återinfördes) och grönt efter.
- Verkliga komponenter i lokal utvecklingspreview med syntetiska mätningar visuellt granskade vid 320×800 och 1280×900. Antal steg tydligt större än sträckan. Detta är inte autentiserad produktions-/Health-synkacceptans.
- VERSION/package/lock 1.20.0; 1.19.0 finns redan i öppna profilbilds-PR #85. Ingen ändring från #85 inkluderas i denna PR och ingen deployment är gjord.
