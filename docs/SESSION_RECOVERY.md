# Återställning av webbens session vid tillfälligt fel

## Avgränsning

Rättning av W-2 i den gemensamma granskningen 9 september 2026. Vid sidstart
eller användarens uttryckliga återförsök betyder 429, 5xx och transportfel att
inloggningen inte kunde kontrolleras, inte att användaren är bekräftat utloggad.

I läget `restoreFailed` behålls den kontoägda cachen men ingen Idag-yta eller
kontouppgift visas. Knappen **Försök igen** frågar servern på nytt. Först ett
svar med `authenticated: true` och ett användar-id får öppna kontoytan. Ett
annat bekräftat konto får inte läsa det föregående kontots cache. Trasigt svar
är också osäker återställning, inte en bekräftad identitet.

Bekräftad 401 eller `authenticated: false` glömmer cachen och visar inloggning.
Användaren kan även välja **Logga ut**. Då döljs kontot och cachen glöms lokalt
direkt, utan att vänta på logout-anropets nätverkssvar. Gamla restore/login-
svar får inte ändra en nyare lokal sessionsgeneration.

Det här ändrar inte tokenlivslängder, servercookies, den generella
API-klientens automatiska refresh eller träningskön. Hookens generationsskydd
gäller dess egna tillstånds- och cacheskrivningar, inte HttpOnly-cookies som
webbläsaren tar emot från en server. Samtidiga authanrops cookieordning,
API-401 under redan inloggad användning, flera flikar och fysisk end-to-end-
acceptans återstår som separata kontrollpunkter. Ingen gammal cache används
som bevis på vem som för närvarande är inloggad.

## Verifiering

- Tre regressioner (503, 429, nätavbrott) var röda mot basen: alla blev felaktigt
  `signedOut`. Efter rättningen går de gröna och verifierar bibehållen cache.
- Verklig hook prövas för 401, bekräftad/obekräftad identitet, A→A, A→B,
  utloggning under långsamt nätverk och gamla lyckade/felande restore-svar.
- Verklig `App` prövas för återförsöksknapp, vänteläge, inga lösenordsfält eller
  kontodata vid osäker återställning och explicit utloggning. Idag-ytan och
  närvaropingen är isolerade dubblar i dessa komponentprov.
- `VERSION`, `package.json` och låsfilens projektversion höjs 1.18.0→1.18.1:
  patch eftersom detta rättar återställning, inte ändrar serverkontraktet.

Ingen produktionsutrullning eller riktig kontoåterställning ingår i proven.
Full svit, bygge och oberoende review ska dokumenteras på exakt PR-head.
