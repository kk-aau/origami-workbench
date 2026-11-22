use std::{
    collections::HashMap, fs, io::ErrorKind, path::{Path, PathBuf}, process::Command,
    sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}, thread, time::Duration,
};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

#[cfg(windows)]
fn installed_blender()->Option<PathBuf>{
    use winreg::{enums::{HKEY_CURRENT_USER,HKEY_LOCAL_MACHINE},RegKey};
    for hive in [HKEY_CURRENT_USER,HKEY_LOCAL_MACHINE]{
        let Ok(apps)=RegKey::predef(hive).open_subkey(r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall") else{continue};
        for key in apps.enum_keys().flatten(){
            let Ok(app)=apps.open_subkey(key) else{continue};
            if app.get_value::<String,_>("DisplayName").is_ok_and(|name|name=="Blender"||name.starts_with("Blender ")){
                if let Ok(dir)=app.get_value::<String,_>("InstallLocation"){
                    let path=PathBuf::from(dir).join("blender.exe");
                    if path.is_absolute()&&path.is_file(){return Some(path);}
                }
            }
        }
    }
    None
}

fn spawn_blender(environment:&str,input:&Path)->Result<(std::process::Child,PathBuf),String>{
    #[cfg(windows)]
    let installed=installed_blender();
    #[cfg(not(windows))]
    let installed:Option<PathBuf>=None;
    let executable=installed.or_else(||std::env::split_paths(&std::env::var_os("PATH")?)
        .filter(|dir|dir.is_absolute()).map(|dir|dir.join(if cfg!(windows){"blender.exe"}else{"blender"})).find(|exe|exe.is_file()))
        .ok_or("找不到 Blender。请安装 Blender，或将其安装目录加入 PATH 后重新打开工坊。")?;
    let mut command=Command::new(executable);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(windows_sys::Win32::System::Threading::CREATE_BREAKAWAY_FROM_JOB);
    }
    // Pass a file instead of embedding Python in a Windows command line.
    // The latter is limited to 32,767 UTF-16 units including quoted arguments.
    let script=input.parent().ok_or("找不到 Blender 传输目录。")?.join(format!("workbench-{}.py",Uuid::new_v4()));
    let program=concat!(include_str!("blender_render_output.py"),"\n",include_str!("blender_import.py"));
    fs::write(&script,program).map_err(|e|format!("准备 Blender 渲染脚本失败：{e}"))?;
    command.args(["--factory-startup","--python-exit-code","1","--python"]).arg(&script);
    command.env_remove("ZHEZHI_BLENDER_SESSION").env_remove("ZHEZHI_BLENDER_OBJ");
    // The host cleans up on process exit; never remove a script until Blender has read it.
    match command.env(environment,input).spawn(){
        Ok(child)=>Ok((child,script)),
        Err(error)=>{let _=fs::remove_file(script);Err(format!("无法启动 Blender：{error}"))}
    }
}

pub(super) fn open_snapshot(path:&Path)->Result<(),String>{
    let (mut child,script)=spawn_blender("ZHEZHI_BLENDER_OBJ",path)?;
    let snapshot=path.to_owned();
    std::thread::spawn(move||{let _=child.wait();let _=fs::remove_file(script);let _=fs::remove_file(snapshot);});
    Ok(())
}

pub(super) fn validate_step(step: &str) -> Result<(), String> {
    if step.len() == 64 && step.bytes().all(|c| c.is_ascii_hexdigit()) { Ok(()) }
    else { Err("步骤联动标识无效。".into()) }
}

struct Session {
    directory: PathBuf,
    exited: AtomicBool,
    ready: AtomicBool,
}

impl Drop for Session {
    fn drop(&mut self) {
        // This directory was created exclusively for our transfer. The user's
        // Blender file and process are never owned by its lifetime.
        for name in ["closed","detached","request.json"] {
            let _ = fs::remove_file(self.directory.join(name));
        }
        let _ = fs::remove_dir(&self.directory);
    }
}

