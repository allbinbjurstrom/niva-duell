# Vandalprofil, förbättringsvarv 1

Kontrollerad 2026-11-03. Profilen ändrar enbart Vandal vid integration. Övriga vapen, eldtaktsgränser, serverslump och träffvalidering behålls.

## Evidens

[Originalextraktorns Vandal-sida](https://valorant.gs/weapons/vandal/) och [rådata-API](https://valorant.gs/api/v1/weapons/) visar numeriska kurvnycklar från build 13.09.00.5777412. Stationär spridning startar på 0,25° och sista exporterade nyckeln är 1,0°. ADS använder ×1,15−0,13; hukning ×0,85. Rekylkurvorna har en tidig stigning och senare platå.

[Riot 11.08](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-11-08/) stödjer sex skyddade Vandal-skott, 0,6 s sidbytesintervall och 10 % chans. Skydd gäller sidbyte; det tar inte bort grundrekyl.

[Riot 6.11](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-6-11/) anger ×1,8 vertikal rekyl under löpning och 50 reservskott. [Riot 9.10](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-9-10/) anger rifle walk/run 3/6. Dess 0,5 för hukad rörelse gäller pistoler. Vandalens exporterade hukkruva når 0,8.

Den exporterade gångkurvan har 3 vid fartkvot 0,275 och 5 vid 0,601. Att direkt använda den som +5° vid Shift skulle gå längre än vad Riot-patchens beskrivning ensamt stöder. Flaggornas och fartkvotens fulla evaluering är inte verifierad: behåll tills vidare walkError 3 som uttrycklig approximation. Jump/airborne 10° finns i sekundärwiki, men återfanns inte i den här primära exportens rörelsekurvor; 7→10 är därför inte verifierat av detta arbete.

## Vad vår nya kod gör

- `sampleVandalCurve(name,x)` samplar originalnycklar linjärt och håller ändvärden. Interpolation och extrapolation är våra val.
- `vandalSpreadDegrees(shotsAlreadyFired,{ads,crouch})` ger stationär spridning. Rörelse- och landningsfel adderas av befintlig serverkod. Första ADS-skottet blir 0,1575°, inte 0,175° från den tidigare enkla ×0,7-faktorn.
- `vandalRecoilDegrees(count,flags)` ger absolut pitch, osignerad yaw-gräns och en kalibrerad yaw-förflyttning per skott. Servern väljer sida. Förflytta yaw mot gränsen; sätt inte direkt ±hela gränsen vid sidbyte.
- `recoverVandalRecoil(pitchRad,yawRad,idleSeconds,dt)` anropas varje tick. Normal automateld håller sin rekyl; efter en paus når offset exakt noll senast vid 0,375 s och `recovered` återställer shotCount/side. Tidsmodellen med 0,125 s hållfas och därefter linjär återgång är egen kalibrering.

Kurvornas x mappas till skottantal och deras y till absoluta vinklar i denna prototyp. Det är en praktisk modell, inte en rekonstruktion av Riots stabilitetsmotor. Exportens `tapEfficiency=6` är **inte** sex perfekt precisa kulor. Recoil-rate-värden och error-decay-nycklar är därför inte insatta som påhittade skottformler.

Rekommenderad kamerafaktor: hip 0,35 och ADS 1,0. Hip-värdet är kalibrerat: kameran får en mindre synlig punch medan en del av sprayen klättrar över korset. ADS följer hela rekylen. Kamera och server ska använda samma offset en gång; rotera inte den inskickade basvinkeln en extra gång.

Tester kontrollerar källankare, modifierare, platå, automateldsintervall, återhämtning över flera tickfrekvenser och icke-finita indata. De bevisar inte en identisk känsla i ett verkligt Valorant-test.
