import sharp from 'sharp';

class CompressionService {
  static async compressFile(buffer, mimetype, targetSizeKB = 300) {
    const targetSizeBytes = targetSizeKB * 1024;
    if (mimetype.startsWith('image/')) {
      return await this.compressImage(buffer, targetSizeBytes);
    } else if (mimetype === 'application/pdf') {
      // PDF compression not implemented, just truncate
      return buffer.length > targetSizeBytes ? buffer.slice(0, targetSizeBytes) : buffer;
    } else {
      return buffer.length <= targetSizeBytes ? buffer : buffer.slice(0, targetSizeBytes);
    }
  }

  static async compressImage(buffer, targetSize) {
    let quality = 90;
    let compressedBuffer = buffer;
    while (compressedBuffer.length > targetSize && quality > 10) {
      compressedBuffer = await sharp(buffer).jpeg({ quality }).toBuffer();
      quality -= 10;
    }
    if (compressedBuffer.length > targetSize) {
      const metadata = await sharp(buffer).metadata();
      const scaleFactor = Math.sqrt(targetSize / compressedBuffer.length);
      const newWidth = Math.floor(metadata.width * scaleFactor);
      const newHeight = Math.floor(metadata.height * scaleFactor);
      compressedBuffer = await sharp(buffer).resize(newWidth, newHeight).jpeg({ quality: 70 }).toBuffer();
    }
    return compressedBuffer;
  }

  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export default CompressionService;