impl Session {
    fn create(parent: &Path) -> Result<Arc<Self>, String> {
        let directory = parent.join(format!("session-{}", Uuid::new_v4()));
        fs::create_dir(&directory).map_err(|e|format!("无法创建 Blender 会话：{e}"))?;
        Ok(Arc::new(Self { directory, exited: AtomicBool::new(false), ready: AtomicBool::new(false) }))
    }

    fn attachable(&self) -> bool {
        !self.exited.load(Ordering::Acquire) && !self.directory.join("detached").exists()
    }

    fn launch(self: &Arc<Self>) -> Result<(), String> {
        let (mut child,script) = spawn_blender("ZHEZHI_BLENDER_SESSION",&self.directory)?;
        let session = Arc::downgrade(self);
        thread::spawn(move || {
            let _ = child.wait();
            let _ = fs::remove_file(script);
            if let Some(session) = session.upgrade() { session.exited.store(true, Ordering::Release); }
        });
        Ok(())
    }

    fn transfer(self: &Arc<Self>, input: &Path, first: bool, closing: &AtomicBool) -> Result<(), String> {
        let id = Uuid::new_v4();
        let data = self.directory.join(format!("{id}.zzanim"));
        let done = self.directory.join(format!("{id}.done.json"));
        let temporary = self.directory.join(format!("{id}.tmp"));
        let request = self.directory.join("request.json");
        let result = (|| {
            fs::rename(input,&data).map_err(|e|format!("暂存步骤动画失败：{e}"))?;
            fs::write(&temporary,json!({"id":id,"first":first}).to_string())
                .and_then(|_|fs::rename(&temporary,&request)).map_err(|e|format!("发送步骤动画失败：{e}"))?;
            if first { self.launch()?; }
            loop {
                match fs::read(&done) {
                    Ok(bytes) => {
                        #[derive(Deserialize)]
                        struct Reply { ok: bool, error: Option<String> }
                        let reply: Reply = serde_json::from_slice(&bytes).map_err(|_|"Blender 返回的载入结果无效。")?;
                        return if reply.ok { Ok(()) } else { Err(reply.error.unwrap_or_else(||"Blender 未能载入步骤动画。".into())) };
                    }
                    Err(e) if e.kind()==ErrorKind::NotFound => {}
                    Err(e) => return Err(format!("读取 Blender 载入结果失败：{e}")),
                }
                if closing.load(Ordering::Acquire) { return Err("工坊正在关闭，已停止等待 Blender。".into()); }
                if !self.attachable() {
                    // Blender may publish the result and detach between the two reads.
                    if done.is_file() { continue; }
                    return Err("已断开 Blender 场景，请重新发送本步动画。".into());
                }
                thread::sleep(Duration::from_millis(150));
            }
        })();
        for file in [temporary, done, data] { let _ = fs::remove_file(file); }
        result
    }
}

#[derive(Default)]
struct StepLink { session: Mutex<Option<Arc<Session>>>, busy: AtomicBool }

#[derive(Default)]
pub(super) struct StepSessions {
    links: Mutex<HashMap<String, Arc<StepLink>>>,
    closing: AtomicBool,
}

impl StepSessions {
    pub(super) fn linked(&self, key: &str) -> Result<bool,String> {
        validate_step(key)?;
        let links = self.links.lock().map_err(|_|"Blender 会话不可用。")?;
        Ok(links.get(key).is_some_and(|link|link.session.lock().unwrap().as_ref()
            .is_some_and(|s|s.ready.load(Ordering::Acquire) && s.attachable())))
    }

