use super::*;
const A:&str="11111111-1111-4111-8111-111111111111";
const B:&str="22222222-2222-4222-8222-222222222222";
const ID:&str="33333333-3333-4333-8333-333333333333";
fn doc(name:&str)->Value{json!({"version":1,"name":name,"paper":{"width":100,"height":100},"segments":[{"id":"m1","a":[0,0],"b":[100,100],"assignment":"M","angle":-180}],"metadata":{"privateValue":name,"unknown":[1,2,3]}})}
fn store()->(tempfile::TempDir,Storage,ProjectStore){let dir=tempfile::tempdir().unwrap();let storage=Storage::new(dir.path().join("data"),false).unwrap();let store=ProjectStore::new(storage.clone());(dir,storage,store)}

#[test]
fn peers_editing_the_same_saved_project_keep_independent_drafts_and_shared_revision(){
    let(_dir,storage,store)=store();let saved=store.save(&json!({"id":ID,"doc":doc("正式版本")}),false).unwrap();let head=&saved["revision"];
    let a=store.save_workspace(&json!({"id":ID,"doc":doc("作品甲草稿"),"baseRevision":head}),true,A).unwrap();
    let b=store.save_workspace(&json!({"id":ID,"doc":doc("作品乙草稿"),"baseRevision":head}),true,B).unwrap();
    assert_eq!(a["revision"],*head);assert_eq!(b["revision"],*head);assert_eq!(store.get_revision(ID).unwrap()["revision"],*head);
    assert_eq!(store.get(ID,true).unwrap()["doc"],doc("正式版本"));assert_eq!(store.get_workspace(ID,true,A).unwrap()["doc"],doc("作品甲草稿"));assert_eq!(store.get_workspace(ID,true,B).unwrap()["doc"],doc("作品乙草稿"));
    assert!(workspace_draft_path(&storage.paths().projects_dir,ID,A).is_file());assert!(workspace_draft_path(&storage.paths().projects_dir,ID,B).is_file());
}
#[test]
fn an_unsaved_private_project_is_visible_only_to_its_owner_and_can_be_saved_normally(){
    let(_dir,_storage,store)=store();let saved=store.save_workspace(&json!({"id":ID,"doc":doc("尚未正式保存")}),true,A).unwrap();
    assert!(saved["revision"].is_null());let private=store.get_workspace(ID,true,A).unwrap();assert_eq!(private["workspaceDraft"],true);assert!(private["revision"].is_null());assert_eq!(private["doc"],doc("尚未正式保存"));
    assert!(store.list_workspace(true,A).unwrap()["projects"].as_array().unwrap().iter().any(|v|v["id"]==ID));assert!(store.list_workspace(true,B).unwrap()["projects"].as_array().unwrap().is_empty());assert!(store.list(true).unwrap()["projects"].as_array().unwrap().is_empty());assert_eq!(store.get_workspace(ID,true,B).unwrap_err().status,404);
    let formal=store.save_workspace(&json!({"id":ID,"doc":doc("现在已保存"),"baseRevision":null}),false,A).unwrap();assert!(formal["revision"].is_string());assert_eq!(store.get_workspace(ID,true,B).unwrap()["doc"],doc("现在已保存"));
}
#[test]
fn a_peer_official_save_preserves_private_edits_and_rejects_a_stale_write(){
    let(_dir,storage,store)=store();let formal=store.save(&json!({"id":ID,"doc":doc("共享旧版")}),false).unwrap();
    store.save_workspace(&json!({"id":ID,"doc":doc("甲未保存编辑"),"baseRevision":formal["revision"]}),true,A).unwrap();let file=workspace_draft_path(&storage.paths().projects_dir,ID,A);let before=fs::read(&file).unwrap();
    let newer=store.save_workspace(&json!({"id":ID,"doc":doc("乙正式新版"),"baseRevision":formal["revision"]}),false,B).unwrap();
    let opened=store.get_workspace(ID,true,A).unwrap();assert_eq!(opened["workspaceDraftConflict"],true);assert_eq!(opened["doc"],doc("乙正式新版"));assert_eq!(opened["revision"],newer["revision"]);assert_eq!(fs::read(file).unwrap(),before);
    assert_eq!(store.save_workspace(&json!({"id":ID,"doc":doc("甲旧稿"),"baseRevision":formal["revision"]}),false,A).unwrap_err().status,409);
}
#[test]
fn saving_the_owner_clears_only_its_draft_and_retains_its_peers_copy(){
    let(_dir,storage,store)=store();let formal=store.save(&json!({"id":ID,"doc":doc("旧版")}),false).unwrap();
    for(owner,name)in[(A,"甲草稿"),(B,"乙草稿")]{store.save_workspace(&json!({"id":ID,"doc":doc(name),"baseRevision":formal["revision"]}),true,owner).unwrap();}
    let peer=workspace_draft_path(&storage.paths().projects_dir,ID,B);let bytes=fs::read(&peer).unwrap();store.save_workspace(&json!({"id":ID,"doc":doc("甲正式版"),"baseRevision":formal["revision"]}),false,A).unwrap();
    assert!(!workspace_draft_path(&storage.paths().projects_dir,ID,A).exists());assert_eq!(fs::read(peer).unwrap(),bytes);
}
#[test]
fn private_only_library_rename_keeps_all_geometry_and_null_shared_head(){
    let(_dir,_storage,store)=store();store.save_workspace(&json!({"id":ID,"doc":doc("原名")}),true,A).unwrap();let result=store.rename_workspace(ID,&json!({"name":"新名","baseRevision":null}),A).unwrap();assert!(result["revision"].is_null());let current=store.get_workspace(ID,true,A).unwrap();assert_eq!(current["doc"]["name"],"新名");assert_eq!(current["doc"]["segments"],doc("原名")["segments"]);assert_eq!(current["doc"]["metadata"],doc("原名")["metadata"]);
}
#[test]
fn deleted_projects_cannot_be_resurrected_by_a_retained_private_draft(){
    let(_dir,_storage,store)=store();let formal=store.save(&json!({"id":ID,"doc":doc("正式")}),false).unwrap();store.save_workspace(&json!({"id":ID,"doc":doc("私有") ,"baseRevision":formal["revision"]}),true,A).unwrap();store.delete(ID).unwrap();
    assert_eq!(store.get_workspace(ID,true,A).unwrap_err().status,404);assert!(store.list_workspace(true,A).unwrap()["projects"].as_array().unwrap().is_empty());assert_eq!(store.save_workspace(&json!({"id":ID,"doc":doc("不能复活")}),true,A).unwrap_err().status,409);
}
#[test]
fn directory_migration_recognizes_only_well_formed_owned_draft_names(){
    assert!(is_workspace_draft_file(&format!("{ID}.workspace-{A}.draft.json")));assert!(is_workspace_draft_file(&format!("{ID}.workspace-{A}.draft.json.bak")));
    for name in ["unrelated.json","../escape.workspace-invalid.draft.json","document.workspace-another.draft.json",".workspace-.draft.json"]{assert!(!is_workspace_draft_file(name));}
}
