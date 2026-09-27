import 'dotenv/config';

import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { URL } from 'url';
import db from './db/connection';
import { runMigrations } from './db/schema';
import { runSeed } from './db/seed';
import { GeminiNarrator } from './narration/geminiNarrator';
import { LocalNarrator } from './narration/localNarrator';
import { dispatch } from './engine/actions';
import { initDefaultPlayerState, loadPlayerState, savePlayerState } from './engine/state';
import { getAccessibleExits, getLocation, getNPCsAtLocation } from './engine/movement';
import type { NarrationProvider, PlayerState } from './types';

const narrationMode = process.env.NARRATION_MODE?.toLowerCase() ?? 'auto';
const apiKey = process.env.GEMINI_API_KEY?.trim() ?? '';
const useGemini = narrationMode === 'gemini' || (narrationMode === 'auto' && apiKey !== '');
const narrator: NarrationProvider = useGemini ? new GeminiNarrator(apiKey) : new LocalNarrator();
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST?.trim() || '127.0.0.1';
const publicRoot = path.resolve(process.cwd(), 'public');

runMigrations(db);
runSeed(db);

const loadedState = loadPlayerState(db);
let currentState: PlayerState;

if (loadedState) {
  currentState = loadedState;
} else {
  currentState = initDefaultPlayerState();
  savePlayerState(db, currentState);
}

async function collectRequestBody(request: http.IncomingMessage): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function jsonResponse(response: http.ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(data));
}

function htmlResponse(response: http.ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8'
  });
  response.end(body);
}

async function serveStaticFile(request: http.IncomingMessage, response: http.ServerResponse): Promise<boolean> {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
  let pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.join(publicRoot, pathname);

  if (!filePath.startsWith(publicRoot)) {
    return false;
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).slice(1);
    const contentType = getContentType(ext);
    response.writeHead(200, { 'Content-Type': `${contentType}; charset=utf-8` });
    response.end(data);
    return true;
  } catch {
    return false;
  }
}

function getContentType(extension: string): string {
  switch (extension) {
    case 'js':
      return 'application/javascript';
    case 'css':
      return 'text/css';
    case 'html':
      return 'text/html';
    case 'json':
      return 'application/json';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function getScenePayload(output: string, shouldExit: boolean): unknown {
  const location = getLocation(db, currentState.location_id);
  const npcs = getNPCsAtLocation(db, currentState.location_id);
  const accessibleExits = location ? getAccessibleExits(location, currentState) : [];

  return {
    output,
    shouldExit,
    location,
    npcs,
    accessibleExits,
    state: currentState
  };
}

function getTutorialMessage(): string {
  return [
    'Welcome to KKC Adventure!',
    'This is your first time here. Try the commands in the quick actions, or type help to see the available commands.',
    'You can also save your progress with save <slot> and load it again with load <slot>.'
  ].join(' ');
}

async function handleApiInit(response: http.ServerResponse): Promise<void> {
  try {
    const result = await dispatch('look', currentState, db, narrator);
    currentState = result.newState;

    if (!currentState.world_state_flags?.tutorial_shown) {
      currentState.world_state_flags = {
        ...currentState.world_state_flags,
        tutorial_shown: true
      };
      savePlayerState(db, currentState);
      result.output = `${getTutorialMessage()}\n\n${result.output}`;
    } else {
      savePlayerState(db, currentState);
    }

    jsonResponse(response, 200, getScenePayload(result.output, result.shouldExit));
  } catch (error) {
    jsonResponse(response, 500, { error: String(error) });
  }
}

async function handleApiCommand(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  try {
    const rawBody = await collectRequestBody(request);
    const body = rawBody ? JSON.parse(rawBody) : {};
    const command = typeof body.command === 'string' ? body.command.trim() : '';

    if (!command) {
      jsonResponse(response, 400, { error: 'Missing command.' });
      return;
    }

    const result = await dispatch(command, currentState, db, narrator);
    currentState = result.newState;
    savePlayerState(db, currentState);

    jsonResponse(response, 200, getScenePayload(result.output, result.shouldExit));
  } catch (error) {
    jsonResponse(response, 500, { error: String(error) });
  }
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    response.writeHead(404);
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === '/api/init' && request.method === 'GET') {
    await handleApiInit(response);
    return;
  }

  if (url.pathname === '/api/command' && request.method === 'POST') {
    await handleApiCommand(request, response);
    return;
  }

  const served = await serveStaticFile(request, response);
  if (!served) {
    response.writeHead(404);
    response.end('Not found');
  }
});

let activePort = port;
const maxPortAttempts = 5;
let attempts = 0;

function startServer(attemptPort: number): void {
  server.listen(attemptPort, host, () => {
    // eslint-disable-next-line no-console
    console.log(`KKC Adventure web server is running at http://${host}:${attemptPort}`);
  });
}

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE' && attempts < maxPortAttempts) {
    attempts += 1;
    activePort += 1;
    // eslint-disable-next-line no-console
    console.warn(`Port ${activePort - 1} is in use, trying ${activePort} instead...`);
    startServer(activePort);
    return;
  }

  // eslint-disable-next-line no-console
  console.error('Failed to start server:', error.message);
  process.exit(1);
});

startServer(activePort);
