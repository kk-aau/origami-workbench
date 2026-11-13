pub mod storage;
pub mod activity;
pub mod artwork;
pub mod validation;
pub mod projects;
pub mod tess;
pub mod server;
pub mod operations;
pub mod design;
pub mod pdf;
pub mod document_workers;

pub use server::{start, AppState, RunningServer, ServerConfig};
pub use validation::validate_doc;
pub use validation as validate;

use axum::{http::StatusCode, response::{IntoResponse, Response}, Json};
use serde_json::{json, Value};

#[derive(Debug, Clone)]
pub struct ApiError { pub status: u16, pub message: String, pub data: Value }
impl ApiError {
    pub fn new(status: u16, message: impl Into<String>) -> Self { Self { status, message: message.into(), data: Value::Null } }
    pub fn with_data(mut self, data: Value) -> Self { self.data = data; self }
    pub fn value(&self) -> Value {
        let mut value=json!({"error":self.message});
        if let Some(data)=self.data.as_object() { for (k,v) in data {value[k]=v.clone();} }
        value
    }
}
impl std::fmt::Display for ApiError { fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {f.write_str(&self.message)} }
impl std::error::Error for ApiError {}
impl From<std::io::Error> for ApiError {
    fn from(error: std::io::Error) -> Self {
        if error.kind()==std::io::ErrorKind::NotFound { Self::new(404,"文件不存在。请从工程库选择其他工程。") }
        else {Self::new(503,format!("本地文件操作失败，原内容已保留：{error}"))}
    }
}
impl From<serde_json::Error> for ApiError {fn from(_:serde_json::Error)->Self{Self::new(400,"请求不是有效的 JSON 数据。")}}
impl IntoResponse for ApiError {
    fn into_response(self)->Response {(StatusCode::from_u16(self.status).unwrap_or(StatusCode::BAD_REQUEST),Json(self.value())).into_response()}
}
