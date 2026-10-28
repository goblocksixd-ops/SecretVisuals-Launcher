const {app,BrowserWindow,ipcMain,shell,dialog}=require('electron');
const path=require('node:path');const fs=require('node:fs');
const {Client}=require('minecraft-launcher-core');
const {Auth}=require('msmc');
let minecraftAuth=null; let gameProcess=null;
function createWindow(){const win=new BrowserWindow({width:759,height:455,minWidth:650,minHeight:400,resizable:true,frame:false,backgroundColor:'#080909',title:'SecretVisuals Launcher',autoHideMenuBar:true,menuBarVisible:false,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false}});win.loadFile(path.join(__dirname,'index.html'));}
app.whenReady().then(()=>{createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()})});app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
const mcDir=()=>path.join(app.getPath('appData'),'.minecraft');const modsDir=()=>path.join(mcDir(),'mods');const settingsPath=()=>path.join(app.getPath('userData'),'launcher-settings.json');const accountsPath=()=>path.join(app.getPath('userData'),'minecraft-accounts.json');const logPath=()=>path.join(app.getPath('userData'),'launcher.log');const installedPath=()=>path.join(app.getPath('userData'),'installed-mods.json');
function logEvent(message){try{fs.mkdirSync(path.dirname(logPath()),{recursive:true});fs.appendFileSync(logPath(),`[${new Date().toISOString()}] ${String(message).replace(/[\\r\\n]+/g,' ').slice(0,500)}\\n`,'utf8')}catch{}}
function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}}
function writeJson(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2),'utf8')}
function readSettings(){return readJson(settingsPath(),{ram:4096,autoUpdateMods:true,buildProfile:'custom'})}
function writeSettings(data){fs.mkdirSync(path.dirname(settingsPath()),{recursive:true});writeJson(settingsPath(),data);}

ipcMain.handle('minecraft:login', async () => {
  try {
    logEvent('Начат вход через Microsoft.');
    const authManager = new Auth('select_account');
    const xboxManager = await authManager.launch('electron');
    const token = await xboxManager.getMinecraft();
    if (!token || !token.mclc) throw new Error('Microsoft не вернул токен Minecraft. Проверь, что аккаунт владеет Minecraft Java Edition.');
    minecraftAuth = token.mclc();
    const account = { username: token.profile?.name || token.name || 'Minecraft player', uuid: token.profile?.id || token.id || '', addedAt: new Date().toISOString() };
    const profileFile = path.join(app.getPath('userData'),'minecraft-account.json');
    writeJson(profileFile, account);
    const accounts = readJson(accountsPath(), []);
    const merged = [account, ...accounts.filter(a => a.uuid !== account.uuid && a.username !== account.username)].slice(0,20);
    writeJson(accountsPath(), merged);
    logEvent('Вход Microsoft выполнен: '+account.username);
    return {ok:true, username: account.username};
  } catch (e) {
    logEvent('Ошибка входа Microsoft: '+(e.message||e));
    return {ok:false,error:'Не удалось выполнить вход Microsoft. Убедись, что используется аккаунт с Minecraft: Java Edition, и повтори попытку.'};
  }
});
ipcMain.handle('minecraft:account', () => {
  const account = readJson(path.join(app.getPath('userData'),'minecraft-account.json'), null);
  return account ? {loggedIn:true,username:account.username} : {loggedIn:false,username:''};
});
ipcMain.handle('minecraft:accounts', () => { const accounts=readJson(accountsPath(),[]); const active=readJson(path.join(app.getPath('userData'),'minecraft-account.json'),null); return {accounts:accounts.map(a=>({...a,active:!!active&&a.uuid===active.uuid}))}; });
ipcMain.handle('minecraft:remove-account', (_, id) => { const accounts=readJson(accountsPath(),[]).filter(a=>a.uuid!==id&&a.username!==id); writeJson(accountsPath(),accounts); logEvent('Удалён аккаунт из списка: '+String(id).slice(0,60)); return {ok:true}; });
ipcMain.handle('minecraft:launch', async (_, version) => {
  const allowed = ['1.16.5','1.21.4','1.21.11'];
  if (!allowed.includes(version)) return {ok:false,error:'Эта версия не поддерживается лаунчером.'};
  if (!minecraftAuth) return {ok:false,error:'Сначала нажми «Войти Microsoft».'};
  if (gameProcess && !gameProcess.killed) return {ok:false,error:'Minecraft уже запущен.'};
  try {
    const settings=readSettings();
    const root=mcDir();
    fs.mkdirSync(root,{recursive:true});
    const launcher=new Client();
    const visualMods = fs.existsSync(modsDir()) ? fs.readdirSync(modsDir()).filter(f=>/^secretvisuals.*\.jar$/i.test(f)) : [];
    if (!visualMods.length) logEvent('ВНИМАНИЕ: SecretVisuals mod JAR не найден в папке mods; запустится обычный Minecraft без визуалов SecretVisuals.');
    const javaMajor = version === '1.16.5' ? 8 : 21;
    logEvent(`Подготовка Minecraft ${version}; ОЗУ ${settings.ram} MB.`);
    gameProcess = launcher.launch({
      authorization: minecraftAuth,
      root,
      version: {number:version,type:'release'},
      memory: {max:`${Math.max(512,settings.ram)}M`,min:'512M'},
      javaPath: undefined,
      overrides: {gameDirectory: root}
    });
    gameProcess.on('data', data => logEvent('[Minecraft] '+String(data).trim().slice(0,350)));
    gameProcess.on('close', code => { logEvent(`Minecraft ${version} завершён с кодом ${code}`); gameProcess=null; });
    gameProcess.on('error', e => { logEvent('Ошибка процесса Minecraft: '+e.message); gameProcess=null; });
    return {ok:true,message:visualMods.length?`Запуск Minecraft ${version} начат. SecretVisuals JAR найден, но для загрузки модов требуется Fabric Loader.`:`Запуск Minecraft ${version} начат, но SecretVisuals JAR не найден — визуалы не будут работать. Сначала добавь совместимый SecretVisuals Fabric .jar в папку mods.`};
  } catch(e) {
    logEvent(`Ошибка запуска Minecraft ${version}: ${e.message||e}`);
    gameProcess=null;
    return {ok:false,error:'Не удалось запустить Minecraft. Проверь Java, интернет и журнал ошибок.'};
  }
});