    pub(super) fn send(&self, key: String, input: &Path) -> Result<&'static str,String> {
        let link = {
            let mut links = self.links.lock().map_err(|_|"Blender 会话不可用。")?;
            if self.closing.load(Ordering::Acquire) { return Err("工坊正在关闭。".into()); }
            links.retain(|_,link|link.busy.load(Ordering::Acquire) ||
                link.session.lock().unwrap().as_ref().is_some_and(|s|s.attachable()));
            let link = links.entry(key).or_default().clone();
            if link.busy.swap(true, Ordering::AcqRel) { return Err("该步骤正在同步至 Blender，请等本次同步完成。".into()); }
            link
        };
        let result = (|| {
            let (session,first) = {
                let mut current = link.session.lock().map_err(|_|"Blender 会话不可用。")?;
                if let Some(s) = current.as_ref().filter(|s|s.attachable() && s.ready.load(Ordering::Acquire)) {
                    (s.clone(),false)
                } else {
                    let s=Session::create(input.parent().ok_or("缺少动画传输目录。")?)?;
                    *current=Some(s.clone());
                    (s,true)
                }
            };
            if let Err(e) = session.transfer(input,first,&self.closing) {
                if first || !session.attachable() { link.session.lock().unwrap().take(); }
                return Err(e);
            }
            session.ready.store(true, Ordering::Release);
            Ok(if first {"linked"} else {"updated"})
        })();
        link.busy.store(false, Ordering::Release);
        result
    }

    pub(super) fn close(&self) {
        self.closing.store(true, Ordering::Release);
        if let Ok(mut links)=self.links.lock() {
            for (_,link) in links.drain() {
                if let Some(session)=link.session.lock().unwrap().take() {
                    let _=fs::write(session.directory.join("closed"),[]);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn linked_step_only_commits_after_blender_acknowledges_and_keeps_the_scene_on_import_error() {
        let dir = tempfile::tempdir().unwrap();
        let sessions = Arc::new(StepSessions::default());
        let key = "a".repeat(64);
        let session = Session::create(dir.path()).unwrap();
        session.ready.store(true,Ordering::Release);
        let link = Arc::new(StepLink::default());
        *link.session.lock().unwrap()=Some(session.clone());
        sessions.links.lock().unwrap().insert(key.clone(),link);
        for success in [false,true] {
            let input=dir.path().join("transfer.zzanim");
            fs::write(&input,b"step bytes").unwrap();
            let worker=Arc::clone(&sessions);
            let step=key.clone();
            let transfer=thread::spawn(move || worker.send(step,&input));
            let request=session.directory.join("request.json");
            let deadline=Instant::now()+Duration::from_secs(5);
            while !request.exists() { assert!(Instant::now()<deadline); thread::sleep(Duration::from_millis(5)); }
            let message:serde_json::Value=serde_json::from_slice(&fs::read(&request).unwrap()).unwrap();
            let id=Uuid::parse_str(message["id"].as_str().unwrap()).unwrap();
            assert_eq!(message["first"],false);
            assert_eq!(fs::read(session.directory.join(format!("{id}.zzanim"))).unwrap(),b"step bytes");
            assert!(sessions.linked(&key).unwrap());
            assert!(sessions.send(key.clone(),&dir.path().join("second")).is_err());
            fs::remove_file(&request).unwrap();
            let temp=session.directory.join("result.tmp");
            fs::write(&temp,json!({"ok":success,"error":"原场景正在编辑"}).to_string()).unwrap();
            fs::rename(&temp,session.directory.join(format!("{id}.done.json"))).unwrap();
            assert_eq!(transfer.join().unwrap(),if success {Ok("updated")} else {Err("原场景正在编辑".into())});
            assert_eq!(fs::read_dir(&session.directory).unwrap().count(),0);
        }
        fs::write(session.directory.join("detached"),[]).unwrap();
        assert!(!sessions.linked(&key).unwrap());
        // A .blend saved beside the transfer must survive disconnect/shutdown.
        fs::write(session.directory.join("work.blend"),b"user work").unwrap();
        sessions.close();
        let directory=session.directory.clone();
        drop(session);
        assert_eq!(fs::read(directory.join("work.blend")).unwrap(),b"user work");
    }
}
