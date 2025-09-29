import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir = path.resolve('uploads/admin');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

// *** UPDATE: Modified fileFilter to allow CSV and Excel files ***
const fileFilter = (_req, file, cb) => {
  const allowedMimetypes = [
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel' // .xls
  ];
  const allowedExtensions = ['.csv', '.xlsx', '.xls'];
  const isValidMimetype = allowedMimetypes.includes(file.mimetype);
  const isValidExtension = allowedExtensions.includes(path.extname(file.originalname).toLowerCase());
  if (isValidMimetype || isValidExtension) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV and Excel (.xlsx, .xls) files are allowed'));
  }
};

export const adminUpload = multer({ storage, fileFilter });
