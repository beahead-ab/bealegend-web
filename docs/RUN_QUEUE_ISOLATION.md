# Träningskö: passgräns och återförsök

Denna delrättning isolerar versionskunskap per pass. En terminal 409 rensar
enbart kommandon för det avslutade passet. En kvittens eller konflikt som
namnger ett annat pass bekräftar inget; kommandot blir kvar. Skärmens valda
pass byts endast vid explicit start, inte av en gammal kökvittens/strömram.
Ordinaler från dagens pass används inte för ett annat köat pass.

401/403, 408, okänd409, 425, 429 och server-/transportfel behåller kommandot.
De innebär inte att användarens åtgärd är ogiltig. Kön stoppar och väntar på
befintliga återförsökssignaler (online, synlighet, nästa åtgärd); ingen timer
eller ny blind automatisk POST införs. Känt ogiltig400 och serverns bevis
för ett redan passerat moment/otillåten åtgärd behåller tidigare beteende.

Tre återkommande konflikter begränsar ett flush-varv, inte kommandots livstid.
Senaste ombaseringen sparas och samma command_id/occurred_at/payload används
vid nästa försök, även efter omladdning. UI visar väntande antal och ett
ärligt felmeddelande. Backendens command_id-idempotens måste fortsatt gälla.

## Uttryckligen kvar före hela paket B är klart

- Kontoägd beständig lagring, ägarlös äldre kö och migrationsbesked.
- Stoppa gamla pågående anrop vid logout/kontobyte och säkra API-retry mot
  sessionsbyte. Backendens behörighetsgrind ersätter inte klientisolering.
- Samtidiga flikar och flera köinstanser får inte skriva över varandras fil.
- Synligt fel när localStorage är fullt/blockerat och verkligt hållbar lagring.
- Stabil identitet vid återförsök av start-POST och alla start/livscykelrace.
- Motsvarande iOS-kö och fysisk/end-to-end-acceptans.

Detta är inte en levererad lösning för flera konton eller en godkänd
produktionskandidat. VERSION1.18.2 är patch; PR83 reserverar1.18.1 och båda
måste integreras mot färsk main med omkörda tester före eventuell leverans.
