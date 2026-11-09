//! Convert one self-contained page. No files are written and SVG references
//! cannot read local files or fetch remote resources. Saving remains the native
//! export transaction's responsibility.
use super::ApiError;
use std::sync::{Arc, OnceLock};
use svg2pdf::usvg::{self, fontdb};

pub fn validate_svg(svg: &str) -> Result<(), ApiError> {
    let xml = roxmltree::Document::parse(svg)
        .map_err(|_| ApiError::new(400, "PDF 页面不是有效的 SVG。"))?;
    if xml.root_element().tag_name().name() != "svg" {
        return Err(ApiError::new(400, "PDF 页面必须是 SVG。"));
    }
    for node in xml.descendants().filter(|n| n.is_element()) {
        if matches!(node.tag_name().name(), "script" | "foreignObject" | "style") {
            return Err(ApiError::new(400, "PDF 页面包含不支持的外部样式或交互内容。"));
        }
        for attr in node.attributes() {
            let value = attr.value().trim();
            if attr.name() == "href" && !value.starts_with('#')
                && !(node.tag_name().name() == "image"
                    && ["data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,"].iter().any(|prefix| value.starts_with(prefix)))
            {
                return Err(ApiError::new(400, "PDF 图片必须内嵌为 PNG、JPEG 或 WebP，不能引用外部文件。"));
            }
            // Generated paint/clip/mask references only refer to local IDs.
            if value.contains("url(") && value.split("url(").skip(1).any(|s| !s.starts_with('#')) {
                return Err(ApiError::new(400, "PDF 页面不能引用外部资源。"));
            }
        }
    }
    Ok(())
}

fn fonts() -> Arc<fontdb::Database> {
    static FONTS: OnceLock<Arc<fontdb::Database>> = OnceLock::new();
    FONTS.get_or_init(|| {
        let mut fonts = fontdb::Database::new();
        fonts.load_system_fonts();
        let family = ["Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Noto Sans SC", "Arial"]
            .into_iter().find(|name| fonts.query(&fontdb::Query { families: &[fontdb::Family::Name(name)], ..Default::default() }).is_some());
        if let Some(family) = family { fonts.set_sans_serif_family(family); }
        Arc::new(fonts)
    }).clone()
}

pub fn convert(svg: &str) -> Result<Vec<u8>, ApiError> {
    validate_svg(svg)?;
    let fontdb = fonts();
    if fontdb.is_empty() { return Err(ApiError::new(503, "未找到本机字体，无法完整导出 PDF 文字。")); }
    let mut options = usvg::Options { fontdb, font_family: "sans-serif".into(), ..Default::default() };
    // Even in a nested parser path, no filesystem reference may be resolved.
    options.image_href_resolver.resolve_string = Box::new(|_, _| None);
    let tree = usvg::Tree::from_str(svg, &options)
        .map_err(|e| ApiError::new(400, format!("PDF 页面解析失败：{e}")))?;
    svg2pdf::to_pdf(&tree, svg2pdf::ConversionOptions::default(), svg2pdf::PageOptions { dpi: 72.0 })
        .map_err(|e| ApiError::new(422, format!("矢量 PDF 转换失败，未保存文件：{e}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_external_and_nested_active_content() {
        for content in [r#"<image href="file:///C:/private.png"/>"#, r#"<image href="https://example.com/a.png"/>"#,
            r#"<image href="data:image/svg+xml;base64,PHN2Zy8+"/>"#, "<script/>", "<style>text {fill:red}</style>",
            r#"<path fill="url(file:///private.svg)"/>"#] {
            assert!(validate_svg(&format!(r#"<svg xmlns="http://www.w3.org/2000/svg">{content}</svg>"#)).is_err());
        }
        assert!(validate_svg(r##"<svg xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="clip"/></defs><g clip-path="url(#clip)"><path d="M0 0L1 1"/></g></svg>"##).is_ok());
    }
    #[test]
    fn exports_vector_paths_and_embedded_searchable_chinese() {
        let pdf = convert(r##"<svg xmlns="http://www.w3.org/2000/svg" width="595" height="842"><path d="M10 10L80 70" stroke="#123456"/><text x="20" y="120" font-family="Microsoft YaHei,Noto Sans CJK SC,sans-serif" font-size="16">折纸工坊 PDF</text></svg>"##).unwrap();
        let text = String::from_utf8_lossy(&pdf);
        assert!(text.starts_with("%PDF-"));
        assert!(text.contains("/ToUnicode"), "text must remain searchable");
        assert!(text.contains("/FontFile"), "used fonts must be embedded");
        assert!(!text.contains("/Subtype /Image"), "a vector-only page must not be rasterized");
    }
    #[test]
    fn retains_webp_artwork_in_pdf() {
        let pdf = convert(r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><image width="100" height="100" href="data:image/webp;base64,UklGRkQAAABXRUJQVlA4IDgAAAAQAwCdASoRAAsAPm0skkWkIqGYBABABsSgB2APwAAVOoAA/tDK//+YJX5Bu1D//5Z8/hs6MAAAAA=="/></svg>"#).unwrap();
        assert!(String::from_utf8_lossy(&pdf).contains("/Subtype /Image"));
    }
}
