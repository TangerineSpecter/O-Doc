import {uploadResource} from './resources';
export async function uploadDiaryImage(file: File) {
    if (!(file.type ? ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type) : /\.(jpe?g|png|gif|webp)$/i.test(file.name))) throw new Error('请选择 JPG、PNG、GIF 或 WebP 图片');
    if (file.size > 10 * 1024 * 1024) throw new Error('图片不能超过 10 MB');
    return uploadResource(file, 'diary');
}
