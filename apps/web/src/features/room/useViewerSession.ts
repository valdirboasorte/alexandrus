import { useCallback, useEffect, useRef, useState } from 'react';
import type { EndReason, ErrorCode, RoomSummary } from '@protocol';
import { api } from '../../lib/api.ts';
import { ViewerReceiver, type ReceiverState } from '../../lib/rtc/ViewerReceiver.ts';
import type { ViewerStats } from '../../lib/rtc/stats.ts';
import { SignalingClient, type SignalingState } from '../../lib/signaling.ts';
import { signalingUrl } from '../../lib/server-url.ts';

export interface ViewerSession {
  connection: SignalingState;
  room: RoomSummary | null;
  stream: MediaStream | null;
  media: ReceiverState;
  ended: EndReason | null;
  fatal: Extract<ErrorCode, 'room-not-found' | 'room-full'> | null;
  readStats: () => Promise<ViewerStats> | null;
  reconnect: () => void;
}

export function useViewerSession(code: string, name: string): ViewerSession {
  const [connection, setConnection] = useState<SignalingState>('connecting');
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [media, setMedia] = useState<ReceiverState>('waiting');
  const [ended, setEnded] = useState<EndReason | null>(null);
  const [fatal, setFatal] = useState<ViewerSession['fatal']>(null);
  const rxRef = useRef<ViewerReceiver | null>(null);

  useEffect(() => {
    const sig = new SignalingClient(signalingUrl(code));
    const rx = new ViewerReceiver(sig, [{ urls: 'stun:stun.l.google.com:19302' }], setStream, setMedia);
    rxRef.current = rx;
    void api
      .ice()
      .then((c) => rx.setIceServers(c.iceServers))
      .catch(() => {});

    sig.onState(setConnection);
    sig.onOpen(() => sig.send({ t: 'join', code, role: 'viewer', name: name || 'Visitante' }));
    sig.on((msg) => {
      switch (msg.t) {
        case 'joined': {
          setRoom(msg.room);
          const host = msg.peers.find((p) => p.role === 'host');
          rx.setHost(host?.id ?? null);
          break;
        }
        case 'room':
          setRoom(msg.room);
          break;
        case 'peer-joined':
          if (msg.peer.role === 'host') rx.setHost(msg.peer.id);
          break;
        case 'signal':
          void rx.handleSignal(msg.from, msg.data);
          break;
        case 'ended':
          setEnded(msg.reason);
          rx.close();
          break;
        case 'error':
          if (msg.code === 'room-not-found' || msg.code === 'room-full') setFatal(msg.code);
          break;
      }
    });

    return () => {
      rx.close();
      sig.close();
    };
  }, [code, name]);

  const readStats = useCallback(() => rxRef.current?.stats() ?? null, []);
  const reconnect = useCallback(() => rxRef.current?.requestOffer(), []);

  return { connection, room, stream, media, ended, fatal, readStats, reconnect };
}
