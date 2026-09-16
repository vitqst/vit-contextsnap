use image::{codecs::png::PngEncoder, ExtendedColorType, ImageEncoder};
use std::io::{self, Write};
use tauri::image::Image;
use tauri_plugin_clipboard_manager::Error;

use crate::png::{MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE, MAX_PNG_BYTES};

// The clipboard plugin erases arboard's typed ContentNotAvailable error. Match its
// exact message (locked in Cargo.lock); permission, connection and busy errors must
// not be mistaken for a text-only/empty clipboard.
const NO_IMAGE: &str =
    "The clipboard contents were not available in the requested format or the clipboard is empty.";

pub fn png(result: Result<Image<'_>, Error>) -> Result<Vec<u8>, String> {
    let image = match result {
        Ok(image) => image,
        Err(Error::Clipboard(message)) if message == NO_IMAGE => return Ok(Vec::new()),
        Err(error) => {
            return Err(format!(
                "Could not read clipboard image. Copy the image again and retry: {error}"
            ));
        }
    };
    let (width, height) = (image.width(), image.height());
    let pixels = u64::from(width) * u64::from(height);
    if width == 0
        || height == 0
        || width > MAX_IMAGE_SIDE
        || height > MAX_IMAGE_SIDE
        || pixels > MAX_IMAGE_PIXELS
    {
        return Err(
            "Clipboard image exceeds the limit of 32 megapixels or 16384 pixels per side.".into(),
        );
    }
    if image.rgba().len() as u64 != pixels * 4 {
        return Err(
            "The clipboard image contains invalid pixel data. Copy the image again.".into(),
        );
    }
    let mut output = PngOutput(Vec::new());
    PngEncoder::new(&mut output)
        .write_image(image.rgba(), width, height, ExtendedColorType::Rgba8)
        .map_err(|error| format!("Could not prepare clipboard PNG: {error}"))?;
    Ok(output.0)
}

struct PngOutput(Vec<u8>);

impl Write for PngOutput {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if self.0.len().saturating_add(bytes.len()) > MAX_PNG_BYTES {
            return Err(io::Error::other(
                "Clipboard PNG exceeds the 50 MiB file limit.",
            ));
        }
        self.0.extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::image::Image;
    use tauri_plugin_clipboard_manager::Error;

    #[test]
    fn preserves_clipboard_dimensions_rgba_and_alpha_losslessly() {
        let pixels = [255, 0, 12, 255, 20, 30, 40, 120, 90, 70, 50, 0];
        let bytes = png(Ok(Image::new(&pixels, 3, 1))).unwrap();
        let decoded = crate::image_io::decode_png(&bytes).unwrap();
        assert_eq!(decoded.dimensions(), (3, 1));
        assert_eq!(decoded.into_raw(), pixels);
    }

    #[test]
    fn empty_or_non_image_clipboards_are_a_quiet_noop() {
        let error = Error::Clipboard(
            "The clipboard contents were not available in the requested format or the clipboard is empty.".into(),
        );
        assert!(png(Err(error)).unwrap().is_empty());
    }

    #[test]
    fn unavailable_clipboard_remains_an_actionable_error() {
        let error = Error::Clipboard("Clipboard is occupied by another application.".into());
        let message = png(Err(error)).unwrap_err();
        assert!(message.contains("Could not read clipboard image"));
        assert!(message.contains("Copy the image again"));
        assert!(message.contains("occupied"));
    }

    #[test]
    fn refuses_oversized_dimensions_before_accessing_pixels() {
        for (width, height) in [
            (0, 1),
            (1, 0),
            (16_385, 1),
            (8000, 4001),
            (u32::MAX, u32::MAX),
        ] {
            let error = png(Ok(Image::new(&[], width, height))).unwrap_err();
            assert!(error.contains("32 megapixels"), "{width}x{height}: {error}");
        }
    }

    #[test]
    fn rejects_mismatched_rgba_instead_of_panicking_in_the_png_encoder() {
        for pixels in [&[1, 2, 3][..], &[1, 2, 3, 4, 5][..]] {
            let error = png(Ok(Image::new(pixels, 1, 1))).unwrap_err();
            assert!(error.contains("invalid pixel data"));
        }
    }

    #[test]
    fn caps_encoded_output_before_extending_the_buffer() {
        let mut output = PngOutput(vec![0; MAX_PNG_BYTES - 1]);
        assert_eq!(output.write(&[1]).unwrap(), 1);
        assert_eq!(output.0.len(), MAX_PNG_BYTES);
        assert!(output
            .write(&[2])
            .unwrap_err()
            .to_string()
            .contains("50 MiB"));
        assert_eq!(output.0.len(), MAX_PNG_BYTES);
        assert_eq!(output.0.last(), Some(&1));
    }
}
