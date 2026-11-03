# Delad figur- och gångpose

`shared/agent-pose.mjs` är den gemensamma källan för figurens synliga, skadbara kroppsdelar. `agentParts(crouch,rules)` ger en neutral stå-/hukpose. `agentPartsForBody(body,rules)` lägger till en liten gångpose och är ingången för både `makePracticeAgent.update` och serverns `hitAgent`.

Varje del har `id`, `zone`, `size:[x,y,z]`, `position:[x,y,z]` och `color`. Det är axelräta lokala boxar med framåt **−Z**. Hela aktören får sedan samma worldposition och yaw i vy och träffberäkning. Ingen extra osynlig helkroppsvolym används, och det finns ett verkligt tomrum mellan benen. Vapen monteras separat i `weaponAnchor` och ingår inte i listan.

Huvudet är alltid **0,36 × 0,36 × 0,32 m**, med centrum vid `stance.height−0.18`. Huk flyttar huvud och kroppsdelar utan att skala aktörroten eller krympa huvudet. Huvudets box är helt opak. En målad varm ansiktsyta och mörk hjälmkant ger visuell inramning utan att dölja skadegeometrin i en sfär eller en transparent kontur.

## Gång

Gångposen använder bara `body.gaitPhase`, `vx`, `vz`, `grounded`, `crouch` och eventuell `health`. `gaitPhase` kommer från fysikens faktiska markförflyttning och följer med genom rörelsehistorik och presentation. Den är kumulativ och ska interpoleras som ett tal, utan att vikas tillbaka vid 2π. `options.phase` i vyn får inte ersätta den delade fasen.

Vid giltig markrörelse över 0,01 m/s blir intensiteten `min(1,speed/5.4)`, med ytterligare faktor **0,65** vid huk. Vänster/höger ben får motsatt `sin(gaitPhase)`. Endast lår, skenben och stövlar flyttas längs Y/Z; storlekar, X-positioner, överkropp och huvud förblir oförändrade. Maximal offset vid full stående intensitet:

| Del | Z, åt vardera håll | Y, bara lyft |
| --- | ---: | ---: |
| Lår | 0,025 m | 0,008 m |
| Skenben | 0,050 m | 0,020 m |
| Stövel | 0,070 m | 0,035 m |

Stilla, luftburen, död eller ofullständig/ogiltig rörelsedata ger exakt neutral pose. Ingen lokal animationsklocka driver skadegeometri. Dessa små rörelser är Nivås valda presentation, inte uppmätta Valorant-animationer.

## Verifiering

- Fyra semantiska tester i `tests/agent-pose.test.mjs` täcker neutralitet vid stilla/luft/död/legacy, motsatta steg, oförändrat huvud och överkropp, fartberoende begränsning, golv och mellanbensgap samt determinism och skydd mot mutation.
- En separat kontroll av den faktiska `makePracticeAgent`-gruppen jämförde **8 192** meshstorlekar och positioner mot den gemensamma posen: båda ställningarna, mark/luft, fyra farter och 32 faser. Rörelsen återanvände exakt **11** geometrier; **24** egna grafikresurser frigjordes exakt en gång.
- TypeScript-kontrollen `tsc --noEmit` passerade efter integrationen av gångposen. Gunplay-agentens tester jämför själva rayintersektionen mot oberoende Three.js-trianglar.

Visuell bedömning av figurens läsbarhet och faktisk upplevd gång kräver fortsatt observation i appen. Numerisk render-/träfföverensstämmelse visar inte i sig att animationen liknar Valorant.
