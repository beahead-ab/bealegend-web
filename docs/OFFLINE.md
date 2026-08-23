# Utan nät

Vad webbklienten kan när servern inte svarar, vad som sparas i webbläsaren, och
vad som fortfarande kräver uppkoppling. Skriven för att kunna motsägas: om något
här inte stämmer är det dokumentet som har fel, inte koden.

## Vad som fungerar

| Yta | Utan nät |
|---|---|
| **Dagen på Idag** | Den senaste dagen servern svarade med ritas, med raden »Senast hämtat 07:12«. Bara det datum som står i rubriken — aldrig en granndag. |
| **Startsidans form** | Den senast hämtade dashboardkonfigurationen används, så ytan ser ut som användarens egen i stället för att falla tillbaka på den inbyggda. |
| **Passkörningen** | Varje loggat set köas idempotent i `bal.training.queue` och spelas upp när nätet kommer tillbaka. Fungerade redan före det här arbetet. |
| **Tomma tillstånd** | Streckade skalor, tankstreck, vägarna in. Ingenting av det kräver nät. |

## Vad som inte fungerar

| Yta | Varför |
|---|---|
| **Historikfönstret** | Vikt- och vilopulskurvor och veckans pass läses per period ur `/history` och cachas inte. Utan nät ritas de i sitt tomma läge — streckad skala, ordets egen mening — vilket är sant men inte samma sak som det användaren såg senast. |
| **Dagens pass och »Pågår«** | `/training/home` cachas inte. Passgenvägen och pågåendemärket uteblir tills nätet är tillbaka. Ett pågående pass som redan öppnats fortsätter fungera via kön. |
| **Samtalet** | Varje tur går till servern. Raden finns kvar men svaret dröjer till uppkopplingen är tillbaka. |
| **Inloggning** | Sessionen förnyas mot servern. Utan nät vid start går det inte att komma in alls. |
| **Nedräkningens takt och prognos** | Räknas av servern vid läsning och följer med dagens svar. Cachad dag bär alltså den takt som gällde när den hämtades. |

**Offlinekravet är alltså delvis uppfyllt.** Dagen och ytans form finns; fönstret
och passgenvägen gör det inte.

## Vad som sparas i webbläsaren

Två nycklar i `localStorage`, båda på appens egen origin.

### `bal.days`

```
{ userId, days: { "2026-08-23": { at, overview } }, config: { at, config } }
```

- **`overview`** är hela dagssvaret: kalorier, makron, måltider med beskrivning
  och tid, steg, aktiva kalorier, sömn, och coachens mening för dagen. Det är
  hälso- och kostuppgifter.
- **`config`** är startsidans form — vilka ord som visas, i vilken ordning och
  hur. Den bär inga värden, bara vilka *typer* av data ytan ritar.
- **Sju dagar** sparas, gallrade efter vilken dag raden beskriver.
- **`userId`** är kontot allt tillhör.

### `bal.training.queue`

Ej loggade set från en pågående passkörning, med `command_id` per set så en
uppspelning aldrig blir ett dubbelloggat set.

## Hur det hålls isär mellan konton

En webbläsare kan delas. Reglerna, i den ordning de verkar:

1. **Sessionsgränsen städar.** `applyToCache` i `src/session.ts` anropas från
   alla fyra vägar in och ut — återställd session, ny inloggning, utgången
   session, utloggning. Ett konto med id tar över cachen; allt annat glömmer
   den. Regeln finns på ett ställe just för att en glömd väg annars vore en
   läcka.
2. **Ingen identitet, inget minne.** En session utan `user.id` varken läser
   eller skriver. Att falla stängt kostar en omhämtning.
3. **Varje läsning och skrivning namnger sitt konto.** Stämmer inte ägaren
   *raderas* lagringen i stället för att bara nekas — nästa person som loggar
   in tar första läsningen, och då är den förras dag redan borta.
4. **Varje rad måste beskriva sin egen dag.** En post vars `date` inte är
   nyckeln den ligger under läses inte.
5. **Utloggning städar även om servern inte svarar.** Ett nätbortfall får inte
   lämna en persons mätvärden läsbara för nästa.

Testerna för punkt 1–4 körs mot den riktiga `localStorage`, inte mot en attrapp:
`src/lastKnown.test.ts` och `src/session.test.ts`.

## Vad som aldrig sparas

Lösenord, sessionstoken och e-postadress. Sessionen är en cookie som servern
äger; klienten har ingen kopia av den.
