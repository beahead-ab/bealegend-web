# Användarwebben — MVP-plan

**Omfattning:** skelett + inloggning + Idag-ytan + chattgolvet. Beslutad
2026-08-21, efter analysen i backend-chatten som visade att synkversioneringen
inte kräver backendändringar och att admin redan bevisat hela webbstacken.

**Inte i MVP:** passkörning, historik/analys, Biblioteket, liveutmaningar,
offline/service worker. De är nästa våg, inte den här.

---

## §1 Principer

1. **Backend är enda sanningen.** Klienten räknar aldrig fram affärsregler —
   den ritar kontrakt. Samma regel som iOS lever under
   (`docs/USER_TRAINING_WEB.md` i backend-repot).
2. **En krom.** Navigeringskonceptets §8 gäller webben oförändrat: bläcksvart
   krom, gräddvit canvas, blått endast till data och primärknappar, märket —
   aldrig lågan — som identitet.
3. **Samma stack som admin.** React + Vite + TypeScript + vitest,
   `tsc -b && vite build` som CI-grind. Två webbklienter, ett verktygsval.
4. **iOS-klientens försvarsregler ärvs rakt av**, för de är kontraktsbeslut,
   inte plattformsbeslut:
   - hero-raden: `headline` från servern, annars regelbaserad mening, aldrig tom
   - dashboard: okänd binding/presentation hoppas över; tom konfiguration ⇒
     inbyggd yta; kort byggs av löpor, inte sortering
   - tråden: måltidsnyttolasten i fenade block plockas ur prosan och blir chip,
     även halvströmmade block döljs
5. **Samma ursprung, ingen CORS.** Webben serveras bakom samma Caddy som
   API:et, som admin redan gör. Kakor blir därmed förstapartskakor och
   `SameSite` bär CSRF-skyddet.

## §2 Byggordning

| Steg | Ärende | Beroende |
|---|---|---|
| 1 | Skelett: Vite-app, API-klient, krom, CI | – |
| 2 | Backend: användarinloggning med kaka | – (parallellt med 1) |
| 3 | Inloggning i webben | 1, 2 |
| 4 | Idag-ytan | 3 |
| 5 | Chattgolvet och tråden | 3 |
| 6 | Dockerfile + PWA-manifest | 1 |
| 7 | Backend: tredje repot i utrullningen | 6 |

Ärendena bär detaljerna; det här dokumentet bär besluten.

## §3 Tekniska hållpunkter som inte får tappas

- **`POST /api/v1/chat/stream` är en ström över POST.** `EventSource` klarar
  inte POST — tolkningen görs med `fetch` + `ReadableStream`, rad för rad:
  `data: {choices|actions}` och `data: [DONE]`. Samma tolkning som iOS gör med
  `URLSession.bytes`.
- **`POST /api/v1/daily-overview` kräver `time_zone`** —
  `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- **Synkkontraktet är klientdisciplin** (läst och verifierat i backend):
  UUID per kommando som överlever omsändning, `expected_version` alltid satt,
  409-svarets `current_run` adopteras direkt. MVP kör inga pass, men
  API-klienten byggs med detta från dag ett så att passkörningen inte behöver
  en ny klient.
- **Dikteringen** återanvänder admins `useDictation`-mönster (Web Speech,
  svenska, append i stället för ersätt). Kopieras in; ett delat paket är värt
  det först när tre klienter drar åt samma kod.
- **30-minutersfönstret** för "pågående samtal" är samma gräns som backendens
  destillering. En egen siffra här vore en bugg.

## §4 Android: wrappa eller native?

**Beslut: wrappa webben nu. Native Android är en framtida produktsatsning med
en namngiven utlösare, inte ett standardval.**

Skälen:

1. **Native Androids unika värde är sensorerna** — Health Connect, GPS i
   bakgrunden, Wear OS. Inget av det ingår i MVP:ns värde (chatt, Idag,
   planering), och allt annat levererar webben redan.
2. **En tredje kodbas är den dyraste förpliktelse som går att ta just nu.**
   iOS är SwiftUI, webben React — det finns inget delat lager att stå på, så
   native Android betyder full parallellutveckling för varje funktion framåt.
3. **Vägen är billig och reversibel:** PWA-manifest ingår i MVP (steg 6);
   därefter är en Trusted Web Activity i Play Store dagar av arbete, inte
   veckor. Uppgraderingen till native stängs inte av att vi wrappar först.

**Utlösaren för native:** när Android-användare på riktigt efterfrågar
sensorburen träning — Powerwalk med GPS, pulszoner, Health Connect — och
webbens sensorlösa passkörning bevisligen inte räcker. Då är det ett
produktbeslut med underlag, inte en gissning.

Samma logik som `USER_TRAINING_WEB.md` redan slår fast åt andra hållet:
PWA:n ersätter inte native där sensorerna bor — och native behövs inte där de
inte bor.
