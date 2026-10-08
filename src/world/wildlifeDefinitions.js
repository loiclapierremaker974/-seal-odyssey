const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const WILDLIFE_RACES=freeze({
 orquins:{id:'orquins',name:'Orquins',family:'Cétacés de résonance'},
 raelumes:{id:'raelumes',name:'Raélumes',family:'Raies lumineuses'},
 coralithes:{id:'coralithes',name:'Coralithes',family:'Créatures des récifs vivants'},
 azurides:{id:'azurides',name:'Azurides',family:'Tortues et amphibiens de nacre'},
 sylvecumes:{id:'sylvecumes',name:'Sylvécumes',family:'Créatures des brumes et des forêts'},
 constellins:{id:'constellins',name:'Constellins',family:'Petites créatures lumineuses'},
 racinaires:{id:'racinaires',name:'Racinaires',family:'Êtres des racines vivantes'},
 nacreens:{id:'nacreens',name:'Nacréens',family:'Orcs des récifs de nacre'},
});
export const WILDLIFE_SPECIES=freeze({
 orca:{id:'orca',raceId:'orquins',name:'Orque de Résonance',habitat:'water',size:4.7,battleSize:4.6,description:'Des marques lumineuses et une crête cristalline accompagnent la résonance de cette orque. Gardez vos distances lorsqu’un courant l’agite.'},
 manta:{id:'manta',raceId:'raelumes',name:'Raie-Lanterne',habitat:'water',size:3.2,battleSize:3.5,description:'Les ailes translucides de la raie éclairent les jardins marins. Ses spirales lumineuses suivent l’eau et se calment après l’apaisement.'},
 crab:{id:'crab',raceId:'coralithes',name:'Crabe-Récif',habitat:'land',size:1.45,battleSize:1.9,description:'Des cristaux marins et des branches de corail poussent sur la carapace du crabe. Ses pinces canalisent les remous de la rive.'},
 turtle:{id:'turtle',raceId:'azurides',name:'Tortue des Veines d’Azur',habitat:'water',size:1.55,battleSize:2.1,description:'La tortue nage lentement entre les plantes et laisse passer Luma.'},
 otter:{id:'otter',raceId:'sylvecumes',name:'Loutre aux Éclats de Lune',habitat:'land',size:1.5,battleSize:2.1,description:'La loutre se repose près de l’eau et observe Luma avec curiosité.'},
 fish:{id:'fish',raceId:'constellins',name:'Poisson-Constellation',habitat:'water',size:.65,battleSize:1.1,description:'Les poissons dorés s’écartent doucement de Luma, puis retrouvent leur banc.'},
 colossus:{id:'colossus',raceId:'coralithes',art:'land',name:'Colosse de Corail',habitat:'land',size:3.5,battleSize:3.5,description:'La roche, le corail et la mousse forment un colosse vivant. Sa démarche lente protège les sols anciens.'},
 boar:{id:'boar',raceId:'sylvecumes',art:'land',name:'Sanglier de Cristal',habitat:'land',size:2.25,battleSize:2.8,description:'Une crête cristalline suit le dos du sanglier. Ses charges sont précédées d’un éclat violet.'},
 deer:{id:'deer',raceId:'sylvecumes',art:'land',name:'Cerf des Brumes',habitat:'land',size:2.4,battleSize:2.8,description:'Les bois d’eau du cerf dessinent de légers filaments dans la brume. Il observe le voyageur à distance.'},
 salamander:{id:'salamander',raceId:'azurides',art:'land',name:'Salamandre de Nacre',habitat:'land',size:1.3,battleSize:1.9,description:'La peau de nacre de la salamandre brille parmi les plantes humides.'},
 forestTurtle:{id:'forestTurtle',raceId:'azurides',art:'land',name:'Tortue Sylvestre',habitat:'land',size:1.65,battleSize:2.2,description:'Un petit jardin pousse sur la carapace de cette tortue paisible.'},
 butterfly:{id:'butterfly',raceId:'constellins',art:'land',name:'Papillon-Lanterne',habitat:'land',size:.75,battleSize:1.3,description:'Les lanternes du papillon éclairent doucement les fleurs et les chemins.'},
 rootSerpent:{id:'rootSerpent',raceId:'racinaires',art:'land',name:'Serpent des Racines',habitat:'land',size:2,battleSize:2.7,description:'L’écorce et les feuilles s’entrelacent sur le corps de ce serpent végétal. Des courants agités peuvent troubler ses spirales.'},
 foamWolf:{id:'foamWolf',raceId:'sylvecumes',art:'land',name:'Loup d’Écume',habitat:'land',size:2.1,battleSize:2.7,description:'Sa crinière argentée évoque la mousse des vagues. Il écoute les mouvements du monde avant de s’approcher.'},
 landOrca:{id:'landOrca',raceId:'orquins',art:'mythic',name:'Orque des Rives',habitat:'land',size:4.2,battleSize:4.8,description:'La magie des rives donne à cette orque quatre puissantes nageoires d’appui. Sa crête canalise des ondes cristallines.'},
 nacreOrc:{id:'nacreOrc',raceId:'nacreens',art:'mythic',name:'Orc de Nacre',habitat:'land',size:2.65,battleSize:2.8,description:'La peau amphibie et les plaques de nacre de cet orc sont liées aux récifs vivants. Ses mains guident les rubans du courant.'},
});
export const WILDLIFE_FRAME_NAMES=Object.freeze(['orca-top','manta-top','crab-top','orca-side','manta-side','crab-side','turtle-top','otter-top','fish-top','turtle-side','otter-side','fish-side']);
export const LAND_WILDLIFE_FRAME_NAMES=Object.freeze(['colossus-top','boar-top','deer-top','salamander-top','colossus-side','boar-side','deer-side','salamander-side','forestTurtle-top','butterfly-top','rootSerpent-top','foamWolf-top','forestTurtle-side','butterfly-side','rootSerpent-side','foamWolf-side']);
export const MYTHIC_WILDLIFE_FRAME_NAMES=Object.freeze(['landOrca-top','nacreOrc-top','landOrca-side','nacreOrc-side']);
export const WILDLIFE_ATLASES=freeze({
 marine:{url:'assets/overworld/creatures.png',columns:3,rows:4,names:WILDLIFE_FRAME_NAMES},
 land:{url:'assets/overworld/creatures-land.png',columns:4,rows:4,names:LAND_WILDLIFE_FRAME_NAMES},
 mythic:{url:'assets/overworld/creatures-mythic.png',columns:2,rows:2,names:MYTHIC_WILDLIFE_FRAME_NAMES},
});
const landEncounter=(id,name,speciesId,arena,x,z,{tier='elite',resolve=96,attack=11,pattern=['gather','rush','pulse'],phases,labels=['Élan du récif','Onde terrestre','Souffle de résonance']}={})=>({
 id,name,tier,arena,position:{x,z},radius:tier==='boss'?1.65:1.4,
 description:name+' est troublé par une onde discordante. Observez ses intentions, protégez Luma et rétablissez le calme.',
 opponent:{name,speciesId,element:'current',maxResolve:resolve,attack,pattern,...(phases?{phases}:{}),intents:{rush:{label:labels[0]},pulse:{label:labels[1]},gather:{label:labels[2]}}},
 reward:{trust:tier==='boss'?4:2,restoration:2,label:name+' retrouve une résonance paisible.'}
});
export const WILD_ENCOUNTERS=freeze([
 {id:'aelys-crab-guardian',name:'Corvok — Crabe-Récif agité',tier:'elite',arena:'shore',position:{x:-7,z:-4},radius:1.5,
  description:'Un crabe retient la berge, troublé par une onde de la Fracture. Observez ses pinces, protégez Luma et apaisez-le.',
  opponent:{name:'Crabe-Récif',speciesId:'crab',element:'light',maxResolve:84,attack:10,pattern:['gather','rush','pulse'],
   intents:{rush:{label:'Pince de corail'},pulse:{label:'Gerbe de cristaux'},gather:{label:'Carapace en garde'}}},
  reward:{trust:2,restoration:1,label:'Le crabe retrouve son calme et la berge devient paisible.'}},
 {id:'murmurs-orca-current',name:'Vaelor — Orque de Résonance',tier:'boss',arena:'lagoon',position:{x:49,z:-2},radius:1.65,
  description:'Une orque désorientée soulève la lagune. Ses charges et son souffle annoncent ses mouvements. Le lien avec Luma peut rétablir le calme.',
  opponent:{name:'Orque de Résonance',speciesId:'orca',element:'current',maxResolve:144,attack:13,phases:[{threshold:1,label:'Résonance voilée',multiplier:1},{threshold:.5,label:'Déferlante cristalline',multiplier:1.15,pattern:['gather','pulse','rush','pulse']}],pattern:['rush','gather','pulse','rush'],
   intents:{rush:{label:'Charge de Résonance'},pulse:{label:'Onde cristalline'},gather:{label:'Souffle profond'}}},
  reward:{trust:4,restoration:2,label:'L’orque suit de nouveau le courant paisible.'}},
 {id:'ancient-manta-current',name:'Lyssara — Raie-Lanterne troublée',tier:'elite',arena:'ruins',position:{x:88,z:3},radius:1.4,
  description:'Une raie protège les jardins marins des ruines. Une onde discordante trouble sa nage. Accompagnez-la vers une eau plus douce.',
  opponent:{name:'Raie-Lanterne',speciesId:'manta',element:'water',maxResolve:98,attack:11,pattern:['pulse','gather','rush'],
   intents:{rush:{label:'Ruban de la raie'},pulse:{label:'Voile de lumière'},gather:{label:'Élan de la raie'}}},
  reward:{trust:3,restoration:2,label:'La raie plane calmement au-dessus des jardins.'}},
 landEncounter('aelys-land-orca','Rokhael — Orque des Rives','landOrca','shore',-10,3,{tier:'boss',resolve:132,attack:12,phases:[{threshold:1,label:'Appui des Rives',multiplier:1},{threshold:.5,label:'Crête en résonance',multiplier:1.12}],labels:['Charge des Marées','Déferlante terrestre','Éveil de la crête']}),
 landEncounter('ancient-coral-colossus','Thalrok — Colosse de Corail','colossus','ruins',73,-8,{tier:'boss',resolve:140,attack:12,phases:[{threshold:1,label:'Récif endormi',multiplier:1},{threshold:.5,label:'Corail éveillé',multiplier:1.12}],labels:['Pas du Colosse','Onde de pierre vivante','Le récif se rassemble']}),
 landEncounter('murmurs-crystal-boar','Varkel — Sanglier de Cristal','boar','shore',32,-4,{resolve:92,labels:['Charge cristalline','Éclat du sous-bois','Cristaux en éveil']}),
 landEncounter('aelys-root-serpent','Sylrune — Serpent des Racines','rootSerpent','shore',8,-8,{resolve:88,labels:['Spirale des racines','Souffle des feuilles','Enroulement ancien']}),
 landEncounter('ancient-foam-wolf','Lunéor — Loup d’Écume','foamWolf','ruins',87,-4,{resolve:100,labels:['Bond d’Écume','Voix des vagues','Écoute du courant']}),
 landEncounter('ancient-nacre-orc','Nakor — Orc de Nacre','nacreOrc','ruins',88,-8,{tier:'boss',resolve:150,attack:12,phases:[{threshold:1,label:'Nacre voilée',multiplier:1},{threshold:.6,label:'Rubans du récif',multiplier:1.08,pattern:['pulse','gather','rush']},{threshold:.3,label:'Onde de nacre',multiplier:1.15,pattern:['gather','rush','pulse']}],labels:['Paume de résonance','Rubans de Nacre','Appel des récifs']}),
]);
export const WILDLIFE_PLACEMENTS=freeze([
 {id:'aelys-crab',name:'Corvok',speciesId:'crab',islandId:'rivage',x:-7,z:-4,encounterId:'aelys-crab-guardian'},
 {id:'aelys-otter',name:'Aélune',speciesId:'otter',islandId:'rivage',x:-6,z:7},
 {id:'aelys-turtle',name:'Azuria',speciesId:'turtle',islandId:'rivage',x:6,z:-4},
 {id:'aelys-fish',name:'Doriel',speciesId:'fish',islandId:'rivage',x:7,z:-3},
 {id:'murmurs-orca',name:'Vaelor',speciesId:'orca',islandId:'lagune',x:49,z:-2,encounterId:'murmurs-orca-current'},
 {id:'murmurs-turtle',name:'Nacélie',speciesId:'turtle',islandId:'lagune',x:42,z:-6},
 {id:'murmurs-manta',name:'Raëlys',speciesId:'manta',islandId:'lagune',x:45,z:2},
 {id:'murmurs-fish-a',name:'Scintil',speciesId:'fish',islandId:'lagune',x:42,z:-4},
 {id:'murmurs-fish-b',name:'Orial',speciesId:'fish',islandId:'lagune',x:44,z:0},
 {id:'ancient-manta',name:'Lyssara',speciesId:'manta',islandId:'ruines',x:88,z:3,encounterId:'ancient-manta-current'},
 {id:'ancient-turtle',name:'Maréa',speciesId:'turtle',islandId:'ruines',x:88,z:4},
 {id:'ancient-otter',name:'Élyo',speciesId:'otter',islandId:'ruines',x:74,z:7},
 {id:'ancient-crab',name:'Coraline',speciesId:'crab',islandId:'ruines',x:89,z:7},
 {id:'aelys-land-orca',speciesId:'landOrca',islandId:'rivage',x:-10,z:3,encounterId:'aelys-land-orca',name:'Rokhael'},
 {id:'ancient-colossus',speciesId:'colossus',islandId:'ruines',x:73,z:-8,encounterId:'ancient-coral-colossus',name:'Thalrok'},
 {id:'murmurs-boar',speciesId:'boar',islandId:'lagune',x:32,z:-4,encounterId:'murmurs-crystal-boar',name:'Varkel'},
 {id:'aelys-serpent',speciesId:'rootSerpent',islandId:'rivage',x:8,z:-8,encounterId:'aelys-root-serpent',name:'Sylrune'},
 {id:'ancient-wolf',speciesId:'foamWolf',islandId:'ruines',x:87,z:-4,encounterId:'ancient-foam-wolf',name:'Lunéor'},
 {id:'ancient-orc',speciesId:'nacreOrc',islandId:'ruines',x:88,z:-8,encounterId:'ancient-nacre-orc',name:'Nakor'},
 {id:'aelys-deer',speciesId:'deer',islandId:'rivage',x:-7,z:-9,name:'Veyla'},
 {id:'aelys-salamander',speciesId:'salamander',islandId:'rivage',x:9,z:-5,name:'Nacri'},
 {id:'aelys-butterfly',speciesId:'butterfly',islandId:'rivage',x:-4,z:5,name:'Aurine'},
 {id:'murmurs-forest-turtle',speciesId:'forestTurtle',islandId:'lagune',x:32,z:5,name:'Mosséa'},
 {id:'murmurs-deer',speciesId:'deer',islandId:'lagune',x:31,z:-8,name:'Sylven'},
 {id:'ancient-butterfly',speciesId:'butterfly',islandId:'ruines',x:84,z:7,name:'Élyne'},
 {id:'ancient-friendly-orc',speciesId:'nacreOrc',islandId:'ruines',x:74,z:8,name:'Orynn'},
 {id:'aelys-friendly-wolf',speciesId:'foamWolf',islandId:'rivage',x:-4,z:-6,name:'Naëlo'},
]);

export function getWildlifeIdentity(animalId) {
 const animal=WILDLIFE_PLACEMENTS.find(value=>value.id===animalId);
 if(!animal)return null;
 const species=WILDLIFE_SPECIES[animal.speciesId];
 const race=WILDLIFE_RACES[species.raceId];
 return Object.freeze({id:animal.id,name:animal.name,raceId:race.id,raceName:race.name,speciesId:species.id,speciesName:species.name,habitat:species.habitat,islandId:animal.islandId,encounterId:animal.encounterId||null});
}
