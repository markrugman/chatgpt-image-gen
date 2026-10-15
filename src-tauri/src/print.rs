//! Profile-managed print conversion. The artwork in the workspace is never changed.
use base64::{Engine, engine::general_purpose::STANDARD};
use flate2::{Compression, write::ZlibEncoder};
use image::ImageFormat;
use lcms2::{Flags, Intent, PixelFormat, Profile, Transform};
use serde::Serialize;
use std::io::{Cursor, Write};

const PROFILE: &[u8] = include_bytes!("../profiles/Coated_Fogra39L_VIGC_300.icc");
#[derive(Serialize)]
pub struct Converted {
    width: u32,
    height: u32,
    data: String,
    preview: Option<String>,
}

fn convert(data: &str, proof: bool) -> Result<Converted, String> {
    let bytes = STANDARD
        .decode(data)
        .map_err(|_| "Could not read the print image")?;
    let source = image::load_from_memory(&bytes)
        .map_err(|e| e.to_string())?
        .to_rgba8();
    if u64::from(source.width()) * u64::from(source.height()) > 80_000_000 {
        return Err("This export is too large. Choose a lower resolution.".into());
    }
    // Print has a white paper background. Flatten alpha explicitly, including direct IPC callers.
    let rgb: Vec<[u8; 3]> = source
        .pixels()
        .map(|p| {
            std::array::from_fn(|c| {
                ((u32::from(p[c]) * u32::from(p[3]) + 255 * (255 - u32::from(p[3])) + 127) / 255)
                    as u8
            })
        })
        .collect();
    let srgb = Profile::new_srgb();
    let cmyk =
        Profile::new_icc(PROFILE).map_err(|e| format!("Cannot load the print profile: {e}"))?;
    let transform: Transform<[u8; 3], [u8; 4]> = Transform::new_flags(
        &srgb,
        PixelFormat::RGB_8,
        &cmyk,
        PixelFormat::CMYK_8,
        Intent::RelativeColorimetric,
        Flags::BLACKPOINT_COMPENSATION,
    )
    .map_err(|e| e.to_string())?;
    let mut pixels = vec![[0u8; 4]; rgb.len()];
    transform.transform_pixels(&rgb, &mut pixels);
    let mut compressed = ZlibEncoder::new(Vec::new(), Compression::default());
    // Compress in rows instead of duplicating the complete CMYK image in another allocation.
    for row in pixels.chunks(source.width() as usize) {
        let bytes: Vec<u8> = row.iter().flatten().copied().collect();
        compressed.write_all(&bytes).map_err(|e| e.to_string())?;
    }
    let preview = if proof {
        let transform: Transform<[u8; 4], [u8; 3]> = Transform::new_flags(
            &cmyk,
            PixelFormat::CMYK_8,
            &srgb,
            PixelFormat::RGB_8,
            Intent::RelativeColorimetric,
            Flags::BLACKPOINT_COMPENSATION,
        )
        .map_err(|e| e.to_string())?;
        let mut result = vec![[0u8; 3]; pixels.len()];
        transform.transform_pixels(&pixels, &mut result);
        let bytes: Vec<u8> = result.into_iter().flatten().collect();
        let image = image::RgbImage::from_raw(source.width(), source.height(), bytes)
            .ok_or("Cannot create the print preview")?;
        let mut output = Cursor::new(Vec::new());
        image
            .write_to(&mut output, ImageFormat::Png)
            .map_err(|e| e.to_string())?;
        Some(format!(
            "data:image/png;base64,{}",
            STANDARD.encode(output.into_inner())
        ))
    } else {
        None
    };
    Ok(Converted {
        width: source.width(),
        height: source.height(),
        data: STANDARD.encode(compressed.finish().map_err(|e| e.to_string())?),
        preview,
    })
}
#[cfg_attr(not(feature = "headless"), tauri::command)]
pub async fn convert_print_image(data: String, proof: bool) -> Result<Converted, String> {
    tokio::task::spawn_blocking(move || convert(&data, proof))
        .await
        .map_err(|e| e.to_string())?
}
#[cfg_attr(not(feature = "headless"), tauri::command)]
pub fn print_profile() -> String {
    STANDARD.encode(PROFILE)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    #[test]
    fn conversion_is_four_channel_profile_managed_and_preserves_source() {
        let mut image = image::RgbaImage::new(4, 1);
        for (i, p) in [
            [255, 255, 255, 255],
            [0, 0, 0, 255],
            [255, 0, 0, 255],
            [17, 33, 99, 0],
        ]
        .iter()
        .enumerate()
        {
            image.put_pixel(i as u32, 0, image::Rgba(*p));
        }
        let mut bytes = Cursor::new(Vec::new());
        image.write_to(&mut bytes, ImageFormat::Png).unwrap();
        let data = STANDARD.encode(bytes.get_ref());
        let before = data.clone();
        let output = convert(&data, true).unwrap();
        assert_eq!(data, before);
        assert_eq!((output.width, output.height), (4, 1));
        let compressed = STANDARD.decode(output.data).unwrap();
        let mut values = Vec::new();
        flate2::read::ZlibDecoder::new(&compressed[..])
            .read_to_end(&mut values)
            .unwrap();
        assert_eq!(values.len(), 16);
        assert!(values[0..4].iter().all(|v| *v <= 2));
        assert!(values[7] > 200);
        assert!(values[9] > 100 && values[10] > 100);
        assert_eq!(values[0..4], values[12..16]); // Transparent source flattens to white.
        let proof = STANDARD
            .decode(output.preview.unwrap().split(',').nth(1).unwrap())
            .unwrap();
        assert_eq!(image::load_from_memory(&proof).unwrap().width(), 4);
        assert_eq!(&PROFILE[16..20], b"CMYK");
    }
    #[test]
    fn invalid_print_data_returns_an_error() {
        assert!(convert("not base64", false).is_err());
        assert!(convert(&STANDARD.encode(b"not an image"), false).is_err());
    }
}
