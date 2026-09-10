const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const downloader = require('./downloader');

const app = express();
const PORT = process.env.PORT || 3855;

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Default settings endpoint
app.get('/api/settings', (req, res) => {
  res.json({
    defaultOutputDir: path.join(os.homedir(), 'Downloads')
  });
});

// Extract Media Metadata / Info Preview
app.get('/api/info', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    const info = await downloader.getMediaInfo(url);
    res.json({ success: true, data: info });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Real-time Download Stream via Server-Sent Events (SSE)
app.get('/api/download-stream', async (req, res) => {
  const { url, quality, outputDir } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendSSE = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await downloader.download(
      url,
      { quality, outputDir },
      (progressData) => {
        sendSSE(progressData);
      }
    );
    sendSSE({ status: 'completed', percent: 100, message: 'Finished!' });
    res.end();
  } catch (err) {
    sendSSE({ status: 'error', error: err.message || 'Download failed' });
    res.end();
  }
});

// Update Engine Endpoint
app.post('/api/update-engine', async (req, res) => {
  try {
    const logs = [];
    const result = await downloader.updateEngine((log) => logs.push(log));
    res.json({ success: true, message: result.message, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function startServer(port = PORT) {
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`MediaSnatcher Express Server running at http://localhost:${port}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer, PORT };
