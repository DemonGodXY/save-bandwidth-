# Image Compression Proxy

A serverless image compression proxy service deployed on Vercel, similar to bandwidth-hero-proxy.

## Features

- 🖼️ Image compression and resizing
- 🌐 Format conversion (WebP, JPEG, PNG)
- ⚫ Optional grayscale conversion
- 🚀 Serverless deployment on Vercel
- 🛡️ Security features and input validation
- 📊 Comprehensive error handling
- 🔄 CORS enabled for browser extensions

## Usage

### Basic Usage
https://your-vercel-app.vercel.app/?url=https://example.com/image.jpg


### With Parameters
https://your-vercel-app.vercel.app/?url=https://example.com/image.jpg&width=800&quality=70

### Grayscale Conversion
https://your-vercel-app.vercel.app/?url=https://example.com/image.jpg&grayscale=true&quality=60


### Different Formats
https://your-vercel-app.vercel.app/?url=https://example.com/image.png&format=webp&quality=80


## API Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | required | URL of the image to process |
| `width` | number | null | Target width in pixels (1-1920) |
| `height` | number | null | Target height in pixels (1-1080) |
| `quality` | number | 80 | Image quality (1-100) |
| `grayscale` | boolean | false | Convert to grayscale |
| `format` | string | 'webp' | Output format ('webp', 'jpeg', 'png') |

## Deployment

### Prerequisites
- Node.js 14+
- Vercel account
- Vercel CLI installed

### Local Development
```bash
# Install dependencies
npm install
```
# Start local development server
```npm run dev```

# Deploy to production
```npm run deploy```

# Or using Vercel CLI directly
```vercel --prod```

Environment Variables (Optional) 

You can set these in your Vercel project settings: 

     ALLOWED_DOMAINS: Comma-separated list of allowed domains (empty = all allowed)
     BLOCKED_DOMAINS: Comma-separated list of blocked domains
     MAX_FILE_SIZE: Maximum file size in bytes (default: 52428800)
     

## Health Check
```GET /health```

Returns service status and timestamp. 
Security Features 

     -Input validation and sanitization
     -Domain allow/blocklisting
     -File size limits
     -Request timeout
     -CORS protection
     -Error message sanitization
     

##Response Headers 

The proxy includes informative headers: 

     X-Proxy-By: Identifies the proxy service
     X-Original-Size: Original image size in bytes
     X-Processed-Width: Final image width
     X-Processed-Height: Final image height
     X-Processed-Format: Final image format
