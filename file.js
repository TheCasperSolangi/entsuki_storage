const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');
const morgan = require('morgan');
const app = express();
const port = 5005;

app.use(cors());
app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = crypto.randomBytes(16).toString('hex') + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ storage });

// File upload endpoint
app.post('/api/uploads', upload.single('file'), (req, res) => {
    if (!req.file) {
        console.log(`[WARN] Upload attempt without file from ${req.ip}`);
        return res.status(400).json({ error: 'No file uploaded' });
    }

    // Build URL dynamically using request hostname
    const protocol = req.protocol; // http or https
    const host = req.get('host');  // includes hostname + port
    const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

    console.log(`[INFO] File uploaded: ${req.file.originalname} -> ${fileUrl}`);
    res.json({ url: fileUrl });
});

// Serve uploaded files
app.use('/uploads', express.static(uploadDir));

app.listen(port, () => {
    console.log(`🚀 Server running at http://0.0.0.0:${port}/`);
});
