use super::*;
use std::collections::VecDeque;
use std::ffi::OsString;

pub(super) type Inbox = Arc<Mutex<VecDeque<PathBuf>>>;

fn supported(path: &Path) -> bool {
    path.is_absolute() && path.extension().and_then(|s| s.to_str()).is_some_and(|ext|
        ["zcp", "zds", "ori"].iter().any(|allowed| ext.eq_ignore_ascii_case(allowed)))
}

pub(super) fn argument(mut args: impl Iterator<Item = OsString>) -> Result<Option<PathBuf>, Error> {
    if args.next().as_deref() != Some(std::ffi::OsStr::new("--open")) { return Ok(None); }
    let path = PathBuf::from(args.next().ok_or("--open 缺少文件路径。")?);
    if args.next().is_some() || !supported(&path) || !path.is_file() {
        return Err("请选择现有的 .zcp、.zds 或 .ori 文件。".into());
    }
    Ok(Some(path))
}

#[cfg(windows)]
mod ipc {
    use super::*;
    use sha2::{Digest, Sha256};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::windows::named_pipe::{ClientOptions, ServerOptions};

    pub(super) fn pipe_name() -> String {
        let key = format!("{}|{}", runtime_root().display(), std::env::var("LOCALAPPDATA").unwrap_or_default());
        format!(r"\\.\pipe\ZhezhiOpen-{}", hex::encode(Sha256::digest(key.as_bytes())))
    }

    pub(super) async fn send(name: &str, path: &Path) -> Result<(), Error> {
        let data = serde_json::to_vec(path)?;
        for _ in 0..150 {
            match ClientOptions::new().open(name) {
                Ok(mut client) => {
                    client.write_u32(data.len().try_into()?).await?;
                    client.write_all(&data).await?;
                    if tokio::time::timeout(Duration::from_secs(10), client.read_u8()).await?? != 1 {
                        return Err("工作台未接收该工程文件。".into());
                    }
                    client.write_u8(1).await?;
                    return Ok(());
                }
                Err(e) if matches!(e.raw_os_error(), Some(2 | 231)) => tokio::time::sleep(Duration::from_millis(100)).await,
                Err(e) => return Err(e.into()),
            }
        }
        Err("无法连接已打开的折纸工坊，请关闭旧版本后重试。".into())
    }

    pub(super) async fn listen(name: String, inbox: Inbox) -> Result<(), Error> {
        let mut server = ServerOptions::new().first_pipe_instance(true).reject_remote_clients(true).create(&name)?;
        tauri::async_runtime::spawn(async move {
            while server.connect().await.is_ok() {
                // Keep a listening instance alive while the connected client receives its receipt.
                let Ok(next) = ServerOptions::new().reject_remote_clients(true).create(&name) else { break };
                let mut connection = std::mem::replace(&mut server, next);
                let inbox = Arc::clone(&inbox);
                tauri::async_runtime::spawn(async move {
                    let received = async {
                        let len = connection.read_u32().await?;
                        if len == 0 || len > 256 * 1024 { return Ok::<(), std::io::Error>(()); }
                        let mut message = vec![0; len as usize];
                        connection.read_exact(&mut message).await?;
                        if let Ok(path) = serde_json::from_slice::<PathBuf>(&message) {
                            if supported(&path) && path.is_file() {
                                inbox.lock().unwrap().push_back(path);
                                connection.write_u8(1).await?;
                                let _ = connection.read_u8().await?;
                            }
                        }
                        Ok(())
                    };
                    let _ = tokio::time::timeout(Duration::from_secs(5), received).await;
                });
            }
        });
        Ok(())
    }

    #[cfg(test)]
    #[tokio::test]
    async fn receives_consecutive_and_concurrent_explorer_launches() {
        let directory = tempfile::tempdir().unwrap();
        let paths: Vec<_> = ["折痕.zcp","折序.zds","交换.ori","另一份.ZCP"].iter()
            .map(|name| directory.path().join(name)).collect();
        let name = format!(r"\\.\pipe\ZhezhiOpenTest-{}", Uuid::new_v4());
        let inbox = Inbox::default();
        listen(name.clone(), inbox.clone()).await.unwrap();
        for path in &paths { fs::write(path, b"fixture").unwrap(); }
        send(&name, &paths[0]).await.unwrap();
        send(&name, &paths[1]).await.unwrap();
        let (a,b)=tokio::join!(send(&name,&paths[2]),send(&name,&paths[3]));
        a.unwrap(); b.unwrap();
        let mut received: Vec<_> = inbox.lock().unwrap().drain(..).collect();
        let mut expected = paths;
        received.sort(); expected.sort();
        assert_eq!(received, expected);
    }
}

pub(super) fn forward(path: Option<PathBuf>) -> Result<(), Error> {
    #[cfg(windows)]
    if let Some(path) = path { tauri::async_runtime::block_on(ipc::send(&ipc::pipe_name(), &path))?; }
    Ok(())
}

pub(super) fn start(path: Option<PathBuf>) -> Result<Inbox, Error> {
    let inbox = Arc::new(Mutex::new(path.into_iter().collect()));
    #[cfg(windows)]
    tauri::async_runtime::block_on(ipc::listen(ipc::pipe_name(), Arc::clone(&inbox)))?;
    Ok(inbox)
}

pub(super) fn recipient(host: &Host) -> Option<String> {
    let r = host.documents.lock().unwrap();
    if r.closing_application { return None; }
    r.documents.values().filter(|d| d.handler_ready && !r.closing_windows.contains(&d.window_id) && !r.closing_documents.contains(&d.id))
        .min_by_key(|d| (!d.home, d.window_id != "main", !d.active)).map(|d| documents::label(&d.id))
}

pub(super) fn notify(handle: AppHandle, inbox: Inbox) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_millis(400)).await;
            let host = handle.state::<Host>();
            if host.closing.load(Ordering::Relaxed) { break; }
            if inbox.lock().unwrap().is_empty() { continue; }
            if let Some(view) = recipient(&host).and_then(|id| handle.get_webview(&id)) {
                let _ = view.eval("window.dispatchEvent(new Event('zhezhi-shell-file'))");
            }
        }
    });
}
