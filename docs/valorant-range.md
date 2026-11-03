# Vandal-demons separata övningar, varv 3

`client/training-range.ts` ger två åtskilda grupper med enkel originaldekor i Nivås sand-, petrol- och terrakottapalett. Spraytavlan flyttas från den gamla botbanan till en egen fri 10-metersbana. Botövningen har kvar en egen 8-metersstartlinje. Bara ett övningsläges markeringar visas åt gången.

## Integration

```ts
import {buildTrainingRange} from './training-range';
import {DEMO_WALL} from '../shared/training-layout.mjs';

const trainingRange=buildTrainingRange(scene);
trainingRange.group.visible=state?.party.demoMode==='vandal';
trainingRange.setMode(state?.party.demoDrill==='wall'?'wall':'target');
// Servern kan använda DEMO_WALL.spawn för sprayövningen.
// Vid scenens teardown:
trainingRange.dispose();
```

Buildern lägger själv till `vandal-training-range` i scenen. Yttre gruppen börjar dold; `target` är det valda underläget tills `setMode` anropas. `setMode('target'|'wall')` växlar endast undergruppernas synlighet. `dispose()` är idempotent och frigör modulens geometrier, material och texturer. Ingen animation, spelarnätverkslogik, fysik eller frågelogik läggs till.

`shared/training-layout.mjs` exporterar en fryst gemensam layout:

```js
DEMO_WALL={x:24,z:0,width:6,height:3,bottom:.4,distance:10,
  spawn:{x:14,z:0,yaw:-Math.PI/2}}
```

## Sprayläge, `wall`

- Östra väggens insida ligger vid **x=24**. Tavlans plan ligger vid **x=23,998**, med normal mot **−X**. Befintliga väggträffar vid **x=23,994** ligger därför framför tavlan, sett från skytten.
- Tavlan är **6 m längs Z × 3 m hög**, centrerad vid **(23,998; 1,9; 0)**. Den täcker **z=−3 till 3**, från **y=0,4 till 3,4**.
- Rutnätet har **0,5 m** mellan linjerna. Tre koncentriska cirklar har radier **0,25 / 0,5 / 0,75 m**. Detta är fasta referenser för träffspridning, inte ett poängsystem.
- Startlinjen ligger vid **x=14, z=0**, med **10 m** till väggens kollisionsyta. Texten säger uttryckligen **från startlinjen**. Den är inte en dynamisk avståndsmätare; renderplanets offset på 2 mm ändrar inte referensen till väggen.
- Sidomarkeringar ligger utanför tavlans bredd vid **z=−3,45**. Den rektangulära banan mellan **x=14 och 24**, **z=−3 och 3** har inga inre `MAP.blocks`. Den östra gränsväggen är den enda slutytan. Botens synlighet och serverträffbarhet styrs av scen-/serverintegrationen.

## Målläge, `target`

- En separat liten startmarkering ligger kvar vid **(−4, −9)** och botens grundlinje vid **(4, −9)**.
- Referensen **8 m** avser avståndet längs X mellan dessa fasta linjer. Den följer inte en bot som rör sig i sidled och är inte avståndet från spelarens nuvarande position.
- Spraytavla och alla 10-metersmarkeringar är dolda i målläget. Botmarkeringarna är dolda i sprayläget.

## Fysik, dekor och verifiering

All tillagd geometri är plana dekaler framför befintlig vägg eller ovanför befintligt golv. Alla meshars `raycast` är avstängd. Ingen ny collider, serverträffyta eller ändring av `MAP` införs. Kulmärken och återställning ägs fortfarande av `ArenaScene`.

Den befintliga östliga väggdekoren behöver fortfarande hanteras av scenintegrationen: pelare sticker in till **x=23,85**, bland annat vid **z=−2**, och sockeln når **x=23,95** upp till **y=0,65**. Dessa visuella ytor kan skymma/flimra mot tavlan trots att de inte finns i fysiken. Tavlans x-position får inte flyttas framför kulmärkena för att dölja problemet. Denna modul ändrar inte annan scengeometri.

Verifieringen av fri sikt använder spelets verkliga `wallDistance`, `MAP.blocks` och stående/hukad ögonhöjd. Ett rutnät med 13 kolumner × 7 höjder täcker hela den nya tavlan inklusive dess kanter. För varje punkt kontrolleras att första fysiska träffen är den östra gränsväggen vid **x=24**, utan tidigare hinder. Ytterligare ögonpositioner i sidled kontrollerar att även kanten av startlinjen har fri sikt. Det är en kollisionskontroll; ett visuellt UI-prov behövs för att bedöma dekor, textläsbarhet och faktisk bildpresentation.

**Utfall:** **546/546** siktlinjer fria: 91 punkter × två ögonhöjder × tre Z-lägen (**−3, 0, +3**) på den nya startlinjen. Den rektangulära banan har **0** inre kollisionsblock. Samma prov mot gamla tavlan från **(−4; 1,62; −9)** reproducerade exakt **35/91** blockerade punkter. `tsc --noEmit` passerade. En separat kontroll av den verkliga Three.js-gruppen med simulerad canvas verifierade exklusiv lägessynlighet, delade koordinater, normal mot −X, 10-metersreferens, avstängd raycast och att samtliga **28** grafikresurser frigjordes exakt en gång.

## Förslag inför varv 4: läsbar humanoid

Detta är ett förslag; ingen figurkod har ändrats här.

- Bygg en liten poserbar figur med separata huvud-, bröst-, höft-, lår- och underbensgrupper. Behåll actorrotens skala **(1,1,1)**. Huk görs genom flyttade leder, böjda ben och sänkt bröst/huvud, inte genom att skala ner hela figuren.
- Behåll huvudets storlek mellan ställningarna. Nuvarande serverhuvud upptar de översta **0,36 m** av kroppens ställningshöjd: stående **1,44–1,80 m**, hukat **0,86–1,22 m**. En huvudmesh med fast **0,36 m** höjd och centrum vid **stance.height−0,18 m** följer den definitionen i båda lägena. Horisontellt ska huvudets synliga silhuett rymmas inom servervolymens **±0,26 m**; en ny form får inte framstå som en större träffyta än den är.
- Använd en mörk, enkel hjälmkant/nacke som ramar in ett varmt ljust ansikte. Håll själva ansiktet tydligt från visir, gevär och bröstplatta. Det ger både en mörk kant mot ljus sten/himmel och en ljus inre yta mot petrolfärgade bakgrunder, utan att byta artstyle eller lägga till ett nytt glow-system.
- Låt axlar, armbågar och knän skapa en mänsklig silhuett. Två ben som böjer sig vid huk läser som en ställningsändring; en vertikalt ihoptryckt kropp läser som en mindre figur. Huvudet ska ligga stilla relativt siktespunkten när stående target står stilla; gångfas kan driva ben och en liten axelrörelse vid sidledsrörelse.
- Bedöm stilla huvud/kropp på **8 m** mot ljus vägg, mörk låda och himmel; bedöm sedan huk och sidledsrörelse i en sammanhängande sekvens. Kontrollera modellens huvudgränser mot `hitBody`, så att synlig form och träffklassning hålls isär och verifieras.
