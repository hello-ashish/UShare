import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { Share2, Download, UploadCloud, CheckCircle, Smartphone, Wifi } from 'lucide-react';

const SIGNALING_SERVER = window.location.origin;

function Sender() {
  const [file, setFile] = useState(null);
  const [roomId, setRoomId] = useState('');
  const [localIp, setLocalIp] = useState(window.location.hostname);
  const [status, setStatus] = useState('waiting');
  const [progress, setProgress] = useState(0);
  const qrRef = useRef(null);
  const socketRef = useRef(null);

  useEffect(() => {
    fetch(`${SIGNALING_SERVER}/api/ip`)
      .then(r => r.json())
      .then(data => setLocalIp(data.ip))
      .catch(console.error);

    const newRoomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    setRoomId(newRoomId);

    const socket = io(SIGNALING_SERVER);
    socketRef.current = socket;

    socket.emit('join-room', newRoomId);

    socket.on('user-joined', (userId) => {
      setStatus('connected');
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (qrRef.current && roomId && status === 'waiting') {
      qrRef.current.innerHTML = '';
      const url = `http://${localIp}:5173/receive/${roomId}`;
      if (window.QRCode) {
        new window.QRCode(qrRef.current, {
          text: url,
          width: 180,
          height: 180,
          colorDark: "#0f172a",
          colorLight: "#ffffff",
          correctLevel: window.QRCode.CorrectLevel.H
        });
      } else {
        qrRef.current.innerHTML = `<div class="offline-qr">Visit:<br/><b>${url}</b></div>`;
      }
    }
  }, [roomId, localIp, status, file]);

  const sendFile = () => {
    if (!file || !socketRef.current) return;
    setStatus('sending');

    socketRef.current.emit('file-metadata', {
      roomId,
      name: file.name,
      size: file.size,
      mime: file.type
    });

    const chunkSize = 256 * 1024; // 256 KB per slice for optimal socket transfer
    let offset = 0;
    const reader = new FileReader();

    reader.onload = (e) => {
      socketRef.current.emit('file-chunk', {
        roomId,
        chunk: e.target.result,
        offset
      });
      offset += e.target.result.byteLength;
      setProgress(Math.round((offset / file.size) * 100));

      if (offset < file.size) {
        readSlice(offset);
      } else {
        setStatus('done');
        socketRef.current.emit('file-eof', { roomId });
      }
    };

    const readSlice = (o) => reader.readAsArrayBuffer(file.slice(o, o + chunkSize));
    
    // Slight delay to ensure receiver initializes array buffers
    setTimeout(() => {
      readSlice(0);
    }, 500);
  };

  return (
    <div className="app-container send-theme">
      <div className="glass-card main-card slide-up">
        
        <div className="card-header blue-gradient">
          <div className="glow-orb"></div>
          <Share2 className="header-icon pulse-animation" />
          <h1 className="title">UShare</h1>
          <p className="subtitle">Peer-to-Peer File Transfer</p>
        </div>

        <div className="card-body">
          {status === 'waiting' && (
            <div className="state-view fade-in">
              <div className="upload-section">
                <input 
                  type="file" 
                  onChange={(e) => setFile(e.target.files[0])}
                  className="file-input"
                />
                <div className={`upload-dropzone ${file ? 'has-file' : ''}`}>
                  <UploadCloud className="upload-icon" />
                  {file ? (
                    <p className="file-name">{file.name}</p>
                  ) : (
                    <p className="upload-hint">Upload or drop a file</p>
                  )}
                </div>
              </div>

              {file && (
                <div className="qr-section pop-in">
                  <div className="qr-wrapper">
                    <div ref={qrRef} className="qr-code-canvas" />
                  </div>
                  <div className="link-hint">
                    <Wifi className="link-icon" />
                    <span>Scan QR with phone, or visit on wifi: <span className="mono-link">http://{localIp}:5173/receive/{roomId}</span></span>
                  </div>
                </div>
              )}
            </div>
          )}

          {status === 'connected' && (
            <div className="state-view zip-in">
              <div className="status-icon-wrapper success-wrapper">
                <Smartphone className="status-icon" />
              </div>
              <h2 className="status-title">Device Connected!</h2>
              <p className="status-desc">Ready to securely send <b>{file?.name}</b></p>
              
              <button className="primary-button" onClick={sendFile}>
                <Share2 className="btn-icon" />
                Transfer File Now
              </button>
            </div>
          )}

          {status === 'sending' && (
            <div className="state-view">
              <h2 className="status-title">Sending...</h2>
              <div className="progress-bar-container">
                <div className="progress-fill" style={{ width: `${progress}%` }}>
                  <div className="shimmer"></div>
                </div>
              </div>
              <p className="progress-text">{progress}%</p>
            </div>
          )}

          {status === 'done' && (
            <div className="state-view pop-in">
              <CheckCircle className="done-icon" />
              <h2 className="status-title">Transfer Complete!</h2>
              <p className="status-desc">Your file was delivered directly via Wi-Fi.</p>
              <button className="secondary-button" onClick={() => window.location.reload()}>
                Send Another File
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Receiver() {
  const { roomId } = useParams();
  const [status, setStatus] = useState('connecting');
  const [metadata, setMetadata] = useState(null);
  const [progress, setProgress] = useState(0);
  
  const socketRef = useRef(null);
  const receivedChunks = useRef([]);
  const receivedSize = useRef(0);
  const metadataRef = useRef(null);

  useEffect(() => {
    const socket = io(SIGNALING_SERVER);
    socketRef.current = socket;

    socket.emit('join-room', roomId);
    
    // Connected immediately via socket
    setStatus('ready');

    socket.on('file-metadata', (data) => {
      setStatus('receiving');
      setMetadata(data);
      metadataRef.current = data;
      receivedChunks.current = [];
      receivedSize.current = 0;
    });

    socket.on('file-chunk', (data) => {
      receivedChunks.current.push(data.chunk);
      receivedSize.current += data.chunk.byteLength;
      if (metadataRef.current) {
        setProgress(Math.round((receivedSize.current / metadataRef.current.size) * 100));
      }
    });

    socket.on('file-eof', () => {
      setStatus('processing');
      if (!metadataRef.current) return;
      
      const blob = new Blob(receivedChunks.current, { type: metadataRef.current.mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = metadataRef.current.name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      setStatus('done');
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId]);

  return (
    <div className="app-container recv-theme">
      <div className="glass-card main-card slide-up">
        
        <div className="card-header indigo-gradient">
          <div className="glow-orb"></div>
          <Download className="header-icon pulse-animation" />
          <h1 className="title">Receive File</h1>
          <div className="room-badge">ROOM: {roomId}</div>
        </div>

        <div className="card-body recv-body">
          {status === 'connecting' && (
            <div className="state-view fade-in">
              <div className="spinner indigo-spinner"></div>
              <h2 className="status-title">Connecting...</h2>
              <p className="status-desc">Establishing secure peer connection over Wi-Fi.</p>
            </div>
          )}

          {status === 'ready' && (
            <div className="state-view pop-in">
              <Smartphone className="status-icon indigo-text" />
              <h2 className="status-title">Connected!</h2>
              <p className="status-desc">Device synced. Waiting for sender to start...</p>
            </div>
          )}

          {status === 'receiving' && (
            <div className="state-view">
              <h2 className="status-title">Downloading...</h2>
              <p className="file-name recv-file-name">{metadata?.name}</p>
              
              <div className="progress-bar-container">
                 <div className="progress-fill indigo-fill" style={{ width: `${progress}%` }}>
                   <div className="shimmer"></div>
                 </div>
              </div>
              <p className="progress-text indigo-text">{progress}%</p>
            </div>
          )}

          {status === 'processing' && (
            <div className="state-view">
               <div className="spinner indigo-spinner"></div>
               <h2 className="status-title">Saving file to device...</h2>
            </div>
          )}

          {status === 'done' && (
            <div className="state-view pop-in">
              <CheckCircle className="done-icon" />
              <h2 className="status-title">File Saved!</h2>
              <p className="status-desc">{metadata?.name} downloaded successfully.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Sender />} />
        <Route path="/receive/:roomId" element={<Receiver />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
