pub const MAX_PNG_BYTES: usize = 50 * 1024 * 1024;
pub const MAX_IMAGE_SIDE: u32 = 16_384;
pub const MAX_IMAGE_PIXELS: u64 = 32_000_000;

pub fn validate_png_header(bytes: &[u8]) -> Result<(u32, u32), String> {
    if bytes.len() > MAX_PNG_BYTES {
        return Err("PNG exceeds the 50 MiB file limit.".into());
    }
    if bytes.len() < 33 || &bytes[..16] != b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR" {
        return Err("The image is not a valid PNG.".into());
    }
    let width = u32::from_be_bytes(bytes[16..20].try_into().unwrap());
    let height = u32::from_be_bytes(bytes[20..24].try_into().unwrap());
    if width == 0
        || height == 0
        || width > MAX_IMAGE_SIDE
        || height > MAX_IMAGE_SIDE
        || u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS
    {
        return Err("Image exceeds the limit of 32 megapixels or 16384 pixels per side.".into());
    }
    Ok((width, height))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn header(width: u32, height: u32) -> Vec<u8> {
        let mut png = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
        png.extend_from_slice(&width.to_be_bytes());
        png.extend_from_slice(&height.to_be_bytes());
        png.extend_from_slice(&[8, 6, 0, 0, 0, 0, 0, 0, 0]);
        png
    }

    #[test]
    fn accepts_normal_screen_dimensions() {
        assert_eq!(validate_png_header(&header(3840, 2160)), Ok((3840, 2160)));
    }

    #[test]
    fn rejects_non_png_and_truncated_input() {
        assert!(validate_png_header(b"not a png").is_err());
        assert!(validate_png_header(&header(1, 1)[..24]).is_err());
        let mut png = header(1, 1);
        png[12..16].copy_from_slice(b"IDAT");
        assert!(validate_png_header(&png).is_err());
    }

    #[test]
    fn rejects_zero_or_oversized_dimensions_before_decoding() {
        for (width, height) in [
            (0, 100),
            (100, 0),
            (16_385, 1),
            (1, 16_385),
            (8000, 4001),
            (u32::MAX, u32::MAX),
        ] {
            assert!(
                validate_png_header(&header(width, height)).is_err(),
                "accepted {width}x{height}"
            );
        }
        assert_eq!(validate_png_header(&header(8000, 4000)), Ok((8000, 4000)));
    }

    #[test]
    fn rejects_oversized_compressed_input() {
        let mut png = header(1, 1);
        png.resize(MAX_PNG_BYTES + 1, 0);
        assert!(validate_png_header(&png).is_err());
    }
}
