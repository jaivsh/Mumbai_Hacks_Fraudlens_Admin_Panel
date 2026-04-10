import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { Mic, MicOff, MessageSquare, X, ExternalLink, Zap, Settings2, ArrowUp } from 'lucide-react';
import { auth, db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import './ChatWidget.css';

function nowTs() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function truncate(s, n) {
  const str = String(s || '');
  if (str.length <= n) return str;
  return str.slice(0, n) + '…';
}

/** Prior turns for /api/assistant/chat (current question sent separately). */
function buildAssistantHistory(msgs) {
  const out = [];
  for (const m of msgs) {
    if (m?.live) continue;
    if (m?.role !== 'user' && m?.role !== 'assistant') continue;
    let content = String(m?.content || '').trim();
    if (!content) continue;
    if (content.startsWith('Failed to answer:')) continue;
    if (content.length > 6000) content = content.slice(0, 6000);
    out.push({ role: m.role, content });
  }
  return out.slice(-16);
}

function detectSpeechRecognition() {
  const w = typeof window !== 'undefined' ? window : null;
  return w?.SpeechRecognition || w?.webkitSpeechRecognition || null;
}

async function getFirebaseIdToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return await user.getIdToken();
}

function serverContentOf(data) {
  if (!data || typeof data !== 'object') return null;
  return data.serverContent || data.server_content || null;
}

/** Vertex may nest fields; WebSocket may use snake_case. */
function detectVertexHandshakeDone(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.flReady || data.flError) return false;
  const walk = (o, depth) => {
    if (depth > 8 || !o || typeof o !== 'object') return false;
    if ('setupComplete' in o || 'setup_complete' in o) return true;
    return Object.values(o).some((v) => walk(v, depth + 1));
  };
  if (walk(data, 0)) return true;
  const sc = serverContentOf(data);
  const mt = sc?.modelTurn || sc?.model_turn;
  if (mt && (mt.parts || mt.Parts)) return true;
  return false;
}

async function websocketMessageToString(data) {
  if (typeof data === 'string') return data;
  if (data instanceof Blob) return await data.text();
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  return null;
}

function parseVertexLivePayload(data) {
  if (!data || typeof data !== 'object') return { kind: 'skip' };
  if (data.setupComplete != null || data.setup_complete != null) return { kind: 'setupComplete' };
  const sc = serverContentOf(data);
  if (!sc) return { kind: 'skip' };
  if (sc.turnComplete || sc.turn_complete) return { kind: 'turnComplete' };
  if (sc.interrupted) return { kind: 'interrupted' };
  const ot = sc.outputTranscription || sc.output_transcription;
  if (ot && typeof ot.text === 'string' && ot.text.length) return { kind: 'text', text: ot.text };
  const modelTurn = sc.modelTurn || sc.model_turn;
  const parts = modelTurn?.parts;
  if (Array.isArray(parts)) {
    const texts = parts.filter((p) => p?.text).map((p) => p.text);
    if (texts.length) return { kind: 'text', text: texts.join('') };
  }
  return { kind: 'skip' };
}

function base64ToUint8(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

function looksLikeCompressedOrUnsupportedAudio(mime) {
  const m = String(mime || '').toLowerCase();
  return (
    m.includes('mpeg') ||
    m.includes('mp3') ||
    m.includes('ogg') ||
    m.includes('opus') ||
    m.includes('webm') ||
    m.includes('flac') ||
    m.includes('aac') ||
    m.includes('m4a') ||
    (m.includes('wav') && !m.includes('pcm'))
  );
}

/** PCM chunks: modelTurn parts, optional audioChunks, relaxed MIME/heuristic for Vertex native audio. */
function extractLivePcmChunks(data) {
  const sc = serverContentOf(data);
  if (!sc) return [];
  const out = [];
  const ac = sc.audioChunks || sc.audio_chunks;
  if (Array.isArray(ac)) {
    for (const chunk of ac) {
      const d = chunk?.data;
      const mime = String(chunk?.mimeType || chunk?.mime_type || '');
      if (d && typeof d === 'string' && !looksLikeCompressedOrUnsupportedAudio(mime)) {
        out.push({ b64: d, mime });
      }
    }
  }
  const modelTurn = sc.modelTurn || sc.model_turn;
  const parts = modelTurn?.parts;
  if (!Array.isArray(parts)) return out;
  for (const p of parts) {
    const inline = p?.inlineData || p?.inline_data;
    if (!inline?.data || typeof inline.data !== 'string') continue;
    const mime = String(inline.mimeType || inline.mime_type || '');
    const low = mime.toLowerCase();
    if (looksLikeCompressedOrUnsupportedAudio(mime)) continue;
    if (
      low.includes('pcm') ||
      low.includes('l16') ||
      low.includes('linear16') ||
      low.includes('linear pcm') ||
      low.startsWith('audio/pcm') ||
      low.includes('/raw') ||
      low.includes('raw-audio') ||
      (low.startsWith('audio/') && low.includes('rate='))
    ) {
      out.push({ b64: inline.data, mime });
      continue;
    }
    if (!mime || low === 'audio/generic') {
      try {
        const raw = base64ToUint8(inline.data);
        if (raw.byteLength >= 320 && raw.byteLength % 2 === 0) {
          out.push({ b64: inline.data, mime: 'audio/pcm;rate=24000' });
        }
      } catch (_) {
        // ignore
      }
    }
  }
  return out;
}

function parsePcmRateFromMime(mime) {
  const m = /rate=(\d+)/i.exec(String(mime || ''));
  return m ? parseInt(m[1], 10) : 0;
}

function pcm16leToFloat32(u8) {
  const len = Math.floor(u8.byteLength / 2);
  const v = new DataView(u8.buffer, u8.byteOffset, len * 2);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = Math.max(-1, Math.min(1, v.getInt16(i * 2, true) / 32768));
  }
  return out;
}

