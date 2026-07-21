import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { MusicService } from '../services/MusicService';
import { API_ROOMS, API_SONGS, SOCKET_URL } from './roomPlaybackConstants';
import {
  makeDeviceSongId,
  resolveSongUrl,
  smoothSyncAudio,
  formatTime,
  buildQueuePayload,
  resolveSongObj,
  queueAdditions,
} from './roomPlaybackUtils';

export {
  useState,
  useEffect,
  useRef,
  io,
  MusicService,
  API_ROOMS,
  API_SONGS,
  SOCKET_URL,
  makeDeviceSongId,
  resolveSongUrl,
  smoothSyncAudio,
  formatTime,
  buildQueuePayload,
  resolveSongObj,
  queueAdditions,
};
