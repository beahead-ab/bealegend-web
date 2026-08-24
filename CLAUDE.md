# Instruktioner för arbete i användarwebben

## Arbetssättet först

[`ARBETSSATT_CLAUDE.md`](ARBETSSATT_CLAUDE.md) beskriver hur vi arbetar
tillsammans: nivån på svaren, vad du beslutar själv, skillnaden mellan kört och
läst, och att oåterkalleliga git-operationer alltid frågar först. **Läs den
före allt annat.**

## Versionshöjning ingår i varje uppdrag

`VERSION` i repots rot är den enda auktoritativa källan till webbens
versionsnummer. **Varje PR som ändrar produkten ska höja den**, och höjningen
ska ingå i samma PR som ändringen — inte i ett efterföljande steg och aldrig
automatiskt i CI.

Bedöm nivån efter vad ändringen gör för den som använder webben:

- **patch** — rättningar och mindre interna förbättringar
- **minor** — nya bakåtkompatibla funktioner: en ny presentationsform, en ny
  yta, ett nytt ord i dashboardspråket som webben kan rita
- **major** — brytande förändringar: en yta som tas bort, ett flöde som ändras
  så att invanda steg inte längre finns

En intern omskrivning som ingen utanför märker är patch, hur stor den än är.

**Ange i PR-sammanfattningen vilket nummer som ändrades och varför nivån är
rätt.** Rör ändringen inte produkten alls — enbart dokumentation, enbart tester
— säg det uttryckligen i stället för att höja utan skäl.

De fyra produkterna (backend, admin, webb, hemsidan) versioneras oberoende. Ändras bara
webben höjs bara den här filen.

`package.json` bär också ett `version`-fält. Det är en **kopia**, inte källan,
och `src/version.test.ts` faller om de går isär.

Bakgrunden och de fullständiga reglerna: `docs/VERSIONERING.md` i backend-repot.

## Annat som gäller här

- Commit-SHA är tekniskt bygg-ID, inte produktens versionsnummer.
- Inga dubbla hårdkodade versionsnummer. `vite.config.ts` läser `VERSION` och
  injicerar den; ingen källfil får skriva ut ett nummer.
- Planen och avgränsningarna: [`docs/MVP_PLAN.md`](docs/MVP_PLAN.md).

## Designmålbilden

`docs/DESIGNBESLUT.md` i backend-repot är målbilden och vinner i alla
designfrågor. Kromen av record: `docs/NAVIGERING_KONCEPT.md` §8 (backend).
Namn och hemvist följer kontraktet: vikten heter `health.weight`, vilopulsen
`health.restingHeartRate`, och roller är shapes i serverns vokabulär.
