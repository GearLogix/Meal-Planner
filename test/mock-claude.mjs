import http from 'node:http';
http.createServer((req, res) => {
  let b=''; req.on('data',c=>b+=c); req.on('end',()=>{
    const body = JSON.parse(b);
    if (req.headers['x-api-key'] !== 'sk-ant-test-1234') { res.writeHead(401,{'content-type':'application/json'}); return res.end(JSON.stringify({error:{message:'invalid x-api-key'}})); }
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({content:[{type:'tool_use',name:'save_recipe',input:{title:'Mock Egg White Scramble',protein:'Eggs',method:'Stovetop',meal_type:'Breakfast',servings:2,total_min:15,active_min:10,description:'Model '+body.model,kcal:700,protein_g:80,carbs_g:40,sat_fat_g:6,unsat_fat_g:14,ingredients:[{name:'Egg whites',amount:'2 cups',shopTerm:'egg whites'},{name:'Salt',amount:'to taste',pantry:true}],steps:[{title:'Cook',text:'Cook 5 minutes.'}],tip:'x'}}]}));
  });
}).listen(9998);
