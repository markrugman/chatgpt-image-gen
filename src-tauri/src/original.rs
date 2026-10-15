//! Native-pixel cropping and explicit connected-background erasing. No model calls.
use crate::runtime::State;
use crate::{AppState, commands::save_imported_asset};
use base64::Engine;
use image::{ImageDecoder, ImageReader, RgbaImage};
use serde::{Deserialize, Serialize};
use std::{io::Cursor, sync::Arc};

#[derive(Clone, Copy, Deserialize)]
pub struct Crop {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}
#[derive(Clone, Copy, Deserialize)]
pub struct Seed {
    x: u32,
    y: u32,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Selection {
    image_id: String,
    crop: Option<Crop>,
    #[serde(default)]
    seeds: Vec<Seed>,
    #[serde(default)]
    tolerance: u8,
}
#[derive(Serialize)]
pub struct Preview {
    data: String,
    width: u32,
    height: u32,
}

fn crop_pixels(
    source: &RgbaImage,
    crop: Crop,
    seeds: &[Seed],
    tolerance: u8,
) -> Result<RgbaImage, String> {
    if crop.width == 0
        || crop.height == 0
        || crop
            .x
            .checked_add(crop.width)
            .is_none_or(|v| v > source.width())
        || crop
            .y
            .checked_add(crop.height)
            .is_none_or(|v| v > source.height())
    {
        return Err("Choose a crop inside the original image".into());
    }
    if seeds.len() > 100 {
        return Err("Reset the mask before adding more than 100 background clicks".into());
    }
    let original =
        image::imageops::crop_imm(source, crop.x, crop.y, crop.width, crop.height).to_image();
    let mut output = original.clone();
    for seed in seeds {
        if seed.x >= crop.width || seed.y >= crop.height {
            return Err("Background click is outside the crop".into());
        }
        let target = original.get_pixel(seed.x, seed.y);
        if target[3] == 0 {
            continue;
        }
        let mut visited = vec![false; (crop.width as usize) * (crop.height as usize)];
        let mut stack = vec![(seed.x, seed.y)];
        while let Some((x, y)) = stack.pop() {
            let index = (y as usize) * crop.width as usize + x as usize;
            if visited[index] {
                continue;
            }
            visited[index] = true;
            let pixel = original.get_pixel(x, y);
            if pixel[3] == 0 || (0..3).any(|c| pixel[c].abs_diff(target[c]) > tolerance) {
                continue;
            }
            output.get_pixel_mut(x, y)[3] = 0;
            if x > 0 {
                stack.push((x - 1, y));
            }
            if y > 0 {
                stack.push((x, y - 1));
            }
            if x + 1 < crop.width {
                stack.push((x + 1, y));
            }
            if y + 1 < crop.height {
                stack.push((x, y + 1));
            }
        }
    }
    Ok(output)
}

fn prepare(state: &AppState, selection: &Selection) -> Result<(Vec<u8>, u32, u32), String> {
    let path = state.store.image_path(&selection.image_id)?;
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let decoder = ImageReader::new(Cursor::new(&bytes))
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .into_decoder()
        .map_err(|e| e.to_string())?;
    let mut decoder = decoder;
    if !matches!(
        decoder.color_type(),
        image::ColorType::L8
            | image::ColorType::La8
            | image::ColorType::Rgb8
            | image::ColorType::Rgba8
    ) {
        return Err("Original-pixel extraction currently supports 8-bit images. Higher bit depths are left untouched.".into());
    }
    let profile = decoder.icc_profile().map_err(|e| e.to_string())?;
    let orientation = decoder.orientation().map_err(|e| e.to_string())?;
    let mut source = image::DynamicImage::from_decoder(decoder).map_err(|e| e.to_string())?;
    source.apply_orientation(orientation); // Exact pixel permutation; no resampling.
    let source = source.to_rgba8();
    let crop = selection.crop.unwrap_or(Crop {
        x: 0,
        y: 0,
        width: source.width(),
        height: source.height(),
    });
    let output = crop_pixels(&source, crop, &selection.seeds, selection.tolerance)?;
    let mut encoded = Vec::new();
    {
        let mut info = png::Info::with_size(crop.width, crop.height);
        info.color_type = png::ColorType::Rgba;
        info.bit_depth = png::BitDepth::Eight;
        // Retain source colour interpretation as well as the decoded pixel values.
        if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            let reader = png::Decoder::new(Cursor::new(&bytes))
                .read_info()
                .map_err(|e| e.to_string())?;
            let source_info = reader.info();
            info.srgb = source_info.srgb;
            info.source_gamma = source_info.source_gamma.or(source_info.gama_chunk);
            info.source_chromaticities =
                source_info.source_chromaticities.or(source_info.chrm_chunk);
        }
        if let Some(profile) = profile {
            info.icc_profile = Some(std::borrow::Cow::Owned(profile));
        }
        let encoder = png::Encoder::with_info(&mut encoded, info).map_err(|e| e.to_string())?;
        let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
        writer
            .write_image_data(output.as_raw())
            .map_err(|e| e.to_string())?;
    }
    Ok((encoded, crop.width, crop.height))
}

