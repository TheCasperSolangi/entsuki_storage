const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');
const morgan = require('morgan');
const app = express();
const port = 5005;

app.set('trust proxy', true);

app.use(cors());
app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));

app.use((req, res, next) => {
    // Skip if local development or if already HTTPS
    if (req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'development') {
        return next();
    }
    
    // Only redirect in production
    if (process.env.NODE_ENV === 'production') {
        return res.redirect('https://' + req.headers.host + req.url);
    }
    
    next();
});

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

const upload = multer({ 
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max file size
    },
    fileFilter: (req, file, cb) => {
        // Optional: Add file type restrictions
        const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Invalid file type'));
        }
        cb(null, true); // Accept all file types
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', secure: req.secure });
});

// File upload endpoint
app.post('/api/uploads', upload.single('file'), (req, res) => {
    if (!req.file) {
        console.log(`[WARN] Upload attempt without file from ${req.ip}`);
        return res.status(400).json({ error: 'No file uploaded' });
    }

    // Properly detect protocol
    let protocol = 'http';
    
    // Check various headers that indicate HTTPS
    if (req.secure || 
        req.headers['x-forwarded-proto'] === 'https' ||
        req.protocol === 'https' ||
        process.env.FORCE_HTTPS === 'true') {
        protocol = 'https';
    }
    
    // Get the host (without protocol)
    const host = req.headers.host || req.get('host');
    
    // Build the file URL
    const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
    
    console.log(`[INFO] File uploaded: ${req.file.originalname} -> ${fileUrl}`);
    console.log(`[DEBUG] Protocol: ${protocol}, Secure: ${req.secure}, Headers:`, {
        'x-forwarded-proto': req.headers['x-forwarded-proto'],
        'x-forwarded-for': req.headers['x-forwarded-for']
    });
    
    res.json({ 
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size
    });
});

// Serve uploaded files
app.use('/uploads', (req, res, next) => {
    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Optional: Add cache headers
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    
    next();
}, express.static(uploadDir));

//Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large' });
        }
        return res.status(400).json({ error: error.message });
    }
    
    console.error('[ERROR]', error);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Server running at http://0.0.0.0:${port}/`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔒 HTTPS enforced: ${process.env.FORCE_HTTPS === 'true' ? 'Yes' : 'No'}`);
});
