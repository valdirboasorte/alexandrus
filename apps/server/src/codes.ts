import { randomBytes, randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../../../packages/protocol/src/index.ts';

export function generateRoomCode(exists: (code: string) => boolean): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
    if (!exists(code)) return code;
  }
  throw new Error('Não foi possível gerar um código de sala único');
}

export function generatePeerId(): string {
  return randomBytes(8).toString('base64url').slice(0, 10);
}

export function generateHostKey(): string {
  return randomBytes(32).toString('base64url');
}
