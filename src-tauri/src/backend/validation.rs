use super::ApiError;
use serde_json::Value;
use std::collections::HashSet;

fn fail(message:impl Into<String>)->ApiError {ApiError::new(400,message)}
fn number(v:&Value)->Option<f64>{v.as_f64().filter(|n|n.is_finite())}
fn finite(v:&Value,limit:f64)->bool{number(v).is_some_and(|n|n.abs()<=limit)}
fn positive(v:&Value)->bool{number(v).is_some_and(|n|n>0.0&&n<=1e6)}
fn point(v:&Value)->bool{v.as_array().is_some_and(|a|a.len()==2&&a.iter().all(|n|finite(n,1e6)))}
fn color(v:&Value)->bool{v.as_str().is_some_and(|s|s.len()==7&&s.starts_with('#')&&s[1..].bytes().all(|b|b.is_ascii_hexdigit()))}
fn string_length(s:&str)->usize{s.encode_utf16().count()}

pub fn validate_doc(d:&Value)->Result<(),ApiError>{
    if !d.is_object()||!d["name"].is_string()||!d["paper"].is_object()||!d["segments"].is_array(){return Err(fail("工程格式无效：缺少名称、纸张或线段。"))}
    if d.get("schemaVersion").is_some_and(|v|number(v)!=Some(1.0)&&number(v)!=Some(2.0)){return Err(fail("工程版本不受支持，不能保证无损读取。"))}
    if !positive(&d["paper"]["width"])||!positive(&d["paper"]["height"]){return Err(fail("纸张宽高必须是 0 到 1,000,000 之间的有限毫米值。"))}
    let mut ids=HashSet::new();
    for s in d["segments"].as_array().unwrap(){
        let id=s["id"].as_str().filter(|s|!s.is_empty()).ok_or_else(||fail("线段标识缺失或重复。"))?;
        if !ids.insert(id){return Err(fail("线段标识缺失或重复。"))}
        if s.get("displayColor").is_some_and(|v|!color(v)){return Err(fail(format!("线段 {id} 的显示颜色必须为六位十六进制色值。")))}
        if !point(&s["a"])||!point(&s["b"]){return Err(fail(format!("线段 {id} 的坐标无效或超出范围。")))}
        let assignment=s["assignment"].as_str().unwrap_or("");
        if !["M","V","B","U","A","F"].contains(&assignment){return Err(fail(format!("线段 {id} 的山谷类型无效。")))}
        let angle=s.get("angle").ok_or_else(||fail(format!("线段 {id} 的目标角度必须在 -180° 到 180° 之间。")))?;
        if !angle.is_null()&&!finite(angle,180.0){return Err(fail(format!("线段 {id} 的目标角度必须在 -180° 到 180° 之间。")))}
        if number(angle).is_some_and(|n|assignment=="M"&&n>0.0||assignment=="V"&&n<0.0){return Err(fail(format!("线段 {id} 的山谷类型与目标角度符号冲突。")))}
        if ["A","B","F"].contains(&assignment)&&!angle.is_null()&&number(angle)!=Some(0.0){return Err(fail(format!("边界、辅助线和展开线不能设置非零折角（{id}）。")))}
    }
    if let Some(value)=d.get("background"){validate_background(value)?;}
    if let Some(value)=d.get("flatFold"){validate_flat_fold(value)?;}
    if let Some(objects)=d.get("objects"){
        let objects=objects.as_array().filter(|a|a.len()<=1500).ok_or_else(||fail("辅助对象必须是数组，且不超过 1500 个。"))?;
        for o in objects {
            let id=o["id"].as_str().filter(|s|!s.is_empty()).ok_or_else(||fail("对象标识缺失或与其他对象、线段重复。"))?;
            if !ids.insert(id){return Err(fail("对象标识缺失或与其他对象、线段重复。"))}
            if !color(&o["color"]){return Err(fail(format!("对象 {id} 颜色必须为六位十六进制色值。")))}
            match o["kind"].as_str(){
                Some("circle")=>if !point(&o["center"])||!positive(&o["radius"]){return Err(fail(format!("圆 {id} 的圆心或半径无效。")))},
                Some("text")=>if !point(&o["position"])||!positive(&o["fontSize"])||!o["text"].as_str().is_some_and(|s|string_length(s)<=10000){return Err(fail(format!("文字 {id} 的位置、字号或内容无效。")))},
                Some("mark")=>if !point(&o["a"])||!point(&o["b"]){return Err(fail(format!("标记 {id} 的坐标无效。")))},
                _=>return Err(fail("工程包含未支持的对象类型，未丢弃或覆盖原工程。"))
            }
        }
    }
    Ok(())
}

