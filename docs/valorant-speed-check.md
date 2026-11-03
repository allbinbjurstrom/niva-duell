# Hastighetskontroll, Nivå Duell 0.1.5

Kontrollerad 2026-11-03. Utan förmågor, skador, ADS eller kollision.

| Utrustat vapen | Löpning i m/s | Shift-gång i appen, m/s | 10 m löpning | 10 m gång |
| --- | ---: | ---: | ---: | ---: |
| Vandal, Phantom, Guardian, Sheriff | 5,40 | 3,24 | 1,85 s | 3,09 s |
| Classic, Ghost, Spectre | 5,7375 | 3,4425 | 1,74 s | 2,90 s |
| Operator | 5,13 | 3,078 | 1,95 s | 3,25 s |
| Kniv | 6,75 | 4,05 | 1,48 s | 2,47 s |

Löpningens vapenfaktorer 0,80/0,85/0,76 återfinns i [speldata-API:t](https://valorant-api.com/v1/weapons). [valorant.gs](https://valorant.gs/about/) beskriver sin ursprungliga extraktion ur build 13.09.00.5777412, 2026-10-28. Detta är oberoende dataextraktioner, inte en publicerad fysikspecifikation från Riot.

[vrfkit:s ursprungliga replaymätningar](https://github.com/yakisoba0728/vrfkit/blob/main/docs/DATA.md) redovisar 675/573,75/540/513 cm/s och gång 324 cm/s. Gevärens 3,24 / 5,40 ger faktorn **0,60**. Appen använder den konsekvent för alla sina vapen; det är en slutsats från referenserna, inte en separat direktmätning av varje vapens Shift-gång i Valorant. Tidigare 0,50 gav bara 2,70 m/s med gevär, alltså 16,7 % under målet. Rättningen gör den gången 20 % snabbare.

128-Hz-fysiken integrerades i en fri tiometerskorridor för varje vapen. En sekunds förflyttning matchar tabellen; första simuleringssteget som passerar tio meter ligger inom 7,8125 ms från beräknad tid. Framåt, bakåt, sidled och diagonal kontrollerades. Mätvärden finns i [JSON-rapporten](valorant-speed-check.json). Dessa är kodmätningar, skilda från UI-testet på Macen.

Gångens spridningsklassning använder nu samma 0,60-faktor, även vid träffbromsning, så den snabbare gången inte felaktigt blir springspridning. Crouch-faktorn 0,325 är fortsatt kalibrerad och har inte verifierats exakt för varje vapen. ADS använder vapnets separat angivna faktor. Direkt start och stopp följer användarens uttryckliga önskemål; detta verifierar toppfart, inte att Valorants hela acceleration och friktion är kopierade.

Ett riktigt jämförande rörelsetest inne i Valorant återstår.
