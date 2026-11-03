# Nivå Duell

Ett fristående FPS-test för Mac, med enkel grafik, Vandal-demo och kunskapsdueller på samma lokala nätverk. Inget konto eller köp behövs.

## Ladda ner och testa

Öppna **[GitHub Releases](https://github.com/allbinbjurstrom/niva-duell/releases)** och välj filen för din dator under **Assets**. Du behöver inte ladda ner källkoden eller installera Node.

| Dator | Fil |
| --- | --- |
| Mac med Apple-chip, M1 eller senare | `Niva-Duell-0.2.4-Mac-arm64.zip` |
| Mac med Intel | `Niva-Duell-0.2.4-Mac-x64.zip` |

På Mac packar du upp ZIP-filen, drar **Niva Duell.app** till **Program** och öppnar den därifrån. Detta är en testrelease utan köpta utgivarcertifikat: macOS kan kräva **Systeminställningar → Integritet och säkerhet → Öppna ändå** vid första öppningen. Kontrollera att filen kommer från repot ovan.

Välj **Vandal-demo** för att börja direkt. Du får Vandal, 25/50 skott och full rustning. **Mål** ger en stillastående eller rörlig träningsfigur; **Tavla 10 m** är en fri skjutbana. **Återställ** fyller på och börjar om. För enkla frågetester väljer du **Testa själv**: fem platshållarfrågor med *Fel alternativ*, *Fel alternativ* och *Rätt alternativ*.

## Spela med vänner på samma Wi-Fi

1. Installera samma version på varje dator. Apple-chip och Intel kan spela tillsammans.
2. Värden väljer **Skapa party** och ett delprov. Vännerna väljer **Anslut till party** och partyt i listan.
3. Om partyt inte hittas: använd värdens lokala IP-adress, port och tre bokstäver långa partykod från samlingsplatsen.

Tillåt appen på det privata nätverket när datorns brandvägg eller nätverksdialog frågar. Värden håller appen öppen under hela spelet. Gästnätverk med klientisolering kan hindra anslutningen.

Den här versionen har **ensamtest och LAN-spel**. Den innehåller ingen internetserver eller inbjudan som fungerar mellan olika nätverk.

## Kontroller

| Kontroll | Handling |
| --- | --- |
| W A S D | Rörelse |
| Mus | Sikta |
| Vänster musknapp | Skjut, håll för automateld |
| Höger musknapp | ADS, kikarsikte eller alternativ attack |
| Shift | Gå långsammare och tyst |
| Ctrl | Huka |
| Mellanslag | Hoppa |
| R | Ladda om |
| Y | Inspektera Vandal |
| 1 / 2 / 3 | Gevär / pistol / kniv |
| F8 | Starta eller stoppa ett lokalt provklipp i demon |
| Esc | Släpp musen |

Kugghjulet öppnar DPI, känslighet, ADS, kikarsikte och hårkors. DPI-fältet ändrar inte själva musen. Demon visar rörelseläge och faktisk simulerad hastighet. Vandal springer 5,4 m/s, Shift går 3,24 m/s och huk går 1,755 m/s. Markrörelse startar och stannar direkt utan easing.

**Spara prov** skriver en WebM-fil i **Hämtade filer**. Klippet innehåller spelgrafik och spelljud, högst 30 sekunder. Det använder inte mikrofon eller skrivbordsinspelning. HUD och hårkors ingår inte i klippet. Inspelningen är ett visuellt hjälpmedel; den mäter inte exakt animationstid, FPS eller inmatningslatens.

## Bygg själv

Node 24 eller senare behövs endast för utveckling:

```sh
npm ci
npm test
npm run dev
```

`npm run mac:package` bygger Mac-arkiven på en Mac. Bygget hämtar de offentliga originalproven från Studera.nu och verifierar deras SHA-256; en redan verifierad lokal fil återanvänds. Repo och bygge är fristående från andra Nivå-appar.

GitHub Actions testar, bygger och kontrollerar paketen på Mac. En tagg `vX.Y.Z` som matchar `package.json` ger ett **utkast** till testrelease med installationsfiler och `SHA256SUMS.txt`. Utkastet publiceras efter genomgång av resultaten. Installerade appar uppdaterar sig inte automatiskt i denna version; nya versioner hämtas från Releases.

## Om prototypen

Arenan, figurerna, vapenmodellerna, animationerna och ljuden är egna förenklade tillgångar. FPS-känslan är inspirerad av Valorant, men detta är inte Riot Games spel eller en verifierad kopia av deras motor. 5v5, Spike och agentförmågor ingår inte. Mekanikreferenser finns i [dokumentationen](docs/valorant-mechanics.md).

Vanliga partyn använder källreferenser till offentligt publicerade högskoleprov. Originalkälla och sidnummer visas i spelet; facit rättas på värdens server. Solots platshållare är separat markerade testfrågor. Partyn lagras i värdens minne och avslutas när värdens app stängs. Nivås vanliga träningshistorik används inte.

Tredjepartslicenser finns i [THIRD-PARTY-NOTICES](public/THIRD-PARTY-NOTICES.txt). Prototypens egen kod är inte upplåten under någon öppen källkodslicens.