function resampleLinear(input, fromRate, toRate) {
  if (fromRate === toRate || !fromRate || !toRate) return input;
  const ratio = toRate / fromRate;
  const outLen = Math.max(1, Math.round(input.length * ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const x = i / ratio;
    const j = Math.floor(x);
    const f = x - j;
    const a = input[j] ?? 0;
    const b = input[j + 1] ?? a;
    out[i] = a + f * (b - a);
  }
  return out;
}

function vertexLiveModelIsNativeAudio(modelId) {
  return String(modelId || '').includes('native-audio');
}

/** Vertex Live Bidi setup: native-audio models use camelCase (SDK/Vertex JSON). Legacy text Live keeps snake_case. */
async function buildLiveSetup(config, mode, incidentId, fetchIncidentContext, preloadedContext) {
  const model = `projects/${config.projectId}/locations/${config.location}/publishers/google/models/${config.model}`;
  let sys =
    'You are FraudLens, a fraud operations and compliance assistant for banks and fintechs (India-first). Be concise and accurate. Ground answers in provided incident/report context when present.';
  if (mode === 'incident' && incidentId) {
    const { incident, reports } =
      preloadedContext != null ? preloadedContext : await fetchIncidentContext(incidentId);
    const blob = JSON.stringify({ incident, reports });
    sys += `\n\nContext (JSON):\n${blob.slice(0, 24000)}`;
  } else {
    sys += '\n\nUser is in global mode; no specific incident is selected. Answer generally and suggest selecting an incident for precise facts.';
  }
  const nativeAudio = vertexLiveModelIsNativeAudio(config.model);
  if (nativeAudio) {
    return {
      setup: {
        model,
        generationConfig: {
          responseModalities: ['AUDIO'],
          temperature: 0.7,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Kore'
              }
            },
            languageCode: 'en-IN'
          }
        },
        systemInstruction: { parts: [{ text: sys }] },
        outputAudioTranscription: {}
      }
    };
  }
  return {
    setup: {
      model,
      generation_config: {
        response_modalities: ['TEXT'],
        temperature: 0.7
      },
      system_instruction: { parts: [{ text: sys }] }
    }
  };
}