ipcMain.handle('launcher:profile',()=>{const p=path.join(app.getPath('userData'),'profile.json');try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch{return{nickname:'fucoder',tier:'FREE',legitVisible:false}}});
ipcMain.handle('launcher:save-profile',(_,profile)=>{const allowed=['FREE','BASIC','PREMIUM'];const safe={nickname:String(profile?.nickname||'fucoder').slice(0,16),tier:allowed.includes(profile?.tier)?profile.tier:'FREE',legitVisible:false};fs.writeFileSync(path.join(app.getPath('userData'),'profile.json'),JSON.stringify(safe,null,2));return safe});
ipcMain.handle('launcher:get-ram',()=>readSettings().ram||4096);
ipcMain.handle('launcher:get-settings',()=>readSettings());
ipcMain.handle('launcher:save-setting',(_,key,value)=>{const allowed={autoUpdateMods:v=>typeof v==='boolean'};if(!allowed[key]||!allowed[key](value))return{ok:false};const settings=readSettings();settings[key]=value;writeSettings(settings);logEvent(`Настройка изменена: ${key}=${value}`);return{ok:true,settings}});
ipcMain.handle('launcher:get-logs',()=>{try{return fs.readFileSync(logPath(),'utf8').slice(-18000)||'Журнал пока пуст.'}catch{return'Журнал пока пуст.'}});
ipcMain.handle('launcher:copy-logs',()=>{const {clipboard}=require('electron');let content='';try{content=fs.readFileSync(logPath(),'utf8')}catch{}clipboard.writeText(content||'Журнал пока пуст.');return{ok:true}});
ipcMain.handle('launcher:log',(_,message)=>{logEvent(message);return{ok:true}});
ipcMain.handle('launcher:update-mods',async()=>{const tracked=readJson(installedPath(),[]);let updated=0,checked=0,errors=[];for(const item of tracked){try{checked++;const url='https://api.modrinth.com/v2/project/'+encodeURIComponent(item.projectId)+'/version?game_versions='+encodeURIComponent(JSON.stringify([item.gameVersion]))+'&loaders='+encodeURIComponent(JSON.stringify(['fabric']));const r=await fetch(url,{headers:{'User-Agent':'SecretVisualsLauncher/2.7'}});if(!r.ok)throw new Error('HTTP '+r.status);const versions=await r.json();const latest=versions.find(v=>v.files?.some(f=>f.filename.endsWith('.jar')));if(!latest)continue;const file=latest.files.find(f=>f.primary&&f.filename.endsWith('.jar'))||latest.files.find(f=>f.filename.endsWith('.jar'));if(!file||latest.version_number===item.version)continue;const response=await fetch(file.url,{headers:{'User-Agent':'SecretVisualsLauncher/2.7'}});if(!response.ok)throw new Error('скачивание HTTP '+response.status);const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length<100)throw new Error('файл слишком маленький');fs.mkdirSync(modsDir(),{recursive:true});const dest=path.join(modsDir(),path.basename(file.filename));fs.writeFileSync(dest,bytes);if(item.filename&&item.filename!==file.filename){const old=path.join(modsDir(),path.basename(item.filename));if(fs.existsSync(old)&&old!==dest)fs.unlinkSync(old)}item.filename=file.filename;item.version=latest.version_number;updated++;logEvent(`Обновлён мод ${item.projectId} до ${item.version}`)}catch(e){errors.push(`${item.projectId}: ${e.message}`);logEvent(`Ошибка обновления ${item.projectId}: ${e.message}`)}}writeJson(installedPath(),tracked);return{ok:errors.length===0,checked,updated,errors}});

