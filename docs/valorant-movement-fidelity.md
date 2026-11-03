# Rörelse och kamera: jämförelse och första förbättringsvarvet

Kontrollerat 2026-11-03. Detta är en fokuserad kod-/källgranskning, inte ett genomfört test inne i Valorant.

| Del | Referens och nuvarande beteende | Åtgärd / gräns |
| --- | --- | --- |
| Start/stopp | Valorant har en kort acceleration/friktion; användaren har uttryckligen valt direkt markstart/stopp utan ease. | Bevaras. Ingen dold återinförd acceleration. |
| Löpning och gång | Nuvarande 6,75 m/s med kniv, 5,40 med gevär, 5,7375 med Classic/Ghost/Spectre, 5,13 med Operator. Shift-faktor 0,60. | Tidigare [hastighetskontroll](valorant-speed-check.md) skiljer data, härledning och egen kalibrering. |
| Fotsteg | Scene-koden testade bara fart över 3 m/s. Det gjorde Shift-gång på 3,24 eller 4,05 m/s hörbar efter senaste hastighetsrättningen. | Ny helper använder uttryckliga gång-/hukflaggor. Äldre poser utan gångflagga får vapenrelativ hastighetsinferens. Väggstopp, luft och död ger inga gångsteg. |
| Steg och animation | Benen och fotstegen använde var sin tidsfrekvens utan att följa verklig sträcka. | Avståndsbaserad gait-fas ger samma kontakter vid olika render-FPS och kan delas av ljud, ben och vapengång. Kontaktavståndet är kosmetisk kalibrering, inte ett publicerat Riot-värde. |
| Hukning | Träffhöjd 1,22 m, men render skalar en 1,80-m-modell med 0,70 till 1,26 m. | Gemensamma stancedimensioner ger skalan 1,22 / 1,80 och samma ögonhöjd. Det är intern render-/träffkonsistens; måtten är inte påstått exakta Valorant-mått. |
| Hopp | Nuvarande gravitation 18 m/s² och impuls 6,5 m/s ger topp cirka 1,174 m och lufttid cirka 0,722 s. | En ursprunglig mätning från 2022 redovisar cirka 1,20 m och gravitation 21. Den räcker inte till en aktuell Riot-specifikation, så parametrarna ändras inte spekulativt i detta varv. |
| Landning | Binärt precisionsstraff 225 ms och 7° är redan modellerat. | Riot 1.09 är direkt stöd för dessa egenskaper, inte för hela hoppbanan. |
| Kamera/input | Direkt musvinkel, optisk zoom och ett fast fysiskt rendersteg. | 11.06 bekräftar att Riot alltid aktiverar RawInputBuffer. Webbläsarens raw pointer lock är en annan implementation och har OS-fallback. |

## Nya rena API:er

`shared/movement.mjs` importerar inga spelregler och skapar därför ingen cirkelimport.

- `stanceDimensions(crouched, rules)` → `{height, eye, visualScale}`. `rules.crouchHeight` kan sättas till befintliga 1,22.
- `isAudibleGroundMotion(body, weapon, {walk?, crouch?, active?, walkSpeed?})` → bool. `options.walk` vinner, därefter explicit `body.walk`; endast äldre poser använder fartinferens.
- `createGaitState()` / `resetGait(state, body)` skapar eller återställer en kosmetisk gångfas vid ny runda/omsynkning.
- `advanceGait(state, body, weapon, options)` → `{phase, distance, intensity, audible, step, steps, foot}`. Faktisk horisontell vägsträcka styr fasen. Luftsträcka och stora teleportsteg läggs inte till.

Root kopplar in hjälpen i `scene.ts` och vid behov `hitBody`, samt publicerar faktiska gångflaggor i kroppshistoriken. Denna modul ändrar inga ack-, epoch- eller triggerfält och rör inte serverns rörelsetidslinje.

## Källor och vad de stödjer

- [Riot Support: Walking, Running, and Crouching](https://support.riotgames.com/en-us/valorant/gameplay/walking-running-and-crouching): gång-/huklägen, Shift och att löpning hörs medan smyglägen används för att gå tyst. Publicerar inte exakta meter/sekund.
- [Riot 1.09](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-1-09/): binärt landningsfel, 225 ms, 7° och Operators 72-procentiga scoped-rörelse.
- [Riot 11.06](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-11-06/): RawInputBuffer är alltid på i spelet.
- [Ursprunglig fysikmätning, Stark002002](https://www.reddit.com/r/VALORANT/comments/utc7qf/valorant_physics_derived/): mätmetod och uppskattade hopp-/accelerationsvärden, daterade 2022. Oberoende mätning, inte officiell aktuell specifikation.
- [vrfkit:s ursprungliga replayanalys](https://github.com/yakisoba0728/vrfkit/blob/main/docs/DATA.md): observerade rörelsehastigheter i replaydata, inte full publicerad kontroll-/animationskod.
