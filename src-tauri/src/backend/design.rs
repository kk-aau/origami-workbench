//! Local design worker. Each request owns its model; cancellation terminates
//! this child process without touching the desktop or a previous good design.
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use treemaker_core::{CPStatus, Tree, TreeDesign};
use oristudio_bp::{Project, Point, GridType};
use oristudio_bp::engine::{BpProjectSession, BpSession, FlapReshape};
use oristudio_bp::io::cp::{self, CpExportOptions};
use oristudio_bp::optimizer::{self, OptimizerOptionsBase, LayoutMode, OptimizerResult, FlapResult};

type Result<T> = std::result::Result<T, String>;
fn error(e: impl std::fmt::Display) -> String { e.to_string() }
fn number(v: &Value, key: &str) -> Result<f64> {
    v[key].as_f64().filter(|n| n.is_finite()).ok_or_else(|| format!("{key} 必须是有限数值。"))
}
fn id(v: &Value, key: &str) -> Result<u32> {
    v[key].as_u64().and_then(|n| u32::try_from(n).ok()).ok_or_else(|| format!("{key} 编号无效。"))
}
fn ids(v:&Value)->Result<Vec<u32>>{v["ids"].as_array().ok_or("缺少节点选区。")?.iter().map(|n|n.as_u64().and_then(|n|u32::try_from(n).ok()).ok_or_else(||"节点编号无效。".into())).collect()}

pub fn compute(input: Value) -> Result<Value> {
    match input["kind"].as_str() {
        Some("tree") => tree(input),
        Some("box") => box_pleating(input),
        _ => Err("请选择树形基础形或方格基础形。".into()),
    }
}

fn tree(input: Value) -> Result<Value> {
    let mut tree = if input["action"] == "import" {
        Tree::from_tmd_str(input["text"].as_str().ok_or("缺少 TreeMaker 工程内容。")?).map_err(error)?
    } else if input["project"].is_null() {
        Tree::new_design(1.0, 1.0).map_err(error)?
    } else {
        let design: TreeDesign = serde_json::from_value(input["project"].clone()).map_err(error)?;
        Tree::from_design(design).map_err(error)?
    };
    let action = input["action"].as_str().unwrap_or("evaluate");
    let report = match action {
        "optimize" => Some(serde_json::to_value(tree.optimize_scale().map_err(error)?).map_err(error)?),
        "optimizeEdges" => Some(serde_json::to_value(tree.optimize_edges().map_err(error)?).map_err(error)?),
        "optimizeStrain" => Some(serde_json::to_value(tree.optimize_strain().map_err(error)?).map_err(error)?),
        "evaluate" | "build" | "import" | "export" => None,
        _ => return Err("未知的树形设计操作。".into()),
    };
    if action == "build" { tree.build_polys_and_crease_pattern().map_err(error)?; }
    let snapshot = tree.snapshot();
    // A partial construction is diagnostic data, never a published full CP.
    let fold = if snapshot.cp_status_report.status == CPStatus::HasFullCp {
        Some(serde_json::to_value(tree.to_fold_document().map_err(error)?).map_err(error)?)
    } else { None };
    Ok(json!({"kind":"tree","project":tree.to_design(),"snapshot":snapshot,"report":report,"fold":fold,
        "nativeFile":if action=="export" {Some(tree.to_tmd5_string())}else{None}}))
}

fn packing_request(project: &Project, layout: LayoutMode) -> Result<optimizer::OptimizerRequest> {
    let (session, _) = BpSession::from_design(&project.design).map_err(error)?;
    let hierarchies = session.get_hierarchy(layout == LayoutMode::Random, true).map_err(error)?;
    optimizer::create_optimizer_request(project, hierarchies, OptimizerOptionsBase { layout, use_bh:false, random:0 }, true, 1).map_err(error)
}