ipcMain.handle('launcher:save-ram',(_,value)=>{const ram=Math.max(512,Math.min(15360,Math.round(Number(value)/512)*512));const settings=readSettings();settings.ram=ram;writeSettings(settings);return ram});
ipcMain.handle('launcher:open-mods-folder',async()=>{fs.mkdirSync(modsDir(),{recursive:true});const err=await shell.openPath(modsDir());return{ok:!err,error:err||'',path:modsDir()}});
ipcMain.handle('launcher:search-mods',async(_,query)=>{const q=String(query||'').trim().slice(0,100);if(!q)return{hits:[],error:'Введи название мода.'};const url='https://api.modrinth.com/v2/search?query='+encodeURIComponent(q)+'&facets='+encodeURIComponent(JSON.stringify([['project_type:mod']]))+'&limit=20';try{const r=await fetch(url,{headers:{'User-Agent':'SecretVisualsLauncher/2.4 (launcher app)'}});if(!r.ok)throw new Error('Modrinth API: '+r.status);const data=await r.json();return{hits:(data.hits||[]).map(x=>({id:x.project_id,title:x.title,description:x.description,icon:x.icon_url,downloads:x.downloads,slug:x.slug,source:'modrinth'}))}}catch(e){return{hits:[],error:'Не удалось загрузить каталог Modrinth. Проверь интернет и повтори попытку.'}}});
ipcMain.handle('launcher:install-mod',async(_,project)=>{try{if(!project||!/^[\w-]{2,80}$/.test(String(project.id||'')))throw new Error('Некорректный ID мода');const gameVersion=['1.16.5','1.21.4','1.21.11'].includes(project.gameVersion)?project.gameVersion:'1.21.4';const vurl='https://api.modrinth.com/v2/project/'+encodeURIComponent(project.id)+'/version?game_versions='+encodeURIComponent(JSON.stringify([gameVersion]))+'&loaders='+encodeURIComponent(JSON.stringify(['fabric']));const vr=await fetch(vurl,{headers:{'User-Agent':'SecretVisualsLauncher/2.4'}});if(!vr.ok)throw new Error('Не удалось получить версии');const versions=await vr.json();const version=versions.find(v=>v.files?.some(f=>f.primary&&f.filename.endsWith('.jar'))) || versions.find(v=>v.files?.some(f=>f.filename.endsWith('.jar')));if(!version)throw new Error('Не найдена Fabric-версия для поддерживаемых версий Minecraft');const file=version.files.find(f=>f.primary&&f.filename.endsWith('.jar'))||version.files.find(f=>f.filename.endsWith('.jar'));if(!file||!file.url)throw new Error('У мода нет доступного JAR-файла');fs.mkdirSync(modsDir(),{recursive:true});const safeName=path.basename(file.filename).replace(/[<>:"/\\|?*\x00-\x1F]/g,'_');const dest=path.join(modsDir(),safeName);const response=await fetch(file.url,{headers:{'User-Agent':'SecretVisualsLauncher/2.4'}});if(!response.ok)throw new Error('Скачивание не удалось: '+response.status);const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length<100)throw new Error('Файл мода слишком маленький, загрузка отменена');fs.writeFileSync(dest,bytes);const tracked=readJson(installedPath(),[]).filter(x=>x.projectId!==project.id);tracked.push({projectId:project.id,gameVersion,filename:safeName,version:version.version_number,installedAt:new Date().toISOString()});writeJson(installedPath(),tracked);logEvent(`Установлен мод ${project.id} ${version.version_number} для Minecraft ${gameVersion}`);return{ok:true,path:dest,name:safeName,version:version.version_number}}catch(e){logEvent(`Ошибка установки мода: ${e.message}`);return{ok:false,error:e.message||'Ошибка установки мода'}}});
ipcMain.handle('launcher:open-external',async(_,url)=>{if(typeof url!=='string'||!/^https:\/\/www\.curseforge\.com\/minecraft\/mc-mods\//.test(url))return{ok:false};await shell.openExternal(url);return{ok:true}});
ipcMain.handle('launcher:open-purchase',async(_,tier)=>{const links={BASIC:'https://funpay.com/lots/offer?id=80252770',PREMIUM:'https://funpay.com/lots/offer?id=80256667'};const url=links[tier];if(!url)return{ok:false};await shell.openExternal(url);logEvent('Открыта покупка тарифа '+tier);return{ok:true}});
ipcMain.on('launcher:minimize',e=>{const w=BrowserWindow.fromWebContents(e.sender);if(w)w.minimize()});ipcMain.on('launcher:close',e=>{const w=BrowserWindow.fromWebContents(e.sender);if(w)w.close()});
