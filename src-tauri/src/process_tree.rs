//! A non-inheritable Job Object owns this process and all descendants.
//! Windows closes its handle even after TerminateProcess, killing Python as well.
//! The handle deliberately lives until OS process teardown, rather than a Rust
//! Drop that could terminate the owning process during its graceful shutdown.

#[cfg(windows)]
pub fn constrain_process_tree() -> Result<(), String> {
    use std::{mem::{size_of, zeroed}, sync::OnceLock};
    use windows_sys::Win32::{Foundation::CloseHandle, System::{JobObjects::*, Threading::GetCurrentProcess}};
    static JOB: OnceLock<usize> = OnceLock::new();
    if JOB.get().is_some() { return Ok(()); }
    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() { return Err(format!("无法建立本机计算进程保护：{}", std::io::Error::last_os_error())); }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if SetInformationJobObject(job, JobObjectExtendedLimitInformation, &info as *const _ as *const _, size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32) == 0 {
            let error = std::io::Error::last_os_error(); CloseHandle(job);
            return Err(format!("无法设置计算进程退出保护：{error}"));
        }
        if AssignProcessToJobObject(job, GetCurrentProcess()) == 0 {
            let error = std::io::Error::last_os_error(); CloseHandle(job);
            return Err(format!("无法启用计算进程退出保护：{error}"));
        }
        let _ = JOB.set(job as usize);
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn constrain_process_tree() -> Result<(), String> { Ok(()) }
