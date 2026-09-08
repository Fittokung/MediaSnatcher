const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

class BinaryManager {
  constructor() {
    // Project root or extraResources dir in Electron
    this.baseDir = process.env.PORTABLE_EXECUTABLE_DIR || process.cwd();
    this.binDir = path.join(this.baseDir, 'bin');
    this.ytDlpPath = path.join(this.binDir, 'yt-dlp.exe');
    this.ffmpegPath = path.join(this.binDir, 'ffmpeg.exe');
  }

  ensureBinDir() {
    if (!fs.existsSync(this.binDir)) {
      fs.mkdirSync(this.binDir, { recursive: true });
    }
  }

  // Check if command is available on system PATH
  isCommandOnPath(cmd) {
    try {
      execSync(`where ${cmd}`, { stdio: 'ignore' });
      return true;
    } catch (e) {
      return false;
    }
  }

  getYtDlpPath() {
    if (fs.existsSync(this.ytDlpPath)) {
      return this.ytDlpPath;
    }
    if (this.isCommandOnPath('yt-dlp')) {
      return 'yt-dlp';
    }
    return this.ytDlpPath; // Default fallback path to download/use
  }

  getFfmpegPath() {
    if (fs.existsSync(this.ffmpegPath)) {
      return this.ffmpegPath;
    }
    if (this.isCommandOnPath('ffmpeg')) {
      return 'ffmpeg';
    }
    return this.ffmpegPath; // Fallback path
  }

  // Auto-download yt-dlp.exe if missing
  async ensureYtDlpBinary(onProgress = () => {}) {
    const finalPath = this.getYtDlpPath();
    if (fs.existsSync(finalPath) || finalPath === 'yt-dlp') {
      return finalPath;
    }

    this.ensureBinDir();
    const downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
    
    return new Promise((resolve, reject) => {
      onProgress('Downloading yt-dlp engine...');
      const file = fs.createWriteStream(this.ytDlpPath);
      
      const download = (url) => {
        https.get(url, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302) {
            return download(response.headers.location);
          }
          if (response.statusCode !== 200) {
            return reject(new Error(`Failed to download yt-dlp: HTTP ${response.statusCode}`));
          }
          response.pipe(file);
          file.on('finish', () => {
            file.close(() => resolve(this.ytDlpPath));
          });
        }).on('error', (err) => {
          fs.unlink(this.ytDlpPath, () => {});
          reject(err);
        });
      };
      
      download(downloadUrl);
    });
  }

  // Auto-download standalone ffmpeg.exe if missing
  async ensureFfmpegBinary(onProgress = () => {}) {
    const finalPath = this.getFfmpegPath();
    if (fs.existsSync(finalPath) || finalPath === 'ffmpeg') {
      return finalPath;
    }

    // Notice: ffmpeg is recommended to be pre-downloaded or bundled into bin/
    return finalPath;
  }
}

module.exports = new BinaryManager();
