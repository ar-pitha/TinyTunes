import React, { useRef, useEffect } from 'react';
import { io } from 'socket.io-client';
import usePlaybackIntegration from '../hooks/usePlaybackIntegration';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

const Player = ({ roomCode, token, isHost }) => {
  const audioRef = useRef(null);
  const socket = useRef(null);

  useEffect(() => {
    socket.current = io(BACKEND_URL);
    return () => {
      try { socket.current.disconnect(); } catch (e) {}
    };
  }, []);

  const integration = usePlaybackIntegration({ roomCode, socket: socket.current, token, isHost, audioRef });

  useEffect(() => {
    if (integration && integration.initializePlayback) {
      integration.initializePlayback();
    }
  }, [integration]);

  return (
    <audio ref={audioRef} preload="metadata" style={{ display: 'none' }} />
  );
};

export default Player;