fn box_pleating(input: Value) -> Result<Value> {
    let project: Project = if input["action"] == "import" {
        oristudio_bp::io::bps::load_project_str(input["text"].as_str().ok_or("缺少 BPS 工程内容。")?).map_err(error)?
    } else if input["project"].is_null() { Project::sample() }
    else { serde_json::from_value(input["project"].clone()).map_err(error)? };
    let mut session = BpProjectSession::new(project).map_err(error)?;
    let action = input["action"].as_str().unwrap_or("evaluate");
    let c = &input["command"];
    if action == "edit" {
        match c["type"].as_str().ok_or("缺少方格设计操作。")? {
            "moveFlap" => {session.move_flap(id(c,"id")?, Point{x:number(c,"x")?,y:number(c,"y")?},false).map_err(error)?;},
            "moveFlaps" => {session.move_flaps(&ids(c)?,Point{x:number(c,"x")?,y:number(c,"y")?},c["dragging"]==true).map_err(error)?;},
            "moveNodes" => {for p in c["positions"].as_array().ok_or("缺少节点位置。")?{session.move_vertex(id(p,"id")?,Point{x:number(p,"x")?,y:number(p,"y")?},false).map_err(error)?;}},
            "reshapeFlap" => {session.reshape_flap(id(c,"id")?,FlapReshape{anchor:Point{x:number(c,"x")?,y:number(c,"y")?},width:number(c,"width")?,height:number(c,"height")?,radius:None,vertex:None},c["dragging"]==true).map_err(error)?;},
            "resizeFlap" => {session.resize_flap(id(c,"id")?,number(c,"width")?,number(c,"height")?).map_err(error)?;},
            "moveNode" => {session.move_vertex(id(c,"id")?,Point{x:number(c,"x")?,y:number(c,"y")?},false).map_err(error)?;},
            "renameNode" => {session.rename_vertex(id(c,"id")?,c["name"].as_str().unwrap_or("").into()).map_err(error)?;},
            "edgeLength" => {session.update_edge_length(id(c,"n1")?,id(c,"n2")?,number(c,"length")?,false).map_err(error)?;},
            "addLeaf" => {session.add_leaf(id(c,"id")?,number(c,"length")?).map_err(error)?;},
            "removeLeaf" => {session.remove_leaf(vec![id(c,"id")?]).map_err(error)?;},
            "removeLeaves" => {session.remove_leaf(ids(c)?).map_err(error)?;},
            "splitEdge" => {session.split_edge(id(c,"n1")?,id(c,"n2")?).map_err(error)?;},
            "sheet" => {session.update_layout_sheet(if c["grid"]=="diag" {GridType::Diagonal}else{GridType::Rectangular},Some(number(c,"width")?),Some(number(c,"height")?)).map_err(error)?;},
            "rotate" => {session.rotate_layout_sheet(c["clockwise"]!=false).map_err(error)?;},
            "flip" => {session.flip_layout_sheet(c["horizontal"]!=false).map_err(error)?;},
            "stretchConfig" => {session.switch_stretch_config(c["id"].as_str().ok_or("缺少河道编号。")?,if c["delta"].as_i64().unwrap_or(1)<0 {-1}else{1}).map_err(error)?;},
            "stretchPattern" => {session.switch_stretch_pattern(c["id"].as_str().ok_or("缺少河道编号。")?,if c["delta"].as_i64().unwrap_or(1)<0 {-1}else{1}).map_err(error)?;},
            _ => return Err("未知的方格设计操作。".into()),
        }
    } else if action == "optimize" {
        let request = packing_request(session.project(), if input["random"]==true {LayoutMode::Random}else{LayoutMode::View})?;
        let result = optimizer::solve(&request,Some(1)).map_err(error)?;
        let optimized = optimizer::write_to_template(session.project(),&request,&result).map_err(error)?;
        session = BpProjectSession::new(optimized).map_err(error)?;
    } else if !["evaluate","build","import","export"].contains(&action) {return Err("未知的方格设计操作。".into());}
    if action == "build" {
        // Enumerate the actual alternatives during the explicit complete build.
        // A freshly restored file initially contains only its selected prototype;
        // treating that lazy list as the complete set hides valid river patterns.
        let initial = cp::project_graphics_snapshot(session.project()).map_err(error)?;
        for stretch in initial.stretches {session.complete_stretch(&stretch.id).map_err(error)?;}
    }
    let computed = session.project_for_export();
    // The frontend owns undo. Persist the kernel's file form, which preserves
    // selected river patterns without copying its second undo bank or freezing
    // a session repository into every saved edit.
    let project = session.project_for_file().map_err(error)?;
    let graphics = cp::project_graphics_snapshot(&computed).map_err(error)?;
    let packing = packing_request(&project, LayoutMode::Random).and_then(|request| {
        optimizer::validate_optimizer_packing(&request,&OptimizerResult{
            width:project.design.layout.sheet.width,height:project.design.layout.sheet.height,
            flaps:project.design.layout.flaps.iter().map(|f|FlapResult{id:f.id,x:f.x,y:f.y}).collect(),
        }).map_err(error)
    });
    let ready = packing.is_ok() && graphics.invalid_junctions.is_empty() && !graphics.pattern_not_found && project.design.layout.flaps.len()>=2;
    let pattern = if ready {Some(cp::project_crease_pattern_snapshot(&computed,CpExportOptions::default()).map_err(error)?)}else{None};
    Ok(json!({"kind":"box","project":project,"graphics":graphics,"pattern":pattern,"ready":ready,"packingError":packing.err()}))
}