export default function ChatWidget({
  incident,
  incidentCandidates = [],
  defaultOpen = false
}) {
  const { isDemo } = useAuth();
  const DEFAULT_ASSISTANT_API_BASE = 'https://fraudlens-assistant-api-875422601666.asia-south1.run.app';
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [mode, setMode] = useState('incident'); // incident | global
  const [assistantAudience, setAssistantAudience] = useState('analyst'); // analyst | exec → API tone
  const [incidentId, setIncidentId] = useState(incident?.id || '');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [speechOn, setSpeechOn] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      ts: nowTs(),
      content: 'Ask me about an incident, or switch to Global for general questions.'
    }
  ]);

  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);
  const wantLiveMicRef = useRef(false);
  const liveMicBootstrappedRef = useRef(false);
  const startSpeechRef = useRef(() => {});
  const sendLiveRef = useRef(() => {});
  const liveAutoSendTimerRef = useRef(null);
  const pendingVoiceSendRef = useRef('');

  useEffect(() => {
    if (incident?.id) setIncidentId(incident.id);
  }, [incident?.id]);

  useEffect(() => {
    if (!open) setSettingsOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      try {
        scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      } catch (_) {
        // ignore
      }
    }, 80);
    return () => clearTimeout(t);
  }, [open, messages.length]);

  const assistantBase = useMemo(() => {
    const base = process.env.REACT_APP_ASSISTANT_API?.trim();
    const v = base || DEFAULT_ASSISTANT_API_BASE;
    return v ? v.replace(/\/$/, '') : '';
  }, []);

  const allowDemo = useMemo(() => {
    return String(process.env.REACT_APP_ASSISTANT_ALLOW_DEMO || '')
      .trim()
      .toLowerCase() === 'true';
  }, []);

  /** standard = REST /chat; live = Vertex Gemini bidirectional WebSocket */
  const [channel, setChannel] = useState('standard');
  const [liveStatus, setLiveStatus] = useState('off');
  const liveWsRef = useRef(null);
  const liveStreamIdxRef = useRef(null);
  const liveHandshakeDoneRef = useRef(false);
  const liveAudioCtxRef = useRef(null);
  const liveNextPlayTimeRef = useRef(0);

  const closeLiveAudio = useCallback(() => {
    try {
      liveAudioCtxRef.current?.close();
    } catch (_) {
      // ignore
    }
    liveAudioCtxRef.current = null;
    liveNextPlayTimeRef.current = 0;
  }, []);

  const resetLiveAudioPlayhead = useCallback(() => {
    const ctx = liveAudioCtxRef.current;
    if (ctx) liveNextPlayTimeRef.current = ctx.currentTime;
  }, []);

  const scheduleLivePcmChunk = useCallback((b64, mime) => {
    let u8;
    try {
      u8 = base64ToUint8(b64);
    } catch (_) {
      return;
    }
    if (u8.length < 2) return;
    const inRate = parsePcmRateFromMime(mime) || 24000;
    const samples = pcm16leToFloat32(u8);
    const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!Ctx) return;
    if (!liveAudioCtxRef.current) {
      liveAudioCtxRef.current = new Ctx();
      liveNextPlayTimeRef.current = liveAudioCtxRef.current.currentTime;
    }
    const ctx = liveAudioCtxRef.current;
    ctx.resume().catch(() => {});
    const outSamples = resampleLinear(samples, inRate, ctx.sampleRate);
    const buf = ctx.createBuffer(1, outSamples.length, ctx.sampleRate);
    buf.getChannelData(0).set(outSamples);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime, liveNextPlayTimeRef.current);
    src.start(startAt);
    liveNextPlayTimeRef.current = startAt + outSamples.length / ctx.sampleRate;
  }, []);

  useEffect(() => {
    return () => {
      try {
        liveWsRef.current?.close();
      } catch (_) {
        // ignore
      }
      liveWsRef.current = null;
      liveStreamIdxRef.current = null;
      closeLiveAudio();
    };
  }, [closeLiveAudio]);

  useEffect(() => {
    if (!open) {
      try {
        liveWsRef.current?.close();
      } catch (_) {
        // ignore
      }
      liveWsRef.current = null;
      liveStreamIdxRef.current = null;
      closeLiveAudio();
      setLiveStatus('off');
    }
  }, [open, closeLiveAudio]);

  useEffect(() => {
    if (channel !== 'live') {
      wantLiveMicRef.current = false;
      pendingVoiceSendRef.current = '';
      window.clearTimeout(liveAutoSendTimerRef.current);
      liveAutoSendTimerRef.current = null;
      try {
        recognitionRef.current?.stop?.();
      } catch (_) {
        // ignore
      }
      setSpeechOn(false);
      try {
        liveWsRef.current?.close();
      } catch (_) {
        // ignore
      }
      liveWsRef.current = null;
      liveStreamIdxRef.current = null;
      closeLiveAudio();
      setLiveStatus('off');
    }
  }, [channel, closeLiveAudio]);

  const incidentOptions = useMemo(() => {
    const ids = new Map();
    for (const t of incidentCandidates || []) {
      const id = t?.id;
      if (!id) continue;
      if (!ids.has(id)) ids.set(id, t);
    }
    const list = Array.from(ids.values());
    // prefer most recent first if timestamp exists
    list.sort((a, b) => {
      const ta = a?.timestamp?.toMillis?.() || a?.timestamp?.seconds || 0;
      const tb = b?.timestamp?.toMillis?.() || b?.timestamp?.seconds || 0;
      return tb - ta;
    });
    return list.slice(0, 50);
  }, [incidentCandidates]);

  const startSpeech = useCallback((opts = {}) => {
    const liveSession = Boolean(opts.liveSession);
    const SR = detectSpeechRecognition();
    if (!SR) {
      setError('Voice input not supported in this browser.');
      return;
    }
    try {
      const rec = new SR();
      recognitionRef.current = rec;
      wantLiveMicRef.current = liveSession;
      rec.lang = 'en-IN';
      rec.interimResults = true;
      rec.continuous = liveSession;
      rec.onresult = (evt) => {
        const chunks = [];
        for (let i = evt.resultIndex; i < evt.results.length; i++) {
          chunks.push(evt.results[i][0]?.transcript || '');
        }
        const text = chunks.join(' ').trim();
        if (text) setDraft((prev) => (prev ? prev + ' ' + text : text));

        if (liveSession) {
          let sawFinal = false;
          for (let i = evt.resultIndex; i < evt.results.length; i++) {
            if (!evt.results[i].isFinal) continue;
            const seg = (evt.results[i][0]?.transcript || '').trim();
            if (!seg) continue;
            pendingVoiceSendRef.current = pendingVoiceSendRef.current
              ? `${pendingVoiceSendRef.current} ${seg}`.trim()
              : seg;
            sawFinal = true;
          }
          if (sawFinal) {
            window.clearTimeout(liveAutoSendTimerRef.current);
            liveAutoSendTimerRef.current = window.setTimeout(() => {
              const q = pendingVoiceSendRef.current?.trim() || '';
              pendingVoiceSendRef.current = '';
              if (q) sendLiveRef.current?.(q);
            }, 480);
          }
        }
      };
      rec.onerror = () => {
        wantLiveMicRef.current = false;
        setSpeechOn(false);
      };
      rec.onend = () => {
        if (
          wantLiveMicRef.current &&
          liveWsRef.current &&
          liveWsRef.current.readyState === WebSocket.OPEN
        ) {
          window.setTimeout(() => {
            try {
              if (
                wantLiveMicRef.current &&
                recognitionRef.current === rec &&
                liveWsRef.current?.readyState === WebSocket.OPEN
              ) {
                rec.start();
              } else {
                setSpeechOn(false);
              }
            } catch (_) {
              wantLiveMicRef.current = false;
              setSpeechOn(false);
            }
          }, 120);
        } else {
          wantLiveMicRef.current = false;
          setSpeechOn(false);
        }
      };
      setSpeechOn(true);
      rec.start();
    } catch (e) {
      console.error(e);
      wantLiveMicRef.current = false;
      setError('Failed to start voice input.');
      setSpeechOn(false);
    }
  }, []);

  startSpeechRef.current = startSpeech;

  const stopSpeech = useCallback(() => {
    wantLiveMicRef.current = false;
    pendingVoiceSendRef.current = '';
    window.clearTimeout(liveAutoSendTimerRef.current);
    liveAutoSendTimerRef.current = null;
    try {
      recognitionRef.current?.stop?.();
    } catch (_) {
      // ignore
    } finally {
      setSpeechOn(false);
    }
  }, []);

  useEffect(() => {
    if (liveStatus === 'off') liveMicBootstrappedRef.current = false;
  }, [liveStatus]);

  useEffect(() => {
    if (channel !== 'live' || liveStatus !== 'ready') return;
    if (liveMicBootstrappedRef.current) return;
    liveMicBootstrappedRef.current = true;
    const t = window.setTimeout(() => {
      startSpeechRef.current({ liveSession: true });
    }, 400);
    return () => {
      window.clearTimeout(t);
      liveMicBootstrappedRef.current = false;
    };
  }, [channel, liveStatus]);

  const fetchIncidentContext = async (id) => {
    if (!id) return { incident: null, reports: [] };
    const incidentSnap = await getDoc(doc(db, 'transactions', id));
    const incidentData = incidentSnap.exists() ? { id: incidentSnap.id, ...incidentSnap.data() } : null;

    // Avoid requiring a composite Firestore index by NOT combining where+orderBy here.
    // We'll fetch a small slice and sort client-side.
    const reportsSnap = await getDocs(
      query(
        collection(db, 'scribe_reports'),
        where('incidentId', '==', id),
        limit(10)
      )
    );

    const reports = reportsSnap.docs.map((d) => {
      const x = d.data() || {};
      return {
        reportId: d.id,
        reportType: x.reportType || '—',
        incidentId: x.incidentId || id,
        status: x.status || 'draft',
        generatedAt: x.generatedAt?.toDate?.()?.toISOString?.() || null,
        gcsObjectPath: x.gcsObjectPath || null,
        gcsSha256: x.gcsSha256 || null,
        gcsPath: x.gcsPath || null,
        content: x.content || ''
      };
    });
    reports.sort((a, b) => (b.generatedAt || '').localeCompare(a.generatedAt || ''));

    // Keep context bounded (avoid sending huge payloads)
    const topReports = reports.slice(0, 3).map((r) => ({
      ...r,
      content: truncate(r.content, 30000)
    }));

    return { incident: incidentData, reports: topReports };
  };

  const disconnectLive = () => {
    wantLiveMicRef.current = false;
    pendingVoiceSendRef.current = '';
    window.clearTimeout(liveAutoSendTimerRef.current);
    liveAutoSendTimerRef.current = null;
    try {
      recognitionRef.current?.stop?.();
    } catch (_) {
      // ignore
    }
    setSpeechOn(false);
    liveMicBootstrappedRef.current = false;
    try {
      liveWsRef.current?.close();
    } catch (_) {
      // ignore
    }
    liveWsRef.current = null;
    liveStreamIdxRef.current = null;
    liveHandshakeDoneRef.current = false;
    closeLiveAudio();
    setLiveStatus('off');
  };

  const connectLive = async () => {
    setError('');
    if (!assistantBase) {
      setError('Assistant API not configured. Set REACT_APP_ASSISTANT_API and redeploy.');
      return;
    }
    if (isDemo && !allowDemo) {
      setError(
        'Live needs a Firebase sign-in: demo mode has no ID token for the assistant API. Sign in with a real admin account, or for local lab only set REACT_APP_ASSISTANT_ALLOW_DEMO=true and run assistant_api with REQUIRE_AUTH=false.'
      );
      return;
    }
    disconnectLive();
    setLiveStatus('connecting');

    let requireAuth = true;
    try {
      const h = await fetch(`${assistantBase}/api/assistant/health`);
      const j = await h.json();
      requireAuth = j.requireAuth !== false;
    } catch (_) {
      requireAuth = true;
    }

    let preloadedContext = null;
    if (mode === 'incident' && incidentId.trim()) {
      try {
        preloadedContext = await fetchIncidentContext(incidentId.trim());
      } catch (e) {
        setError(e.message || 'Failed to load incident context for Live.');
        setLiveStatus('off');
        return;
      }
    }

    let idToken = null;
    if (requireAuth) {
      try {
        idToken = await getFirebaseIdToken();
        if (!idToken) {
          setError('Sign in required for Live mode.');
          setLiveStatus('off');
          return;
        }
      } catch (e) {
        setError(e.message || 'Live auth failed');
        setLiveStatus('off');
        return;
      }
    }

    const wsUrl = `${assistantBase.replace(/^http/, 'ws').replace(/^https/, 'wss')}/api/assistant/live`;
    const ws = new WebSocket(wsUrl);
    liveWsRef.current = ws;

    ws.onopen = () => {
      try {
        if (idToken) ws.send(JSON.stringify({ flAuth: idToken }));
      } catch (e) {
        setError(e.message || 'Live auth send failed');
        ws.close();
        setLiveStatus('off');
      }
    };

    ws.onmessage = async (ev) => {
      let raw;
      try {
        raw = await websocketMessageToString(ev.data);
      } catch {
        return;
      }
      if (raw == null) return;
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }
      if (data.flError) {
        setError(String(data.flError));
        setLiveStatus('off');
        return;
      }
      if (data.flReady && data.config) {
        (async () => {
          try {
            const setup = await buildLiveSetup(
              data.config,
              mode,
              incidentId.trim(),
              fetchIncidentContext,
              preloadedContext
            );
            if (liveWsRef.current && liveWsRef.current.readyState === WebSocket.OPEN) {
              liveWsRef.current.send(JSON.stringify(setup));
            }
          } catch (e) {
            setError(e.message || 'Live setup failed');
            setLiveStatus('off');
            ws.close();
          }
        })();
        return;
      }

      const parsed = parseVertexLivePayload(data);
      const handshakeDone = parsed.kind === 'setupComplete' || detectVertexHandshakeDone(data);
      if (handshakeDone) {
        if (!liveHandshakeDoneRef.current) {
          liveHandshakeDoneRef.current = true;
          setLiveStatus('ready');
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              ts: nowTs(),
              content:
                'Live ready — the assistant speaks with a clear voice. When you pause after speaking, your words are sent automatically; you can still type and press Enter or the arrow to send manually.'
            }
          ]);
        }
      }
      for (const ch of extractLivePcmChunks(data)) {
        try {
          scheduleLivePcmChunk(ch.b64, ch.mime);
        } catch (e) {
          console.warn('Live PCM', e);
        }
      }
      if (parsed.kind === 'text' && parsed.text) {
        setMessages((prev) => {
          const i = liveStreamIdxRef.current;
          if (i == null || i < 0 || i >= prev.length) {
            const next = [...prev, { role: 'assistant', ts: nowTs(), content: parsed.text, live: true }];
            liveStreamIdxRef.current = next.length - 1;
            return next;
          }
          const copy = [...prev];
          const cur = copy[i] || {};
          copy[i] = {
            ...cur,
            content: String(cur.content || '') + parsed.text,
            live: true
          };
          return copy;
        });
      }
      if (parsed.kind === 'turnComplete' || parsed.kind === 'interrupted') {
        resetLiveAudioPlayhead();
        liveStreamIdxRef.current = null;
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy.length - 1;
          if (last >= 0 && copy[last]?.live) {
            copy[last] = { ...copy[last], live: false };
          }
          return copy;
        });
      }
    };

    ws.onerror = () => {
      setError('Live WebSocket error (network or server rejected the connection).');
      setLiveStatus('off');
    };

    ws.onclose = (ev) => {
      if (liveWsRef.current === ws) liveWsRef.current = null;
      liveStreamIdxRef.current = null;
      setLiveStatus('off');
      if (!liveHandshakeDoneRef.current && ev.code !== 1000) {
        const hint =
          ev.reason ||
          (ev.code === 1005 || ev.code === 1006
            ? 'abnormal closure — on Cloud Run deploy with --no-cpu-throttling; idle CPU throttling drops long-lived WebSockets'
            : '');
        setError(
          (prev) =>
            prev ||
            `Live disconnected before ready (code ${ev.code}${hint ? ` — ${hint}` : ''}). If this persists, confirm Cloud Run has CPU always allocated for WebSockets.`
        );
      }
    };
  };

  const connectLiveRef = useRef(connectLive);
  connectLiveRef.current = connectLive;

  useEffect(() => {
    if (!open || channel !== 'live' || !assistantBase) return;
    connectLiveRef.current();
  }, [open, channel, assistantBase]);

  const sendLive = useCallback(
    (textOverride) => {
      setError('');
      const fromArg =
        textOverride !== undefined &&
        textOverride !== null &&
        String(textOverride).trim() !== '';
      const q = fromArg ? String(textOverride).trim() : draft.trim();
      if (!q) return;
      const ws = liveWsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || liveStatus !== 'ready') {
        setError('Wait until Live shows ready, then try again.');
        return;
      }
      if (isDemo && !allowDemo) {
        setError('Demo session cannot use Live — sign in with Firebase or enable lab demo flags (see Live connect message).');
        return;
      }
      pendingVoiceSendRef.current = '';
      setDraft('');
      setMessages((prev) => [...prev, { role: 'user', ts: nowTs(), content: q }]);
      liveStreamIdxRef.current = null;
      ws.send(
        JSON.stringify({
          clientContent: {
            turns: [{ role: 'user', parts: [{ text: q }] }],
            turnComplete: true
          }
        })
      );
    },
    [draft, liveStatus, isDemo, allowDemo]
  );

  sendLiveRef.current = sendLive;

  const send = async () => {
    setError('');
    const q = draft.trim();
    if (!q) return;
    if (channel === 'live') {
      sendLive();
      return;
    }
    if (!assistantBase) {
      setError('Assistant API not configured. Set REACT_APP_ASSISTANT_API and redeploy.');
      return;
    }
    if (isDemo && !allowDemo) {
      setError(
        'Assistant is disabled in demo mode. To test locally, set REACT_APP_ASSISTANT_ALLOW_DEMO=true and run assistant_api with REQUIRE_AUTH=false.'
      );
      return;
    }

    const historyPayload = buildAssistantHistory(messages);

    setDraft('');
    setSending(true);
    setMessages((prev) => [...prev, { role: 'user', ts: nowTs(), content: q }]);

    try {
      const token = await getFirebaseIdToken();
      const scopedIncidentId = mode === 'incident' ? incidentId.trim() : '';
      const providedContext = scopedIncidentId ? await fetchIncidentContext(scopedIncidentId) : null;

      const resp = await fetch(`${assistantBase}/api/assistant/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          question: q,
          mode,
          incidentId: scopedIncidentId || null,
          providedContext,
          history: historyPayload,
          audience: assistantAudience
        })
      });

      const text = await resp.text();
      if (!resp.ok) throw new Error(text || 'Assistant API error');
      const data = JSON.parse(text);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          ts: nowTs(),
          content: data.answer || '(No answer)',
          citations: Array.isArray(data.citations) ? data.citations : []
        }
      ]);
    } catch (e) {
      console.error(e);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          ts: nowTs(),
          content: `Failed to answer: ${e.message || 'unknown error'}`
        }
      ]);
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const openCitation = (c) => {
    const url = c?.fileUrl || c?.url;
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fl-chatFab" ref={panelRef}>
      {open && (
        <div className="fl-chatPanel" role="dialog" aria-label="FraudLens assistant">
          <div className="fl-chatHeader">
            <div className="fl-chatTitle">
              <strong>Assistant</strong>
              <span>
                {channel === 'live' ? (
                  <>
                    <Zap size={11} style={{ marginRight: 4, verticalAlign: '-1px', display: 'inline' }} />
                    Live
                    {liveStatus === 'ready'
                      ? ' · ready'
                      : liveStatus === 'connecting'
                        ? ' · connecting'
                        : ' · offline'}
                  </>
                ) : (
                  <>Standard · {mode === 'incident' ? 'incident' : 'global'}</>
                )}
              </span>
            </div>
            <div className="fl-chatHeaderButtons">
              <button
                type="button"
                className={`fl-chatIconBtn ${settingsOpen ? 'active' : ''}`}
                onClick={() => setSettingsOpen((v) => !v)}
                title={settingsOpen ? 'Close settings' : 'Settings'}
                aria-expanded={settingsOpen}
              >
                <Settings2 size={16} />
              </button>
              <button type="button" className="fl-chatIconBtn" onClick={() => setOpen(false)} title="Close">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="fl-chatChannelRow">
            <button
              type="button"
              className={`fl-chatChannelBtn ${channel === 'standard' ? 'active' : ''}`}
              onClick={() => setChannel('standard')}
            >
              Chat
            </button>
            <button
              type="button"
              className={`fl-chatChannelBtn ${channel === 'live' ? 'active' : ''}`}
              onClick={() => setChannel('live')}
              title="Voice Live (Vertex)"
            >
              <Zap size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              Live
            </button>
          </div>

          {settingsOpen && (
            <div className="fl-chatSettings">
              <div className="fl-chatSettingsBlock">
                <div className="fl-chatSettingsLabel">Context</div>
                <div className="fl-chatSettingsPills">
                  <button
                    type="button"
                    className={`fl-chatSettingsPill ${mode === 'incident' ? 'on' : ''}`}
                    onClick={() => setMode('incident')}
                  >
                    Incident
                  </button>
                  <button
                    type="button"
                    className={`fl-chatSettingsPill ${mode === 'global' ? 'on' : ''}`}
                    onClick={() => setMode('global')}
                  >
                    Global
                  </button>
                </div>
              </div>
              {channel === 'standard' && (
                <div className="fl-chatSettingsBlock">
                  <div className="fl-chatSettingsLabel">Tone</div>
                  <div className="fl-chatSettingsPills">
                    <button
                      type="button"
                      className={`fl-chatSettingsPill ${assistantAudience === 'analyst' ? 'on' : ''}`}
                      onClick={() => setAssistantAudience('analyst')}
                    >
                      Analyst
                    </button>
                    <button
                      type="button"
                      className={`fl-chatSettingsPill ${assistantAudience === 'exec' ? 'on' : ''}`}
                      onClick={() => setAssistantAudience('exec')}
                    >
                      Exec
                    </button>
                  </div>
                </div>
              )}
              {channel === 'live' && (
                <div className="fl-chatSettingsBlock">
                  <div className="fl-chatSettingsLabel">Live session</div>
                  <div className="fl-chatSettingsRow">
                    <span className="fl-chatSettingsHint">
                      {liveStatus === 'ready' && 'Connected — answers play as audio.'}
                      {liveStatus === 'connecting' && 'Connecting…'}
                      {liveStatus === 'off' && 'Not connected.'}
                    </span>
                  </div>
                  <div className="fl-chatSettingsActions">
                    {(liveStatus === 'off' || liveStatus === 'connecting') && (
                      <button
                        type="button"
                        className="fl-chatSettingsBtn primary"
                        onClick={connectLive}
                        disabled={liveStatus === 'connecting' || !assistantBase}
                      >
                        {liveStatus === 'connecting' ? 'Connecting…' : 'Connect'}
                      </button>
                    )}
                    {liveStatus === 'ready' && (
                      <button type="button" className="fl-chatSettingsBtn" onClick={disconnectLive}>
                        Disconnect
                      </button>
                    )}
                  </div>
                  <p className="fl-chatSettingsFoot">
                    After changing Incident/Global, disconnect and connect again for fresh context. Mic turns on when Live is ready; pausing speech sends your turn automatically.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="fl-chatBody">
            {mode === 'incident' && (
              <div className="fl-chatContext">
                <div className="fl-chatContextRow">
                  <select
                    className="fl-chatSelect"
                    value={incidentId}
                    onChange={(e) => setIncidentId(e.target.value)}
                    title="Select an incident ID"
                  >
                    <option value="">Pick incident…</option>
                    {incidentOptions.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.id} — ₹{Number(t.amount || 0).toLocaleString('en-IN')} ({t.status || '—'})
                      </option>
                    ))}
                  </select>
                  <input
                    className="fl-chatInput"
                    style={{ flex: 1, minWidth: 140 }}
                    value={incidentId}
                    onChange={(e) => setIncidentId(e.target.value)}
                    placeholder="Or paste incidentId"
                  />
                </div>
              </div>
            )}

            <div className="fl-chatMessages" ref={scrollRef}>
              {messages.map((m, idx) => (
                <div key={idx} className={`fl-chatMsg ${m.role === 'user' ? 'user' : 'assistant'}`}>
                  <div className="fl-chatMeta">
                    {m.role === 'user' ? 'You' : 'Assistant'} · {m.ts}
                  </div>
                  <div>{m.content}</div>
                  {Array.isArray(m.citations) && m.citations.length > 0 && (
                    <div className="fl-chatCitations">
                      {m.citations.map((c, j) => (
                        <div key={j} className="fl-chatCitation">
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {c.reportType || c.title || 'Citation'}
                            </div>
                            <small>
                              incident: {c.incidentId || '—'} · sha256: {truncate(c.sha256, 18)} · {truncate(c.objectPath, 44)}
                            </small>
                          </div>
                          <button
                            type="button"
                            className="fl-chatIconBtn"
                            onClick={() => openCitation(c)}
                            title="Open source PDF"
                            style={{ width: 36, height: 36 }}
                          >
                            <ExternalLink size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {error && <div className="fl-chatErrorBanner">{error}</div>}
          </div>

          <div className="fl-chatFooter">
            <button
              type="button"
              className={`fl-chatMicBtn ${speechOn ? 'on' : ''}`}
              disabled={channel === 'live' && liveStatus !== 'ready'}
              title={
                channel === 'live' && liveStatus !== 'ready'
                  ? 'Wait for Live to connect'
                  : speechOn
                    ? 'Stop microphone'
                    : 'Microphone'
              }
              onClick={() =>
                speechOn ? stopSpeech() : startSpeech({ liveSession: channel === 'live' })
              }
            >
              {speechOn ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <textarea
              className="fl-chatInput fl-chatFooterInput"
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                channel === 'live'
                  ? liveStatus === 'ready'
                    ? 'Pause after speaking to send — or type and press Enter…'
                    : 'Waiting for Live…'
                  : mode === 'incident'
                    ? 'Ask about this incident…'
                    : 'Ask across incidents…'
              }
            />
            <button
              type="button"
              className={channel === 'live' ? 'fl-chatSendIconBtn' : 'fl-chatSendBtn'}
              onClick={send}
              disabled={sending || (channel === 'live' && liveStatus !== 'ready')}
              title={channel === 'live' ? 'Send typed message (Enter also works)' : 'Send'}
            >
              {sending ? '…' : channel === 'live' ? <ArrowUp size={18} strokeWidth={2.5} /> : 'Send'}
            </button>
          </div>
          {!assistantBase && (
            <div className="fl-chatHint fl-chatHintCompact">Set REACT_APP_ASSISTANT_API to enable the assistant.</div>
          )}
        </div>
      )}

      {!open && (
        <button type="button" className="fl-chatButton" onClick={() => setOpen(true)}>
          <MessageSquare size={16} /> Ask Assistant
        </button>
      )}
    </div>
  );
}

