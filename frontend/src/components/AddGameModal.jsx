import { useState, useRef, useEffect } from 'react'
import { bgg } from '../services/api.js'
import { useLibraryStore } from '../stores/useLibraryStore.js'
import { BrowserMultiFormatReader } from '@zxing/browser'
import styles from './AddGameModal.module.css'

const SCAN_HINTS = new Map([[3, true]])  // DecodeHintType.TRY_HARDER = 3
const SCAN_OPTIONS = { delayBetweenScanAttempts: 200, delayBetweenScanSuccess: 500 }
const SCAN_CONSTRAINTS = {
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
}

const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code']

function makeBarcodeDetector(formats) {
  if (!('BarcodeDetector' in window)) return null
  try { return new window.BarcodeDetector({ formats }) } catch { return null }
}
const nativeDetector = makeBarcodeDetector(NATIVE_FORMATS)

export default function AddGameModal({ onClose }) {
  const [tab, setTab] = useState('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [localFallback, setLocalFallback] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [detectedCode, setDetectedCode] = useState(null)
  const [scanAttempts, setScanAttempts] = useState(0)
  const [debugInfo, setDebugInfo] = useState('')
  const [diagLines, setDiagLines] = useState([])
  // true when running on plain HTTP — getUserMedia is blocked, use file input instead
  const [httpFallback, setHttpFallback] = useState(!window.isSecureContext)
  const videoRef = useRef(null)
  const debugCanvasRef = useRef(null)
  const debugTimerRef = useRef(null)
  const controlsRef = useRef(null)
  const handledRef = useRef(false)
  const addGame = useLibraryStore(s => s.addGame)

  useEffect(() => () => doStop(), [])

  async function processBarcode(code) {
    setDetectedCode(code)
    setLoading(true)
    try {
      const { product_name, candidates } = await bgg.barcode(code)
      if (product_name) {
        setQuery(product_name)
        setResults(candidates)
      } else {
        setQuery('')
        setError(`Code-barres ${code} introuvable dans la base UPC. Saisissez le nom du jeu.`)
      }
      setTab('search')
    } catch {
      setQuery('')
      setError(`Erreur lors de la recherche du code-barres. Saisissez le nom du jeu.`)
      setTab('search')
    } finally {
      setLoading(false)
    }
  }

  async function handlePhotoCapture(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setError(null)
    const url = URL.createObjectURL(file)
    try {
      const reader = new BrowserMultiFormatReader(SCAN_HINTS)
      const result = await reader.decodeFromImageUrl(url)
      URL.revokeObjectURL(url)
      await processBarcode(result.getText())
    } catch {
      URL.revokeObjectURL(url)
      setError("Code-barres non détecté dans l'image. Réessayez avec une meilleure lumière ou saisissez le code manuellement.")
      setLoading(false)
    }
    e.target.value = ''
  }

  useEffect(() => {
    if (!scanning || !videoRef.current) return
    handledRef.current = false

    const useNative = !!nativeDetector
    setDebugInfo(useNative ? 'API: BarcodeDetector (natif)' : 'API: @zxing (fallback)')

    let cancelled = false
    let localControls = null

    async function onDetected(code) {
      if (cancelled || handledRef.current) return
      handledRef.current = true
      doStop()
      await processBarcode(code)
    }

    function handleCameraError(err) {
      if (cancelled) return
      const msg = err?.message || ''
      const lmsg = msg.toLowerCase()
      // Switch to file-input fallback if the error is about insecure context
      if (lmsg.includes('secure') || lmsg.includes('https') || (lmsg.includes('not allowed') && lmsg.includes('insecure'))) {
        setHttpFallback(true)
        setScanning(false)
        return
      }
      setError(
        msg.includes('NotAllowed') || msg.includes('ermission')
          ? 'Accès à la caméra refusé — vérifiez les permissions du navigateur.'
          : msg.includes('NotFound') || msg.includes('Devices')
          ? 'Aucune caméra détectée sur cet appareil.'
          : `Impossible d'accéder à la caméra${msg ? ` (${msg})` : ''}.`
      )
      setScanning(false)
    }

    if (useNative) {
      navigator.mediaDevices.getUserMedia(SCAN_CONSTRAINTS)
        .then(stream => {
          if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
          const video = videoRef.current
          video.srcObject = stream

          const loop = async () => {
            if (cancelled) return
            setScanAttempts(n => n + 1)
            try {
              const barcodes = await nativeDetector.detect(video)
              if (barcodes.length > 0) {
                await onDetected(barcodes[0].rawValue)
                return
              }
            } catch { /* frame not ready yet */ }
            setTimeout(loop, 150)
          }

          video.addEventListener('loadedmetadata', () => {
            video.play().then(loop)
          }, { once: true })
        })
        .catch(handleCameraError)
    } else {
      const reader = new BrowserMultiFormatReader(SCAN_HINTS)

      navigator.mediaDevices.getUserMedia(SCAN_CONSTRAINTS)
        .then(stream => {
          if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
          const video = videoRef.current
          video.srcObject = stream

          const decodeCanvas = document.createElement('canvas')

          const loop = () => {
            if (cancelled) return
            if (!video.videoWidth) { setTimeout(loop, 100); return }

            decodeCanvas.width = video.videoWidth
            decodeCanvas.height = video.videoHeight
            const ctx = decodeCanvas.getContext('2d')
            ctx.drawImage(video, 0, 0)

            const dbg = debugCanvasRef.current
            if (dbg) {
              dbg.width = video.videoWidth
              dbg.height = video.videoHeight
              const dctx = dbg.getContext('2d')
              dctx.drawImage(video, 0, 0)
              dctx.strokeStyle = 'red'
              dctx.lineWidth = 2
              dctx.beginPath()
              dctx.moveTo(0, video.videoHeight / 2)
              dctx.lineTo(video.videoWidth, video.videoHeight / 2)
              dctx.stroke()
            }

            setScanAttempts(n => n + 1)

            try {
              const result = reader.decodeFromCanvas(decodeCanvas)
              onDetected(result.getText())
              return
            } catch { /* NotFoundException — keep trying */ }

            setTimeout(loop, 200)
          }

          video.addEventListener('loadedmetadata', () => {
            video.play().then(loop)
          }, { once: true })
        })
        .catch(handleCameraError)
    }

    return () => {
      cancelled = true
      if (localControls) { try { localControls.stop() } catch {} }
      controlsRef.current = null
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(t => t.stop())
        videoRef.current.srcObject = null
      }
    }
  }, [scanning])

  function doStop() {
    if (controlsRef.current) {
      try { controlsRef.current.stop() } catch {}
      controlsRef.current = null
    }
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop())
      videoRef.current.srcObject = null
    }
    setScanning(false)
  }

  async function runDiag() {
    const lines = []
    lines.push(`UserAgent: ${navigator.userAgent}`)
    lines.push(`isSecureContext: ${window.isSecureContext}`)
    lines.push(`BarcodeDetector in window: ${'BarcodeDetector' in window}`)
    if ('BarcodeDetector' in window) {
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats()
        lines.push(`Formats supportés: ${supported.join(', ')}`)
        const det = makeBarcodeDetector(supported)
        lines.push(`Détecteur créé: ${det ? 'oui' : 'non'}`)
        const video = videoRef.current
        if (video?.videoWidth) {
          try {
            const found = await det.detect(video)
            lines.push(`detect() sur frame courante: ${found.length} code(s) trouvé(s)`)
            found.forEach(b => lines.push(`  → ${b.format}: ${b.rawValue}`))
          } catch (e) {
            lines.push(`detect() erreur: ${e.message}`)
          }
        } else {
          lines.push('Pas de frame vidéo active (démarrez la caméra d\'abord)')
        }
      } catch (e) {
        lines.push(`getSupportedFormats() erreur: ${e.message}`)
      }
    } else {
      lines.push('BarcodeDetector absent — navigateur non supporté')
      lines.push('Supporté sur: Chrome 83+, Edge 83+, Android Chrome')
      lines.push('Firefox et Safari ne le supportent pas nativement')
    }
    setDiagLines(lines)
  }

  function startScan() {
    setError(null)
    setScanAttempts(0)
    setDebugInfo('')
    setScanning(true)
  }

  async function handleSearch(e) {
    if (e) e.preventDefault()
    if (!query.trim()) return
    setLoading(true); setError(null); setLocalFallback(false)
    try {
      const data = await bgg.search(query)
      if (data && !Array.isArray(data) && data.source === 'local') {
        setResults(data.results)
        setLocalFallback(true)
      } else {
        setResults(Array.isArray(data) ? data : [])
      }
    } catch {
      setError('Erreur lors de la recherche.')
    } finally {
      setLoading(false)
    }
  }

  async function handleBarcodeManual(e) {
    e.preventDefault()
    const code = e.target.elements.barcode.value.trim()
    if (!code) return
    setLoading(true); setError(null)
    try {
      const { product_name, candidates } = await bgg.barcode(code)
      if (product_name) {
        setQuery(product_name)
        setResults(candidates)
        setDetectedCode(code)
      } else {
        setDetectedCode(code)
        setQuery('')
        setError(`Code-barres ${code} introuvable dans la base UPC. Saisissez le nom du jeu ci-dessous.`)
      }
      setTab('search')
    } catch (err) {
      setDetectedCode(code)
      setQuery('')
      setError(`Erreur lors de la recherche du code-barres. Saisissez le nom du jeu.`)
      setTab('search')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(item) {
    setLoading(true); setError(null)
    try {
      const meta = await bgg.game(item.bgg_id)
      const ean = detectedCode && /^\d{8,13}$/.test(detectedCode) ? detectedCode : null
      await addGame({ ...meta, status: 'owned', ...(ean ? { ean } : {}) })
      onClose()
    } catch {
      setError("Erreur lors de l'ajout du jeu.")
      setLoading(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.head}>
          <h2>Ajouter un jeu</h2>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <div className={styles.tabs}>
          <button className={tab === 'search' ? styles.tabActive : ''} onClick={() => setTab('search')}>
            Rechercher
          </button>
          <button
            className={tab === 'scan' ? styles.tabActive : ''}
            onClick={() => { setTab('scan'); if (scanning) doStop() }}
          >
            Scanner
          </button>
        </div>

        {tab === 'search' && (
          <>
            <form onSubmit={handleSearch} className={styles.searchBar}>
              <input
                value={query}
                onChange={e => { setQuery(e.target.value); setDetectedCode(null); setLocalFallback(false) }}
                placeholder="Nom du jeu ou URL BGG…"
                autoFocus
              />
              <button type="submit" className="btn btn-primary" disabled={loading || !query.trim()}>
                Rechercher
              </button>
            </form>
            {detectedCode && <p className={styles.hint}>Code scanné : {detectedCode}</p>}
            {localFallback && (
              <p className={styles.fallbackNotice}>
                ⚠ Recherche BGG indisponible — résultats limités à votre bibliothèque.
                Collez une URL BGG pour ajouter un nouveau jeu (ex : boardgamegeek.com/boardgame/162886/…)
              </p>
            )}
          </>
        )}

        {tab === 'scan' && (
          <div className={styles.scanArea}>
            {httpFallback ? (
              <>
                <p className={styles.scanHint}>
                  L'accès direct à la caméra nécessite HTTPS.
                  Prenez une photo du code-barres avec l'appareil photo :
                </p>
                <label className={`btn btn-primary ${styles.photoLabel}`}>
                  Prendre une photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={handlePhotoCapture}
                    disabled={loading}
                  />
                </label>
                {loading && <p className={styles.hint}>Lecture du code-barres…</p>}
                <p className={styles.scanDivider}>ou saisir le code manuellement</p>
                <form onSubmit={handleBarcodeManual} className={styles.searchBar}>
                  <input name="barcode" placeholder="Code-barres (EAN-13)…" type="text" inputMode="numeric" />
                  <button type="submit" className="btn btn-primary" disabled={loading}>OK</button>
                </form>
              </>
            ) : scanning ? (
              <>
                <div className={styles.videoWrap}>
                  <video ref={videoRef} className={styles.video} autoPlay muted playsInline />
                  <div className={styles.scanLine} />
                </div>
                <p className={styles.scanHint}>
                  Pointez la caméra vers le code-barres
                  {scanAttempts > 0 && <span className={styles.scanCount}> · {scanAttempts} images</span>}
                </p>

                <div className={styles.debugBlock}>
                  <p className={styles.debugLabel}>
                    [DEBUG] {debugInfo} — {videoRef.current?.videoWidth ?? '?'}×{videoRef.current?.videoHeight ?? '?'}
                  </p>
                  <canvas ref={debugCanvasRef} className={styles.debugCanvas} />
                </div>

                <div className={styles.diagPanel}>
                  <button className={styles.diagBtn} onClick={runDiag}>
                    Diagnostiquer BarcodeDetector
                  </button>
                  {diagLines.length > 0 && (
                    <pre className={styles.diagOutput}>{diagLines.join('\n')}</pre>
                  )}
                </div>

                <button className="btn btn-ghost" onClick={doStop}>Arrêter</button>
              </>
            ) : (
              <>
                <button className="btn btn-primary" onClick={startScan}>
                  Démarrer la caméra
                </button>
                <p className={styles.scanDivider}>ou saisir le code manuellement</p>
                <form onSubmit={handleBarcodeManual} className={styles.searchBar}>
                  <input name="barcode" placeholder="Code-barres (EAN-13)…" type="text" inputMode="numeric" />
                  <button type="submit" className="btn btn-primary" disabled={loading}>OK</button>
                </form>
              </>
            )}
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}
        {loading && !scanning && tab !== 'scan' && <p className={styles.hint}>Recherche en cours…</p>}

        {results.length > 0 && (
          <ul className={styles.results}>
            {results.map(r => (
              <li key={r.bgg_id} className={styles.result}>
                {r.thumbnail_url && (
                  <img src={r.thumbnail_url} className={styles.resultThumb} alt="" />
                )}
                <div className={styles.resultInfo}>
                  <span className={styles.resultTitle}>{r.title}</span>
                  {r.year_published && <span className={styles.resultYear}> · {r.year_published}</span>}
                  {r.bgg_type === 'boardgameexpansion' && <span className={styles.extTag}>ext.</span>}
                  {r.confidence != null && (
                    <span className={r.confidence >= 80 ? styles.confHigh : styles.confLow}>
                      {r.confidence}%
                    </span>
                  )}
                </div>
                <button className="btn btn-primary" onClick={() => handleAdd(r)} disabled={loading}>
                  Ajouter
                </button>
              </li>
            ))}
          </ul>
        )}

        {!loading && results.length === 0 && query && tab === 'search' && (
          <p className={styles.hint}>Aucun résultat trouvé pour « {query} ».</p>
        )}
      </div>
    </div>
  )
}
