use std::{
    fs::File,
    io::{Cursor, Read},
    path::Path,
};

use crate::png::{validate_png_header, MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE, MAX_PNG_BYTES};

pub fn decode_png(bytes: &[u8]) -> Result<image::RgbaImage, String> {
    validate_png_header(bytes)?;
    let mut reader = image::ImageReader::with_format(Cursor::new(bytes), image::ImageFormat::Png);
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(MAX_IMAGE_SIDE);
    limits.max_image_height = Some(MAX_IMAGE_SIDE);
    limits.max_alloc = Some(MAX_IMAGE_PIXELS * 8);
    reader.limits(limits);
    reader
        .decode()
        .map(|image| image.to_rgba8())
        .map_err(|error| format!("Could not decode PNG: {error}"))
}

pub fn read_png_file(path: &Path) -> Result<Vec<u8>, String> {
    let file = File::open(path).map_err(|error| format!("Could not open screenshot: {error}"))?;
    let metadata = file
        .metadata()
        .map_err(|error| format!("Could not inspect screenshot: {error}"))?;
    if !metadata.is_file() || metadata.len() > MAX_PNG_BYTES as u64 {
        return Err("Screenshot must be a regular PNG file smaller than 50 MiB.".into());
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(MAX_PNG_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Could not read screenshot: {error}"))?;
    decode_png(&bytes)?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn png_bytes() -> Vec<u8> {
        let image = image::RgbaImage::from_pixel(2, 3, image::Rgba([10, 20, 30, 255]));
        let mut output = Cursor::new(Vec::new());
        image
            .write_to(&mut output, image::ImageFormat::Png)
            .unwrap();
        output.into_inner()
    }

    #[test]
    fn decodes_pixels_for_native_clipboard() {
        let image = decode_png(&png_bytes()).unwrap();
        assert_eq!(image.dimensions(), (2, 3));
        assert_eq!(image.get_pixel(1, 2).0, [10, 20, 30, 255]);
    }

    #[test]
    fn rejects_corrupt_png_even_when_dimensions_are_valid() {
        let mut bytes = png_bytes();
        bytes.truncate(33);
        assert!(decode_png(&bytes).is_err());
    }

    #[test]
    fn reads_the_captured_file_without_changing_it() {
        let mut file = tempfile::NamedTempFile::new().unwrap();
        let png = png_bytes();
        file.write_all(&png).unwrap();
        assert_eq!(read_png_file(file.path()).unwrap(), png);
        assert!(file.path().exists());
    }

    #[test]
    fn rejects_large_files_before_reading_them_into_memory() {
        let file = tempfile::NamedTempFile::new().unwrap();
        file.as_file()
            .set_len(super::super::png::MAX_PNG_BYTES as u64 + 1)
            .unwrap();
        assert!(read_png_file(file.path()).is_err());
    }
}
