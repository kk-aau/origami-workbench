use super::{storage::atomic_bytes, ApiError};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

// Only derived numeric contact orders are kept here. Limits affect reuse,
// never the size of a project that the importer can open.
pub const ENTRY_LIMIT: usize = 8 * 1024 * 1024;
const TOTAL_LIMIT: u64 = 64 * 1024 * 1024;

pub fn valid_key(key: &str) -> bool {
    key.len() == 64 && key.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}

fn digest(key: &str, payload: &[u8]) -> [u8; 32] {
    Sha256::new().chain_update(key.as_bytes()).chain_update(payload).finalize().into()
}

pub fn read(dir: &Path, key: &str) -> Result<Option<Vec<u8>>, ApiError> {
    let path = dir.join(key);
    let meta = match fs::metadata(&path) {
        Ok(meta) => meta,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.into()),
    };
    if meta.len() > (ENTRY_LIMIT + 32) as u64 { return Ok(None); }
    let bytes = fs::read(path)?;
    let Some((checksum, payload)) = bytes.split_at_checked(32) else { return Ok(None) };
    Ok((digest(key, payload) == checksum).then(|| payload.to_vec()))
}

pub fn write(dir: &Path, key: &str, payload: &[u8]) -> Result<(), ApiError> {
    if payload.len() > ENTRY_LIMIT { return Err(ApiError::new(413, "缓存过大。")); }
    let mut bytes = Vec::with_capacity(payload.len() + 32);
    bytes.extend(digest(key, payload));
    bytes.extend_from_slice(payload);
    atomic_bytes(&dir.join(key), &bytes)?;
    let mut files = Vec::new();
    let mut total = 0;
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        if !valid_key(&entry.file_name().to_string_lossy()) { continue; }
        let info = entry.metadata()?;
        total += info.len();
        if entry.file_name() != key {
            files.push((info.modified()?, entry.path(), info.len()));
        }
    }
    files.sort_unstable();
    for (_, path, size) in files {
        if total <= TOTAL_LIMIT { break; }
        fs::remove_file(path)?;
        total -= size;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn damaged_or_swapped_entries_are_cache_misses_and_can_be_rebuilt() {
        let dir = tempfile::tempdir().unwrap();
        let a = "a".repeat(64);
        let b = "b".repeat(64);
        assert!(!valid_key("../data"));
        assert!(valid_key(&a));
        write(dir.path(), &a, b"[[[1,0,1]]]").unwrap();
        assert_eq!(read(dir.path(), &a).unwrap().unwrap(), b"[[[1,0,1]]]");
        fs::copy(dir.path().join(&a), dir.path().join(&b)).unwrap();
        assert!(read(dir.path(), &b).unwrap().is_none());
        fs::write(dir.path().join(&a), b"truncated").unwrap();
        assert!(read(dir.path(), &a).unwrap().is_none());
        write(dir.path(), &a, b"[[]]").unwrap();
        assert_eq!(read(dir.path(), &a).unwrap().unwrap(), b"[[]]");
    }
}
