import { readFile } from 'node:fs/promises';

const branch='seal-render-previews', maxBytes=1_000_000;
const required=name=>{const value=process.env[name];if(!value)throw new Error('Missing environment variable: '+name);return value;};
const repository=required('GITHUB_REPOSITORY'), sourceSha=required('GITHUB_SHA'), runId=required('GITHUB_RUN_ID'), token=required('GITHUB_TOKEN');
if(!/^[\w.-]+\/[\w.-]+$/.test(repository)||!/^[a-f0-9]{40}$/i.test(sourceSha)||!/^\d+$/.test(runId))throw new Error('Invalid capture metadata');
async function api(path,{method='GET',body,optional=false}={}){
  const response=await fetch('https://api.github.com/repos/'+repository+path,{
    method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  if(optional&&response.status===404)return null;
  if(!response.ok)throw new Error('GitHub API '+method+' '+path+': HTTP '+response.status);
  return response.json();
}
const report=JSON.parse(await readFile('artifacts-smoke/report.json','utf8'));
if(!['passed','failed'].includes(report.status))throw new Error('Capture report status is required');
const files=[{path:'report.json',content:JSON.stringify({...report,sourceSha,runId})+'\n'}];
for(const [name,filename] of [['desktop','desktop-high-exploration.jpg'],['tactile','touch-landscape-low-exploration.jpg'],['care','desktop-high-care.jpg']]){
  let image,phase=filename.includes('-care.jpg')?'care':'exploration';
  try{image=await readFile('artifacts-smoke/'+filename);}
  catch(error){
    if(error.code!=='ENOENT')throw error;
    try{image=await readFile('artifacts-smoke/'+filename.replace('-exploration.jpg','-failure.jpg'));phase='failure';}
    catch(fallbackError){if(fallbackError.code==='ENOENT')continue;throw fallbackError;}
  }
  if(image.length<3||image[0]!==0xff||image[1]!==0xd8)throw new Error('Invalid JPEG: '+filename);
  const content=JSON.stringify({sourceSha,runId,status:report.cases.find(c=>c.name===(name==='tactile'?'touch-landscape-low':'desktop-high'))?.status??report.status,runStatus:report.status,phase,imageBase64:image.toString('base64'),mimeType:'image/jpeg'})+'\n';
  if(Buffer.byteLength(content)>maxBytes)throw new Error('Capture exceeds 1 MB');
  files.push({path:name+'.json',content});
}
if(!files.length)console.log('No exploration captures present.');
else{
  const reference=await api('/git/ref/heads/'+branch,{optional:true}),parentSha=reference?.object.sha??sourceSha;
  const parent=await api('/git/commits/'+parentSha),tree=[];
  for(const file of files){
    const blob=await api('/git/blobs',{method:'POST',body:{content:file.content,encoding:'utf-8'}});
    tree.push({path:file.path,mode:'100644',type:'blob',sha:blob.sha});
  }
  if(reference){
    const previous=await api('/git/trees/'+parent.tree.sha),present=new Set(files.map(f=>f.path));
    for(const e of previous.tree)if(['desktop.json','tactile.json','care.json'].includes(e.path)&&!present.has(e.path))tree.push({path:e.path,mode:'100644',type:'blob',sha:null});
  }
  const nextTree=await api('/git/trees',{method:'POST',body:{...(reference?{base_tree:parent.tree.sha}:{}),tree}});
  const commit=await api('/git/commits',{method:'POST',body:{message:'Render previews: '+sourceSha.slice(0,12)+' ('+report.status+')',tree:nextTree.sha,parents:[parentSha]}});
  await api(reference?'/git/refs/heads/'+branch:'/git/refs',{method:reference?'PATCH':'POST',body:reference?{sha:commit.sha,force:false}:{ref:'refs/heads/'+branch,sha:commit.sha}});
  console.log('Published '+files.length+' actual browser previews; status='+report.status);
}
