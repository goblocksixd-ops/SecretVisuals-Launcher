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


ipcMain.handle('minecraft:launch', async (_, version) => {
  const allowed = ['1.16.5', '1.21.4', '1.21.11'];

  if (!allowed.includes(version)) {
    return { ok: false, error: 'Эта версия не поддерживается.' };
  }
  if (!minecraftAuth) {
    return { ok: false, error: 'Сначала войди через Microsoft.' };
  }
  if (gameProcess && !gameProcess.killed) {
    return { ok: false, error: 'Minecraft уже запущен.' };
  }

  try {
    const settings = readSettings();
    const root = mcDir();
    fs.mkdirSync(root, { recursive: true });

    logEvent(`Подготовка Minecraft ${version}`);
    logEvent('Проверка и установка Fabric...');

    const fabricProfile = await installFabric(version, root);
    logEvent(`Профиль Fabric: ${fabricProfile}`);

    const visualMods = fs.existsSync(modsDir())
      ? fs.readdirSync(modsDir()).filter(f =>
          /^secretvisuals.*\.jar$/i.test(f)
        )
      : [];

    if (!visualMods.length) {
      logEvent('SecretVisuals.jar не найден. Игра запустится без визуалов SecretVisuals.');
    }

    const launcher = new Client();

    gameProcess = launcher.launch({
      authorization: minecraftAuth,
      root,
      version: {
        number: fabricProfile,
        type: 'release'
      },
      memory: {
        max: `${Math.max(2048, settings.ram || 4096)}M`,
        min: '512M'
      },
      overrides: {
        gameDirectory: root
      }
    });

    gameProcess.on('data', data => {
      logEvent('[Minecraft] ' + String(data).trim().slice(0, 350));
    });

    gameProcess.on('close', code => {
      logEvent(`Minecraft ${version} завершён: ${code}`);
      gameProcess = null;
    });

    gameProcess.on('error', error => {
      logEvent('Ошибка Minecraft: ' + error.message);
      gameProcess = null;
    });

    return {
      ok: true,
      message: visualMods.length
        ? `Запуск Minecraft ${version} через Fabric начат.`
        : `Запуск Minecraft ${version} через Fabric начат. Мод SecretVisuals пока не установлен.`
    };
  } catch (error) {
    gameProcess = null;
    logEvent('Ошибка подготовки Minecraft: ' + (error.stack || error));

    return {
      ok: false,
      error: 'Не удалось установить Fabric или запустить игру. Открой журнал лаунчера для подробностей.'
    };
  }
});

ipcMain.handle('launcher:open-purchase',async(_,tier)=>{const links={BASIC:'https://funpay.com/lots/offer?id=80252770',PREMIUM:'https://funpay.com/lots/offer?id=80256667'};const url=links[tier];if(!url)return{ok:false};await shell.openExternal(url);logEvent('Открыта покупка тарифа '+tier);return{ok:true}});
ipcMain.on('launcher:minimize',e=>{const w=BrowserWindow.fromWebContents(e.sender);if(w)w.minimize()});ipcMain.on('launcher:close',e=>{const w=BrowserWindow.fromWebContents(e.sender);if(w)w.close()});
