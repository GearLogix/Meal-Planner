import fs from 'node:fs';
const dir = process.argv[2];
const recs = [
 {c:"SA-01",t:"Lemon-Dill Sous Vide Salmon with Orange-Fennel Salad",p:"Salmon",m:"Sous vide",tm:70,am:25,rg:"1–2 hr",tt:"1 hr 10 min",d:"Nordic-inspired salmon with a 5\" \"quoted\" test and `backtick` and back\\slash.",mac:[3265,246,192,36,126],
  ing:[{i:"Skinless salmon fillets",a:"2¼ lb (4 fillets)",q:["skinless salmon fillets"],off:false,h:false},{i:"Fresh lemon juice",a:"3 tbsp",q:["lemons"],off:false,h:true},{i:"Salt and pepper",a:"to taste",q:[],off:true,h:false}],
  st:[["Start the bath and oven","Set sous vide to 124°F and heat the oven to 425°F."],["Bag and cook the salmon","Season and seal. Cook 40 minutes."],["Roast","Roast 12–15 minutes more."],["Serve","Plate it."]],sd:["Rye crispbread — a crunchy cracker"],tip:"Sear 30 seconds per side — no longer.",soup:false},
 {c:"BF-07",t:"Beef Chili",p:"Beef",m:"Slow cooker",tm:300,am:20,rg:"4+ hr",tt:"5 hr",d:"Chili.",mac:[2800,240,180,30,70],ing:[{i:"Ground beef",a:"2 lb",q:["ground beef"],off:false,h:false}],st:[["Brown","Brown it."]],sd:[],tip:null,soup:true}
];
// Emulate a bundler: JSON text inside a template literal, with \ and ` escaped.
const body = JSON.stringify(recs).replace(/\\/g,'\\\\').replace(/`/g,'\\`');
fs.writeFileSync(`${dir}/assets/index-TEST.js`, `function x(){}var cn=JSON.parse(\`${body}\`),zz=1;`);
fs.writeFileSync(`${dir}/index.html`, `<html><head><script type="module" crossorigin src="/assets/index-TEST.js"></script></head></html>`);
fs.mkdirSync(`${dir}/api`, {recursive:true});
fs.writeFileSync(`${dir}/api/recipes`, JSON.stringify({recipes:[{c:"MY-01",t:"Air Fryer Egg Rolls",p:"Chicken",m:"Air fryer",tm:50,am:35,rg:"30–60 min",tt:"50 min",d:"Egg rolls.",mac:[3200,291,277,24,78],ing:[],st:[],sd:[],soup:false}]}));
