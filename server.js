const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const base_url = process.env.BASE_URL || "http://localhost:" + port;

// Middleware
app.use(express.json());
app.use(express.static('public')); // For serving OAuth callback page

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: process.env.MAX_FILE_SIZE_MB * 1024 * 1024 // 50MB limit
  }
});

// Google OAuth setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Set credentials if refresh token is available
if (process.env.GOOGLE_REFRESH_TOKEN) {
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  });
}

// Google Drive API setup
const drive = google.drive({ version: 'v3', auth: oauth2Client });

// Upload file to Google Drive using OAuth
async function uploadToGoogleDriveOAuth(filePath, fileName, mimeType, parentFolderId = null) {
  try {
    // Ensure we have valid credentials
    await oauth2Client.getAccessToken();
    
    const fileMetadata = {
      name: fileName,
      ...(parentFolderId && { parents: [parentFolderId] })
    };
    
    const media = {
      mimeType: mimeType,
      body: fs.createReadStream(filePath)
    };
    
    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id,name,webViewLink,webContentLink'
    });
    
    return response.data;
  } catch (error) {
    console.error('Error uploading to Google Drive:', error);
    throw error;
  }
}

// Check if user is authenticated
function isAuthenticated() {
  return oauth2Client.credentials && oauth2Client.credentials.refresh_token;
}

// Routes

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Google Drive Upload API (OAuth User)',
    authenticated: isAuthenticated()
  });
});

// OAuth authorization URL
app.get('/auth', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive'
    ],
    prompt: 'consent' // Force consent to get refresh token
  });
  
  res.json({
    success: true,
    authUrl: authUrl,
    message: 'Visit this URL to authorize the application',
    instructions: 'After authorization, you will get a code. Use /auth/callback?code=YOUR_CODE'
  });
});

// OAuth callback handler
app.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  
  if (!code) {
    return res.status(400).json({
      success: false,
      error: 'Authorization code not provided'
    });
  }
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    // Save refresh token for future use
    if (tokens.refresh_token) {
      console.log('Refresh Token (save this to your .env file):');
      console.log('GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);
    }
    
    res.json({
      success: true,
      message: 'Authorization successful!',
      refreshToken: tokens.refresh_token,
      note: 'Save the refresh token to your .env file as GOOGLE_REFRESH_TOKEN'
    });
    
  } catch (error) {
    console.error('Error getting OAuth tokens:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to exchange authorization code for tokens'
    });
  }
});

// Check authentication status
app.get('/auth/status', (req, res) => {
  res.json({
    authenticated: isAuthenticated(),
    hasRefreshToken: !!(oauth2Client.credentials && oauth2Client.credentials.refresh_token),
    message: isAuthenticated() ? 'Ready to upload files' : 'Please authorize first using /auth endpoint'
  });
});

// Upload single file (requires authentication)
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!isAuthenticated()) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated. Please visit /auth to authorize first.'
      });
    }
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided'
      });
    }
    
    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const mimeType = req.file.mimetype;
    
    console.log(`Uploading file: ${fileName} (${mimeType})`);
    
    const driveFile = await uploadToGoogleDriveOAuth(
      filePath, 
      fileName, 
      mimeType, 
      process.env.GOOGLE_DRIVE_FOLDER_ID
    );
    
    // Clean up temporary file
    fs.unlinkSync(filePath);
    
    res.json({
      success: true,
      message: 'File uploaded successfully',
      file: {
        id: driveFile.id,
        name: driveFile.name,
        viewLink: driveFile.webViewLink,
        downloadLink: driveFile.webContentLink
      }
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up temporary file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    // Handle token refresh errors
    if (error.code === 401 || error.message.includes('invalid_grant')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication expired. Please re-authorize using /auth endpoint.',
        needsReauth: true
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to upload file to Google Drive',
      details: error.message
    });
  }
});

// Upload multiple files
app.post('/upload-multiple', upload.array('files', 10), async (req, res) => {
  try {
    if (!isAuthenticated()) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated. Please visit /auth to authorize first.'
      });
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files provided'
      });
    }
    
    const uploadPromises = req.files.map(async (file) => {
      try {
        const driveFile = await uploadToGoogleDriveOAuth(
          file.path,
          file.originalname,
          file.mimetype,
          process.env.GOOGLE_DRIVE_FOLDER_ID
        );
        
        // Clean up temporary file
        fs.unlinkSync(file.path);
        
        return {
          success: true,
          file: {
            id: driveFile.id,
            name: driveFile.name,
            viewLink: driveFile.webViewLink,
            downloadLink: driveFile.webContentLink
          }
        };
      } catch (error) {
        // Clean up temporary file on error
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        
        return {
          success: false,
          fileName: file.originalname,
          error: error.message
        };
      }
    });
    
    const results = await Promise.all(uploadPromises);
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    res.json({
      success: failed.length === 0,
      message: `${successful.length} files uploaded successfully, ${failed.length} failed`,
      results: {
        successful,
        failed
      }
    });
    
  } catch (error) {
    console.error('Multiple upload error:', error);
    
    // Clean up all temporary files on error
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to upload files to Google Drive',
      details: error.message
    });
  }
});

// List recent uploads
app.get('/files', async (req, res) => {
  try {
    if (!isAuthenticated()) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated. Please visit /auth to authorize first.'
      });
    }
    
    await oauth2Client.getAccessToken();
    
    const response = await drive.files.list({
      pageSize: 10,
      fields: 'files(id,name,createdTime,mimeType,size,webViewLink)',
      orderBy: 'createdTime desc',
      // Optionally filter by folder
      ...(process.env.GOOGLE_DRIVE_FOLDER_ID && {
        q: `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents`
      })
    });
    
    res.json({
      success: true,
      files: response.data.files
    });
    
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list files',
      details: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: `File too large. Maximum size is ${process.env.MAX_FILE_SIZE_MB}MB.`
      });
    }
  }
  
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

app.listen(3000, () => {
  console.log(`Google Drive Upload API (OAuth User) running on port ${port}`);
  console.log(`Health check: ${base_url}/health`);
  console.log(`Authorization: ${base_url}/auth`);
  console.log(`Auth Status: ${base_url}/auth/status`);
});