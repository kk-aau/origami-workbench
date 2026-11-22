use crate::current_version;
use serde_json::{json, Value};

const PAGE: &str = "https://github.com/kk-aau/origami-workbench/releases/latest";
const TAG_PREFIX: &str = "https://github.com/kk-aau/origami-workbench/releases/tag/";
const BAD_VERSION: &str = "发行版本号无法识别。";

fn version_parts(version: &str) -> Result<[u32; 4], String> {
    let (base, build) = version.split_once("-tauri.").ok_or(BAD_VERSION)?;
    let mut fields = base.split('.');
    let mut numbers = [0; 4];
    for (index, number) in numbers.iter_mut().enumerate() {
        let s = if index == 3 { build } else { fields.next().ok_or(BAD_VERSION)? };
        if !s.bytes().all(|c| c.is_ascii_digit()) { return Err(BAD_VERSION.into()); }
        *number = s.parse().map_err(|_| BAD_VERSION)?;
    }
    if fields.next().is_some() { return Err(BAD_VERSION.into()); }
    Ok(numbers)
}



fn compare(current: &str, location: &str) -> Result<Value,String> {
    let tag = location.strip_prefix(TAG_PREFIX).ok_or("发布页未返回本项目的版本标签。")?;
    let latest = tag.strip_prefix('v').unwrap_or(tag);
    Ok(json!({"current":current,"latest":latest,"available":version_parts(latest)? > version_parts(current)?}))
}

pub(super) fn check() -> Result<Value,String> {
    compare(&current_version()?, &latest_location()?)
}

#[cfg(windows)]
fn latest_location() -> Result<String,String> {
    use std::{ffi::c_void, ptr::{null,null_mut}};
    use windows_sys::Win32::Networking::WinHttp::*;
    struct Handle(*mut c_void);
    impl Drop for Handle { fn drop(&mut self) { unsafe { WinHttpCloseHandle(self.0); } } }
    let network = || format!("无法检查更新，请检查网络后重试。（{}）",std::io::Error::last_os_error());
    let handle = |raw: *mut c_void| if raw.is_null() { Err(network()) } else { Ok(Handle(raw)) };
    let ok = |result: i32| if result == 0 { Err(network()) } else { Ok(()) };
    let wide = |s: &str| s.encode_utf16().chain(Some(0)).collect::<Vec<_>>();
    unsafe {
        let session = handle(WinHttpOpen(wide("ZhezhiWorkbench").as_ptr(),WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,null(),null(),0))?;
        ok(WinHttpSetTimeouts(session.0,4000,4000,5000,5000))?;
        let url = tauri::Url::parse(PAGE).map_err(|e|e.to_string())?;
        let host = wide(url.host_str().ok_or("更新地址无效。")?);
        let connection = handle(WinHttpConnect(session.0,host.as_ptr(),443,0))?;
        let request = handle(WinHttpOpenRequest(connection.0,wide("HEAD").as_ptr(),wide(url.path()).as_ptr(),null(),null(),null(),WINHTTP_FLAG_SECURE))?;
        let disabled: u32 = WINHTTP_DISABLE_REDIRECTS;
        ok(WinHttpSetOption(request.0,WINHTTP_OPTION_DISABLE_FEATURE,(&disabled as *const u32).cast(),4))?;
        ok(WinHttpSendRequest(request.0,null(),0,null(),0,0,0))?;
        ok(WinHttpReceiveResponse(request.0,null_mut()))?;
        let mut status = 0u32;
        let mut bytes = 4;
        ok(WinHttpQueryHeaders(request.0,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,null(),(&mut status as *mut u32).cast(),&mut bytes,null_mut()))?;
        if !(300..400).contains(&status) { return Err(format!("发布页未返回版本信息（HTTP {status}）。")); }
        let mut buffer = [0u16; 1024];
        bytes = std::mem::size_of_val(&buffer) as u32;
        ok(WinHttpQueryHeaders(request.0,WINHTTP_QUERY_LOCATION,null(),buffer.as_mut_ptr().cast(),&mut bytes,null_mut()))?;
        String::from_utf16(&buffer[..bytes as usize/2]).map_err(|_|"发布页地址无效。".into())
    }
}

#[cfg(windows)]
pub(super) fn open_page() -> Result<(),String> {
    use std::ptr::null;
    let url: Vec<_> = PAGE.encode_utf16().chain(Some(0)).collect();
    let result = unsafe { windows_sys::Win32::UI::Shell::ShellExecuteW(std::ptr::null_mut(),null(),url.as_ptr(),null(),null(),1) };
    if result as isize <= 32 { return Err("无法打开默认浏览器。".into()); }
    Ok(())
}
#[cfg(not(windows))]
fn latest_location() -> Result<String,String> { Err("此发行通道适用于 Windows 桌面版。".into()) }
#[cfg(not(windows))]
pub(super) fn open_page() -> Result<(),String> { Err("此发行通道适用于 Windows 桌面版。".into()) }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn compares_numeric_release_and_candidate() {
        for (current,latest,expected) in [
            ("0.13.53-tauri.73","0.13.53-tauri.59",false),
            ("0.13.53-tauri.99","0.13.53-tauri.100",true),
            ("0.13.53-tauri.73","0.13.53-tauri.73",false),
            ("0.13.53-tauri.99","0.14.0-tauri.1",true),
        ] { assert_eq!(compare(current,&format!("{TAG_PREFIX}v{latest}")).unwrap()["available"],expected); }
        assert!(compare("0.13.53-tauri.73","https://github.com/another/releases/tag/v9.0.0-tauri.1").is_err());
        assert!(compare("0.13.53-tauri.73",&format!("{TAG_PREFIX}v0.13.53-tauri.beta")).is_err());
    }
    #[test]
    #[ignore = "访问公开发行页，需要联网"]
    fn live_release() { println!("{}", check().unwrap()); }
}
