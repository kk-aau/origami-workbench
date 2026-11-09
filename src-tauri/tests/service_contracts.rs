use serde_json::{json, Value};
use std::{collections::HashMap, fs, path::{Path, PathBuf}, time::Duration};
use tempfile::{Builder, TempDir};
use tokio::{io::{AsyncReadExt, AsyncWriteExt}, net::TcpStream};
use uuid::Uuid;
use zhezhi_runtime::backend::{start, RunningServer, ServerConfig};

struct Reply {
    status: u16,
    headers: HashMap<String, String>,
    body: Value,
}

struct Service {
    server: RunningServer,
    directory: TempDir,
}

impl Service {
    async fn new() -> Self {
        // Always put integration-test data in the migration's D-drive tree,
        // including when cargo is invoked without the toolchain env script.
        let project = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_owned();
        let temporary = project.join(".toolchain/tmp/service-contracts");
        assert!(temporary.is_absolute());
        #[cfg(windows)]
        assert!(temporary.to_string_lossy().to_ascii_lowercase().starts_with("d:"), "迁移测试临时数据必须位于 D 盘");
        fs::create_dir_all(&temporary).unwrap();
        let directory = Builder::new().prefix("contract-").tempdir_in(&temporary).unwrap();
        let config = ServerConfig {
            data_root: directory.path().join("data"),
            dist_dir: directory.path().join("dist"),
            engine_executable: directory.path().join("unused-engine.exe"),
            engine_args: vec!["--worker".into()],
            version: "migration-contract-tests".into(),
            native_dialogs: false,
            port: 0,
        };
        let server = start(config).await.unwrap();
        let this = Self { server, directory };
        let health = this.request("GET", "/api/health", None, None).await;
        assert_eq!(health.status, 200);
        assert_eq!(health.body["runtime"], "rust");
        assert_eq!(health.body["token"], this.server.state.token);
        this
    }

    async fn request(&self, method: &str, route: &str, payload: Option<&Value>, token: Option<&str>) -> Reply {
        self.request_with_origin(method, route, payload, token, None).await
    }

    async fn authorized(&self, method: &str, route: &str, payload: Option<&Value>) -> Reply {
        self.request(method, route, payload, Some(&self.server.state.token)).await
    }

    async fn request_with_origin(&self, method: &str, route: &str, payload: Option<&Value>, token: Option<&str>, origin: Option<&str>) -> Reply {
        let body = payload.map(|value| serde_json::to_vec(value).unwrap()).unwrap_or_default();
        let mut headers = format!("{method} {route} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: {}\r\n", self.server.address, body.len());
        if let Some(token) = token { headers.push_str(&format!("X-Zhezhi-Token: {token}\r\n")); }
        if let Some(origin) = origin { headers.push_str(&format!("Origin: {origin}\r\n")); }
        headers.push_str("\r\n");
        let raw = tokio::time::timeout(Duration::from_secs(10), async {
            let mut stream = TcpStream::connect(self.server.address).await.unwrap();
            stream.write_all(headers.as_bytes()).await.unwrap();
            stream.write_all(&body).await.unwrap();
            let mut response = Vec::new();
            stream.read_to_end(&mut response).await.unwrap();
            response
        }).await.expect("真实 HTTP 请求应在 10 秒内完成");
        let boundary = raw.windows(4).position(|window| window == b"\r\n\r\n").expect("HTTP response headers");
        let head = std::str::from_utf8(&raw[..boundary]).unwrap();
        let mut lines = head.split("\r\n");
        let status = lines.next().unwrap().split_whitespace().nth(1).unwrap().parse().unwrap();
        let headers: HashMap<String, String> = lines.map(|line| {
            let (key, value) = line.split_once(':').unwrap();
            (key.to_ascii_lowercase(), value.trim().to_owned())
        }).collect();
        let bytes = if headers.get("transfer-encoding").is_some_and(|value| value.eq_ignore_ascii_case("chunked")) {
            decode_chunks(&raw[boundary + 4..])
        } else { raw[boundary + 4..].to_vec() };
        let body = serde_json::from_slice(&bytes).unwrap_or_else(|error| panic!("{method} {route}: {status}: invalid JSON: {error}; {}", String::from_utf8_lossy(&bytes)));
        Reply { status, headers, body }
    }

