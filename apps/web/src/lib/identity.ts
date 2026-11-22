/*
 * O que o navegador lembra: o nome da pessoa (localStorage) e a chave de
 * anfitrião de cada sala criada nesta aba (sessionStorage — some ao fechar).
 * Tudo protegido por try/catch: aba anônima ou armazenamento bloqueado não
 * podem quebrar a página.
 */

const NAME_KEY = 'alexandrus:name';
const HOST_KEY = (code: string) => `alexandrus:host:${code}`;

function safeGet(store: () => Storage, key: string): string | null {
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
}

function safeSet(store: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) store().removeItem(key);
    else store().setItem(key, value);
  } catch {
    /* sem armazenamento: segue sem lembrar */
  }
}

export function getSavedName(): string {
  return safeGet(() => localStorage, NAME_KEY) ?? '';
}

export function saveName(name: string) {
  const clean = name.trim().slice(0, 32);
  if (clean) safeSet(() => localStorage, NAME_KEY, clean);
}

/** Memória de anfitrião só nesta aba, com cópia em memória caso o storage falhe. */
const memoryHostKeys = new Map<string, string>();

export function rememberHostKey(code: string, hostKey: string) {
  memoryHostKeys.set(code, hostKey);
  safeSet(() => sessionStorage, HOST_KEY(code), hostKey);
}

export function getHostKey(code: string): string | null {
  return memoryHostKeys.get(code) ?? safeGet(() => sessionStorage, HOST_KEY(code));
}

export function forgetHostKey(code: string) {
  memoryHostKeys.delete(code);
  safeSet(() => sessionStorage, HOST_KEY(code), null);
}