pub fn run_stdio() -> std::result::Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let stdin = io::stdin(); let mut output = io::BufWriter::new(io::stdout());
    for line in stdin.lock().lines() {
        let line = line?;
        let answer = std::panic::catch_unwind(|| {
            serde_json::from_str::<Value>(&line).map_err(error).and_then(compute)
        });
        let value = match answer {
            Ok(Ok(value)) => json!({"result":value}),
            Ok(Err(message)) => json!({"error":message}),
            Err(_) => json!({"error":"设计计算发生内部错误；当前工程保持不变，可调整后重试。"}),
        };
        serde_json::to_writer(&mut output,&value)?; output.write_all(b"\n")?;output.flush()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn tree_project()->Value{json!({"paper":{"width":1.,"height":1.,"scale":0.1,"has_symmetry":false,"sym_loc":{"x":0.5,"y":0.},"sym_angle":90.},"nodes":[{"id":1,"label":"中心","loc":{"x":0.5,"y":0.5}},{"id":2,"label":"A","loc":{"x":0.15,"y":0.15}},{"id":3,"label":"B","loc":{"x":0.85,"y":0.15}},{"id":4,"label":"C","loc":{"x":0.85,"y":0.85}},{"id":5,"label":"D","loc":{"x":0.15,"y":0.85}}],"edges":(2..=5).map(|n|json!({"id":n-1,"label":"","nodes":[1,n],"length":1.,"strain":0.,"stiffness":1.})).collect::<Vec<_>>(),"conditions":[]})}
    fn box_project()->Value{json!({"version":"0.7","design":{"title":"方格基础形","mode":"layout","tree":{"sheet":{"type":"rect","width":20.,"height":20.},"nodes":[{"id":0,"name":"中心","x":10.,"y":10.},{"id":1,"name":"A","x":4.,"y":4.},{"id":2,"name":"B","x":16.,"y":4.},{"id":3,"name":"C","x":10.,"y":16.}],"edges":[{"n1":0,"n2":1,"length":3.},{"n1":0,"n2":2,"length":3.},{"n1":0,"n2":3,"length":3.}]},"layout":{"sheet":{"type":"rect","width":16.,"height":16.},"flaps":[{"id":1,"x":4.,"y":4.,"width":0.,"height":0.},{"id":2,"x":12.,"y":4.,"width":0.,"height":0.},{"id":3,"x":8.,"y":12.,"width":0.,"height":0.}],"stretches":[]}}})}
    #[test]
    fn tree_optimization_builds_a_real_cp_and_tmd_reopens(){
        let initial=tree_project();
        let unbuilt=compute(json!({"kind":"tree","project":initial,"action":"evaluate"})).unwrap();
        assert!(unbuilt["fold"].is_null());
        let optimized=compute(json!({"kind":"tree","project":initial,"action":"optimize"})).unwrap();
        assert_eq!(optimized["snapshot"]["summary"]["is_feasible"],true);
        assert!(optimized["project"]["paper"]["scale"].as_f64().unwrap()>0.4);
        let built=compute(json!({"kind":"tree","project":optimized["project"],"action":"build"})).unwrap();
        assert_eq!(built["snapshot"]["cp_status_report"]["status"],"has_full_cp");
        assert!(built["fold"]["edges_vertices"].as_array().unwrap().len()>8);
        let exported=compute(json!({"kind":"tree","project":built["project"],"action":"export"})).unwrap();
        let reopened=compute(json!({"kind":"tree","action":"import","text":exported["nativeFile"]})).unwrap();
        // The legacy TMD5 writer rounds decimal coordinates; the native JSON
        // design file retains full f64 precision. Check that legacy conversion
        // stays inside its declared decimal precision and keeps the topology.
        assert_eq!(reopened["project"]["edges"],exported["project"]["edges"]);
        for (a,b) in reopened["project"]["nodes"].as_array().unwrap().iter().zip(exported["project"]["nodes"].as_array().unwrap()) {
            assert_eq!(a["label"],b["label"]);
            for axis in ["x","y"]{assert!((a["loc"][axis].as_f64().unwrap()-b["loc"][axis].as_f64().unwrap()).abs()<1e-9);}
        }
        let rebuilt=compute(json!({"kind":"tree","project":reopened["project"],"action":"build"})).unwrap();
        assert_eq!(rebuilt["snapshot"]["cp_status_report"]["status"],"has_full_cp");
        assert_eq!(rebuilt["fold"]["edges_vertices"].as_array().unwrap().len(),built["fold"]["edges_vertices"].as_array().unwrap().len());
    }
    #[test]
    fn bp_edit_save_reopen_retains_geometry_without_a_second_undo_bank(){
        let first=compute(json!({"kind":"box","project":box_project(),"action":"build"})).unwrap();
        assert_eq!(first["ready"],true);assert!(first["pattern"]["lines"].as_array().unwrap().len()>20);
        assert!(first["pattern"]["lines"].as_array().unwrap().iter().any(|l|l["assignment"]=="mountain"));
        let changed=compute(json!({"kind":"box","project":first["project"],"action":"edit","command":{"type":"moveFlap","id":3,"x":8,"y":11}})).unwrap();
        assert!(changed["project"]["history"].is_null());
        let imported=compute(json!({"kind":"box","action":"import","text":changed["project"].to_string()})).unwrap();
        assert_eq!(imported["project"],changed["project"]);assert_eq!(imported["pattern"],changed["pattern"]);
        let bad=compute(json!({"kind":"box","project":first["project"],"action":"edit","command":{"type":"edgeLength","n1":0,"n2":1,"length":-2}}));
        assert!(bad.is_err());assert_eq!(first["ready"],true);
    }
    #[test]
    fn tree_and_bp_reject_foreign_or_broken_sources(){
        assert!(compute(json!({"kind":"tree","action":"import","text":"broken file"})).is_err());
        assert!(compute(json!({"kind":"box","action":"import","text":"{}"})).is_err());
        let mut broken=tree_project();broken["edges"][0]["nodes"]=json!([1,900]);
        assert!(compute(json!({"kind":"tree","project":broken,"action":"build"})).is_err());
    }
    #[test]
    fn complete_bp_build_exposes_real_alternatives_and_preserves_the_chosen_pattern(){
        let fixture=include_str!(concat!(env!("CARGO_MANIFEST_DIR"),"/../vendor/design/ori-studio/tests/fixtures/bp-studio/pythagorean-stretch-file-pattern0.sample.json"));
        let source:Value=serde_json::from_str(fixture).unwrap();
        let built=compute(json!({"kind":"box","action":"build","project":source})).unwrap();
        assert!(built["graphics"]["stretches"][0]["patternCount"].as_u64().unwrap()>=2);
        let changed=compute(json!({"kind":"box","action":"edit","project":built["project"],"command":{"type":"stretchPattern","id":built["graphics"]["stretches"][0]["id"],"delta":1}})).unwrap();
        assert_ne!(changed["graphics"]["deviceGraphics"],built["graphics"]["deviceGraphics"]);
        let reopened=compute(json!({"kind":"box","action":"build","project":changed["project"]})).unwrap();
        assert_eq!(reopened["graphics"]["deviceGraphics"],changed["graphics"]["deviceGraphics"]);
        assert_eq!(reopened["pattern"],changed["pattern"]);
        assert!(changed["project"]["history"].is_null());
    }
    #[test]
    fn group_drag_uses_one_constrained_displacement_and_reshape_is_atomic(){
        let source=box_project();
        let moved=compute(json!({"kind":"box","project":source,"action":"edit","command":{"type":"moveFlaps","ids":[1,2],"x":14.,"y":4.,"dragging":true}})).unwrap();
        let flaps=moved["project"]["design"]["layout"]["flaps"].as_array().unwrap();
        let x=|id:u64|flaps.iter().find(|f|f["id"]==id).unwrap()["x"].as_f64().unwrap();
        assert_eq!(x(2)-x(1),8.);assert!(x(2)<=16.);
        let reshape=compute(json!({"kind":"box","project":source,"action":"edit","command":{"type":"reshapeFlap","id":3,"x":7.,"y":10.,"width":2.,"height":1.}})).unwrap();
        let flap=reshape["project"]["design"]["layout"]["flaps"].as_array().unwrap().iter().find(|f|f["id"]==3).unwrap();
        assert_eq!(flap["x"],7.);assert_eq!(flap["y"],10.);assert_eq!(flap["width"],2.);assert_eq!(flap["height"],1.);
        assert!(compute(json!({"kind":"box","project":source,"action":"edit","command":{"type":"reshapeFlap","id":3,"x":100.,"y":10.,"width":2.,"height":1.}})).is_err());
        let nodes=compute(json!({"kind":"box","project":source,"action":"edit","command":{"type":"moveNodes","positions":[{"id":1,"x":5.,"y":6.},{"id":2,"x":17.,"y":6.}]}})).unwrap();
        assert_eq!(nodes["project"]["design"]["layout"],source["design"]["layout"]);
    }
}