    async fn stop(mut self) { self.server.shutdown().await; }
}

fn decode_chunks(mut bytes: &[u8]) -> Vec<u8> {
    let mut result = Vec::new();
    loop {
        let end = bytes.windows(2).position(|window| window == b"\r\n").expect("chunk header");
        let size = usize::from_str_radix(std::str::from_utf8(&bytes[..end]).unwrap().split(';').next().unwrap(), 16).unwrap();
        bytes = &bytes[end + 2..];
        if size == 0 { break; }
        result.extend_from_slice(&bytes[..size]);
        assert_eq!(&bytes[size..size + 2], b"\r\n");
        bytes = &bytes[size + 2..];
    }
    result
}

fn doc(name: &str) -> Value {
    json!({"name": name, "paper": {"width": 200, "height": 200}, "segments": [
        {"id": "crease", "a": [0, 0], "b": [200, 200], "assignment": "V", "angle": 180}
    ]})
}

fn artwork(name: &str) -> Value {
    json!({"format": "zhezhi-artwork", "version": 1, "editor": doc(name), "models": null, "diagram": null, "simulation": null, "construction": {"tessellation": {}, "curve": null}})
}

fn assert_same_path(actual: &Value, expected: &Path) {
    assert_eq!(fs::canonicalize(actual.as_str().unwrap()).unwrap(), fs::canonicalize(expected).unwrap());
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn project_revision_endpoint_hashes_all_bytes_without_returning_the_document() {
    let service=Service::new().await;let id="11111111-1111-4111-8111-111111111111";let endpoint=format!("/api/projects/{id}/revision");
    assert_eq!(service.request("GET","/api/projects/not-an-id/revision",None,None).await.status,400);
    assert_eq!(service.request("GET",&endpoint,None,None).await.status,404);
    let mut source=doc("修订检测");source["metadata"]=json!({"padding":"a".repeat(131_073)});
    let saved=service.authorized("POST","/api/projects",Some(&json!({"id":id,"doc":source}))).await;assert_eq!(saved.status,200);
    let first=service.request("GET",&endpoint,None,None).await;assert_eq!(first.status,200);assert_eq!(first.body.as_object().unwrap().len(),2);assert_eq!(first.body["id"],id);assert_eq!(first.body["revision"],saved.body["revision"]);assert!(first.body.get("doc").is_none());assert!(first.body.to_string().len()<160);assert_eq!(first.headers["cache-control"],"no-store");
    source["name"]=json!("包含草稿后的修订");let draft=service.authorized("POST","/api/projects/draft",Some(&json!({"id":id,"baseRevision":first.body["revision"],"doc":source}))).await;assert_eq!(draft.status,200);
    let latest=service.request("GET",&endpoint,None,None).await;let full=service.request("GET",&format!("/api/projects/{id}?draft=1"),None,None).await;
    assert_eq!(latest.body["revision"],draft.body["revision"]);assert_eq!(latest.body["revision"],full.body["revision"]);assert_ne!(latest.body["revision"],first.body["revision"]);
    let file=service.server.state.storage.paths().projects_dir.join(format!("{id}.json"));let mut bytes=fs::read(&file).unwrap();let position=bytes.windows(32).rposition(|part|part==[b'a';32]).unwrap();bytes[position]=b'b';fs::write(&file,&bytes).unwrap();
    let changed=service.request("GET",&endpoint,None,None).await;assert_ne!(changed.body["revision"],latest.body["revision"]);assert_eq!(changed.body["revision"],service.request("GET",&format!("/api/projects/{id}?draft=1"),None,None).await.body["revision"]);
    assert_eq!(service.authorized("POST",&endpoint,Some(&json!({}))).await.status,404,"revision reads must not become a write route");
    assert_eq!(service.authorized("DELETE",&format!("/api/projects/{id}"),None).await.status,200);assert_eq!(service.request("GET",&endpoint,None,None).await.status,404);fs::write(file,bytes).unwrap();assert_eq!(service.request("GET",&endpoint,None,None).await.status,404);
    service.stop().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn approved_directory_migration_keeps_cas_projects_artworks_and_logs_connected() {
    let service = Service::new().await;
    let token = service.server.state.token.clone();
    let status = service.authorized("GET", "/api/storage", None).await;
    assert_eq!(status.status, 200);
    assert_eq!(status.body["pickerAvailable"], false);
    let unavailable_picker = service.authorized("POST", "/api/storage/pick", Some(&json!({"kind": "dataDir"}))).await;
    assert_eq!(unavailable_picker.status, 501, "headless service must not gain a test-only picker route");

    let initial = json!({"key": "zhezhi.theme.v1", "value": "initial", "expectedValue": null});
    assert_eq!(service.authorized("POST", "/api/storage/preferences", Some(&initial)).await.status, 200);
    let first = json!({"key": "zhezhi.theme.v1", "value": "window-one", "expectedValue": "initial"});
    let second = json!({"key": "zhezhi.theme.v1", "value": "window-two", "expectedValue": "initial"});
    let (one, two) = tokio::join!(
        service.request("POST", "/api/storage/preferences", Some(&first), Some(&token)),
        service.request("POST", "/api/storage/preferences", Some(&second), Some(&token))
    );
    let mut statuses = [one.status, two.status]; statuses.sort_unstable();
    assert_eq!(statuses, [200, 409], "two HTTP clients cannot both replace one CAS revision");
    let winner = service.authorized("GET", "/api/storage/preferences?key=zhezhi.theme.v1", None).await.body["value"].clone();
    assert!(winner == "window-one" || winner == "window-two");
    let diagram = json!({"key": "zhezhi.diagram-project.v1", "value": "independent diagram snapshot"});
    assert_eq!(service.authorized("POST", "/api/storage/preferences", Some(&diagram)).await.status, 200);

    let project = service.authorized("POST", "/api/projects", Some(&json!({"doc": doc("迁移前工程")}))).await;
    assert_eq!(project.status, 200, "{}", project.body);
    let project_id = project.body["id"].as_str().unwrap();
    let artwork_id = Uuid::new_v4().to_string();
    let complete = service.authorized("POST", "/api/artwork-recovery", Some(&json!({"id": artwork_id, "expectedRevision": null, "text": artwork("迁移前完整作品").to_string()}))).await;
    assert_eq!(complete.status, 200, "{}", complete.body);
    assert_eq!(service.authorized("POST", "/api/recovery", Some(&json!({"doc": doc("恢复稿"), "projectId": project_id, "baseRevision": project.body["revision"]}))).await.status, 200);
    assert_eq!(service.authorized("POST", "/api/activity", Some(&json!({"action": "migration.before", "details": {"stage": "before"}}))).await.status, 200);

    let old = service.server.state.storage.paths();
    let old_project = fs::read(old.projects_dir.join(format!("{project_id}.json"))).unwrap();
    let old_artwork = fs::read(old.data_dir.join(format!("artwork-recovery-{artwork_id}.json"))).unwrap();
    let old_log = fs::read(old.data_dir.join("activity.ndjson")).unwrap();
    let destinations = service.directory.path().join("chosen");
    let new_projects = destinations.join("projects");
    let new_diagrams = destinations.join("diagrams");
    let new_data = destinations.join("data");
    let mut selections = serde_json::Map::new();
    for (kind, path) in [("projectsDir", &new_projects), ("diagramsDir", &new_diagrams), ("dataDir", &new_data)] {
        fs::create_dir_all(path).unwrap();
        // This is the same capability registration used by the native host.
        // HTTP never receives an arbitrary target path or a production backdoor.
        let chosen = service.server.state.storage.register_selection(kind, path.clone()).unwrap();
        selections.insert(kind.into(), chosen["selectionId"].clone());
    }
    let migrated = service.authorized("POST", "/api/storage/apply", Some(&json!({"migrate": true, "selections": selections}))).await;
    assert_eq!(migrated.status, 200, "{}", migrated.body);
    assert_eq!(migrated.body["configured"], true);
    assert_eq!(migrated.body["busy"], false);
    assert_eq!(migrated.body["retainedSource"], true);
    assert!(migrated.body["copiedFiles"].as_u64().unwrap() >= 6);
    assert_same_path(&migrated.body["paths"]["projectsDir"], &new_projects);
    assert_same_path(&migrated.body["paths"]["diagramsDir"], &new_diagrams);
    assert_same_path(&migrated.body["paths"]["dataDir"], &new_data);

    let loaded = service.authorized("GET", &format!("/api/projects/{project_id}"), None).await;
    assert_eq!(loaded.status, 200);
    assert_eq!(loaded.body["doc"]["name"], "迁移前工程");
    let changed = service.authorized("POST", "/api/projects", Some(&json!({"id": project_id, "baseRevision": loaded.body["revision"], "doc": doc("迁移后工程")}))).await;
    assert_eq!(changed.status, 200, "{}", changed.body);
    assert_eq!(serde_json::from_slice::<Value>(&fs::read(new_projects.join(format!("{project_id}.json"))).unwrap()).unwrap()["doc"]["name"], "迁移后工程");
    assert_eq!(fs::read(old.projects_dir.join(format!("{project_id}.json"))).unwrap(), old_project);

    let restored = service.authorized("GET", &format!("/api/artwork-recovery/{artwork_id}"), None).await;
    assert_eq!(restored.status, 200);
    assert_eq!(serde_json::from_str::<Value>(restored.body["text"].as_str().unwrap()).unwrap()["editor"]["name"], "迁移前完整作品");
    let revised = service.authorized("POST", "/api/artwork-recovery", Some(&json!({"id": artwork_id, "expectedRevision": restored.body["summary"]["revision"], "text": artwork("迁移后完整作品").to_string()}))).await;
    assert_eq!(revised.status, 200, "{}", revised.body);
    assert_eq!(serde_json::from_slice::<Value>(&fs::read(new_data.join(format!("artwork-recovery-{artwork_id}.json"))).unwrap()).unwrap()["artwork"]["editor"]["name"], "迁移后完整作品");
    assert_eq!(fs::read(old.data_dir.join(format!("artwork-recovery-{artwork_id}.json"))).unwrap(), old_artwork);
    assert_eq!(service.authorized("GET", "/api/recovery", None).await.body["doc"]["name"], "恢复稿");
    assert_eq!(service.authorized("GET", "/api/storage/preferences?key=zhezhi.theme.v1", None).await.body["value"], winner);
    assert_eq!(service.authorized("GET", "/api/storage/preferences?key=zhezhi.diagram-project.v1", None).await.body["value"], "independent diagram snapshot");
    assert!(new_diagrams.join("zhezhi.diagram-project.v1.json").is_file());
    let changed_diagram = json!({"key": "zhezhi.diagram-project.v1", "value": "updated diagram snapshot", "expectedValue": "independent diagram snapshot"});
    assert_eq!(service.authorized("POST", "/api/storage/preferences", Some(&changed_diagram)).await.status, 200);
    assert_eq!(serde_json::from_slice::<Value>(&fs::read(new_diagrams.join("zhezhi.diagram-project.v1.json")).unwrap()).unwrap(), "updated diagram snapshot");
    assert_eq!(serde_json::from_slice::<Value>(&fs::read(old.diagrams_dir.join("zhezhi.diagram-project.v1.json")).unwrap()).unwrap(), "independent diagram snapshot");

    assert_eq!(service.authorized("POST", "/api/activity", Some(&json!({"action": "migration.after", "details": {"stage": "after"}}))).await.status, 200);
    let exported = service.authorized("GET", "/api/activity/export", None).await;
    assert_eq!(exported.status, 200);
    let entries = exported.body["entries"].as_array().unwrap();
    assert!(entries.iter().any(|entry| entry["action"] == "migration.before"));
    assert!(entries.iter().any(|entry| entry["action"] == "migration.after"));
    assert_eq!(fs::read(old.data_dir.join("activity.ndjson")).unwrap(), old_log);
    assert!(fs::read_to_string(new_data.join("activity.ndjson")).unwrap().contains("migration.after"));
    service.stop().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn logs_and_preferences_require_the_current_session_and_export_only_filtered_fields() {
    let service = Service::new().await;
    for route in ["/api/activity", "/api/activity/export", "/api/storage", "/api/storage/preferences?key=zhezhi.theme.v1"] {
        for token in [None, Some("stale-session")] {
            let rejected = service.request("GET", route, None, token).await;
            assert_eq!(rejected.status, 403, "{route}: {}", rejected.body);
            assert!(rejected.body.get("entries").is_none());
            assert!(rejected.body.get("value").is_none());
            assert!(!rejected.headers.contains_key("content-disposition"));
        }
    }
    let secret = service.server.state.token.clone();
    let event = json!({"action": "import.failed", "level": "warning", "details": {
        "fileName": "D:\\private-contract-location\\校徽.cp?token=private",
        "source": "https://private-contract-host/path/黄金.fold#secret",
        "reason": format!("failed D:/private-contract-location/校徽.cp token={secret} abcdef0123456789abcdef0123456789"),
        "result": "{\"private-contract-document\": [1,2,3]}",
        "unknownField": "private-contract-unapproved-field", "objects": {"private-contract-object": 1}, "segments": 3
    }});
    let saved = service.authorized("POST", "/api/activity", Some(&event)).await;
    assert_eq!(saved.status, 200, "{}", saved.body);
    let details = &saved.body["entry"]["details"];
    assert_eq!(details["fileName"], "校徽.cp");
    assert_eq!(details["source"], "黄金.fold");
    assert_eq!(details["result"], "[已过滤内容]");
    assert!(details.get("unknownField").is_none());
    assert!(details.get("objects").is_none());
    assert_eq!(details["segments"], 3);
    let exported = service.authorized("GET", "/api/activity/export", None).await;
    assert_eq!(exported.status, 200);
    assert_eq!(exported.body["format"], "zhezhi-activity-log");
    assert!(exported.headers["content-disposition"].contains("attachment"));
    let export_text = exported.body.to_string();
    let persisted = fs::read_to_string(service.server.state.storage.paths().data_dir.join("activity.ndjson")).unwrap();
    for forbidden in [secret.as_str(), "private-contract-location", "private-contract-host", "private-contract-document", "private-contract-unapproved-field", "private-contract-object", "abcdef0123456789abcdef0123456789"] {
        assert!(!export_text.contains(forbidden), "export leaked {forbidden}");
        assert!(!persisted.contains(forbidden), "persistent log leaked {forbidden}");
    }
    let foreign = service.request_with_origin("GET", "/api/activity/export", None, Some(&secret), Some("https://external.example")).await;
    assert_eq!(foreign.status, 403);
    let unsupported = service.authorized("POST", "/api/activity", Some(&json!({"action": "import.failed", "document": "private-contract-document"}))).await;
    assert_eq!(unsupported.status, 400);
    service.stop().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_damaged_log_destination_does_not_block_project_save_or_poison_later_logging() {
    let service = Service::new().await;
    let data = service.server.state.storage.paths().data_dir;
    let active = data.join("activity.ndjson");
    let retained = data.join("activity-retained.ndjson");
    fs::rename(&active, &retained).unwrap();
    fs::create_dir(&active).unwrap();
    let log_failure = service.authorized("POST", "/api/activity", Some(&json!({"action": "test.log-failure"}))).await;
    assert_eq!(log_failure.status, 503, "{}", log_failure.body);
    assert_eq!(service.authorized("GET", "/api/activity/export", None).await.status, 503);
    let saved = service.authorized("POST", "/api/projects", Some(&json!({"doc": doc("日志故障时仍保存")}))).await;
    assert_eq!(saved.status, 200, "{}", saved.body);
    let id = saved.body["id"].as_str().unwrap();
    let loaded = service.authorized("GET", &format!("/api/projects/{id}"), None).await;
    assert_eq!(loaded.status, 200);
    assert_eq!(loaded.body["doc"]["name"], "日志故障时仍保存");
    // Even failure reporting must retain the original API error when logging is broken.
    let invalid = service.authorized("POST", "/api/projects", Some(&json!({"doc": {"name": "bad"}}))).await;
    assert_eq!(invalid.status, 400);
    assert_eq!(service.authorized("GET", &format!("/api/projects/{id}"), None).await.body["doc"]["name"], "日志故障时仍保存");
    fs::remove_dir(&active).unwrap();
    fs::rename(&retained, &active).unwrap();
    let recovered = service.authorized("POST", "/api/activity", Some(&json!({"action": "test.log-recovered"}))).await;
    assert_eq!(recovered.status, 200, "{}", recovered.body);
    let exported = service.authorized("GET", "/api/activity/export", None).await;
    assert_eq!(exported.status, 200);
    assert!(exported.body["entries"].as_array().unwrap().iter().any(|entry| entry["action"] == "test.log-recovered"));
    service.stop().await;
}
