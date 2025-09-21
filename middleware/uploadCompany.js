import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir = path.resolve('uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const fileFilter = (_req, file, cb) => {
  // accept images (logos) + allow fallback
  if (/image\/(png|jpeg|jpg|svg)/i.test(file.mimetype)) return cb(null, true);
  return cb(null, true); // non-image allowed but could restrict
};

export const companyUpload = multer({ storage, fileFilter });
