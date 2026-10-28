import * as ImagePicker from 'expo-image-picker'
import type { FilePurpose, UploadUrlResponse } from '@ortaq/shared'
import { api, ApiError } from './api'

export type Picked = { uri: string; mimeType: string; size: number; name: string }

/** JPEG с умеренным сжатием: HEIC с айфона сервер не читает, а 12 Мп для трещины в стене не нужны */
const PICKER: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.7,
  exif: false,
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
}

function toPicked(a: ImagePicker.ImagePickerAsset): Picked {
  const mime = a.mimeType === 'image/png' || a.mimeType === 'image/webp' ? a.mimeType : 'image/jpeg'
  return { uri: a.uri, mimeType: mime, size: a.fileSize ?? 0, name: a.fileName ?? 'photo.jpg' }
}

export async function pickPhotos(limit: number): Promise<Picked[]> {
  const res = await ImagePicker.launchImageLibraryAsync({ ...PICKER, allowsMultipleSelection: true, selectionLimit: limit })
  return res.canceled ? [] : res.assets.slice(0, limit).map(toPicked)
}

/** Камера — основной путь для работника: снимок прямо на месте работы */
export async function takePhoto(): Promise<Picked | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync()
  if (!perm.granted) throw new ApiError(0, 'CAMERA', 'Нет доступа к камере. Разрешите его в настройках телефона')
  const res = await ImagePicker.launchCameraAsync(PICKER)
  return res.canceled ? null : toPicked(res.assets[0]!)
}

/**
 * Загрузка в три шага (docs/03 §14): ссылка от сервера → файл прямо в хранилище → проверка
 * сервером. До finalize фото нигде не показывается; EXIF и координаты вырежет сервер.
 */
export async function uploadPhoto(houseId: string, photo: Picked, purpose: FilePurpose): Promise<string> {
  const blob = await (await fetch(photo.uri)).blob()
  const slot = await api<UploadUrlResponse>(`/houses/${houseId}/files/upload-url`, {
    method: 'POST',
    body: { purpose, mime_type: photo.mimeType, size_bytes: blob.size || photo.size, name: photo.name },
  })
  let put: Response
  try {
    put = await fetch(slot.upload_url, { method: 'PUT', headers: slot.headers, body: blob })
  } catch {
    throw new ApiError(0, 'NETWORK', 'Фото не отправилось: нет связи')
  }
  if (!put.ok) throw new ApiError(put.status, 'UPLOAD', 'Хранилище не приняло фото. Попробуйте ещё раз')
  await api(`/houses/${houseId}/files/${slot.file_id}/finalize`, { method: 'POST' })
  return slot.file_id
}