fn validate_flat_fold(v:&Value)->Result<(),ApiError>{
    let object=v.as_object().ok_or_else(||fail("平折设置格式无效。"))?;
    if object.keys().any(|k|k!="startingFace"&&k!="materialFace"){return Err(fail("平折设置格式无效。"))}
    if v.get("materialFace").is_some_and(|n|!number(n).is_some_and(|n|n.fract()==0.0&&(0.0..8192.0).contains(&n))){return Err(fail("材料起始面索引无效。"))}
    let face=v["startingFace"].as_array().filter(|a|(3..=6000).contains(&a.len())&&a.iter().all(point)).ok_or_else(||fail("起始面轮廓必须包含 3–6000 个有效二维顶点。"))?;
    let mut seen=HashSet::new();
    for p in face {let a=number(&p[0]).unwrap();let b=number(&p[1]).unwrap();let key=(if a==0.0{0}else{a.to_bits()},if b==0.0{0}else{b.to_bits()});if !seen.insert(key){return Err(fail("起始面轮廓不能含重复顶点。"))}}
    Ok(())
}

fn decode_base64(s:&str)->Result<Vec<u8>,ApiError>{
    let bad=||fail("底图 Base64 数据无效。");
    if s.is_empty()||s.len()%4!=0{return Err(bad())}
    let mut out=Vec::with_capacity(s.len()/4*3);
    for (i,q) in s.as_bytes().chunks_exact(4).enumerate(){
        let mut vals=[0u32;4];let mut padding=0;
        for j in 0..4 {vals[j]=match q[j]{b'A'..=b'Z'=>(q[j]-b'A')as u32,b'a'..=b'z'=>(q[j]-b'a'+26)as u32,b'0'..=b'9'=>(q[j]-b'0'+52)as u32,b'+'=>62,b'/'=>63,b'=' if j>=2&&i==s.len()/4-1=>{padding+=1;0},_=>return Err(bad())};if padding>0&&q[j]!=b'='{return Err(bad())}}
        let n=(vals[0]<<18)|(vals[1]<<12)|(vals[2]<<6)|vals[3];out.push((n>>16)as u8);if padding<2{out.push((n>>8)as u8)}if padding==0{out.push(n as u8)}
    }
    Ok(out)
}
fn raster_dimensions(bytes:&[u8],mime:&str)->Result<(u32,u32),ApiError>{
    let bad=||fail("底图文件头损坏、截断或不支持，无法核实尺寸。");
    let slice=|p:usize,n:usize|bytes.get(p..p+n).ok_or_else(bad);
    let be16=|p|->Result<u32,ApiError>{let b=slice(p,2)?;Ok(u16::from_be_bytes([b[0],b[1]])as u32)};
    let be32=|p|->Result<u32,ApiError>{let b=slice(p,4)?;Ok(u32::from_be_bytes(b.try_into().unwrap()))};
    let le32=|p|->Result<u32,ApiError>{let b=slice(p,4)?;Ok(u32::from_le_bytes(b.try_into().unwrap()))};
    let le24=|p|->Result<u32,ApiError>{let b=slice(p,3)?;Ok(b[0]as u32|((b[1]as u32)<<8)|((b[2]as u32)<<16))};
    let result=if mime=="png"{
        if slice(0,8)?!=b"\x89PNG\r\n\x1a\n"||be32(8)?!=13||slice(12,4)?!=b"IHDR"{return Err(bad())}slice(16,17)?;(be32(16)?,be32(20)?)
    }else if mime=="jpeg"{
        if be16(0)?!=0xffd8{return Err(bad())}let mut p=2;let mut found=None;
        while p<bytes.len(){if slice(p,1)?[0]!=255{return Err(bad())}p+=1;while bytes.get(p)==Some(&255){p+=1}let marker=slice(p,1)?[0];p+=1;
            if marker==0xda||marker==0xd9{return Err(bad())}if marker==1||(0xd0..=0xd7).contains(&marker){continue}let len=be16(p)?as usize;if len<2{return Err(bad())}slice(p,len)?;
            if [0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].contains(&marker){if len<8{return Err(bad())}found=Some((be16(p+5)?,be16(p+3)?));break}p+=len;
        }found.ok_or_else(bad)?
    }else{
        if slice(0,4)?!=b"RIFF"||slice(8,4)?!=b"WEBP"||le32(4)?as usize+8!=bytes.len(){return Err(bad())}let kind=slice(12,4)?;let len=le32(16)?as usize;slice(20,len)?;
        if kind==b"VP8X"{if len!=10{return Err(bad())}(le24(24)?+1,le24(27)?+1)}
        else if kind==b"VP8L"{if len<5||bytes[20]!=0x2f{return Err(bad())}let bits=le32(21)?;if bits>>29!=0{return Err(bad())}((bits&0x3fff)+1,((bits>>14)&0x3fff)+1)}
        else if kind==b"VP8 "{if len<10||bytes[20]&1!=0||slice(23,3)?!=b"\x9d\x01\x2a"{return Err(bad())}((bytes[26]as u32+256*bytes[27]as u32)&0x3fff,(bytes[28]as u32+256*bytes[29]as u32)&0x3fff)}else{return Err(bad())}
    };
    if result.0==0||result.1==0||result.0>16384||result.1>16384||u64::from(result.0)*u64::from(result.1)>40_000_000{return Err(fail("底图实际尺寸过大或无效，最多4000万像素、单边16384像素。"))}Ok(result)
}
fn validate_background(v:&Value)->Result<(),ApiError>{
    if !v.is_object(){return Err(fail("底图数据无效。"))}
    if let Some(view)=v.get("viewport"){if !view.is_object()||!finite(&view["x"],1e6)||!finite(&view["y"],1e6)||!number(&view["units"]).is_some_and(|n|(1e-9..=1e6).contains(&n)){return Err(fail("底图屏幕参照坐标或比例无效。"))}}
    if !v["name"].as_str().is_some_and(|s|string_length(s)<=255){return Err(fail("底图名称无效或过长。"))}
    let url=v["dataUrl"].as_str().filter(|s|s.len()<=4_000_000).ok_or_else(||fail("底图数据超过保存限额，请缩小图片后重试。"))?;
    let (mime,payload)=["png","jpeg","webp"].iter().find_map(|mime|url.strip_prefix(&format!("data:image/{mime};base64,")).map(|p|(*mime,p))).ok_or_else(||fail("底图只能保存内嵌 PNG、JPEG 或 WebP 图片，不接受网络链接或 SVG。"))?;
    let bytes=decode_base64(payload)?;
    let magic=match mime{"png"=>bytes.starts_with(b"\x89PNG\r\n\x1a\n"),"jpeg"=>bytes.starts_with(b"\xff\xd8\xff"),_=>bytes.starts_with(b"RIFF")&&bytes.get(8..12)==Some(b"WEBP".as_slice())};
    if !magic{return Err(fail("底图内容与图片格式不一致。"))}let (width,height)=raster_dimensions(&bytes,mime)?;
    if number(&v["width"])!=Some(width as f64)||number(&v["height"])!=Some(height as f64){return Err(fail("底图记录尺寸与文件头实际尺寸不一致。"))}
    if !number(&v["opacity"]).is_some_and(|n|(0.0..=1.0).contains(&n))||!v["visible"].is_boolean(){return Err(fail("底图透明度或显示状态无效。"))}
    let p=&v["placement"];if !point(&p["origin"])||!point(&p["axis"]){return Err(fail("底图配准位置或缩放无效。"))}
    let (ox,oy,ux,uy)=(p["origin"][0].as_f64().unwrap(),p["origin"][1].as_f64().unwrap(),p["axis"][0].as_f64().unwrap(),p["axis"][1].as_f64().unwrap());
    if ux.hypot(uy)<1e-9{return Err(fail("底图配准位置或缩放无效。"))}
    for (x,y) in [(0.0,0.0),(width as f64,0.0),(width as f64,height as f64),(0.0,height as f64)]{if (ox+x*ux-y*uy).abs()>1e6||(oy+x*uy+y*ux).abs()>1e6{return Err(fail("底图角点超出坐标范围。"))}}
    Ok(())
}

#[cfg(test)] mod tests{
 use super::*;use serde_json::json;
 fn doc()->Value{json!({"name":"中文","paper":{"width":200,"height":160},"segments":[{"id":"m","a":[0,0],"b":[200,160],"assignment":"M","angle":-180}]})}
 #[test]fn rejects_invalid_replacement_before_disk(){let d=doc();assert!(validate_doc(&d).is_ok());let mut v=d.clone();v["segments"][0]["angle"]=json!(180);assert!(validate_doc(&v).is_err());v=d.clone();v["segments"][0].as_object_mut().unwrap().remove("angle");assert!(validate_doc(&v).is_err());v=d;let duplicate=v["segments"][0].clone();v["segments"].as_array_mut().unwrap().push(duplicate);assert!(validate_doc(&v).is_err());}
 #[test]fn unknown_objects_are_not_discarded(){let mut d=doc();d["objects"]=json!([{"id":"x","kind":"unknown","color":"#123456"}]);assert!(validate_doc(&d).is_err());}
}
