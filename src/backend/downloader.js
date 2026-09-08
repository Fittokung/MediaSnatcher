const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const binaryManager = require('./binaryManager');

class Downloader {
  // Extract video details & available formats
  async getMediaInfo(url) {
    const ytDlpPath = await binaryManager.ensureYtDlpBinary();
    
    return new Promise((resolve, reject) => {
      const args = [
        '--dump-single-json',
        '--no-warnings',
        '--no-playlist',
        url
      ];

      execFile(ytDlpPath, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          return reject(new Error(stderr || error.message || 'Failed to fetch media info'));
        }
        try {
          const info = JSON.parse(stdout);
          
          // Formulate list of available resolution options
          const formats = info.formats || [];
          const videoHeights = new Set();
          
          formats.forEach(f => {
            if (f.vcodec !== 'none' && f.height) {
              videoHeights.add(f.height);
            }
          });

          const sortedHeights = Array.from(videoHeights).sort((a, b) => b - a);

          const result = {
            id: info.id,
            title: info.title,
            thumbnail: info.thumbnail || (info.thumbnails && info.thumbnails.length ? info.thumbnails[info.thumbnails.length - 1].url : ''),
            duration: info.duration, // seconds
            uploader: info.uploader || info.channel || info.extractor_key || 'Unknown',
            platform: info.extractor_key || 'Social Media',
            availableHeights: sortedHeights,
            originalUrl: url
          };
          resolve(result);
        } catch (e) {
          reject(new Error('Failed to parse media metadata JSON'));
        }
      });
    });
  }

  // Start downloading with real-time SSE progress updates
  async download(url, options = {}, progressCallback) {
    const ytDlpPath = await binaryManager.ensureYtDlpBinary((msg) => {
      progressCallback({ status: 'preparing', message: msg, percent: 0 });
    });

    const ffmpegPath = binaryManager.getFfmpegPath();
    const ffmpegDir = path.dirname(ffmpegPath);

    const quality = options.quality || '1080p'; // 1080p, 720p, best, mp3, m4a
    const outputDir = options.outputDir || path.join(require('os').homedir(), 'Downloads');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputTemplate = path.join(outputDir, '%(title)s.%(ext)s');

    const args = ['--newline', '--no-colors', '-o', outputTemplate];

    // Add ffmpeg location if available
    if (fs.existsSync(ffmpegPath) || ffmpegPath === 'ffmpeg') {
      args.push('--ffmpeg-location', ffmpegDir);
    }

    // Format handling
    if (quality === 'mp3') {
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
    } else if (quality === 'm4a') {
      args.push('-x', '--audio-format', 'm4a');
    } else if (quality === '1080p') {
      args.push('-f', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best');
    } else if (quality === '720p') {
      args.push('-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]/best');
    } else if (quality === '480p') {
      args.push('-f', 'bestvideo[height<=480]+bestaudio/best[height<=480]/best');
    } else {
      args.push('-f', 'bestvideo+bestaudio/best');
    }

    args.push(url);

    return new Promise((resolve, reject) => {
      const process = spawn(ytDlpPath, args);

      progressCallback({
        status: 'starting',
        percent: 0,
        speed: '',
        eta: '',
        message: 'Initializing download...'
      });

      process.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach((line) => {
          const trimmed = line.trim();
          if (!trimmed) return;

          // Parse download progress: [download]  45.2% of  120.50MiB at 3.20MiB/s ETA 00:20
          const downloadMatch = trimmed.match(/\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+~?([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)/i);
          if (downloadMatch) {
            const percent = parseFloat(downloadMatch[1]);
            const totalSize = downloadMatch[2];
            const speed = downloadMatch[3];
            const eta = downloadMatch[4];

            progressCallback({
              status: 'downloading',
              percent,
              totalSize,
              speed,
              eta,
              message: `Downloading: ${percent.toFixed(1)}% (${speed}, ETA ${eta})`
            });
            return;
          }

          // Parse finished download chunk
          if (trimmed.includes('[download] 100%')) {
            progressCallback({
              status: 'downloaded',
              percent: 100,
              message: 'Download chunk completed. Processing file...'
            });
            return;
          }

          // Parse Muxing / Merging
          if (trimmed.includes('[Merger]') || trimmed.includes('Merging formats')) {
            progressCallback({
              status: 'muxing',
              percent: 99,
              message: 'Merging video & audio streams (Muxing)...'
            });
            return;
          }

          // Parse Audio Extraction
          if (trimmed.includes('[ExtractAudio]')) {
            progressCallback({
              status: 'extracting',
              percent: 99,
              message: 'Extracting and converting audio...'
            });
            return;
          }
        });
      });

      let stderrOutput = '';
      process.stderr.on('data', (data) => {
        stderrOutput += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          progressCallback({
            status: 'completed',
            percent: 100,
            message: 'Download completed successfully!'
          });
          resolve({ success: true });
        } else {
          reject(new Error(stderrOutput || `yt-dlp process exited with code ${code}`));
        }
      });

      process.on('error', (err) => {
        reject(err);
      });
    });
  }

  // Update yt-dlp binary
  async updateEngine(onLog) {
    const ytDlpPath = await binaryManager.ensureYtDlpBinary();

    return new Promise((resolve, reject) => {
      const process = spawn(ytDlpPath, ['-U']);

      process.stdout.on('data', (data) => {
        if (onLog) onLog(data.toString());
      });

      process.stderr.on('data', (data) => {
        if (onLog) onLog(data.toString());
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, message: 'yt-dlp updated successfully!' });
        } else {
          reject(new Error(`Update failed with exit code ${code}`));
        }
      });
    });
  }
}

module.exports = new Downloader();