#[cfg_attr(not(feature = "headless"), tauri::command)]
pub async fn original_asset_preview(
    state: State<'_, Arc<AppState>>,
    selection: Selection,
) -> Result<Preview, String> {
    let (bytes, width, height) = prepare(&state, &selection)?;
    Ok(Preview {
        data: format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        ),
        width,
        height,
    })
}
#[cfg_attr(not(feature = "headless"), tauri::command)]
pub async fn extract_original_asset(
    app: crate::runtime::AppHandle,
    state: State<'_, Arc<AppState>>,
    selection: Selection,
    name: String,
    organisation_id: Option<String>,
) -> Result<String, String> {
    let (bytes, _, _) = prepare(&state, &selection)?;
    save_imported_asset(
        &app,
        &state,
        &name,
        &bytes,
        organisation_id,
        None,
        vec![format!("image:{}", selection.image_id)],
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn crop_preserves_every_channel_and_does_not_modify_source() {
        let source = RgbaImage::from_fn(6, 4, |x, y| {
            image::Rgba([x as u8, y as u8, 93, (x * 30 + y) as u8])
        });
        let before = source.clone();
        let result = crop_pixels(
            &source,
            Crop {
                x: 2,
                y: 1,
                width: 3,
                height: 2,
            },
            &[],
            0,
        )
        .unwrap();
        for (x, y, p) in result.enumerate_pixels() {
            assert_eq!(p, source.get_pixel(x + 2, y + 1));
        }
        assert_eq!(source, before);
    }
    #[test]
    fn erase_is_connected_and_only_changes_selected_alpha() {
        // White outer background, black logo border, white lettering inside.
        let source = RgbaImage::from_fn(7, 7, |x, y| {
            image::Rgba(if x == 1 || x == 5 || y == 1 || y == 5 {
                [12, 34, 56, 255]
            } else {
                [255, 255, 255, 255]
            })
        });
        let result = crop_pixels(
            &source,
            Crop {
                x: 0,
                y: 0,
                width: 7,
                height: 7,
            },
            &[Seed { x: 0, y: 0 }],
            0,
        )
        .unwrap();
        assert_eq!(result.get_pixel(0, 0)[3], 0);
        assert_eq!(result.get_pixel(3, 3), source.get_pixel(3, 3));
        for (x, y, p) in result.enumerate_pixels() {
            assert_eq!(&p.0[..3], &source.get_pixel(x, y).0[..3]);
        }
    }
    #[test]
    fn native_png_preview_preserves_pixels_colour_metadata_and_source_bytes() {
        let root = std::env::temp_dir().join(format!("imagegen-original-{}", crate::model::id()));
        let store = crate::store::Store::open(root.clone()).unwrap();
        let source = RgbaImage::from_fn(4, 3, |x, y| {
            image::Rgba([x as u8 * 37, y as u8 * 51, 93, (x * 20 + y) as u8])
        });
        let mut bytes = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut bytes, 4, 3);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_source_gamma(png::ScaledFloat::new(0.45455));
            encoder
                .write_header()
                .unwrap()
                .write_image_data(source.as_raw())
                .unwrap();
        }
        assert_eq!(
            png::Decoder::new(Cursor::new(&bytes))
                .read_info()
                .unwrap()
                .info()
                .gama_chunk,
            Some(png::ScaledFloat::new(0.45455)),
            "source metadata"
        );
        let image = store.import_bytes(&bytes).unwrap();
        let image_id = image.id.clone();
        store
            .change(|w| {
                w.images.push(image);
                Ok(())
            })
            .unwrap();
        let state = AppState {
            store,
            jobs_dir: root.join("sessions"),
            jobs: tokio::sync::Mutex::new(std::collections::HashMap::new()),
            codex: tokio::sync::Mutex::new(None),
        };
        let selection = Selection {
            image_id: image_id.clone(),
            crop: Some(Crop {
                x: 1,
                y: 1,
                width: 2,
                height: 2,
            }),
            seeds: vec![],
            tolerance: 0,
        };
        let (encoded, width, height) = prepare(&state, &selection).unwrap();
        assert_eq!((width, height), (2, 2));
        let output = image::load_from_memory(&encoded).unwrap().to_rgba8();
        for (x, y, p) in output.enumerate_pixels() {
            assert_eq!(p, source.get_pixel(x + 1, y + 1));
        }
        let reader = png::Decoder::new(Cursor::new(encoded)).read_info().unwrap();
        assert_eq!(
            reader.info().gama_chunk,
            Some(png::ScaledFloat::new(0.45455))
        );
        assert_eq!(
            std::fs::read(state.store.image_path(&image_id).unwrap()).unwrap(),
            bytes
        );
        assert!(state.codex.try_lock().unwrap().is_none());
        drop(state);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn tolerance_and_invalid_coordinates() {
        let source = RgbaImage::from_fn(3, 1, |x, _| image::Rgba([250 + x as u8, 250, 250, 255]));
        let crop = Crop {
            x: 0,
            y: 0,
            width: 3,
            height: 1,
        };
        let result = crop_pixels(&source, crop, &[Seed { x: 0, y: 0 }], 1).unwrap();
        assert_eq!(result.get_pixel(1, 0)[3], 0);
        assert_eq!(result.get_pixel(2, 0)[3], 255);
        assert!(
            crop_pixels(
                &source,
                Crop {
                    x: u32::MAX,
                    ..crop
                },
                &[],
                0
            )
            .is_err()
        );
        assert!(crop_pixels(&source, Crop { width: 0, ..crop }, &[], 0).is_err());
        assert!(crop_pixels(&source, crop, &[Seed { x: 3, y: 0 }], 0).is_err());
    }
}
